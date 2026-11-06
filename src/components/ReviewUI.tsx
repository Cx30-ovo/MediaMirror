import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { ArrowUpRight, BookmarkPlus, Check, ChevronDown, MessageCircle, Search, X, Quote, ExternalLink, CornerDownRight, FileText } from 'lucide-react';
import type { Dataset, Feedback, Followup } from '../domain/types';

export const feedbackTypes=['全部','待分析','信息疑问','纠错线索','内容建议','服务诉求','正向反馈','一般讨论','无法判断'];
export function Badge({children,tone='neutral'}:{children:React.ReactNode;tone?:string}){return <span className={'badge '+tone}>{children}</span>}
export function SearchField({value,onChange,placeholder}:{value:string;onChange:(s:string)=>void;placeholder:string}){
 return <label className="search-field"><Search size={16}/><span className="sr-only">{placeholder}</span><input type="search" placeholder={placeholder} value={value} onChange={e=>onChange(e.target.value)}/>{value&&<button aria-label="清除搜索" onClick={()=>onChange('')}><X size={14}/></button>}</label>;
}
function displayDate(value:string,full=false){
 if(!value)return '日期未提供';
 if(/^\d{4}-\d{2}-\d{2}$/.test(value))return full?value:value.slice(5);
 const date=new Date(value.replace(/(\.\d{3})\d+(?=Z|[+-]\d{2}:?\d{2}$)/,'$1'));
 if(!Number.isFinite(date.getTime()))return '日期未提供';
 const parts=new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(date);
 const get=(type:string)=>parts.find(p=>p.type===type)?.value||'';
 return (full?get('year')+'-':'')+get('month')+'-'+get('day')+' '+get('hour')+':'+get('minute')+(full?'（北京时间）':'');
}
function CommentDate({value}:{value:string}){return <time dateTime={value||undefined} title={displayDate(value,true)}>{displayDate(value)}</time>}

type EvidenceProps={ids:string[];data:Dataset;onWork:(id:string)=>void;onFollow:(id:string)=>void;followups:Followup[];onSelectFeedback?:(id:string)=>void};
export function EvidenceBody({ids,data,onWork,onFollow,followups,onSelectFeedback}:EvidenceProps){
 return <>{ids.map(id=>{
  const comment=data.feedback.find(c=>c.id===id);
  const work=data.works.find(w=>w.id===(comment?.workId||id));if(!work)return null;
  const parent=data.feedback.find(c=>c.id===comment?.parentId);
  const replies=comment?data.feedback.filter(c=>c.parentId===comment.id):[];
  const followed=followups.some(f=>f.feedbackId===id);
  return <article className="evidence-item" key={id} data-evidence-id={id} aria-label={comment?'选中评论详情':'报道详情'}>
   <div className="eyebrow">{comment?(parent?'子评论原文':'评论原文'):'报道原文'}</div>
   <div className="evidence-source"><span className="source-avatar">{work.owner==='competitor'?'媒':'厦'}</span><div><strong>{work.account}</strong><small>{work.platform} · <CommentDate value={comment?.at||work.publishedAt}/></small></div></div>
   <h3 title={work.title}>{work.title}</h3>
   <button className="btn evidence-work-link" onClick={()=>onWork(work.id)}><FileText size={16}/><span>查看关联作品</span><ArrowUpRight size={16}/></button>
   {parent&&<div className="parent-quote"><CornerDownRight size={14}/><div><small>回复 {parent.author}</small><p>{parent.text||'该评论未返回正文'}</p></div></div>}
   <blockquote><Quote size={16}/><div><p>{comment?(comment.text||'该评论未返回正文，无法判断观点'):work.summary}</p>{comment&&<cite>{comment.author}</cite>}</div></blockquote>
   {comment&&<div className="evidence-labels"><Badge tone={comment.type==='纠错线索'?'amber':'neutral'}>{comment.type}</Badge><span>{comment.sentiment} · {comment.target}</span></div>}
   {comment?.analysis&&<details className="feedback-model-note"><summary>模型判读说明</summary><p>{comment.analysis.reason}</p><small>{comment.analysis.model} · {displayDate(comment.analysis.generatedAt)}<br/>模型判断供复盘参考，不代表事实核实结论。</small></details>}
   {replies.length>0&&<details className="replies"><summary>展开 {replies.length} 条子评论</summary>{replies.map(r=><div key={r.id}>
    {onSelectFeedback?<button className="reply-preview" aria-label={'选择子评论：'+r.author} onClick={()=>onSelectFeedback(r.id)}><strong>{r.author}</strong><p>{r.text||'该评论未返回正文'}</p><span><Badge>{r.type}</Badge> {r.sentiment} · {r.target}</span></button>:<><strong>{r.author}</strong><small>{r.sentiment} · {r.target}</small><p>{r.text||'该评论未返回正文'}</p><Badge>{r.type}</Badge></>}
    <button className="text-link" disabled={followups.some(f=>f.feedbackId===r.id)} onClick={()=>onFollow(r.id)}>{followups.some(f=>f.feedbackId===r.id)?'已加入跟进':'加入待核实'}</button>
   </div>)}</details>}
   {comment&&<button className={'btn '+(followed?'quiet':'secondary')+' wide'} disabled={followed} onClick={()=>onFollow(id)}>{followed?<Check size={15}/>:<BookmarkPlus size={15}/>} {followed?'已加入跟进':'加入核实与跟进'}</button>}
   <details className="source-details"><summary>数据来源与原始字段</summary><p>作品 ID：{work.id}<br/>评论 ID：{comment?.id||'—'}<br/>观测：{displayDate(work.observedAt,true)}<br/>阅读量：{work.views??'未提供'}<br/>互动增量：{work.engagementDelta??'未提供'}<br/>已收录评论：{work.collectedComments??'未读取'}<br/>互动快照：{work.metricSnapshots?.length??0} 条</p>
    {!!work.metricSnapshots?.length&&<details><summary>查看互动快照记录</summary>{work.metricSnapshots.map((m,i)=><p key={i}>{displayDate(m.observedAt,true)} · {m.stage}<br/>点赞 {m.likes??'未提供'} / 评论 {m.comments??'未提供'} / 收藏 {m.favorites??'未提供'} / 转发 {m.shares??'未提供'}</p>)}</details>}
    <code>{work.url||'未提供 URL'}</code><small>URL 由数据源提供，请结合原文核对。</small>
   </details>
  </article>;
 })}</>;
}
export function EvidenceDrawer({data,onWork,onFollow,followups,ids,onClose}:{data:Dataset;onWork:(id:string)=>void;onFollow:(id:string)=>void;followups:Followup[];ids:string[];onClose:()=>void}){
 return <aside className="inline-evidence"><div className="section-heading"><div><span className="eyebrow">SOURCE EVIDENCE</span><h2>原文证据</h2></div><button className="icon-btn" onClick={onClose} aria-label="关闭原文证据"><X size={18}/></button></div><EvidenceBody {...{data,onWork,onFollow,followups,ids}}/><p className="footnote">分析结果需结合原文由编辑复核。</p></aside>;
}

export function FeedbackWorkbench({data,followups,onFollow,onWork,automaticRunning=false,automaticEnabled=true}:{data:Dataset;followups:Followup[];onFollow:(id:string)=>void;onWork:(id:string)=>void;automaticRunning?:boolean;automaticEnabled?:boolean}){
 const progress=data.meta?.feedbackAnalysis;const completed=data.feedback.filter(f=>f.analysis).length;const pending=data.feedback.length-completed;
 const [limit,setLimit]=useState(50);const [category,setCategory]=useState('全部');const [platform,setPlatform]=useState('全部平台');const [query,setQuery]=useState('');const [selected,setSelected]=useState('');const [expanded,setExpanded]=useState<Set<string>>(()=>new Set());
 const evidenceTarget=useRef<HTMLElement>(null);const detailId=useId();
 useEffect(()=>{setLimit(50);setSelected('')},[category,platform,query]);
 const index=useMemo(()=>new Map(data.feedback.map(f=>[f.id,f])),[data.feedback]);
 const works=useMemo(()=>new Map(data.works.map(w=>[w.id,w])),[data.works]);
 const threads=useMemo(()=>{
  const groups=new Map<string,{root:Feedback;comments:Feedback[]}>();
  for(const f of data.feedback){let root=f;const visited=new Set([f.id]);while(root.parentId&&index.has(root.parentId)&&!visited.has(root.parentId)){visited.add(root.parentId);root=index.get(root.parentId)!}const group=groups.get(root.id)||{root,comments:[]};group.comments.push(f);groups.set(root.id,group)}
  return [...groups.values()];
 },[data.feedback,index]);
 const matching=(f:Feedback)=>(category==='全部'||f.type===category)&&(!query.trim()||[f.text,f.author,f.target].join(' ').toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
 const visible=threads.filter(t=>(platform==='全部平台'||works.get(t.root.workId)?.platform===platform)&&t.comments.some(matching));
 const activeThread=visible.find(t=>t.comments.some(f=>f.id===selected))||visible[0];
 const current=activeThread?.comments.find(f=>f.id===selected)||(activeThread&&matching(activeThread.root)?activeThread.root:activeThread?.comments.find(matching));
 const shownCount=visible.reduce((n,t)=>n+t.comments.length,0);
 function choose(id:string){
  setSelected(id);const panel=evidenceTarget.current;if(!panel)return;
  panel.scrollTop=0;
  if(innerWidth<900){panel.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});panel.focus({preventScroll:true})}
 }
 function toggle(id:string,open:boolean){if(open&&activeThread?.root.id===id&&current?.id!==id)setSelected(id);setExpanded(old=>{const next=new Set(old);if(open)next.delete(id);else next.add(id);return next})}
 function renderComment(f:Feedback,reply=false){
  const w=works.get(f.workId);const parent=f.parentId?index.get(f.parentId):undefined;
  return <button type="button" className={'comment-select'+(reply?' is-reply':'')} data-feedback-id={f.id} aria-pressed={current?.id===f.id} aria-controls={detailId} onClick={()=>choose(f.id)}>
   <span className="message-meta"><span className="reader-avatar" aria-hidden="true">{f.author.slice(0,1)}</span><strong>{f.author}</strong><CommentDate value={f.at}/></span>
   {reply&&<span className="reply-indicator"><CornerDownRight size={12}/>回复 {parent?.author||'上一条评论'}</span>}
   <span className="comment-text">{f.text||'该评论未返回正文，无法判断观点'}</span>
   <span className="message-tags"><Badge tone={f.type==='纠错线索'?'amber':f.type==='正向反馈'?'green':'neutral'}>{f.type}</Badge><span className="comment-topic">{f.sentiment} · {f.target}</span><span className="comment-source">{w?.platform} · {w?.owner==='competitor'?'竞品':'自有'}</span></span>
  </button>;
 }
 return <div className="feedback-workspace">
  <div className="feedback-analysis-status" role="status" aria-live="polite" aria-busy={automaticRunning}><div><strong>{!data.feedback.length?'等待评论原文':automaticRunning&&pending?'模型正在分析':pending?'受众反馈待分析':'模型分析完成'}</strong><span>已分析 {completed} / {data.feedback.length} 条{pending>0&&' · 待分析 '+pending+' 条'}</span></div><p>{!data.feedback.length?'接入评论后自动分析':progress?.message?progress.message+(progress.retryAt?'（'+new Date(progress.retryAt).toLocaleTimeString('zh-CN')+' 后继续）':''):pending?(automaticRunning?'结合报道及父子评论分批判读':automaticEnabled?'等待下一轮自动分析':'自动观察已暂停'):'点击评论查看原文与模型判读'}</p>{pending>0&&<progress aria-label="评论模型分析进度" max={Math.max(1,data.feedback.length)} value={completed}/>}</div>
  <div className="inbox-tools"><SearchField value={query} onChange={setQuery} placeholder="搜索评论、疑问或观点"/><label className="select-field"><span className="sr-only">筛选评论平台</span><select aria-label="筛选评论平台" value={platform} onChange={e=>setPlatform(e.target.value)}>{['全部平台','抖音','微博','小红书','公众号'].map(p=><option key={p}>{p}</option>)}</select></label><span>{shownCount} 条评论及回复</span></div>
  <div className="inbox-layout">
   <nav className="inbox-folders" aria-label="反馈分类"><span className="eyebrow">反馈分类</span>{feedbackTypes.map(t=><button key={t} className={category===t?'selected':''} aria-pressed={category===t} onClick={()=>setCategory(t)}><span className={'category-dot cat-'+t}/><span>{t==='全部'?'全部反馈':t}</span><b>{t==='全部'?data.feedback.length:data.feedback.filter(f=>f.type===t).length}</b></button>)}<div className="folder-note"><MessageCircle size={15}/><p>点击评论阅读详情<br/>回复保留完整语境</p></div></nav>
   <section className="inbox-feed" aria-label="评论列表"><div className="feed-header"><strong>{category==='全部'?'全部反馈':category}</strong><Badge>{visible.length} 个讨论串</Badge></div>
    {visible.length?visible.slice(0,limit).map(thread=>{
     const children=thread.comments.filter(f=>f.id!==thread.root.id);const open=expanded.has(thread.root.id)||children.some(f=>f.id===current?.id);
     return <article key={thread.root.id} className={'inbox-message'+(activeThread?.root.id===thread.root.id?' thread-active':'')}>
      {renderComment(thread.root)}
      {children.length>0&&<><button className="thread-toggle" aria-expanded={open} onClick={()=>toggle(thread.root.id,open)}><ChevronDown size={13}/>{open?'收起':'展开'} {children.length} 条回复</button>{open&&<div className="thread-replies">{children.map(f=><div key={f.id}>{renderComment(f,true)}</div>)}</div>}</>}
     </article>;
    }):<div className="empty-state"><Search size={25}/><h3>{data.feedback.length?'没有匹配的反馈':'尚未收录评论原文'}</h3><p>{data.feedback.length?'尝试其他关键词、平台或分类。':'接入评论及子评论原文后即可分析受众反馈。'}</p><button className="btn secondary" onClick={()=>{setQuery('');setCategory('全部');setPlatform('全部平台')}}>清除筛选</button></div>}
    {visible.length>limit&&<button className="btn secondary load-more-comments" onClick={()=>setLimit(value=>value+50)}>继续显示讨论串（{Math.min(limit,visible.length)} / {visible.length}）</button>}
   </section>
   <aside id={detailId} className="inbox-evidence" ref={evidenceTarget} tabIndex={-1} aria-label="评论详情"><div className="section-heading"><h2>评论详情</h2><ExternalLink size={15}/></div>{current?<EvidenceBody key={current.id} ids={[current.id]} {...{data,onWork,onFollow,followups}} onSelectFeedback={choose}/>:<p className="footnote">点击评论查看关联作品、讨论语境与模型判读。</p>}</aside>
  </div>
 </div>;
}
