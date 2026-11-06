import type { EventAnalysis, EventCorpus, Finding } from '../domain/events';

export type AgentNotice = Finding & { id:string; eventId:string; kind:'纠错待核实'|'受众疑问'|'观点分歧'|'内容建议'|'报道差异'; at:string; read:boolean };
export type CachedReport = { fingerprint:string; report:EventAnalysis };
export const agentCacheKey='mediamirror.agent.v1';
// The complete serialized input is deliberately used: no hash collision can hide an input change.
export const fingerprint=(corpus:EventCorpus)=>JSON.stringify({analysisVersion:'live-editorial-v1',event:{...corpus.event,updatedAt:undefined},works:corpus.works.map(w=>({...w,observedAt:undefined})).sort((a,b)=>a.id.localeCompare(b.id)),feedback:[...corpus.feedback].sort((a,b)=>a.id.localeCompare(b.id)),hotspots:corpus.hotspots});
export function collectNotices(report:EventAnalysis,corpus:EventCorpus,previous:AgentNotice[]):AgentNotice[]{
 const candidates:{finding:Finding;kind:AgentNotice['kind']}[]=[
  ...report.followups.filter(f=>f.evidenceIds.some(id=>corpus.feedback.some(c=>c.id===id&&c.type==='纠错线索'))).map(finding=>({finding,kind:'纠错待核实' as const})),
  ...report.questions.map(finding=>({finding,kind:'受众疑问' as const})),
  ...report.disagreements.map(finding=>({finding,kind:'观点分歧' as const})),
  ...report.suggestions.map(finding=>({finding,kind:'内容建议' as const})),
  ...report.comparison.map(finding=>({finding,kind:'报道差异' as const})),
 ];
 const next=[...previous];
 for(const {finding,kind} of candidates){
  const id=JSON.stringify([report.eventId,kind,finding.title,finding.detail,[...finding.evidenceIds].sort()]);
  if(!next.some(n=>n.id===id))next.unshift({...finding,id,eventId:report.eventId,kind,at:report.generatedAt,read:false});
 }
 return next;
}
