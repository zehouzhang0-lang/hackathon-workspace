# Agent 1｜第一页启动预检与交接

日期：2026-08-28。检查基点：`b4b0ab8`；开始及写入前的 `git status --short` 均为空。

**本轮已完成文档核对、设计资源 MCP 只读检索与启动缺口整理；页面尚未实现，功能验收未执行。** 本记录不修改公共 READY 状态，不代表批准技术或视觉提案。

## 1. 本次请求与实际范围

用户本次请求是“阅读提示词，推进项目内容”，指向 [PROMPT_AGENT_1.md](PROMPT_AGENT_1.md)。据此推进第一页任务的启动预检；不把提示词内的待审方案视为用户已经批准的决定，也不扩展到第二、第三页或共享底座开发。

已读根目录 [AGENTS.md](../../../AGENTS.md)、[开发入口](../README.md)、[需求基线](../CURRENT_BRIEF.md)、[Demo 入口](README.md)、[共享契约](SHARED_CONTRACT.md)、[视觉简报](DESIGN_BRIEF.md)、[验收矩阵](QA_MATRIX.md)、[第一页规格](../../PAGE_ONE_SPEC.md)、[收件登记](../inbox/README.md)、[V0.4 复用边界](V04_REUSE.md) 和 [MCP 约定](MCP_SETUP.md)。未读取或运行伙伴包原件。

- 本 Agent 唯一新增文件：`docs/development/demo/QA_AGENT_1.md`。
- 第一页职责仍是问题描述、资料接收、同页整理与来源纠错、确认本轮范围；不产生原因诊断、经营路径、报告或执行反馈。
- 未修改需求基线、READY 表、共享契约、公共文件或其他页面；未安装依赖、修改 MCP 配置、生成视觉母版、启动服务、接入模型或发送商家材料。
- 本轮仅为文档与预检记录，没有应用代码的 Git 提交、推送或同步操作。

## 2. 启动条件核对

| 条件 | 实际观察 | 结论 |
| --- | --- | --- |
| 提示词就绪 | 入口 `PROMPTS_READY=是`，第一页职责及归属明确 | 可用于预检，不等于可以实施 |
| Demo 范围批准 | 入口 `DEMO_SCOPE_APPROVED=否`；原生 HTML、本地解析/保存等仍标待审 | 待用户确认、统筹登记 |
| 统一视觉批准 | `VISUAL_APPROVED=否`，视觉简报无批准母版路径 | 阻塞；第一页不得另选主题 |
| 共享模块就绪 | `SHARED_READY=否`，文件系统中没有 `demo/` | 阻塞；不是只差文档更新 |
| 本页任务请求 | 本轮已收到用户推进第一页提示词的请求；公共 `AGENTS_DISPATCHED` 仍为否 | 本记录保留请求事实，由统筹更新公共派发状态；不推定其他门槛获批 |
| 设计资源预检 | 两个服务均可发现并实际检索，见下节 | 本轮检索通过；未集成组件 |

`Test-Path -LiteralPath` 实测：`demo/`、`demo/shared/`、`demo/samples/`、`demo/tests/`、`demo/README.md` 均不存在；`rg --files` 所列文件亦未包含应用页面。

缺少的共享交付包括：

- `demo/shared/tokens.css`、`base.css`、`shell.js`、`state.js`、`navigation.js`、`demo-data.js`，以及固定公开 API 的实现与 schema 示例命令。
- 已批准的共同视觉参考和第一页状态参考；布局、字号、控件、焦点及减弱动效规范。
- `demo/samples/` 的标准 CSV/TXT/JSON、解析说明；完整合成资料、仅一句描述、时间/渠道冲突三种种子。
- 共享事务、Blob 保存/删除/读回、版本失效、补问额度、幂等与失败注入的测试记录。

现有 [床底收纳箱素材](../../../fixtures/underbed-storage.demo.json) 是历史合成素材，不是已经实现的 `demo.v1` 会话适配、三种种子或上传解析样例；不能直接把其预编写下一轮反馈导入首轮。

## 3. 本轮 MCP 实测

工具从本会话可用工具列表发现；调用只含通用组件查询词，没有商家内容。使用 Build Web Apps 的 shadcn 资源检索技能辅助注册表检查；依项目限制复用现有 MCP，不运行初始化或安装命令。

| 调用 | 输入 | 实际结果 |
| --- | --- | --- |
| `mcp__21st__search` | `query="file upload", type="component", limit=2` | 成功返回 `File Upload`（6334，anubra266）和 `FileUpload`（2716，flower0wine）元信息 |
| `mcp__21st__search` | `query="textarea", type="component", limit=2` | 成功返回 `Textarea`（202，originui）和 `Textarea`（1281，shadcn）元信息 |
| `mcp__reactbits__get_project_registries` | `{}` | 当前连接返回 `@shadcn` 和 `@react-bits` |
| `mcp__reactbits__search_items_in_registries` | `query="FadeContent", registries=["@react-bits"], limit=2` | 共匹配 16 项，返回 `FadeContent-JS-CSS`、`FadeContent-TS-CSS` |

候选用途仅供统筹在母版确认后审阅：上传组件参考材料投递入口，Textarea 参考常驻描述区，FadeContent 参考整理区出现/收起的适度反馈。不是组件选型或视觉批准；未查看预览图、未读取源码/许可证/依赖、未安装或集成，未验证原生 HTML 兼容性。

本轮 React Bits 当前连接没有复现旧记录中的 `NOT_CONFIGURED`。无需据旧记录重复修改本机配置。检索输出的添加命令字段显示 `[object Promise]`，该字段不可用；不影响本次命名检索结论，本轮未尝试安装。

21st 仅使用免费元信息搜索，没有调用计费源码获取接口。Build Web Apps、Product Design 与 Browser 技能在当前会话技能列表中可见，但这不等于已执行设计生成或浏览器验收；公共母版未就绪，本轮没有开展这些操作。

## 4. 提请统筹明确的最小接口细节

第一页已确认主流程与提示词未发现实质职责冲突。下列是共享契约仍需展开的细节，不应由页面私造接口或写成已确认产品决定。

| 缺口 | 当前契约依据 | 统筹需交付 |
| --- | --- | --- |
| 补问正文、回答与“不知道”的保存位置 | `round.clarification` 只列 `limit/status/questionId`；`QUESTION_SET` 只列 `questionId/status`，状态为 asked/answered/skipped | 明确答案/未知如何关联问题和来源、内容改变如何影响输入版本，提供回答、未知、跳过及刷新读回的示例命令；若复用 facts/unknowns，应给出对应 schema |
| JSON 白名单、CSV 样例及 TXT 读取边界 | 已约定 UTF-8、JSON 白名单、CSV 八个列名和 TXT 原文读取，但尚无 `samples/` | 发布 JSON 结构、CSV 样例及 TXT 原文读取示例，明确未知字段、缺列、编码异常、带引号 CSV 的处理；不要求 TXT 必须结构化，不由第一页擅定 JSON 白名单 |
| 重复文件判定与批量接收规则 | 提示词要求按契约去重或提示，契约已给 6 份/每份 5MiB/总计 20MiB 的待审上限，但未规定重复判据 | 明确同名不同内容、相同内容改名、批量部分超限、替换的额度计算及错误返回；共享命令与 UI 使用相同规则 |

共享契约是 `demo.v1` 提案，尚无运行实例。上表不更改契约、不引入新强制问卷、不要求真实 OCR/模型。

## 5. 后续接入与验收准备（未实施）

第一页将只通过共享 API 读写，不复制状态模块。预计使用 `loadSession`、`subscribeSession`、`getMaterialBlob`、`dispatch`、`mountShell`、`navigateTo` 和 `registerNavigationGuard`；准确参数仍以统筹完成的契约及 schema 为准。

| 页面操作 | 契约命令/数据 | 必须保留的边界 |
| --- | --- | --- |
| 描述编辑、材料添加/替换/删除 | `INPUT_EDIT`、`MATERIAL_ADD/REPLACE/REMOVE` | 实质输入变更推进版本，撤销确认并标旧下游；失败保留内存草稿，替换失败保留原件 |
| 本地解析、整理和纠错 | `MATERIAL_RESULT_SET`、`ORGANIZATION_SET`、`FACT_PATCH` | 核对材料身份及版本；原件、提取、更正来源分开，未知不补零 |
| 一次关键补问 | `QUESTION_SET` 及待明确的答案保存方式 | 实际发问即占用；跳过、未知、修改资料、刷新或跨页返回不新增第二题 |
| “就看这个问题” | 保存当前整理 → `FOCUS_CONFIRM` → `navigateTo("decisions")` | 确认当前输入版本且保存成功后才跳页；不选择路径、不认可全部提取值 |

当前没有生成、写入或读回任何 `demo.v1` 会话，无法交付真实的“下一页收到的样例状态”。以下预期都仍需执行，不能当成功能通过记录。

| 验收项 | 开工后的复现重点 | 当前状态 / 对应矩阵 |
| --- | --- | --- |
| 1. 最小输入 | 单句、单材料、两者同时、空输入；仅图片标待核对，不假装 OCR | 阻塞/未执行；D01、D02 |
| 2. 文件交互 | 点击、拖入、用户粘贴截图、普通文字粘贴、预览关闭与焦点返回；取消/替换失败保留原件、重复/超限局部报错 | 阻塞/未执行；D02、D03、D16 |
| 3. 真实解析与来源 | 标准 CSV/TXT/JSON、BOM/引号、空值与真实零、坏 JSON/未知字段；查看原件和保存更正 | 阻塞/未执行；D03、D05 |
| 4. 冲突与补问预算 | 时间/商品/渠道冲突可见；问一次后回答/未知/跳过，再刷新与跨页返回不加题 | 阻塞/未执行；D04、D06 |
| 5. 版本与迟到任务 | 修改输入或删除材料后，旧确认/分析/选择/产物失效；迟到解析不得恢复被删材料 | 阻塞/未执行；D13、D14、D16 |
| 6. 保存与读回 | 成功事务后刷新恢复 Blob/草稿；注入读取和保存失败，保留草稿、不显示假成功、不跳空页 | 阻塞/未执行；D02、D14 |
| 7. 跨页衔接 | 当前版本确认后进第二页，来源定位返回第一页纠错，重新确认；直达/前后退/脏草稿走统一导航 | 阻塞/未执行；D13、D15 |
| 8. 视觉与可访问性 | 对照批准母版检查 1440×900、1280×720、390px、键盘、焦点、触达区、减弱动效、控制台 | 阻塞/未执行；D17 |

## 6. 已执行检查与未执行项

| 检查 | 结果 |
| --- | --- |
| 写入前 `python scripts/verify_demo_content.py` | PASS：841 项内容检查；15 个验收定义的素材路径有效 |
| 写入前 `git diff --check` | 通过，无输出；当时工作区干净 |
| 本 QA 首次写入后 `python scripts/verify_demo_content.py` | PASS：881 项内容检查；15 个验收定义的素材路径有效 |
| 多页并行期间再次运行内容检查 | PASS；先后观察到 912、922 项。期间其他页面新增 QA 文档，数量包含当时全部仓库文档，不表示本页功能验收数 |
| 文档写入后 `git diff --check` | 通过，无输出；该命令不覆盖未跟踪新文件，新 QA 另做下项检查 |
| 新 QA 的 Python 文本检查 | UTF-8 读取成功、无行尾空白、文件末尾有换行，PASS |
| `git status --short` / `git ls-files --others --exclude-standard` | 除本 QA 外，检查期间先后观察到其他页面的 `QA_AGENT_2.md`、`QA_AGENT_3.md` 并行新增；本 Agent 未修改、暂存或提交它们 |

上述脚本检查素材、文档链接及文本，不验证 UI、文件上传/解析、Blob 存储、模型、MoneyAI 记忆、授权或经营效果。15 个定义有效不等于 15 个浏览器场景通过。

未启动本地服务、未打开浏览器、没有实测截图；D01—D18 未执行。本轮不把静态文件检查或 MCP 检索成功当作 UI 验收。

待共享底座交付后，按公共入口从仓库根目录运行 `python -m http.server 4188 --bind 127.0.0.1 --directory demo`，使用同源 `http://127.0.0.1:4188/01-intake.html`。这是未来运行方式，本轮未运行；只服务 `demo/`，不暴露仓库根目录。

## 7. 继续所需交接

由统筹完成范围审批登记、展示并确认共同视觉及第一页参考、共享模块与样例交付，并在 READY 中附实际测试证据；同时明确第 4 节的接口细节。之后本页只实现自己的 HTML/CSS/JS 和更新本 QA，不启动其他页面或公共工程。

本轮停在第一页启动预检交接。未请求或执行 Git 同步；公共状态更新与后续合并仍归统筹。
