# 三页共享契约｜demo.v1

状态：2026-08-28新统筹已完成文档审查，本文与[补充细则](CONTRACT_DETAILS.md)一并作为本轮实施约定；契约版本仍为demo.v1；保留原公开API与命令，REQ-25追加INTAKE_SET及草稿/提取辅助接口，不另建状态库。用户已要求先跑通基础版本，实施与完整验收状态分开登记在[入口READY表](README.md)。变更只能由统筹同步通知三页，不能由一页私自改接口。

细则补齐补问/答案、来源、文件去重/解析、路径/树/估算、纯生成器、事件/导出；迟到实质投影失效和ID分配/幂等两项修订已定向复核。本文的最小字段表不是另一套schema，完整嵌套字段以细则为准；[实施计划](SHARED_BUILD_PLAN.md)中的待执行测试不能当运行通过。

## 1. 文件归属与依赖

| 写入者 | 允许的应用路径 | 交接路径 |
| --- | --- | --- |
| 统筹 | `demo/shared/**`、`demo/assets/**`、`demo/samples/**`、`demo/tests/**`、`demo/README.md`、`server/**` | 本目录共享文档、根进度与Git |
| Agent 1 | `demo/01-intake.html`、`demo/pages/intake.css`、`demo/pages/intake.js` | `docs/development/demo/QA_AGENT_1.md` |
| Agent 2 | `demo/02-decisions.html`、`demo/pages/decisions.css`、`demo/pages/decisions.js`、`demo/pages/report.js` | `docs/development/demo/QA_AGENT_2.md` |
| Agent 3 | `demo/03-action.html`、`demo/pages/action.css`、`demo/pages/action.js` | `docs/development/demo/QA_AGENT_3.md` |

页面CSS均在对应`body[data-page="intake|decisions|action"]`下作用，不改`:root`、全局按钮和字体。共享壳由`shared/shell.js`输出；HTML引用`shared/tokens.css`、`shared/base.css`、自己的CSS/模块。不得复制三个全局样式表。

共享底座的最小文件：`tokens.css`、`base.css`、`shell.js`、`state.js`、`navigation.js`、`demo-data.js`。统筹可以在`shared/`内部拆文件，但下面的公开接口不变。页面Agent不得为赶进度重做这些模块。

REQ-23附加纯UI增强：`title-motion.js/css`由统筹维护，页面为一个固定h1/h2添加`data-fold-title`并在业务异步启动前调用`enhanceFoldTitle(heading)`，返回`status`/`reason`/`destroy()`控制器，不await动画。每文档一次；迟到/多行/缺API静态，初始隐藏可等首次显现。它不写业务状态、事件或存储，不变更下面的demo.v1业务API；真实动画未验。

REQ-25覆盖旧一问额度：同轮最多3问、一次1问，questions保留每个问题/答案/来源，activeQuestionId和remaining由共享层计算；旧单问记录只读兼容，不在加载时制造保存。V0.5原文、编辑文字及九组理解通过INTAKE_SET一次保存，接口见第4.1节与补充细则。代码检查、页面接线与浏览器验收分别记录，不能只改limit或以文档宣称全流程可用。

REQ-21新增独占例外：“视觉反馈与动效评审”任务负责`docs/development/design-feedback/`和`demo/assets/design/feedback/`，只收件/评阅，不改其他公共文件或应用/Git；统筹集成前先收交接，不同时写其在途目录。三页页面写入归属不变。

2026-08-28实现快照：六文件和内部model/seeds/draft-guards/test-hooks已存在，Node纯逻辑与HTTP检查已有证据，IndexedDB/Blob/跨标签仍待浏览器实测；见[集成检查](QA_INTEGRATION.md)。本轮第三页先交只读成品，复杂编辑/事实改写的完整artifact版本机制仍待后续，不把规范全部写成已实现。MoneyAI通过`server/`的项目后端和`shared/moneyai.js`进入工作流，业务尚未接通；纯生成器保持无副作用，详见[集成记录](MONEYAI_INTEGRATION.md)。

## 2. 三页跳转

| 操作 | 条件、写入与去向 |
| --- | --- |
| 打开第一页 | 无会话则空白；不自动载入虚构商家。用户点击“载入演示案例”才装载明确标注的示例 |
| “就看这个问题” | 至少有描述或已接收材料；先保存整理结果并确认当前inputVersion，再进第二页；没读清的材料可以带未知进入有限分析 |
| 直达第二页 | 没有已确认输入时显示短空态和“先说说情况”；不得自动编案例或硬跳转丢参数 |
| 第二页浏览/下载 | 不改变所选路径，不创建执行记录 |
| 第二页“就做这件事” | 显式选择当前有效analysis中的path，保存selection后进第三页 |
| 第二页证据纠错 | 回第一页，传`sourceId`定位；不删除已填描述和其他材料 |
| 直达第三页 | 没有当前有效选择时引导第二页；不能默认替选第一条 |
| 第三页“换个方案” | 回第二页；旧产物和执行历史仍关联旧path/version，不挪到新路径 |
| 第三页“带着反馈再分析” | 反馈已保存才显式建立新round；保留历史，回第二页。重复点击同一反馈只建一轮 |
| 顶部步骤导航/浏览器后退 | 导航不代表选择/采用/执行；有未保存编辑先提示，允许重试保存或明确放弃该草稿后离开 |

路径页ID统一为`intake`、`decisions`、`action`。URL只允许页面名与来源定位ID；不得在URL写商家原话、金额、原件内容或登录信息。

## 3. 统一会话状态

最小外形如下。内部字段是系统维护的对象，**不是要求老板填写的表单**：

```json
{
  "contractVersion": "demo.v1",
  "sessionId": "uuid",
  "fixtureId": null,
  "revision": 0,
  "savedAt": null,
  "round": {
    "id": "uuid",
    "index": 1,
    "inputVersion": 1,
    "clarification": {"limit": 3, "questions": [], "activeQuestionId": null, "remaining": 3, "status": "unused", "questionId": null, "questionText": null, "sourceFactIds": [], "askedAt": null, "answeredAt": null, "answer": null}
  },
  "input": {
    "description": "",
    "focus": null,
    "confirmedVersion": null,
    "materials": [],
    "facts": [],
    "constraints": [],
    "unknowns": [],
    "intake": null
  },
  "analysis": null,
  "selection": null,
  "artifacts": [],
  "executionRecords": [],
  "feedbackRecords": [],
  "history": [],
  "events": []
}
```

| 对象 | 约定字段与语义 |
| --- | --- |
| material | `id,name,mime,size,status,sourceKind,blobKey,error,version,sha256`；状态为received/parsed/needs_review/failed；文件名不是可信内容，摘要不导出 |
| fact | `id,key,value,availability,unit,subject,window,channel,cohort,source,verification`；availability=known/unknown/not_applicable，未知值为null；0只能来自明确值。九组投影另带intakeField/evidenceStatus；confirmed_fact仍只是商家已确认理解，非外部核实，owner_hypothesis仍为老板判断 |
| input.intake | `null`或`{draft,sourceBindings,status,roundId,inputVersion,savedAt}`；draft.version=v0.5-intake-1，status=current/stale。保存原始转写、证据账本和更正链，编辑文字另在input.description；不存音频 |
| fact.source | `kind,materialId,locator,note`；kind=merchant_statement/file_extract/derived/public_reference/scenario_assumption；locator为文本片段、CSV行列或其他可定位位置 |
| constraint | `id,description,value,unit,scope,sourceFactIds`；金额和时间未知用null；临时限制有本轮scope，不变成永久商家属性 |
| analysis | `id,roundId,inputVersion,status,mode,summary,paths,limitations`；status=ready/limited/insufficient/stale；mode=demo_fixture/local_limited/real_model；real_model只允许经MoneyAI项目通路验证后启用，当前拒绝伪造 |
| path | `id,title,action,prerequisites,cost,risk,evidenceRefs,counterEvidence,estimate,experiment,tree`；数组长度可变，不硬编码必须有A/B |
| selection | `analysisId,pathId,inputVersion,selectedAt`；与实际执行无关 |
| artifact | `id,version,roundId,analysisId,pathId,inputVersion,status,kind,title,body,usage,sourceFactIds`；status=current/stale；实际口吻变更追加新版本，同内容不制造版本 |
| executionRecord | `id,roundId,pathId,artifactId,artifactVersion,adoption,execution,scope,executedAt,reportedAt`；adoption=unknown/intended/partial/declined，execution=unknown/not_started/partial/done，executedAt可null |
| feedbackRecord | `id,roundId,pathId,artifactId,artifactVersion,executionRecordId,observation,rawText,metrics,observedWindow,reportedAt`；observation=unknown/better/unchanged/worse；计数/窗口可以未知 |
| event | `id,type,roundId,at,refs`；只记录实际操作；下载请求记download_requested，不能自动说文件已落盘 |

没有反馈的初始执行与结果都为unknown。“用了”只保存原话，范围不明就保持未知。`reportedAt`由系统记，`executedAt`绝不默认取点击时刻。状态冲突保留原话/提示，不能偷偷补齐。

`fixtureId`仅在显式LOAD_FIXTURE后设置；普通上传不能因商品名相似就套入该案例答案。示例被实质修改后，生成器必须依据当前资料重算/降级，不能继续回传旧预编写结论。

## 4. 模块接口与写入规则

`shared/state.js`的固定公开接口：

```js
loadSession() // Promise<Result<AppState>>，不存在可建空会话；读取失败不能假装首次访问
dispatch({ type, payload, expectedRevision, commandId }) // Promise<Result<AppState>>
subscribeSession(listener) // 返回unsubscribe；回调Result，成功事务后通知；不替代首次load
getMaterialBlob(materialId) // Promise<Blob|null>；缺原件才null，读取故障reject带code错误
```

`Result`为`{ok:true,state}`或`{ok:false,code,message,state?}`；错误码至少含`storage_unavailable`、`read_failed`、`write_failed`、`conflict`、`stale_input`、`invalid_transition`。dispatch只接受命令，不允许页面用整份旧快照覆盖数据库。

| 命令type | payload关键字段 | 限制 |
| --- | --- | --- |
| LOAD_FIXTURE | `fixtureId` | 仅明确的载入示例操作，覆盖现有会话需确认；来源保持合成 |
| INPUT_EDIT | `description` | 内容真变才递增inputVersion；已有九组理解会标stale；不能只保存description便清除语音原文的未保存状态 |
| INTAKE_SET | `roundId,inputVersion,draft,description,sourceBindings` | 严格校验v0.5-intake-1及完整合并投影，同事务保存原文/编辑文/来源/更正；实质变化一次inputVersion+1并失效下游；不覆盖外部材料事实或其他未知 |
| MATERIAL_ADD / MATERIAL_REMOVE | `file` / `materialId` | ADD的File只在本机处理并转Blob；metadata与Blob一并保存，REMOVE删除Blob并失效依赖 |
| MATERIAL_REPLACE | `materialId,file,inputVersion` | 原子替换；取消或失败保留旧Blob与状态，成功才变更输入版本 |
| MATERIAL_RESULT_SET | `materialId,materialVersion,roundId,inputVersion,status,facts,error` | 保存实际解析结果；核对启动轮次/输入/材料版本，过期/已删除任务拒绝，实质迟到投影按第5节失效，失败不删原件 |
| FACT_PATCH | `fact,reason` | 保留来源及更正记录；不能替换为无出处“事实” |
| ORGANIZATION_SET | `focus,facts,constraints,unknowns,roundId,inputVersion` | 只接收对应版本的整理结果，不覆盖用户更正；不能把分析结论写成事实 |
| QUESTION_SET | `roundId,inputVersion,questionId,status,questionText,sourceFactIds,answer` | 新页面带轮次/输入快照；每次新asked传questionId:null，保存后共享层分配ID。当前问回答或跳过后才可问下一题，至多3题；跳过仍占额度，历史回答可主动更正；不把同一答案再自动INTAKE_SET |
| FOCUS_CONFIRM | `inputVersion` | 确认本轮关注范围和可用资料，不是验证所有提取值 |
| ANALYSIS_SET | `analysis` | roundId与inputVersion必须当前且已确认；迟到旧响应拒绝 |
| PATH_SELECT | `analysisId,pathId,inputVersion` | 路径存在、版本有效且用户显式选择 |
| ARTIFACT_SAVE | `artifact,editKind` | 新生成稿可省略editKind，编辑已有稿须声明；实质事实/承诺变化回输入更正，不覆盖旧版本 |
| FEEDBACK_SAVE | `executionRecord,feedbackRecord` | 原子保存，一次可只填原话/部分状态；不得代填样本或回滚 |
| ROUND_START | `feedbackId` | 只读取已保存反馈；同feedbackId幂等；归档上轮后建立新轮 |
| EVENT_APPEND | `event` | 浏览/复制/下载等不改变执行状态 |
| RESET_SESSION | `confirmed:true` | 需用户确认；清本会话数据与Blob，不清其他应用存储 |

统筹应提供带schema的示例命令供页面验证；如任务发现本表遗漏必要字段，提出最小变更，由统筹统一更新，不能自行旁路写库。

调用方在新操作开始时生成commandId/exportId，同操作重试保留原ID及载荷；持久实体ID由共享层分配。新草稿可用draft_局部引用，事务按schema映射，成功state只含真实业务ID。已提交命令幂等检查先于revision/额度/实体分配，首次asked重试仍保留questionId:null；细则含完整调用示例。

### 4.1 V0.5首页共享接口

统一模块与返回值：

```js
// shared/intake-draft.js：纯函数，不识别语音，不调用模型或写库
createMerchantIntakeDraft(overrides = {}) // 补完整空字段；无效覆盖抛带code/errors的TypeError
validateMerchantIntakeDraft(draft) // {ok:true,draft} 或 {ok:false,code,message,errors}
mapConfirmedIntakeToAnalysisInput(draft, {state,sourceBindings:[]})
// {ok:true,projection:{focus,facts,constraints,unknowns}} 或同形失败

// 一次用户保存，state取自当前成功load/dispatch，draft来自用户核对
const command = {
  type: 'INTAKE_SET', expectedRevision: state.revision, commandId: crypto.randomUUID(),
  payload: {roundId: state.round.id, inputVersion: state.round.inputVersion,
    draft, description: editedText, sourceBindings}
};
// 重试保留此commandId和原payload，不把旧草稿的inputVersion换成新值。
const saved = await dispatch(command);
// saved.ok后从saved.state读真实ID和版本；确认关注问题仍单独FOCUS_CONFIRM。
```

sourceBindings为`{field,source,materialId?,materialVersion?,locator?}[]`。TXT/CSV/JSON须绑定当前真实材料版本及定位，不能只有文件名或把无定位的提取值伪装为语音；文本来源的默认定位是`{type:'intake',field,source,quote}`。完整字段/来源/更正规则见细则第3.1节。

已存用户更正受保护；再次明确更正必须从当前值形成连续before/after链并与最终草稿一致。不存在的数组项仅可明确删除，外部引用所需位置保留为未知。自动提取或旧草稿不得恢复被更正的旧值；历史前缀/更正链/来源绑定错误为invalid_intake；保护后草稿与事实不一致为correction_conflict，失败不保存部分确认卡。源文件既有同键/同定位/同值事实复用ID与口径，不重复生成材料事实。

外部FACT_PATCH可能使intake草稿仍为A、同intakeField的当前user_corrected事实已为B。恢复时须先读当前状态并向用户展示旧理解A与当前更正B；只有用户明确重核对该项后，才以B作为本次字段编辑基线。保留已存完整userCorrections前缀及fact_correction历史，新改成C只追加B→C；不伪造A→B、不自动重放旧草稿或更换其输入版本。保存须核对打开时的fact ID/值、round/inputVersion，变化则重新核对；数组对应或类型不明确时显示冲突并拒绝猜测。该恢复仍通过INTAKE_SET一次保存，不新增API或放宽校验。

`input.intake.status`表示九组理解是否仍与保存语境相容，不是整轮业务版本。INPUT_EDIT、对intakeField的FACT_PATCH、关联材料删除/替换会标stale；重新核对并INTAKE_SET后才可FOCUS_CONFIRM。补问答案独立保存到questions，变更一次inputVersion，保留已存draft原文；不自动二次INTAKE_SET，也不把答案冒记为draft.sources。分析保存带inputSnapshot及clarificationSnapshot，纯演示生成器不会因此变成真实提取器。

```js
// shared/intake-extraction.js：项目后端客户端，不是ASR，不编造AI结果
requestIntakeExtraction({state,transcript,description,sources,materials:[],draft,sourceBindings:[]},
  {signal,consentToExternalProcessing:false})
// Promise<{ok:true,mode:'moneyai',draft,sourceBindings,requestContext,editable:true,sentToMoneyAI:true}>
// 或 {ok:false,code,message,mode:'manual_review',draft,sourceBindings,requestContext,editable,sentToMoneyAI}
```

materials仅可为当前已保存TXT/CSV/JSON的`{materialId,materialVersion,mime,text}`，最多6份、每项文本≤50000字符、整个UTF-8请求≤256KiB。客户端先GET `/api/moneyai/status`（无原文）；extractionReady不为true或未明确授权发送时不POST。HTTP正文严格为`{version,roundId,inputVersion,transcript,description,sources,materials}`，不发送客户端完整state/draft/sourceBindings。成功回包文件绑定必须属于本次实际发送材料的ID/version，否则invalid_response且保留草稿。当前合法POST `/api/intake/extract`真实返回409 intake_unavailable/可编辑，sentToMoneyAI=false；非法载荷400、Host/Origin失败403、非JSON415。模型、费用和材料范围未落实，不调用真实提取。

`ok:false`仍可含需要保留的可编辑draft；页面应进入手动核对，不显示“AI提取完成”。返回requestContext绑定启动session/round/inputVersion，采用结果前重新核对；外部变化时不得自动覆盖。超时/取消或丢回执且POST已发出时sentToMoneyAI=null，不谎称未发送。客户端8秒预算；取消不等于撤回已发送材料。导航保存必须等原文、编辑文字、来源、更正及其他待保存项全部成功，不能只保存description便离页。

`shared/navigation.js`公开`navigateTo(pageId,{sourceId}={})`，只用允许的三个相对HTML路径，并检查已保存状态与跳转门槛；另公开`registerNavigationGuard({isDirty,onSave,onDiscard})`返回注销函数，页头与页面内导航统一处理内存草稿。浏览器关闭/刷新使用beforeunload标准提示；后退/前进恢复时重读已保存版本，不保证浏览器能执行异步离开保存。

`shared/shell.js`公开`mountShell(pageId)`，填充各HTML的`#shared-shell`与`#shared-footer`，统一导航、当前步骤与来源提示。`shared/demo-data.js`公开`buildDemoAnalysis(state)`和`buildDemoArtifact(state)`：返回显式演示/有限结果，不自行写存储或切页。

## 5. 版本、历史与异步

- `revision`每次实际成功事务递增；失败、只读、无变化与幂等重放不增。`inputVersion`随描述、资料、事实/限制更正、补问答案内容、新轮次及下述实质投影变化，一个命令最多加一次；单纯asked/skipped、浏览或下载不改输入版本。
- 解析/整理在确认前且无有效下游时可作为当前版本投影；确认后或存在有效下游时，接受结果若改变事实/范围/约束/重要缺口，同事务inputVersion+1、清确认并失效下游。纯状态/无语义变化不加；投影不得覆盖已存用户更正。
- 冲突后仅在原round/inputVersion/材料版本仍匹配时，用最新expectedRevision重试原结果；不得给旧快照换输入版本绕过stale_input。幂等保留原null/draft_载荷，与持久ID映射分开。
- 输入变更：清`confirmedVersion`，相关analysis和artifact标stale，旧selection转入history并清空当前选择；历史执行记录保留原引用。页面不能用旧数据继续导出“当前报告”或生成新执行稿。
- 分析/整理异步返回必须比对启动时的inputVersion与roundId；迟到结果不覆盖新输入。多个标签写入用expectedRevision检测冲突，重读后提示，不静默最后写者覆盖。
- 同一inputVersion下替换analysisId，也要归档旧分析/selection并使依赖它的artifact标stale。PATH_SELECT改选时归档旧selection与对应产物，不把已有执行/反馈转移到新路径；重复选择同一有效路径不生成假版本。
- 同轮资料修正不会重新发放补问额度；明确新round才有新预算。ROUND_START递增inputVersion、清本轮分析/选择、保存旧快照；沿用未改变的问题可保持确认，新增材料有冲突则回第一页核对。
- 跨轮保留上轮临时限制作为历史，不自动当作本轮仍有效；scope已过期时保持未知或依据用户主动新反馈更新，不由记忆模板永久锁定商家能力。
- 历史不自动删除；删材料须清原始Blob并使旧引用显示“原件已移除”，不能从历史副本偷偷恢复已删除原件。
- 同一反馈开始下一轮、保存重试通过commandId/feedbackId去重。不能把轮次写死1/2。
- 未保存草稿不做隐式跨页传递：离开前可重试保存，或明确放弃未保存改动；回退不代表放弃方案。保存失败时仍可在当前页取用已有文本，不伪报已同步。

## 6. 本地保存与资料处理

建议IndexedDB数据库`douyin-experiment-demo`、版本1，统一存会话JSON和附件Blob；不要把图片base64塞localStorage。只有事务完成才返回ok/显示“已保存到本机浏览器”；重新打开后实际读到记录才说“已读取本地记录”。这不等于MoneyAI记忆或多设备同步。

REQ-25新首页仅开放UTF-8 TXT/CSV、约定JSON；新图片入口在没有真实图片理解时关闭，原有PNG/JPEG/WebP材料、原件和历史继续保留，不清空旧数据。共享存储保留旧格式兼容；最多6份，每份5MiB，总计20MiB。超过范围明确拒绝该文件，保留其他文件。PDF、XLSX、视频不声称支持解析；不接收HTML/SVG可执行素材。禁止eval、导入上传脚本或把未转义文本写innerHTML。

- 历史图片：可预览、删除或按needs_review核对；不把文件接收冒充OCR或图片理解。本版不让新图片入口绕过REQ-25。
- TXT：真实读取原文；CSV：支持带引号字段与UTF-8 BOM的既定列；JSON：只接受已公布白名单结构，失败有原因。统筹在`samples/`提供说明与示例，不用关键词匹配假装识别任何报表。
- 结构化示例指标列：`metric,value,unit,subject,window_start,window_end,channel,cohort`；缺列/缺值保持未知，不用0填满。
- 文件接收与现有白名单解析在本机；真实提取尚未发送。浏览器语音识别可能由浏览器厂商服务处理，用户须主动开始、可停止并获得明确说明；不声称离线、不把未保存音频当未发送。MoneyAI文本发送另核对项目模型/费用/范围。本轮不做爬虫、银行/收款授权、后台API或监控识别。
- 来源类型必须独立于真实性确认。点击“商家导出”标签不证明真实授权；上传成功不等于内容识别成功。

## 7. 示例、预估与报告

共用主案例取自既有[床底收纳箱合成素材](../../../fixtures/underbed-storage.demo.json)：2只69.90元、单只外尺寸60×40×16cm，186名商品详情访客、0笔支付，5条精选咨询涉及适配。所有数据均为虚构；不能由5条咨询推断全体顾客比例。仅复用首轮允许字段，不能把文件里的下一轮反馈提前注入。

统筹提供三种独立测试种子：完整合成资料、仅一句描述、存在时间/渠道冲突。页面只通过LOAD_FIXTURE显式载入。原V0.4案例可后续另登记，不混成此案例的前后增长。

`estimate`至少含`kind,target,horizon,assumptions,calculation,values,limitations,incrementalEffect`。本轮只交付`scenario`或`unavailable`：例如“若未来100名可比访客，支付率分别假设0%/1%/2%，则期望订单分别为0/1/2”。这只是条件计算，不是实际订单必在0–2的保证，更不是该动作提升0–2单。必须同时显示假设来源；没有足够依据时只显示不可估，不为每条路造不同收益。

统计置信区间/预测区间预留扩展，没实现方法、适用数据与检验就不展示；本轮不生成质量百分分或无来源成功概率。`incrementalEffect`默认“无法估计行动增量”。

`experiment`记录单一修改对象、保持不变条件、观察指标/窗口、样本限制、停止、恢复条件；样本/窗口未知可null，不能把演示阈值当充分性证明。`tree`包含nodes/edges，各边必须有经营观察条件，覆盖未执行/证据不足/风险触发/可比正向或负向变化等适用分支，不用导航步骤充数。

Agent2负责把当前选定查看的路径导出为**真正可下载的独立HTML报告**：写明案例/结果性质、问题与版本、来源定位、支持与反证、行动、情景算式/不可估原因、风险/停止、完整树。只输出经转义的数据、静态HTML/CSS，不带脚本、原始私密附件、外链追踪或模型内部思考过程。提供浏览器打印能力但不宣称已生成PDF。

Agent3只导出所选行动的TXT执行包，不另做第二套分析报告。两页都只有实际触发下载请求后记录download_requested；浏览器未确认落盘不显示“已保存到磁盘”。关键风险先在页面展示，不能只藏在文件里。

## 8. SHARED_READY的最低证据

统筹需在本目录入口登记：契约版本、视觉参考、共享文件清单、同源地址、实际验证项。至少验证空会话、三种种子、事务保存/失败/读回、Blob持久与删除、版本失效、补问限额、重复提交、新轮次、数据安全转义及纯函数情景计算；浏览器检查与静态检查分开报告。

READY前不得让页面Agent靠假状态运行；READY后共享文件冻结，有必要修正时由统筹单独提交变更说明，三页统一更新再测试。
