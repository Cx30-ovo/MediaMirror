# 模型接口与分析约定

模型地址、名称、密钥从根目录 .env 服务端读取。当前兼容 Chat Completions 请求，连接入口统一为 /api/integration/*。不再提供前端演示分析器或第三方端点输入框。

- GET /api/integration/status：配置是否齐全，不返回密钥。
- GET /api/integration/data：获取当前真实小批量数据；refresh=1 重新读取。
- POST /api/integration/test-model：只发送一句连接测试。
- POST /api/integration/group-events：按实际作品归并同一事件。
- POST /api/integration/analyze：传入 eventId，服务端取出该事件材料并调用模型。

分析返回 eventId、summary，以及 attention、questions、suggestions、disagreements、comparison、followups、contentSummary、platformComparison 数组。每条发现为 {title, detail, evidenceIds}。ID 必须来自本次事件的作品或评论；受众分析必须引用评论原文。没有评论或竞品时相应数组为空。

原始数据内的指令只作为研究材料，不得改变分析任务。评论疑问不是报道错误，负面事件情绪不是对报道不满。校验 ID 不能保证语义正确，结果须结合来源判断。

完整配置、兼容性、限制和评论/热点后续约定见 [真实接入说明](LIVE-INTEGRATION.md)。

## 分步骤分析更新（2026-11-06）

当前事件分析按报道梳理、受众反馈、媒体对照、证据审阅四个角色顺序运行，缺少评论或双方作品会跳过对应步骤。保留原有报告字段，新增 pipeline 记录数据覆盖、执行步骤与候选发现筛选数量。服务端管理模型调用与证据校验，前端再次校验覆盖记录；单事件2至4次调用，完整流程开始前检查额度。新流程缓存版本独立，旧单步报告不会自动冒充新流程结果。具体预算、参考来源及限制见 [BettaFish 适配说明](BETTAFISH-ADAPTATION.md)。
