# Agent 3｜第三页实现与验收记录

更新：2026-08-28。**本批完成 REQ-30 可独立的区域实现、现有数据流程接线与纯逻辑检查，尚未完成整页功能或真实 UI 验收。C2／C5—C8 的反馈附件、榨汁杯/候选稿、再判断与接受建轮仍具名待接通。完成本批后停写，交现任统筹集成。**

下方 REQ-25／REQ-23／REQ-20 与基础版均保留为历史交接；其中旧“下一轮”按钮行为已被本批覆盖。现在查看复盘不会调用 ROUND_START，不把旧 reducer 可建空白轮次当作接受候选并开始下一轮。

## 本轮追加：REQ-30 图3执行记录与图2反馈后改判

### 范围、实际参考与依赖

依据现任统筹 `01a0476a-6049-70d2-9bb0-95af778428eb` 的明确下发，已完整读取 [功能锁定](WIREFRAME_FUNCTION_LOCK.md)、[本页提示词](PROMPT_AGENT_3.md) 顶部覆盖，并按 [品牌补充](../brand-ip/REQ30_WIREFRAME_BRAND.md) 与 [DF005 逐区判据](../design-feedback/DF-20260828-005-wireframe-conformance.md) 执行原 18 个编号，没有另造需求或第四页。

本次实际查看过以下两张原图，均为 **1586×992 静态设计草稿**，不是运行截图；只读原件，没有复制进仓库、用作上传测试或外发：

- 图3：`D:/路演方案工作指导/微信图片_20260828184148_47_3165.png`。
- 图2：`D:/路演方案工作指导/微信图片_20260828184145_46_3165.png`。

目标为 PC 1920×1080，原生三页与路芽名称保持。执行页以所选行动头区、修改稿/实验卡、后置可选反馈组织；图2在同一 HTML 的明确复盘状态中，带返回当前行动。没有回到长文章铺排，也没有另建编辑器、任务看板或自动执行。

本批只写 `demo/03-action.html`、`demo/pages/action.css`、`demo/pages/action.js` 与本 QA。共享、后台、tests 目录、公共文档、其他页面和 Git 均未写入；未安装依赖、改 MCP/信任、重复资源前检、启动手机/Figma或浏览器。

| 共享依赖 | 本次实际消费与仍缺的能力 |
| --- | --- |
| C5 | 继续消费真实 buildDemoArtifact → 逐项 ARTIFACT_SAVE 的当前路径产物。现有 underbed/general 稿件可预览；没有榨汁杯 A/B 或候选稿对象。八项卡使用已交付字段，护栏与具体回滚步骤明确待接通；恢复条件不能冒充回滚方法。 |
| C6 | 现有 FEEDBACK_SAVE 可追加文字、执行自述、观察及指标 JSON；无反馈附件 Blob 原子接口。新截图／Excel／CSV 输入禁用并具名说明，绝不借 MATERIAL_ADD 改原输入。附件格式接收另依赖 C2。 |
| C7 | 没有版本化再判断接口，结论／原行动处理／候选建议／理由区域标等待共享结果。普通分析摘要中“读取了本地反馈”不被当成再判断。 |
| C8 | 旧 ROUND_START 会清空分析、选择并使旧稿失效，不是“接受候选及建有效下一轮”。本页已移除旧建轮调用；开始第二轮禁用，不创建正式未来记录。 |
| C9／MoneyAI | 公共壳仍负责真实服务状态；本页只显示本机保存和读回证据。未调用个人历史/管理 API，未称 MoneyAI 已写入、读回或记住。 |

### 逐项交回（沿用原功能 ID 与模块名）

“已实现未验”只指本批代码已有；下列没有任何一项标为整项“已实测”。“阻塞”项同时列出已保留的区域/接线和具体共享缺口。复现列中的页面操作仍待获准的统一浏览器窗口；纯函数证据另列，不混成真实 UI。

| 功能 ID／锁定模块 | 状态与本批实现 | 代码位置 | 复现与实际证据／依赖 |
| --- | --- | --- | --- |
| R30-P3-01 所选行动头区 | 已实现未验。仅由当前有效选择显示方案、轮次、输入版本、动作和不变项；无选择为空态。 | `03-action.html:36`；`action.js:641` | 从 P2 分别显式选路再进 P3；失效后不得默认 A。R30 脚本第1、2组通过，实际头区与跨标签未验；C1/C5。 |
| R30-P3-02 “可以直接使用的修改稿” | 阻塞。已有共享稿件在带标题、版本的容器内切换；内容切换不选路。榨汁杯购买问答/适用 B 稿未由 C5 交付，没有硬写容量、冰块、清洗或售后承诺。 | `03-action.html:63`；`action.js:476`、`action.js:539` | 当前三种既有合成种子冒烟通过；比较 A/B 的 artifact 引用，榨汁杯分支须待 C5。未有运行稿件截图。 |
| R30-P3-03 “复制全部文案／下载执行清单” | 已实现未验。全文复制包含当前路径全部已保存 copy 正文，步骤/观察计划不混成发布文案；另保留当前内容/步骤复制。TXT 明确为整条行动包、逐次摘要授权。 | `03-action.html:102`；`action.js:160`、`action.js:798`、`action.js:881` | R30 第1、2、9组及旧 REQ25 第2、3组通过。点击时锁定已展示签名，重读变更则拒绝；失败可手动选取且不记成功。真实剪贴板、浏览器下载请求、落盘与日志重试未验；C5。 |
| R30-P3-04 “本轮实验卡”八项 | 阻塞。八个位置与已有计划字段映射完成；无样本/日期不填 100 或 24—72。护栏及具体回滚方法仍缺 C5。 | `03-action.html:129`；`action.js:169`、`action.js:428` | R30 第3组通过：null 保持未知，数值样本明确为合成假设或待核对计划；恢复条件不冒充已回滚。八行实际首屏高度未验。 |
| R30-P3-05 “查看实验依据” | 已实现未验。依据弹窗含当前计划口径、来源模式、限制、证据摘要与算式；关键前提/风险在取用区旁保持可发现。 | `03-action.html:132`、`03-action.html:355`；`action.js:407`、`action.js:428` | 静态确认风险/前提没有包进反馈折叠。来源只有弹窗实际打开才触发 source_viewed；未造专家调用流程。打开/关闭/焦点返回与滚动未验；C5/C9。 |
| R30-P3-06 执行状态三按钮 | 已实现未验。done/partial/not_started 仅明确点击后记录；初始三项均未选，清除可恢复 unknown。采用与观察独立，日期不自动补。 | `03-action.html:163`；`action.js:74`、`action.js:1219`、`action.js:1309` | 静态三按钮 aria-pressed=false；R30 第4组及共享反馈组合通过，包括 done+worse+executedAt=null、adoption=unknown。实际点击、刷新恢复未验；C6。 |
| R30-P3-07 新截图／新Excel或CSV／文字反馈 | 阻塞。两文件位置及格式具名禁用，文字0/500、日期/范围/观察选填已接旧反馈流程。没有接收或保存文件的假回执。 | `03-action.html:188`、`03-action.html:194`、`03-action.html:199`；`action.js:74` | R30 第4、10组验证500字符边界与无 MATERIAL_ADD 接线；没有处理真实图片/Excel/CSV。接收、预览、删除、Blob/JSON事务等待 C2/C6。已存长记录仍只读完整展示，不截断历史。 |
| R30-P3-08 “稍后回来补充／保存本轮记录” | 阻塞（附件事务部分）。稍后不写事件、不改执行；现有文字/自述按原稿引用 FEEDBACK_SAVE，失败留草稿、同操作重试；成功后才清未保存状态。 | `03-action.html:204`；`action.js:929`、`action.js:1230` | R30 第4、9组验证现有 reducer 边界；代码保留保存成功但读回失败的独立提示，不能因此重复保存。真实 IDB/刷新/跨标签/提交响应丢失仍未验；完整附件一致性待 C6。 |
| R30-P3-09 保存后进入复盘 | 阻塞（共享改判部分）。保存后主动重读本机记录，提供同页复盘入口；读回失败可重试，查看不建轮。 | `03-action.html:247`；`action.js:929`、`action.js:986`、`action.js:1000` | R30 第5、6、10组验证原版本引用与无建轮捷径；没有无反馈预播“A已记住→B”。真实保存/读回/入口切换未验；自动再判断仍待 C7，候选建轮待 C8。 |
| R30-R-01 记录回执与“查看完整实验记录” | 已实现未验（现有本机JSON记录）。实际 loadSession 成功且匹配原记录后展示回执；完整记录含原稿、执行/观察、指标口径、原实验计划、步骤/风险和原分析引用摘要。 | `03-action.html:262`、`03-action.html:375`；`action.js:202`、`action.js:986`、`action.js:1134` | R30 第5—8组通过；只按 feedback→execution/artifact版本→原 analysis 精确关联，不拿新材料补旧证据。MoneyAI、反馈附件读回仍未接通；真实弹窗与存储读回未验。 |
| R30-R-02 上轮发生了什么四块 | 阻塞。动作/执行/观察三块来自所读记录，指标另可查看；第四块“当前结论”明确等待 C7。 | `03-action.html:269`；`action.js:1068` | R30 第4、5、8组保持 done+worse、unknown 与原话；有数值不自动改 observation，不把未知变0。未有四块运行截图或 C7 结论。 |
| R30-R-03 不再重复／下一步建议与原因 | 阻塞。保留原行动处理、候选建议及关联反馈/分析/输入版本的位置；不把已尝试写成已验证，不固定 A→B。 | `03-action.html:291`；`action.js:1068` | 当前只能查看待共享提示；须等 C7 返回带版本理由，才能验继续观察/补数据/暂停/换实验。 |
| R30-R-04 B执行预览 | 阻塞。候选预览容器保留，当前无候选稿，不用另一条旧路径填充，更不伪造视频。 | `03-action.html:307`；`action.js:1068` | 待 C5/C7 实际候选后核对片段和确认来源；当前没有0—2/2—4/4—5秒运行内容证据。 |
| R30-R-05 “生成完整执行稿／查看修改清单” | 阻塞。两个具名按钮禁用并展示原因，无空跳转或成功 toast；候选不会覆盖当前稿件。 | `03-action.html:312`；`action.js:1068` | R30 第10组仅确认禁用及边界，未产出候选完整稿/修改清单；待 C5/C7/C8。 |
| R30-R-06 “第二轮实验规则” | 阻塞。候选五项规则的位置保留、均为待返回状态；缺退款/投诉不能判护栏未触发。 | `03-action.html:319`；`action.js:1068` | 未使用当前轮计划冒充第二轮，也未造100次/24—72小时；待 C5/C7/C8 后核对候选版本。 |
| R30-R-07 “开始第二轮／暂时不继续” | 阻塞。开始禁用且解释 C8；暂不继续只返回当前行动，不改变记录/执行或创建轮次。 | `03-action.html:330`；`action.js:1027`、`action.js:1309` | R30 第10组确认页面没有 ROUND_START 调用。旧 reducer 的纯逻辑建轮测试仅作兼容证据，不是本按钮实现；明确接受、幂等有效建轮仍待 C8。 |
| R30-R-08 “这个商家的实验记忆”时间线 | 阻塞（候选/正式新轮部分）。只列已存反馈及原轮次/稿件，完整记录可读；未知候选单独提示，不插入“第二次待执行”。 | `03-action.html:338`；`action.js:1115` | R30 第5、6、8组证据为真实 reducer 关联，不是 MoneyAI 使用历史验证。正式新轮与来源使用说明待 C8/C9，时间线运行未验。 |
| R30-R-09 商家中心／演示商家／导航入口 | 已实现未验。具名“当前项目”弹窗列当前本机会话/轮次及记录，复盘可返回当前行动；不建账号、多商家中心或第四主页面。 | `03-action.html:19`、`03-action.html:383`；`action.js:1197` | 静态确认两个状态同属 action-content/review-content 同级区域与共享壳；打开/关闭、普通第三步返回和焦点未验。C1/C8/C9 扩展能力未冒充可用。 |

### 本批重要修补与事件边界

- 全文取用和 TXT 都绑定当前选路及已保存稿件版本。全文复制还绑定点击时已展示的签名；重读后出现新选择/新稿即中止，不静默把 A 的点击意图迁给 B。剪贴板 Promise 成功才记 copy_succeeded，手动选中不算复制；下载仅记 download_requested，不称文件落盘。
- 八项计划不从情景估算中的“100名访客”推成最低样本；只显示现有来源字段。具体护栏/回滚缺口保持可见，不为清爽藏掉必要风险。
- 精确历史关联处理了“同轮保存反馈后重新分析、随后归档轮次”的情况：历史 round.analysis 可能是较晚分析，必须按 analysisId + roundId + inputVersion 找原快照，再取原 path/材料版本；不得用当前事实兜底。完整记录同时保留已有指标0/未知、单位/对象/渠道/计数口径/窗口，但不推导结果状态。
- 记录/复盘读取使用请求代号、来源会话与 revision 检查；关闭、返回、换项目视图、换会话和离页取消旧请求。取消同时释放 busy；旧 finally 只能释放自己的读取，避免迟到结果重新弹窗、覆盖新选择或解除另一次请求状态。这里只完成代码与静态边界检查，真实取消/迟到时序仍待验。
- 新反馈附件位置没有接普通输入命令；文本保存不会主动改原 inputVersion。保存确认与后续读回分开，后者失败不能误报前者失败或制造第二条保存。查看复盘、取用、候选预览位置都不是采用/执行/开始第二轮。

### 已执行检查、实际证据与未验项

| 检查 | 本批实际结果与边界 |
| --- | --- |
| `node --check demo/pages/action.js` | 退出0；最终官方文件复跑，不只是暂存稿。 |
| `node --test demo/tests/logic.test.mjs` | **53/53 通过，0失败**。沿用现有 suite，没有写测试目录；不是浏览器、模型或 IDB 验收。 |
| 本 QA 的 REQ-25 8组脚本 | **8/8 通过，0失败**；原 v0.5、三问、来源/更正、失效与逐次导出授权继续成立。 |
| 下方 REQ-30 脚本 | **10/10 通过，0失败**；真实 reducer/生成器和页面纯投影，最后1项为源码/HTML静态边界。没有创建另一状态库。 |
| 既有三合成种子模块冒烟 | 通过；underbed_complete_v1、one_sentence_v1、scope_conflict_v1 仍可导入纯函数。此处使用旧种子只作兼容检查，不声称榨汁杯已交付。 |
| Python DOM/样式静态检查 | 124个唯一HTML ID、89个JS字面挂载点；label/ARIA/锚点目标存在、两状态同级、三执行按钮默认未知、反馈不包住取用/核心风险、单标题标记通过。CSS只检查作用域、共享变量和括号，不是完整CSS解析或渲染。 |
| `python scripts/verify_demo_content.py` | 退出0；明确未运行 UI、模型、MoneyAI记忆、授权与经营效果检查。 |
| 文件与权限边界 | 三实现文件UTF-8、无U+FFFD/NUL/尾空格、末尾换行；D备份哈希及原子替换检查完成。未运行任何Git命令，统筹负责差异/提交检查。 |

第一次新增脚本的正文断言未先统一 LF/CRLF，因 TXT 按契约输出 CRLF 而失败；修正了比较方式并保留 BOM/逐次授权检查，没有为测试改变产品换行。CSS静态脚本也已按括号深度拆选择器，未把 :where 内的逗号误报为越界作用域。最终文档检查曾将复现代码中的正则字符组识别成Markdown链接；本QA改用等价的正则交替写法，未修改公共检查器或放宽断言。

**真实运行证据：当前无。** 首屏、主交互、模态窗口、1920×1080排版、中文输入/键盘与焦点、减少动效/实际标题动画、剪贴板权限、TXT落盘、反馈Blob/JSON原子保存、刷新/跨标签、请求迟到与失败重试均未验。没有实际截图、录像或性能结论。两张静态草稿与上述 Node/源码检查均不能替代；Browser可信路径/备用许可继续由统筹协调，本页没有另试或绕过。

尚未完成的联调顺序沿锁定：C5产物/完整计划 → C6反馈附件保存 → 实际读回 → C7版本化再判断 → 候选预览/修改清单 → 明确接受 → C8有效下一轮。以上是依赖顺序，不是自动派发的新任务；本批交回后停写。

### 安全写入记录

每个官方替换批次均先检查 C盘剩余大于1GiB，复制当前原文件到D并读回SHA-256，再使用同目录临时文件、flush/fsync、UTF-8/非空/内容校验；再次核对源文件哈希未变后 os.replace。临时文件没有当作新功能文件保留。

| 批次 | 写前/复核情况与D备份 |
| --- | --- |
| HTML/CSS | 写前C剩余5,605,494,784字节。备份及检查回执：`D:/CodexBackups/luya/req30-agent3/markup-20260828T112902367954Z/manifest.json`、同目录 `atomic-receipt.json`。根任务另读最终文件并复核哈希/124ID。 |
| JS | 原件SHA `caa8490029cb1779d110ccb36ed6698fda972ba4f681a000ca0ccd8898779325`；备份 `D:/CodexBackups/luya/req30-agent3/js-20260828T112730922676Z/action.js`。暂存通过语法/纯函数检查后替换，替换后C剩余5487001600字节。 |
| 本QA | 写前C剩余5465944064字节；原件SHA `33ad405a72c5f94a5f8bed0b8076b805f09582f4dabc997752d56e1512feadf1`，备份 `D:/CodexBackups/luya/req30-agent3/qa-20260828T114118703996Z/QA_AGENT_3.md`。本段和复现脚本同批暂存/验证/替换，原历史记录保留。 |
| QA复现语法兼容修订 | 写前C剩余4472668160字节；备份 `D:/CodexBackups/luya/req30-agent3/qa-check-20260828T114616888244Z/QA_AGENT_3.md`，SHA `a309e0d007fd66ba1679ab9f555946735c733f86b615037ac8681d5e14d2bdf9`。只调整QA正则的等价写法和检查说明，业务代码不变。 |

最终实现文件：HTML 24029字节／`964515851ddb87ea8580320a58c8b2ecb4c85e5e2ffff4623f24a409472048e3`；CSS 30694字节／`57f2acaa29f7d8173177f5b60bd53210cd108cf46eae880295948c5145fb5e56`；JS 77260字节／`84cab901dc38c94e2ccb4ba4040c872fe24924830b70845fff59454f407134c5`。这些标识只定位本批源码，不表示已完成统一Git检查点或运行验收。

<details>
<summary>REQ-30 的10组纯逻辑/静态边界复现（仓库根目录）</summary>

只运行进程内 reducer、生成器和页面纯函数；不启动浏览器，不读写演示持久会话。不设置 A3_ACTION_MODULE 时导入官方 action.js；该环境变量仅用于本批同目录暂存稿的替换前检查。

```powershell
$qaText = Get-Content -LiteralPath 'docs/development/demo/QA_AGENT_3.md' -Encoding UTF8 -Raw
$qaSmoke = [regex]::Match($qaText, '(?s)<!-- A3-REQ30-SMOKE -->\s*```javascript\r?\n(.*?)\r?\n```').Groups[1].Value
if (-not $qaSmoke) { throw 'REQ-30 smoke block missing' }
$OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$qaSmoke | node --input-type=module
```

<!-- A3-REQ30-SMOKE -->
```javascript
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createEmptyState, reduceCommand } from './demo/shared/model.js';
import { buildDemoAnalysis, buildDemoArtifact } from './demo/shared/demo-data.js';
const modulePath = process.env.A3_ACTION_MODULE || './demo/pages/action.js';
const { activeSelection, currentArtifacts, buildActionCopy, buildActionPack, experimentCardRows,
  makeFeedbackPayload, resolveFeedbackRecord, feedbackMetricRows } = await import(modulePath);
const NOW = '2026-08-28T12:00:00.000Z';
function harness(fixtureId = 'underbed_complete_v1') {
  let serial = 0;
  const context = { now: NOW, newId: () => 'r30_' + (++serial) };
  let state = createEmptyState(context);
  const send = (type, payload) => {
    const result = reduceCommand(state, { type, payload, commandId: 'r30_cmd_' + (++serial),
      expectedRevision: state.revision }, context);
    state = result.state;
    return result;
  };
  if (fixtureId) send('LOAD_FIXTURE', { fixtureId });
  return { get state() { return state; }, send };
}
function analyze(h) {
  h.send('FOCUS_CONFIRM', { inputVersion: h.state.round.inputVersion });
  const generated = buildDemoAnalysis(h.state);
  assert.equal(generated.ok, true);
  h.send('ANALYSIS_SET', { analysis: generated.analysis });
}
function choose(h, index = 0) {
  h.send('PATH_SELECT', { analysisId: h.state.analysis.id, pathId: h.state.analysis.paths[index].id,
    inputVersion: h.state.round.inputVersion });
  const generated = buildDemoArtifact(h.state);
  assert.equal(generated.ok, true);
  for (const artifact of generated.artifacts) h.send('ARTIFACT_SAVE', { artifact });
}
function ready() { const h = harness(); analyze(h); choose(h); return h; }
function draft(overrides = {}) {
  return { execution: 'unknown', observation: 'unknown', rawText: '', scope: '', executedAt: null, ...overrides };
}
function saveFeedback(h, overrides = {}) {
  h.send('FEEDBACK_SAVE', makeFeedbackPayload(currentArtifacts(h.state)[0], draft(overrides)));
  return h.state.feedbackRecords.at(-1);
}
function pack(h, allowSummaries) {
  return buildActionPack(h.state, { exportId: 'r30_export', generatedAt: NOW, allowSummaries });
}

test('R30 copy-all uses every saved copy on the selected path; no feedback or mutation', () => {
  const h = harness();
  assert.throws(() => buildActionCopy(h.state));
  analyze(h);
  assert.throws(() => buildActionCopy(h.state));
  choose(h);
  const original = currentArtifacts(h.state).find((a) => a.kind === 'copy');
  // Synthetic second draft, saved by the real reducer; not a new production generator.
  h.send('ARTIFACT_SAVE', { artifact: { ...structuredClone(original), id: null, version: 0,
    savedAt: null, title: 'Second synthetic copy', body: 'SECOND_COPY_BODY' } });
  const before = structuredClone(h.state);
  const copies = currentArtifacts(h.state).filter((a) => a.kind === 'copy');
  const actual = buildActionCopy(h.state);
  assert.deepEqual(actual.artifacts.map((a) => a.id), copies.map((a) => a.id));
  assert.equal(actual.text, copies.map((a) => a.body).join('\n\n'));
  assert.equal(actual.artifacts.some((a) => a.kind === 'experiment_plan'), false);
  assert.deepEqual(h.state, before);
  assert.deepEqual(h.state.feedbackRecords, []);
  assert.throws(() => pack(h, false));
  const txt = pack(h, true).text;
  for (const artifact of currentArtifacts(h.state)) {
    assert(txt.includes(artifact.id));
    assert(txt.replace(/\r\n/g, '\n').includes(artifact.body.replace(/\r\n/g, '\n')));
  }
  assert.equal(txt.charCodeAt(0), 0xfeff);
  assert.throws(() => pack(h, false)); // Consent is required again, even after success.
});

test('R30 displayed signature rejects silent A-to-B copy, extra drafts and invalidated input', () => {
  const h = ready();
  const clicked = buildActionCopy(h.state);
  choose(h, 1);
  assert.throws(() => buildActionCopy(h.state, { expectedSignature: clicked.signature }));
  const b = buildActionCopy(h.state);
  assert.notEqual(b.context.pathId, clicked.context.pathId);
  assert.equal(b.text, b.artifacts.map((a) => a.body).join('\n\n'));
  const next = { ...structuredClone(b.artifacts[0]), id: null, version: 0, savedAt: null,
    title: 'Additional B copy', body: 'ADDITIONAL_B' };
  h.send('ARTIFACT_SAVE', { artifact: next });
  assert.throws(() => buildActionCopy(h.state, { expectedSignature: b.signature }));
  h.send('INPUT_EDIT', { description: 'Synthetic correction: now a different input.' });
  assert.equal(activeSelection(h.state), null);
  assert.throws(() => buildActionCopy(h.state));
  assert.throws(() => pack(h, true));
});

test('R30 eight experiment rows keep sample, guardrail and rollback limits explicit', () => {
  const h = ready();
  const path = activeSelection(h.state).path;
  const before = structuredClone(path);
  const rows = experimentCardRows(path, h.state.analysis.mode);
  const byLabel = Object.fromEntries(rows);
  assert.equal(rows.length, 8);
  assert.equal(byLabel['本轮只改什么'], path.experiment.change);
  assert.equal(byLabel['本轮保持不变'], path.experiment.keepFixed.join('；'));
  assert.match(byLabel['最小样本'], /尚未确定/);
  assert.doesNotMatch(byLabel['最小样本'], /100/);
  assert.doesNotMatch(byLabel['观察时间'], /24|72/);
  assert.match(byLabel['护栏指标'], /不代表风险未触发/);
  assert.match(byLabel['回滚方式'], /仅有恢复条件/);
  assert.match(byLabel['回滚方式'], /步骤待共享/);
  assert.deepEqual(path, before);
  assert.equal(experimentCardRows(null).length, 8);
  const scenario = structuredClone(path);
  scenario.experiment.minSample = 100;
  assert.match(Object.fromEntries(experimentCardRows(scenario, 'demo_fixture'))['最小样本'], /合成计划假设.*100.*不代表统计充分/);
  assert.match(Object.fromEntries(experimentCardRows(scenario, 'local_limited'))['最小样本'], /依据待核对.*100.*不代表统计充分/);
});

test('R30 explicit execution stays separate from observation, adoption and time', () => {
  for (const execution of ['unknown', 'done', 'partial', 'not_started']) {
    const h = ready();
    const record = saveFeedback(h, { execution, observation: 'worse', rawText: 'Synthetic self-report.' });
    const bundle = resolveFeedbackRecord(h.state, record.id);
    assert.equal(bundle.execution.execution, execution);
    assert.equal(bundle.execution.adoption, 'unknown');
    assert.equal(bundle.execution.executedAt, null);
    assert.equal(bundle.feedback.observation, 'worse');
    assert.equal(h.state.events.some((event) => event.type === 'adoption_reported'), false);
    assert.equal(h.state.events.some((event) => event.type === 'round_started'), false);
    const before = structuredClone(h.state);
    buildActionCopy(h.state); // A saved optional report is not a new taking prerequisite.
    assert.deepEqual(h.state, before);
  }
  const h = ready(), artifact = currentArtifacts(h.state)[0];
  assert.throws(() => makeFeedbackPayload(artifact, draft()));
  const text = '甲'.repeat(500);
  assert.equal(makeFeedbackPayload(artifact, draft({ rawText: text })).feedbackRecord.rawText, text);
  assert.throws(() => makeFeedbackPayload(artifact, draft({ rawText: text + '乙' })));
  assert.throws(() => makeFeedbackPayload(artifact, draft({ rawText: 'x', executedAt: '2026-02-30' })));
});

test('R30 exact old record survives same-round reanalysis and a later archived round', () => {
  const h = ready();
  const oldAnalysis = structuredClone(h.state.analysis);
  const oldArtifact = structuredClone(currentArtifacts(h.state)[0]);
  const feedback = saveFeedback(h, { execution: 'done', observation: 'unchanged', rawText: 'Original report.' });
  const beforeRead = structuredClone(h.state);
  const first = resolveFeedbackRecord(h.state, feedback.id);
  assert.equal(first.analysis.id, oldAnalysis.id);
  assert.deepEqual(h.state, beforeRead);
  analyze(h); // The current round's new analysis is NOT the feedback's original analysis.
  const laterAnalysisId = h.state.analysis.id;
  assert.notEqual(laterAnalysisId, oldAnalysis.id);
  assert.equal(resolveFeedbackRecord(h.state, feedback.id).analysis.id, oldAnalysis.id);
  // Exercise a pre-existing reducer transition only; the R30 page has no such command.
  h.send('ROUND_START', { feedbackId: feedback.id });
  const archived = h.state.history.find((entry) => entry.type === 'round');
  assert.equal(archived.analysis.id, laterAnalysisId);
  const resolved = resolveFeedbackRecord(h.state, feedback.id);
  assert.equal(resolved.analysis.id, oldAnalysis.id);
  assert.equal(resolved.path.id, oldArtifact.pathId);
  assert.equal(resolved.artifact.id, oldArtifact.id);
  assert.equal(resolved.artifact.version, oldArtifact.version);
  assert.equal(resolved.artifact.body, oldArtifact.body);
  assert.deepEqual(resolved.analysis.inputSnapshot, oldAnalysis.inputSnapshot);
  assert.equal(resolved.roundIndex, 1);
  assert.equal(resolved.execution.execution, 'done');
});

test('R30 missing or mismatched record references never use another version', () => {
  const h = ready();
  const feedback = saveFeedback(h, { rawText: 'One report.' });
  assert.equal(resolveFeedbackRecord(h.state, 'missing'), null);
  for (const change of [
    (copy) => { copy.feedbackRecords[0].artifactVersion += 1; },
    (copy) => { copy.executionRecords[0].pathId = 'other_path'; },
    (copy) => { copy.feedbackRecords[0].savedAt = null; },
  ]) {
    const corrupted = structuredClone(h.state); change(corrupted);
    assert.equal(resolveFeedbackRecord(corrupted, feedback.id), null);
  }
  const withoutAnalysis = structuredClone(h.state);
  withoutAnalysis.analysis = null; withoutAnalysis.history = [];
  const partial = resolveFeedbackRecord(withoutAnalysis, feedback.id);
  assert.equal(partial.analysis, null);
  assert.equal(partial.path, null);
  assert.equal(partial.artifact.id, feedback.artifactId);
});

test('R30 original source snapshot is not replaced by corrected current input', () => {
  const h = ready();
  const original = structuredClone(h.state.analysis);
  const record = saveFeedback(h, { rawText: 'Record against the original source.' });
  const fact = structuredClone(h.state.input.facts.find((item) => item.key === 'external_height'));
  const previousValue = fact.value; fact.value = 14;
  h.send('FACT_PATCH', { fact, reason: 'Synthetic correction after reporting.' });
  const bundle = resolveFeedbackRecord(h.state, record.id);
  assert.equal(bundle.analysis.id, original.id);
  assert.equal(bundle.analysis.inputSnapshot.facts.find((item) => item.id === fact.id).value, previousValue);
  assert.equal(h.state.input.facts.find((item) => item.id === fact.id).value, 14);
  assert.equal(activeSelection(h.state), null);
});

test('R30 metrics-only feedback preserves zero, unknown and saved measurement scope', () => {
  const h = ready(), artifact = currentArtifacts(h.state)[0];
  const metric = { key: 'paid_orders', value: 0, unit: '笔', subject: 'Synthetic item',
    channel: null, cohort: 'orders', window: { start: '2026-08-27', end: null } };
  h.send('FEEDBACK_SAVE', { executionRecord: null, feedbackRecord: {
    artifactId: artifact.id, artifactVersion: artifact.version, observation: 'unknown',
    rawText: '', metrics: [metric], observedWindow: { start: null, end: null } } });
  const bundle = resolveFeedbackRecord(h.state, h.state.feedbackRecords.at(-1).id);
  assert.equal(bundle.execution, null);
  assert.equal(bundle.feedback.observation, 'unknown');
  assert.deepEqual(bundle.feedback.metrics, [metric]);
  const values = Object.fromEntries(feedbackMetricRows(bundle.feedback.metrics[0]));
  assert.equal(values['已报数值'], '0');
  assert.equal(values['单位'], '笔');
  assert.equal(values['对象'], 'Synthetic item');
  assert.equal(values['渠道'], '未知');
  assert.equal(values['观察开始'], '2026-08-27');
  assert.equal(values['观察结束'], '未知');
  assert.equal(Object.fromEntries(feedbackMetricRows({ value: null }))['已报数值'], '未知');
  assert.equal(Object.fromEntries(feedbackMetricRows({ metric: 'product_clicks', window_start: '2026-08-26' }))['观察开始'], '2026-08-26');
});

test('R30 taking events do not adopt, execute, report, read back or start a round', () => {
  const h = ready(), copy = buildActionCopy(h.state);
  const before = structuredClone(h.state);
  const refs = { pageId: 'action', analysisId: copy.context.analysisId, pathId: copy.context.pathId,
    inputVersion: copy.context.inputVersion, artifactId: copy.artifacts[0].id, artifactVersion: copy.artifacts[0].version };
  h.send('EVENT_APPEND', { event: { type: 'copy_succeeded', roundId: copy.context.roundId, refs } });
  h.send('EVENT_APPEND', { event: { type: 'download_requested', roundId: copy.context.roundId,
    refs: { pageId: 'action', exportId: 'r30_export', format: 'txt' } } });
  assert.deepEqual(h.state.events.slice(before.events.length).map((event) => event.type), ['copy_succeeded', 'download_requested']);
  for (const key of ['round', 'selection', 'artifacts', 'executionRecords', 'feedbackRecords', 'history']) {
    assert.deepEqual(h.state[key], before[key]);
  }
});

test('R30 static page boundaries: no feedback-as-input, no candidate round shortcut, one title', () => {
  const source = readFileSync(new URL(modulePath, import.meta.url), 'utf8');
  const html = readFileSync('demo/03-action.html', 'utf8');
  assert.doesNotMatch(source, /command\(\s*(?:'|")(?:ROUND_START|MATERIAL_ADD)(?:'|")/);
  assert.match(source, /expectedSignature:\s*renderedPackSignature/);
  assert.match(source, /expectedSignature:\s*intent\.signature/);
  assert.match(source, /token !== viewReadToken \|\| state\?\.sessionId !== sessionId/);
  assert.match(source, /addEventListener\('cancel'/);
  assert.match(source, /function invalidateViewRead\(\)[\s\S]*?readingReview = false;/);
  assert.match(source, /if \(token === viewReadToken\) readingReview = false;/);
  assert.equal((html.match(/\bdata-fold-title\b/g) || []).length, 1);
  for (const control of ['feedback-image', 'feedback-table', 'generate-candidate', 'show-change-list', 'start-candidate']) {
    assert.match(html, new RegExp('<(?:input|button)\\b[^>]*\\bid="' + control + '"[^>]*\\bdisabled\\b'));
  }
  assert.equal((html.match(/data-execution="(?:done|partial|not_started)"[^>]*aria-pressed="false"/g) || []).length, 3);
});
```

</details>

---

## REQ-25 限定纯逻辑回归（上一轮交接）


依据新统筹本次明确下发及已交付的主契约 4.1／细则 3、3.1执行。只做内存 reducer 和页面纯函数检查，不启动浏览器、同源持久会话、手机或 Figma。REQ-28 的三页渐进方向与路芽文字品牌继续有效；本轮没有重新布局、动共享样式或增加语音／提取接口。

### 最小源码修订

本轮仅修改 `demo/pages/action.js` 与本 QA；`03-action.html`、`pages/action.css` 没有本轮改动。公共源码、测试目录、其他页面与 Git 写操作仍由统筹负责。

- 实际复现：v0.5 的 `locator.type=intake` 在 TXT 中退化为“来源定位未知”；合法 `text` 字符定位会出现 `undefined` 行号，`txt` 类型未识别。已补理解字段、语音转写／粘贴文字／手动填写和行号／位置展示，不在页面换算定位。
- 新增本页纯展示函数 `describeActionSource`，页面与 TXT 共用。显示“商家确认理解，未外部核验”“商家判断，待验证”“未知，未补值”，更正和冲突另标；`checked` 仅写原文／算式核对。TXT 小标题改为“引用资料摘要”，不把判断统一称作事实。
- 当前行动的引用从对应 `analysis.inputSnapshot.facts` 读取；仅无快照的旧结构才回退当前输入。只导出现有产物 `sourceFactIds` 涉及的摘要，未把全部三问、完整转写、`locator.quote`、音频、反馈或历史追加进 TXT。原 quote、材料版本、证据性质和问答快照未被格式化函数改写。
- 保留复制当前内容／步骤、整包下载、逐次授权、显式选路和后置自愿反馈。未改变共享映射、存储、事件、版本或生成器。
- CSV 的契约差异已交统筹修复：记录／行号从 1 起，表头记录为 1、首数据记录通常为 2；本页不加 1。统筹已将共享绑定校验改为拒绝 0；本轮最终共享套件包含“2 接受、0 拒绝”。TXT 的 start/end 从 0 起，本页原样标“位置”，不擅自解释区间端点。

### 四组回归的实际结果

| 本次要求 | 内存逻辑证据 | 未被证明的部分 |
| --- | --- | --- |
| 更正／旧草稿／失效 | 真实 v0.5 `INTAKE_SET→FOCUS_CONFIRM→ANALYSIS_SET→PATH_SELECT→ARTIFACT_SAVE`；价格连续两次更正后再明确清空，保留同一事实 ID、原文与连续更正链；旧输入快照、覆盖已更正值和断裂链均拒绝且状态不变。更正或 INPUT_EDIT 后旧分析／产物 stale、当前选择为空，TXT 拒绝；重存理解、确认、重分析后仍须显式选路 | 真实页面空态、按钮禁用、跨标签和剪贴板的过期拦截 |
| 三问／原话／来源 | 同轮 known／unknown／skipped 三题及来源 ID 进入真实 analysis.clarificationSnapshot；早期答案更正不删除后两题、不重置额度。原文、编辑文、intake 来源、quote 保持；答案不自动变成事实、采用或执行。点击≠详情访客、创建订单≠支付订单，0 与未知分别保留 | ASR、真实模型提取或 AI 核验。默认有限生成器未使用全部问答，也未提供历史问答浏览／批量导出 |
| TXT 授权与范围 | 每次调用都要求本次同意，前次成功不豁免；包含当前两份保存产物及 ID／版本、轮次／输入／分析／选路、BOM／CRLF、步骤与风险。新输入后的签名改变，旧 TXT 生成被拦截；无反馈也能生成正文／步骤及完整包 | 实际浏览器确认控件、Blob 下载、文件落盘或打开；本测试输出是内存字符串 |
| 取用与反馈分离 | 实际 reducer 接收 copy_succeeded／download_requested 后仅新增两类日志，不写采用／执行／反馈／session_read，也不冒充 session_saved。随后明确 FEEDBACK_SAVE 才产生自述：done＋worse＋executedAt=null 合法，adoption 仍 unknown。未保存反馈不能 ROUND_START | 实际剪贴板 Promise、IndexedDB 事务成功、刷新读回、日志重试或落盘 |

### 已执行检查与限制

| 检查 | 本轮结果 |
| --- | --- |
| 下方可复现 REQ-25 组合脚本 | **8 组通过、0 失败**。全部调用真实共享 reducer／生成器和本页纯函数，无自造状态库 |
| `node --test demo/tests/logic.test.mjs` | **45 项通过、0 失败**；含当前共享 v0.5、三问、文件绑定和原有预览／授权／反馈／固定标题逻辑 |
| `node --check demo/pages/action.js` | 退出 0 |
| 原三合成种子模块冒烟 | 通过；原页面纯接口继续可导入 |
| Python 静态接线／文本检查 | 71 个唯一 DOM ID、54 个 JS 挂载引用、共享固定标题接线、单一标记、页面作用域、UTF-8／行尾检查通过；本轮不用 Git 差异检查代替或扩大许可 |
| `python scripts/verify_demo_content.py` | 退出 0；1500 项内容检查、15 项定义路径有效，不是 UI 或模型验收 |

来源 formatter 的判断／未知标签使用真实映射 fact 直接检验；TXT 的语音来源和文件定位另经完整流水线检验。文件绑定测试仅给 reducer 合成材料元数据（file=null），不是实际读文件或解析器验收。第一轮临时测试错误地假设未提供字段必有一条 null fact；已改为按契约给显式 unknown 账本并另验未提供字段没有被补 0，未因此修改共享行为。

本轮未独立运行后端 12 项测试、MoneyAI 管理／分析／历史接口或提取请求；不将统筹先前通报写成本页实测。没有浏览器、截图、录屏、实际 UI／剪贴板／下载落盘、IndexedDB、手机／Figma或真实标题动画结论。统一服务存在不代表上述验收通过；本机有限参考稿不标 MoneyAI 记忆。

完成本次限定检查后停写，交新统筹集成；没有自动进入 REQ-28 布局或后续功能。

<details>
<summary>REQ-25 的 8 组纯逻辑用例（可从仓库根目录复现）</summary>

四文件归属限制下将复现代码保留在本 QA，不写共享 tests。运行以下 PowerShell 命令只创建进程内状态，不打开浏览器、不读写演示数据库：

```powershell
$qaText = Get-Content -LiteralPath 'docs/development/demo/QA_AGENT_3.md' -Encoding UTF8 -Raw
$qaSmoke = [regex]::Match($qaText, '(?s)<!-- A3-REQ25-SMOKE -->\s*```javascript\r?\n(.*?)\r?\n```').Groups[1].Value
if (-not $qaSmoke) { throw 'REQ-25 smoke block missing' }
$qaSmoke | node --input-type=module
```

<!-- A3-REQ25-SMOKE -->
```javascript
import test from 'node:test';
import assert from 'node:assert/strict';
import { createEmptyState, reduceCommand } from './demo/shared/model.js';
import { createMerchantIntakeDraft } from './demo/shared/intake-draft.js';
import { buildDemoAnalysis, buildDemoArtifact } from './demo/shared/demo-data.js';
import { activeSelection, currentArtifacts, selectPreviewArtifact, artifactPreviewText,
  makeFeedbackPayload, buildActionPack, describeActionSource } from './demo/pages/action.js';

const NOW = '2026-08-28T11:30:00.000Z';
const EDITED = '合成编辑文字：先核对商品信息和订单口径。';
const Q1_RAW = 'Q1_RAW_ONLY：这是点击次数，不是详情访客。';
function harness() {
  let serial = 0;
  const context = { newId: () => 'a3_v05_' + (++serial), now: NOW };
  let state = createEmptyState(context);
  return {
    get state() { return state; },
    send(type, payload, extra = {}) {
      const result = reduceCommand(state, { type, payload, commandId: 'a3_command_' + (++serial),
        expectedRevision: state.revision }, { ...context, ...extra });
      state = result.state;
      return result;
    },
  };
}
function draftInput() {
  return createMerchantIntakeDraft({
    sources: ['voice', 'manual'],
    transcript: '合成原始记录：我卖测试杯；这周没有订单；学生可能需要；支付订单0笔；RAW_ONLY原文标记。',
    productName: '测试杯', price: '19元', currentProblem: '这周没有订单',
    targetCustomerHypothesis: '学生可能需要',
    metrics: { productClicks: 9, createdOrders: 3, paidOrders: 0 },
    evidenceLedger: [
      { field: 'productName', value: '测试杯', status: 'confirmed_fact', source: 'voice', quote: '我卖测试杯' },
      { field: 'price', value: '19元', status: 'confirmed_fact', source: 'manual' },
      { field: 'currentProblem', value: '这周没有订单', status: 'confirmed_fact', source: 'voice', quote: '这周没有订单' },
      { field: 'targetCustomerHypothesis', value: '学生可能需要', status: 'owner_hypothesis', source: 'voice', quote: '学生可能需要' },
      { field: 'metrics.videoViews', value: null, status: 'unknown', source: 'manual' },
      { field: 'metrics.productClicks', value: 9, status: 'confirmed_fact', source: 'manual' },
      { field: 'metrics.createdOrders', value: 3, status: 'confirmed_fact', source: 'manual' },
      { field: 'metrics.paidOrders', value: 0, status: 'confirmed_fact', source: 'voice', quote: '支付订单0笔' },
    ],
  });
}
function saveIntake(h, draft, description = EDITED, sourceBindings = []) {
  return h.send('INTAKE_SET', { roundId: h.state.round.id, inputVersion: h.state.round.inputVersion,
    draft, description, sourceBindings });
}
function analyze(h) {
  h.send('FOCUS_CONFIRM', { roundId: h.state.round.id, inputVersion: h.state.round.inputVersion });
  const result = buildDemoAnalysis(h.state);
  assert.equal(result.ok, true, result.message);
  h.send('ANALYSIS_SET', { analysis: result.analysis });
}
function choose(h) {
  const analysis = h.state.analysis;
  h.send('PATH_SELECT', { analysisId: analysis.id, pathId: analysis.paths[0].id,
    inputVersion: h.state.round.inputVersion });
  const result = buildDemoArtifact(h.state);
  assert.equal(result.ok, true, result.message);
  result.artifacts.forEach((artifact) => h.send('ARTIFACT_SAVE', { artifact }));
}
function askThree(h) {
  const paid = h.state.input.facts.find((fact) => fact.key === 'paid_orders');
  const ids = [];
  for (const [questionText, status, answer] of [
    ['你说的9次是什么口径？', 'answered', { availability: 'known', rawText: Q1_RAW }],
    ['订单记录的起止日期？', 'answered', { availability: 'unknown', rawText: null }],
    ['本轮能投入多少时间？', 'skipped', undefined],
  ]) {
    h.send('QUESTION_SET', { roundId: h.state.round.id, inputVersion: h.state.round.inputVersion,
      questionId: null, status: 'asked', questionText, sourceFactIds: [paid.id] });
    const questionId = h.state.round.clarification.activeQuestionId;
    ids.push(questionId);
    h.send('QUESTION_SET', { roundId: h.state.round.id, inputVersion: h.state.round.inputVersion,
      questionId, status, ...(answer ? { answer } : {}) });
  }
  return ids;
}
function flow(withQuestions = false) {
  const h = harness(), draft = draftInput();
  saveIntake(h, draft);
  const questionIds = withQuestions ? askThree(h) : [];
  analyze(h);
  choose(h);
  return { h, draft, questionIds };
}
function pack(h, exportId = 'a3_export', allowSummaries = true) {
  return buildActionPack(h.state, { exportId, generatedAt: NOW, allowSummaries });
}
function expectInvalidated(h) {
  assert.equal(activeSelection(h.state), null);
  assert.deepEqual(currentArtifacts(h.state), []);
  assert.equal(h.state.input.confirmedVersion, null);
  assert.equal(h.state.analysis.status, 'stale');
  assert(h.state.artifacts.every((artifact) => artifact.status === 'stale'));
  assert.throws(() => pack(h), /没有当前有效/);
}

test('v0.5 + three questions preserve raw/source/snapshots without auto selection or extraction', () => {
  const h = harness(), draft = draftInput();
  saveIntake(h, draft);
  const intake = structuredClone(h.state.input.intake);
  const facts = structuredClone(h.state.input.facts);
  const ids = askThree(h);
  assert.equal(new Set(ids).size, 3);
  assert.deepEqual(h.state.input.intake, intake);
  assert.deepEqual(h.state.input.facts, facts);
  assert.equal(h.state.input.description, EDITED);
  assert.equal(h.state.input.intake.draft.transcript, draft.transcript);
  assert.equal(h.state.round.clarification.remaining, 0);
  analyze(h);
  const questions = h.state.analysis.clarificationSnapshot.questions;
  assert.deepEqual(questions.map((item) => item.questionId), ids);
  assert.equal(questions[0].answer.rawText, Q1_RAW);
  assert.deepEqual(questions[1].answer, { availability: 'unknown', rawText: null });
  assert.equal(questions[2].status, 'skipped');
  assert(questions.every((item) => item.sourceFactIds.length === 1));
  assert.equal(h.state.analysis.inputSnapshot.intake.draft.transcript, draft.transcript);
  assert.equal(h.state.analysis.mode, 'local_limited');
  assert.equal(h.state.fixtureId, null);
  assert.equal(h.state.selection, null);
  assert.equal(buildDemoArtifact(h.state).ok, false);
  assert.deepEqual(h.state.artifacts, []);
  assert.deepEqual(h.state.executionRecords, []);
  assert.deepEqual(h.state.feedbackRecords, []);
  assert.equal(facts.some((fact) => fact.key === 'product_detail_visitors'), false);
  assert.equal(facts.find((fact) => fact.key === 'product_clicks').value, 9);
  assert.equal(facts.find((fact) => fact.key === 'created_orders').value, 3);
  assert.equal(facts.find((fact) => fact.key === 'paid_orders').value, 0);
  assert.equal(facts.find((fact) => fact.key === 'video_views').value, null);
  assert.equal(h.state.input.intake.draft.metrics.addToCarts, null);
  assert.equal(facts.some((fact) => fact.key === 'add_to_carts'), false);
  assert(facts.every((fact) => !fact.id.startsWith('draft_') && fact.verification !== 'checked'));
});

test('explicit choice enables full current pack without feedback; each TXT needs consent', () => {
  const { h, draft } = flow(true);
  const before = structuredClone(h.state), artifacts = currentArtifacts(h.state);
  assert.equal(artifacts.length, 2);
  assert.throws(() => pack(h, 'without_consent', false), /确认/);
  const exported = pack(h);
  assert.deepEqual([...new TextEncoder().encode(exported.text).slice(0, 3)], [239, 187, 191]);
  assert.equal(/(?<!\r)\n|\r(?!\n)/.test(exported.text), false);
  for (const artifact of artifacts) {
    assert(exported.text.includes('artifactId: ' + artifact.id + '\r\n'));
    assert(exported.text.includes('artifactVersion: ' + artifact.version + '\r\n'));
    assert(exported.text.includes(artifact.body.replace(/\r\n?/g, '\n').replace(/\n/g, '\r\n')));
  }
  assert.equal(exported.metadata.analysisId, h.state.analysis.id);
  assert.equal(exported.metadata.pathId, h.state.selection.pathId);
  assert.equal(exported.metadata.inputVersion, h.state.round.inputVersion);
  assert.equal(exported.metadata.sourceRevision, h.state.revision);
  assert.match(exported.text, /本机有限整理／参考稿/);
  assert.match(exported.text, /语音转写 · 支付订单数/);
  assert.match(exported.text, /商家确认理解，未外部核验/);
  assert.match(exported.text, /必要风险：/);
  assert.match(exported.text, /引用资料摘要：/);
  assert.doesNotMatch(exported.text, /RAW_ONLY|Q1_RAW_ONLY|来源定位未知|undefined/);
  assert.equal(exported.text.includes(draft.targetCustomerHypothesis), false);
  assert.throws(() => pack(h, 'next_export', false), /确认/);
  const selected = selectPreviewArtifact(artifacts, artifacts[1].id + ':' + artifacts[1].version);
  assert.equal(artifactPreviewText(selected), artifacts[1].body);
  assert.equal(artifactPreviewText(selected, 'steps'), artifacts[1].usage.steps.map((step, i) => (i + 1) + '. ' + step).join('\n'));
  assert.deepEqual(h.state, before);
});

test('copy/download log commands never adopt, execute, save feedback or claim a read', () => {
  const { h } = flow();
  const artifact = currentArtifacts(h.state)[0], before = structuredClone(h.state);
  const refs = { pageId: 'action', analysisId: artifact.analysisId, pathId: artifact.pathId,
    inputVersion: artifact.inputVersion, artifactId: artifact.id, artifactVersion: artifact.version };
  h.send('EVENT_APPEND', { event: { type: 'copy_succeeded', roundId: artifact.roundId, refs } });
  h.send('EVENT_APPEND', { event: { type: 'download_requested', roundId: artifact.roundId,
    refs: { ...refs, exportId: 'a3_download', format: 'txt' } } });
  assert.deepEqual(h.state.events.slice(before.events.length).map((event) => event.type), ['copy_succeeded', 'download_requested']);
  assert.deepEqual(h.state.selection, before.selection);
  assert.deepEqual(h.state.artifacts, before.artifacts);
  assert.deepEqual(h.state.executionRecords, []);
  assert.deepEqual(h.state.feedbackRecords, []);
  assert.throws(() => h.send('ROUND_START', { feedbackId: 'not_saved' }), { code: 'invalid_transition' });
  const payload = makeFeedbackPayload(artifact, { execution: 'done', observation: 'worse',
    executedAt: '', scope: '', rawText: 'FEEDBACK_ONLY：合成自述，做过但感觉变差。' });
  assert.equal(payload.executionRecord.adoption, 'unknown');
  assert.equal(payload.executionRecord.executedAt, null);
  h.send('FEEDBACK_SAVE', payload);
  assert.equal(h.state.executionRecords[0].execution, 'done');
  assert.equal(h.state.executionRecords[0].adoption, 'unknown');
  assert.equal(h.state.executionRecords[0].executedAt, null);
  assert.equal(h.state.feedbackRecords[0].observation, 'worse');
  assert.equal(h.state.feedbackRecords[0].artifactId, artifact.id);
  assert.equal(h.state.events.some((event) => event.type === 'session_read' || event.type === 'adoption_reported'), false);
  assert.doesNotMatch(pack(h).text, /FEEDBACK_ONLY/);
  const saved = structuredClone(h.state);
  assert.throws(() => h.send('EVENT_APPEND', { event: { type: 'execution_reported', refs } }), { code: 'invalid_transition' });
  assert.deepEqual(h.state, saved);
});

test('successive corrections retain IDs/raw history and reject stale or overwritten drafts', () => {
  const h = harness();
  let draft = createMerchantIntakeDraft({ sources: ['manual'], transcript: '合成原文，保留RAW_CORRECTION。',
    productName: '合成杯子', price: '19元', currentProblem: '先核对记录', metrics: { paidOrders: 0 } });
  saveIntake(h, draft); analyze(h); choose(h);
  const original = structuredClone(draft), originalVersion = h.state.round.inputVersion;
  const priceId = h.state.input.facts.find((fact) => fact.intakeField === 'price').id;
  let previousPack = pack(h), previousVersion = h.state.round.inputVersion;
  for (const after of ['21元', '23元', null]) {
    draft = { ...draft, price: after, userCorrections: [...draft.userCorrections, { field: 'price', before: draft.price, after }] };
    saveIntake(h, draft);
    assert.equal(h.state.round.inputVersion, previousVersion + 1);
    expectInvalidated(h);
    const price = h.state.input.facts.find((fact) => fact.id === priceId);
    assert.equal(price.value, after);
    assert.equal(price.verification, 'user_corrected');
    assert.match(describeActionSource(price).provenance, /商家更正/);
    assert.equal(h.state.input.intake.draft.transcript, original.transcript);
    assert.deepEqual(h.state.input.intake.draft.userCorrections, draft.userCorrections);
    analyze(h); choose(h);
    const next = pack(h);
    assert.notEqual(next.signature, previousPack.signature);
    previousPack = next; previousVersion = h.state.round.inputVersion;
  }
  const before = structuredClone(h.state);
  assert.throws(() => h.send('INTAKE_SET', { roundId: h.state.round.id, inputVersion: originalVersion,
    draft: original, description: EDITED, sourceBindings: [] }), { code: 'stale_input' });
  assert.throws(() => saveIntake(h, original), { code: 'invalid_intake' }); // Old draft omits saved corrections.
  assert.throws(() => saveIntake(h, { ...draft, price: '旧提取99元' }), { code: 'correction_conflict' });
  assert.throws(() => saveIntake(h, { ...draft, price: '25元', userCorrections: [...draft.userCorrections,
    { field: 'price', before: '错误的前值', after: '25元' }] }), (error) => ['correction_conflict', 'invalid_intake'].includes(error.code));
  assert.deepEqual(h.state, before);
  const price = h.state.input.facts.find((fact) => fact.id === priceId);
  assert.equal(price.availability, 'unknown');
  assert.match(describeActionSource(price).summary, /未知/);
  assert(h.state.history.some((entry) => entry.type === 'intake_revision' && entry.intake.draft.price === '19元'));
});

test('free text edits stale the current choice/artifacts/TXT until saved intake and explicit reselection', () => {
  const { h, draft } = flow();
  const old = structuredClone(h.state), oldPack = pack(h), artifact = currentArtifacts(h.state)[0];
  h.send('INPUT_EDIT', { description: '合成新编辑：本轮范围已变化。' });
  expectInvalidated(h);
  assert.equal(h.state.input.intake.status, 'stale');
  assert.throws(() => h.send('FOCUS_CONFIRM', { inputVersion: h.state.round.inputVersion }), { code: 'stale_input' });
  assert.throws(() => h.send('ARTIFACT_SAVE', { artifact }));
  saveIntake(h, { ...draft, currentProblem: '另一个待核对问题',
    evidenceLedger: draft.evidenceLedger.filter((entry) => entry.field !== 'currentProblem'),
    userCorrections: [{ field: 'currentProblem', before: draft.currentProblem, after: '另一个待核对问题' }] }, '合成新编辑：本轮范围已变化。');
  analyze(h);
  assert.equal(activeSelection(h.state), null);
  assert.deepEqual(currentArtifacts(h.state), []);
  assert.throws(() => pack(h), /没有当前有效/);
  choose(h);
  assert.notEqual(pack(h).signature, oldPack.signature);
  assert(h.state.artifacts.filter((item) => old.artifacts.some((prior) => prior.id === item.id)).every((item) => item.status === 'stale'));
  assert.throws(() => pack(h, 'new_requires_consent', false), /确认/);
});

test('correcting the first answer keeps later questions and old analysis provenance without inference', () => {
  const { h, questionIds } = flow(true);
  const before = structuredClone(h.state), version = h.state.round.inputVersion;
  h.send('QUESTION_SET', { roundId: h.state.round.id, inputVersion: version, questionId: questionIds[0],
    status: 'answered', answer: { availability: 'known', rawText: 'Q1_CORRECTED：应查原记录，口径仍待核对。' } });
  assert.equal(h.state.round.inputVersion, version + 1);
  expectInvalidated(h);
  assert.deepEqual(h.state.input.intake, before.input.intake);
  assert.deepEqual(h.state.input.facts, before.input.facts);
  assert.deepEqual(h.state.round.clarification.questions.slice(1), before.round.clarification.questions.slice(1));
  assert.equal(h.state.round.clarification.remaining, 0);
  assert.equal(h.state.analysis.clarificationSnapshot.questions[0].answer.rawText, Q1_RAW);
  analyze(h); choose(h);
  assert.equal(h.state.analysis.clarificationSnapshot.questions[0].answer.rawText, 'Q1_CORRECTED：应查原记录，口径仍待核对。');
  assert(h.state.history.some((entry) => entry.type === 'analysis' && entry.analysis.clarificationSnapshot.questions[0].answer.rawText === Q1_RAW));
  assert.doesNotMatch(pack(h).text, /Q1_RAW_ONLY|Q1_CORRECTED/);
  assert.deepEqual(h.state.executionRecords, []);
  assert.deepEqual(h.state.feedbackRecords, []);
});

test('actual mapped facts keep voice/manual/paste, merchant hypothesis, confirmed understanding and unknown labels', () => {
  const { h } = flow();
  const facts = h.state.analysis.inputSnapshot.facts, byField = (field) => facts.find((fact) => fact.intakeField === field);
  assert.match(describeActionSource(byField('productName')).location, /语音转写 · 具体商品/);
  assert.match(describeActionSource(byField('price')).location, /手动填写 · 价格/);
  assert.match(describeActionSource(byField('productName')).provenance, /商家确认理解，未外部核验/);
  assert.match(describeActionSource(byField('targetCustomerHypothesis')).provenance, /商家判断，待验证/);
  assert.match(describeActionSource(byField('metrics.videoViews')).provenance, /未知，未补值/);
  assert.match(describeActionSource(byField('metrics.videoViews')).summary, /未知/);
  assert.match(describeActionSource(byField('metrics.productClicks')).summary, /商品点击次数：9/);
  assert.match(describeActionSource(byField('metrics.createdOrders')).summary, /创建订单数：3/);
  assert.match(describeActionSource(byField('metrics.paidOrders')).summary, /支付订单数：0/);
  assert.equal(byField('productName').source.locator.quote, '我卖测试杯');
  assert.equal(byField('targetCustomerHypothesis').verification, 'unreviewed');
  const pasted = harness();
  saveIntake(pasted, createMerchantIntakeDraft({ sources: ['paste'], transcript: '合成粘贴原文',
    productName: '合成粘贴商品', confirmedProductFacts: ['需回原材料核对的规格'] }));
  const product = pasted.state.input.facts.find((fact) => fact.intakeField === 'productName');
  assert.match(describeActionSource(product).location, /粘贴文字 · 具体商品/);
  const item = pasted.state.input.facts.find((fact) => fact.intakeField === 'confirmedProductFacts.0');
  assert.match(describeActionSource(item).summary, /商家确认的商品信息第 1 项/);
});

test('real file-binding reducers render text/txt offsets or lines, and CSV record 2 without shifting', () => {
  for (const [source, locator, expected] of [
    ['txt', { type: 'text', start: 0, end: 8 }, '文本位置 0—8'],
    ['txt', { type: 'txt', start: 2, end: 9 }, '文本位置 2—9'],
    ['txt', { type: 'text', lineStart: 2, lineEnd: 3, start: 0, end: 9 }, '文本第 2—3 行，位置 0—9'],
    ['csv', { type: 'csv', recordIndex: 2, lineStart: 2, lineEnd: 2, column: 'value' }, 'CSV 第 2 条记录，value 列'],
  ]) {
    const h = harness();
    h.send('MATERIAL_ADD', {}, { preparedMaterial: { name: 'synthetic.' + source,
      mime: source === 'csv' ? 'text/csv' : 'text/plain', size: 48, sha256: 'synthetic_metadata_only', file: null } });
    const material = h.state.input.materials[0];
    const draft = createMerchantIntakeDraft({ sources: [source], metrics: { paidOrders: 0 } });
    saveIntake(h, draft, '只核对这份合成文字计数', [{ field: 'metrics.paidOrders', source,
      materialId: material.id, materialVersion: material.version, locator }]);
    analyze(h); choose(h);
    const fact = h.state.analysis.inputSnapshot.facts.find((item) => item.key === 'paid_orders');
    const before = structuredClone(fact);
    assert.equal(describeActionSource(fact).location, expected);
    assert.equal(fact.source.materialVersion, material.version);
    assert(pack(h).text.includes(expected));
    assert.doesNotMatch(pack(h).text, /undefined|来源定位未知/);
    assert.deepEqual(fact, before);
  }
});
```

</details>

## REQ-23：固定标题接入（上一轮交接）

按[实施队列](IMPLEMENTATION_QUEUE.md)和当前第三页下发执行，不重新要求开工批准。仅改 `03-action.html`、`pages/action.js` 与本记录，未改 `pages/action.css`、共享文件、其他页面或 Git。

- 仅固定 `h2#delivery-title`“行动内容”添加 `data-fold-title`。HTML 引用共享 `title-motion.css`，页面模块导入共享 `enhanceFoldTitle`，没有复制共享动效源码或追加逐字样式。
- `connectPage()` 开始时显式调用增强器，随后绑定原交互并 `void boot()`；不等待动画完成，也不让动效控制器状态参与读取、复制、导出或反馈。增强器异常仍继续原业务启动。
- 控制器保留共享 `status`／`reason`／`destroy()` 语义，页面 `pagehide` 调用幂等销毁；刷新读取、内容切换和 BFCache 恢复不重新增强。初始隐藏由共享观察第一次显现，超时静态，不自行显示标题或绕过空态。
- 每文档一次／一处；400ms 与 20ms 错峰、总预算不超过 800ms，以及缺 API、减少动效、迟到、多行、字体未就绪的静态兜底均沿用共享实现，没有本页覆写参数。
- 动态行动名称、成品正文、版本／保存／错误状态、风险和副标题保持静态。没有循环、动画业务事件、React／GSAP 依赖或新外部请求。

### 本轮已执行检查与限制

| 检查 | 真实结果 |
| --- | --- |
| `node --test demo/tests/logic.test.mjs` | **29 项通过、0 失败**，含 4 项共享标题纯逻辑；也覆盖现有单问契约的输入失效、预览、整包导出与反馈组合。不等于新语音／三问链路或动画实测 |
| `node --check demo/pages/action.js` | 退出 0 |
| 本记录内三种子模块冒烟 | 再次通过；共享模型与页面纯函数都可在无 DOM 环境导入 |
| Python 静态接线检查 | 仅一个标记且是固定 h2；共享 CSS／JS 引用各一处；增强调用位于业务 boot 前且未 await；销毁回调存在；未给动态文本添加标记，未新增私有存储；UTF-8／行尾通过 |
| 仓库内容与差异 | `python scripts/verify_demo_content.py` 通过 1409 项内容检查、15 项验收定义路径；`git diff --check` 退出 0。不是 UI、模型、存储、授权或经营效果检查 |
| 本机 HTTP | 第三页 HTML、页面 JS、共享 `title-motion.js/css` 均 GET 200；只读获取文件，未打开浏览器或写入演示会话 |
| 浏览器／截图／录屏 | **未执行**。可信路径和统筹备用许可仍未解决，没有另试 Browser／Playwright、改信任或使用替代截图 |

尚待统筹真实 1920×1080 验证：有效选择首次显现、空态与超过 5 秒显现的静态回退、减少动效预设及中途切换、多行／字体／缺 API／迟到兜底、pagehide 和 BFCache 恢复、原文字节点与朗读顺序、取用不受动效阻塞。不能用上述 29 项 Node 结果声称动效、DOM 恢复或帧率已通过；本轮没有新第三页图片或短录屏。

### REQ-25 最初排队记录（历史状态）

REQ-23 交接时仅已接到新输入回归任务，三问与确认映射尚未交付；当时的 29 项不证明新链路。此限制已由本轮统筹交付 INTAKE_SET 和限定纯逻辑窗口更新，实际结果以本文件顶部 REQ-25 记录为准。语音／外部提取／浏览器／存储仍未被上述逻辑测试验证。

## REQ-20：1920×1080 PC 功能区改版（上一轮交接）

来源：新统筹转达用户对第二、三页“功能布局不明确、信息散落、像单薄 Word”的反馈。已实际查看并在进度中展示用户提供的第二页截图 `codex-clipboard-57aea48a-48d4-40e2-b913-bde20e94e5aa.png`，原图 **1891×955**；这是 PNG 像素尺寸，浏览器 CSS 视口、缩放与 DPR 未知。它是第二页证据，不能当作本轮第三页截图。本任务未增改共享 assets。已阅读[首轮视觉评审 DF-20260828-001](../design-feedback/DF-20260828-001.md)，其中第三页内容仅为用户反馈和待验标准，没有当作第三页实测结论。

本轮继续沿用 round-2 临时色彩与中文排版，不生新图、不换栈、不加编辑器、任务看板或自动执行。把阅读长文的页面重组为以下操作区域：

| 操作区域 | 改动与边界 |
| --- | --- |
| 当前路径 | 标题、轮次／输入版本、来源模式紧凑排列；本轮问题可展开核对，换路按钮独立可见，不再用大标题和整段摘要占据主要空间 |
| 选择内容 | 左侧内容选择栏，只切换当前路径内的一份产物。选择键包含 ID／版本；不派发 PATH_SELECT，不改反馈引用，不持久化页内 tab |
| 内容预览 | 单一带标题、版本、使用位置的只读窗口；“内容预览／使用步骤”切换，一次只显示当前部分，不把所有产物正文及步骤纵向铺开 |
| 取用 | 复制、手动选取就在预览工具栏。复制内容与复制步骤分别使用实际展示文本；下载明确为整条行动 TXT 包，仍含全部当前产物，并保留逐次摘要同意 |
| 核对与风险 | 独立常显区域，显示适用前提、触发／暂停／恢复条件、观察指标／口径／窗口／未知样本下限；当前产物必要限制在两种预览下都显示，不以清爽为由折叠关键风险 |
| 自愿反馈 | 与取用工作区分开，继续后置且可收起；切换预览不会让原反馈草稿关联另一份产物 |

内容选择栏使用竖向 tab，预览方式使用横向 tab；代码包括方向键、Home／End、选中状态和焦点切换。**这是代码与静态语义，不是已完成的键盘／读屏器验收。**

查看事件随新结构收紧：生成结束不再为所有产物批量写 `artifact_viewed`，仅在已保存的当前产物被预览时记录；隐藏标签页、未保存稿和历史脏稿不记当前产物查看。复制仍须重读版本且剪贴板 Promise 成功后才记 `copy_succeeded`；步骤来源只用 `artifact.usage.steps`，不把完整实验对象转成字符串，不往事件 refs 填正文或新增未约定字段。

### 本轮追加检查

- 根任务实际运行 **148 项纯函数断言**，覆盖 3 个共享种子、4 条路径：有效／失效预览键、正文与步骤文本、空／未保存产物、预览不改状态、反馈原引用、unknown、done＋worse＋空日期、复制事件不记执行、整包两份产物及隐私边界、新轮保留历史，全部通过。
- QA 内精简模块冒烟再次通过；它仍是纯内存状态，不是实际页面点击或 IndexedDB。
- `node --check demo/pages/action.js` 退出 0；根任务静态复核 **71 个唯一 HTML ID、53 个 JS 字面挂载点**，label／tab／panel 关联、关键区域不被反馈或 details 包裹、CSS 本页作用域及四文件 UTF-8／行尾检查均通过。没有执行 CSS 渲染引擎或实际焦点测试。
- 收口检查 `python scripts/verify_demo_content.py` 通过 **1335 项内容检查、15 项验收定义路径**；`git diff --check` 退出 0。统筹服务的 HTML、JS、CSS 只读 HTTP GET 均为 200。没有另开服务、暂存或提交。
- 独立只读复核另运行 130 项预览／业务纯函数断言，全部通过；未发现新的阻断性逻辑问题。这不替代根任务检查或浏览器验收。
- Browser 可信路径错误及统一备用许可尚未解决。本轮没有打开浏览器、改信任路径、调用 Playwright 或写同源测试会话；无第三页运行截图、首屏高度／布局／交互实测结论。

1920×1080 的首屏、内容切换、步骤复制、整包下载、常显风险和后置反馈需由统筹安排真实浏览器窗口。上一轮登记的公共壳宽度差异已由统筹修改；本轮只读核对 `--content-width: min(calc(90% + 48px), 1776px)` 与两侧 24px 内边距，正文目标为 90%／1728px，但未做真实画面对齐验收。本页未改共享样式。手机与 Figma 仍后置，不声明视觉获选或完整验收。

## 本轮范围与交付

只修改以下四个文件，没有改共享模块、其他页面或公共文档，没有 Git 写操作：

- [03-action.html](../../../demo/03-action.html)：空态、成品、必要风险、后置折叠反馈及本机记录。
- [action.css](../../../demo/pages/action.css)：所有页级样式限定在 `body[data-page="action"]`。
- [action.js](../../../demo/pages/action.js)：共享接口接线、取用、反馈、新轮与异常处理。
- 本文件：实际检查、未验项和交接。

依赖 [SHARED_CONTRACT](SHARED_CONTRACT.md)＋[CONTRACT_DETAILS](CONTRACT_DETAILS.md)，版本 `demo.v1`；没有自建数据库、localStorage、路由或替代生成器。公共代码、样例、测试和 Git 归新统筹“黑客松 Demo 统筹接续”。未安装依赖、换栈、引入 CDN／远程字体或真实商家接口。

已实际查看临时参考 [round-2.png](../../../demo/assets/design/intake-refinements-20260828/round-2.png)，沿用浅纸色、深墨、朱红、中文排版与留白，不再生图、不把题目当品牌。参考不是已批准的第三页图稿；1920×1080 和窄屏均未做浏览器验收。

按统筹最新通知，**先完成 1920×1080 PC 与基础链路，再进入移动阶段**。已有响应样式保留，本轮不启动手机设计／验收或 Figma。进度中已实际查看并展示上述静态参考，明确原 PNG 为 1672×941；没有用它冒充第三页运行截图。后续首屏、关键布局与主要操作的真实截图须在获准浏览器窗口中补齐。

## 当前基础行为

| 区域 | 当前代码行为 |
| --- | --- |
| 打开页面 | `loadSession` 校验当前确认版本、分析和选择；无有效选择不默认选 A、不载入案例。已确认问题时引导第二页，未确认时遵循共享门槛引导第一页 |
| 成品 | 同步 `buildDemoArtifact` 后逐项 `ARTIFACT_SAVE`；引用成功 state 的真实 ID/version/savedAt。刷新对照已存内容防重复；失败保留未保存参考文本供手动取用 |
| 复制 | 先重读版本，只有剪贴板 Promise 成功才记 `copy_succeeded`；失败保留文字及手动选取，不记采用或执行 |
| TXT | 冻结当前快照，生成后再次核对 round/input/analysis/path/稿件版本；UTF-8 BOM、CRLF、系统 ID 文件名。包含成品、来源、版本、使用步骤、必要风险与原观察计划，不导出反馈／历史／原件 |
| 导出同意 | 所有导出逐次确认当前必要摘要，不凭 `demo_fixture` 豁免；绑定版本签名，版本变化或导出操作结束后撤销 |
| 反馈 | 默认折叠且自愿；动作状态／一句观察即可记录，标签、范围、日期选填。采用／执行／观察独立，未知不补零或自动分类 |
| 保存与读回 | 新自述固定关联所报告稿件。重试沿用 commandId/payload；事务成功才显示本机保存，真实重读后才标已读取。不凭最后一条数组记录猜本次反馈 |
| 换路与新轮 | 非脏表单随上下文变化清空；脏稿仍绑定旧行动，历史引用不搬家。仅已保存反馈可 `ROUND_START`，成功后走共享导航；本页守卫重复点击，共享层负责跨标签／刷新幂等 |
| 操作日志 | 查看、读取、复制和下载请求与业务事件分开；日志失败只补记，不重做下载或复制 |

复杂成品编辑、事实／承诺改写、历史稿导出、反馈修订、指标输入和平台核验未实现，当前成品为只读参考稿。这是本轮获准的基础版，不是完整第三页验收。

## 基础版已有检查（首轮交接记录）

| 命令／检查 | 结果与边界 |
| --- | --- |
| `node --check demo/pages/action.js` | 退出 0；不证明 DOM 或交互 |
| Node 纯函数集成 | 实际共享 `model.js`／`demo-data.js`＋本页函数，3 个统筹合成种子、72 项断言通过；所有状态仅在内存，不是 IndexedDB 或浏览器测试 |
| Python 静态检查 | DOM ID 唯一、JS 挂载点和 label 目标存在；六共享文件存在；没有外链、私建存储或 `innerHTML` 注入；新页面 UTF-8 和行尾检查通过 |
| `python scripts/verify_demo_content.py` | 首轮交接检查 1157 项内容检查通过，15 项旧场景路径有效；本次改版检查见上节。脚本不验证 UI、模型、记忆、授权或经营效果 |
| `git diff --check` | 退出 0；未跟踪新文件另做文本检查，没有暂存或提交 |
| 本地 HTTP GET | `03-action.html`、`pages/action.js`、`pages/action.css` 均返回 200；只证明服务可返回文件，未执行页面 JavaScript |
| Browser | 初始化报 `Trusted RPC dependency must resolve within a configured trusted code path`，涉及 `browser-service.mjs`；运行时未建立，恢复说明入口也不可用。未打开页面，没有控制台／截图／交互结论 |

当前地址：[第三页基础页](http://127.0.0.1:4188/03-action.html)。本页没有另开服务、改端口或终止进程；只读检查了统筹同源服务的响应。浏览器故障已报新统筹，未更改信任／MCP 配置、未自行换 Playwright；备用验证许可由统筹统一处理，不重复索要。

### 可复现的模块冒烟命令

下面是基础行为及本轮预览检查的精简复现，范围小于完整 148 项追加检查；从仓库根目录用 PowerShell 执行。仅使用统筹合成种子，不写浏览器存储，也不等于页面实际点击。

```powershell
@'
import assert from 'node:assert/strict';
import {createEmptyState, reduceCommand} from './demo/shared/model.js';
import {buildDemoAnalysis, buildDemoArtifact} from './demo/shared/demo-data.js';
import {activeSelection, currentArtifacts, selectPreviewArtifact, artifactPreviewText, makeFeedbackPayload, buildActionPack} from './demo/pages/action.js';
let n = 0;
const context = {newId: () => 'qa3_' + (++n), now: '2026-08-28T06:30:00.000Z'};
for (const fixtureId of ['underbed_complete_v1','one_sentence_v1','scope_conflict_v1']) {
  let state = createEmptyState(context);
  const apply = (type, payload) => {state = reduceCommand(state, {type,payload}, context).state;};
  assert.equal(activeSelection(state), null);
  apply('LOAD_FIXTURE', {fixtureId});
  apply('FOCUS_CONFIRM', {inputVersion:state.round.inputVersion});
  apply('ANALYSIS_SET', {analysis:buildDemoAnalysis(state).analysis});
  assert.equal(activeSelection(state), null);
  apply('PATH_SELECT', {analysisId:state.analysis.id,pathId:state.analysis.paths[0].id,inputVersion:state.round.inputVersion});
  for (const artifact of buildDemoArtifact(state).artifacts) apply('ARTIFACT_SAVE', {artifact});
  const artifacts = currentArtifacts(state);
  const artifact = artifacts[0];
  const alternate = artifacts[1];
  const beforePreview = JSON.stringify(state);
  assert.equal(selectPreviewArtifact(artifacts, `${alternate.id}:${alternate.version}`), alternate);
  assert.equal(selectPreviewArtifact(artifacts, 'old:1'), artifact);
  assert.equal(selectPreviewArtifact([], null), null);
  assert.equal(artifactPreviewText(alternate), alternate.body);
  assert.equal(artifactPreviewText(alternate, 'steps'), alternate.usage.steps.map((step, i) => `${i + 1}. ${step}`).join('\n'));
  assert.equal(JSON.stringify(state), beforePreview);
  apply('FEEDBACK_SAVE', makeFeedbackPayload(artifact, {execution:'done',observation:'worse',rawText:'',scope:'',executedAt:null}));
  assert.equal(state.executionRecords[0].execution, 'done');
  assert.equal(state.executionRecords[0].adoption, 'unknown');
  assert.equal(state.executionRecords[0].executedAt, null);
  assert.equal(state.feedbackRecords[0].observation, 'worse');
  assert.throws(() => buildActionPack(state, {exportId:'qa3_deny',generatedAt:context.now,allowSummaries:false}));
  const pack = buildActionPack(state, {exportId:'qa3_export',generatedAt:context.now,allowSummaries:true});
  assert.equal(pack.text.charCodeAt(0), 0xFEFF);
  assert.equal(/(?<!\r)\n/.test(pack.text), false);
  assert.ok(pack.text.includes('artifactId: ' + artifact.id));
  apply('ROUND_START', {feedbackId:state.feedbackRecords[0].id});
  assert.equal(activeSelection(state), null);
  assert.equal(state.executionRecords[0].artifactId, artifact.id);
}
console.log('PASS: A3 module and preview smoke over 3 shared seeds; no browser/IndexedDB checks.');
'@ | node --input-type=module
```

## 八项页面验收：没有整项浏览器通过

| 编号 | 已有证据 | 尚未执行 |
| --- | --- | --- |
| A3-01 | 取用事件不改变执行的纯函数断言；正文／步骤文本与预览无副作用断言；真实 API 调用与折叠反馈代码 | 从第二页进入、切换产物及步骤、剪贴板成功／拒绝、实际下载与日志补记 |
| A3-02 | 空会话、仅分析未选择时无有效行动；HTTP 200 | 直达第三页并点击安全引导 |
| A3-03 | partial／done＋worse＋executedAt=null，采用 unknown、时间独立、缺计数=[] 断言 | 浏览器表单保存及读回 |
| A3-04 | 同操作重试对象保留；响应未确认使用中性提示 | IndexedDB 保存／刷新／禁用／失败／提交后响应丢失／去重 |
| A3-05 | 纯函数新轮保留历史版本；审查修复旧反馈表单与导出同意跨版本残留 | 输入变更、换路、跨标签及脏稿离开 |
| A3-06 | 新轮索引递增、选择清空、历史保留；仅使用已保存反馈 | 实际双击、跨标签／刷新幂等与导航 |
| A3-07 | TXT BOM／CRLF／安全文件名／元数据／风险／不导出反馈历史断言 | 真正触发下载并打开落盘文件；不能把内存字符串当实际导出文件 |
| A3-08 | label、tab／panel关联、CSS 作用域、焦点／减少动效／窄屏规则静态检查 | 1920×1080工作区及1440×900／1280×720补充回归、键盘tab与方向键、实际排版、控制台及截图；390px按最新顺序后置 |

待实测主链：显式载入合成案例 → 第一页确认 → 第二页显式选路 → 第三页取用 → 自愿记录完成＋变差、日期留空 → 保存 → 刷新真实读回 → 带反馈再分析。部分执行、未知原话、空选择、换路与失败恢复另走分支；这段是复现计划，不是已点击记录。

截图位置：无。已查看的 round-2 仅是临时参考，没有实现截图可供并排比较，不声明最终视觉一致。

## 已修复问题与交接边界

- 修复了换路后旧表单值可能写入新行动的问题；脏稿保留原引用，非脏表单重置。
- 导出同意逐次且绑定版本。曾复现合成例实质修改后仍沿用 `demo_fixture` 的共享来源问题，已报统筹；当前共享文件已加入输入变更／自述反馈清除 fixtureId 的处理，本页不改共享实现，浏览器回归仍待完成。
- 空观察原话在共享层保存为 `''` 时，仅规范匹配比较，不改原重试载荷。不用最后一条数组记录猜保存结果；歧义时让用户选择已保存记录。
- 保存错误可能是提交响应丢失，提示为“尚未确认保存结果”，保留同一操作重试。
- 共享壳与导航仍由统筹集成；请重点实测保存中页头导航、清空／载入示例与脏稿守卫。
- 本轮未重复 MCP 前检，未读取付费组件源码、安装组件、改配置或新增外部调用。没有真实模型、MoneyAI 记忆、经营效果或完整视觉验收。

本页基础代码交接后停止，等待新统筹集成或通知获准的浏览器验证；不进入其他页面、共享模块或后续功能。

<details>
<summary>历史前检快照（REQ-10／REQ-16 前，仅用于追溯）</summary>

以下保留的是此前未获准基础编码时的记录；其旧状态不覆盖上面的本轮交付。

更新：2026-08-28。**前置核查已进行；页面未实现，A3-01—A3-08 均未执行。** 本文不是 UI、剪贴板、下载、存储、模型或经营效果的通过记录。

## 1. 本轮范围与文件归属

- 用户本轮明确要求阅读并推进 `PROMPT_AGENT_3.md`，本记录据此接收第三页任务；不将任务下发解释为全部 Demo 取舍、第三页历史问题或视觉方案已获批准。
- 已阅读根约定、开发入口、当前基线、资料收件区、Demo 入口、第三页 prompt、共享契约、视觉简报、MCP 约定、验收矩阵、第三页讨论稿及 V0.4 复用边界。收件区当前仅登记 V0.4 共享摘要，没有新增的范围或视觉批准记录。
- 本轮只新增本文件，不创建第三页 HTML/CSS/JS，不修改共享文件、需求基线或 READY 表；本轮下发状态由统筹统一登记。
- 依赖契约：`demo.v1` **提案**；没有已验证的共享实现版本。视觉参考：未获选，没有可对照的批准图稿。
- 启动时 Git 工作区干净；核查途中陆续出现其他并行工作的 `QA_AGENT_1.md`、`QA_AGENT_2.md`，未修改、暂存或提交这两个文件。页面 Agent 不执行 pull、切分支、commit 或 push。

## 2. 开工门槛：尚未满足

以 [Demo 入口](README.md) 的 READY 表及实际文件为依据，不以文档中的未来接口代替可运行模块。

| 门槛 | 本轮观察 | 对第三页的影响 |
| --- | --- | --- |
| Demo 范围 | `DEMO_SCOPE_APPROVED=否` | 待统筹登记用户对本轮取舍的确认；本页不自行批准 |
| 统一视觉 | `VISUAL_APPROVED=否`；没有已批准母版路径 | 不能独立选择主题、生成另一套三页风格或开始 UI 实现 |
| 共享底座 | `SHARED_READY=否`；实际 `demo/` 不存在 | 无可导入的状态、导航、公共壳、演示生成器或公共样式 |
| 第三页下发 | 本轮用户已明确下发；公共表仍为 `AGENTS_DISPATCHED=否` | 已接任务，但其余门槛仍须满足；公共表由统筹维护 |
| MCP 前检 | 21st 与 React Bits 本会话实际检索成功 | 仅证明资源检索可用，不代表组件集成或视觉通过 |

实际用 `Test-Path -LiteralPath` 检查的缺失项：

```text
demo/
demo/shared/tokens.css
demo/shared/base.css
demo/shared/shell.js
demo/shared/state.js
demo/shared/navigation.js
demo/shared/demo-data.js
demo/samples/
demo/tests/
demo/assets/design/
```

因此没有启动静态服务，也没有可打开的第三页。共享约定的未来地址为 `http://127.0.0.1:4188/03-action.html`，**本轮未运行、未访问，不是已交付预览链接**。

## 3. 设计能力与 MCP 实测

已读取当前环境可用的 Build Web Apps `frontend-app-builder`、Product Design `index` 及其约束。它们要求先有获选视觉目标；本页遵守仓库由统筹统一选型的分工，未开始图稿生成、脚手架或服务启动。

| 工具与参数 | 实际返回 | 使用边界 |
| --- | --- | --- |
| `mcp__21st__search`：`query="copy button"`、`type="component"`、`limit=2` | 2 条免费元信息：Copy Button，ID `10224`（tom_ui）、`24659`（motiondotdev） | 候选用途为复制操作反馈；未读取付费源码、未安装、未集成、未验证视觉 |
| `mcp__reactbits__get_project_registries` | 包含 `@shadcn` 与 `@react-bits` | 当前连接可发现所需注册表；未修改本机配置 |
| `mcp__reactbits__search_items_in_registries`：`registries=["@react-bits"]`、`query="FadeContent"`、`limit=2` | 16 个匹配，返回 `FadeContent-JS-CSS`、`FadeContent-TS-CSS` | 候选用途为主动展开反馈区时的轻量过渡；不做虚假保存动画 |
| 同工具：`query="Stepper"`、`limit=2` | 56 个匹配，返回 `Stepper-JS-TW`、`Stepper-JS-CSS` | 只参考必要步骤的状态表达，不引入强制分步问卷或替换共享导航 |

旧文档记录的 React Bits 注册表错误本轮没有重现；这不证明其他对话连接也已刷新。检索返回的 `Add command` 为 `[object Promise]`，没有执行该字段，也没有将检索成功写成安装成功。

仅发送通用组件关键词，未外发商家资料、私密原件或密钥。资源候选尚未选用；许可证、依赖、原生 HTML 适配与实际视觉均未验证。没有引入 React、npm、CDN、远程字体或新增付费调用。

## 4. 向统筹提出的共享交接缺项

以下是对 [共享契约](SHARED_CONTRACT.md) 的待落实细节，不修改公开接口，也不由本页定义替代状态。

| 所需交接 | 具体缺口或应提供的证据 | 关联验收 |
| --- | --- | --- |
| 获选第三页视觉与共享样式 | 公共壳、token、来源/风险提示、空态及反馈/保存状态参考；附批准图稿路径 | A3-01、02、08 |
| 生成器及命令 schema 示例 | `buildDemoArtifact(state)` 的返回结构、单项/多项产物、必要事实缺失及失败形态；`ARTIFACT_SAVE`、`FEEDBACK_SAVE`、`ROUND_START` 的可调用样例 | A3-01、03—06 |
| 编辑与保存语义 | 仅改口吻和改价格/规格/承诺/行动范围如何按共享机制区分；保存事务完成后实际保存时间从哪里读取，不能用 `reportedAt` 或 `executedAt` 冒充 | A3-03—05 |
| 事件词表与版本引用 | 除已明定的 `download_requested` 外，查看、剪贴板成功、保存及读回的确切事件名、允许字段和 `refs` 结构尚未列全；页面不能各造一套 | A3-01、04、06、07 |
| TXT 导出约定 | 契约第 7 节明确 TXT，但尚未规定 prompt 要求的编码、文件命名及来源标签格式；需统筹统一，不能另造分析报告 | A3-07 |
| 合成种子与失败注入 | 三类种子的 ID/载入方式、合法选路状态、存储禁用/写入失败/读取失败/冲突注入及恢复方法；不得拿预写反馈当历史读回 | A3-02—06 |

共享底座还须提供 [契约第 8 节](SHARED_CONTRACT.md) 要求的实际验证记录。现有 `fixtures/` 素材不等于已实现的共享种子加载器、IndexedDB 或页面集成。

## 5. 第三页验收：全部待执行

以下为 READY 后的复现要求。使用统筹提供的隔离合成会话，不清空真实商家资料，不把预写内容当实际反馈。

| 编号 | 后续复现与检查重点 | 本轮结果 |
| --- | --- | --- |
| A3-01 | 从第二页显式选路进入，只显示对应产物；不填反馈即可复制/导出。检查成功与剪贴板拒绝分支、手动取用，以及采用/执行状态没有被取用操作改变 | 未执行：无页面、选路和共享模块 |
| A3-02 | 在没有有效 selection 的合成会话直达第三页；只引导第二页，不默认选 A、不展示预载历史或虚构成品 | 未执行：无页面及空会话种子 |
| A3-03 | 主动记录部分执行与变差，不填执行时间；核对 `execution=partial`、`observation=worse`、`executedAt=null`，反馈时间独立，采用仍按实际陈述记录 | 未执行：无反馈表单和保存接口 |
| A3-04 | 保存后刷新并真实读回；分别注入禁用存储、写入/读取失败，重试相同记录。检查事务完成前不报成功、草稿保留、无重复正式记录 | 未执行：无 IndexedDB 实现及失败注入 |
| A3-05 | 保存原版本执行记录，再修改输入或回第二页换路；检查旧产物只读/失效、旧执行引用不变；有未保存编辑时提示保存或明确放弃 | 未执行：无版本机制和导航守卫 |
| A3-06 | 显式携带已保存反馈再分析，重复点击同一反馈；仅创建一个新 round，保留版本与原话，不把没变化解释为失败或已回滚 | 未执行：无 `ROUND_START` 实现 |
| A3-07 | 实际导出并打开 TXT，核对正确行动、稿件版本、来源、演示标签及必要风险；只记录 `download_requested`，不声称文件已落盘 | 未执行：无导出文件；编码/文件名待统筹明确 |
| A3-08 | 按 QA_MATRIX 检查 1440×900、1280×720、390px 窄屏，键盘、焦点、触达、文本可读性、减少动效和控制台；同尺寸对照获选母版 | 未执行：无页面、母版或浏览器截图 |

截图位置：无。浏览器操作、导出文件内容检查、网络离线检查与视觉对照均未运行；不能用下方静态检查替代。

## 6. 实际静态检查与交接

| 命令/检查 | 结果 | 能证明什么 |
| --- | --- | --- |
| `git status --short` | 已执行；启动干净，后续发现其他 Agent 的 QA 文件并保留 | 仅工作区变动快照，不证明应用可用 |
| `rg --files -g AGENTS.md -g QA_AGENT_3.md -g 'docs/development/demo/**'` | 已执行；写入前本页 QA 文件不存在 | 核对文档与文件归属 |
| `Test-Path -LiteralPath` 检查第 2 节路径 | 全部返回 `False` | 共享运行文件缺失 |
| `python scripts/verify_demo_content.py` | 退出 0；`PASS: 922 content checks; 15 acceptance definitions have valid fixture paths.` | 仅仓库素材/文档检查；脚本明确输出 UI、模型、MoneyAI 记忆、授权及经营效果检查未运行 |
| `git diff --check` | 退出 0，无输出 | 仅 Git 文本差异检查，不覆盖未跟踪文件内容 |
| Python 单独读取新增 QA 文件并检查行尾 | 退出 0；UTF-8 可读取、无行尾空白、文件以换行结束 | 补检尚未跟踪的本文件；未暂存文件 |

本轮交付仅为本前置核查记录。没有页面实现、共享模块变更、依赖安装、Git 提交/推送或真实数据接入。下一步由统筹确认范围与统一视觉，交付并验证共享底座及上述必要细节，更新 READY 后再继续第三页实现；不自动进入其他页面或后续功能。

</details>
