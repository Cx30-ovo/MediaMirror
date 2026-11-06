import { useEffect, useMemo, useState } from 'react';
import { Activity, BarChart3, CalendarDays, Eye, FileText, Info } from 'lucide-react';
import type { Dataset } from '../domain/types';
import { buildStatistics, statisticPeriods, statisticPlatforms, statisticTimestamp, type StatisticPeriod, type statisticSum } from '../services/statistics';
import { Badge } from './ReviewUI';
import '../statistics.css';

type Metric = ReturnType<typeof statisticSum>;
const number = (value: number | null) => value === null ? '未提供' : value.toLocaleString('zh-CN');
const coverage = (metric: Metric) => metric.total ? `${metric.provided}/${metric.total} 篇有数据${metric.provided < metric.total ? ' · 部分统计' : ''}` : '当前范围无收录作品';
const labels = [['interactions', '互动总量'], ['views', '阅读 / 播放'], ['likes', '点赞'], ['comments', '评论'], ['favorites', '收藏'], ['shares', '转发']] as const;
export function StatisticsWorkspace({ data }: { data: Dataset }) {
  const [period, setPeriod] = useState<StatisticPeriod>('today');
  const [platform, setPlatform] = useState('全部平台');
  const [chartMetric, setChartMetric] = useState<'works' | 'interactions'>('interactions');
  const [now, setNow] = useState(Date.now);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 60000); return () => clearInterval(timer); }, []);
  const stats = useMemo(() => buildStatistics(data.works, period, platform, now), [data.works, period, platform, now]);
  const comparisonMax = Math.max(1, ...stats.platforms.map(p => chartMetric === 'works' ? p.works : p.interactions.value ?? 0));
  const dailyMax = Math.max(1, ...stats.daily.map(d => d.works));
  const observed = stats.works.map(w => statisticTimestamp(w.observedAt)).filter(Number.isFinite);
  const latest = observed.length ? new Date(Math.max(...observed)).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false }) : '未提供';
  return <section className="statistics-page">
    <div className="page-title"><div><div className="eyebrow">PLATFORM ANALYTICS / 数据概览</div><h1>数据统计<span className="title-dot" /></h1><p>掌握各平台发布节奏与作品互动，查看真实数据表现。</p></div><Badge tone="outlined"><BarChart3 size={14} aria-hidden="true" />自有账号 · 四平台</Badge></div>
    <div className="surface statistics-toolbar"><div className="statistics-periods" role="group" aria-label="统计时间范围">{statisticPeriods.map(p => <button key={p.id} aria-pressed={period === p.id} onClick={() => setPeriod(p.id)}>{p.label}</button>)}</div><label>平台<select value={platform} onChange={e => setPlatform(e.target.value)}>{['全部平台', ...statisticPlatforms].map(p => <option key={p}>{p}</option>)}</select></label><span><CalendarDays size={15} aria-hidden="true" />{stats.range.dates[0]} — {stats.range.dates.at(-1)} · 北京时间</span></div>
    <div className="statistics-kpis" aria-live="polite">
      <article className="surface"><span><FileText size={17} aria-hidden="true" />发布作品总数</span><strong>{number(stats.summary.works)}<small> 篇</small></strong><p>{stats.summary.accounts} 个账号平台组合</p></article>
      <article className="surface statistics-primary-kpi"><span><Activity size={17} aria-hidden="true" />互动总量</span><strong>{number(stats.summary.interactions.value)}</strong><p>{coverage(stats.summary.interactions)}</p></article>
      <article className="surface"><span><Eye size={17} aria-hidden="true" />阅读 / 播放总量</span><strong>{number(stats.summary.views.value)}</strong><p>{coverage(stats.summary.views)}</p></article>
      <article className="surface"><span><BarChart3 size={17} aria-hidden="true" />平均每篇互动</span><strong>{stats.summary.interactions.provided ? number(Math.round(stats.summary.interactions.value! / stats.summary.interactions.provided)) : '—'}</strong><p>仅以有互动数据的 {stats.summary.interactions.provided} 篇为分母</p></article>
    </div>
    <p className="statistics-note"><Info size={16} aria-hidden="true" />按发布时间筛选作品；近 7 / 30 天包含今天，今天截至当前时刻。互动为所选作品最近采集的累计值，并非所选期间新增互动。</p>
    {!stats.works.length && <div className="surface statistics-empty" role="status"><FileText size={23} aria-hidden="true" /><div><h2>当前范围暂无收录作品</h2><p>可切换时间范围或平台查看；未收录不代表平台未发布。</p></div></div>}
    <div className="statistics-charts">
      <section className="surface statistics-chart"><div className="section-heading"><div><h2>各平台{chartMetric === 'works' ? '发布量' : '互动量'}</h2><p>{chartMetric === 'works' ? '所选范围内收录的作品数' : '所选作品的累计互动对比'}</p></div><div className="statistics-metric-switch" role="group" aria-label="平台对比指标"><button aria-pressed={chartMetric === 'interactions'} onClick={() => setChartMetric('interactions')}>互动量</button><button aria-pressed={chartMetric === 'works'} onClick={() => setChartMetric('works')}>发布量</button></div></div><div className="statistics-platform-bars">{stats.platforms.map(p => { const value = chartMetric === 'works' ? p.works : p.interactions.value; return <div key={p.platform} className="statistics-platform-bar"><div><strong>{p.platform}</strong><span>{number(value)}{chartMetric === 'works' ? ' 篇' : ''}</span></div><div className="statistics-track" role="img" aria-label={`${p.platform}${chartMetric === 'works' ? '发布量' : '互动量'}：${number(value)}`}><span style={{ width: `${(value ?? 0) / comparisonMax * 100}%` }} /></div><small>{chartMetric === 'works' ? '按作品发布时间统计' : coverage(p.interactions)}</small></div>; })}</div></section>
      <section className="surface statistics-chart"><div className="section-heading"><div><h2>每日发布趋势</h2><p>{platform} · 按发布日统计作品数量</p></div><Badge>{stats.range.days} 天</Badge></div><div className="statistics-daily-scroll" tabIndex={0} aria-label="每日发布趋势，可横向滚动"><div className="statistics-daily" style={{ gridTemplateColumns: `repeat(${stats.daily.length}, minmax(20px, 1fr))` }}>{stats.daily.map(d => <div className="statistics-day" key={d.date}><span>{d.works}</span><div className="statistics-day-track"><i style={{ height: `${d.works / dailyMax * 100}%` }} /></div><small>{d.date.slice(5).replace('-', '/')}</small></div>)}</div></div><p className="statistics-chart-note">柱上数字为当日发布篇数；0 表示当前数据中无该日收录作品。</p></section>
    </div>
    <section className="surface statistics-details"><div className="section-heading"><div><h2>平台数据明细</h2><p>缺失显示“未提供”；部分字段只汇总有数据的作品。</p></div><Badge>{stats.works.length} 篇作品</Badge></div><div className="statistics-table-scroll" tabIndex={0} aria-label="各平台数据明细，可横向滚动"><table><caption className="sr-only">当前时间范围各平台发布作品和累计互动汇总，单元格注明字段覆盖作品数。</caption><thead><tr><th scope="col">平台</th><th scope="col">发布作品</th>{labels.map(([key, label]) => <th scope="col" key={key}>{label}</th>)}</tr></thead><tbody>{[...stats.platforms, { platform: '合计', ...stats.summary }].map(p => <tr key={p.platform}><th scope="row">{p.platform}</th><td><strong>{number(p.works)}</strong><small>篇</small></td>{labels.map(([key]) => <td key={key}><strong>{number(p[key].value)}</strong><small>{p.works ? `${p[key].provided}/${p.works} 篇${p[key].provided < p.works ? ' · 部分' : ''}` : '无收录作品'}</small></td>)}</tr>)}</tbody></table></div></section>
    <section className="surface statistics-definition"><h2><Info size={16} aria-hidden="true" />统计口径</h2><p>互动总量沿用上游接口的互动合计，不与点赞、评论、收藏、转发重复相加。各平台统计口径不同，公众号数据沿用上游凡闻口径；阅读与播放合并展示，不代表独立受众人数。</p><p>最近作品观测：{latest}（北京时间）。{data.meta?.loadedAt ? `数据读取：${new Date(data.meta.loadedAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })}。` : ''}{data.meta?.full === false ? '当前仅加载最新样本，并非接口全量。' : '仅统计接口已收录的自有作品，竞品不计入。'}{stats.invalidDates > 0 && `有 ${stats.invalidDates} 篇作品缺少有效发布时间，未计入本页。`}</p></section>
  </section>;
}
