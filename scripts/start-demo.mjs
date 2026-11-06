import { spawn } from 'node:child_process';
import { constants, copyFileSync, existsSync, readFileSync } from 'node:fs';
import { createConnection } from 'node:net';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const home = 'http://127.0.0.1:5182/';
const statusUrl = new URL('api/integration/status', home);
const noBrowser = process.argv.includes('--no-browser');
let service;
let stopping = false;

async function isReady() {
  try {
    const response = await fetch(statusUrl, { signal: AbortSignal.timeout(1200), redirect: 'error' });
    if (!response.ok) return false;
    const value = await response.json();
    return value?.mode === 'live' && typeof value.modelVersion === 'string' && typeof value.perPlatform === 'number';
  } catch { return false; }
}

function portIsOccupied() {
  return new Promise(resolveProbe => {
    const socket = createConnection({ host: '127.0.0.1', port: 5182 });
    const finish = occupied => { socket.destroy(); resolveProbe(occupied); };
    socket.setTimeout(1200);
    socket.once('connect', () => finish(true));
    socket.once('error', error => finish(error.code !== 'ECONNREFUSED'));
    socket.once('timeout', () => finish(true));
  });
}

function openBrowser() {
  if (noBrowser) return;
  const command = process.platform === 'win32' ? 'rundll32.exe' : process.platform === 'darwin' ? 'open' : 'xdg-open';
  const args = process.platform === 'win32' ? ['url.dll,FileProtocolHandler', home] : [home];
  const browser = spawn(command, args, { windowsHide: true, detached: true, stdio: 'ignore' });
  browser.on('error', () => console.log(`无法自动打开浏览器，请手动访问：${home}`));
  browser.unref();
}

async function installDependencies() {
  const manifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
  const packages = [...Object.keys(manifest.dependencies || {}), ...Object.keys(manifest.devDependencies || {})];
  if (packages.every(name => existsSync(resolve(root, 'node_modules', name, 'package.json')))) return;
  console.log('首次启动需要安装项目依赖，请保持网络连接…');
  const action = existsSync(resolve(root, 'package-lock.json')) ? 'ci' : 'install';
  const installer = process.platform === 'win32'
    ? spawn(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', `npm ${action}`], { cwd: root, stdio: 'inherit', windowsHide: true })
    : spawn('npm', [action], { cwd: root, stdio: 'inherit' });
  const code = await new Promise((resolveInstall, reject) => { installer.once('error', reject); installer.once('exit', resolveInstall); });
  if (code !== 0) throw new Error('依赖安装失败，请检查上方提示、网络连接及 npm 是否已安装，然后重新启动。');
}

async function main() {
  if (Number(process.versions.node.split('.')[0]) < 22) throw new Error('请先安装 Node.js 22 或更新版本，再双击启动。');
  if (await isReady()) {
    console.log(`Demo 已经在运行，直接打开：${home}`);
    openBrowser();
    return;
  }
  if (await portIsOccupied()) throw new Error('5182 端口已被其他服务占用，未启动 Demo。请关闭占用该端口的程序后重试；不要改用 5173。');
  await installDependencies();
  const envFile = resolve(root, '.env');
  if (!existsSync(envFile)) {
    copyFileSync(resolve(root, '.env.example'), envFile, constants.COPYFILE_EXCL);
    console.log('已创建 .env；如需模型分析，请填写其中的模型服务配置。');
  }
  console.log(`正在启动融媒评馈 Demo：${home}`);
  console.log('请保持本窗口开启。停止服务时，在本窗口按 Ctrl+C。\n');
  service = spawn(process.execPath, [resolve(root, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', '5182', '--strictPort'], {
    cwd: root, stdio: 'inherit', windowsHide: true,
  });
  let launchError;
  const exited = new Promise(resolveExit => {
    service.once('error', error => { launchError = error; resolveExit(1); });
    service.once('exit', code => resolveExit(code ?? 1));
  });
  const deadline = Date.now() + 45000;
  while (Date.now() < deadline && service.exitCode === null && !launchError && !stopping) {
    if (await isReady()) {
      console.log(`\nDemo 已就绪：${home}`);
      openBrowser();
      const code = await exited;
      if (!stopping && code !== 0) throw new Error('Demo 已停止，请查看上方运行提示。');
      return;
    }
    await delay(300);
  }
  if (stopping) return;
  service.kill();
  await exited;
  throw new Error(launchError ? '无法启动项目服务，请检查 Node.js 和项目依赖。' : 'Demo 未能就绪，请检查上方提示及 .env 配置。');
}

function stop() {
  if (stopping) return;
  stopping = true;
  console.log('\n正在停止 Demo…');
  service?.kill();
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
process.on('exit', () => { if (service && service.exitCode === null) service.kill(); });
main().catch(error => { console.error(`\n启动失败：${error.message}`); process.exitCode = 1; });
