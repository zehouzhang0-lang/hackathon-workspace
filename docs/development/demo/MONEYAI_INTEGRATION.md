# MoneyAI：项目工作流与实际接入状态

更新：2026-08-28，落实[REQ-17](../CURRENT_BRIEF.md)。MoneyAI是数据分析、给出路径与记录历史决策的重要载体，前后端必须按这一角色建设；它不是后续可随意删掉的页脚标识。当前已实现项目后端边界，**尚未实现MoneyAI业务通路**。

## 已核验的本机事实

| 事项 | 实际证据与限制 |
| --- | --- |
| 已安装并运行 | 本机MoneyAI-Agents 8.0.0-lite存在且进程运行；不能因当前工具目录没有MoneyAI MCP就说软件不存在 |
| 健康服务 | 当轮发现的两个loopback sidecar的`GET /health`均200/ok；项目后端对显式指定实例也已取得健康响应。端口是当轮运行信息，不是永久协议或账号授权 |
| 安装包接口线索 | 只读审查发现`POST /chat/send`、`GET /chat/stream`、`GET /sessions/:id`以及memory写入/检索相关路由；没有发送业务请求或读取个人会话内容 |
| 非只读风险 | 安装包的`GET /api/memory/items`可能迁移历史数据，不用它作“只读探测” |
| 伙伴资料 | 只使用已脱敏的[V0.4摘要](V04_REUSE.md)：伙伴报告过模型可调用，但不是本项目复测证据，也没有可直接启用的项目隔离/历史映射协议。未重新读取私人ZIP、原始聊天或凭据 |

健康接口只能证明对应进程响应，不能证明模型可用、费用获准、商家资料可发送或历史能正确读回。

## 前后端衔接

| 工作流阶段 | 页面与共享层 | 项目后端及MoneyAI责任 |
| --- | --- | --- |
| 确认输入 | 第一页整理事实/来源/未知，保存round与inputVersion | 仅接收经过明确授权的必要摘要；原始附件不默认发送 |
| 分析与路径 | 第二页请求当前快照分析，显示真实来源和进行中/失败状态 | 专用MoneyAI项目会话完成分析，输出经校验的AnalysisDraft；原始模型叙述不直接视为证据 |
| 接受结果 | 校验round/inputVersion后用现有ANALYSIS_SET写入，ID由共享层分配 | 回传项目请求ID与真实来源，迟到结果不能换成新输入版本；失败不能静默返回演示答案 |
| 决策与取用 | 选择、查看、复制、下载分别记录；第三页不把取用记为执行 | 记录所选路径及当时输入/分析版本，不推断实际采用或执行 |
| 自愿反馈与历史 | FEEDBACK_SAVE先明确本地事务结果，再按授权同步必要历史 | 独立幂等写入回执；跨会话读回须实际核对round、path、artifact和执行/结果语义 |
| 下一轮 | 保留历史与当前未知，不用旧反馈填充首轮 | 专用项目空间读回正确历史；第二个合成商家的数据不得串入 |

现有`demo.v1`保持不变：`buildDemoAnalysis`/`buildDemoArtifact`仍是无副作用的本地演示生成器，不能在里面偷偷调用MoneyAI。真实模型输出只能经专用服务与完整schema验证进入`ANALYSIS_SET`；`mode=real_model`当前未启用。前端不直接访问本机MoneyAI管理端口，不保存其密钥。

## 本轮已实现的边界

- [项目服务](../../../server/app.py)在127.0.0.1提供三页及窄API；无目录列表，不服务仓库原件，业务POST限制Origin、JSON与请求大小。
- [适配器](../../../server/moneyai_adapter.py)只接受显式loopback HTTP地址；拒绝凭据、路径、查询和重定向。健康查询不读取会话或memory。
- [前端入口](../../../demo/shared/moneyai.js)只请求项目后端。健康的`serviceReachable`与`analysisReady`、`historyWriteReady`、`historyReadVerified`分开。
- `/api/moneyai/analysis`、`/api/moneyai/decisions`、`/api/moneyai/history/read`当前均返回409及`sentToMoneyAI:false`。这是未接通的明确边界，不是已完成分析/历史功能。
- REQ-25提取接口 `/api/intake/extract` 与 `shared/intake-extraction.js` 已落地：状态返回extractionReady=false，真实合成请求返回409/intake_unavailable/editable:true/sentToMoneyAI:false。客户端先查能力，无就绪或无明确模型/费用/材料授权时不POST原文；超时/丢回执不谎称未发送。成功结构必须绑定当前round/inputVersion及本次实际发送材料。
- 九组草稿/转写确认与MoneyAI提取分离：本机INTAKE_SET保存不等于AI理解或写入记忆，问题历史由QUESTION_SET独立保留；原始语音识别还须浏览器能力、用户主动开始和真实测试。
- 当前页面仍使用明确标注的本地生成器及IndexedDB。没有模型/记忆成功伪回执，没有把个人活跃对话当项目会话。

## 启用前还要完成

1. 使用本项目专用Agent/会话及独立历史空间，核对真实协议和所用模型；不复用用户当前个人对话。
2. 明确实际调用模型、可能费用、允许发送哪些合成或真实材料。当前健康检查不代表授权新增付费调用或外发商家原件。
3. 实现AnalysisDraft校验、来源映射、超时/迟到/失败重试；模型叙述、推断、事实和情景分开。后端同步须有可恢复的幂等请求标识。
4. 实际写入一条获准的合成决策，在新会话读回并核对，再用另一个合成商家验证隔离。分别保存“本地保存”“MoneyAI写入”“MoneyAI读回”的证据。
5. 通过后再启用对应页面工作流与real_model标识，不因health通过就隐藏未连接提示。

专用会话与真实模型/历史测试尚未完成；PC基础界面可并行推进，不把这项核心接入从后续队列删掉。实际测试记录见[集成检查](QA_INTEGRATION.md)。
