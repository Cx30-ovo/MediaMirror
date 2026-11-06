import type { Dataset, Platform, Work } from '../domain/types';
import type { EventCorpus } from '../domain/events';
import { classifyListeningTopic, type ListeningTopic } from '../domain/listeningTopics';

export const listeningPlatforms=['抖音','微博','小红书','公众号','百度','今日头条'] as const;
export type ListeningPlatform=typeof listeningPlatforms[number];
export type ListeningScope='全部来源'|'自有矩阵'|'竞品报道'|'外部热点';
export interface ListeningEntry {
 id:string; sourceId:string; workId?:string; target?:string; eventId?:string; eventTitle:string; topic:string; category:ListeningTopic|null;
 kind:'作品'|'评论'|'热点'; platform:ListeningPlatform; owner:'self'|'competitor'|'hotspot';
 title:string; text:string; source:string; at:string; label:string; evidenceIds:string[]; searchText:string;
}
export function buildListeningEntries(data:Dataset,corpora:EventCorpus[]):ListeningEntry[]{
 const eventForWork=(workId:string)=>corpora.find(c=>c.works.some(w=>w.id===workId))?.event;
 const works=data.works.map(w=>{const event=eventForWork(w.id);return {id:`work:${w.id}`,sourceId:w.id,workId:w.id,eventId:event?.id,eventTitle:event?.title||'暂未归入事件',topic:event?.topic||w.topic,category:classifyListeningTopic(event?.topic||w.topic,event?.title||'',w.title),kind:'作品' as const,platform:w.platform,owner:w.owner==='competitor'?'competitor' as const:'self' as const,title:w.title,text:w.summary,source:w.account,at:w.publishedAt,label:w.angle||w.topic,evidenceIds:[w.id],searchText:[w.title,w.body,w.summary,w.account,event?.title,event?.topic].join(' ')}});
 const comments=data.feedback.flatMap(f=>{const w=data.works.find(w=>w.id===f.workId);if(!w)return [];const event=eventForWork(w.id);return [{id:`comment:${f.id}`,sourceId:f.id,workId:w.id,target:f.target,eventId:event?.id,eventTitle:event?.title||'暂未归入事件',topic:event?.topic||w.topic,category:classifyListeningTopic(event?.topic||w.topic,event?.title||'',w.title),kind:'评论' as const,platform:w.platform,owner:w.owner==='competitor'?'competitor' as const:'self' as const,title:f.text,text:`${f.parentId?'子评论 · ':''}${f.target} · ${f.sentiment}（${f.analysis?'模型已分析':'原始评论待分析'}）`,source:`${w.account} · ${f.author}`,at:f.at,label:f.type,evidenceIds:[f.id],searchText:[f.text,f.target,w.title,w.account,event?.title,event?.topic].join(' ')}]});
 const hotspots=(data.hotspots||[]).map(h=>{const c=corpora.find(c=>c.event.id===h.eventId);return ({id:`hotspot:${h.id}`,sourceId:h.id,eventId:c?.event.id,eventTitle:c?.event.title||'暂未归入事件',topic:c?.event.topic||'热点背景',category:classifyListeningTopic(c?.event.topic||'',c?.event.title||'',h.title),kind:'热点' as const,platform:h.platform,owner:'hotspot' as const,title:h.title,text:'外部热榜背景线索；不是自有作品，不代表事实核验或完整讨论量。',source:h.platform,at:h.observedAt,label:'热点背景',evidenceIds:[],searchText:[h.title,c?.event.title,c?.event.topic].join(' ')} as ListeningEntry)});
 return [...works,...comments,...hotspots].sort((a,b)=>b.at.localeCompare(a.at));
}
export function filterListening(entries:ListeningEntry[],filters:{query:string;scope:ListeningScope;platform:string;date:string;topic:string}){
 const query=filters.query.trim().toLocaleLowerCase();
 return entries.filter(e=>(!query||e.searchText.toLocaleLowerCase().includes(query))&&(filters.scope==='全部来源'||e.owner===(filters.scope==='自有矩阵'?'self':filters.scope==='竞品报道'?'competitor':'hotspot'))&&(filters.platform==='全部平台'||e.platform===filters.platform)&&(filters.date==='全部样本日期'||e.at.startsWith(filters.date))&&(filters.topic==='全部主题'||e.category===filters.topic));
}
export function editorialClues(entries:ListeningEntry[]){
 const comments=entries.filter(e=>e.kind==='评论'&&['信息疑问','内容建议','服务诉求','纠错线索'].includes(e.label));
 const groups=new Map<string,{id:string;eventId?:string;eventTitle:string;label:string;target:string;entries:ListeningEntry[]}>();
 for(const entry of comments){const target=entry.target||entry.label;const id=JSON.stringify([entry.eventId||entry.workId||entry.sourceId,entry.label,target]);const group=groups.get(id)||{id,eventId:entry.eventId,eventTitle:entry.eventTitle,label:entry.label,target,entries:[]};group.entries.push(entry);groups.set(id,group)}
 return [...groups.values()].sort((a,b)=>Number(b.label==='纠错线索')-Number(a.label==='纠错线索')||b.entries.length-a.entries.length);
}
export function matrixAccounts(works:Work[]){
 const groups=new Map<string,{id:string;platform:Platform;account:string;works:Work[]}>();
 for(const work of works.filter(w=>w.owner!=='competitor')){const id=JSON.stringify([work.platform,work.account]);const group=groups.get(id)||{id,platform:work.platform,account:work.account,works:[]};group.works.push(work);groups.set(id,group)}
 return [...groups.values()];
}

