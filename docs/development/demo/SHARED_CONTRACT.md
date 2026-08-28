# 三页共享契约｜demo.v1

> 当前发布口径（REQ-31，2026-08-29）：冲突处以[最新PRD执行基线](PRD_V1_EXECUTION.md)和[队友测试版本](../../team-testing/LATEST_DEMO.md)为准。下方REQ-30段落保留当时批次记录。
> 当前XLSX支持原件接收及已知指标列本机解析，XLS旧格式仅接收，OCR仍未接通；FEEDBACK_DETAILS_VERSION=1及C7/C8共享逻辑已实现，第三页C7/C8按钮已接线但真实浏览器／事务仍未验，C6反馈附件事务未发布。代码存在不等于浏览器、存储或MoneyAI验收通过。

## REQ-30 共享增量边界（C2—C5首批在场，页面与运行逐项验收）

[四图功能锁定](WIREFRAME_FUNCTION_LOCK.md)第8节列出C1—C9：公共壳、截图／Excel能力矩阵、榨汁杯种子与六组投影、分析互动、执行稿／实验卡、反馈附件原子保存、再判断、显式幂等下一轮以及MoneyAI业务通路。统筹逐项实现并追加接口后才由页面调用，不能把目标字段或名字当成已经存在的API。保留demo.v1和现有接口，不重建共享状态。

本批允许新增截图和Excel目标，覆盖下文旧产品限制；共享C2首批已更新能力矩阵、用户分类和单文件限额，首页接线尚待交回。XLSX解析（C2第二批）与C4首批本机分析已交付并纳入纯逻辑回归，OCR仍未接通；不以格式入口存在声明任意内容理解完成。图示单文件≤10MB目标定义为10000000字节，最多6份／总量20MiB暂保留并明示。接收／预览／解析／确认／Blob保存分别验收；反馈新材料必须绑定原轮次和稿件，不能先MATERIAL_ADD破坏当前输入。路径实验计划、候选稿与已选稿、候选轮与已开始轮必须分开；真实MoneyAI外发许可未因本次派单扩大。

P1签收后的最小接线依赖按下方C2/C3分批发布：材料能力／限额／类别已提供，榨汁杯fixtureId与草稿投影已提供；C4/C5本批新增如下。Excel解析与C6—C8等仍待交付。页面只能使用实际出口，不猜名称、写私有字段或硬编码榨汁杯数值。

状态：2026-08-28新统筹已完成文档审查，本文与[补充细则](CONTRACT_DETAILS.md)一并作为本轮实施约定；契约版本仍为demo.v1；保留原公开API与命令，REQ-25追加INTAKE_SET及草稿/提取辅助接口，不另建状态库。用户已要求先跑通基础版本，实施与完整验收状态分开登记在[入口READY表](README.md)。变更只能由统筹同步通知三页，不能由一页私自改接口。

细则补齐补问/答案、来源、文件去重/解析、路径/树/估算、纯生成器、事件/导出；迟到实质投影失效和ID分配/幂等两项修订已定向复核。本文的最小字段表不是另一套schema，完整嵌套字段以细则为准；[实施计划](SHARED_BUILD_PLAN.md)中的待执行测试不能当运行通过。

### C2 首批接口：已实现，页面接线和浏览器待验

从 `demo/shared/state.js` 导入以下只读出口；它们与事务内的实现共用定义，不由页面另写格式或体积常量：

- `MATERIAL_LIMITS = { maxFiles:6, maxFileBytes:10000000, maxTotalBytes:20971520 }`，只读。单份必须大于0，≤10,000,000字节；20MiB为20×1024×1024字节。
- `MATERIAL_CATEGORIES` 为只读数组：`unknown/content/product/transactions/ads`，对应未标注／内容／商品／成交／投流。
- `MATERIAL_CAPABILITIES` 为按扩展名索引的只读表；`getMaterialCapability(fileName)` 返回对应只读条目或null。条目为 `{extension,mime,receive,preview,parse,reason}`。该查询仅声明能力，不验证文件本身，也不表示已保存。

| 格式 | receive／preview／parse | 本批真实边界 |
| --- | --- | --- |
| PNG、JPG/JPEG | true／image／none | 实际字节、MIME及图片解码检查后可接收；可用原件预览，无OCR，事实仍待核对 |
| WebP | true／image／none | 保留原有兼容，不因新页面不主推它而删除旧原件 |
| TXT | true／text／text_only | UTF-8原文读取，默认facts为空、needs_review，不声称业务已识别 |
| CSV | true／text／metric_csv | 原有UTF-8约定指标表头及逐值定位；任意经营报表不保证可解析 |
| JSON | true／text／metric_json | 原有demo.metrics.v1白名单；不执行文件内指令 |
| XLSX | true／null／table_xlsx | C2第二批：共享`shared/xlsx-reader.js`+`shared/table-facts.js`在本机解析已知指标列（抖音作品导出、榜单快照、metric约定表）；中文单位（w/万/亿）换算，区间/下限估值与文字值按unknown保留原文、不折算单值，「口径说明」表读为核对警告，未识别工作表如实跳过，整列全0而同表其他列>0按采集缺失处理（缺失≠0）；事实带sheet!单元格定位与材料版本绑定，可走既有更正链。只在用户浏览器本机解析，不进入外发提取白名单 |
| XLS | true／null／none | 仅接收保存旧格式原件；解析未支持，提示另存为XLSX或导出UTF-8 CSV |
| HTML、SVG、PDF、视频等 | 查询为null | 不接收，不执行宏、公式、脚本或外部链接 |

既有CSV/JSON/TXT读取函数仍位于首页模块；XLSX解析由统筹以`shared/xlsx-reader.js`与`shared/table-facts.js`交付（纯本机、零依赖、不外发），共享层没有伪造OCR，图片仍只接收预览。已接收文本读取失败时保留原件并标明失败；坏替换在提交前拒绝，不能破坏旧原件。页面应使用原件类型决定预览，文件名／标签只作文本渲染。

`MATERIAL_ADD`、`MATERIAL_REPLACE` 的payload新增可选 `userCategory`，默认unknown；仍用既有 `file` 和替换所需 `materialId/inputVersion`。新文件字节替换成功后不自动继承旧类别，除非用户明确提供该类别。同字节替换仍为无变化，即使携带另一类别；纯改类别应使用新命令：

```js
dispatch({
  type: 'MATERIAL_CATEGORY_SET',
  commandId, expectedRevision,
  payload: { roundId, inputVersion, materialId, materialVersion, userCategory: 'content' }
})
```

四个作用域字段均必须匹配当前材料；旧轮次／输入／材料版本及已删除材料返回stale_input，非法类别返回invalid_payload。旧material没有userCategory时，页面只读显示unknown，不在读取时补写或制造保存。命令用原有commandId幂等和revision冲突机制；同类别为无变化。

类别仅为用户自述，不改 `sourceKind:'user_file'`、事实、事实verification、channel或cohort，不生成解析值，不改变Blob、blobKey、sha256或material.version。真实变更记录 `material_category_changed` 历史（前后类别、材料版本、旧输入版本），inputVersion+1并失效旧确认／分析／选择；迟到解析必须按原启动版本拒绝，不能偷换成新版本重试。失败保留当前原件与页面草稿。

本批已通过61项Node纯逻辑回归、6项Node实际File预检和独立8项增量复核；前者包含原53项。预检刻意无IndexedDB，**不是保存或浏览器通过**。现有浏览器宿主13组定义中扩展了分类／Blob读回断言，实际运行仍为0。C3榨汁杯与真实MoneyAI之外，C2的XLSX解析与C4首批本机分析已由后续批次交付（见上文C2第二批/C4首批节），浏览器接线与真实UI验收待完成；不把C2整项或“上传Excel”标完成。页面按真实能力完成三块区域和支持流程。P3反馈仍必须等待C6，不能借C2调用MATERIAL_ADD。

### C2 第二批接口：XLSX本机解析与独立分析引擎（已实现，纯逻辑回归通过，浏览器待验）

统筹在`shared/xlsx-reader.js`＋`shared/table-facts.js`交付XLSX本机解析（能力矩阵`table_xlsx`，能力表见上文C2节）。配套交付独立确定性引擎`shared/analysis.js`（`buildLocalAnalysis`）。**它未接入`buildDemoAnalysis`，不改变已发布的PRD V1分析语义**，作为可选投影供后续接线，输出满足既有`validateAnalysis`：

- **五阶段漏斗**：仅当`video_views→product_clicks→add_to_carts→created_orders→paid_orders`五个已知值同对象/渠道/群体口径/同一起止窗口时计算逐段转化与流失；入口流失最大且≥90%时优先验证环节改选后段并在`findings.funnel.priorityNote`说明理由；“数值最大流失”与“本轮优先验证”始终分开记录。
- **榜单快照（流量层/承接层）**：followers×live_viewers算粉看比，只做同表相对比较；粉丝>1,000,000（本机处理规则，非行业结论）标`head_account`不参与判定；单场观看低于同表中位1/10判`traffic_gap`，同账号场均与单场差10倍以上记口径线索；live_product_count低于同表中位一半判`shallow`。
- **内容层**：播放量整列采集缺失时如实说明“流量侧无法判断”；全部输出标注“待验证判断/本机规则/非MoneyAI”，不声称根因或因果。
- 第一页解析出的`file_extract`事实（含xlsx定位、材料版本绑定）与既有CSV/JSON事实同构，可直接被已发布的`analysis-evidence.js`投影与P2分析消费——这是P1→P2的既有承接路径，无需页面改动；浏览器端到端验收待完成。

### C3 首批接口：榨汁杯首次资料与原样确认

首页通过原 `dispatch({type:'LOAD_FIXTURE',payload:{fixtureId:'juicer_cup_v1'},expectedRevision,commandId})` 显式载入。继续执行已有替换确认和未保存草稿处理；页面不自行创建种子、材料、分析或选择。公共壳的合成案例菜单也提供“合成案例 · 榨汁杯”，另保留原三种子，默认空会话仍不自动载入。

显式替换复用 `import { resolveDrafts } from '../shared/navigation.js'`。该公开出口原样转出既有守卫，公共壳也改走此出口；不增加另一份registry。先让用户确认替换，再 `await resolveDrafts({notify})`；返回false即中止，保留草稿。返回true后重新loadSession获取最新revision，再dispatch，不能沿用保存草稿之前的版本。`notify(message)`用于显示失败原因；默认原生确认保留保存／放弃／继续编辑选择，页面不得传恒真confirm绕过它。此出口本身不载入案例、不保存业务状态、不导航。

种子首次资料：350ml便携榨汁杯、69.9元、USB-C；2026-08-21至2026-08-27，播放58000／商品点击1450／加购96／创建订单54／支付42。五个计数字段各只有一份事实，单位为对应阶段次数／订单笔数，不是独立用户人数。渠道写明“抖音短视频（合成；投流来源未拆分）”，cohort明确为同一商品、同窗的合成嵌套事件链；这不是对真实商家嵌套关系的核验。

种子使用原v0.5完整draft及其evidenceLedger，没有增加另一套六组schema。productName／price／specifications与confirmedProductFacts为合成商品资料；currentProblem是老板假设，不能展示为已证实根因；constraints为不能降价／编造性能／复杂重拍；unknowns保留信任问题是否成立、投流、退款／投诉、性能细则、售后与既往动作的缺口。transcript为空、sources为manual，ledger quote逐项注明“合成演示首次资料”，没有伪造录音、文件上传或平台来源。

LOAD_FIXTURE先取得新round与inputVersion，再初始化完整intake、来源及canonical投影；intake.roundId/inputVersion必须匹配当前轮，confirmedVersion仍为null。没有分析、选择、产物、执行或未来反馈。旧三种子也初始化与首页一致的完整manual空草稿，原事实不丢弃；不会再因为第一次保存草稿容器或默认focus而清fixtureId。

原样INTAKE_SET以及确认后的同内容保存为无变化，保持原ID、口径和fixtureId；实际改原文、字段、来源或证据状态仍递增输入版本／降级并失效下游。INPUT_EDIT会把现有intake标stale，必须重新核对保存后再FOCUS_CONFIRM，不能放松门槛以恢复旧测试捷径。

映射仅对紧邻已有的intake-owned五计数字段保留测量口径：已知原值、key/evidenceStatus、对象、窗口、平台以及来源kind/materialId/materialVersion/locator均不变，且没有冲突／更正时，才沿用原unit/channel/cohort。任何改变都不从种子模板补回；恢复旧数字也不复活旧口径。文件解析事实的归属和更正优先级不变。

**C3独立交付不等于C4/C5完成。** C3批次只有首次资料；后续五阶段专用判断、A/B路径及执行稿按下方C4/C5接口另行交付。普通同名商品不能触发合成种子或补入五个数；榨汁杯案例不能冒充MoneyAI调用。

C3独立批次66项Node通过（含新增5项C3组合），先实际复现原样确认丢fixtureId再修复；P3原10组限定回归仍通过。浏览器宿主既有13组中扩展四种子及原样确认／同命令重试读回定义，实际执行0组。首页专用按钮、六组可见表现及真实确认／刷新待页面接线和运行验收。

### C4 首批接口：五阶段证据、A/B与分析感受（已实现，运行未验）

继续调用同步纯函数 `buildDemoAnalysis(state)`，经原 `ANALYSIS_SET` 保存后才使用其正式ID。生成器不调用模型、网络或存储；`analysis-evidence.js`是共享内部投影，页面消费已保存analysis，不另算一份诊断或漏斗。

- `analysis.funnel`：`status=comparable|unavailable`、`source`、`nesting`、`stages`、`transitions`、`issues`、`maximumLoss`、`limitations`。旧分析可没有该字段，不在读取时补造。
- 五个stage为 `{key,label,value,unit,factIds,subject,window,channel,cohort}`；value为明确有效计数或null。多份同指标不擅自挑选；假设、冲突、公共参考及情景值不作观测。
- transition为 `{fromKey,toKey,factIds,numerator,denominator,conversionRate,lossRate,lossCount,calculation,reason}`。rate是0—1比例，页面显示时再转百分数；null不能格式化成0。即使口径comparable，分母0仍有独立不可计算原因。
- 当前只有原样显式榨汁杯种子声明嵌套事件链；普通材料的商品、日期、渠道和群体文字相同仍不证明嵌套。必须五项唯一、非负安全整数、阶段单位正确、同对象／有效窗口／渠道／群体且数量非递增才计算；不满足时并列实际值和问题，不画成已经成立的漏斗。
- `maximumLoss.byCount/byRate`分别为 `{fromKey,toKey,value}`或null。榨汁杯播放→点击为2.5%、数量差56550，点击→加购约6.62%、数量差1354；后者不是最大流失。
- `analysis.priority`含status、fromKey/toKey、title、reason、`rootCauseConfirmed:false`、facts（文字、sourceFactIds／fact:sourceIds；必须有当前有效观测来源）、hypothesis（文字、sourceFactIds／sourceIds）及unknowns。优先点击→加购来自可行动性、经营限制与待验证方向，不把数值排名或老板认同当根因。
- `analysis.processing`仅为 `{name,kind:'local_rule',status:'done'|'not_run'}[]`，分别注明实际本机质检、算术、模板及感受规则；不能改成已经调用专家Skill或MoneyAI。新funnel保存时由共享验证器按输入重新核对，不接受改过分子／分母／算式的草稿。

榨汁杯两路保留原path结构，新增稳定 `actionKey=juicer_faq|juicer_video_intro` 及A/B的optionLabel。标题分别是“补全商品购买问答区”“调整视频前几秒的信任表达”；不能靠数组位置、商品同名或标题猜模板。成本实际值仍null，说明低／中工作量只是演示安排；未来结果与行动增量仍不可估。四段观测计算可通过funnel查看，点击→加购计算也进入原evidenceRefs，兼容现有报告；完整树与反证保留。

分析感受单独使用：

```js
dispatch({
  type: 'ANALYSIS_REVIEW_SAVE', commandId, expectedRevision,
  payload: { roundId, inputVersion, analysisId, stance, reason, blockedPathIds }
})
```

- stance为 `agree|uncertain|disagree|not_actionable`；reason是文字或null，最多1000字。`not_actionable`须有非空原因及至少一个当前path ID；其他stance的blockedPathIds为空或省略。不能用猜测的新path ID重试。
- 三个作用域须匹配。记录追加到现有history，`type:'analysis_review'`，包含id/at、上述版本、原话及merchant_statement来源；不是fact、question或执行／观察反馈，不消耗三问额度。
- agree／uncertain不改输入、不确认根因、不替用户选路。disagree／not_actionable在同笔保存中归档并标旧analysis为stale、撤销selection、旧产物标stale；保留原输入和已确认版本。
- 成功保存感受不等于完成改判。页面用回执中的最新state调用原生成器，再以最新revision执行ANALYSIS_SET；reviewId须匹配本轮输入最新感受，reviewIds须按历史顺序完整列出同roundId／inputVersion的全部感受ID。只复制这些元数据的旧草稿仍会被共享累计限制校验拒绝。
- 同一roundId／inputVersion累计应用全部感受：曾明确做不了的路径持续排除，曾异议的假设持续撤回；之后agree／uncertain不撤销限制。稳定actionKey及原始标题兼容身份同时保留，省略可选key不能恢复旧路径；无法查回原受评分析时保守返回空路径。没有有依据的替代方案可返回limited及空paths，必须明确待补资料，不能伪造新根因或强选A/B。当前没有解除限制命令，只有实际输入或新轮次变化进入新的作用域。生成或保存失败时，感受已保存且旧分析仍不可继续。
- 相同业务内容不重复追加当前感受；响应丢失仍用原commandId／原载荷核对。正式新分析的reviewId指向最近一条，reviewIds标记累计采用记录；页面通过history对应ID展示原话，不把它伪造为fact来源。

### C5 首批接口：所选稿、待核对清单与八项计划（已实现，运行未验）

继续 `buildDemoArtifact(state)` → 逐项 `ARTIFACT_SAVE`；仅为已保存当前选择生成。按路径actionKey与该analysis.inputSnapshot取源，不因保存反馈清掉当前fixtureId而把旧A/B稿退回通用清单；改输入／换路失效保护继续。

两路通常各有三个kind：`copy`（已确认可取用文字）、`checklist`（未确认问题与修改步骤）、`experiment_plan`（同一path.experiment的全文）。A包含容量及充电接口问答；冰块、续航、清洗、售后逐项在待核对清单中显示，不放进可发布回答。B提供0—2／2—4／4—5秒字幕安排，不表示生成了视频。每个必要商品字段必须唯一：同值重复、冲突或缺少均不自动选一份来源，不生成copy，只保留核对清单和限制。容量只回答“容量是多少？”，不扩写成单次可处理或榨汁量。copy的sourceFactIds直接指向所引用商品事实，不以经营数字代替规格来源。

`path.experiment`在原字段上新增三个可选字段：

| 字段 | 当前结构与语义 |
| --- | --- |
| minSampleUnit | 非空文字；榨汁杯为“次新增商品点击”，不能只显示无单位100 |
| guardrails | Condition[]；有效点击／口径、投诉和退款，缺记录必须说明无法判断 |
| restoreSteps | Condition[]；执行前保存原版本，商家决定后手动恢复对应区域并记录；不自动操作平台或宣称已回滚 |

主要观察的target.metric为 `click_to_cart_rate`、unit为比例，显示“商品点击后的加购率”。minSample=100、实施后24—72小时复查均引用本路径estimate.assumptions的合成计划参数；estimate.kind仍unavailable，不变成成功率或结果区间，实际window.start/end仍null。guardrails、stopConditions、restoreConditions和restoreSteps分别是观察指标、停止条件、恢复前提与恢复操作，不能互相替代。旧计划缺新增字段继续显示未知，不迁移补值；生成器遇缺省guardrails／restoreSteps须安全返回“尚未提供”，不能抛错或编造具体回滚方法。

P3实验卡与TXT应共用上述投影，待核对的冰块／清洗／售后等在取用区域有可见入口；“复制全部文案”仍只复制copy，内部待填清单不混入可发布文字。ARTIFACT_SAVE校验usage的placement／steps／risks，当前仍只读已有稿，不声称实现已有稿编辑和版本递增。

本批不实现C6反馈附件事务、C7执行反馈复盘或C8候选建轮。初次明确选B可以得到当前B稿；未选候选B不能通过ARTIFACT_SAVE占用A的选择或历史。浏览器、剪贴板、TXT落盘与真实MoneyAI仍未验。

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
| material | `id,name,mime,size,status,sourceKind,userCategory?,blobKey,error,version,sha256`；旧userCategory缺省按unknown只读显示；状态为received/parsed/needs_review/failed；文件名／类别不是可信内容，摘要不导出 |
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
| INTAKE_SET | `roundId,inputVersion,draft,description,sourceBindings` | 严格校验v0.5-intake-1及完整合并投影，同事务保存原文/编辑文/来源/更正；实质变化一次inputVersion+1并失效下游；不静默覆盖外部材料事实或其他未知；明确更正保留原ID及来源历史 |
| MATERIAL_ADD / MATERIAL_REMOVE | `file,userCategory?` / `materialId` | ADD的File只在本机处理并转Blob；metadata与Blob一并保存，REMOVE删除Blob并失效依赖 |
| MATERIAL_REPLACE | `materialId,file,inputVersion,userCategory?` | 原子替换；取消或失败保留旧Blob与状态，成功才变更输入版本；同字节不借替换改类别 |
| MATERIAL_CATEGORY_SET | `materialId,materialVersion,roundId,inputVersion,userCategory` | 用户分类单独保存；改变输入版本并失效下游，不改原件身份／事实／真实性，同类别无变化 |
| MATERIAL_RESULT_SET | `materialId,materialVersion,roundId,inputVersion,status,facts,error` | 保存实际解析结果；核对启动轮次/输入/材料版本，过期/已删除任务拒绝，实质迟到投影按第5节失效，失败不删原件 |
| FACT_PATCH | `fact,reason` | 保留来源及更正记录，关联确认卡标stale；递归派生值退回未知并撤销旧依赖条件，不替换为无出处“事实” |
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
// {ok:true,projection:{focus,facts,constraints,unknowns},factCorrections:[...]} 或同形失败
// factCorrections仅供共享层同事务保存明确更正历史，不改变INTAKE_SET的payload或状态schema
findIntakeFieldFact(state, field, bindings = null) // 只读返回当前关联fact或null；不添加intakeField

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

已存用户更正受保护；再次明确更正必须从当前值形成连续before/after链并与最终草稿一致。不存在的数组项仅可明确删除，外部引用所需位置保留为未知。自动提取或旧草稿不得恢复被更正的旧值；历史前缀/更正链/来源绑定错误为invalid_intake；保护后草稿与事实不一致为correction_conflict，失败不保存部分确认卡。源文件既有同键/同定位/同值事实复用ID与口径，不重复生成材料事实。 对已更正的文件事实，按fact_correction原文件定位识别同一条记录，恢复仍保留原ID、口径及外部归属；当前明确的新材料绑定优先，不回退到旧材料更正。FACT_PATCH和INTAKE_SET都使递归依赖的旧推导退回未知，保留失效前历史与无关事实。

页面明确恢复尚未保存的新文件B关联时，可保留唯一对应B的文件定位用于识别；修改值的证据仍为manual、事实来源仍为merchant_statement，不声称源文件已改。共享投影先按真实fact ID匹配，再按来源签名回退；不同文件更正后出现相同intake定位，不能将B重标为A或混合两个更正历史。

外部FACT_PATCH可能使intake草稿仍为A、同intakeField或通过文件定位复用的当前user_corrected事实已为B。恢复时须先读当前状态并向用户展示旧理解A与当前更正B；只有用户明确重核对该项后，才以B作为本次字段编辑基线。保留已存完整userCorrections前缀及fact_correction历史，新改成C只追加B→C；不伪造A→B、不自动重放旧草稿或更换其输入版本。保存须核对打开时的fact ID/值、round/inputVersion，变化则重新核对；数组对应或类型不明确时显示冲突并拒绝猜测。该恢复仍通过INTAKE_SET一次保存，不新增API或放宽校验。

`input.intake.status`表示九组理解是否仍与保存语境相容，不是整轮业务版本。INPUT_EDIT、对intakeField或关联文件事实的FACT_PATCH、关联材料删除/替换会标stale；重新核对并INTAKE_SET后才可FOCUS_CONFIRM。补问答案独立保存到questions，变更一次inputVersion，保留已存draft原文；不自动二次INTAKE_SET，也不把答案冒记为draft.sources。分析保存带inputSnapshot及clarificationSnapshot，纯演示生成器不会因此变成真实提取器。

```js
// shared/intake-extraction.js：项目后端客户端，不是ASR，不编造AI结果
requestIntakeExtraction({state,transcript,description,sources,materials:[],draft,sourceBindings:[]},
  {signal,consentToExternalProcessing:false})
// Promise<{ok:true,mode:'moneyai',draft,sourceBindings,requestContext,editable:true,sentToMoneyAI:true}>
// 或 {ok:false,code,message,mode:'manual_review',draft,sourceBindings,requestContext,editable,sentToMoneyAI}
```

materials仅可为当前已保存TXT/CSV/JSON的`{materialId,materialVersion,mime,text}`，最多6份、每项文本≤50000字符、整个UTF-8请求≤256KiB。客户端先GET `/api/moneyai/status`（无原文）；extractionReady不为true或未明确授权发送时不POST。HTTP正文严格为`{version,roundId,inputVersion,transcript,description,sources,materials}`，不发送客户端完整state/draft/sourceBindings。成功回包文件绑定必须属于本次实际发送材料的ID/version，否则invalid_response且保留草稿。当前合法POST `/api/intake/extract`真实返回409 intake_unavailable/可编辑，sentToMoneyAI=false；非法载荷400、Host/Origin失败403、非JSON415。模型、费用和材料范围未落实，不调用真实提取。

`ok:false`仍可含需要保留的可编辑draft；页面应进入手动核对，不显示“AI提取完成”。返回requestContext绑定启动session/round/inputVersion，采用结果前重新核对；外部变化时不得自动覆盖。超时/取消或丢回执且POST已发出时sentToMoneyAI=null，不谎称未发送。客户端8秒预算；取消不等于撤回已发送材料。导航保存必须等原文、编辑文字、来源、更正及其他待保存项全部成功，不能只保存description便离页。

`shared/navigation.js`公开`navigateTo(pageId,{sourceId}={})`，只用允许的三个相对HTML路径，并检查已保存状态与跳转门槛；另公开`registerNavigationGuard({isDirty,onSave,onDiscard})`返回注销函数，以及用于显式会话替换的`resolveDrafts({notify}={})`，页头与页面内导航统一处理同一份内存草稿守卫。浏览器关闭/刷新使用beforeunload标准提示；后退/前进恢复时重读已保存版本，不保证浏览器能执行异步离开保存。

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

REQ-30覆盖旧REQ-25禁新图与5MiB限制：共享C2支持PNG/JPEG/WebP接收预览及UTF-8 TXT/CSV/约定JSON，最多6份、每份10,000,000字节、总计20MiB。首页接线尚未验收。超过范围明确拒绝该文件，保留其他文件；旧原件不清空。XLSX/XLS接收与解析尚未接通，PDF、视频不支持；不接收HTML/SVG可执行素材。禁止eval、导入上传脚本或把未转义文本写innerHTML。

- 新旧图片：可接收后预览、删除或按needs_review核对；接收不等于OCR或图片理解，图片没有已解析事实时不能标“已读取数据”。
- TXT：真实读取原文；CSV：支持带引号字段与UTF-8 BOM的既定列；JSON：只接受已公布白名单结构，失败有原因。统筹在`samples/`提供说明与示例，不用关键词匹配假装识别任何报表。
- 结构化示例指标列：`metric,value,unit,subject,window_start,window_end,channel,cohort`；缺列/缺值保持未知，不用0填满。
- 文件接收与现有白名单解析在本机；真实提取尚未发送。浏览器语音识别可能由浏览器厂商服务处理，用户须主动开始、可停止并获得明确说明；不声称离线、不把未保存音频当未发送。MoneyAI文本发送另核对项目模型/费用/范围。本轮不做爬虫、银行/收款授权、后台API或监控识别。
- 来源类型必须独立于真实性确认。点击“商家导出”标签不证明真实授权；上传成功不等于内容识别成功。

## 7. 示例、预估与报告

共用主案例取自既有[床底收纳箱合成素材](../../../fixtures/underbed-storage.demo.json)：2只69.90元、单只外尺寸60×40×16cm，186名商品详情访客、0笔支付，5条精选咨询涉及适配。所有数据均为虚构；不能由5条咨询推断全体顾客比例。仅复用首轮允许字段，不能把文件里的下一轮反馈提前注入。

统筹提供四种独立测试种子：juicer_cup_v1（榨汁杯首次资料）、underbed_complete_v1（床底合成资料）、one_sentence_v1（仅一句描述）、scope_conflict_v1（时间／渠道冲突）。页面只通过LOAD_FIXTURE显式载入。原V0.4案例可后续另登记，不混成此案例的前后增长。

`estimate`至少含`kind,target,horizon,assumptions,calculation,values,limitations,incrementalEffect`。本轮只交付`scenario`或`unavailable`：例如“若未来100名可比访客，支付率分别假设0%/1%/2%，则期望订单分别为0/1/2”。这只是条件计算，不是实际订单必在0–2的保证，更不是该动作提升0–2单。必须同时显示假设来源；没有足够依据时只显示不可估，不为每条路造不同收益。

统计置信区间/预测区间预留扩展，没实现方法、适用数据与检验就不展示；本轮不生成质量百分分或无来源成功概率。`incrementalEffect`默认“无法估计行动增量”。

`experiment`记录单一修改对象、保持不变条件、观察指标/窗口、样本限制、停止、恢复条件；样本/窗口未知可null，不能把演示阈值当充分性证明。`tree`包含nodes/edges，各边必须有经营观察条件，覆盖未执行/证据不足/风险触发/可比正向或负向变化等适用分支，不用导航步骤充数。

Agent2负责把当前选定查看的路径导出为**真正可下载的独立HTML报告**：写明案例/结果性质、问题与版本、来源定位、支持与反证、行动、情景算式/不可估原因、风险/停止、完整树。只输出经转义的数据、静态HTML/CSS，不带脚本、原始私密附件、外链追踪或模型内部思考过程。提供浏览器打印能力但不宣称已生成PDF。

Agent3只导出所选行动的TXT执行包，不另做第二套分析报告。两页都只有实际触发下载请求后记录download_requested；浏览器未确认落盘不显示“已保存到磁盘”。关键风险先在页面展示，不能只藏在文件里。

## 8. SHARED_READY的最低证据

统筹需在本目录入口登记：契约版本、视觉参考、共享文件清单、同源地址、实际验证项。至少验证空会话、四种种子、事务保存/失败/读回、Blob持久与删除、版本失效、补问限额、重复提交、新轮次、数据安全转义及纯函数情景计算；浏览器检查与静态检查分开报告。

READY前不得让页面Agent靠假状态运行；READY后共享文件冻结，有必要修正时由统筹单独提交变更说明，三页统一更新再测试。
