import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { mapWork, validateComments } from '../server/data.mjs';
import { validateReport, validateGroups } from '../server/model.mjs';
import { createIntegration } from '../server/integration.mjs';

const rawWork=(platform='weibo',id='90071992547409931234')=>({id:'db-'+id,platform,external_work_id:id,title:'同事件报道',account_name:'厦门广电',published_at:'2026-11-06T10:00:00+08:00',last_seen_at:'2026-11-06T11:00:00+08:00',content:'报道原文',like_count:0,comment_count:2,repost_count:3,collect_count:null,share_count:null,engagement_total:5,url:'https://weibo.com/example'});
const emptyReport=id=>({eventId:id,summary:'仅总结已收录作品，无评论原文。',attention:[],questions:[],suggestions:[],disagreements:[],comparison:[],followups:[],contentSummary:[],platformComparison:[]});

test('runtime has no sample dataset, deterministic report generator or sample fallback',()=>{
 assert.equal(existsSync('src/data/demo.ts'),false);assert.equal(existsSync('src/data/events.ts'),false);
 assert.ok(!readFileSync('src/services/analysis.ts','utf8').includes('demoAnalysisProvider'));
 assert.ok(!readFileSync('src/services/repository.ts','utf8').includes('demoData'));
});

test('preserves long IDs, zero versus null, platform-specific repost counts and source body',()=>{
 const work=mapWork(rawWork(),'weibo'); assert.equal(work.id,'weibo:90071992547409931234');assert.equal(work.metrics.likes,0);assert.equal(work.metrics.favorites,null);assert.equal(work.metrics.shares,3);assert.equal(work.body,'报道原文');
 assert.equal(mapWork({...rawWork(),like_count:undefined},'weibo').metrics.likes,null);
 assert.throws(()=>mapWork({...rawWork(),external_work_id:90071992547409931234},'weibo'),/必须是字符串/);
 assert.throws(()=>mapWork(rawWork('xhs'),'weibo'),/不匹配/);
 assert.equal(mapWork({...rawWork(),url:'javascript:alert(1)'},'weibo').url,undefined);
});

test('validates comment threads without inventing sentiment or classification',()=>{
 const works=[mapWork(rawWork(),'weibo')];const root={id:'comment1',workId:works[0].id,text:'什么时候开放？',author:'甲'};
 const feedback=validateComments([root,{...root,id:'comment2',parentId:'comment1'}],works);assert.equal(feedback[1].parentId,'comment1');assert.equal(feedback[0].type,'待分析');assert.equal(feedback[0].sentiment,'未分析');
 assert.throws(()=>validateComments([root,{...root,id:'comment2',parentId:'missing'}],works),/父子关系/);
 assert.throws(()=>validateComments([{...root,parentId:'comment2'},{...root,id:'comment2',parentId:'comment1'}],works),/父子关系/);
 assert.throws(()=>validateComments([root,root],works),/ID 重复/);
});

test('rejects unsupported audience findings and fictional evidence',()=>{
 const works=[mapWork(rawWork(),'weibo')];const corpus={event:{id:'event1'},works,feedback:[]};const report=emptyReport('event1');
 assert.equal(validateReport(report,corpus).mode,'remote');
 assert.throws(()=>validateReport({...report,questions:[{title:'受众疑问',detail:'猜测',evidenceIds:[works[0].id]}]},corpus),/评论原文/);
 assert.throws(()=>validateReport({...report,contentSummary:[{title:'摘要',detail:'猜测',evidenceIds:['fake']}]},corpus),/不存在/);
 assert.throws(()=>validateReport({...report,comparison:[{title:'竞品',detail:'猜测',evidenceIds:[works[0].id]}]},corpus),/未提供竞品/);
});

test('rejects duplicate or unknown model event membership',()=>{
 const candidates=[mapWork(rawWork(),'weibo')];const group={title:'事件',summary:'材料摘要',topic:'民生',workIds:[candidates[0].id]};
 assert.equal(validateGroups({groups:[group]},{events:[]},candidates).length,1);
 assert.throws(()=>validateGroups({groups:[{...group,workIds:[candidates[0].id,candidates[0].id]}]},{events:[]},candidates),/无效/);
 assert.throws(()=>validateGroups({groups:[{...group,existingEventId:'fake'}]},{events:[]},candidates),/不存在/);
});

const listen=server=>new Promise(resolve=>server.listen(0,'127.0.0.1',()=>resolve(`http://127.0.0.1:${server.address().port}`)));
test('local HTTP pipeline: four ten-item pages, model test, grouping, grounded analysis, persistence, no secret leaks',async t=>{
 const root=await mkdtemp(resolve('work','integration-test-'));let modelCalls=0;let invalid=false;let blockContent;let contentStarted;const requests=[];
 const upstream=createServer(async(req,res)=>{
  res.setHeader('Content-Type','application/json');const url=new URL(req.url,'http://localhost');
  if(url.pathname==='/api/works'){requests.push(Object.fromEntries(url.searchParams));const platform=url.searchParams.get('platform');res.end(JSON.stringify({ok:true,data:Array.from({length:10},(_,i)=>rawWork(platform,String(i))),page:{total:100,limit:10,offset:0,count:10}}));return;}
  if(url.pathname==='/v1/chat/completions'){
   modelCalls++;let body='';for await(const c of req)body+=c;const input=JSON.parse(body);let output;
   if(input.messages[0].content.startsWith('连接测试'))output={ok:true};
   else if(input.messages[0].content.startsWith('你是事件归并')){const materials=JSON.parse(input.messages[1].content.split('DATA_JSON\n')[1]);output={groups:[{title:'样本事件',topic:'民生',summary:'仅夹具样本',existingEventId:materials.existingEvents[0]?.id,workIds:materials.candidates.slice(0,2).map(w=>w.id)}]};}
   else {const corpus=JSON.parse(input.messages[1].content.split('DATA_JSON\n')[1]);
    if(input.messages[0].content.startsWith('事件专项分析：review'))output={summary:'仅总结已收录作品，无评论原文。',acceptedIds:corpus.candidates.map(f=>f.id)};
    else {if(blockContent){contentStarted();await blockContent;}output={contentSummary:[{title:'内容汇总',detail:'夹具报道内容',evidenceIds:[invalid?'fake':corpus.works[0].id]}],platformComparison:[],followups:[]};}
   }
   res.end(JSON.stringify({choices:[{message:{content:JSON.stringify(output)},finish_reason:'stop'}]}));return;
  }res.statusCode=404;res.end('{}');
 });
 const upstreamUrl=await listen(upstream);t.after(()=>new Promise(r=>upstream.close(r)));
 await writeFile(resolve(root,'.env'),`DATA_MODE=live\nDATA_SCOPE=latest\nDATA_LOAD_DETAILS=false\nDATA_API_BASE_URL=${upstreamUrl}\nDATA_LIMIT_PER_PLATFORM=10\nMODEL_BASE_URL=${upstreamUrl}/v1\nMODEL_NAME=test-model\nMODEL_API_KEY=fixture-secret\nMODEL_AUTO_ANALYZE=false\nMODEL_MAX_CALLS_PER_HOUR=12\n`);
 const startApp=async()=>{const middleware=createIntegration(root);const server=createServer((req,res)=>void middleware(req,res,()=>{res.statusCode=404;res.end()}));const base=await listen(server);t.after(()=>new Promise(r=>server.close(r)));return base};
 const base=await startApp();const request=async(path,body)=>{const response=await fetch(base+'/api/integration/'+path,body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return {status:response.status,body:await response.json()}};
 const status=await request('status');assert.equal(status.body.modelConfigured,true);assert.ok(!JSON.stringify(status).includes('fixture-secret'));assert.ok(!JSON.stringify(status).includes('modelKey'));
 const loaded=await request('data');assert.equal(loaded.body.works.length,40);assert.equal(loaded.body.feedback.length,0);assert.equal(loaded.body.events.length,0);assert.equal(new Set(loaded.body.works.map(w=>w.id)).size,40);assert.equal(requests.length,4);assert.ok(requests.every(r=>r.limit==='10'&&r.offset==='0'));assert.equal(modelCalls,0);
 assert.equal((await request('test-model',{})).status,200);assert.equal(modelCalls,1);
 assert.equal((await request('group-events',{automatic:true})).status,400);assert.equal(modelCalls,1);
 const grouped=await request('group-events',{});assert.equal(grouped.status,200);assert.equal(grouped.body.events.length,1);const eventId=grouped.body.events[0].id;const afterGroup=modelCalls;assert.equal(afterGroup,5);
 assert.equal((await request('analyze',{eventId:'fake'})).status,400);assert.equal(modelCalls,afterGroup);
 const report=await request('analyze',{eventId});assert.equal(report.status,200);assert.equal(report.body.contentSummary[0].evidenceIds[0],grouped.body.events[0].workIds[0]);assert.deepEqual(report.body.questions,[]);assert.equal(report.body.pipeline.modelCalls,2);assert.equal(modelCalls,afterGroup+2);
 invalid=true;assert.equal((await request('analyze',{eventId})).status,400);assert.equal(modelCalls,afterGroup+3);
 invalid=false;let release;blockContent=new Promise(r=>{release=r});const started=new Promise(r=>{contentStarted=r});
 const first=request('analyze',{eventId});await started;
 const overlapping=await request('analyze',{eventId});assert.equal(overlapping.status,400);assert.match(overlapping.body.error,/任务运行中/);
 release();assert.equal((await first).status,200);blockContent=null;assert.equal(modelCalls,afterGroup+5);
 // Requiring two calls with only one remaining must fail BEFORE paying for the first call.
 await writeFile(resolve(root,'.env'),readFileSync(resolve(root,'.env'),'utf8').replace('MODEL_MAX_CALLS_PER_HOUR=12','MODEL_MAX_CALLS_PER_HOUR=11'));
 const exhausted=await request('analyze',{eventId});assert.equal(exhausted.status,400);assert.match(exhausted.body.error,/需要 2 次.*剩余 1 次/);assert.equal(modelCalls,afterGroup+5);
 const resumed=await startApp();const restored=await (await fetch(resumed+'/api/integration/data')).json();assert.equal(restored.events[0].id,eventId);
 const crossSite=await fetch(base+'/api/integration/test-model',{method:'POST',headers:{Origin:'https://unrelated.example','Content-Type':'application/json'},body:'{}'});assert.equal(crossSite.status,403);
});
