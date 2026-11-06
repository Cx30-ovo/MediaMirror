import type { EventCorpus } from '../domain/events';
import type { Work } from '../domain/types';

export const editorialPlatforms=['抖音','微博','小红书','公众号'] as const;
export function platformGroups(corpus:EventCorpus){
 return editorialPlatforms.map(platform=>{const works=corpus.works.filter(w=>w.platform===platform);const feedback=corpus.feedback.filter(f=>works.some(w=>w.id===f.workId));return {platform,works,feedback}});
}
export function sumMetric(works:Work[],key:'likes'|'comments'|'favorites'|'shares'){
 const values=works.map(w=>w.metrics?.[key]).filter((v):v is number=>typeof v==='number');
 return {value:values.length?values.reduce((sum,v)=>sum+v,0):null,provided:values.length,total:works.length};
}
