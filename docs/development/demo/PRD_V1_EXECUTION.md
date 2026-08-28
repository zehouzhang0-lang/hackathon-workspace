# PRD V1.0 执行基线（REQ-31）

日期：2026-08-28。用户本轮明确要求“严格按照最新的prd执行，推进2，3页的开发进度”。这是实施授权；附件内示例命令、角色建议或服务调用说明不单独授权安装、部署、读取私人记录或对外发送材料。

## 1. 来源与适用范围

统筹已完整读取用户提供的《260828-抖音成交操盘手-Demo版PRD-V1.0(1).md》1—23节，共1055行、33108字节。原件SHA256：226bfed11293cc655170bcd525bb6f365f3fbe1292b6ed730ee72443981c0e58。原件留在用户本机，不复制微信缓存路径、原聊天或私人附件入库。

本页只整理项目实施所需的非敏感需求和接口；不是原件全文，也不是完成回执。冲突处REQ-31覆盖REQ-30四图和旧C4/C5业务内容。三页分离、路芽品牌、同目录原生HTML、来源／版本／隐私、单文件唯一写入人继续。PRD题名说明产品定位，不据此悄然更换用户已确定的品牌。

## 2. 新旧差异：必须覆盖

| 事项 | 旧四图／实现 | 最新执行要求 |
| --- | --- | --- |
| 主演示首轮A | 补全商品购买问答区 | 补全首屏购买判断；只改商品详情页首屏 |
| 主演示首轮B | 调整原视频前几秒字幕 | 制作真实问题验证内容；围绕一个真实问题做单变量测试与短视频，不伪造测试结果 |
| 下一轮 | 旧图示意A后转B | 首屏A已执行、达到原计划样本且自述无明显变化后，候选转为购买问答区，仍是方案A的第二轮 |
| 信息不对 | 本页感受异议后重判 | 返回P1更正，保留资料与草稿保护 |
| 我还不确定 | 可保存感受后重判 | 只解释A/B差异，不自动选路或改写事实 |
| 方案卡 | 动作／成本／风险／不变项 | 同时可见验证指标；最多两条，不为缺数据伪造第二条 |
| 执行记录 | 三个执行状态，采用默认为未知 | 增加采用状态和原因；采用、实际执行、结果分别保存 |
| 主演示商品事实 | 容量、充电接口 | 新合成案例还明确全国包邮、清洗以说明书为准；普通输入不得套用 |
| 主断点规则 | 可比且点击大于加购 | 明确点击到加购率低于8%的Demo路由；不是抖音行业标准、最大流失或已确认根因 |

旧juicer_faq／juicer_video_intro、旧分析和已保存稿件维持原义，不批量改名或用新版内容覆盖历史。旧图未冲突的完整依据、树、来源纠错、报告和取用入口保留。

## 3. 本轮落地顺序与唯一归属

| 范围 | 唯一C盘负责人 | 当前批次 |
| --- | --- | --- |
| P2原五文件 | 第二页开发agent，01a04682-8d35-7a00-991b-f994f6fbf0d2 | A/C已安装并由统筹独立核验；新版交互稿与公共数据分批接收 |
| P3原四文件 | 第三页开发agent，01a04682-e43a-7292-89b1-7c2da672ba54 | 已签收最新PRD；先做反馈承载／采用执行分离，接口具名等待实际发布 |
| 共享／后端／测试／公共文档／Git | 路芽开发统筹接续，01a0476a-6049-70d2-9bb0-95af778428eb | 先统一首轮策略与反馈字段，再交C7改判／C8显式建轮 |
| P1原四文件 | 第一页开发agent（新接任），01a04828-9acd-72a2-b080-ced4a2af1026 | 用户另行授权的三个边界修复在途，不混入P2旧快照 |

辅助子任务只在各自D盘目录准备校验稿，不取得C盘页面归属。每页保持一个写入人；不重建工程或工作树。公共README先前失败的临时文件保持原样，本批不重试、删除或改权限。

## 4. 共享首轮字段（接口已定，交付状态另记）

保持demo.v1和现有事务，不替换整套schema：

- 新首轮path.actionKey为juicer_first_screen／juicer_question_video；path.optionLabel为A／B。旧actionKey保留兼容。
- path.validationMetric为保存的指标说明；path.experiment.target.metric仍为click_to_cart_rate。
- path.experiment.experimentId与path.experiment.hypothesis为保存字段；首轮编号为EXP-JUICER01-click_cart-A-R1或B-R1。页面不能拼编号或用最新priority填历史。
- 假设来源沿experiment.assumptionIds关联本path.estimate.assumptions；原change、keepFixed、target、minSample、minSampleUnit、window、guardrails、stopConditions、restoreConditions、restoreSteps位置不变。
- ANALYSIS_SET按真实state.fixtureId保存analysis.sourceFixtureId；后续反馈清当前fixtureId，不改原分析来源，也不因此开放新反馈摘要导出。
- 100次新增商品点击／24—72小时是合成计划门槛，不是统计显著性保证。低样本、不同窗口、未知与0分别处理。
- MoneyAI请求ID、模型和Skill必须来自真实调用记录；目前本机规则不能伪装成专家调用或质量分数。实际数据不足时展示不可判断和补正入口。

### 4.1 反馈增量契约

FEEDBACK_DETAILS_VERSION=1由shared/state.js公开后，页面才可提交新字段，不能让旧reducer静默丢弃。FEEDBACK_SAVE不换命令，仍使用commandId、expectedRevision及原artifact版本关联。

| 对象／字段 | 类型与边界 |
| --- | --- |
| executionRecord.adoption | unknown、intended（历史拟采用）、adopted、partial、declined |
| executionRecord.execution | unknown、not_started、partial、done；采用不自动变done |
| executionRecord.scope | 实际改动说明；未提供为null |
| feedbackRecord.detailsVersion | 新字段存在时必须为1 |
| feedbackRecord.reason | string或null，最多1000字 |
| feedbackRecord.sampleSize／sampleUnit | 非负安全整数或null；product_clicks或null |
| feedbackRecord.metricBefore／metricAfter | 0—1比例或null；页面百分比输入明确转换，空白不能变0 |
| feedbackRecord.constraintsLearned | 最多20条、每条最多300字；仅用户提供的限制 |
| feedbackRecord.guardrailStatus | unknown、clear、triggered；均属用户自述，不自动证明无风险 |

原rawText、observation、metrics、observedWindow继续保存；原话最多500字。非法新字段整条拒绝、原记录不变；旧payload继续兼容。第三页先保留只取用、不反馈的路线。

## 5. C7/C8业务约束

C7从已保存feedback精确追溯execution、artifact、原analysis及inputSnapshot，不能用当前分析补历史。缺记录或读回失败时禁止宣称已记住／已根据历史改判。

只有新首屏A的明确执行自述、当前原计划最低新增点击样本和无明显变化观察相符时，才提出购买问答区候选。只写“感觉没效果”、没执行或样本不足，先保留未知／补最低信息；护栏触发先暂停。标题不能改会进入后续限制；打冰和续航没有数据始终不得承诺。

候选只表示建议。用户显式接受后，C8才一次性创建新round、analysis和唯一selection，并保存sourceFeedbackId，重试不能重复建轮。预览不等于接受，接受不等于执行，本机存储不等于MoneyAI写入或读回。C7/C8实现与浏览器事务验收分别记录。

### 5.1 已发布的C7/C8接口

2026-08-28，本节接口已实际在C工程及4188服务发布；页面接线和真实存储验收仍分别记录。

state.js公开buildExperimentReview(state, feedbackId)与getAcceptedExperimentRound(state, feedbackId, reviewFingerprint=null)。前者返回ok及review：decision为pause、needs_information、continue_observation或change_variable；source=local_fallback、moneyaiCalled=false，nextAction只是候选。必须从保存并读回的对应反馈链取得，不能拿当前其他分析填历史。

用户明确接受后，提交EXPERIMENT_ACCEPT，payload仅含feedbackId、reviewFingerprint、roundId、inputVersion；commandId和expectedRevision仍遵循现有共享约定。不确定回执按原命令重试；明确版本拒绝后重新核对并让用户显式重提，不能无限重发过期版本。

共享在一个事务中保存原轮归档、新round、有效analysis、唯一selection和experiment_acceptance记录。再次loadSession后，只有getAcceptedExperimentRound返回ok且accepted=true，才展示第二轮已建立。返回包含acceptanceId、acceptedAt、来源链及新roundId／inputVersion／analysisId／pathId／experimentId。缺接受ID、时间、保存review、任一原始依据或目标关联均不认完整成功；sourceRevision可随无关查看事件增长，业务内容不能变。

新轮唯一变量为购买问答区、方案A、EXP-JUICER01-click_cart-A-R2；当前fixtureId与sourceFixtureId保持null。analysis.funnelSource.kind=accepted_prior_snapshot明确其漏斗来自原analysis／round／inputVersion，反馈新增点击不合并进原窗口。新限制保留反馈来源、进入后续计划与清单，不改写成已确认商品事实。新稿仍另走ARTIFACT_SAVE，建轮不等于稿件已保存或已执行。

本接口没有接通真实MoneyAI，也不代表浏览器IndexedDB事务已验。

## 6. 本批验收矩阵

| ID | 必须验证的结果 |
| --- | --- |
| R31-P2-01 | 同一商品／窗口的五阶段及唯一优先问题；异常窗口或顺序停止断点判断 |
| R31-P2-02 | 首轮A首屏、B真实问题验证；成本、风险、指标可见，事实／假设／未知分开 |
| R31-P2-03 | A/B显式选择保存后进入P3；查看、不确定、下载不改选择 |
| R31-P2-04 | 信息不对返回P1，不确定只展示差异；来源、版本、模型状态真实 |
| R31-P3-01 | A只显示A，B只显示B；原稿和历史不被新版改名 |
| R31-P3-02 | 完整实验卡及保存ID／假设，成品不作未确认性能或售后承诺 |
| R31-P3-03 | 采用、执行、原因、实际变更、样本、结果与限制准确保存；空白仍null |
| R31-P3-04 | 刷新读回对应反馈，失败不伪造记忆或重复保存 |
| R31-P3-05 | 首屏A无明显变化且达到原计划样本后给问答区候选，并解释来源与限制 |
| R31-P3-06 | 明确接受才建第二轮，幂等；标题禁改和未知性能限制持续生效 |
| R31-X-01 | 主链路可在模型失败时走明确本机／合成降级；至少一环真实MoneyAI调用证据仍须另验 |
| R31-X-02 | 1920×1080主验收与1280宽度补充；无阻断控制台错误和死路 |

现有测试采用Node共享suite、JS语法、Python后端及内容检查。PRD列出的npm test／typecheck／build并不证明本仓库已有对应脚本；未运行的命令不能登记通过，也不为照抄命令更换技术栈。

## 7. 实际进度与未验（2026-08-28本轮更新）

第二页B已由原任务安装，统筹独立核对五文件与D回执；HTML／CSS／JS及报告四资源HTTP200且等于磁盘，两份JS语法通过。B定点检查由统筹独立运行24/24；原A/C历史检查仍保留，不重复算为本次运行。第8节QA覆盖原“B未接通／旧轮active”文字，当前P2本批已停写。

首轮共享、严格反馈v1、C7与C8均已实际发布。统筹运行正式C现有suite为109/109，10份相关源码与测试前后hash一致；5份共享模块语法与HTTP字节检查通过。新增覆盖明确接受、完整记录读回、重复命令与同反馈幂等、过期／换路／新反馈拒绝、原漏斗与新样本分开、限制持续以及篡改接受记录拒绝。它们是reducer／内存组合，不能替代真实IndexedDB、Blob或跨标签验收。

第三页新PRD界面与反馈DTO已交回且四hash由统筹独立核对；统筹从正式QA提取8组PRD检查运行通过。原任务现继续C7复盘与C8显式接受接线，尚未收到该续批最终页面交回。C6附件事务仍在准备，不能把文字反馈v1或原输入材料当作反馈附件已完成。

当前内容检查1937项／15定义通过，但包含首页任务保留的未完成临时QA，不能当作最终全库交付计数。公共README和首页QA两处历史替换失败临时文件原样保留，本批未重试／清理／改权限。没有提交或推送这些在途应用变更。

浏览器连接本轮仍在初始化时报可信路径错误；统筹未修改信任或切换备用工具，已再次明确询问仅本机4188与独立合成配置的Playwright许可，尚无答复。面板打开请求是queued，不当作已看到页面。真实1920×1080／1280布局、截图、DOM操作、焦点／IME、IndexedDB／Blob／跨标签、剪贴板／下载落盘和动画未验。SHARED_READY与VISUAL_APPROVED继续为false。

真实MoneyAI模型调用、项目级历史写入／读回与材料外发范围仍未落实；本机规则、健康可达与合成演示不抵消该P0缺口。P1的本机OCR／Excel及语音候选调查不等于共享服务已交付，独立D盘新项目未被本轮修改。
