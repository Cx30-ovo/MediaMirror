import type { AnalysisPipeline, EventAnalysis, EventCorpus, Finding } from '../domain/events';

export function validateAnalysis(raw:unknown,corpus:EventCorpus):EventAnalysis {
 if(!raw||typeof raw!=='object')throw new Error('分析结果格式不正确');
 const r=raw as Record<string,unknown>;
 const ids=new Set([...corpus.works.map(w=>w.id),...corpus.feedback.map(f=>f.id)]);
 const commentIds=new Set(corpus.feedback.map(f=>f.id));
 if(r.eventId!==corpus.event.id||typeof r.summary!=='string'||!r.summary.trim())throw new Error('分析结果事件不匹配或缺少摘要');
 const result:EventAnalysis={eventId:corpus.event.id,summary:r.summary,mode:'remote',generatedAt:typeof r.generatedAt==='string'&&Number.isFinite(Date.parse(r.generatedAt))?r.generatedAt:new Date().toISOString(),attention:[],questions:[],suggestions:[],disagreements:[],comparison:[],followups:[]};
 const keys=['attention','questions','suggestions','disagreements','comparison','followups','contentSummary','platformComparison'] as const;
 for(const key of keys){
  if(['contentSummary','platformComparison'].includes(key)&&r[key]===undefined)continue;
  const items=r[key];
  if(!Array.isArray(items)||items.length>30)throw new Error('分析结果数组格式不正确');
  result[key]=items.map((f:unknown):Finding=>{
   if(!f||typeof f!=='object')throw new Error('分析条目格式不正确');
   const v=f as Record<string,unknown>;
   if(typeof v.title!=='string'||!v.title.trim()||typeof v.detail!=='string'||!v.detail.trim()||!Array.isArray(v.evidenceIds)||!v.evidenceIds.length||v.evidenceIds.some(id=>typeof id!=='string'||!ids.has(id)))throw new Error('分析结果缺少有效证据引用，请检查分析服务返回值');
   if(['attention','questions','suggestions','disagreements'].includes(key)&&!v.evidenceIds.some(id=>commentIds.has(id)))throw new Error('受众分析缺少评论原文依据');
   return {title:v.title,detail:v.detail,evidenceIds:[...new Set(v.evidenceIds as string[])]};
  });
 }
 if(!corpus.works.some(w=>w.owner==='competitor')&&result.comparison.length)throw new Error('缺少竞品数据，无法生成对照结论');
 if(r.pipeline!==undefined){
  const p=r.pipeline as AnalysisPipeline;
  const integer=(v:unknown)=>typeof v==='number'&&Number.isInteger(v)&&v>=0;
  const expected=['content','audience','competitor','review'];
  if(!p||p.version!=='editorial-staged-v2'||!Array.isArray(p.steps)||p.steps.length!==4||p.steps.some((s,i)=>!s||s.id!==expected[i]||typeof s.label!=='string'||!['completed','skipped'].includes(s.status)||(s.status==='skipped'&&typeof s.reason!=='string'))||!integer(p.modelCalls)||p.modelCalls!==p.steps.filter(s=>s.status==='completed').length||p.modelCalls<2||p.modelCalls>4)throw new Error('分析步骤记录不完整');
  if(p.steps[0].status!=='completed'||p.steps[3].status!=='completed'||(p.steps[1].status==='completed')!==(corpus.feedback.length>0)||(p.steps[2].status==='completed')!==(corpus.works.some(w=>w.owner==='competitor')&&corpus.works.some(w=>w.owner!=='competitor')))throw new Error('分析步骤与实际数据不匹配');
  if(!p.coverage||p.coverage.works!==corpus.works.length||p.coverage.comments!==corpus.feedback.length||p.coverage.competitorWorks!==corpus.works.filter(w=>w.owner==='competitor').length||p.coverage.hotspots!==corpus.hotspots.length)throw new Error('分析数据覆盖范围不匹配');
  const retained=keys.reduce((sum,k)=>sum+(result[k]?.length||0),0);
  if(!p.review||![p.review.candidates,p.review.retained,p.review.excluded].every(integer)||p.review.retained!==retained||p.review.candidates!==p.review.retained+p.review.excluded)throw new Error('分析审阅记录不一致');
  result.pipeline={version:p.version,modelCalls:p.modelCalls,steps:p.steps.map(s=>({id:s.id,label:s.label,status:s.status,reason:s.status==='skipped'?s.reason:undefined})),coverage:{works:p.coverage.works,comments:p.coverage.comments,competitorWorks:p.coverage.competitorWorks,hotspots:p.coverage.hotspots},review:{candidates:p.review.candidates,retained:p.review.retained,excluded:p.review.excluded}};
 }
 return result;
}
