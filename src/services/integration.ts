import type { Dataset } from '../domain/types';
import type { AnalysisProvider } from '../domain/events';
import { validateAnalysis } from './analysis';

export interface IntegrationStatus { mode:'live'; dataConfigured:boolean; modelConfigured:boolean; model:string; dataScope:'all'|'latest'; pageSize:number; loadDetails:boolean; perPlatform:number; autoAnalyze:boolean; maxCalls:number; commentsConfigured:boolean; hotspotsConfigured:boolean; modelVersion:string }
export async function integrationRequest<T>(path:string, body?:unknown, signal?:AbortSignal):Promise<T> {
  const response=await fetch(`/api/integration/${path}`, {method:body===undefined?'GET':'POST',headers:body===undefined?undefined:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal});
  let result;try{result=await response.json()}catch{throw new Error('本地连接服务未启动，请使用 npm run dev 或 npm run preview 启动项目')}
  if(!response.ok){
    if(response.status===404)throw new Error('当前页面找不到融媒评馈分析服务，请从本项目的启动地址打开工作台（默认 http://127.0.0.1:5182/），再重试分析。');
    throw new Error(typeof result?.error==='string'?result.error:`连接服务返回 ${response.status}`);
  }
  return result as T;
}
export const getIntegrationStatus=()=>integrationRequest<IntegrationStatus>('status');
export const loadLiveData=(refresh=false)=>integrationRequest<Dataset>(`data${refresh?'?refresh=1':''}`);
export const groupLiveEvents=(automatic=false)=>integrationRequest<Dataset>('group-events',{automatic});
export const classifyLiveFeedback=(automatic=false)=>integrationRequest<Dataset>('classify-feedback',{automatic});

// Keep each request small and publish progress between batches; the next observation cycle resumes.
export async function runAutomaticIntake(loaded:Dataset,onProgress:(data:Dataset)=>void,shouldContinue=()=>true){
  let current=loaded;
  for(let batch=0;batch<6&&(current.meta?.feedbackAnalysis?.pending??0)>0;batch++){
    if(!shouldContinue())return current;
    const before=current.meta?.feedbackAnalysis?.completed??0;
    current=await classifyLiveFeedback(true);onProgress(current);
    if((current.meta?.feedbackAnalysis?.completed??0)<=before||current.meta?.feedbackAnalysis?.state==='error')break;
  }
  if((current.meta?.feedbackAnalysis?.pending??0)>0)return current;
  return shouldContinue()?groupLiveEvents(true):current;
}
export const localModelProvider=(automatic=false):AnalysisProvider=>({async analyze(corpus,signal){
  const raw=await integrationRequest<unknown>('analyze',{eventId:corpus.event.id,automatic},signal);
  return validateAnalysis(raw,corpus);
}});
