import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { readConfig, publicConfig } from './config.mjs';
import { createDatasetLoader } from './data.mjs';
import { complete, parseModelJson, validateGroups, groupingPrompt } from './model.mjs';
import { analyzeEvent, analysisCallCount } from './event-analysis.mjs';
import { analyzeFeedbackBatch, feedbackFingerprint, feedbackModelKey, overlayFeedback, prepareFeedbackBatch } from './feedback-analysis.mjs';

export function createIntegration(root) {
  const loadDataset = createDatasetLoader();
  let dataset = null; let dataSource = ''; let state = null; let modelBusy = false; let revision = 0; const calls = [];
  let refreshPending = null;
  const stateFile = resolve(root, 'work', 'integration-events.json');
  const feedbackFile = resolve(root, 'work', 'integration-feedback.json');
  let feedbackState;
  async function loadFeedbackState() {
    if (feedbackState) return;
    try { feedbackState = JSON.parse(await readFile(feedbackFile, 'utf8')); } catch { feedbackState = {}; }
  }
  async function saveFeedbackState(next) {
    await mkdir(resolve(root, 'work'), { recursive: true });
    await writeFile(feedbackFile + '.tmp', JSON.stringify(next), 'utf8');
    await rename(feedbackFile + '.tmp', feedbackFile); feedbackState = next;
  }
  async function saveState(next) {
    await mkdir(resolve(root, 'work'), { recursive: true });
    await writeFile(stateFile + '.tmp', JSON.stringify(next), 'utf8'); await rename(stateFile + '.tmp', stateFile); state = next;
  }
  async function refresh(config, signal) {
    const loaded = await loadDataset(config, signal);
    if (!state) { try { state = JSON.parse(await readFile(stateFile, 'utf8')); } catch { state = { source: '', events: [] }; } }
    const source = createHash('sha256').update(config.dataBase).digest('hex');
    loaded.events = state.source === source && Array.isArray(state.events) ? state.events.map(e => ({ ...e, workIds: e.workIds.filter(id => loaded.works.some(w => w.id === id)) })).filter(e => e.workIds.length) : [];
    loaded.meta.namespace = source;
    await loadFeedbackState();
    dataset = overlayFeedback(loaded, feedbackState, config); dataSource = config.dataBase; revision++;
    return dataset;
  }
  async function refreshOnce(config, signal) {
    if (refreshPending) return refreshPending;
    refreshPending = refresh(config, signal);
    try { return await refreshPending; } finally { refreshPending = null; }
  }
  async function modelTask(config, reserved, task) {
    if (modelBusy) throw new Error('已有模型任务运行中，请稍后重试');
    const hourAgo = Date.now() - 3600000; while (calls.length && calls[0] < hourAgo) calls.shift();
    if (config.maxCalls > 0 && calls.length + reserved > config.maxCalls) throw new Error(`本任务需要 ${reserved} 次模型调用，当前小时剩余 ${Math.max(0, config.maxCalls - calls.length)} 次；请稍后重试`);
    modelBusy = true; let used = 0;
    try { return await task(async work => {
      if (used >= reserved) throw new Error('已达到本任务的模型调用预算');
      used++; if (config.maxCalls > 0) calls.push(Date.now()); return work();
    }); } finally { modelBusy = false; }
  }
  const modelCall = (config, work) => modelTask(config, 1, invoke => invoke(work));
  return async function middleware(req, res, next) {
    const url = new URL(req.url || '/', 'http://localhost');
    if (!url.pathname.startsWith('/api/integration/')) return next();
    res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const send = (status, value) => { res.statusCode = status; res.end(JSON.stringify(value)); };
    const controller = new AbortController(); res.on('close', () => { if (!res.writableEnded) controller.abort(); });
    try {
      if (req.headers.origin && new URL(req.headers.origin).host !== req.headers.host) return send(403, { error: '仅接受当前工作台发起的请求' });
      if (req.headers['sec-fetch-site'] === 'cross-site') return send(403, { error: '不接受跨站请求' });
      const config = readConfig(root);
      if (url.pathname === '/api/integration/status' && req.method === 'GET') return send(200, publicConfig(config));
      if (url.pathname === '/api/integration/data' && req.method === 'GET') {
        if (url.searchParams.get('refresh') === '1' || !dataset || dataSource !== config.dataBase) await refreshOnce(config, controller.signal);
        dataset = overlayFeedback(dataset, feedbackState, config);
        return send(200, dataset);
      }
      if (req.method !== 'POST') return send(405, { error: '此接口需要 POST 请求' });
      if (!req.headers['content-type']?.startsWith('application/json')) return send(415, { error: '需要 JSON 请求' });
      let body = ''; for await (const chunk of req) { body += chunk; if (body.length > 4096) return send(413, { error: '请求过大' }); }
      let payload; try { payload = JSON.parse(body || '{}'); } catch { return send(400, { error: 'JSON 格式不正确' }); }
      if (url.pathname === '/api/integration/test-model') {
        await modelCall(config, () => complete(config, '连接测试。仅回复 JSON 对象 {"ok":true}。', '{}', controller.signal, true).then(text => { if (parseModelJson(text)?.ok !== true) throw new Error('模型返回格式不符合连接测试要求'); }));
        return send(200, { ok: true, message: `已收到 ${config.model} 的有效响应（仅连接测试，未分析作品）` });
      }
      if (!dataset || dataSource !== config.dataBase || config.mode !== 'live') throw new Error('请先加载当前真实数据源');
      if (payload.automatic && !config.autoAnalyze) throw new Error('自动模型分析未开启，可先单次测试，或在 .env 设置 MODEL_AUTO_ANALYZE=true');
      const input = dataset; let inputRevision = revision;
      if (url.pathname === '/api/integration/classify-feedback') {
        dataset = overlayFeedback(dataset, feedbackState, config);
        const batch = prepareFeedbackBatch(dataset);
        if (!batch.targets.length) return send(200, dataset);
        const used = calls.filter(at => at > Date.now() - 3600000);
        if ((config.maxCalls > 0 && used.length >= config.maxCalls) || modelBusy) {
          dataset.meta.feedbackAnalysis = { ...dataset.meta.feedbackAnalysis, state: 'waiting', message: modelBusy ? '模型正在执行其他任务，稍后自动继续' : '本小时分析额度已用完，稍后自动继续', retryAt: modelBusy ? undefined : new Date(used[0] + 3600000).toISOString() };
          return send(200, dataset);
        }
        try {
          await modelTask(config, 1, async invoke => {
            const results = await invoke(() => analyzeFeedbackBatch(config, batch, controller.signal));
            const latestConfig = readConfig(root);
            if (latestConfig.dataBase !== config.dataBase || feedbackModelKey(latestConfig) !== feedbackModelKey(config) || dataSource !== config.dataBase || batch.targets.some(t => {
              const current = dataset.feedback.find(f => f.id === t.id);
              return !current || feedbackFingerprint(current, dataset) !== t.fingerprint;
            })) throw new Error('分析期间评论或报道内容已变化，旧结果未保存，请重试');
            const key = feedbackModelKey(config); const source = dataset.meta.namespace;
            const entries = feedbackState?.source === source && feedbackState?.modelKey === key ? { ...feedbackState.entries } : {};
            const generatedAt = new Date().toISOString();
            for (const target of batch.targets) {
              const { id: _alias, ...result } = results.find(r => r.id === target.alias);
              entries[target.id] = { fingerprint: target.fingerprint, result, generatedAt };
            }
            await saveFeedbackState({ source, modelKey: key, entries });
            dataset = overlayFeedback(dataset, feedbackState, config); revision++;
          });
        } catch (e) {
          // Preserve previous batches and leave this entire invalid/failed batch pending.
          dataset = overlayFeedback(dataset, feedbackState, config);
          dataset.meta.feedbackAnalysis = { ...dataset.meta.feedbackAnalysis, state: 'error', message: e.message || '评论分析失败，稍后重试' };
        }
        return send(200, dataset);
      }
      if (url.pathname === '/api/integration/group-events') {
        const assigned = new Set(dataset.events.flatMap(e => e.workIds));
        const candidates = dataset.works.filter(w => !assigned.has(w.id)).slice(0, 40);
        if (!candidates.length) return send(200, dataset);
        const buckets = [...new Set(candidates.map(w => w.platform))].map(platform => candidates.filter(w => w.platform === platform));
        const ordered = []; for (let i = 0; i < Math.max(...buckets.map(b => b.length)); i++) for (const bucket of buckets) if (bucket[i]) ordered.push(bucket[i]);
        const events = structuredClone(state?.source === dataset.meta.namespace ? state.events : dataset.events);
        let batchesCompleted = 0;
        for (let offset = 0; offset < ordered.length; offset += 12) {
          const used = calls.filter(at => at > Date.now() - 3600000).length;
          if (config.maxCalls > 0 && batchesCompleted && used >= config.maxCalls) break;
          const batch = ordered.slice(offset, offset + 12);
          const workAliases = new Map(batch.map((w, i) => [`W${String(i + 1).padStart(2,'0')}`, w.id]));
          const eventAliases = new Map(events.map((e, i) => [`E${String(i + 1).padStart(3,'0')}`, e.id]));
          const materials = {
            candidates: batch.map((w, i) => ({ id: `W${String(i + 1).padStart(2,'0')}`, title: w.title, account: w.account, platform: w.platform, publishedAt: w.publishedAt, excerpt: w.body.slice(0, 2000), truncated: w.body.length > 2000 })),
            existingEvents: events.map((e, i) => ({ id: `E${String(i + 1).padStart(3,'0')}`, title: e.title, summary: e.summary })),
          };
          let groups; let feedback;
          for (let attempt = 0; attempt < 2; attempt++) {
            const raw = await modelCall(config, async () => parseModelJson(await complete(config, groupingPrompt,
              feedback ? { ...materials, validationFeedback: feedback } : materials, controller.signal)));
            try {
              if (!Array.isArray(raw?.groups)) throw new Error('groups 必须为数组');
              const resolved = { groups: raw.groups.map(g => {
                if (!Array.isArray(g.workIds) || g.workIds.some(id => !workAliases.has(id))) throw new Error('workIds 只能使用本批 candidates 的 W 编号');
                if (g.existingEventId && !eventAliases.has(g.existingEventId)) throw new Error('existingEventId 只能使用提供的 E 编号');
                return { ...g, workIds: g.workIds.map(id => workAliases.get(id)), existingEventId: g.existingEventId ? eventAliases.get(g.existingEventId) : undefined };
              }) };
              groups = validateGroups(resolved, { ...input, events }, batch); break;
            } catch (e) {
              if (attempt === 1) throw e;
              feedback = `${e.message}。请重新生成整个批次：每个 W 编号最多出现一次。已有事件只通过 existingEventId 关联，不要重复列出旧作品。`;
            }
          }
          if (inputRevision !== revision) throw new Error('分析期间数据已刷新，请重新归并');
          for (const g of groups || []) {
            const existing = events.find(e => e.id === g.existingEventId);
            if (existing) { existing.workIds = [...new Set([...existing.workIds, ...g.workIds])]; existing.updatedAt = new Date().toISOString(); }
            else events.push({ id: 'event-' + createHash('sha256').update([...g.workIds].sort().join('|')).digest('hex').slice(0, 16), title: g.title, summary: g.summary, topic: g.topic, workIds: g.workIds, updatedAt: new Date().toISOString() });
          }
          // Commit each validated batch so an interrupted later batch can resume.
          await saveState({ source: dataset.meta.namespace, events });
          dataset = { ...dataset, events: events.map(e => ({ ...e, workIds: e.workIds.filter(id => dataset.works.some(w => w.id === id)) })).filter(e => e.workIds.length) };
          revision++; inputRevision = revision; batchesCompleted++;
        }
        await saveState({ source: dataset.meta.namespace, events });
        dataset = { ...dataset, events: events.map(e => ({ ...e, workIds: e.workIds.filter(id => dataset.works.some(w => w.id === id)) })).filter(e => e.workIds.length) }; revision++;
        return send(200, dataset);
      }
      if (url.pathname === '/api/integration/analyze') {
        const event = input.events.find(e => e.id === payload.eventId); if (!event) throw new Error('事件不存在，请先归并作品');
        const works = input.works.filter(w => event.workIds.includes(w.id));
        const corpus = { event, works, feedback: input.feedback.filter(f => works.some(w => w.id === f.workId)), hotspots: input.hotspots.filter(h => h.eventId === event.id) };
        const report = await modelTask(config, analysisCallCount(corpus), invoke => analyzeEvent(config, corpus, controller.signal, invoke));
        if (inputRevision !== revision) throw new Error('分析期间数据已更新，结果未保存，请重试');
        return send(200, report);
      }
      return send(404, { error: '接口不存在' });
    } catch (e) {
      if (controller.signal.aborted) return;
      const message = e.name === 'TimeoutError' ? '请求超时，请检查服务状态或增加超时设置' : e.message === 'fetch failed' ? '无法连接服务，请检查局域网或模型服务地址' : e.message || '连接失败';
      return send(400, { error: message });
    }
  };
}

export function integrationPlugin() {
  let root;
  return { name: 'mediamirror-local-integration', configResolved(config) { root = config.root; },
    configureServer(server) { server.middlewares.use(createIntegration(root)); },
    configurePreviewServer(server) { server.middlewares.use(createIntegration(root)); } };
}
