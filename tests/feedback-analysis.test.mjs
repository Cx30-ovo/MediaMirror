import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { prepareFeedbackBatch, validateFeedbackResults, feedbackFingerprint, overlayFeedback, feedbackModelKey } from '../server/feedback-analysis.mjs';
import { createIntegration } from '../server/integration.mjs';
import { validateComments } from '../server/data.mjs';

const sample = () => ({ works: [{id:'weibo:900719925474099321234',title:'公园开放公告',body:'开放时间以最终公告为准'}],feedback:[
  {id:'parent',workId:'weibo:900719925474099321234',text:'什么时候开放？'},
  {id:'child',workId:'weibo:900719925474099321234',parentId:'parent',text:'我也想知道'}],meta:{namespace:'fixture'}});
const judgement = id => ({id,type:'信息疑问',sentiment:'中性',target:'开放时间',reason:'询问或追问开放时间。'});
test('missing source text retains thread IDs without inventing comment text or accepting a fabricated judgement',()=>{
  const data=sample();data.feedback[0].text='';data.feedback[0].textMissing=true;
  const raw=validateComments(data.feedback,data.works);assert.equal(raw[0].text,'');assert.equal(raw[1].parentId,'parent');
  assert.throws(()=>validateComments([{...data.feedback[0],textMissing:false}],data.works),/评论 text/);
  const batch=prepareFeedbackBatch(data);assert.equal(batch.material.comments[0].comment.missing,true);
  const {id:_id,...result}=judgement('C01');const config={model:'fixture'};
  const store={source:'fixture',modelKey:feedbackModelKey(config),entries:{parent:{fingerprint:feedbackFingerprint(data.feedback[0],data),result,generatedAt:new Date().toISOString()}}};
  assert.equal(overlayFeedback(data,store,config).feedback[0].analysis,undefined);
});
test('bounded comment payload preserves parent context and excludes long source identifiers',()=>{
  const data=sample();const batch=prepareFeedbackBatch(data);
  assert.equal(batch.targets[1].id,'child');assert.equal(batch.material.comments[1].ancestors[0].text,'什么时候开放？');
  assert.ok(!JSON.stringify(batch.material).includes('900719925474099321234'));
  data.feedback=Array.from({length:100},(_,i)=>({id:String(i),workId:data.works[0].id,text:'长'.repeat(8000)}));
  const bounded=prepareFeedbackBatch(data);assert.ok(bounded.targets.length>0&&bounded.targets.length<=20);assert.ok(JSON.stringify(bounded.material).length<=28000);assert.equal(bounded.material.comments[0].comment.truncated,true);
});
test('requires exactly one valid model judgement per target; ordinary/unclear discussion are valid',()=>{
  assert.equal(validateFeedbackResults({results:[judgement('C01')]},['C01']).length,1);
  for(const results of [[],[judgement('C02')],[judgement('C01'),judgement('C01')],[{...judgement('C01'),type:'待分析'}],[{...judgement('C01'),target:'长'.repeat(41)}]])assert.throws(()=>validateFeedbackResults({results},['C01']));
  for(const type of ['一般讨论','无法判断'])assert.equal(validateFeedbackResults({results:[{...judgement('C01'),type,sentiment:'无法判断'}]},['C01'])[0].type,type);
});
test('cache invalidates changed comment, ancestors, work context, model or source; ignores interactions',()=>{
  const data=sample();const config={model:'fixture'};const fp=feedbackFingerprint(data.feedback[1],data);
  const {id:_id,...result}=judgement('C01');const store={source:'fixture',modelKey:feedbackModelKey(config),entries:{child:{fingerprint:fp,result,generatedAt:new Date().toISOString()}}};
  const classified=overlayFeedback(data,store,config);assert.equal(classified.meta.feedbackAnalysis.completed,1);
  data.works[0].interactions=999;assert.equal(feedbackFingerprint(data.feedback[1],data),fp);
  for(const mutate of [d=>{d.feedback[0].text='另一个问题'},d=>{d.feedback[1].text='改了'},d=>{d.works[0].body='更正报道内容'}]){const changed=structuredClone(data);mutate(changed);assert.equal(overlayFeedback(changed,store,config).feedback[1].analysis,undefined)}
  assert.equal(overlayFeedback(classified,store,{model:'changed'}).feedback[1].type,'待分析');
  assert.equal(overlayFeedback(classified,{...store,source:'other'},config).feedback[1].type,'待分析');
});

const listen=server=>new Promise(r=>server.listen(0,'127.0.0.1',()=>r(`http://127.0.0.1:${server.address().port}`)));
test('HTTP auto-classification commits batches, respects shared quota, persists and resumes; malformed outputs never mark comments done',async t=>{
  let calls=0;let invalid=false;let block;let entered;
  const upstream=createServer(async(req,res)=>{
    res.setHeader('Content-Type','application/json');const url=new URL(req.url,'http://localhost');
    if(url.pathname==='/api/works'){
      const p=url.searchParams.get('platform');const data=p==='weibo'?[{platform:p,external_work_id:'1',title:'公园开放公告',content:'公告原文',account_name:'厦门广电',last_seen_at:'2026-11-06'}]:[];
      return res.end(JSON.stringify({ok:true,data,page:{offset:0,count:data.length,total:data.length}}));
    }
    if(url.pathname==='/comments')return res.end(JSON.stringify({ok:true,data:Array.from({length:25},(_,i)=>({id:'f'+i,workId:'weibo:1',text:i===1?'我也想知道':'什么时候开放？',parentId:i===1?'f0':undefined}))}));
    if(url.pathname==='/v1/chat/completions'){
      calls++;let text='';for await(const chunk of req)text+=chunk;const payload=JSON.parse(text);assert.match(payload.messages[0].content,/受众反馈逐条分析/);
      const material=JSON.parse(payload.messages[1].content.split('DATA_JSON\n')[1]);
      if(block){entered();await block;}
      const results=material.comments.map(c=>judgement(c.id));if(invalid)results.pop();
      return res.end(JSON.stringify({choices:[{message:{content:JSON.stringify({results})},finish_reason:'stop'}]}));
    }
    res.statusCode=404;res.end('{}');
  });const source=await listen(upstream);t.after(()=>new Promise(r=>upstream.close(r)));
  const root=await mkdtemp(resolve('work','feedback-test-'));
  const env=`DATA_API_BASE_URL=${source}\nDATA_LOAD_DETAILS=false\nDATA_COMMENTS_PATH=/comments\nMODEL_BASE_URL=${source}/v1\nMODEL_NAME=fixture\nMODEL_API_KEY=fixture-secret\nMODEL_AUTO_ANALYZE=true\nMODEL_MAX_CALLS_PER_HOUR=1\n`;
  await writeFile(resolve(root,'.env'),env);
  async function app(){const middleware=createIntegration(root);const server=createServer((req,res)=>void middleware(req,res,()=>res.end()));const base=await listen(server);t.after(()=>new Promise(r=>server.close(r)));return async(path,body)=>{const r=await fetch(base+'/api/integration/'+path,body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});assert.equal(r.status,200);return r.json()};}
  const request=await app();assert.equal((await request('data')).meta.feedbackAnalysis.pending,25);assert.equal(calls,0);
  const first=await request('classify-feedback',{automatic:true});assert.equal(first.meta.feedbackAnalysis.completed,20);assert.equal(first.feedback[1].parentId,'f0');
  const waiting=await request('classify-feedback',{automatic:true});assert.equal(waiting.meta.feedbackAnalysis.state,'waiting');assert.ok(waiting.meta.feedbackAnalysis.retryAt);assert.equal(calls,1);
  const refreshed=await request('data?refresh=1');assert.equal(refreshed.meta.feedbackAnalysis.completed,20);
  const resumed=await app();assert.equal((await resumed('data')).meta.feedbackAnalysis.completed,20);
  invalid=true;const failed=await resumed('classify-feedback',{automatic:true});assert.equal(failed.meta.feedbackAnalysis.completed,20);assert.equal(failed.meta.feedbackAnalysis.pending,5);assert.equal(failed.meta.feedbackAnalysis.state,'error');
  assert.ok(!(await readFile(resolve(root,'work/integration-feedback.json'),'utf8')).includes('fixture-secret'));
  await writeFile(resolve(root,'.env'),env.replace('PER_HOUR=1','PER_HOUR=0'));invalid=false;
  let release;block=new Promise(r=>{release=r});const started=new Promise(r=>{entered=r});
  const running=resumed('classify-feedback',{automatic:true});await started;
  const overlap=await resumed('classify-feedback',{automatic:true});assert.equal(overlap.meta.feedbackAnalysis.state,'waiting');release();
  assert.equal((await running).meta.feedbackAnalysis.completed,25);block=null;
  const before=calls;assert.equal((await resumed('classify-feedback',{automatic:true})).meta.feedbackAnalysis.pending,0);assert.equal(calls,before);
  const restored=await app();assert.equal((await restored('data')).meta.feedbackAnalysis.completed,25);
});
