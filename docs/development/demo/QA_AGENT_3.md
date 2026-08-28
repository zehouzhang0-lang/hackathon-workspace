# Agent 3｜第三页实现与验收记录

更新：2026-08-28。**本轮完成 REQ-25 限定纯逻辑回归与来源展示修补；REQ-20 工作区和 REQ-23 固定标题接入沿用已交接版本。浏览器交互、真实动画和最终视觉仍未验收。** 旧前检与先前依赖未交付记录仅供追溯，不代表本轮状态。

## 本轮追加：REQ-25 限定纯逻辑回归

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
