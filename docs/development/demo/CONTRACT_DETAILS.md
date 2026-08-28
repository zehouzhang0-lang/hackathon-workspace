# demo.v1 共享契约补充细则

> 当前发布口径（REQ-31，2026-08-29）：冲突处以[最新PRD执行基线](PRD_V1_EXECUTION.md)和[队友测试版本](../../team-testing/LATEST_DEMO.md)为准。下方REQ-30段落保留当时批次记录。
> 当前XLSX支持原件接收及已知指标列本机解析，XLS旧格式仅接收，OCR仍未接通；FEEDBACK_DETAILS_VERSION=1及C7/C8共享逻辑已实现，第三页C7/C8按钮已接线但真实浏览器／事务仍未验，C6反馈附件事务未发布。代码存在不等于浏览器、存储或MoneyAI验收通过。

更新：2026-08-28。依据：[主契约](SHARED_CONTRACT.md)、三页 [QA1](QA_AGENT_1.md)／[QA2](QA_AGENT_2.md)／[QA3](QA_AGENT_3.md) 及对应 prompt。

**最小 Demo 已按[需求基线 REQ-10](../CURRENT_BRIEF.md)接受；本文于2026-08-28由新统筹完成文档审查，与主契约一并启用为实施约定，未做运行验证。** 视觉未最终批准，基础实现按用户最新REQ-16启动；本文不批准全部历史业务方案或真实外部能力。

本文保留demo.v1和原有命令；REQ-25由统筹统一追加INTAKE_SET与V0.5辅助接口，三页按主契约及本细则整体接入，不能自行选取片段或另建schema。原作者的两项局部修订已完成并定向复核，公共文件和共享实现由新统筹唯一负责。

## 1. 公共约定与 API 边界

- 保存对象只含 JSON 值；二进制仍走 Blob 存储。未知用 `null`，没有条目用 `[]`，不以空字符串、`0` 或 `false` 代替未知。
- 非空实体 ID、操作 ID 和草稿临时 ID 均为无业务含义标识，限定 `[A-Za-z0-9_-]{1,80}`；不能用文件名、商家原话或金额生成。组合来源标识 `sourceId` 另按第 4 节校验。
- `commandId`、`exportId` 由调用方在一次新操作开始时生成，例如 `crypto.randomUUID()`；共享层校验格式、用途、会话归属及重用规则。它们是操作关联标识，不要求先在实体表分配，也不能冒充 questionId、analysisId 等业务引用；同操作重试沿用原 ID，用户明确发起另一操作才新建。
- 会话、轮次、材料、问题、分析、产物、执行、反馈和事件等持久实体 ID 由共享层分配；新记录按相应命令传 null 或不提供 ID，首次发问规则见第 3 节。只有成功 Result 中的 state 才提供已保存实体，后续引用保持真实 ID，不猜下一条 ID。
- 解析／纯生成器需先建立内部关系的新事实、约束、路径、假设、树节点等，可使用 `draft_` 前缀的局部 ID；它们只在本份命令草稿中标识对象，不用于跨页、事件或下载。共享层在既有 dispatch 事务内统一分配持久 ID 并映射结构化引用，规则见第 8 节；不新增分配 API。既有实体引用仍须在相应状态或历史快照中解析。
- 时间戳为系统 UTC ISO 字符串；业务日期为 `YYYY-MM-DD` 或 `null`，不把日期擅自扩成某一执行时刻。所有数字必须有限；计数、金额、比率的单位不能靠显示文案猜测。
- `loadSession()`、`dispatch(command)` 仍返回 `Promise<{ok:true,state}|{ok:false,code,message,state?}>`。失败时的 `state` 仅在已安全读到时提供，不用空状态掩盖读取失败。
- `loadSession()` 无记录时可返回尚未保存的空状态：`revision=0,savedAt=null`；已有记录必须真实读回。创建空状态不显示“已读取历史”。
- `subscribeSession(listener)` 的回调参数也是上述 Result；订阅不代替首次 `loadSession()`，不立即重复回调。事务成功后通知；跨标签收到通知后由共享层重读，读失败通知错误。注销函数停止通知，页面不可在订阅回调中无条件写事件。
- `getMaterialBlob(materialId)` 保持 `Promise<Blob|null>`；不存在／原件已删除才返回 `null`，存储或读取故障 reject 带 `code` 的错误，不把故障伪装成无原件。
- `navigateTo`、`registerNavigationGuard`、`mountShell` 的名称及参数保持主契约不变；共享导航先处理草稿，再核对目的页门槛。纯生成器返回结构见第 8 节。
- 保留既有错误码；补充 `invalid_payload`、`unsupported_type`、`file_limit`、`duplicate_material`、`invalid_structure`、`incompatible_version`、`generation_failed`。错误说明为纯文本，不能夹带原件或本机路径。

## 2. 保存时间、版本与幂等

| 字段／操作 | 补充语义 |
| --- | --- |
| `state.savedAt` | `string|null`，最近一次成功存储事务的时间标记；不代表每个业务记录都在此时修改 |
| `analysis/artifact/executionRecord/feedbackRecord.savedAt` | 首次保存或该版本生成时由共享层写入；旧记录时间不跟随刷新、查看、下载而改变 |
| `reportedAt`／`executedAt` | 前者是提交自述的系统时间；后者只来自明确提供的实际执行时间，可为 null。均不得替代 savedAt |
| `revision` | 每次实际成功事务加 1；只读、失败、完全无变化的命令及幂等重放不加 1 |
| `inputVersion` | 描述、材料增删替换、事实／限制更正、补问答案内容、新 round，以及下述已确认或已有有效下游后的实质投影变化使版本加 1；一个命令内最多加一次 |
| 解析／整理结果 | `MATERIAL_RESULT_SET`、`ORGANIZATION_SET` 在确认前且无有效下游时可作为当前输入的投影，不额外加 inputVersion；必须匹配启动时的 round/inputVersion 及相关材料版本。已确认或存在有效下游后，接受结果若实质改变事实、范围、约束或影响判断的缺口，须同事务加一次 inputVersion、撤销确认并失效下游；纯状态或无变化不加 |
| 非输入操作 | 单纯 asked/skipped、浏览、选路、产物口吻版本、复制、下载、保存反馈不加输入版本；新反馈经 ROUND_START 才成为下一轮输入 |

保存时间由共享层在事务写入时取本机时钟，只有事务 complete 后才有效并可对外显示；不是精确提交瞬间、可信审计时钟或云端时间。页面不得传入 `savedAt` 冒充成功。

所有输入变更沿用主契约：清确认、旧分析和产物标 stale、归档并清当前选择。替换同版本分析也归档原分析／选择并失效其产物；执行／反馈仍引用原版本。

投影是否改变输入，应与提交时已保存的有效输入比较：事实值、影响判断的来源／口径、本轮范围、约束、重要未知项的新增或消除均属于实质变化；仅解析进度、显示格式或错误提示变化不属于。不能把“未解析”变成已提取事实仍称为纯状态更新。只更换草稿临时 ID 或重排无语义顺序不构成新输入；材料事实更正走FACT_PATCH；九组理解的明确更正走INTAKE_SET及其更正链。普通自动投影仍不能覆盖已保存更正。

允许带待解析材料确认并完成有限分析，但其后接受上述实质投影时，投影、inputVersion、确认撤销、分析／选择／产物失效及必要历史须一起成功或一起回滚。该结果属于新输入版本；此前快照生成的分析、产物或其他投影不得仅改版本号后提交，必须从新的成功状态重新计算。确认前投影没有额外输入版本，也不豁免启动版本校验。

解析等待期间若只发生确认、浏览或分析保存，inputVersion 可能不变而 revision 已变；冲突后须重读，仅在原 round/inputVersion/材料版本仍匹配时，才可用最新 expectedRevision 重试原结果。不得把旧任务携带的输入或材料版本替换成当前值来绕过 stale_input。

`commandId` 按会话去重。格式校验后，共享层先查已提交命令，再做 expectedRevision、额度与实体 ID 分配检查：同 ID、同 type 和原始规范化 payload 返回当前状态，不重复写入；同 ID 改载荷拒绝 `invalid_transition`。仅未提交的新命令检查 expectedRevision；冲突需重读并提示，不能静默覆盖。重试不另造 commandId，File 载荷以实际字节摘要参与比对。

幂等依据保留调用时 payload 中的 `questionId:null` 和 `draft_` 局部引用，不能被保存结果中的真实 ID 回写替换；载荷与实体映射在事务内分开处理。提交前 abort 不留下半条实体或已提交命令记录；提交后响应丢失时，以原 commandId/原 payload 重试或重读，不能另造操作来猜测失败。expectedRevision 不参与业务载荷等同比较；失败冲突后可依前述规则重读并更新它，不能修改原任务版本或正文。

ROUND_START 对 `feedbackId` 额外去重，即使 commandId 不同，同一已保存反馈也只创建一个 round；跨标签、刷新或重试不清此映射。新一轮获得最多三问的新预算，旧题/答案随原轮归档，不能重用旧问题回答当新反馈。

## 3. 最多三次补问、原话与未知（REQ-25）

在原round.clarification上向后兼容扩展，不另开状态库或长问卷：

```json
{
  "limit": 3,
  "questions": [{
    "questionId": "q-1", "status": "asked",
    "questionText": "这轮能投入多少时间？", "sourceFactIds": [],
    "askedAt": "2026-08-28T02:00:00.000Z", "answeredAt": null, "answer": null
  }],
  "activeQuestionId": "q-1", "remaining": 2,
  "status": "asked", "questionId": "q-1",
  "questionText": "这轮能投入多少时间？", "sourceFactIds": [],
  "askedAt": "2026-08-28T02:00:00.000Z", "answeredAt": null, "answer": null
}
```

这是合成结构示例，不指定真实下一题。questions保留本轮至多3条历史；一次最多一个asked，activeQuestionId指向该题，remaining=3-questions.length。顶层旧questionId/status等只是兼容投影：当前asked优先，否则最后一题，空历史为unused。新页面与报告使用questions，不再把别名当全量历史。

旧单问会话在读取时转换成0或1条历史，保留原ID/正文/答案；不加revision/inputVersion/savedAt、不生成保存事件。下一次真实业务写入才持久化新外形；未知旧结构报incompatible_version，不截断或丢弃。

| QUESTION_SET payload（新调用均附roundId/inputVersion） | 保存与版本规则 |
| --- | --- |
| `{questionId:null,status:"asked",questionText,sourceFactIds}` | 仅无当前asked且remaining>0时创建；共享层同事务分配ID、占额度、记录事件/幂等。重复正文拒绝；成功state读取真实ID，首次重试仍传原null |
| `{questionId,status:"answered",answer:{availability:"known",rawText:"今天约二十分钟"}}` | 保存该题原话，内容真变一次inputVersion+1并失效下游；同答案no-op，不自动推断数值/永久限制 |
| `{questionId,status:"answered",answer:{availability:"unknown",rawText:null}}` | 已回答但不知道，保留缺口；不填零，不再造一题 |
| `{questionId,status:"skipped"}` | 当前asked转skipped，仍占已问额度；可显式问下一题。单纯跳过不加inputVersion；重复跳过no-op，不能用跳过删除已回答内容 |

每条题可asked→answered/skipped、skipped→answered、answered→answered；已问正文/来源/ID不可改。用户主动修订本轮较早答案不重设后续题或额度，另一个当前asked仍保留。旧轮题不能作为当前回答提交，但其原文留在历史与分析快照中。

answer为null或`{availability:"known"|"unknown",rawText:string|null}`；known要非空原话，unknown可null，原话上限20000字符。单条问题正文≤2000字符。来源事实必须存在；数量上限是安全约束，不要求用满3问。

**一次回答只执行QUESTION_SET。** 不自动拼回description、不再次INTAKE_SET，不把questionId塞进draft.sources。已保存九组草稿原文保持原样，确认时使用最新inputVersion。用户随后主动改九组才是新的INTAKE_SET动作。当前有限生成器保留问题快照，不声称已将任意回答真实AI提取为事实；需要派生事实时另走对应当前版本投影，保留`locator.questionId`，不能假装原始转写。

修改答案会归档并移除该题旧派生事实及依赖；input.unknowns用`{id,description,reason,sourceId}`，reason为not_provided/unknown/skipped/conflicting/unparsed，`sourceId="question:<questionId>"`关联并复用同一缺口。修改后不重发额度。ROUND_START才有下一轮预算。

```js
// 仅说明调用；真正发问/回答须用户处在相应步骤。
const askCommand = {
  type: 'QUESTION_SET', expectedRevision: state.revision, commandId: crypto.randomUUID(),
  payload: {roundId: state.round.id, inputVersion: state.round.inputVersion,
    questionId: null, status: 'asked', questionText: '这轮能投入多少时间？', sourceFactIds: []}
};
const asked = await dispatch(askCommand);
// 结果不明保留原commandId/payload；不能将已分配ID写回首次asked重试。
if (asked.ok) {
  const id = asked.state.round.clarification.activeQuestionId;
  // 在实际回答动作中使用id、最新revision及原回答启动的round/inputVersion。
}
```

## 3.1 V0.5经营草稿、确认与单一映射

原始包version为v0.5-intake-1，保留既有字段与来源类别。草稿是可编辑理解内容，不把九组变成长必填表；未知用null/[]，不猜值：

```json
{
  "version": "v0.5-intake-1", "sources": [], "transcript": "",
  "merchantName": null, "productName": null, "category": null,
  "price": null, "specifications": null, "platform": null, "desiredAction": null,
  "targetCustomerHypothesis": null, "usageScenarioHypothesis": null,
  "purchaseReasonHypothesis": null, "differentiationHypothesis": null,
  "currentProblem": null,
  "confirmedProductFacts": [], "proofMaterials": [], "previousAttempts": [],
  "constraints": [], "customerQuestions": [], "unknowns": [],
  "metrics": {"windowStart": null, "windowEnd": null, "videoViews": null,
    "productClicks": null, "addToCarts": null, "createdOrders": null, "paidOrders": null},
  "evidenceLedger": [], "userCorrections": []
}
```

- sources只含voice/paste/txt/csv/json/manual且不重复；transcript保留原始转写≤20000字符，编辑文字另存input.description。没有识别时不能填合成句或把手工编辑冒充麦克风原话。
- 普通单值字段为string|null（price保持原文，不强转数字），每项≤4000字符；六组数组为非空string条目数组、每组≤100项。日期是真实YYYY-MM-DD或null；计数为非负安全整数或null，0必须来自明确值。拒绝未知字段、缺字段、非JSON值、空洞数组、访问器、非法日期、NaN等。
- evidenceLedger条目为`{field,value,status,source,quote?}`，status=confirmed_fact/owner_hypothesis/unknown；字段路径须存在，原话quote保持可定位，不把老板判断升级为客观观测。账本/更正/绑定各≤300项。
- userCorrections为有序`{field,before,after}[]`；已持久化的整份数组必须按原顺序完整保留为前缀，只追加新记录，不能只提交最近一次更正。单值用productName等路径；指标用metrics.paidOrders；数组用previousAttempts.0等。基于已保存快照的更正链必须连续，末值匹配新草稿；明确删除用合法历史数组路径和after:null，对应最终已不存在的索引；同时移除当前已失效的evidenceLedger/sourceBindings，不能保留悬空字段。前缀/链/绑定不合法返回invalid_intake；保护后草稿与事实仍不一致才返回correction_conflict。无新合法更正链的自动投影不覆盖已存user_corrected。原始转写及历史更正不被新值改写。
- 外部FACT_PATCH可能使intake草稿仍为A、同intakeField的当前user_corrected事实已为B。恢复时须先读当前状态并向用户展示旧理解A与当前更正B；只有用户明确重核对该项后，才以B作为本次字段编辑基线。保留已存完整userCorrections前缀及fact_correction历史，新改成C只追加B→C；不伪造A→B、不自动重放旧草稿或更换其输入版本。保存须核对打开时的fact ID/值、round/inputVersion，变化则重新核对；数组对应或类型不明确时显示冲突并拒绝猜测。该恢复仍通过INTAKE_SET一次保存，不新增API或放宽校验。
- sourceBindings不塞入包schema，随INTAKE_SET一并传`{field,source,materialId?,materialVersion?,locator?}[]`。文件source须绑定当前已保存材料ID/version、匹配扩展名和定位；CSV记录/行列、JSON pointer、TXT文字区间或行号按实际解析器提供。缺文件定位不能伪装成voice/manual；voice/manual/paste不能携带文件ID。
- 默认自述locator=`{type:'intake',field,source,quote}`。事实source.kind仍用现有merchant_statement/file_extract等体系，不添加假模型来源；confirmed_fact表示用户确认理解，不表示外部核实。Hypothesis字段及owner_hypothesis保留判断标签，不参与观测漏斗或成功概率。
- mapConfirmedIntakeToAnalysisInput只返回完整合并projection，不写库。保留外部材料事实/未知/更正；同文件键、材料版本、定位及值相同复用原ID和口径，不添加intakeField抢材料归属；同定位值冲突须明确更正，不能重复两份事实。自述事实带intakeField，删除时有外部引用则保留未知位置，不能留悬空ID。
- productClicks映射product_clicks而非商品详情访客；createdOrders映射created_orders而非paid_orders；价格原文不是可算货币，缺单位/对象/窗口/渠道/群体保持未知。九组文本不做“缺单位”的指标检查。

INTAKE_SET的原子语义：先严格校验draft与完整projection，再以当前round/inputVersion和expectedRevision检查保存；原文、编辑文字、sources/账本/更正及事实/限制/未知一起成功或失败。一次实质改变inputVersion+1、清确认、失效分析/选择/产物；原input.intake与编辑文字进入intake_revision历史。内容完全一致不制造版本或保存时间；有序账本、更正链与原文不做无语义排序。

已保存input.intake外形为`{draft,sourceBindings,status:'current'|'stale',roundId,inputVersion,savedAt}`。其roundId/inputVersion指保存理解时的语境，不自动随问答/新轮改成“重新提取”；新轮临时限制仍按现有scope失效，不从旧draft自动续期。FOCUS_CONFIRM确认最新版本，不代表事实真实性。

INPUT_EDIT、九组对应FACT_PATCH、关联材料删除/替换使理解stale；重新核对后INTAKE_SET才能确认。导航onSave需同时保存原始transcript与description、来源、更正及未提交材料；接口不可用或任一保存失败返回false，不能仅INPUT_EDIT便清voice dirty。重试保留原操作ID、载荷与快照，跨轮或输入变化需显式处理旧草稿。

提取客户端及后端形状见主契约第4.1节。当前extractionReady=false；返回手动可编辑回退，不是AI成功。服务可用与材料/模型/费用授权两项都满足才允许发出原文；当前无真实语音、外部提取或MoneyAI记忆验收。

## 4. 来源、字段定位与事实

`sourceId` 仅允许以下形式；共享导航解析类型和已登记 ID，不把值拼成 CSS 选择器、文件路径或任意 URL：

| sourceId | 第一页定位 |
| --- | --- |
| `input:description`／`input:focus` | 当前描述输入／本轮关注范围 |
| `material:<id>` | 对应材料卡片与原件预览 |
| `fact:<id>` | 对应事实及更正入口；再由 fact.source 找原件／原话 |
| `question:<questionId>` | 已保存问题原话；本轮使用questions查找，历史使用对应round/analysis.clarificationSnapshot。查看不触发补问，尚无历史界面时不造可用入口 |

缺失或历史 ID 显示“来源已更新／原件已移除”，保留其他输入，不跳到一个名字相似的文件。URL 不包含 locator、摘录、指标值、对象名称或访问令牌。

`fact.source` 保留原字段并补 `materialVersion:number|null`；locator 用判别对象：`{type:"input",field:"description"|"focus"}`、`{type:"question",questionId}`、`{type:"text",lineStart,lineEnd}`或`{type:"text"|"txt",start,end}`（字符偏移从0起）及`{type:"intake",field,source,quote}`、`{type:"csv",recordIndex,lineStart,lineEnd,column}`、`{type:"json",pointer}`、`{type:"correction",factId,inputVersion}`。行号／记录号从 1 起，CSV 表头为第 1 个记录；JSON pointer 只定位已读取结构，不执行表达式。非材料来源的 materialId/materialVersion 为 null；没有原文定位时 locator=null，note 必须说明出处或不可核对原因。

图片没有 OCR 时只能定位材料，不能伪造文字框坐标。materialVersion 与当前原件版本不符时只显示历史摘要，不用新 Blob 冒充旧证据。派生值需在 note 写可核对算式，并补 `sourceFactIds`；公共参考 note 写已核对出处，不能因带链接即称已验证。

`fact.window={start,end}`，二者可 null；`subject/channel/cohort/unit` 为字符串或 null。verification 取 `unreviewed|user_corrected|checked|conflicting`，checked 仅表示对应原文／算式已核对，不证明商家数据真实。FOCUS_CONFIRM 不批量改 verification。

FACT_PATCH 保留 fact.id，原值／来源进入 history；更正条目为 `{type:"fact_correction",factId,inputVersion,reason,before,after,at}`，before/after 是不含 Blob 的事实快照，供 correction 定位。商家更正的新来源是 merchant_statement，原提取不能被改写成原文件本来就有此值。推断放在分析依据中，不伪装为已核对 fact。

## 5. 文件接收、重复与替换

- REQ-30 C2首批统一最多6份、单份10,000,000字节、总计20MiB（MiB=1024×1024字节），覆盖旧5MiB规则。使用state.js公开MATERIAL_LIMITS和getMaterialCapability；接收、预览、解析是分别声明的能力。检查实际File.size；拒绝一份不丢弃同批已成功文件。
- material 补 `version`（初始 1）与内部 `sha256`；以当前会话中相同 size＋实际字节摘要判重复，不以文件名判重。摘要不外发、不作为商家身份、不放进报告。
- 同名不同内容允许添加并提示“同名材料”；同内容改名拒绝 `duplicate_material` 并指向既有材料，不增加数量或 inputVersion。文件名始终按文本显示。
- 一批文件按用户接收顺序逐份走 MATERIAL_ADD，上一份完成后用最新 revision；逐份返回结果，不新增批量写库 API。限额／重复判断须在提交前按最新已存状态重检。
- MATERIAL_REPLACE 使用“总量−旧文件＋新文件”算体积，数量不增加；保持 material.id，成功后 version 加 1，清旧 Blob／解析投影并失效依赖。替换成相同字节为无变化；与另一个现存材料重复则拒绝。
- 取消、超限、解码或存储失败都不能删掉旧版本。替换与移除只留历史元数据／必要摘要，不在历史快照藏 Blob 或 data URL；新原件不能被旧 locator 引用。
- MATERIAL_RESULT_SET 补 `materialVersion`，与启动时 inputVersion 一并校验；材料删除／替换或输入改变后迟到的结果拒绝为 stale_input，不能恢复旧 Blob 或原来的解析状态。
- REQ-30允许新PNG/JPEG接收，保留WebP兼容及TXT/CSV/约定JSON。核验扩展名、可用MIME和实际可解码内容，不能只信文件名；新旧图片无OCR仍needs_review。XLSX/XLS接收和解析待接通，HTML/SVG/PDF/视频不接收。
- material新增可选userCategory，unknown/content/product/transactions/ads仅为用户标注；旧记录缺省只读显示unknown。ADD/REPLACE可传该字段，新字节替换默认unknown；同字节替换无变化。MATERIAL_CATEGORY_SET须带roundId/inputVersion/materialId/materialVersion/userCategory，真实变化保存前后类别并失效下游；不改事实、真实性、Blob身份和material.version。详见[主契约C2](SHARED_CONTRACT.md)。

## 6. UTF-8 与解析白名单

统一严格 UTF-8 解码，允许开头一个 BOM；解码异常／NUL 等疑似二进制不猜编码、不乱码提取，保留已接收原件并说明原因。读取失败为 failed；内容可读但非约定结构／部分信息不明为 needs_review。

| 格式 | 可实现的最小边界 |
| --- | --- |
| TXT | 展示真实全文及行号，默认 facts=[]、needs_review；“文本已读取”不等于业务已识别。不按关键词套入床底箱答案，用户主动核对后才另存事实 |
| CSV | 逗号分隔，支持双引号包裹、`""` 转义、引号内换行和 CRLF/LF；重复表头或损坏引号结构拒绝自动提取，保留原文 |
| CSV 表头 | 仅 `metric,value,unit,subject,window_start,window_end,channel,cohort`；表头仅去 BOM 和首尾空白，区分大小写、不猜别名。metric 必需，其余缺列／空值为 null 并列缺口；未知列不映射，可保留白名单列的有效值并标 needs_review |
| 数值／口径 | CSV value 仅接受无货币符号／千分位的有限十进制数；空值为 unknown，明确 `0` 才是零。无效单元格保持未知并指出行列；对象／日期／渠道缺失不妨碍保留实际值，但不能据此拼漏斗 |
| JSON | 顶层只接受 `schema,metrics`，schema 必须为 `demo.metrics.v1`，metrics 为数组。每项白名单与 CSV 八列一致，metric 为非空字符串；value 为有限 number 或 null，其余为 string 或 null；缺可选键补 null，不作字符串转数字 |

JSON 示例（只展示上传格式，不是完整 AppState）：

```json
{"schema":"demo.metrics.v1","metrics":[{"metric":"paid_orders","value":0,"unit":"笔","subject":null,"window_start":null,"window_end":null,"channel":null,"cohort":null}]}
```

JSON 未知根键／条目键、错误类型或 schema 不匹配，整体不自动提取，标 needs_review 并展示原因及可读原文；语法损坏为 failed。绝不导入 AppState、fixtureId、分析、历史、事件或上传文件指定的脚本。

日期须为有效日历日期；无效日期转为未知并列警告，起止颠倒保留冲突而非调换。整份符合结构且无警告才标 parsed；CSV 坏行可保留其他有效行，缺 metric 的行不猜指标、只记缺口。JSON 结构校验不通过时不做部分提取。原文、字段位置与被保留的值必须一致。

## 7. 路径、估算与完整业务树

以下嵌套结构由共享生成器统一输出，页面和报告不另猜字段。数组允许为空但须在 limitations 说明缺项，未知数值用 null。

| 类型／字段 | 最小结构与规则 |
| --- | --- |
| `Condition` | `{text,sourceFactIds,assumptionIds}`；text 非空，引用可核对。未知阈值写未知，不补固定样本数 |
| `path.action/prerequisites` | action 为具体动作文本，prerequisites 为 `{...Condition,status:"met"|"unmet"|"unknown"}[]` |
| `path.cost` | `{money,time}`，两者为 `{value,unit,basis,sourceFactIds,note}`；unit 分别 CNY/minute，basis=`known|scenario|unknown`，未知 value=null。预算不是保证最大损失 |
| `path.risk` | `{id,description,trigger,stop,restore,sourceFactIds,assumptionIds}[]`；trigger/stop/restore 为 Condition 或 null，null 须说明未知；无依据不填概率 |
| `evidenceRefs/counterEvidence` | `{id,kind,factIds,sourceIds,summary,calculation}[]`；kind=`observation|calculation|inference`，calculation 为可复核文本或 null；推断明确标注，反证与支持使用同样结构 |
| `estimate.target/horizon` | target=`{metric,unit,subject,channel,cohort}`，horizon=`{description,start,end}`；未知字段 null，不把“未来100名可比访客”改成保证几天见效 |
| `estimate.assumptions` | `{id,label,value,unit,sourceFactIds,note}[]`；示例参数明确写“合成演示条件”；无事实依据的假设不能说是本店测得 |
| `estimate.calculation/values` | calculation=`{method:"visitors_times_rate",displayFormula:"期望订单=可比访客×假设支付率"}`；values 为 `{id,label,visitorAssumptionId,rateAssumptionId,value}[]`，结果由引用参数相乘复算，不 eval 字符串公式 |
| `estimate.kind/limitations/incrementalEffect` | kind 仅 scenario/unavailable；limitations 为字符串数组；incrementalEffect 固定 `{kind:"unavailable",reason:"无法估计行动增量"}`，不把情景差额当收益 |
| `path.experiment` | `{change,keepFixed,target,window,minSample,sourceFactIds,assumptionIds,limitations,stopConditions,restoreConditions}`；C5新增可选minSampleUnit、guardrails与restoreSteps。change为单一修改对象，keepFixed为文本数组，target/horizon同上（字段名window），minSample为正数或null；minSampleUnit为文字，四类条件为Condition数组，旧字段缺失不自动补造 |

scenario 必须至少有一个可复算的 values 项；每个参数引用存在、访客非负、假设支付率在 0—1，口径适用性在 assumptions/limitations 中明确。100×0/1/2% 得到的是条件下期望 0/1/2 单，不是实际结果必落在 0—2，也不是行动提升。非此方法或缺少合理假设时为 unavailable：calculation=null、values=[]，limitations 写明原因。

factIds/sourceFactIds 只解析相应分析输入版本的事实快照；assumptionIds 只解析本路径 estimate.assumptions。缺引用为 invalid_structure，不能转成无来源的一段“已核实”文案。

树统一为 `{rootId,nodes,edges,notApplicableBranches}`：

- node=`{id,kind,title,detail}`，kind=`decision|next_step`；decision 是经营观察问题，next_step 是具体继续／核实／暂停／恢复动作，不是页面导航。
- edge=`{id,from,to,branch,condition}`，condition 为 Condition。branch 白名单：`not_executed|insufficient_evidence|risk_triggered|comparable_positive|comparable_unchanged|comparable_negative`。
- not_executed 仅指明确反馈 not_started；未反馈／execution=unknown 走信息不足，不推定从未执行。正向／负向分支必须保留观察期、口径与样本限制，不等于建议已证实有效／失败。
- 适用的六类分支必须有边；确实不适用时用 `notApplicableBranches:[{branch,reason}]` 说明，不能以此隐藏未知或负面风险。风险与变化重叠时在条件正文写清先检查哪一项，不把两者当互斥事实。
- 仅支持有向根树：ID 唯一、根入度为 0、其他节点入度为 1、全部可达、无环、边端点存在；decision 至少两条有明确条件的出边，next_step 无出边。一个 branch 可在不同判断节点出现，不能靠重复标签代替完整条件。
- 不支持的 kind、断边、错误根、环、未覆盖且无理由的分支使结果为 invalid_structure；不输出“完整业务树”的部分成功报告。页面折叠不影响导出所有节点、边及文字条件。

## 8. 生成器、产物与反馈保存

两个生成器为同步纯函数，只读取传入快照，不调用模型、读写数据库、发事件或导航；空／缺资料是合法有限结果，程序错误不得伪装成合成成功。

新草稿对象可用 `draft_f1`、`draft_path1`、`draft_node1` 等无业务含义的局部 ID 建立内部引用；同一草稿内唯一。纯生成器按固定遍历顺序生成局部编号，不读取时钟或随机数；顶层 AnalysisDraft/ArtifactDraft 的 id 仍为 null，调用方操作 ID 不从生成器索取。

`INTAKE_SET`、`MATERIAL_RESULT_SET`、`ORGANIZATION_SET`、`ANALYSIS_SET`、`ARTIFACT_SAVE` 在原有提交事务中按 schema 校验并映射新对象及其引用，包括 sourceFactIds、assumptionIds、rootId/from/to、参数引用及 `fact:<id>` 等来源标识；不对正文做字符串替换。已存实体引用不重分配；重解析按 materialId/materialVersion/locator/key 对应既有事实，复用 fact.id 且不覆盖商家更正。其他语义相同的投影也应复用原实体，不能因临时编号不同制造新输入。

重复局部 ID、缺失目标或越界引用使整份草稿为 invalid_structure；不先保存半张树。成功业务记录不残留 `draft_` ID/引用，页面只从返回 state 取后续路径、来源和产物引用。内部幂等登记仍按第 2 节保留原命令载荷；它不是可用于业务导航的实体状态。同 commandId 重放不重新分配 ID，提交失败则不对外提供已保存 ID。

| 接口 | 成功／失败形式 |
| --- | --- |
| `buildDemoAnalysis(state)` | `{ok:true,analysis:AnalysisDraft}` 或 `{ok:false,code,message}`；draft 与 analysis 字段一致，但 id/savedAt=null；ANALYSIS_SET 验证 round/input/确认后分配 ID、时间并保存 |
| `buildDemoArtifact(state)` | `{ok:true,artifacts:ArtifactDraft[],limitations:string[]}` 或同形失败；0/1/多项按行动实际需要，缺必要商品事实可返回空数组＋核对缺口，不编承诺 |

AnalysisDraft 的 status 仅 ready/limited/insufficient；没有可支持行动时 paths=[]。未确认输入／失效选择报 invalid_transition 或 stale_input，非法结构报 invalid_structure，执行异常报 generation_failed。mode 仅 demo_fixture/local_limited；fixtureId 本身不是套用旧答案的凭证，资料实质变化后必须依据当前输入重算或降级。

ArtifactDraft 采用原 artifact 字段，新稿 `id=null,version=0,savedAt=null`；kind=`copy|checklist|experiment_plan`，body 为纯文本，usage=`{placement,steps,risks}`（文本、文本数组、文本数组）。补 mode 与 editedByUser，持续显示演示／有限参考稿来源。

ARTIFACT_SAVE仍逐项接受`{artifact}`；新稿保存后共享层生成id/version=1。**当前实际只读已有稿**：原id/version且body/title/usage完全相同时无变化，否则返回invalid_transition；已有稿追加version+1尚未实现，不能按历史设计目标开放编辑。旧稿与执行引用保持不变。

editKind为历史编辑设计目标，不是当前已经实现的许可出口；传wording也不能绕过只读保护。价格／规格／售后承诺／行动范围变化应回资料确认并重新分析，不靠关键词或一个选项声称语义已验证。C5当前检查usage的placement为文字、steps/risks为文字数组，事实引用仍须存在。

FEEDBACK_SAVE 的两个记录可以一项为 null，但不能都为 null；没有陈述的 adoption/execution/observation 分别保持 unknown。两者同时新建时，只有 round/path/artifact版本一致才能原子关联 executionRecordId；仅反馈时此引用可 null。新增记录 id=null，由共享层分配并在返回 state 中读取，不从猜测的下一条 ID 取值。

执行／反馈补 `analysisId,inputVersion,savedAt`，其引用由所报告的已保存产物确定，不随当前选择搬家。metrics 使用已解析指标的 value/unit/口径结构，未报计数为 []；observedWindow 使用 `{start,end}`，未知日期 null。当前 Demo 只追加自述记录，不覆盖已经用于建轮的反馈，不另建完整反馈修订流程。

```js
// 示例仅说明调用组合；变量来自当前共享成功结果，不能直接运行本文占位数据。
await dispatch({type: "ARTIFACT_SAVE", payload: {artifact: artifactDraft}, expectedRevision: state.revision, commandId});
await dispatch({type: "FEEDBACK_SAVE", payload: {executionRecord, feedbackRecord}, expectedRevision: latestState.revision, commandId: feedbackCommandId});
await dispatch({type: "ROUND_START", payload: {feedbackId: savedFeedbackId}, expectedRevision: savedState.revision, commandId: roundCommandId});
```

新轮携带事实与已保存的执行／观察，过期临时限制不自动续期；沿用问题且无冲突时可确认新版本，新增资料有冲突则确认置空、回第一页。没有反馈不能靠旧卡片生成“真实历史”，保存成功也不等于读回成功。

## 9. 事件词表与 refs

| 写入者 | type 与实际触发条件 |
| --- | --- |
| 页面 EVENT_APPEND | `page_viewed`、`path_viewed`、`source_viewed`、`artifact_viewed`：对应内容实际显示／展开；渲染重跑不自动重复记录 |
| 页面 EVENT_APPEND | `copy_succeeded`：剪贴板 Promise 成功；`download_requested`：实际触发浏览器下载请求；二者均不改变选择／采用／执行 |
| 页面 EVENT_APPEND | `session_read`：显式 loadSession 确实读回已存记录后至多一次；订阅刷新不自动追加，日志失败不抹掉读回事实 |
| 共享命令事务内生成 | `clarification_asked/clarification_answered/clarification_skipped`、`path_selected`、`artifact_saved`、`feedback_saved`、`round_started`：只在对应状态实际改变时产生，页面不再双写 |
| 共享命令事务内生成 | `adoption_reported`、`execution_reported`、`observation_reported`：FEEDBACK_SAVE 收到明确相应陈述时分别记录，默认 unknown 不造事件；不声称平台核验 |
| 共享命令事务内生成 | `session_saved`：业务数据成功存储时的标记，与业务事件同事务；EVENT_APPEND 本身不再生此事件，避免递归 |

event 仍为 `{id,type,roundId,at,refs}`。refs 白名单为 pageId、questionId、analysisId、pathId、inputVersion、artifactId、artifactVersion、materialId、sourceId、executionRecordId、feedbackId、stateRevision、exportId、format；仅提供该事件相关字段，未知省略，不存原话、文件名、金额、Blob URL 或完整快照。

共享层校验引用与事件归属；页面不能用 EVENT_APPEND 伪造共享层专属事件。下载日志示例：`{type:"download_requested",roundId:"r-1",refs:{analysisId:"a-1",pathId:"p-1",inputVersion:3,exportId:"e-1",format:"html"}}`，其中 e-1 仅为调用方 exportId 的示意值，事件 id/at 由共享层补齐。exportId 校验格式与导出关联，不要求预先存在对应 artifact；日志命令另有调用方 commandId，同次补记沿用原两个 ID，不重新触发下载。

日志写入失败时说明“操作已发生，操作记录未保存”，不能撤销已经复制的文本／发出的下载，也不能为补日志再次触发下载。无 `download_completed`、自动采用、自动执行或自动回滚事件。

## 10. HTML／TXT 导出元数据与隐私

- 导出前重读并核对 round/input/analysis/path，以及 TXT 的各 artifact/version；冻结成功读到的快照，生成后再次校验其仍有效才发请求。当前页不导出 stale 为当前报告；本轮不额外建设历史导出功能。
- 两种文件都带 `exportVersion=demo.export.v1`、contractVersion、exportId、generatedAt、sourceRevision、roundId/index、inputVersion、analysisId、pathId、mode、fixtureId；TXT 另列 artifactId/version/savedAt。metadata 是普通文本，不是回读状态入口。
- 报告文件不再作为 artifact 入库，不保存第二份完整 HTML／原件副本；以已保存分析快照＋download_requested 的引用定位。exportId 由调用方在此次导出开始时生成；同次准备/日志重试沿用，用户明确再次导出才新建，不更改分析、选路或执行状态。
- HTML：UTF-8、声明 charset，固定静态 CSS、完整树文字版；所有动态内容转义，不含脚本、事件属性、远程字体／图片／追踪／链接执行能力。打印交给浏览器，不声称已生成 PDF。
- TXT：UTF-8（带 BOM），统一 CRLF；包括行动成品、使用位置／步骤、事实依据摘要、必要风险、计划和来源标签，不另输出第二套分析报告。
- 安全文件名：`path-report-r{index}-i{inputVersion}-{pathId}-{UTC时间}.html`／`action-pack-r{index}-i{inputVersion}-{pathId}-{UTC时间}.txt`；时间格式 `YYYYMMDD-HHmmss`，只用系统 ID，不用商家名或原件名。
- 两类文件顶部明确“合成演示”或“本机有限整理／参考稿”，给出输入／产物版本及未知限制；真实提交的商家自述不得标为已核验事实，合成来源不自动升级为真实模型能力。
- 默认导出白名单：本轮问题摘要、所选查看路径的动作／证据摘要／反证／假设／算式／成本／风险／实验／完整树，或所选行动的已保存成品及必要依据。来源仅用内部 ID、类型、行列／字段定位与获准的短摘录。
- 不导出 Blob、原始附件、完整导入文本、全量历史／事件、未选路径、文件本机路径、密钥／身份信息／原始流水。真实材料仅纳入用户在本次导出中明确同意的必要摘要；未确认部分保留“摘要未获确认”，不凭上传推定可对外分享。本轮验收只用合成素材。
- 下载只发生在本机浏览器；不自动上传。提示用户本机下载不等于云同步／对外授权，删除应用里的材料不能撤回已经导出的文件。临时对象 URL 用后释放，不把 URL 当持久下载地址。

## 11. 登记与实施边界

统筹已核对迟到实质投影的原子失效、首次questionId:null、commandId/exportId归属、draft_引用映射及重试顺序，在主契约登记。合成种子、失败注入、实现顺序和SHARED_READY证据由共享底座计划负责，本文不以schema示例代替这些交付。

无需再向用户重复询问单选、HTML/TXT、先取用再自愿反馈等已接受的 Demo 取舍。仍需用户／团队确认的是统一视觉、真实目标商家和素材权限、真实经营指标／观察期／可用方法及后端／模型接入；这些未决事项不能被本草案默认值冻结。

本文件没有应用实现、真实数据、UI、解析、事务、下载或读回的验证结论；后续必须按现有QA_MATRIX与三页QA实测。原作者准备批次未运行应用或同步Git；新统筹后续实施与同步另记，不能把本文审阅通过登记为运行通过。
