import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

async function moduleUrl(path) {
 const source=await readFile(new URL(path,import.meta.url),'utf8');
 const code=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
 return `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
}
const topicsUrl=await moduleUrl('../src/domain/listeningTopics.ts');
const {classifyListeningTopic}=await import(topicsUrl);
const listeningUrl=await moduleUrl('../src/services/listening.ts');
const listeningCode=Buffer.from(listeningUrl.split(',')[1],'base64').toString().replace('../domain/listeningTopics',topicsUrl);
const {buildListeningEntries,filterListening}=await import(`data:text/javascript;base64,${Buffer.from(listeningCode).toString('base64')}`);

test('broad topics recognize source tags and use headlines when tags are missing',()=>{
 assert.equal(classifyListeningTopic('厦门往返漳州新线路来了 / 民生快讯 / 民生'),'民生');
 assert.equal(classifyListeningTopic('文化活动/电影节'),'文娱');
 assert.equal(classifyListeningTopic('未分类','厦门市肿瘤医院开展乳腺癌术后放疗'),'健康');
 assert.equal(classifyListeningTopic('气象预报','台风预警'),'环境生态');
 assert.equal(classifyListeningTopic('气象预警','台风即将登陆'),'应急');
 assert.equal(classifyListeningTopic('未分类','无可识别的题材'),null);
});

test('comments inherit the work category and filters retain original topics',()=>{
 const data={works:[{id:'w1',title:'厦门医院开展新疗法',topic:'未分类',summary:'',account:'厦门广电',publishedAt:'2026-11-06',platform:'抖音'}],feedback:[{id:'c1',workId:'w1',text:'请问在哪里预约？',at:'2026-11-06'}],hotspots:[{id:'h1',title:'台风预警发布',observedAt:'2026-11-06',platform:'百度'}]};
 const entries=buildListeningEntries(data,[]);
 const filters={query:'',scope:'全部来源',platform:'全部平台',date:'全部样本日期',topic:'健康'};
 assert.deepEqual(filterListening(entries,filters).map(e=>e.kind).sort(),['作品','评论']);
 assert.ok(entries.filter(e=>e.workId==='w1').every(e=>e.topic==='未分类'));
 assert.equal(filterListening(entries,{...filters,topic:'应急'})[0].kind,'热点');
 assert.equal(filterListening(entries,{...filters,topic:'全部主题'}).length,3);
});
