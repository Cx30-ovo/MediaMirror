import { useId, useState } from 'react';
import { ArrowRight, ArrowUpRight, Check, ChevronDown, FileText, GitCompareArrows, Layers, Link2, MessageCircle, Radio, Sparkles } from 'lucide-react';
import type { EventAnalysis, EventCorpus, Finding } from '../domain/events';
import { Badge } from './ReviewUI';

type Props={corpus:EventCorpus;report?:EventAnalysis;busy:boolean;enabled:boolean;onNavigate:(id:string)=>void;onEvidence:(ids:string[])=>void};
const generatedTime=(at:string)=>new Date(at).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false});
export function EventBrief({corpus,report,busy,enabled,onNavigate,onEvidence}:Props){
 const [expanded,setExpanded]=useState(false);const summaryId=useId();
 const platforms=[...new Set(corpus.works.map(w=>w.platform))];
 const commentCount=corpus.feedback.filter(f=>f.text.trim()).length;
 const competitorCount=corpus.works.filter(w=>w.owner==='competitor').length;
 const sections=report?[
  {key:'content',title:'报道要点',icon:FileText,items:report.contentSummary||[]},
  {key:'questions',title:'受众具体在问什么',icon:MessageCircle,items:report.questions},
  {key:'suggestions',title:'值得补充的报道',icon:Sparkles,items:report.suggestions},
  {key:'attention',title:'受众关注',icon:Radio,items:report.attention},
  {key:'disagreements',title:'主要观点与分歧',icon:GitCompareArrows,items:report.disagreements},
  {key:'comparison',title:'竞品报道与受众差异',icon:GitCompareArrows,items:report.comparison},
  {key:'platforms',title:'跨平台报道差异',icon:Layers,items:report.platformComparison||[]},
 ].filter(section=>section.items.length):[];
 const noAudience=!!report&&!report.questions.length&&!report.suggestions.length&&!report.attention.length&&!report.disagreements.length;
 function findings(items:Finding[],compact=false){return items.slice(0,3).map((finding,i)=><article className={'brief-finding'+(compact?' compact':'')} key={i}><div className="brief-finding-title">{compact&&<span className="brief-step">{String(i+1).padStart(2,'0')}</span>}<h4>{finding.title}</h4></div><p>{finding.detail}</p><button className="evidence-chip" onClick={()=>onEvidence(finding.evidenceIds)}><Link2 size={12}/>{finding.evidenceIds.length} 条原文证据<ArrowUpRight size={12}/></button></article>)}
 return <div className="agent-brief event-brief" aria-label="事件简报" tabIndex={0}>
  <section className="surface brief-overview">
   <header className="brief-heading"><div><div className="brief-kicker"><Badge>{corpus.event.topic}</Badge><span className={'brief-analysis-state'+(report?' ready':'')}>{report?<Check size={12}/>:<Sparkles size={12}/>} {report?'已分析 · 待复核':busy?'分析中':'待分析'}</span></div><h2>{corpus.event.title}</h2></div><button className="btn secondary brief-full-analysis" onClick={()=>onNavigate(corpus.event.id)}>完整分析<ArrowRight size={14}/></button></header>
   <div className="brief-metadata"><span><FileText size={13}/>{corpus.works.length} 篇报道</span><span><Layers size={13}/>{platforms.length} 个平台</span><span><MessageCircle size={13}/>{commentCount} 条有原文评论</span>{report&&<time dateTime={report.generatedAt}>更新于 {generatedTime(report.generatedAt)}</time>}</div>
   {report?<div className="brief-summary"><div className="brief-section-label"><Sparkles size={14}/>事件摘要</div><p id={summaryId} className={expanded?'expanded':report.summary.length>180?'collapsed':''}>{report.summary}</p>{report.summary.length>180&&<button className="brief-expand" aria-controls={summaryId} aria-expanded={expanded} onClick={()=>setExpanded(!expanded)}>{expanded?'收起摘要':'展开完整摘要'}<ChevronDown size={13}/></button>}</div>:<div className="brief-pending" role="status"><Sparkles size={17}/><p>{busy?'智能体正在整理事件简报，完成后自动更新。':enabled?'等待自动分析，完成后将在这里显示发现与建议。':'自动观察已暂停，可在上方恢复。'}</p></div>}
  </section>
  {report?<div className="brief-body"><div className="brief-main-findings">
   {sections.map(section=><section className="surface brief-findings-section" key={section.key}><div className="section-heading"><h3><section.icon size={15}/>{section.title}</h3><Badge>{section.items.length}</Badge></div>{findings(section.items)}{section.items.length>3&&<button className="text-link" onClick={()=>onNavigate(corpus.event.id)}>查看全部 {section.items.length} 条<ArrowRight size={12}/></button>}</section>)}
   <section className="surface brief-coverage" aria-label="分析范围与缺口"><div className="section-heading"><h3>分析范围与缺口</h3><Badge tone="outlined">当前样本</Badge></div><dl>
    <div><dt>报道覆盖</dt><dd>{platforms.join('、')||'暂无作品'} · {corpus.works.length} 篇报道</dd></div>
    <div><dt>受众反馈</dt><dd>{!commentCount?'暂无评论原文，无法判断受众疑问、建议或分歧。':noAudience?'已分析 '+commentCount+' 条原文，当前样本未形成可归纳的受众发现。':commentCount+' 条有原文评论，仅代表已收录样本。'}</dd></div>
    <div><dt>竞品对照</dt><dd>{!competitorCount?'未接入本事件竞品报道，暂不可比较媒体与受众差异。':competitorCount+' 篇竞品报道'+(!report.comparison.length?'，当前报告未形成可引用的差异结论。':'已纳入比较。')}</dd></div>
   </dl></section>
  </div><aside className="brief-next-actions"><section className="surface brief-followups"><div className="section-heading"><h3><ArrowUpRight size={16}/>建议跟进</h3><Badge tone="violet">{report.followups.length}</Badge></div>{report.followups.length?findings(report.followups,true):<p className="brief-neutral-note">当前报告暂无具体跟进建议，可继续观察新增报道和评论。</p>}{report.followups.length>3&&<button className="text-link" onClick={()=>onNavigate(corpus.event.id)}>查看全部建议<ArrowRight size={12}/></button>}<div className="brief-review-note">模型整理的观察与建议需结合证据核实。</div></section><button className="brief-source-action" onClick={()=>onEvidence(corpus.works.map(w=>w.id))}><FileText size={16}/><span><strong>查阅关联报道</strong><small>{corpus.works.length} 篇作品 · 回到原文核对</small></span><ArrowUpRight size={15}/></button></aside></div>:<section className="surface brief-coverage"><h3>当前可分析材料</h3><dl><div><dt>报道覆盖</dt><dd>{platforms.join('、')} · {corpus.works.length} 篇报道</dd></div><div><dt>受众原文</dt><dd>{commentCount?commentCount+' 条已收录评论':'尚无评论原文，后续分析仅基于报道材料。'}</dd></div><div><dt>竞品报道</dt><dd>{competitorCount?competitorCount+' 篇':'本事件尚未接入竞品报道。'}</dd></div></dl></section>}
 </div>;
}
