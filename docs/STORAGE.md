# MongoDB 存储规划

按用户要求，后续新增数据库统一使用 MongoDB。当前尚未启用数据库，.env 的 MONGODB_URI、MONGODB_DATABASE 仅为预留项；填入不会自动迁移或写库。

当前临时保存：作品与评论为服务进程内快照；事件归属为 work/integration-events.json；报告、提醒与改进记录为浏览器存储。不能作为生产历史档案或跨设备数据源。

建议按以下集合扩展服务端 repository：

| 集合 | 内容与关键索引 |
| --- | --- |
| works | 真实作品、原文、账号和来源；(platform, external_work_id) 唯一索引，长 ID 保存为字符串 |
| comments | 原始评论与 parentId；(platform, external_comment_id) 唯一索引，workId/parentId 索引 |
| metric_snapshots | 每次实际观测的指标与 observedAt；(workId, observedAt) 唯一索引 |
| events | 事件标题、要素、归并版本、状态；不嵌入无限增长的全文评论数组 |
| event_work_links | 事件与作品关联、模型依据及人工纠正；(eventId, workId) 唯一索引 |
| analyses | 模型、提示词版本、输入指纹、结论、证据 ID 与覆盖范围；按 eventId/generatedAt 索引 |
| analysis_runs | 开始/结束时间、成功失败、调用量、错误类别与重试记录 |
| notices | 发现指纹、事件、证据与已读状态，指纹去重 |
| improvements | 编辑实际核实结论、内容变更、后续选题及复查记录 |

接口文档、采集与观测时间保留原始时区；业务查询统一转换。分析报告引用具体输入版本，保留纠错提示与已核实结论的区别。删除/失效评论须有状态标识，不能静默改写历史证据。

迁移时先引入存储接口，再将当前本地文件和浏览器记录按真实数据源导入；历史虚拟样本缓存不迁移。上线前补充认证、备份、保留期限与实际组织权限。
