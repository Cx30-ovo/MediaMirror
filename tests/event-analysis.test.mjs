import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { analyzeEvent, analysisCallCount, STAGE_FINDING_LIMIT } from '../server/event-analysis.mjs';

// Isolated fixtures; none are imported by the application or written to runtime data.
const work = (id, owner = 'self') => ({ id, title:'测试报道', body:'报道材料', platform:'微博', account:owner, owner });
const corpus = (full = false) => ({ event:{ id:'event-fixture',title:'测试事件',summary:'仅用于测试' }, works:full?[work('own'),work('rival','competitor')]:[work('own')],
  feedback:full?[{id:'comment',workId:'own',text:'测试问题'},{id:'reply',workId:'rival',text:'测试回复'}]:[],hotspots:[] });

async function fixture(t, modify = () => {}) {
  const requests = [];
  const server = createServer(async(req,res) => {
    let body='';for await(const chunk of req)body+=chunk;
    const request=JSON.parse(body);const payload=JSON.parse(request.messages[1].content.slice('DATA_JSON\n'.length));
    const id=request.messages[0].content.match(/^事件专项分析：(\w+)/)?.[1]; requests.push({id,payload,request});
    let output;
    const finding=(title,evidenceIds)=>({title,detail:'仅来自测试原文',evidenceIds});
    if(id==='content')output={contentSummary:[finding('报道要点',['W001'])],platformComparison:[],followups:[finding('具体跟进',['W001'])]};
    if(id==='audience')output={attention:[],questions:[finding('受众疑问',['C001'])],suggestions:[],disagreements:[],followups:[]};
    if(id==='competitor')output={comparison:[finding('同事件差异',['W001','W002'])]};
    if(id==='review')output={summary:'来自测试材料的摘要',acceptedIds:payload.candidates.filter(c=>c.category!=='followups').map(c=>c.id)};
    modify(id,output,payload);
    res.setHeader('Content-Type','application/json');res.end(JSON.stringify({choices:[{message:{content:JSON.stringify(output)},finish_reason:'stop'}]}));
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));
  return {requests,config:{modelBase:`http://127.0.0.1:${server.address().port}/v1`,model:'fixture',modelKey:'test-secret',maxTokens:6000,timeout:5000,tokenField:'max_tokens'}};
}

test('no comments or competitors: two calls, honest skips and reviewer selection only',async t=>{
 const {requests,config}=await fixture(t);const data=corpus();
 assert.equal(analysisCallCount(data),2);const result=await analyzeEvent(config,data);
 assert.deepEqual(requests.map(r=>r.id),['content','review']);assert.equal(result.pipeline.modelCalls,2);
 assert.equal(result.contentSummary[0].evidenceIds[0],'own');assert.deepEqual(result.followups,[]);assert.deepEqual(result.questions,[]);
 assert.deepEqual(result.pipeline.review,{candidates:2,retained:1,excluded:1});
 assert.deepEqual(result.pipeline.steps.map(s=>s.status),['completed','skipped','skipped','completed']);
 assert.equal(requests[0].request.max_tokens,6000);assert.ok(requests[1].request.max_tokens<=1600);
});

test('full evidence: four steps, short aliases, audience and both-media references restored',async t=>{
 const {requests,config}=await fixture(t);const data=corpus(true);const result=await analyzeEvent(config,data);
 assert.equal(analysisCallCount(data),4);assert.equal(requests.length,4);assert.equal(result.pipeline.modelCalls,4);
 assert.deepEqual(result.questions[0].evidenceIds,['comment']);assert.deepEqual(result.comparison[0].evidenceIds,['own','rival']);
 assert.equal(requests[0].payload.feedback.length,0);assert.equal(requests[1].payload.feedback[1].workId,'W002');
});

test('rejects invented candidate IDs, one-sided media comparison and unsupported audience evidence',async t=>{
 for(const fault of ['review','competitor','audience']) {
  const {config}=await fixture(t,(id,output)=>{
   if(id!==fault)return;
   if(id==='review')output.acceptedIds=['F999'];
   if(id==='competitor')output.comparison[0].evidenceIds=['W001'];
   if(id==='audience')output.questions[0].evidenceIds=['W001'];
  });
  await assert.rejects(analyzeEvent(config,corpus(true)),/不存在的候选|同时引用|评论原文/);
 }
});

test('oversized or cancelled tasks do not call the model',async t=>{
 const {requests,config}=await fixture(t);const data=corpus();data.works[0].body='长'.repeat(32001);
 await assert.rejects(analyzeEvent(config,data),/32000字符/);assert.equal(requests.length,0);
 const controller=new AbortController();controller.abort();await assert.rejects(analyzeEvent(config,corpus(),controller.signal),{name:'AbortError'});assert.equal(requests.length,0);
});

test('accepts fifteen findings per stage and preserves evidence through review',async t=>{
 const {requests,config}=await fixture(t,(id,output)=>{
  if(id==='content'){
   output.contentSummary=Array.from({length:10},(_,i)=>({title:`报道要点${i}`,detail:'来自测试报道',evidenceIds:['W001']}));
   output.platformComparison=Array.from({length:5},(_,i)=>({title:`平台侧重${i}`,detail:'来自测试报道',evidenceIds:['W001']}));
   output.followups=[];
  }
  if(id==='audience')output.questions=Array.from({length:15},(_,i)=>({title:`疑问${i}`,detail:'来自测试评论',evidenceIds:['C001']}));
  if(id==='competitor')output.comparison=Array.from({length:15},(_,i)=>({title:`差异${i}`,detail:'来自双方报道',evidenceIds:['W001','W002']}));
 });
 assert.equal(STAGE_FINDING_LIMIT,15);
 const result=await analyzeEvent(config,corpus(true));
 assert.equal(result.contentSummary.length+result.platformComparison.length,15);
 assert.equal(result.questions.length,15);assert.equal(result.comparison.length,15);
 assert.equal(result.pipeline.review.retained,45);
 assert.deepEqual(result.questions[14].evidenceIds,['comment']);
 assert.match(requests[0].request.messages[0].content,/合计最多15项/);
});

test('rejects sixteen findings both in a single array and across arrays',async t=>{
 for(const split of [false,true]){
  const {requests,config}=await fixture(t,(id,output)=>{
   if(id!=='content')return;
   const item={title:'测试要点',detail:'来自测试报道',evidenceIds:['W001']};
   output.contentSummary=Array.from({length:split?8:16},()=>item);
   output.platformComparison=Array.from({length:split?8:0},()=>item);output.followups=[];
  });
  await assert.rejects(analyzeEvent(config,corpus()),/最多15项|不能超过15项/);
  assert.equal(requests.length,1);
 }
});

test('expanded limits still reject invalid evidence beyond the former six-item cap',async t=>{
 const {config}=await fixture(t,(id,output)=>{
  if(id!=='content')return;
  output.contentSummary=Array.from({length:7},(_,i)=>({title:`要点${i}`,detail:'测试材料',evidenceIds:[i===6?'W999':'W001']}));
  output.followups=[];
 });
 await assert.rejects(analyzeEvent(config,corpus()),/不存在的证据/);
});
