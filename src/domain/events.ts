import type { Feedback, Work } from './types';
export interface EditorialEvent { id:string; title:string; summary:string; topic:string; updatedAt:string; workIds:string[]; }
export interface Hotspot { id:string; eventId:string; platform:'百度'|'今日头条'; title:string; observedAt:string; position:number|null; url?:string; }
export interface EventCorpus { event:EditorialEvent; works:Work[]; feedback:Feedback[]; hotspots:Hotspot[]; }
export interface Finding { title:string; detail:string; evidenceIds:string[]; }
export interface AnalysisPipeline {
 version:'editorial-staged-v2'; modelCalls:number;
 steps:{id:'content'|'audience'|'competitor'|'review';label:string;status:'completed'|'skipped';reason?:string;durationMs?:number;outputTokenLimit?:number}[];
 coverage:{works:number;comments:number;competitorWorks:number;hotspots:number};
 review:{candidates:number;retained:number;excluded:number};
}
export interface EventAnalysis {
 eventId:string; generatedAt:string; mode:'remote'; summary:string;
 attention:Finding[]; questions:Finding[]; suggestions:Finding[]; disagreements:Finding[];
 comparison:Finding[]; followups:Finding[];
 contentSummary?:Finding[]; platformComparison?:Finding[];
 pipeline?:AnalysisPipeline;
}
export interface AnalysisProvider { analyze(corpus:EventCorpus,signal?:AbortSignal):Promise<EventAnalysis>; }
