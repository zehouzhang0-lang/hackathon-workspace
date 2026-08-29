# MoneyAI 接入记录（已被取代，保留追溯）

> **取代声明（2026-08-29）**：用户明确决定三页全部取消 MoneyAI 接入。AI 能力改为用户自配置的 OpenAI 兼容 API（页面底部「AI 设置」保存 base URL + API key + 模型名，key 只保存在本机后端 `server/ai-settings.json`，不回显、不入库）。本文档记录的 MoneyAI 核验事实与边界设计保留作历史追溯；其中所有“待接通 MoneyAI”的计划不再执行，REQ-17 的核心载体定位同时失效。取代后的新边界见下文「取代后的 AI 边界」与 [server/app.py](../../../server/app.py)、[demo/shared/ai.js](../../../demo/shared/ai.js)、[demo/shared/intake-extraction.js](../../../demo/shared/intake-extraction.js)。

## 已核验的本机事实（历史，2026-08-28）

| 事项 | 实际证据与限制 |
| --- | --- |
| 已安装并运行 | 本机MoneyAI-Agents 8.0.0-lite存在且进程运行；不能因当前工具目录没有MoneyAI MCP就说软件不存在 |
| 健康服务 | 当轮发现的两个loopback sidecar的`GET /health`均200/ok；项目后端对显式指定实例也已取得健康响应。端口是当轮运行信息，不是永久协议或账号授权 |
| 安装包接口线索 | 只读审查发现`POST /chat/send`、`GET /chat/stream`、`GET /sessions/:id`以及memory写入/检索相关路由；没有发送业务请求或读取个人会话内容 |
| 非只读风险 | 安装包的`GET /api/memory/items`可能迁移历史数据，不用它作“只读探测” |
| 伙伴资料 | 只使用已脱敏的[V0.4摘要](V04_REUSE.md)：伙伴报告过模型可调用，但不是本项目复测证据，也没有可直接启用的项目隔离/历史映射协议。未重新读取私人ZIP、原始聊天或凭据 |

健康接口只能证明对应进程响应，不能证明模型可用、费用获准、商家资料可发送或历史能正确读回。

## 已实现后又被取代的边界（2026-08-28 批次，已全部移除）

- 原项目服务 127.0.0.1 窄 API 保留三页静态服务与安全头；原 `/api/moneyai/*` 与 `/api/intake/extract` 路由已删除，调用它们返回 404。
- 原 `moneyai_adapter.py` 只接受显式 loopback HTTP 地址、健康查询不读取会话或 memory；该文件已删除。
- 原前端 `demo/shared/moneyai.js` 状态/分析入口已删除，页面不再查询 MoneyAI 状态。
- 当时的明确边界：业务通路全部 409 失败闭合（`sentToMoneyAI:false`），不假装接通；该语义由新的 `sentToExternal` 与「未配置即不外发」继承。

## 取代后的 AI 边界（2026-08-29 起生效）

1. 唯一外发路径：`POST /api/ai/chat`，转发到用户在「AI 设置」保存的 OpenAI 兼容 `/chat/completions`；未配置时返回 409，服务端不发出任何请求。
2. 第一页「整理」：本地优先——本机已解析的 CSV/JSON/XLSX 指标事实带精确文件定位直接填入九组草稿（`xlsx` 已成为草稿契约的合法文件来源）；仍空的文字字段在已配置 API 时发送描述与转写给模型补齐，每条值必须携带可在所发文字中找到的原文引文，否则丢弃；AI 失败或未配置时不影响本地结果，如实标注 mode=local/api 与 sentToExternal。
3. 第二页分析与第三页复盘仍为本机规则演示，未接外部模型；全部“本机结果”继续明确标注，不冒充真实模型分析或外部记忆。
4. 前端只请求同源项目后端；CSP `connect-src 'self'` 不变；key 不出后端、不进浏览器存储、不入 Git（`.gitignore` 已含 `server/ai-settings.json`）。

## 启用前还要完成（历史清单，随取代声明作废）

原清单（专用项目会话、费用与发送范围授权、AnalysisDraft 校验与历史读写验证等）针对 MoneyAI 路径，已随本文件一并作废；新 API 路径的剩余验收项是：真实浏览器走查「AI 设置 → 保存 → 测试连接 → 整理」全链路，以及用户自选提供商的真实联调。实际测试记录见[集成检查](QA_INTEGRATION.md)。
