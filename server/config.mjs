import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseEnv } from 'node:util';
import { createHash } from 'node:crypto';
import { PIPELINE_VERSION } from './analysis-version.mjs';

export function readConfig(root) {
  let file = {};
  try { file = parseEnv(readFileSync(resolve(root, '.env'), 'utf8')); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  const env = { ...file, ...process.env };
  const number = (key, fallback, min, max) => {
    const value = env[key] ? Number(env[key]) : fallback;
    if (!Number.isInteger(value) || value < min || value > max) throw new Error(`${key} 必须是 ${min}–${max} 的整数`);
    return value;
  };
  return {
    mode: 'live',
    dataBase: env.DATA_API_BASE_URL || '', dataKey: env.DATA_API_KEY || '',
    authHeader: env.DATA_AUTH_HEADER || 'Authorization', authPrefix: env.DATA_AUTH_PREFIX ?? 'Bearer ',
    dataScope: env.DATA_SCOPE === 'latest' ? 'latest' : 'all',
    pageSize: number('DATA_PAGE_SIZE', 200, 1, 200),
    perPlatform: number('DATA_LIMIT_PER_PLATFORM', 10, 1, 10000),
    loadDetails: env.DATA_LOAD_DETAILS !== 'false',
    detailConcurrency: number('DATA_DETAIL_CONCURRENCY', 4, 1, 8),
    commentsPath: env.DATA_COMMENTS_PATH || '', hotspotsPath: env.DATA_HOTSPOTS_PATH || '',
    modelBase: env.MODEL_BASE_URL || '', model: env.MODEL_NAME || '', modelKey: env.MODEL_API_KEY || '',
    jsonMode: env.MODEL_JSON_MODE === 'true', tokenField: env.MODEL_TOKEN_FIELD === 'max_completion_tokens' ? 'max_completion_tokens' : 'max_tokens',
    enableThinking: env.MODEL_CHAT_TEMPLATE_ENABLE_THINKING === 'false' ? false : env.MODEL_CHAT_TEMPLATE_ENABLE_THINKING === 'true' ? true : undefined,
    maxTokens: number('MODEL_MAX_TOKENS', 6000, 256, 16000),
    timeout: number('REQUEST_TIMEOUT_SECONDS', 90, 5, 180) * 1000,
    autoAnalyze: env.MODEL_AUTO_ANALYZE === 'true',
    // Zero disables the local hourly quota; batching and the shared task lock still apply.
    maxCalls: number('MODEL_MAX_CALLS_PER_HOUR', 0, 0, 120),
  };
}

export function baseUrl(value, label) {
  let url; try { url = new URL(value); } catch { throw new Error(`请在 .env 配置 ${label}`); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error(`${label} 应为不含密钥和查询参数的 HTTP(S) 地址`);
  return url;
}

export function publicConfig(config) {
  return { mode: config.mode, dataConfigured: !!config.dataBase, modelConfigured: !!(config.modelBase && config.model && config.modelKey),
    model: config.model, dataScope: config.dataScope, pageSize: config.pageSize, perPlatform: config.perPlatform, loadDetails: config.loadDetails,
    autoAnalyze: config.autoAnalyze, maxCalls: config.maxCalls,
    commentsConfigured: !!config.commentsPath, hotspotsConfigured: !!config.hotspotsPath,
    modelVersion: createHash('sha256').update(JSON.stringify([PIPELINE_VERSION,config.modelBase, config.model, config.maxTokens, config.enableThinking])).digest('hex').slice(0,16) };
}
