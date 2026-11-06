import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, ArrowUpRight, ChevronLeft, ChevronRight, FileText, GitCompareArrows, Info, Layers, MessageCircle, RotateCcw, Search, Users } from 'lucide-react';
import type { Dataset, Work } from '../domain/types';
import type { AgentState } from '../services/useAgent';
import { classifyListeningTopic } from '../domain/listeningTopics';
import { editorialPlatforms, sumMetric } from '../services/crossPlatform';
import { matrixAccounts } from '../services/listening';
import { Badge, SearchField } from './ReviewUI';
import '../listening.css';
import '../matrix-workspace.css';

type Props={data:Dataset;agent:AgentState;onAnalyze:(id:string)=>void;onFeedback:()=>void};
type Coverage='all'|'multi'|'single'|'feedback';
const tabs=[{id:'coverage',label:'报道覆盖',icon:Layers},{id:'accounts',label:'账号概览',icon:Users},{id:'clues',label:'受众线索',icon:MessageCircle}] as const;
const pageSize=12;
const platformSymbols:Record<string,string>={'抖音':'抖','微博':'微','小红书':'小','公众号':'公'};

export function MatrixWorkspace({data,agent,onAnalyze,onFeedback}:Props){
 const [platform,setPlatform]=useState('全部自有平台');
 const [date,setDate]=useState('');
 const [query,setQuery]=useState('');
 const [view,setView]=useState<typeof tabs[number]['id']>('coverage');
 const [coverage,setCoverage]=useState<Coverage>('all');
 const [sort,setSort]=useState('latest');
 const [page,setPage]=useState(1);
 const tableScroll=useRef<HTMLDivElement>(null);
 const corpora=agent.corpora;
 const eventByWork=useMemo(()=>new Map(corpora.flatMap(c=>c.works.map(w=>[w.id,c.event] as const))),[corpora]);
 const feedbackByWork=useMemo(()=>{
  const groups=new Map<string,Dataset['feedback']>();
  for(const comment of data.feedback){const group=groups.get(comment.workId)||[];group.push(comment);groups.set(comment.workId,group)}
  return groups;
 },[data.feedback]);
 const baseWorks=useMemo(()=>{
  const search=query.trim().toLocaleLowerCase();
  return data.works.filter(w=>w.owner!=='competitor'&&(!date||w.publishedAt.startsWith(date))&&(!search||[w.account,w.title,w.topic,eventByWork.get(w.id)?.title].join(' ').toLocaleLowerCase().includes(search)));
 },[data.works,eventByWork,date,query]);
 const works=useMemo(()=>baseWorks.filter(w=>platform==='全部自有平台'||w.platform===platform),[baseWorks,platform]);
 const accounts=useMemo(()=>matrixAccounts(works),[works]);
 const feedback=useMemo(()=>works.flatMap(w=>feedbackByWork.get(w.id)||[]),[works,feedbackByWork]);
 const rows=useMemo(()=>{
  const selected=new Map(works.map(w=>[w.id,w]));
  return corpora.map(c=>{
   const ws=c.works.map(w=>selected.get(w.id)).filter((w):w is Work=>!!w);
   const comments=ws.flatMap(w=>feedbackByWork.get(w.id)||[]);
   const counts=Object.fromEntries(editorialPlatforms.map(p=>[p,ws.filter(w=>w.platform===p).length]));
   return {corpus:c,works:ws,comments,counts,platformCount:editorialPlatforms.filter(p=>counts[p]>0).length,questions:comments.filter(f=>f.type==='信息疑问'),corrections:comments.filter(f=>f.type==='纠错线索')};
  }).filter(row=>row.works.length);
 },[works,corpora,feedbackByWork]);
 const multiCount=rows.filter(row=>row.platformCount>1).length;
 const advice=rows.filter(row=>row.questions.length||row.corrections.length).sort((a,b)=>b.corrections.length-a.corrections.length||b.questions.length-a.questions.length);
 const shownRows=rows.filter(row=>coverage==='all'||(coverage==='multi'?row.platformCount>1:coverage==='single'?row.platformCount===1:row.questions.length+row.corrections.length>0)).sort((a,b)=>{
  const difference=sort==='works'?b.works.length-a.works.length:sort==='platforms'?b.platformCount-a.platformCount:sort==='feedback'?b.comments.length-a.comments.length:b.corpus.event.updatedAt.localeCompare(a.corpus.event.updatedAt);
  return difference||a.corpus.event.id.localeCompare(b.corpus.event.id);
 });
 const columns=editorialPlatforms.filter(p=>platform==='全部自有平台'||platform===p);
 const totalPages=Math.max(1,Math.ceil(shownRows.length/pageSize));
 const currentPage=Math.min(page,totalPages);
 const pageRows=shownRows.slice((currentPage-1)*pageSize,currentPage*pageSize);
 useEffect(()=>setPage(1),[query,date,platform,coverage,sort]);
 useEffect(()=>{if(tableScroll.current)tableScroll.current.scrollTop=0},[currentPage,query,date,platform,coverage,sort]);
 function reset(){setQuery('');setPlatform('全部自有平台');setDate('');setCoverage('all');setSort('latest');setPage(1)}
 function choosePlatform(value:string){setPlatform(value);setCoverage('all')}
 const filters=[{id:'all',label:'全部事件',count:rows.length},{id:'multi',label:'跨平台覆盖',count:multiCount},{id:'single',label:'单平台收录',count:rows.length-multiCount},{id:'feedback',label:'有疑问 / 纠错',count:advice.length}] as const;
 const stats=[{label:'自有作品',value:works.length,description:'当前筛选收录',icon:FileText},{label:'关联事件',value:rows.length,description:`${multiCount} 个跨平台覆盖`,icon:Layers},{label:'账号平台组合',value:accounts.length,description:'按平台与账号识别',icon:Users},{label:'评论及回复',value:feedback.length,description:'所选作品的收录反馈',icon:MessageCircle}];
 const empty=<div className="empty-state matrix-empty"><Search size={25}/><h3>当前条件没有匹配内容</h3><p>试试其他平台、日期或搜索词。</p><button className="btn secondary" onClick={reset}>重置筛选</button></div>;

 return <section className="matrix-page">
  <div className="page-title"><div><div className="eyebrow">EDITORIAL MATRIX / 厦门广电</div><h1>矩阵观察<span className="title-dot"/></h1><p>看清自有矩阵的报道分布，找到值得补充的内容与受众问题。</p></div><Badge tone="outlined">自有四平台</Badge></div>
  <section className="surface matrix-filter-panel" aria-label="矩阵筛选">
   <div className="matrix-toolbar"><SearchField value={query} onChange={setQuery} placeholder="搜索自有账号、作品或事件"/><label className="matrix-date"><span>作品日期</span><input type="date" aria-label="矩阵作品日期" value={date} onChange={e=>setDate(e.target.value)}/></label><button className="matrix-all-dates" aria-pressed={!date} onClick={()=>setDate('')}>全部日期</button><button className="matrix-reset" onClick={reset}><RotateCcw size={14}/>重置</button></div>
   <div className="matrix-platform-heading"><span>平台分布 <small>点击卡片筛选</small></span><button onClick={()=>choosePlatform('全部自有平台')} aria-pressed={platform==='全部自有平台'}>全部平台<ArrowRight size={12}/></button></div>
   <div className="matrix-platform-grid">{editorialPlatforms.map(p=>{
    const ws=baseWorks.filter(w=>w.platform===p);
    const eventCount=new Set(ws.flatMap(w=>eventByWork.has(w.id)?[eventByWork.get(w.id)!.id]:[])).size;
    return <button key={p} className="matrix-platform-card" data-platform={p} aria-pressed={platform===p} onClick={()=>choosePlatform(platform===p?'全部自有平台':p)}><span className="matrix-platform-avatar">{platformSymbols[p]}</span><span className="matrix-platform-name"><strong>{p}</strong><small>{new Set(ws.map(w=>w.account)).size} 个账号 · {eventCount} 个事件</small></span><span className="matrix-platform-volume"><strong>{ws.length.toLocaleString()}</strong><small>篇作品</small></span></button>;
   })}</div>
  </section>
  <div className="matrix-stats">{stats.map(item=><div key={item.label}><span className="matrix-stat-icon"><item.icon size={18}/></span><div><span>{item.label}</span><strong>{item.value.toLocaleString()}</strong><small>{item.description}</small></div></div>)}</div>
  <div className="matrix-view-tabs" role="tablist" aria-label="矩阵观察视图">{tabs.map((tab,index)=><button key={tab.id} role="tab" id={`matrix-tab-${tab.id}`} aria-selected={view===tab.id} aria-controls={`matrix-panel-${tab.id}`} tabIndex={view===tab.id?0:-1} onClick={()=>setView(tab.id)} onKeyDown={event=>{
   if(['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){event.preventDefault();const next=tabs[event.key==='Home'?0:event.key==='End'?tabs.length-1:(index+(event.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length];setView(next.id);document.getElementById(`matrix-tab-${next.id}`)?.focus()}
  }}><tab.icon size={16}/>{tab.label}<span>{tab.id==='coverage'?rows.length:tab.id==='accounts'?accounts.length:advice.length}</span></button>)}</div>
  <div role="tabpanel" id={`matrix-panel-${view}`} aria-labelledby={`matrix-tab-${view}`}>
  {view==='coverage'&&<section className="surface matrix-coverage">
   <div className="section-heading"><div><h2>报道覆盖矩阵</h2><p>按事件对照四平台收录情况，点击篇数进入完整分析。</p></div><span className="matrix-filter-context">{platform==='全部自有平台'?'全部平台':platform} · {date||'全部日期'}</span></div>
   <div className="matrix-table-tools"><div className="matrix-coverage-filters" role="group" aria-label="事件覆盖筛选">{filters.map(filter=><button key={filter.id} aria-pressed={coverage===filter.id} onClick={()=>setCoverage(filter.id)}>{filter.label}<span>{filter.count}</span></button>)}</div><label className="matrix-sort"><span>排序</span><select aria-label="矩阵事件排序" value={sort} onChange={e=>setSort(e.target.value)}><option value="latest">最新事件</option><option value="works">收录篇数</option><option value="platforms">平台覆盖</option><option value="feedback">反馈数量</option></select></label></div>
   {!!shownRows.length&&<p className="matrix-scroll-hint">左右滑动，查看平台与反馈<ArrowRight size={12}/></p>}
   {shownRows.length?<><div ref={tableScroll} className="matrix-table-scroll" tabIndex={0} aria-label="自有事件平台覆盖表"><table className="matrix-coverage-table"><caption className="sr-only">自有作品在各平台的收录篇数，未收录不代表未发布。</caption><thead><tr><th scope="col">关联事件</th>{columns.map(p=><th scope="col" key={p}>{p}</th>)}<th scope="col">收录反馈</th></tr></thead><tbody>{pageRows.map((row,index)=>{
    const event=row.corpus.event;
    return <tr key={event.id}><th scope="row"><div className="matrix-event-title"><span className="matrix-row-number">{String((currentPage-1)*pageSize+index+1).padStart(2,'0')}</span><div><button onClick={()=>onAnalyze(event.id)}>{event.title}</button><small><span title={event.topic}>{classifyListeningTopic(event.topic,event.title)||'未分类'}</span><span>{row.platformCount} 个平台 · {row.works.length} 篇作品</span></small></div></div></th>{columns.map(p=><td key={p}>{row.counts[p]?<button className="matrix-coverage-cell" data-density={row.counts[p]>=5?'high':row.counts[p]>1?'medium':'low'} onClick={()=>onAnalyze(event.id)} aria-label={`${event.title} ${p} ${row.counts[p]}篇自有作品`}><strong>{row.counts[p]}</strong><span>篇</span><ArrowUpRight size={13}/></button>:<span className="matrix-missing" aria-label="未收录" title="当前筛选未收录">—</span>}</td>)}<td className="matrix-feedback-cell"><span><MessageCircle size={13}/><strong>{row.comments.length}</strong><span>条评论</span></span>{row.questions.length||row.corrections.length?<small className="matrix-has-clues">疑问 {row.questions.length} · 纠错线索 {row.corrections.length}</small>:<small>暂无疑问或纠错线索</small>}</td></tr>;
   })}</tbody></table></div><div className="matrix-pagination"><span>显示 {(currentPage-1)*pageSize+1}–{Math.min(currentPage*pageSize,shownRows.length)} / {shownRows.length} 个事件</span><div><button aria-label="上一页事件" disabled={currentPage===1} onClick={()=>setPage(currentPage-1)}><ChevronLeft size={16}/></button><span>{currentPage} <small>/ {totalPages}</small></span><button aria-label="下一页事件" disabled={currentPage===totalPages} onClick={()=>setPage(currentPage+1)}><ChevronRight size={16}/></button></div></div></>:<div className="matrix-empty">{rows.length?<div className="empty-state"><Layers size={25}/><h3>当前分类没有匹配事件</h3><p>切换覆盖分类，查看其他关联事件。</p><button className="btn secondary" onClick={()=>setCoverage('all')}>查看全部事件</button></div>:empty}</div>}
   <p className="matrix-data-note"><Info size={13}/>“—”表示当前筛选未收录，不代表未发布。日期筛选作品，评论包含所选作品的全部收录反馈。</p>
  </section>}
  {view==='accounts'&&<div className="matrix-account-grid">{accounts.length?accounts.map(account=>{
   const comments=account.works.flatMap(w=>feedbackByWork.get(w.id)||[]);
   const ids=new Set(account.works.map(w=>eventByWork.get(w.id)?.id).filter(Boolean));
   const events=corpora.filter(c=>ids.has(c.event.id));
   const observed=account.works.map(w=>w.observedAt).filter(Boolean).sort().at(-1);
   const topics=[...new Set(comments.map(f=>f.target).filter(Boolean))].slice(0,4);
   return <article className="surface matrix-account-card" key={account.id}><div className="section-heading"><div className="matrix-account-title"><span className="matrix-platform-avatar" data-platform={account.platform}>{platformSymbols[account.platform]}</span><div><h2>{account.account}</h2><small>{account.platform} · 自有账号</small></div></div><Badge>{events.length} 个事件</Badge></div><div className="matrix-account-counts"><span><FileText size={14}/>{account.works.length} 篇作品</span><span><MessageCircle size={14}/>{comments.length} 条评论及回复</span></div><div className="matrix-account-metrics">{([['likes','点赞'],['comments','平台评论'],['favorites','收藏'],['shares','转发']] as const).map(([key,label])=>{
    const metric=sumMetric(account.works,key);return <div key={key}><span>{label}</span><strong>{metric.value===null?'未提供':metric.value.toLocaleString()}</strong><small>{metric.provided}/{metric.total} 篇有数据</small></div>;
   })}</div><div className="matrix-account-focus"><strong>评论样本关注</strong>{topics.length?<div className="matrix-topic-tags">{topics.map(topic=><span key={topic}>{topic}</span>)}</div>:<p>{comments.length?'当前评论尚无明确问题标签。':'当前未收录评论。'}</p>}</div><div className="matrix-account-events">{events.slice(0,3).map(c=><button key={c.event.id} onClick={()=>onAnalyze(c.event.id)}>{c.event.title}<ArrowUpRight size={13}/></button>)}{events.length>3&&<details><summary>展开其余 {events.length-3} 个事件</summary>{events.slice(3).map(c=><button key={c.event.id} onClick={()=>onAnalyze(c.event.id)}>{c.event.title}<ArrowUpRight size={13}/></button>)}</details>}</div><small className="matrix-observed">最近观测 {observed||'未提供'}</small></article>;
  }):<div className="surface">{empty}</div>}</div>}
  {view==='clues'&&<section className="surface matrix-editorial-actions"><div className="section-heading"><div><h2><GitCompareArrows size={17}/>值得继续看的受众问题</h2><p>从收录反馈中归集疑问与纠错线索，先看原文，再判断是否补充报道。</p></div><button className="text-link" onClick={onFeedback}>查看评论原文<ArrowRight size={13}/></button></div><div className="matrix-clue-grid">{advice.map(row=><article className="matrix-clue-card" key={row.corpus.event.id}><div className="matrix-clue-tags">{!!row.corrections.length&&<Badge tone="amber">{row.corrections.length} 条纠错线索</Badge>}{!!row.questions.length&&<Badge>{row.questions.length} 条疑问</Badge>}</div><h3>{row.corpus.event.title}</h3>{[...row.corrections,...row.questions].find(f=>f.text)&&<blockquote>{[...row.corrections,...row.questions].find(f=>f.text)!.text}</blockquote>}<button className="text-link" onClick={()=>onAnalyze(row.corpus.event.id)}>查看事件依据<ArrowUpRight size={13}/></button></article>)}</div>{!advice.length&&<div className="empty-state"><MessageCircle size={25}/><h3>当前未收录疑问或纠错线索</h3><p>这不代表所有内容都已经核验。</p><button className="text-link" onClick={onFeedback}>查看已收录评论<ArrowRight size={13}/></button></div>}</section>}
  </div>
  <p className="matrix-boundary-note"><Info size={14}/>仅统计自有四平台收录数据；互动量保留平台原始口径，不用于跨平台质量排名或人员绩效评价。</p>
 </section>;
}
