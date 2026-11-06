import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { readConfig, publicConfig } from '../server/config.mjs';
import { createIntegration } from '../server/integration.mjs';

const listen=server=>new Promise(r=>server.listen(0,'127.0.0.1',()=>r(`http://127.0.0.1:${server.address().port}`)));
test('hourly quota defaults to unlimited; zero serializes accurately and a positive limit remains optional',async()=>{
 const root=await mkdtemp(resolve('work','unlimited-config-'));
 assert.equal(readConfig(root).maxCalls,0);
 await writeFile(resolve(root,'.env'),'MODEL_MAX_CALLS_PER_HOUR=0\n');assert.equal(publicConfig(readConfig(root)).maxCalls,0);
 await writeFile(resolve(root,'.env'),'MODEL_MAX_CALLS_PER_HOUR=12\n');assert.equal(readConfig(root).maxCalls,12);
 await writeFile(resolve(root,'.env'),'MODEL_MAX_CALLS_PER_HOUR=-1\n');assert.throws(()=>readConfig(root),/0–120/);
});

test('unlimited HTTP tasks exceed the former cap, finish multiple grouping batches and retain the shared lock',async t=>{
 let calls=0;let block;let entered;
 const upstream=createServer(async(req,res)=>{
  res.setHeader('Content-Type','application/json');const url=new URL(req.url,'http://localhost');
  if(url.pathname==='/api/works'){
   const platform=url.searchParams.get('platform');const data=Array.from({length:4},(_,i)=>({platform,external_work_id:String(i),title:'同一事件的夹具报道',content:'仅供隔离测试',account_name:'夹具账号'}));
   return res.end(JSON.stringify({ok:true,data,page:{offset:0,count:4,total:4}}));
  }
  if(url.pathname==='/v1/chat/completions'){
   calls++;let text='';for await(const chunk of req)text+=chunk;const input=JSON.parse(text);const system=input.messages[0].content;let output;
   if(block){entered();await block;}
   if(system.startsWith('连接测试'))output={ok:true};
   else {const material=JSON.parse(input.messages[1].content.split('DATA_JSON\n')[1]);
    if(system.startsWith('你是事件归并'))output={groups:[{title:'夹具事件',topic:'测试',summary:'同一夹具事件',workIds:material.candidates.map(w=>w.id),existingEventId:material.existingEvents[0]?.id}]};
    else if(system.startsWith('事件专项分析：review'))output={summary:'仅归纳夹具作品。',acceptedIds:material.candidates.map(f=>f.id)};
    else output={contentSummary:[{title:'内容汇总',detail:'夹具报道内容',evidenceIds:[material.works[0].id]}],platformComparison:[],followups:[]};
   }
   return res.end(JSON.stringify({choices:[{message:{content:JSON.stringify(output)},finish_reason:'stop'}]}));
  }
  res.statusCode=404;res.end('{}');
 });const source=await listen(upstream);t.after(()=>new Promise(r=>upstream.close(r)));
 const root=await mkdtemp(resolve('work','unlimited-http-'));
 await writeFile(resolve(root,'.env'),`DATA_API_BASE_URL=${source}\nDATA_SCOPE=latest\nDATA_LIMIT_PER_PLATFORM=4\nDATA_LOAD_DETAILS=false\nMODEL_BASE_URL=${source}/v1\nMODEL_NAME=fixture\nMODEL_API_KEY=fixture-secret\nMODEL_MAX_CALLS_PER_HOUR=0\n`);
 const middleware=createIntegration(root);const app=createServer((req,res)=>void middleware(req,res,()=>res.end()));const base=await listen(app);t.after(()=>new Promise(r=>app.close(r)));
 const request=async(path,body)=>{const response=await fetch(base+'/api/integration/'+path,body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return {status:response.status,body:await response.json()}};
 const status=await request('status');assert.equal(status.body.maxCalls,0);assert.ok(!JSON.stringify(status).includes('fixture-secret'));
 for(let i=0;i<16;i++)assert.equal((await request('test-model',{})).status,200);
 assert.equal(calls,16);await request('data');const grouped=await request('group-events',{});assert.equal(grouped.status,200);assert.equal(grouped.body.events.length,1);assert.equal(grouped.body.events[0].workIds.length,16);assert.equal(calls,18);
 const report=await request('analyze',{eventId:grouped.body.events[0].id});assert.equal(report.status,200);assert.equal(report.body.pipeline.modelCalls,2);assert.equal(calls,20);
 let release;block=new Promise(r=>{release=r});const started=new Promise(r=>{entered=r});const active=request('test-model',{});await started;
 const overlap=await request('test-model',{});assert.equal(overlap.status,400);assert.match(overlap.body.error,/任务运行中/);release();assert.equal((await active).status,200);assert.equal(calls,21);
});
