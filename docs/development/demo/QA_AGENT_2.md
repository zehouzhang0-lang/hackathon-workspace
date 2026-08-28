# Agent 2｜第二页前置核验与交接

日期：2026-08-28。核验起点：`b4b0ab8`。负责页面：经营路径与决策依据。

**当前结论：前置核验已完成，页面尚未开工，P2 功能与视觉验收均未执行。** 本次用户要求“阅读提示词，推进项目内容”，按第二页任务接收；不把这句话扩展为批准三页全部提案、选定视觉或允许修改共享底座。

## 1. 本次范围与文件归属

- 本次只新增本文件 `docs/development/demo/QA_AGENT_2.md`，记录依赖、实际检索和待验收项。
- 后续页面文件仍限定为 `demo/02-decisions.html`、`demo/pages/decisions.css`、`demo/pages/decisions.js`、`demo/pages/report.js`；本次均未创建。
- 未修改公共基线、READY、共享契约、其他页面或本机 MCP 配置；未安装组件、初始化工程、启动服务、提交、推送或部署。
- 开始时 `git status --short` 为空；核验期间发现其他工作新增 `QA_AGENT_1.md`、`QA_AGENT_3.md`，保持原样，不纳入本页交付。

已阅读 [开发入口](../README.md)、[需求基线](../CURRENT_BRIEF.md)、[资料收件区](../inbox/README.md)、[第二页任务](PROMPT_AGENT_2.md)、[第二页讨论](../../PAGE_TWO_DISCUSSION.md)、[Demo 入口](README.md)、[共享契约](SHARED_CONTRACT.md)、[视觉简报](DESIGN_BRIEF.md)、[验收矩阵](QA_MATRIX.md) 与 [MCP 约定](MCP_SETUP.md)。收件区当前登记为 V0.4 复用边界，不将历史包内方案升级为已批准需求。

## 2. 开工门槛的实际状态

| 项目 | 本次观察 | 对第二页的影响 |
| --- | --- | --- |
| 本页任务下发 | 用户本轮已要求读取 Agent 2 提示词并推进 | 只承接第二页，不代表其余门槛获批；不代改公共 `AGENTS_DISPATCHED` |
| Demo 范围 | 入口 `DEMO_SCOPE_APPROVED=否` | 原生三页、单选及 HTML 报告等 Demo 取舍仍需统筹登记批准 |
| 统一视觉 | 入口 `VISUAL_APPROVED=否`；视觉简报明确没有批准母版 | 没有可忠实实现或比较的参考，不能由本页另选主题 |
| 共享底座 | 入口 `SHARED_READY=否`；`demo/` 实际不存在 | 不能导入状态、导航、公共壳和分析生成器；不创建替代模块 |
| 契约版本 | `demo.v1` 提案，有接口文字，无模块实现 | 尚不能声称接口、存储或版本校验已通过 |
| 设计资源 MCP | 当前会话 21st、React Bits 均实际检索成功 | 本次无需因旧会话记录而重复配置；资源未安装或集成 |

通过 `Test-Path -LiteralPath` 逐项核对，以下预期路径均不存在：`demo/shared/tokens.css`、`base.css`、`shell.js`、`state.js`、`navigation.js`、`demo-data.js`，以及 `demo/samples/`、`demo/tests/`、`demo/assets/design/`。本地 HTTP 服务未启动；契约提议的同源地址尚未验证，不提供可用预览链接。

## 3. 设计资源的实际只读检索

| 调用与参数 | 实际结果 | 第二页可参考用途 |
| --- | --- | --- |
| `mcp__21st__search`，`query=tabs`、`type=component`、`limit=2` | 成功；Tabs，ID `4086`（sean0205）、`11641`（coss.com） | 路径查看切换及当前查看状态；不能用切换代替明确选路 |
| `mcp__21st__search`，`query=accordion`、`type=component`、`limit=2` | 成功；Accordion，ID `23530`（ddoemonn）、`1530`（shadcn） | 来源与反面证据的分层展开；关键风险仍需直接可见 |
| `mcp__reactbits__get_project_registries({})` | 成功；返回 `@shadcn`、`@react-bits` | 验证当前连接确实能发现注册表 |
| `mcp__reactbits__search_items_in_registries`，`registries=[@react-bits]`、`query=FadeContent`、`limit=2` | 成功；共 16 个匹配，返回 `FadeContent-JS-CSS`、`FadeContent-TS-CSS` | 查看内容切换时的轻量反馈候选；是否采用由统一母版决定 |

边界：只读取元信息，未调用 21st 的付费源码接口，未下载源码、安装依赖或核验候选组件的实际视觉、许可证及无障碍行为。React Bits 返回的安装提示含 `[object Promise]`，未将其视为可执行命令。检索通过不代表原生 HTML 可直接使用 React 组件，也不代表组件已获选。

已读取 Build Web Apps 的 `frontend-app-builder`、`shadcn`，及 Product Design 的 `index` 和相关流程约束。当前没有已选视觉或运行页面，因此未进入生图、模板初始化、页面实现或浏览器视觉验收；遵守项目的纯 HTML/CSS/ES modules 范围，不照技能示例运行框架安装。

## 4. 给统筹的最小依赖请求

以下是开工所需交接信息，不是本页自行新增的接口或产品决定。

| 请求 | 需要统筹交付或明确的内容 | 缺少时会影响什么 |
| --- | --- | --- |
| 范围与视觉 | 登记用户对 Demo 取舍的确认；提供已批准第二页参考及共享 token/控件说明，更新 READY | 无法判断实现目标或核验三页风格一致 |
| 可运行共享底座 | 交付契约中的六个最小共享文件，附契约版本、同源启动方式和 SHARED_READY 的实际测试记录 | `loadSession`、`dispatch`、`subscribeSession`、`mountShell`、`navigateTo`、`buildDemoAnalysis` 均无法调用 |
| 路径与报告数据 schema | 为 `cost`、`risk`、`evidenceRefs`、`counterEvidence`，以及 `estimate` 的假设/算式/值、`experiment` 提供类型、未知值约定及有效样例 | 页面与报告可能各自猜字段，导致来源、成本、结果错配 |
| 完整业务树 schema | 明确根节点识别、节点/边字段、条件与证据关联，以及损坏/不支持结构的判定 | 不能可靠证明页面与离线报告覆盖全部经营分支 |
| 订阅、生成与定位 | 明确 `subscribeSession` 回调参数、`buildDemoAnalysis` 返回及错误形式、`sourceId` 对应材料/事实/字段的规则 | 跨标签更新、失败恢复和返回第一页纠错无法一致衔接 |
| 导出边界与事件 | 明确允许导出的必要摘要范围、`download_requested` 的 `refs` 示例，以及报告是否需要持久记录；不由本页推定附件全部可分享 | 不能自行猜隐私白名单或增加报告状态；请求下载不能冒充落盘成功 |
| 可重复测试入口 | 提供契约约定的三种种子、命令样例与存储/分析失败注入方法 | 无法复现有限分析、冲突、过期、写入失败与跨页状态；本页不造第二套案例注册表 |

这些缺口经第二名只读审查者独立核对；已对照契约原文复核。公共文件由统筹处理，本页不抢建。

## 5. 第二页验收状态

全部为**未执行**，不是功能通过，也不是已实现功能的失败记录。待依赖就绪后沿用原编号，不追加一套验收标准。

| 编号 | 待执行的关键检查 | 当前缺少的条件 |
| --- | --- | --- |
| P2-01 | 已确认输入承接、直达空态、0/1/多路径 | 共享会话、生成器与页面 |
| P2-02 | 路径/结果/证据/风险/树联动，来源纠错，跨页补问额度 | 完整路径 schema、来源定位和第一页 |
| P2-03 | 情景复算、未知/零分母/口径冲突降级、增量不可估 | 共享估算数据及可复核算式 |
| P2-04 | 完整业务树、键盘与窄屏顺序阅读 | 树 schema、实际页面与视觉参考 |
| P2-05 | 实际下载并重新打开 HTML，离线/打印、安全转义及完整树 | 导出许可边界、当前版本快照与报告实现 |
| P2-06 | 查看/下载/选择分离，写入成功才跳转，执行保持未知 | 共享命令、事件 schema 和第三页 |
| P2-07 | 其他标签更新、旧版禁选禁导出、返回改选保留历史 | 版本失效、订阅、历史与跨页实现 |
| P2-08 | 读写/分析/导出失败；桌面/窄屏/键盘/焦点/减少动效 | 失败注入、实际运行页面及已批准参考 |

未做浏览器点击、截图、控制台、离线、打印或下载落盘检查；没有生成截图，不提供不存在的截图路径。浏览器工具是否可用本轮未核验，不把没有页面误报为浏览器缺失。

## 6. 已运行检查与下一步

| 命令或操作 | 结果与边界 |
| --- | --- |
| `git status --short` | 开始时工作区干净；后续识别并保留其他页面的 QA 文件 |
| `git rev-parse --short HEAD` | `b4b0ab8` |
| `Test-Path -LiteralPath` | 第 2 节所列共享、样例、测试、设计路径均不存在 |
| `python scripts/verify_demo_content.py` | 写入前通过 841 项；写入后的一次全仓库运行通过 922 项内容检查，15 项验收定义的素材路径有效。计数包含其他页面并行新增的文档，不是第二页功能测试数 |
| `git diff --check` | 写入前后均退出 0，无空白错误；普通 diff 不覆盖未跟踪的新文件 |
| `git diff --no-index --check -- /dev/null docs/development/demo/QA_AGENT_2.md` | 退出 1（与空文件有差异），没有空白问题诊断；未单凭此退出码判定通过 |
| Python 内联文本检查 | 通过本文件的 UTF-8 读取、逐行尾随空白、末尾换行和 NUL 检查；未新建测试脚本 |

上述静态检查不验证 UI、模型、MoneyAI 记忆、授权、报告下载、存储或经营效果。本文件的相对链接已由内容检查覆盖，空白另行核验；检查期间其他页面新增的文件未作本页代码审查或提交。

下一步由统筹确认范围与统一视觉、交付并验证共享底座及上述 schema；READY 满足后，本页按既定四个应用文件继续实现。当前不替统筹更新门槛，不自动进入第一页、第三页或真实后端开发。
