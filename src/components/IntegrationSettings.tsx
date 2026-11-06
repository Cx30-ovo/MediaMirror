import { useRef, useState } from 'react';
import { ArrowRight, Check, Database, RefreshCw, Sparkles, PlugZap } from 'lucide-react';
import type { Dataset } from '../domain/types';
import type { AgentState } from '../services/useAgent';
import type { IntegrationStatus } from '../services/integration';
import { getIntegrationStatus, groupLiveEvents, integrationRequest, loadLiveData } from '../services/integration';
import { Badge } from './ReviewUI';
import '../integration.css';

type Props={data:Dataset|null;status:IntegrationStatus|null;agent:AgentState;onData:(data:Dataset)=>void;onStatus:(status:IntegrationStatus)=>void;onEvent:(id:string)=>void};
export function IntegrationSettings({data,status,agent,onData,onStatus,onEvent}:Props){
 const [busy,setBusy]=useState('');const [error,setError]=useState('');const [message,setMessage]=useState('');const [eventId,setEventId]=useState('');
 const lock=useRef(false);
 const events=data?.events||[];const selected=events.some(e=>e.id===eventId)?eventId:events[0]?.id||'';
 async function run(kind:string,task:()=>Promise<string>){if(lock.current)return;lock.current=true;setBusy(kind);setError('');setMessage('');try{setMessage(await task())}catch(e){setError(e instanceof Error?e.message:'测试失败，请检查配置')}finally{setBusy('');lock.current=false}}
 const disabled=!!busy||agent.busy;
 return <section className="surface source-section integration-panel" aria-label="数据接入与模型分析">
  <div className="section-heading"><div><span className="eyebrow">LIVE CONNECTION / ALL RECORDS</span><h2><PlugZap size={18}/>数据接入与模型分析</h2></div><Badge tone="green">真实数据模式</Badge></div>
  <p className="section-description">分页接入当前接口全部作品、已采集评论与互动快照，模型按事件分批分析。配置文件：项目根目录 <code>.env</code>。</p>
  <div className="integration-steps">
   <article><span className="integration-step-number">01</span><h3>读取全部数据</h3><p>抖音、微博、小红书、公众号分页读取，每页最多 {status?.pageSize||200} 条；详情最多 4 个并发。不会触发上游采集任务。</p><button className="btn secondary" disabled={disabled} onClick={()=>void run('data',async()=>{const next=await getIntegrationStatus();onStatus(next);const loaded=await loadLiveData(true);onData(loaded);return `读取成功：${loaded.works.length} 篇作品，${loaded.feedback.length} 条评论及回复。`})}><Database size={15}/>{busy==='data'?'正在读取全部数据…':'同步全部数据'}</button></article>
   <article><span className="integration-step-number">02</span><h3>测试模型连接</h3><p>{status?.modelConfigured?`已配置 ${status.model}，尚需请求验证。`:'填写 MODEL_BASE_URL、MODEL_NAME 和 MODEL_API_KEY。'}本步骤仅发送一句连接测试。</p><button className="btn secondary" disabled={disabled} onClick={()=>void run('model',async()=>{const next=await getIntegrationStatus();onStatus(next);const result=await integrationRequest<{message:string}>('test-model',{});return result.message})}><PlugZap size={15}/>{busy==='model'?'正在测试…':'测试模型连接'}</button></article>
   <article><span className="integration-step-number">03</span><h3>识别同一事件</h3><p>每轮处理最多40篇未归并作品，每批12篇。分批保存进度，未归并作品继续在信息流展示。</p><button className="btn secondary" disabled={disabled||!data||!status?.modelConfigured} onClick={()=>void run('group',async()=>{const grouped=await groupLiveEvents();onData(grouped);return `当前 ${grouped.events?.length||0} 个事件，仍有 ${grouped.works.filter(w=>!grouped.events?.some(e=>e.workIds.includes(w.id))).length} 篇待归并；后续批次继续处理。`})}><Sparkles size={15}/>{busy==='group'?'正在归并…':'继续分批归并'}</button></article>
   <article><span className="integration-step-number">04</span><h3>分析单个事件</h3><p>分别梳理报道、受众及竞品，再审阅证据生成简报。缺数据自动跳过，每个事件最多4次模型调用。</p><label className="integration-event-picker"><span className="sr-only">选择测试事件</span><select aria-label="选择测试事件" value={selected} onChange={e=>setEventId(e.target.value)}><option value="" disabled>请先归并事件</option>{events.map(e=><option key={e.id} value={e.id}>{e.title}</option>)}</select></label><button className="btn primary" disabled={disabled||!selected||!status?.modelConfigured} onClick={()=>void run('analyze',async()=>{await agent.analyzeEvent(selected);return '分析完成，已通过事件与证据引用校验，可查看结果并核对原文。'})}><Sparkles size={15}/>{busy==='analyze'?'正在分析…':'测试单个事件分析'}</button>{selected&&<button className="text-link" onClick={()=>onEvent(selected)}>查看事件<ArrowRight size={13}/></button>}</article>
  </div>
  {busy&&<p className="integration-running" role="status"><RefreshCw size={14} className="agent-spin"/>{busy==='data'?'正在分页读取作品、评论与快照，首次全量加载可能需要几十秒，请保持页面打开。':'正在处理，请稍候；当前步骤完成前不会重复发送请求。'}</p>}
  {error&&<p className="error-message" role="alert">{error}</p>}{message&&<p className="success-message" role="status"><Check size={15}/>{message}</p>}
  {data?.meta&&<><div className="integration-loaded"><span>已载入 {data.works.length} 篇作品</span><span>{data.feedback.length} 条评论及子评论原文</span><span>{data.hotspots?.length||0} 条热点</span><span>{data.meta.snapshots||0} 条互动快照</span><span>{events.length} 个事件</span><span>{data.works.filter(w=>!events.some(e=>e.workIds.includes(w.id))).length} 篇待归并</span></div>{data&&<p className="footnote">{data.meta.scope} · 读取时间 {new Date(data.meta.loadedAt).toLocaleString('zh-CN')}</p>}{data.meta.platforms&&<div className="integration-platforms">{data.meta.platforms.map(p=><div key={p.platform}><strong>{p.platform}</strong><span>已读取 {p.loaded} / {p.total??'未知'} 篇</span><Badge tone={p.loaded?'green':'amber'}>{p.loaded?'已接入':'暂无样本'}</Badge></div>)}</div>}{data.meta.warnings.map(w=><p className="integration-warning" key={w}>{w}</p>)}</>}
  <details className="integration-help"><summary>如何配置模型与自动分析</summary><p>在项目根目录的 .env 填写服务地址、模型名和密钥，保存后点击“测试模型连接”。当前支持兼容 Chat Completions 的服务，地址应填写到 /v1 等服务前缀，不包含 /chat/completions。</p><p>单次测试会调用你配置的模型。查看结果后，将 MODEL_AUTO_ANALYZE=true，即可在工作台恢复定时分析；页面打开时会按间隔重新读取全部数据、归并新作品并分析变化事件，{status?.maxCalls?`本地每小时最多调用 ${status.maxCalls} 次。`:'本地未设置每小时调用次数上限。'}关闭页面后不运行。</p><p>当前已接入微博、小红书详情中的已采集评论及子评论；抖音、公众号仅有评论统计数。竞品与热点接口尚未提供。接入说明见 docs/LIVE-INTEGRATION.md。</p></details>
 </section>;
}
