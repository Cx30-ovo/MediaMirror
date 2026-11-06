import type { Work } from '../domain/types';

export const statisticPlatforms = ['抖音', '微博', '小红书', '公众号'] as const;
export const statisticPeriods = [{ id: 'today', label: '今天' }, { id: 'yesterday', label: '昨天' }, { id: '7d', label: '近7天' }, { id: '30d', label: '近30天' }] as const;
export type StatisticPeriod = typeof statisticPeriods[number]['id'];
const DAY = 86400000;
const OFFSET = 8 * 3600000;

// Upstream timestamps without an offset are Beijing time, regardless of browser timezone.
export function statisticTimestamp(value: string) {
  const text = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/i.test(text)) return NaN;
  const normalized = text.length === 10 ? `${text}T00:00:00+08:00` : /(?:Z|[+-]\d{2}:?\d{2})$/i.test(text) ? text.replace(' ', 'T') : `${text.replace(' ', 'T')}+08:00`;
  return Date.parse(normalized);
}
export function statisticDay(timestamp: number) { return new Date(timestamp + OFFSET).toISOString().slice(0, 10); }
export function statisticRange(period: StatisticPeriod, now: number) {
  const today = Math.floor((now + OFFSET) / DAY) * DAY - OFFSET;
  const days = period === '30d' ? 30 : period === '7d' ? 7 : 1;
  const start = period === 'yesterday' ? today - DAY : today - (days - 1) * DAY;
  const end = period === 'yesterday' ? today : now + 1;
  return { start, end, days, dates: Array.from({ length: days }, (_, i) => statisticDay(start + i * DAY)) };
}
export function statisticSum(works: Work[], get: (work: Work) => number | null | undefined) {
  const values = works.map(get).filter((v): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0);
  return { value: values.length ? values.reduce((sum, v) => sum + v, 0) : works.length ? null : 0, provided: values.length, total: works.length };
}
export function summarizeStatistics(works: Work[]) {
  return {
    works: works.length,
    accounts: new Set(works.map(w => `${w.platform}:${w.account}`)).size,
    interactions: statisticSum(works, w => w.interactions),
    views: statisticSum(works, w => w.views),
    likes: statisticSum(works, w => w.metrics?.likes),
    comments: statisticSum(works, w => w.metrics?.comments),
    favorites: statisticSum(works, w => w.metrics?.favorites),
    shares: statisticSum(works, w => w.metrics?.shares),
  };
}
export function buildStatistics(all: Work[], period: StatisticPeriod, platform: string, now: number) {
  const range = statisticRange(period, now);
  const owned = all.filter(w => w.owner !== 'competitor' && (platform === '全部平台' || w.platform === platform));
  const works = owned.filter(w => { const at = statisticTimestamp(w.publishedAt); return at >= range.start && at < range.end; });
  return {
    range, works, summary: summarizeStatistics(works),
    invalidDates: owned.filter(w => !Number.isFinite(statisticTimestamp(w.publishedAt))).length,
    platforms: statisticPlatforms.filter(p => platform === '全部平台' || p === platform).map(platform => ({ platform, ...summarizeStatistics(works.filter(w => w.platform === platform)) })),
    daily: range.dates.map(date => ({ date, ...summarizeStatistics(works.filter(w => statisticDay(statisticTimestamp(w.publishedAt)) === date)) })),
  };
}
