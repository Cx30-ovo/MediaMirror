import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile(new URL('../src/services/statistics.ts', import.meta.url), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const { buildStatistics, statisticRange, statisticTimestamp, summarizeStatistics } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
const now = Date.parse('2026-11-06T12:00:00+08:00');
const work = (id, publishedAt, extra = {}) => ({ id, publishedAt, platform: '微博', account: '测试账号', owner: 'self', interactions: 10, ...extra });

test('Beijing calendar ranges include today, exclude future publications, and separate yesterday', () => {
  const works = [work('a', '2026-11-05 23:59:59'), work('b', '2026-11-06 00:00:00'), work('c', '2026-11-06T04:00:00Z'), work('future', '2026-11-06 12:00:01')];
  assert.deepEqual(buildStatistics(works, 'today', '全部平台', now).works.map(w => w.id), ['b', 'c']);
  assert.deepEqual(buildStatistics(works, 'yesterday', '全部平台', now).works.map(w => w.id), ['a']);
  assert.equal(statisticRange('7d', now).dates[0], '2026-10-31');
  assert.equal(statisticRange('30d', now).dates[0], '2026-10-08');
  assert.equal(statisticTimestamp('2026-11-06 00:00:00'), Date.parse('2026-11-05T16:00:00Z'));
});

test('period edges, owners, platform filters and undated works do not inflate totals', () => {
  const works = [work('before', '2026-10-07 23:59:59'), work('edge', '2026-10-08 00:00:00'), work('competitor', '2026-11-06', { owner: 'competitor' }), work('other', '2026-11-06', { platform: '抖音' }), work('undated', ''), work('bad', 'invalid')];
  const stats = buildStatistics(works, '30d', '微博', now);
  assert.deepEqual(stats.works.map(w => w.id), ['edge']);
  assert.equal(stats.invalidDates, 2);
  assert.equal(stats.platforms.length, 1);
  assert.equal(stats.daily.reduce((n, d) => n + d.works, 0), stats.summary.works);
});

test('missing metrics stay unknown, zero remains valid, upstream engagement is not double counted', () => {
  const summary = summarizeStatistics([work('one', '2026-11-06', { interactions: 0, metrics: { likes: 5, comments: null } }), work('two', '2026-11-06', { interactions: null, metrics: { likes: 10 } })]);
  assert.deepEqual(summary.interactions, { value: 0, provided: 1, total: 2 });
  assert.deepEqual(summary.likes, { value: 15, provided: 2, total: 2 });
  assert.equal(summary.comments.value, null);
  assert.equal(summary.views.value, null);
  assert.equal(summarizeStatistics([]).interactions.value, 0);
});
