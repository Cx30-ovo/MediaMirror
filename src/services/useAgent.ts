import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Dataset, Work } from '../domain/types';
import type { EventAnalysis, EventCorpus } from '../domain/events';
import { localModelProvider } from './integration';
import type { IntegrationStatus } from './integration';
import { validateAnalysis } from './analysis';
import { agentCacheKey, collectNotices, fingerprint } from './agent';
import type { AgentNotice, CachedReport } from './agent';

export function loadPreferences(){try{const v=JSON.parse(localStorage.getItem('mediamirror.agent.preferences.v1')||'{}');return {enabled:v.enabled!==false,minutes:[1,5,15].includes(v.minutes)?v.minutes:5}}catch{return {enabled:true,minutes:5}}}
function loadCache(storageKey:string){try{const v=JSON.parse(localStorage.getItem(storageKey)||'{}');return v&&typeof v==='object'?v:{}}catch{return {}}}

export function useAgent(data:Dataset|null,status:IntegrationStatus|null,grouping=false){
 const autoReady=!!(status?.modelConfigured&&status.autoAnalyze);
 const storageKey=`${agentCacheKey}.live.${data?.meta?.namespace}.${status?.modelVersion}`;
 const events=data?.events||[]; const hotspots=data?.hotspots||[];
 const [preferences,setPreferences]=useState(loadPreferences);
 const [cache,setCache]=useState<Record<string,CachedReport>>({});
 const [notices,setNotices]=useState<AgentNotice[]>([]);
 const [hydrated,setHydrated]=useState(false);
 const [stateKey,setStateKey]=useState('');
 const [busy,setBusy]=useState(false);const [progress,setProgress]=useState('');
 const [lastChecked,setLastChecked]=useState('');const [nextCheck,setNextCheck]=useState('');const [error,setError]=useState('');
 const cacheRef=useRef(cache);cacheRef.current=cache;
 const runRef=useRef<AbortController|null>(null);
 const resolve=useCallback((w:Work)=>events.find(e=>e.workIds.includes(w.id))?.id,[events]);
 const corpora=useMemo<EventCorpus[]>(()=>data?events.map(event=>{const works=data.works.filter(w=>resolve(w)===event.id);return {event,works,feedback:data.feedback.filter(f=>works.some(w=>w.id===f.workId)),hotspots:hotspots.filter(h=>h.eventId===event.id)}}):[],[data,resolve]);
 const reports=useMemo(()=>Object.fromEntries(corpora.filter(c=>stateKey===storageKey&&cache[c.event.id]?.fingerprint===fingerprint(c)).map(c=>[c.event.id,cache[c.event.id].report])),[cache,corpora,stateKey,storageKey]);

 useEffect(()=>{if(!data)return;const saved=loadCache(storageKey);const valid:Record<string,CachedReport>={};
  for(const corpus of corpora){const entry=saved.cache?.[corpus.event.id];if(entry?.fingerprint===fingerprint(corpus)){try{const report=validateAnalysis(entry.report,corpus);if(entry.report.mode!=='remote'||typeof entry.report.generatedAt!=='string'||!Number.isFinite(Date.parse(entry.report.generatedAt)))continue;valid[corpus.event.id]={fingerprint:entry.fingerprint,report:{...report,mode:entry.report.mode,generatedAt:entry.report.generatedAt}}}catch{/* Invalid or stale evidence is not restored. */}}}
  setCache(valid);cacheRef.current=valid;
  setNotices(Array.isArray(saved.notices)?saved.notices.filter((n:AgentNotice)=>{if(!n||typeof n!=='object')return false;const corpus=corpora.find(c=>c.event.id===n.eventId);return typeof n.id==='string'&&typeof n.title==='string'&&typeof n.detail==='string'&&typeof n.at==='string'&&Number.isFinite(Date.parse(n.at))&&typeof n.read==='boolean'&&['纠错待核实','受众疑问','观点分歧','内容建议','报道差异'].includes(n.kind)&&Array.isArray(n.evidenceIds)&&n.evidenceIds.length>0&&n.evidenceIds.every(id=>corpus?.feedback.some(f=>f.id===id)||corpus?.works.some(w=>w.id===id))}):[]);
  setLastChecked(typeof saved.lastChecked==='string'?saved.lastChecked:'');setHydrated(true);setStateKey(storageKey);
 // Hydrate once when the repository first loads. Membership edits invalidate reports independently.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[data,storageKey]);
 useEffect(()=>{if(!hydrated||stateKey!==storageKey)return;try{localStorage.setItem(storageKey,JSON.stringify({cache,notices,lastChecked}))}catch{setError('浏览器存储空间不足，分析仍可查看，但本次结果未保存。')}},[cache,notices,lastChecked,hydrated,storageKey,stateKey]);
 useEffect(()=>{try{localStorage.setItem('mediamirror.agent.preferences.v1',JSON.stringify(preferences))}catch{setError('运行偏好未保存，请检查浏览器存储。')}},[preferences]);

 const scan=useCallback(async(force=false)=>{
  if(!hydrated||runRef.current||grouping)return;
  if((data?.meta?.feedbackAnalysis?.pending??0)>0){setProgress('优先整理待分析评论，完成后继续事件分析');return;}
  if(!autoReady){setError('请在数据与设置先单次测试模型；定时调用需要在 .env 开启 MODEL_AUTO_ANALYZE。');return;}
  const controller=new AbortController();runRef.current=controller;setBusy(true);setError('');setNextCheck('');
  let count=0;
  try{for(const corpus of corpora){if(controller.signal.aborted)break;
    const fp=fingerprint(corpus);if(!force&&cacheRef.current[corpus.event.id]?.fingerprint===fp)continue;
    if(corpus.works.length>40||corpus.feedback.length>100){setProgress(`事件材料较大，待分块分析 · ${corpus.event.title}`);continue;}
    setProgress(`整理事件与评论 · ${corpus.event.title}`);
    const report=await localModelProvider(true).analyze(corpus,controller.signal);
    if(controller.signal.aborted)break;
    const entry={fingerprint:fp,report};cacheRef.current={...cacheRef.current,[corpus.event.id]:entry};
    setCache(old=>({...old,[corpus.event.id]:entry}));setNotices(old=>collectNotices(report,corpus,old));count++;
   }
   if(!controller.signal.aborted){setLastChecked(new Date().toISOString());setProgress(count?`已更新 ${count} 个事件的分析，提醒已去重`:'已检查，当前样本无变化，保留已有分析');}
  }catch(e){if(!controller.signal.aborted)setError(e instanceof Error?e.message:'自动分析失败，可重新检查。')}
  finally{if(runRef.current===controller){runRef.current=null;setBusy(false)}}
 },[corpora,hydrated,autoReady,grouping,data?.meta?.feedbackAnalysis?.pending]);

 useEffect(()=>{if(!preferences.enabled||!hydrated||!autoReady||grouping){setNextCheck('');return;}
  void scan();
  return()=>{runRef.current?.abort();runRef.current=null;setBusy(false)};
 },[preferences.enabled,preferences.minutes,hydrated,scan,autoReady,grouping]);
 useEffect(()=>{if(preferences.enabled&&autoReady&&!busy&&hydrated)setNextCheck(new Date(Date.now()+preferences.minutes*60000).toISOString());else setNextCheck('')},[preferences.enabled,preferences.minutes,busy,lastChecked,hydrated,autoReady]);
 useEffect(()=>()=>{runRef.current?.abort()},[]);

 function saveReport(report:EventAnalysis){const corpus=corpora.find(c=>c.event.id===report.eventId);if(!corpus)return;const entry={fingerprint:fingerprint(corpus),report};setCache(old=>({...old,[report.eventId]:entry}));setNotices(old=>collectNotices(report,corpus,old))}
 async function analyzeEvent(id:string){const corpus=corpora.find(c=>c.event.id===id);if(!corpus||runRef.current)throw new Error('请等待当前任务完成');const controller=new AbortController();runRef.current=controller;setBusy(true);try{const report=await localModelProvider().analyze(corpus,controller.signal);if(!controller.signal.aborted)saveReport(report)}finally{if(runRef.current===controller){runRef.current=null;setBusy(false)}}}
 const activeNoticeIds=new Set(corpora.flatMap(c=>reports[c.event.id]?collectNotices(reports[c.event.id],c,[]).map(n=>n.id):[]));
 const activeNotices=notices.filter(n=>activeNoticeIds.has(n.id)).sort((a,b)=>Number(b.kind==='纠错待核实')-Number(a.kind==='纠错待核实')||Number(a.read)-Number(b.read)||b.at.localeCompare(a.at));
 return {reports,corpora,notices:activeNotices,busy:busy||grouping,progress,lastChecked,nextCheck,error,autoReady,analyzeEvent,enabled:preferences.enabled&&autoReady,minutes:preferences.minutes,resolve,scan,
  setEnabled:(enabled:boolean)=>setPreferences(old=>({...old,enabled})),setMinutes:(minutes:number)=>setPreferences(old=>({...old,minutes})),
  markRead:(id:string)=>setNotices(old=>old.map(n=>n.id===id?{...n,read:true}:n)),markAllRead:()=>setNotices(old=>old.map(n=>({...n,read:true}))),
 };
}
export type AgentState=ReturnType<typeof useAgent>;
