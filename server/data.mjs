import { baseUrl } from './config.mjs';

export const platforms = { douyin: '抖音', weibo: '微博', xhs: '小红书', wechat: '公众号' };
const str = value => typeof value === 'string' ? value : '';
const count = value => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
const required = (value, field) => { if (typeof value !== 'string' || !value.trim()) throw new Error(`数据缺少 ${field}`); return value; };
export function safeUrl(value) { try { const u = new URL(value); return ['http:', 'https:'].includes(u.protocol) && !u.username && !u.password ? u.href : undefined; } catch { return undefined; } }

export function mapWork(raw, expectedPlatform) {
  if (!raw || typeof raw !== 'object' || !(raw.platform in platforms) || raw.platform !== expectedPlatform) throw new Error('作品平台字段不匹配');
  let tags = raw.tags; if (typeof tags === 'string') { try { tags = JSON.parse(tags); } catch { tags = []; } }
  const externalId = required(raw.external_work_id, 'external_work_id（必须是字符串，防止长 ID 精度丢失）');
  const metrics = { likes: count(raw.like_count), comments: count(raw.comment_count), favorites: count(raw.collect_count), shares: count(raw.platform === 'weibo' ? raw.repost_count : raw.share_count) };
  return { id: `${raw.platform}:${externalId}`, externalId, sourceId: str(raw.id), title: required(raw.title, 'title'),
    platform: platforms[raw.platform], account: required(raw.account_name, 'account_name'),
    owner: raw.owner === 'competitor' ? 'competitor' : 'self', topic: Array.isArray(tags) ? tags.filter(t => typeof t === 'string').join(' / ') || '未分类' : '未分类',
    publishedAt: str(raw.published_at), observedAt: str(raw.last_seen_at), summary: str(raw.content) || raw.title,
    body: str(raw.content), url: safeUrl(raw.url), format: str(raw.work_type) || '未提供',
    views: count(raw.view_count), engagementDelta: count(raw.engagement_delta), firstSeenAt: str(raw.first_seen_at),
    interactions: count(raw.engagement_total), platformComments: metrics.comments, metrics,
    metricNotes: raw.platform === 'wechat' ? '微信互动值来自上游凡闻口径；0 不代表完整受众反馈。' : '',
  };
}

export async function fetchJson(url, config, signal) {
  const headers = { Accept: 'application/json' };
  if (config.dataKey) headers[config.authHeader] = config.authPrefix + config.dataKey;
  const response = await fetch(url, { headers, signal: AbortSignal.any([signal || new AbortController().signal, AbortSignal.timeout(config.timeout)]), redirect: 'error' });
  if (!response.ok) throw new Error(`数据接口返回 HTTP ${response.status}`);
  const text = await response.text();
  if (text.length > 8_000_000) throw new Error('数据响应过大，请缩小单次读取范围');
  let result; try { result = JSON.parse(text); } catch { throw new Error('数据接口未返回 JSON，请检查路径'); }
  if (result.ok === false) throw new Error('上游数据接口报告请求失败');
  return result;
}

export function validateComments(items, works) {
  if (!Array.isArray(items)) throw new Error('评论接口 data 应为数组');
  const workIds = new Set(works.map(w => w.id));
  const feedback = items.map(raw => {
    const workId = required(raw.workId, '评论 workId，格式 platform:external_work_id');
    if (!workIds.has(workId)) return null;
    return { id: required(raw.id, '评论 id'), workId, parentId: str(raw.parentId) || undefined, replyTo: str(raw.replyTo) || undefined,
      text: raw.textMissing === true && typeof raw.text === 'string' && !raw.text.trim() ? raw.text : required(raw.text, '评论 text'),
      textMissing: raw.textMissing === true && typeof raw.text === 'string' && !raw.text.trim(),
      author: str(raw.author) || '未提供作者', at: str(raw.at), url: safeUrl(raw.url),
      type: '待分析', sentiment: '未分析', target: '待分析',
      likes: count(raw.likes), replyCount: count(raw.replyCount), rootId: str(raw.rootId) || undefined };
  }).filter(Boolean);
  const ids = new Set(works.map(w => w.id));
  for (const f of feedback) { if (ids.has(f.id)) throw new Error('评论 ID 重复或与作品 ID 冲突'); ids.add(f.id); }
  const index = new Map(feedback.map(f => [f.id, f]));
  for (const f of feedback) {
    const visited = new Set([f.id]); let parent = f.parentId;
    while (parent) { const p = index.get(parent); if (!p || p.workId !== f.workId || visited.has(parent)) throw new Error('评论父子关系缺失、跨作品或存在循环'); visited.add(parent); parent = p.parentId; }
  }
  return feedback;
}


export function createDatasetLoader() {
  // Cache only the most recent successful load. Failed/cancelled refreshes cannot overwrite it.
  let detailCache = new Map();
  return async function load(config, signal) {
    const base = baseUrl(config.dataBase, 'DATA_API_BASE_URL');
    const full = config.dataScope !== 'latest';
    const pageSize = config.pageSize || 200;
    async function readPlatform(platform) {
      for (let attempt = 0; attempt < 2; attempt++) {
        const works = []; const seen = new Set(); let total = null; let offset = 0; let changed = false;
        while (true) {
          signal?.throwIfAborted();
          const limit = full ? pageSize : Math.min(pageSize, config.perPlatform - works.length);
          if (limit <= 0) break;
          const url = new URL('/api/works', base);
          url.search = new URLSearchParams({ platform, limit: String(limit), offset: String(offset) }).toString();
          const result = await fetchJson(url, config, signal);
          if (result.ok !== true || !Array.isArray(result.data) || result.data.length > limit || count(result.page?.total) === null || result.page?.offset !== offset || result.page?.count !== result.data.length) throw new Error(`${platform} 作品列表或分页格式不正确`);
          const currentTotal = result.page.total;
          if (total !== null && currentTotal !== total) { changed = true; break; }
          total = currentTotal;
          for (const raw of result.data) {
            const work = mapWork(raw, platform);
            if (seen.has(work.id)) { changed = true; break; }
            seen.add(work.id); works.push(work);
          }
          if (changed) break;
          offset += result.data.length;
          if (offset >= total || (!full && works.length >= config.perPlatform)) break;
          if (!result.data.length) throw new Error(`${platform} 分页提前结束，未完成全量读取`);
        }
        if (changed) { if (attempt === 0) continue; throw new Error(`${platform} 分页期间数据发生变化，请稍后重新刷新`); }
        if (full && works.length !== total) throw new Error(`${platform} 实际读取条数与接口总数不一致，未替换已有数据`);
        return { works, platform: platforms[platform], loaded: works.length, total };
      }
    }
    const pages = await Promise.all(Object.keys(platforms).map(readPlatform));
    let works = pages.flatMap(p => p.works);
    if (new Set(works.map(w => w.id)).size !== works.length) throw new Error('作品 ID 重复，请检查上游去重');
    const nextCache = new Map(); let detailResults = []; let detailsFetched = 0;
    if (config.loadDetails !== false) {
      const slots = new Array(works.length); let cursor = 0;
      await Promise.all(Array.from({ length: Math.min(config.detailConcurrency || 4, works.length) }, async () => {
        while (cursor < works.length) {
          signal?.throwIfAborted();
          const index = cursor++; const work = works[index];
          const cacheKey = `${base.href}|${work.id}`;
          const fingerprint = JSON.stringify(work);
          const cached = detailCache.get(cacheKey);
          // Comment collection may advance without updating the work row: periodically revisit.
          if (cached?.fingerprint === fingerprint && Date.now() - cached.at < 300000) {
            slots[index] = cached.value; nextCache.set(cacheKey, cached); continue;
          }
          const platform = work.id.split(':')[0];
          const result = await fetchJson(new URL(`/api/works/${platform}/${encodeURIComponent(work.externalId)}`, base), config, signal);
          if (result.ok !== true || !result.data || `${result.data.platform}:${result.data.external_work_id}` !== work.id || !Array.isArray(result.data.comments) || !Array.isArray(result.data.metric_snapshots)) throw new Error(`作品 ${work.id} 的详情或评论结构不正确`);
          const raw = result.data;
          if (count(raw.comment_total) === null || raw.comment_total !== raw.comments.length) throw new Error(`作品 ${work.id} 的评论尚未完整返回，未替换已有数据`);
          const idFor = id => `comment:${work.id}:${required(id, 'external_comment_id（必须是字符串）')}`;
          const comments = raw.comments.map(c => ({ id: idFor(c.external_comment_id), workId: work.id,
            parentId: c.parent_comment_id ? idFor(c.parent_comment_id) : undefined,
            rootId: c.root_comment_id ? idFor(c.root_comment_id) : undefined,
            text: str(c.content), textMissing: !str(c.content).trim(), author: str(c.author_name), at: str(c.first_seen_at),
            likes: count(c.like_count), replyCount: count(c.reply_count) }));
          const snapshots = raw.metric_snapshots.map(m => ({ observedAt: str(m.observed_at), stage: str(m.stage),
            views: count(m.view_count), likes: count(m.like_count), comments: count(m.comment_count),
            favorites: count(m.collect_count), shares: count(platform === 'weibo' ? m.repost_count : m.share_count) }));
          const value = { work: { ...mapWork(raw, platform), metricSnapshots: snapshots, collectedComments: raw.comment_total }, comments };
          slots[index] = value; detailsFetched++;
          nextCache.set(cacheKey, { fingerprint, value, at: Date.now() });
        }
      }));
      detailResults = slots;
      works = slots.map(d => d.work);
    }
    const optionalUrl = path => { const url = new URL(path, base); if (url.origin !== base.origin) throw new Error('可选数据路径必须使用同一个数据服务'); return url; };
    let feedback = validateComments(detailResults.flatMap(d => d.comments), works); let hotspots = [];
    if (config.commentsPath) {
      const result = await fetchJson(optionalUrl(config.commentsPath), config, signal);
      const extra = validateComments(result.data, works);
      const combined = new Map(feedback.map(f => [f.id, f]));
      for (const item of extra) { if (combined.has(item.id)) throw new Error('可选评论与作品详情评论 ID 重复'); combined.set(item.id, item); }
      feedback = validateComments([...combined.values()], works);
    }
    if (config.hotspotsPath) {
      const result = await fetchJson(optionalUrl(config.hotspotsPath), config, signal);
      if (!Array.isArray(result.data)) throw new Error('热点接口 data 应为数组');
      hotspots = result.data.map(raw => {
        if (!['百度', '今日头条'].includes(raw.platform)) throw new Error('热点来源仅支持百度、今日头条');
        return { id: required(raw.id, '热点 id'), eventId: '', platform: raw.platform, title: required(raw.title, '热点 title'), observedAt: str(raw.observedAt), position: count(raw.position), url: safeUrl(raw.url) };
      });
      if (new Set(hotspots.map(h => h.id)).size !== hotspots.length) throw new Error('热点 ID 重复');
    }
    signal?.throwIfAborted();
    detailCache = nextCache;
    return { works, feedback, events: [], hotspots, meta: { mode: 'live', loadedAt: new Date().toISOString(), full,
      detailsLoaded: detailResults.length, detailsFetched, snapshots: works.reduce((n, w) => n + (w.metricSnapshots?.length || 0), 0),
      scope: full ? '当前接口四平台全部已收录作品及已返回的评论、互动快照；非平台全网全量' : `四平台各最新 ${config.perPlatform} 条；非全量数据`,
      platforms: pages.map(({ works, ...p }) => p),
      warnings: [feedback.some(f => f.textMissing) && `${feedback.filter(f => f.textMissing).length} 条评论未返回正文，保留原始父子关系；无法据此判断具体观点。`,
        config.loadDetails === false && !config.commentsPath && '未读取作品详情，尚未接入评论原文及互动快照。',
        config.loadDetails !== false && '评论原文来自微博、小红书的已采集样本，包含子评论；抖音、公众号目前只有评论统计数。',
        config.loadDetails !== false && '接口已采集评论不等于平台全部评论，评论观点仅覆盖当前收录原文。',
        !config.hotspotsPath && '百度、今日头条热点入口尚未配置。',
        !works.some(w => w.owner === 'competitor') && '当前未接入竞品作品，不能生成竞品报道与受众差异结论。',
        '微信互动数据沿用上游口径，0 不表示已全面采集受众反馈。'].filter(Boolean) } };
  };
}
export const loadDataset = createDatasetLoader();
