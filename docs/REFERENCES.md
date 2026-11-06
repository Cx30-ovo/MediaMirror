# 参考项目与设计映射

整理日期：2026-11-04；BettaFish 参考更新于 2026-11-06。

本文件基于此前调研资料梳理设计参考。2026-11-06 已读取 BettaFish 主分支 README、专项分析/论坛/报告相关源码与 LICENSE，具体适配见 [BettaFish 适配说明](BETTAFISH-ADAPTATION.md)。其余项目未在本轮重新验证，商业平台未登录实测。以下参考方向是本 Demo 的设计取舍，不代表这些平台提供相同实现。没有复制第三方项目源码。

| 参考 | 参考方向 | 本 Demo 的落点 | 后续注意 |
| --- | --- | --- | --- |
| [PulseLens](https://github.com/jack101154-lab/pulselens) | 可解释的分类、证据与人工核查 | 原文、分类、情绪对象并列；线索加入核实 | 中文标签需按编辑业务验证；模型判断需人工修正 |
| [FeedbackFlow](https://github.com/jamesmontemagno/feedbackflow) | 多来源统一反馈 | 作品、反馈、跟进记录分开建模 | 平台字段及组织权限需适配 |
| [C2HQ](https://github.com/rhay-repo/C2HQ) | 评论工作台 | 单篇作品内查看内容、评论及跟进 | 机构协作不同于个人创作者场景 |
| [BettaFish](https://github.com/666ghj/BettaFish) | 专项分析、论坛审阅、报告预算及结构校验 | 已实现报道/受众/媒体对照按数据运行，再审阅候选生成简报 | 最多4次模型调用；同模型复查不等于独立核验；仅借鉴思想 |
| [TrendRadar](https://github.com/ye-fearless/trendradar) | 外部话题观察与主题订阅 | 外部观察范围说明，暂未实施热点模块 | 热榜不能代表完整讨论量，避免重复采集 |
| [新榜](https://www.newrank.cn/) | 账号矩阵、同类内容观察 | 作品按平台与账号组织 | 不复制商业指数，不做无依据跨平台总排名 |
| [飞瓜数据](https://www.feigua.cn/home) | 作品表现下钻 | 从列表进入作品详情 | 商业与电商指标不直接适配新闻评馈 |
| [蝉妈妈](https://www.chanmama.com/) | 多维筛选与内容对比 | 平台、内容、反馈分类筛选 | 后续对标需保证平台、事件和观测窗口可比 |
| [蚁坊软件](https://www.eefung.com/) | 信息线索与事件跟进 | 纠错标签、人工核实与操作记录 | 关键词提醒不能直接作为舆情结论 |
| [Brandwatch](https://www.brandwatch.com/) | 围绕话题组织受众讨论 | 评论关联作品、情绪指向与业务类别 | 样本分析不能推断全部受众态度 |
| [Sprout Social](https://support.sproutsocial.com/hc/en-us/articles/115005498146-Introduction-to-Listening) | 反馈上下文与处理工作流 | 统一反馈列表与核实状态 | 此 Demo 不包含实际回复或发布能力 |

整体优先借鉴评论工作台、统一反馈模型与核实流程。账号评分、绩效考核、电商转化不纳入首版。任何代码复用前，需要单独检查对应版本许可证与依赖条件。
