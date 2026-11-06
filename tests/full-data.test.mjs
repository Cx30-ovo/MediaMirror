import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createDatasetLoader, mapWork } from '../server/data.mjs';
import { createIntegration } from '../server/integration.mjs';

const work=(platform,id)=>({platform,external_work_id:String(id),title:'隔离测试作品',account_name:'测试账号',content:'测试正文',last_seen_at:'2026-11-06',tags:'["民生","交通"]',view_count:0});
async function fixture(t,{broken=false,duplicate=false}={}) {
 const requests=[];let active=0,maxActive=0;
 const server=createServer(async(req,res)=>{
  const url=new URL(req.url,'http://localhost');requests.push(url.pathname+url.search);
  res.setHeader('Content-Type','application/json');
  if(url.pathname==='/api/works') {
   const platform=url.searchParams.get('platform');const offset=Number(url.searchParams.get('offset'));const limit=Number(url.searchParams.get('limit'));const total=platform==='douyin'?5:3;
   const data=Array.from({length:Math.min(limit,Math.max(0,total-offset))},(_,i)=>work(platform,duplicate&&offset?0:offset+i));
   res.end(JSON.stringify({ok:true,data,page:{total,count:data.length,offset,limit}}));return;
  }
  const [, , ,platform,id]=url.pathname.split('/');
  if(broken&&id==='2'){res.statusCode=503;res.end('{}');return;}
  active++;maxActive=Math.max(maxActive,active);await new Promise(resolve=>setTimeout(resolve,3));active--;
  const comment=(id,parent=null)=>({external_comment_id:id,parent_comment_id:parent,root_comment_id:'root',content:'测试评论原文',author_name:'测试作者',like_count:0});
  const comments=platform==='xhs'?[comment('root'),comment('child','root')]:[];
  res.end(JSON.stringify({ok:true,data:{...work(platform,id),comments,comment_total:comments.length,metric_snapshots:[{observed_at:'2026-11-06',stage:'first_seen',like_count:0,view_count:null}]}}));
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
 return {config:{dataBase:`http://127.0.0.1:${server.address().port}`,dataScope:'all',pageSize:2,loadDetails:true,detailConcurrency:2,timeout:5000},requests,getMaxActive:()=>maxActive};
}

test('all pages + details: complete records, isolated comment IDs, parent links, snapshots, bounded concurrency and cache',async t=>{
 const {config,requests,getMaxActive}=await fixture(t);const load=createDatasetLoader();
 const data=await load(config);assert.equal(data.works.length,14);assert.equal(data.feedback.length,6);assert.equal(data.feedback.filter(f=>f.parentId).length,3);
 assert.equal(new Set(data.feedback.map(f=>f.id)).size,6);assert.equal(data.meta.full,true);assert.equal(data.meta.snapshots,14);assert.equal(data.meta.detailsLoaded,14);
 assert.ok(data.meta.platforms.every(p=>p.loaded===p.total));assert.ok(getMaxActive()<=2);assert.ok(requests.some(r=>r.includes('offset=4')));
 assert.equal(data.works[0].views,0);assert.equal(data.works[0].topic,'民生 / 交通');assert.equal(data.works[0].metricSnapshots[0].views,null);
 const detailCalls=requests.filter(r=>r.startsWith('/api/works/')).length;
 const refreshed=await load(config);assert.equal(refreshed.meta.detailsFetched,0);assert.equal(requests.filter(r=>r.startsWith('/api/works/')).length,detailCalls);
 const ctrl=new AbortController();ctrl.abort();await assert.rejects(load(config,ctrl.signal),{name:'AbortError'});
});

test('does not treat repeated pages or failed details as complete data',async t=>{
 const repeated=await fixture(t,{duplicate:true});await assert.rejects(createDatasetLoader()(repeated.config),/分页期间数据发生变化/);
 const broken=await fixture(t,{broken:true});await assert.rejects(createDatasetLoader()(broken.config),/HTTP 503/);
});

test('string-encoded tags and large source IDs are preserved',()=>{
 const mapped=mapWork(work('douyin','9007199254740999999'),'douyin');assert.equal(mapped.id,'douyin:9007199254740999999');assert.equal(mapped.topic,'民生 / 交通');
});

test('hourly quota stops grouping after a committed batch and restores progress after restart',async t=>{
 const upstream=createServer(async(req,res)=>{
  const url=new URL(req.url,'http://localhost');res.setHeader('Content-Type','application/json');
  if(url.pathname==='/api/works'){
   const platform=url.searchParams.get('platform');const data=Array.from({length:10},(_,i)=>work(platform,i));
   res.end(JSON.stringify({ok:true,data,page:{offset:0,count:10,total:10,limit:10}}));return;
  }
  let body='';for await(const chunk of req)body+=chunk;
  const request=JSON.parse(body);const materials=JSON.parse(request.messages[1].content.slice('DATA_JSON\n'.length));
  res.end(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify({groups:[{title:'批次事件',summary:'测试材料',topic:'测试',workIds:materials.candidates.map(w=>w.id)}]})}}]}));
 });
 const listen=server=>new Promise(resolveListen=>server.listen(0,'127.0.0.1',()=>resolveListen(`http://127.0.0.1:${server.address().port}`)));
 const source=await listen(upstream);t.after(()=>new Promise(r=>upstream.close(r)));
 const root=await mkdtemp(resolve('work','batch-resume-test-'));
 await writeFile(resolve(root,'.env'),`DATA_API_BASE_URL=${source}\nDATA_SCOPE=latest\nDATA_LIMIT_PER_PLATFORM=10\nDATA_LOAD_DETAILS=false\nMODEL_BASE_URL=${source}/v1\nMODEL_NAME=fixture\nMODEL_API_KEY=fixture-secret\nMODEL_MAX_CALLS_PER_HOUR=1\n`);
 async function app(){const middleware=createIntegration(root);const server=createServer((req,res)=>void middleware(req,res,()=>res.end()));const base=await listen(server);t.after(()=>new Promise(r=>server.close(r)));return base;}
 const base=await app();await fetch(base+'/api/integration/data');
 const response=await fetch(base+'/api/integration/group-events',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
 assert.equal(response.status,200);const data=await response.json();assert.equal(data.events.length,1);assert.equal(data.events[0].workIds.length,12);
 const restarted=await app();const restored=await(await fetch(restarted+'/api/integration/data')).json();assert.equal(restored.events[0].workIds.length,12);assert.equal(restored.works.length,40);
});
