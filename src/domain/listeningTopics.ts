export const listeningTopics=['时政','民生','经济','科技','教育','健康','体育','文旅','文娱','三农','法治','政策文件','应急','环境生态'] as const;
export type ListeningTopic=typeof listeningTopics[number];

const rules:Array<{topic:ListeningTopic;match:RegExp}>=[
 {topic:'应急',match:/应急|预警|台风|暴雨|地震|灾害|救援|抢险|防汛|消防|火灾/},
 {topic:'政策文件',match:/政策|文件|条例|办法|实施意见|通知|通告|法规/},
 {topic:'法治',match:/法治|法律|司法|法院|检察|警方|公安|违法|犯罪|诈骗|治理|执法/},
 {topic:'三农',match:/三农|农业|农村|农民|乡村|粮食|种植|养殖|渔业/},
 {topic:'教育',match:/教育|学校|校园|招生|高考|中考|学生|教师|研学/},
 {topic:'健康',match:/健康|医疗|医院|疾病|癌|肿瘤|治疗|诊疗|疫苗|养生|卫生/},
 {topic:'体育',match:/体育|赛事|足球|篮球|排球|马拉松|奥运|运动员|退役/},
 {topic:'科技',match:/科技|人工智能|智能|科考|创新|航天|科研|技术|新质生产力/},
 {topic:'环境生态',match:/环境|生态|环保|气候|气象|天气|冷空气|降温|污染|保护区|生物多样性/},
 {topic:'文娱',match:/文娱|娱乐|电影|金鸡|影视|演员|明星|演唱会|音乐|综艺/},
 {topic:'文旅',match:/文旅|旅游|景区|景观|风景|游客|旅行|美食|饮食|非遗|博物馆|文化/},
 {topic:'经济',match:/经济|财经|金融|产业|金价|黄金|投资|彩票|中奖|贸易|进博会|消费|企业|营商/},
 {topic:'时政',match:/时政|政治|外交|国际|两岸|台海|关系|会议|政府|总书记|主席|总理|BBNJ/},
 {topic:'民生',match:/民生|交通|出行|住房|就业|公共服务|公交|巴士|线路|道路|路段|限行|站点|生活/},
];

// Keep source topics intact; these broad categories are only used for filtering.
export function classifyListeningTopic(topic:string,...titles:string[]):ListeningTopic|null {
 const explicit=topic.split(/\s*[/／、,，|]\s*/).find(value=>listeningTopics.includes(value as ListeningTopic));
 if(explicit)return explicit as ListeningTopic;
 return rules.find(rule=>rule.match.test(topic))?.topic
  ?? rules.find(rule=>rule.match.test(titles.join(' ')))?.topic
  ?? null;
}
