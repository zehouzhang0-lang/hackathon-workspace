import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createEmptyState, getMaterialCapability, normalizeSessionState, reduceCommand, validSourceId, FEEDBACK_DETAILS_VERSION } from '../shared/model.js';
import { buildDemoAnalysis, buildDemoArtifact } from '../shared/demo-data.js';
import { FIXTURE_IDS } from '../shared/seeds.js';
import { registerGuard, resolveDrafts } from '../shared/draft-guards.js';
import { parseMetricText, readSupportedMaterial, buildOrganization, isSubmitKey,
  getIntakeCorrectionConflicts, editIntakeField, isIntakeCorrectionSnapshotCurrent } from '../pages/intake.js';
import { activeSelection, currentArtifacts, selectPreviewArtifact, artifactPreviewText, makeFeedbackPayload, buildActionPack, describeActionSource } from '../pages/action.js';
import { buildPathReport } from '../pages/report.js';
import { getFoldTitlePlan, enhanceFoldTitle } from '../shared/title-motion.js';
import { createMerchantIntakeDraft, validateMerchantIntakeDraft, mapConfirmedIntakeToAnalysisInput,
  findIntakeFieldFact, TEXT_FIELDS } from '../shared/intake-draft.js';
import { requestIntakeExtraction } from '../shared/intake-extraction.js';
import { getAiSettings } from '../shared/ai.js';
import { getMoneyAIStatus, requestMoneyAIAnalysis, requestMoneyAIDecisionWrite, requestMoneyAIHistoryRead } from '../shared/moneyai.js';
import { MONEYAI_CONTRACT_VERSION, MONEYAI_OPERATIONS, createMoneyAIEnvelope,
  computeMoneyAIInputFingerprint } from '../shared/moneyai-contract.js';

function harness(fixtureId = null) {
  let id = 0;
  const context = { newId: () => 'test_' + (++id), now: '2026-08-28T10:00:00.000Z' };
  let state = createEmptyState(context);
  const send = (type, payload, extra = {}) => {
    const result = reduceCommand(state, { type, payload, commandId: 'operation_' + (++id), expectedRevision: state.revision }, { ...context, ...extra });
    state = result.state;
    return result;
  };
  if (fixtureId) send('LOAD_FIXTURE', { fixtureId });
  return { get state() { return state; }, send };
}
function analyze(h) {
  h.send('FOCUS_CONFIRM', { inputVersion: h.state.round.inputVersion });
  const result = buildDemoAnalysis(h.state);
  assert.equal(result.ok, true, result.message);
  h.send('ANALYSIS_SET', { analysis: result.analysis });
}
function selectAndSave(h, pathIndex = 0) {
  const analysis = h.state.analysis;
  h.send('PATH_SELECT', { analysisId: analysis.id, pathId: analysis.paths[pathIndex].id, inputVersion: h.state.round.inputVersion });
  const result = buildDemoArtifact(h.state);
  assert.equal(result.ok, true);
  result.artifacts.forEach((artifact) => h.send('ARTIFACT_SAVE', { artifact }));
}

test('all explicit fixtures start without analysis, selection, execution or future feedback', () => {
  for (const fixtureId of FIXTURE_IDS) {
    const h = harness(fixtureId);
    assert.equal(h.state.analysis, null);
    assert.equal(h.state.selection, null);
    assert.deepEqual(h.state.executionRecords, []);
    assert.deepEqual(h.state.feedbackRecords, []);
    assert.equal(h.state.input.confirmedVersion, null);
    assert.equal(h.state.round.clarification.status, 'unused');
  }
});
test('unchanged fixture intake confirmation preserves provenance, IDs and input version', () => {
  for (const fixtureId of FIXTURE_IDS) {
    const h = harness(fixtureId);
    const before = h.state;
    const draft = before.input.intake?.draft || createMerchantIntakeDraft({ sources: ['manual'] });
    const payload = { roundId: before.round.id, inputVersion: before.round.inputVersion,
      draft: structuredClone(draft), description: before.input.description, sourceBindings: [] };
    const result = h.send('INTAKE_SET', payload);
    assert.equal(h.state.fixtureId, fixtureId);
    assert.equal(result.changed, false);
    assert.equal(h.state, before);
    h.send('FOCUS_CONFIRM', { inputVersion: h.state.round.inputVersion });
    const confirmed = h.state;
    assert.equal(h.send('INTAKE_SET', payload).changed, false);
    assert.equal(h.state, confirmed);
    assert.equal(h.state.input.confirmedVersion, before.round.inputVersion);
  }
});

test('juicer fixture contains one scoped five-stage dataset and no prerecorded business results', () => {
  const h = harness('juicer_cup_v1');
  const input = h.state.input;
  const draft = input.intake.draft;
  assert.equal(draft.productName, '350ml便携榨汁杯');
  assert.equal(draft.price, '69.9元');
  assert.match(draft.specifications, /350ml/);
  assert.match(draft.specifications, /USB-C/);
  const values = { video_views: 58000, product_clicks: 1450, add_to_carts: 96, created_orders: 54, paid_orders: 42 };
  for (const [key, value] of Object.entries(values)) {
    const matches = input.facts.filter((fact) => fact.key === key);
    assert.equal(matches.length, 1);
    const fact = matches[0];
    assert.equal(fact.value, value);
    assert.equal(fact.subject, draft.productName);
    assert.ok(fact.unit);
    assert.match(fact.channel, /合成/);
    assert.match(fact.cohort, /嵌套事件/);
    assert.deepEqual(fact.window, { start: '2026-08-21', end: '2026-08-27' });
    assert.equal(fact.source.kind, 'merchant_statement');
    assert.equal(fact.source.materialId, null);
    assert.match(fact.source.locator.quote, /合成演示/);
    assert.equal(fact.verification, 'unreviewed');
  }
  assert.equal(input.facts.some((fact) => fact.key === 'product_detail_visitors'), false);
  assert.equal(input.facts.some((fact) => /refund/.test(fact.key) && fact.value === 0), false);
  assert.ok(input.unknowns.some((entry) => entry.description.includes('退款')));
  assert.ok(input.unknowns.some((entry) => entry.description.includes('投流')));
  const problem = input.facts.find((fact) => fact.intakeField === 'currentProblem');
  assert.equal(problem.evidenceStatus, 'owner_hypothesis');
  assert.equal(problem.verification, 'unreviewed');
  assert.deepEqual(input.materials, []);
  assert.equal(draft.transcript, '');
  assert.equal(input.confirmedVersion, null);
  assert.equal(input.intake.roundId, h.state.round.id);
  assert.equal(input.intake.inputVersion, h.state.round.inputVersion);
  assert.equal(JSON.stringify(input).includes('draft_intake_'), false);
  assert.equal(h.state.analysis, null);
  assert.equal(h.state.selection, null);
  assert.deepEqual(h.state.executionRecords, []);
  assert.deepEqual(h.state.feedbackRecords, []);
});

function fixtureEditPayload(h, field, value) {
  const input = h.state.input;
  const draft = structuredClone(input.intake.draft);
  const target = field.startsWith('metrics.') ? draft.metrics : draft;
  const key = field.startsWith('metrics.') ? field.slice(8) : field;
  const before = target[key];
  target[key] = value;
  draft.userCorrections.push({ field, before, after: value });
  return { roundId: h.state.round.id, inputVersion: h.state.round.inputVersion, draft,
    description: input.description, sourceBindings: structuredClone(input.intake.sourceBindings) };
}

test('first substantive edits to a fixture remove canned provenance and keep explicit corrections', () => {
  for (const [field, value] of [['price', '79.9元'], ['metrics.addToCarts', 100], ['description', '用户实际补充的新资料']]) {
    const h = harness('juicer_cup_v1');
    const beforeVersion = h.state.round.inputVersion;
    const payload = field === 'description' ? { roundId: h.state.round.id, inputVersion: beforeVersion,
      draft: structuredClone(h.state.input.intake.draft), description: value, sourceBindings: [] } : fixtureEditPayload(h, field, value);
    h.send('INTAKE_SET', payload);
    assert.equal(h.state.fixtureId, null);
    assert.equal(h.state.round.inputVersion, beforeVersion + 1);
    assert.equal(h.state.input.confirmedVersion, null);
    if (field !== 'description') {
      const fact = h.state.input.facts.find((entry) => entry.intakeField === field);
      assert.equal(fact.value, value);
      assert.equal(fact.verification, 'user_corrected');
    }
    analyze(h);
    assert.equal(h.state.analysis.mode, 'local_limited');
    assert.equal(h.state.analysis.paths.some((path) => /补全商品购买问答区|调整视频前几秒/.test(path.title)), false);
  }
});

test('unchanged measured fields retain their scope but edited values, product, window or source do not inherit it', () => {
  for (const [field, value] of [['price', '79.9元'], ['metrics.productClicks', 1500], ['metrics.windowStart', '2026-08-20'],
    ['productName', '另一款商品'], ['platform', '另一平台']]) {
    const h = harness('juicer_cup_v1');
    const before = structuredClone(h.state.input.facts.filter((fact) => fact.intakeField?.startsWith('metrics.') && typeof fact.value === 'number'));
    h.send('INTAKE_SET', fixtureEditPayload(h, field, value));
    for (const old of before) {
      const fact = h.state.input.facts.find((entry) => entry.id === old.id);
      const unchanged = field === 'price' || field === 'metrics.productClicks' && old.intakeField !== field;
      if (unchanged) {
        assert.equal(fact.unit, old.unit);
        assert.equal(fact.channel, old.channel);
        assert.equal(fact.cohort, old.cohort);
      } else {
        assert.equal(fact.unit, null);
        assert.equal(fact.channel, null);
        assert.equal(fact.cohort, null);
      }
    }
  }
  const h = harness('juicer_cup_v1');
  const payload = fixtureEditPayload(h, 'price', '79.9元');
  payload.draft.evidenceLedger.find((entry) => entry.field === 'metrics.productClicks').quote = '另一份未经核对的来源';
  h.send('INTAKE_SET', payload);
  const changed = h.state.input.facts.find((fact) => fact.intakeField === 'metrics.productClicks');
  assert.equal(changed.channel, null);
  assert.equal(changed.cohort, null);
  const hypothetical = harness('juicer_cup_v1');
  const hypothesisPayload = fixtureEditPayload(hypothetical, 'price', '79.9元');
  hypothesisPayload.draft.evidenceLedger.find((entry) => entry.field === 'metrics.productClicks').status = 'owner_hypothesis';
  hypothetical.send('INTAKE_SET', hypothesisPayload);
  const hypothesis = hypothetical.state.input.facts.find((fact) => fact.intakeField === 'metrics.productClicks');
  assert.equal(hypothesis.evidenceStatus, 'owner_hypothesis');
  assert.equal(hypothesis.unit, null);
  assert.equal(hypothesis.channel, null);
  const reverted = harness('juicer_cup_v1');
  reverted.send('INTAKE_SET', fixtureEditPayload(reverted, 'metrics.productClicks', 1500));
  reverted.send('INTAKE_SET', fixtureEditPayload(reverted, 'metrics.productClicks', 1450));
  assert.equal(reverted.state.fixtureId, null);
  const restoredValue = reverted.state.input.facts.find((fact) => fact.intakeField === 'metrics.productClicks');
  assert.equal(restoredValue.value, 1450);
  assert.equal(restoredValue.unit, null);
  assert.equal(restoredValue.channel, null);
  assert.equal(restoredValue.cohort, null);
});

test('a normal merchant input named juicer never loads the synthetic fixture or its missing data', () => {
  const h = harness();
  const draft = createMerchantIntakeDraft({ sources: ['manual'], productName: '350ml便携榨汁杯', price: '69.9元' });
  h.send('INTAKE_SET', { roundId: h.state.round.id, inputVersion: h.state.round.inputVersion,
    draft, description: '真实商品同名，但没有提供经营数据', sourceBindings: [] });
  assert.equal(h.state.fixtureId, null);
  assert.equal(h.state.input.facts.some((fact) => fact.key === 'video_views' && fact.value === 58000), false);
  assert.equal(h.state.input.facts.some((fact) => fact.key === 'paid_orders' && fact.value === 42), false);
  analyze(h);
  assert.equal(h.state.analysis.mode, 'local_limited');
  assert.equal(h.state.analysis.status, 'limited');
  assert.equal(h.state.analysis.paths[0].estimate.kind, 'unavailable');
});


test('juicer analysis keeps a sourced five-stage funnel separate from its verification priority', () => {
  const h = harness('juicer_cup_v1');
  h.send('FOCUS_CONFIRM', { inputVersion: h.state.round.inputVersion });
  const result = buildDemoAnalysis(h.state);
  assert.equal(result.ok, true);
  assert.deepEqual(result.analysis.paths.map((path) => path.title), ['补全首屏购买判断', '制作真实问题验证内容']);
  assert.equal(result.analysis.funnel.status, 'comparable');
  assert.deepEqual(result.analysis.funnel.stages.map((stage) => stage.value), [58000, 1450, 96, 54, 42]);
  assert.equal(result.analysis.funnel.transitions[0].conversionRate, 1450 / 58000);
  assert.equal(result.analysis.funnel.transitions[1].conversionRate, 96 / 1450);
  assert.equal(result.analysis.funnel.transitions[0].lossCount, 56550);
  assert.equal(result.analysis.funnel.transitions[1].lossCount, 1354);
  assert.equal(result.analysis.funnel.maximumLoss.byCount.fromKey, 'video_views');
  assert.equal(result.analysis.priority.fromKey, 'product_clicks');
  assert.equal(result.analysis.priority.rootCauseConfirmed, false);
  assert(result.analysis.paths.every((path) => path.estimate.kind === 'unavailable' && path.estimate.values.length === 0));
  h.send('ANALYSIS_SET', { analysis: result.analysis });
  assert.equal(h.state.selection, null);
  assert.deepEqual(h.state.executionRecords, []);
});


test('five-stage quality refuses ambiguous, hypothetical, invalid or unmatched observations', () => {
  const h = harness('juicer_cup_v1');
  h.send('FOCUS_CONFIRM', { inputVersion: h.state.round.inputVersion });
  const mutations = [
    (s) => { s.input.facts = s.input.facts.filter((f) => f.key !== 'video_views'); },
    (s) => { s.input.facts.push({ ...s.input.facts.find((f) => f.key === 'product_clicks'), id: 'duplicate_clicks' }); },
    (s) => { const f = s.input.facts.find((f) => f.key === 'add_to_carts'); f.value = null; f.availability = 'unknown'; },
    (s) => { s.input.facts.find((f) => f.key === 'product_clicks').evidenceStatus = 'owner_hypothesis'; },
    (s) => { s.input.facts.find((f) => f.key === 'product_clicks').verification = 'conflicting'; },
    (s) => { s.input.facts.find((f) => f.key === 'product_clicks').source.kind = 'scenario_assumption'; },
    (s) => { s.input.facts.find((f) => f.key === 'product_clicks').source.kind = 'public_reference'; },
    (s) => { s.input.facts.find((f) => f.key === 'product_clicks').unit = '人'; },
    (s) => { s.input.facts.find((f) => f.key === 'product_clicks').channel = '另一渠道'; },
    (s) => { s.input.facts.find((f) => f.key === 'product_clicks').cohort = null; },
    (s) => { s.input.facts.find((f) => f.key === 'product_clicks').window.start = '2026-02-30'; },
    (s) => { s.input.facts.find((f) => f.key === 'product_clicks').window.end = '2026-08-01'; },
    (s) => { s.input.facts.find((f) => f.key === 'add_to_carts').value = 2000; },
    (s) => { s.input.facts.find((f) => f.key === 'product_clicks').value = -1; },
    (s) => { s.input.facts.find((f) => f.key === 'video_views').value = Number.MAX_SAFE_INTEGER + 1; },
    (s) => { s.fixtureId = null; }
  ];
  for (const mutate of mutations) {
    const state = structuredClone(h.state);
    mutate(state);
    const result = buildDemoAnalysis(state);
    assert.equal(result.ok, true);
    assert.equal(result.analysis.funnel.status, 'unavailable');
    assert(result.analysis.funnel.transitions.every((edge) => edge.conversionRate === null && edge.lossRate === null));
    assert(result.analysis.paths.every((path) => !path.actionKey));
  }
  const zero = structuredClone(h.state);
  zero.input.facts.filter((fact) => ['video_views', 'product_clicks', 'add_to_carts', 'created_orders', 'paid_orders'].includes(fact.key)).forEach((fact) => { fact.value = 0; });
  const result = buildDemoAnalysis(zero);
  assert.deepEqual(result.analysis.funnel.stages.map((stage) => stage.value), [0, 0, 0, 0, 0]);
  assert(result.analysis.funnel.transitions.every((edge) => edge.conversionRate === null && edge.lossRate === null && edge.lossCount === 0));
  assert.equal(result.analysis.priority.status, 'unavailable');
});

test('shared analysis validation rejects forged funnel arithmetic and unresolved experiment references', () => {
  const h = harness('juicer_cup_v1');
  h.send('FOCUS_CONFIRM', { inputVersion: h.state.round.inputVersion });
  const draft = buildDemoAnalysis(h.state).analysis;
  const before = structuredClone(h.state);
  const mutations = [
    (a) => { a.funnel.transitions[1].conversionRate = 0.9; },
    (a) => { a.funnel.stages[1].factIds = [...a.funnel.stages[0].factIds]; },
    (a) => { a.priority.rootCauseConfirmed = true; },
    (a) => { a.processing[0].kind = 'external_ai'; },
    (a) => { a.paths[0].experiment.guardrails[0].sourceFactIds = ['missing_fact']; },
    (a) => { a.paths[0].experiment.restoreSteps = null; },
    (a) => { a.paths[0].experiment.minSampleUnit = null; },
    (a) => { a.paths[0].experiment.minSample = -1; }
  ];
  for (const mutate of mutations) {
    const changed = structuredClone(draft); mutate(changed);
    assert.throws(() => h.send('ANALYSIS_SET', { analysis: changed }), { code: 'invalid_structure' });
    assert.deepEqual(h.state, before);
  }
});

test('analysis agreement and uncertainty record feelings without confirming facts or selecting an action', () => {
  const h = harness('juicer_cup_v1'); analyze(h);
  const beforeInput = structuredClone(h.state.input);
  const beforeQuestions = structuredClone(h.state.round.clarification);
  const oldDraft = buildDemoAnalysis(h.state).analysis;
  const base = { roundId: h.state.round.id, inputVersion: h.state.round.inputVersion, analysisId: h.state.analysis.id };
  h.send('ANALYSIS_REVIEW_SAVE', { ...base, stance: 'agree', reason: null });
  const reviews = () => h.state.history.filter((entry) => entry.type === 'analysis_review');
  assert.equal(reviews().length, 1);
  assert.equal(h.send('ANALYSIS_REVIEW_SAVE', { ...base, stance: 'agree', reason: '' }).changed, false);
  h.send('ANALYSIS_REVIEW_SAVE', { ...base, stance: 'uncertain', reason: '还不能确认原因' });
  assert.equal(reviews().length, 2);
  assert.deepEqual(h.state.input, beforeInput);
  assert.deepEqual(h.state.round.clarification, beforeQuestions);
  assert.equal(h.state.selection, null);
  assert.deepEqual(h.state.executionRecords, []);
  assert.throws(() => h.send('ANALYSIS_SET', { analysis: oldDraft }), { code: 'stale_input' });
  const draft = buildDemoAnalysis(h.state).analysis;
  assert.equal(draft.reviewId, reviews().at(-1).id);
  assert.equal(draft.priority.rootCauseConfirmed, false);
  h.send('ANALYSIS_SET', { analysis: draft });
  assert.equal(reviews().length, 2);
});

test('analysis disagreement revokes downstream choices but preserves the confirmed input and original reason', () => {
  const h = harness('juicer_cup_v1'); analyze(h); selectAndSave(h);
  const beforeInput = structuredClone(h.state.input), beforeVersion = h.state.round.inputVersion;
  const previous = structuredClone(h.state.analysis);
  const payload = { roundId: h.state.round.id, inputVersion: beforeVersion, analysisId: previous.id, stance: 'disagree', reason: '实际情况不是这个原因' };
  h.send('ANALYSIS_REVIEW_SAVE', payload);
  assert.deepEqual(h.state.input, beforeInput);
  assert.equal(h.state.round.inputVersion, beforeVersion);
  assert.equal(h.state.analysis.status, 'stale');
  assert.equal(h.state.selection, null);
  assert(h.state.artifacts.every((artifact) => artifact.status === 'stale'));
  assert.equal(h.send('ANALYSIS_REVIEW_SAVE', payload).changed, false);
  assert.throws(() => h.send('PATH_SELECT', { analysisId: previous.id, pathId: previous.paths[0].id, inputVersion: beforeVersion }), { code: 'stale_input' });
  assert.equal(buildDemoArtifact(h.state).ok, false);
  const draft = buildDemoAnalysis(h.state).analysis;
  assert.deepEqual(draft.paths, []);
  assert.equal(draft.priority.status, 'unavailable');
  h.send('ANALYSIS_SET', { analysis: draft });
  assert.equal(h.state.history.filter((entry) => entry.type === 'analysis_review').length, 1);
  assert.deepEqual(h.state.feedbackRecords, []);
  assert.deepEqual(h.state.executionRecords, []);
});

test('unavailable-action feedback removes only explicitly blocked paths and never chooses a replacement', () => {
  for (const blockBoth of [false, true]) {
    const h = harness('juicer_cup_v1'); analyze(h);
    const pathIds = h.state.analysis.paths.slice(0, blockBoth ? 2 : 1).map((path) => path.id);
    h.send('ANALYSIS_REVIEW_SAVE', { roundId: h.state.round.id, inputVersion: h.state.round.inputVersion,
      analysisId: h.state.analysis.id, stance: 'not_actionable', reason: blockBoth ? '这两处目前都不能修改' : '详情页首屏目前不能修改', blockedPathIds: pathIds });
    const draft = buildDemoAnalysis(h.state).analysis;
    assert.deepEqual(draft.paths.map((path) => path.actionKey), blockBoth ? [] : ['juicer_question_video']);
    h.send('ANALYSIS_SET', { analysis: draft });
    assert.equal(h.state.selection, null);
    assert.deepEqual(h.state.executionRecords, []);
  }
});

test('analysis review rejects stale scope, invented path references and missing inability reasons', () => {
  const h = harness('juicer_cup_v1'); analyze(h);
  const base = { roundId: h.state.round.id, inputVersion: h.state.round.inputVersion, analysisId: h.state.analysis.id, stance: 'agree' };
  const before = structuredClone(h.state);
  for (const [patch, code] of [
    [{ roundId: 'old_round' }, 'stale_input'], [{ inputVersion: 0 }, 'stale_input'], [{ analysisId: 'old_analysis' }, 'stale_input'],
    [{ stance: 'done' }, 'invalid_payload'], [{ reason: 42 }, 'invalid_payload'],
    [{ stance: 'not_actionable', reason: '做不了', blockedPathIds: ['missing_path'] }, 'invalid_structure'],
    [{ stance: 'not_actionable', reason: '', blockedPathIds: [h.state.analysis.paths[0].id] }, 'invalid_payload']
  ]) {
    assert.throws(() => h.send('ANALYSIS_REVIEW_SAVE', { ...base, ...patch }), { code });
    assert.deepEqual(h.state, before);
  }
  assert.throws(() => h.send('EVENT_APPEND', { event: { type: 'analysis_review_saved', refs: {} } }), { code: 'invalid_transition' });
});

test('juicer A and B produce only the selected sourced copy, separate unknowns and the same eight-part plan', () => {
  for (const pathIndex of [0, 1]) {
    const h = harness('juicer_cup_v1'); analyze(h);
    const path = h.state.analysis.paths[pathIndex];
    h.send('PATH_SELECT', { analysisId: h.state.analysis.id, pathId: path.id, inputVersion: h.state.round.inputVersion });
    const result = buildDemoArtifact(h.state);
    assert.equal(result.ok, true);
    assert.deepEqual(result.artifacts.map((artifact) => artifact.kind), ['copy', 'checklist', 'experiment_plan']);
    const [copy, checklist, plan] = result.artifacts;
    assert(copy.body.includes('350ml') && copy.body.includes('USB-C'));
    assert(copy.body.includes('本轮不承诺'));
    assert(!/可以打冰|保证.*续航|承诺.*次续航/.test(copy.body));
    assert(checklist.body.includes('冰块') && checklist.body.includes('续航') && checklist.body.includes('清洗') && checklist.body.includes('售后'));
    assert(copy.body.includes(pathIndex === 0 ? '购买前先确认' : '真实问题验证视频'));
    assert(copy.body.includes('全国包邮') && copy.body.includes('说明书'));
    const sourceIds = h.state.input.facts.filter((fact) => ['confirmedProductFacts.0', 'confirmedProductFacts.1', 'confirmedProductFacts.2', 'confirmedProductFacts.3', 'productName', 'targetCustomerHypothesis'].includes(fact.intakeField)).map((fact) => fact.id);
    assert.deepEqual([...copy.sourceFactIds].sort(), sourceIds.sort());
    for (const label of ['本轮只改什么', '本轮保持不变', '主要观察', '最小样本', '观察时间', '护栏指标', '停止条件', '回滚方式']) assert(plan.body.includes(label));
    assert.equal(path.experiment.minSample, 100);
    assert.equal(path.experiment.minSampleUnit, '次新增商品点击');
    assert.equal(path.experiment.window.start, null);
    assert.equal(path.experiment.window.end, null);
    assert(path.experiment.guardrails.length && path.experiment.restoreSteps.length);
    result.artifacts.forEach((artifact) => h.send('ARTIFACT_SAVE', { artifact }));
    const artifact = h.state.artifacts.find((item) => item.kind === 'copy');
    h.send('FEEDBACK_SAVE', { feedbackRecord: { id: null, artifactId: artifact.id, artifactVersion: artifact.version, observation: 'unknown', rawText: '' } });
    assert.equal(h.state.fixtureId, null);
    assert.equal(buildDemoArtifact(h.state).artifacts.find((item) => item.kind === 'copy').body, copy.body);
    assert.deepEqual(h.state.executionRecords, []);
  }
});

test('juicer output does not fill missing product facts or save a candidate for another selected path', () => {
  const h = harness('juicer_cup_v1'); analyze(h);
  h.send('PATH_SELECT', { analysisId: h.state.analysis.id, pathId: h.state.analysis.paths[0].id, inputVersion: h.state.round.inputVersion });
  const snapshot = structuredClone(h.state);
  snapshot.analysis.inputSnapshot.facts.find((fact) => fact.intakeField === 'confirmedProductFacts.0').evidenceStatus = 'owner_hypothesis';
  const result = buildDemoArtifact(snapshot);
  assert.equal(result.ok, true);
  assert(!result.artifacts.some((artifact) => artifact.kind === 'copy'));
  assert(result.limitations.some((line) => line.includes('未生成')));
  const draft = buildDemoArtifact(h.state).artifacts[0];
  assert.throws(() => h.send('ARTIFACT_SAVE', { artifact: { ...draft, pathId: h.state.analysis.paths[1].id } }), { code: 'stale_input' });
  assert.throws(() => h.send('ARTIFACT_SAVE', { artifact: { ...draft, usage: { ...draft.usage, risks: '不能用字符串替代列表' } } }), { code: 'invalid_structure' });
  assert.deepEqual(h.state.artifacts, []);
});


test('analysis restrictions accumulate through later reviews instead of restoring rejected actions', () => {
  const h = harness('juicer_cup_v1'); analyze(h);
  const review = (stance, blockedPathIds = []) => h.send('ANALYSIS_REVIEW_SAVE', {
    roundId: h.state.round.id, inputVersion: h.state.round.inputVersion, analysisId: h.state.analysis.id,
    stance, reason: '合成测试：保留本轮明确限制', blockedPathIds
  });
  const reconsider = () => h.send('ANALYSIS_SET', { analysis: buildDemoAnalysis(h.state).analysis });
  review('not_actionable', [h.state.analysis.paths[0].id]); reconsider();
  assert.deepEqual(h.state.analysis.paths.map((path) => path.actionKey), ['juicer_question_video']);
  review('agree'); reconsider();
  assert.deepEqual(h.state.analysis.paths.map((path) => path.actionKey), ['juicer_question_video']);
  review('not_actionable', [h.state.analysis.paths[0].id]); reconsider();
  assert.deepEqual(h.state.analysis.paths, []);
  review('agree'); reconsider();
  assert.deepEqual(h.state.analysis.paths, []);
  const other = harness('juicer_cup_v1'); analyze(other);
  for (const stance of ['disagree', 'agree', 'uncertain']) {
    other.send('ANALYSIS_REVIEW_SAVE', { roundId: other.state.round.id, inputVersion: other.state.round.inputVersion,
      analysisId: other.state.analysis.id, stance, reason: '合成测试：不是该原因' });
    other.send('ANALYSIS_SET', { analysis: buildDemoAnalysis(other.state).analysis });
    assert.deepEqual(other.state.analysis.paths, []);
    assert.equal(other.state.analysis.priority.status, 'unavailable');
  }
});

test('a stale analysis cannot bypass saved restrictions by copying the latest review ID', () => {
  for (const stance of ['disagree', 'not_actionable']) for (const omitActionKey of [false, true]) {
    const h = harness('juicer_cup_v1'); analyze(h);
    const oldDraft = buildDemoAnalysis(h.state).analysis;
    h.send('ANALYSIS_REVIEW_SAVE', { roundId: h.state.round.id, inputVersion: h.state.round.inputVersion,
      analysisId: h.state.analysis.id, stance, reason: '合成测试限制',
      blockedPathIds: stance === 'not_actionable' ? [h.state.analysis.paths[0].id] : [] });
    const reviewIds = h.state.history.filter((entry) => entry.type === 'analysis_review').map((entry) => entry.id);
    oldDraft.reviewId = reviewIds.at(-1);
    oldDraft.reviewIds = reviewIds;
    if (omitActionKey) delete oldDraft.paths[0].actionKey;
    assert.throws(() => h.send('ANALYSIS_SET', { analysis: oldDraft }), { code: 'invalid_structure' },
      stance + ': omitting an optional action key cannot restore an excluded action');
    assert.equal(h.state.analysis.status, 'stale');
  }
});

test('priority observation references cannot hide hypotheses in sourceIds or omit evidence', () => {
  const h = harness('juicer_cup_v1');
  h.send('FOCUS_CONFIRM', { inputVersion: h.state.round.inputVersion });
  h.state.input.facts.push({ id: 'synthetic_owner_hypothesis', key: 'synthetic_hypothesis', value: '老板猜测',
    availability: 'known', evidenceStatus: 'owner_hypothesis', verification: 'unreviewed',
    source: { kind: 'merchant_statement', materialId: null, materialVersion: null, locator: { type: 'input', field: 'description' }, note: '合成反例' } });
  for (const sourceIds of [['fact:synthetic_owner_hypothesis'], ['input:description'], []]) {
    const draft = buildDemoAnalysis(h.state).analysis;
    draft.priority.facts = [{ text: '伪装成观测的老板猜测', sourceFactIds: [], sourceIds }];
    assert.throws(() => h.send('ANALYSIS_SET', { analysis: draft }), { code: 'invalid_structure' });
  }
});

test('juicer copy requires a unique product source and does not treat capacity as processing yield', () => {
  const h = harness('juicer_cup_v1'); analyze(h);
  h.send('PATH_SELECT', { analysisId: h.state.analysis.id, pathId: h.state.analysis.paths[0].id, inputVersion: h.state.round.inputVersion });
  const validCopy = buildDemoArtifact(h.state).artifacts.find((artifact) => artifact.kind === 'copy');
  assert(validCopy.body.includes('容量为350ml'));
  assert(!validCopy.body.includes('一次能榨'));
  for (const value of ['容量为350ml', '容量为500ml']) {
    const snapshot = structuredClone(h.state);
    const original = snapshot.analysis.inputSnapshot.facts.find((fact) => fact.intakeField === 'confirmedProductFacts.0');
    snapshot.analysis.inputSnapshot.facts.push({ ...original, id: 'another_capacity_source', value });
    const result = buildDemoArtifact(snapshot);
    assert(!result.artifacts.some((artifact) => artifact.kind === 'copy'));
    assert(result.limitations.some((line) => line.includes('未生成')));
  }
});

test('legacy C5 plan optional fields still degrade without inventing a rollback', () => {
  const h = harness('juicer_cup_v1');
  h.send('FOCUS_CONFIRM', { inputVersion: h.state.round.inputVersion });
  const draft = buildDemoAnalysis(h.state).analysis;
  // Simulate an already saved legacy action; do not rename it to the PRD first-screen action.
  draft.paths[0].actionKey = 'juicer_faq';
  draft.paths[0].title = '补全商品购买问答区';
  draft.paths[0].experiment.change = '商品购买问答区';
  delete draft.paths[0].experiment.guardrails;
  delete draft.paths[0].experiment.restoreSteps;
  delete draft.paths[0].experiment.minSampleUnit;
  h.send('ANALYSIS_SET', { analysis: draft });
  h.send('PATH_SELECT', { analysisId: h.state.analysis.id, pathId: h.state.analysis.paths[0].id, inputVersion: h.state.round.inputVersion });
  const result = buildDemoArtifact(h.state);
  assert.equal(result.ok, true);
  const plan = result.artifacts.find((artifact) => artifact.kind === 'experiment_plan');
  assert(plan.body.includes('护栏指标：尚未提供'));
  assert(plan.body.includes('回滚方式：尚未提供'));
});

test('full synthetic flow creates valid trees and maps draft IDs before selection', () => {
  const h = harness('underbed_complete_v1');
  const snapshot = structuredClone(h.state);
  assert.equal(buildDemoAnalysis(h.state).ok, false);
  assert.deepEqual(h.state, snapshot);
  analyze(h);
  assert.equal(h.state.analysis.paths.length, 2);
  assert.equal(JSON.stringify(h.state.analysis).includes('"draft_'), false);
  assert.deepEqual(h.state.analysis.paths[0].estimate.values.map((entry) => entry.value), [0, 1, 2]);
  selectAndSave(h);
  assert.equal(h.state.artifacts.length, 2);
  assert.match(h.state.artifacts[0].body, /69\.90/);
  assert.match(h.state.artifacts[0].body, /60×40×16cm/);
  assert.deepEqual(h.state.executionRecords, []);
});
test('one sentence and incompatible scopes give limited results, never a fabricated rate', () => {
  for (const fixture of ['one_sentence_v1', 'scope_conflict_v1']) {
    const h = harness(fixture);
    analyze(h);
    assert.equal(h.state.analysis.status, 'limited');
    assert.equal(h.state.analysis.paths[0].estimate.kind, 'unavailable');
    assert.equal(h.state.analysis.paths[0].estimate.incrementalEffect.kind, 'unavailable');
  }
});
test('user changes remove all-synthetic provenance and invalidate selected content', () => {
  const h = harness('underbed_complete_v1');
  analyze(h); selectAndSave(h);
  const inputVersion = h.state.round.inputVersion;
  h.send('INPUT_EDIT', { description: '这是用户新增的描述，不能标成全部合成资料。' });
  assert.equal(h.state.fixtureId, null);
  assert.equal(h.state.round.inputVersion, inputVersion + 1);
  assert.equal(h.state.selection, null);
  assert.equal(h.state.input.confirmedVersion, null);
  assert.equal(h.state.analysis.status, 'stale');
  assert(h.state.artifacts.every((artifact) => artifact.status === 'stale'));
  assert.equal(h.state.input.intake.status, 'stale');
  assert.throws(() => h.send('FOCUS_CONFIRM', { inputVersion: h.state.round.inputVersion }), { code: 'stale_input' });
  h.send('INTAKE_SET', { roundId: h.state.round.id, inputVersion: h.state.round.inputVersion,
    draft: structuredClone(h.state.input.intake.draft), description: h.state.input.description,
    sourceBindings: structuredClone(h.state.input.intake.sourceBindings) });
  analyze(h);
  assert.equal(h.state.analysis.mode, 'local_limited');
});
test('changed dimensions never retain the original canned specification', () => {
  const h = harness('underbed_complete_v1');
  const fact = structuredClone(h.state.input.facts.find((entry) => entry.key === 'external_height'));
  fact.value = 14;
  h.send('FACT_PATCH', { fact, reason: '用户更正为14cm' });
  assert.equal(h.state.fixtureId, null);
  analyze(h); selectAndSave(h);
  assert.equal(h.state.artifacts.some((artifact) => artifact.body.includes('60×40×16cm')), false);
  assert.equal(h.state.input.facts.find((entry) => entry.id === fact.id).verification, 'user_corrected');
});
test('first question uses null ID, consumes budget without input change, unknown stays unknown', () => {
  const h = harness('one_sentence_v1');
  const version = h.state.round.inputVersion;
  h.send('QUESTION_SET', { questionId: null, status: 'asked', questionText: '这轮能投入多少时间？', sourceFactIds: [] });
  const questionId = h.state.round.clarification.questionId;
  assert(questionId);
  assert.equal(h.state.round.inputVersion, version);
  assert.throws(() => h.send('QUESTION_SET', { questionId: null, status: 'asked', questionText: '另一题', sourceFactIds: [] }), { code: 'invalid_transition' });
  h.send('QUESTION_SET', { questionId, status: 'answered', answer: { availability: 'unknown', rawText: null } });
  assert.equal(h.state.round.inputVersion, version + 1);
  assert.equal(h.state.input.unknowns.find((entry) => entry.sourceId === 'question:' + questionId).reason, 'unknown');
});

test('three-question budget is sequential, preserves older answers and survives ordinary input edits', () => {
  const h = harness('one_sentence_v1');
  const ask = (questionText) => h.send('QUESTION_SET', { roundId: h.state.round.id, inputVersion: h.state.round.inputVersion,
    questionId: null, status: 'asked', questionText, sourceFactIds: [] });
  ask('商品是什么？');
  const first = h.state.round.clarification.questionId;
  h.send('QUESTION_SET', { questionId: first, status: 'answered', answer: { availability: 'known', rawText: '合成样例商品' } });
  h.send('INPUT_EDIT', { description: '主动补充输入不应重发补问额度。' });
  ask('这轮希望先改什么？');
  const second = h.state.round.clarification.questionId;
  const version = h.state.round.inputVersion;
  h.send('QUESTION_SET', { questionId: second, status: 'skipped' });
  assert.equal(h.state.round.inputVersion, version);
  ask('本轮有什么限制？');
  const third = h.state.round.clarification.questionId;
  h.send('QUESTION_SET', { questionId: first, status: 'answered', answer: { availability: 'known', rawText: '改正后的商品原话' } });
  assert.equal(h.state.round.clarification.activeQuestionId, third);
  assert.equal(h.state.round.clarification.questionId, third);
  h.send('QUESTION_SET', { questionId: third, status: 'answered', answer: { availability: 'unknown', rawText: null } });
  const clarification = h.state.round.clarification;
  assert.equal(clarification.activeQuestionId, null);
  assert.equal(clarification.remaining, 0);
  assert.deepEqual(clarification.questions.map((entry) => entry.questionId), [first, second, third]);
  assert.equal(clarification.questions[0].answer.rawText, '改正后的商品原话');
  assert(clarification.questions.every((entry) => validSourceId('question:' + entry.questionId, h.state)));
  assert.throws(() => ask('超出额度的一题'), { code: 'invalid_transition' });
  assert.throws(() => h.send('QUESTION_SET', { questionId: first, status: 'skipped' }), { code: 'invalid_transition' });
  assert.throws(() => h.send('QUESTION_SET', { questionId: second, status: 'answered', questionText: '悄悄换题', answer: { availability: 'unknown', rawText: null } }), { code: 'invalid_transition' });
});

test('old one-question state gains a read-only history without changing IDs, values or save metadata', () => {
  const h = harness('one_sentence_v1');
  h.send('QUESTION_SET', { questionId: null, status: 'asked', questionText: '旧版已问的问题', sourceFactIds: [] });
  h.send('QUESTION_SET', { questionId: h.state.round.clarification.questionId, status: 'answered', answer: { availability: 'known', rawText: '旧答案保留' } });
  const legacy = structuredClone(h.state);
  const { questions, activeQuestionId, remaining, ...singleton } = legacy.round.clarification;
  legacy.round.clarification = { ...singleton, limit: 1 };
  delete legacy.input.intake;
  const before = structuredClone(legacy);
  const view = normalizeSessionState(legacy);
  assert.deepEqual(legacy, before);
  assert.equal(view.savedAt, before.savedAt);
  assert.equal(view.revision, before.revision);
  assert.deepEqual(view.events, before.events);
  assert.equal(view.input.intake, null);
  assert.equal(view.round.clarification.remaining, 2);
  assert.equal(view.round.clarification.questions[0].questionId, singleton.questionId);
  assert.deepEqual(view.round.clarification.questions[0].answer, singleton.answer);
});

test('changing an older answer invalidates its dependents while later questions and limits stay intact', () => {
  const h = harness('one_sentence_v1');
  h.send('QUESTION_SET', { questionId: null, status: 'asked', questionText: '你卖什么？', sourceFactIds: [] });
  const first = h.state.round.clarification.questionId;
  h.send('QUESTION_SET', { questionId: first, status: 'answered', answer: { availability: 'known', rawText: '一种商品' } });
  h.send('ORGANIZATION_SET', { roundId: h.state.round.id, inputVersion: h.state.round.inputVersion, focus: '核对商品',
    facts: [{ id: 'draft_question_fact', key: 'product_name', value: '一种商品', availability: 'known',
      source: { kind: 'merchant_statement', materialId: null, locator: { type: 'question', questionId: first } } }], constraints: [], unknowns: [] });
  h.send('QUESTION_SET', { questionId: null, status: 'asked', questionText: '本轮想怎么做？', sourceFactIds: [] });
  const second = h.state.round.clarification.questionId;
  analyze(h); selectAndSave(h);
  const version = h.state.round.inputVersion;
  h.send('QUESTION_SET', { questionId: first, status: 'answered', answer: { availability: 'unknown', rawText: null },
    roundId: h.state.round.id, inputVersion: version });
  assert.equal(h.state.input.facts.some((fact) => fact.source.locator?.questionId === first), false);
  assert.equal(h.state.analysis.status, 'stale');
  assert.equal(h.state.selection, null);
  assert.equal(h.state.round.clarification.activeQuestionId, second);
  assert.equal(h.state.round.clarification.remaining, 1);
  assert.throws(() => h.send('QUESTION_SET', { questionId: second, status: 'skipped', roundId: h.state.round.id, inputVersion: version }), { code: 'stale_input' });
});
test('late substantive organization revokes confirmation and rejects an older analysis snapshot', () => {
  const h = harness('underbed_complete_v1');
  analyze(h); selectAndSave(h);
  const oldAnalysis = structuredClone(h.state.analysis);
  const version = h.state.round.inputVersion;
  h.send('ORGANIZATION_SET', { roundId: h.state.round.id, inputVersion: version, focus: '补入新的本轮范围', facts: h.state.input.facts, constraints: h.state.input.constraints, unknowns: h.state.input.unknowns });
  assert.equal(h.state.round.inputVersion, version + 1);
  assert.equal(h.state.input.confirmedVersion, null);
  assert.equal(h.state.selection, null);
  assert.throws(() => h.send('ANALYSIS_SET', { analysis: oldAnalysis }), { code: 'stale_input' });
});
test('unchanged organization is a no-op, not a new input version', () => {
  const h = harness('underbed_complete_v1');
  analyze(h);
  const before = h.state;
  h.send('ORGANIZATION_SET', { roundId: before.round.id, inputVersion: before.round.inputVersion, focus: before.input.focus, facts: before.input.facts, constraints: before.input.constraints, unknowns: before.input.unknowns });
  assert.equal(h.state.revision, before.revision);
  assert.equal(h.state.round.inputVersion, before.round.inputVersion);
});
test('material capability lookup separates local reception, preview and restricted parsing', () => {
  for (const name of ['screen.PNG', 'screen.jpg', 'screen.jpeg', 'legacy.webp']) {
    const capability = getMaterialCapability(name);
    assert.equal(capability.receive, true);
    assert.equal(capability.preview, 'image');
    assert.equal(capability.parse, 'none');
    assert.throws(() => { capability.parse = 'ocr'; }, TypeError);
  }
  assert.equal(getMaterialCapability('table.csv').parse, 'metric_csv');
  assert.equal(getMaterialCapability('table.json').parse, 'metric_json');
  assert.equal(getMaterialCapability('notes.txt').parse, 'text_only');
  const xlsx = getMaterialCapability('table.xlsx');
  assert.equal(xlsx.receive, true);
  assert.equal(xlsx.preview, null);
  assert.equal(xlsx.parse, 'table_xlsx');
  assert.match(xlsx.reason, /本机解析已知指标列/);
  const xls = getMaterialCapability('table.xls');
  assert.equal(xls.receive, true);
  assert.equal(xls.preview, null);
  assert.equal(xls.parse, 'none');
  assert.match(xls.reason, /解析未支持|另存为XLSX/);
  for (const name of ['script.svg', 'page.html', 'data.csv.exe', 'csv', null, '__proto__']) {
    assert.equal(getMaterialCapability(name), null);
  }
});

test('material add accepts exactly 10MB and rejects invalid or larger sizes without changes', () => {
  const h = harness();
  const before = h.state;
  for (const size of [0, -1, 0.5, 10_000_001]) {
    assert.throws(() => h.send('MATERIAL_ADD', { file: null }, {
      preparedMaterial: { name: 'limit.csv', mime: 'text/csv', size, sha256: 'boundary', file: null }
    }), { code: 'file_limit' });
    assert.equal(h.state, before);
  }
  const result = h.send('MATERIAL_ADD', { file: null }, {
    preparedMaterial: { name: 'limit.csv', mime: 'text/csv', size: 10_000_000, sha256: 'boundary', file: null }
  });
  assert.equal(result.effects.putBlobs.length, 1);
  assert.equal(h.state.input.materials[0].size, 10_000_000);
  assert.equal(h.state.input.materials[0].userCategory, 'unknown');
});

test('material count and 20MiB total quota reject only the new command', () => {
  const h = harness();
  for (let index = 0; index < 6; index += 1) {
    h.send('MATERIAL_ADD', {}, { preparedMaterial: { name: 'part.csv', mime: 'text/csv', size: 1, sha256: 'part_' + index, file: null } });
  }
  const beforeCount = h.state;
  assert.throws(() => h.send('MATERIAL_ADD', {}, {
    preparedMaterial: { name: 'seventh.csv', mime: 'text/csv', size: 1, sha256: 'seventh', file: null }
  }), { code: 'file_limit' });
  assert.equal(h.state, beforeCount);
  const total = harness();
  for (const [index, size] of [10_000_000, 10_000_000, 971_520].entries()) {
    total.send('MATERIAL_ADD', {}, { preparedMaterial: { name: 'part.csv', mime: 'text/csv', size, sha256: 'total_' + index, file: null } });
  }
  const beforeTotal = total.state;
  assert.throws(() => total.send('MATERIAL_ADD', {}, {
    preparedMaterial: { name: 'extra.csv', mime: 'text/csv', size: 1, sha256: 'extra', file: null }
  }), { code: 'file_limit' });
  assert.equal(total.state, beforeTotal);
});

test('material replacement subtracts old size, preserves same-byte identity and rejects duplicates', () => {
  const h = harness();
  for (const [index, size] of [10_000_000, 10_000_000, 971_520].entries()) {
    h.send('MATERIAL_ADD', { userCategory: 'content' }, { preparedMaterial: { name: 'part.csv', mime: 'text/csv', size, sha256: 'replace_' + index, file: null } });
  }
  const first = h.state.input.materials[0];
  const replacement = { name: 'new.csv', mime: 'text/csv', size: first.size, sha256: 'replacement', file: null };
  const result = h.send('MATERIAL_REPLACE', { materialId: first.id, inputVersion: h.state.round.inputVersion }, { preparedMaterial: replacement });
  const next = h.state.input.materials.find((item) => item.id === first.id);
  assert.equal(next.version, first.version + 1);
  assert.equal(next.userCategory, 'unknown');
  assert.deepEqual(result.effects.putBlobs.map((item) => item.materialId), [first.id]);
  const before = h.state;
  assert.equal(h.send('MATERIAL_REPLACE', { materialId: first.id, inputVersion: before.round.inputVersion, userCategory: 'ads' },
    { preparedMaterial: replacement }).changed, false);
  assert.equal(h.state, before);
  const third = h.state.input.materials.find((item) => item.size === 971_520);
  assert.throws(() => h.send('MATERIAL_REPLACE', { materialId: third.id, inputVersion: before.round.inputVersion }, {
    preparedMaterial: { ...replacement, size: 971_521, sha256: 'over_total' }
  }), { code: 'file_limit' });
  assert.throws(() => h.send('MATERIAL_REPLACE', { materialId: third.id, inputVersion: before.round.inputVersion },
    { preparedMaterial: replacement }), { code: 'duplicate_material' });
  assert.equal(h.state, before);
});

test('user material category changes invalidate downstream context without rewriting facts or Blob identity', () => {
  const h = harness('one_sentence_v1');
  const material = addTextMaterial(h);
  h.send('MATERIAL_RESULT_SET', { materialId: material.id, materialVersion: material.version,
    roundId: h.state.round.id, inputVersion: h.state.round.inputVersion, status: 'parsed', error: null, facts: [parsedFact(material)] });
  analyze(h); selectAndSave(h);
  const before = structuredClone(h.state);
  const originalMaterial = before.input.materials[0];
  const result = h.send('MATERIAL_CATEGORY_SET', { roundId: before.round.id, inputVersion: before.round.inputVersion,
    materialId: material.id, materialVersion: material.version, userCategory: 'transactions' });
  assert.deepEqual(result.effects, { putBlobs: [], deleteBlobs: [], clearSession: false });
  assert.deepEqual(h.state.input.materials[0], { ...originalMaterial, userCategory: 'transactions' });
  assert.deepEqual(h.state.input.facts, before.input.facts);
  assert.deepEqual(h.state.input.constraints, before.input.constraints);
  assert.deepEqual(h.state.input.unknowns, before.input.unknowns);
  assert.equal(h.state.input.confirmedVersion, null);
  assert.equal(h.state.analysis.status, 'stale');
  assert.equal(h.state.selection, null);
  assert.ok(h.state.artifacts.every((artifact) => artifact.status === 'stale'));
  assert.equal(h.state.round.inputVersion, before.round.inputVersion + 1);
  const history = h.state.history.find((item) => item.type === 'material_category_changed');
  assert.equal(history.previousUserCategory, 'unknown');
  assert.equal(history.userCategory, 'transactions');
  assert.equal(history.materialVersion, originalMaterial.version);
  assert.throws(() => h.send('MATERIAL_RESULT_SET', { roundId: before.round.id, inputVersion: before.round.inputVersion,
    materialId: material.id, materialVersion: material.version, status: 'parsed', facts: [], error: null }), { code: 'stale_input' });
  const unchanged = h.state;
  assert.equal(h.send('MATERIAL_CATEGORY_SET', { roundId: unchanged.round.id, inputVersion: unchanged.round.inputVersion,
    materialId: material.id, materialVersion: material.version, userCategory: 'transactions' }).changed, false);
  assert.equal(h.state, unchanged);
});

test('category edits reject stale scope and unrecognized labels without saving', () => {
  const h = harness();
  const material = addTextMaterial(h);
  const before = h.state;
  const payload = { roundId: before.round.id, inputVersion: before.round.inputVersion,
    materialId: material.id, materialVersion: material.version, userCategory: 'product' };
  for (const patch of [{ roundId: undefined }, { roundId: 'old_round' }, { inputVersion: payload.inputVersion - 1 },
    { materialId: 'missing' }, { materialVersion: payload.materialVersion + 1 }]) {
    assert.throws(() => h.send('MATERIAL_CATEGORY_SET', { ...payload, ...patch }), { code: 'stale_input' });
    assert.equal(h.state, before);
  }
  for (const userCategory of [null, '', 'verified', { name: 'content' }]) {
    assert.throws(() => h.send('MATERIAL_CATEGORY_SET', { ...payload, userCategory }), { code: 'invalid_payload' });
    assert.equal(h.state, before);
  }
});

test('old material records without a user category remain readable and unchanged until an actual edit', () => {
  const h = harness();
  const material = addTextMaterial(h);
  const legacy = structuredClone(h.state);
  delete legacy.input.materials[0].userCategory;
  const snapshot = structuredClone(legacy);
  assert.deepEqual(normalizeSessionState(legacy), snapshot);
  let id = 0;
  const context = { newId: () => 'legacy_category_' + (++id), now: '2026-08-28T10:00:00.000Z' };
  const payload = { roundId: legacy.round.id, inputVersion: legacy.round.inputVersion,
    materialId: material.id, materialVersion: material.version, userCategory: 'unknown' };
  const unchanged = reduceCommand(legacy, { type: 'MATERIAL_CATEGORY_SET', payload }, context);
  assert.equal(unchanged.changed, false);
  assert.equal(unchanged.state, legacy);
  const edited = reduceCommand(legacy, { type: 'MATERIAL_CATEGORY_SET', payload: { ...payload, userCategory: 'ads' } }, context);
  assert.equal(edited.state.input.materials[0].userCategory, 'ads');
  assert.equal(edited.state.history.at(-1).previousUserCategory, 'unknown');
  assert.deepEqual(legacy, snapshot);
});

test('add and replace never accept a forged verification label as a material category', () => {
  const h = harness();
  const material = addTextMaterial(h);
  const before = h.state;
  for (const type of ['MATERIAL_ADD', 'MATERIAL_REPLACE']) {
    assert.throws(() => h.send(type, { materialId: material.id, inputVersion: before.round.inputVersion, userCategory: 'checked' },
      { preparedMaterial: { name: 'sample.csv', mime: 'text/csv', size: 8, sha256: 'new_file', file: null } }),
    { code: 'invalid_payload' });
    assert.equal(h.state, before);
  }
});

test('material deletion drops current extracted facts and refuses late parsing', () => {
  const h = harness('one_sentence_v1');
  h.send('MATERIAL_ADD', { file: null }, { preparedMaterial: { name: 'sample.txt', mime: 'text/plain', size: 5, sha256: 'hash', file: null } });
  const material = h.state.input.materials[0];
  const inputVersion = h.state.round.inputVersion;
  h.send('MATERIAL_REMOVE', { materialId: material.id });
  assert.throws(() => h.send('MATERIAL_RESULT_SET', { materialId: material.id, materialVersion: material.version, roundId: h.state.round.id, inputVersion, status: 'parsed', facts: [], error: null }), { code: 'stale_input' });
});
test('done and worse with unknown execution time survive save and a new round', () => {
  const h = harness('underbed_complete_v1');
  analyze(h); selectAndSave(h);
  const artifact = h.state.artifacts[0];
  const refs = { id: null, roundId: artifact.roundId, analysisId: artifact.analysisId, pathId: artifact.pathId, inputVersion: artifact.inputVersion, artifactId: artifact.id, artifactVersion: artifact.version };
  h.send('FEEDBACK_SAVE', {
    executionRecord: { ...refs, adoption: 'intended', execution: 'done', scope: '全部', executedAt: null },
    feedbackRecord: { ...refs, observation: 'worse', rawText: '全部做了，但观察到变差；时间未填。', metrics: [], observedWindow: { start: null, end: null } }
  });
  const execution = structuredClone(h.state.executionRecords[0]);
  assert.equal(execution.execution, 'done');
  assert.equal(execution.executedAt, null);
  assert.equal(h.state.feedbackRecords[0].observation, 'worse');
  assert.equal(h.state.fixtureId, null);
  h.send('ROUND_START', { feedbackId: h.state.feedbackRecords[0].id });
  assert.equal(h.state.round.index, 2);
  assert.equal(h.state.round.clarification.status, 'unused');
  assert.deepEqual(h.state.executionRecords[0], execution);
  assert.equal(h.state.input.constraints.some((constraint) => constraint.scope === 'round'), false);
});
test('page events cannot forge execution and broken business trees are rejected', () => {
  const h = harness('underbed_complete_v1');
  assert.throws(() => h.send('EVENT_APPEND', { event: { type: 'execution_reported', refs: {} } }), { code: 'invalid_transition' });
  h.send('FOCUS_CONFIRM', { inputVersion: h.state.round.inputVersion });
  const analysis = buildDemoAnalysis(h.state).analysis;
  analysis.paths[0].tree.edges[0].to = 'missing_node';
  assert.throws(() => h.send('ANALYSIS_SET', { analysis }), { code: 'invalid_structure' });
});

function addTextMaterial(h, hash = 'first') {
  h.send('MATERIAL_ADD', { file: null }, { preparedMaterial: { name: 'sample.csv', mime: 'text/csv', size: 8, sha256: hash, file: null } });
  return h.state.input.materials.at(-1);
}
function parsedFact(material, key = 'price') {
  return {
    id: 'draft_fact', key, value: 69.9, availability: 'known', unit: 'CNY', subject: '合成测试对象',
    window: { start: null, end: null }, channel: null, cohort: null, verification: 'unreviewed',
    source: { kind: 'file_extract', materialId: material.id, materialVersion: material.version, locator: { type: 'csv', recordIndex: 2, lineStart: 2, lineEnd: 2, column: 'value' }, note: '合成测试文件原值' }
  };
}
test('fresh reparse and organization preserve the corrected fact without duplicate original values', () => {
  const h = harness('one_sentence_v1');
  const material = addTextMaterial(h);
  const original = parsedFact(material);
  const reparse = () => h.send('MATERIAL_RESULT_SET', { materialId: material.id, materialVersion: material.version, roundId: h.state.round.id, inputVersion: h.state.round.inputVersion, status: 'parsed', error: null, facts: [original] });
  reparse();
  const correction = { ...structuredClone(h.state.input.facts[0]), value: 59.9 };
  h.send('FACT_PATCH', { fact: correction, reason: '用户更正' });
  reparse();
  assert.equal(h.state.input.facts.length, 1);
  assert.equal(h.state.input.facts[0].value, 59.9);
  assert.equal(h.state.input.facts[0].id, correction.id);
  h.send('ORGANIZATION_SET', { roundId: h.state.round.id, inputVersion: h.state.round.inputVersion, focus: '核对价格', facts: [original], constraints: [], unknowns: [] });
  assert.equal(h.state.input.facts.length, 1);
  assert.equal(h.state.input.facts[0].value, 59.9);
});
test('replacing a material also removes dependent constraints and obsolete unknown references', () => {
  const h = harness('one_sentence_v1');
  const material = addTextMaterial(h);
  const fact = parsedFact(material);
  h.send('ORGANIZATION_SET', {
    roundId: h.state.round.id, inputVersion: h.state.round.inputVersion, focus: '核对限制', facts: [fact],
    constraints: [{ id: 'draft_constraint', description: '这项已知限制依赖原文件', value: 20, unit: '分钟', scope: 'round', sourceFactIds: [fact.id] }],
    unknowns: [{ id: 'draft_unknown', description: '需要核对原材料', reason: 'unparsed', sourceId: 'material:' + material.id }]
  });
  h.send('MATERIAL_REPLACE', { materialId: material.id, inputVersion: h.state.round.inputVersion, file: null }, { preparedMaterial: { name: 'new.csv', mime: 'text/csv', size: 8, sha256: 'second', file: null } });
  assert.deepEqual(h.state.input.facts, []);
  assert.deepEqual(h.state.input.constraints, []);
  assert.deepEqual(h.state.input.unknowns, []);
  assert.equal(h.state.input.materials[0].version, 2);
});
test('known answer changed to unknown removes derived facts and dependent constraints', () => {
  const h = harness('one_sentence_v1');
  h.send('QUESTION_SET', { questionId: null, status: 'asked', questionText: '可用时间？', sourceFactIds: [] });
  const questionId = h.state.round.clarification.questionId;
  h.send('QUESTION_SET', { questionId, status: 'answered', answer: { availability: 'known', rawText: '20分钟' } });
  const source = { kind: 'merchant_statement', materialId: null, materialVersion: null, locator: { type: 'question', questionId }, note: '本次补问原话' };
  const fact = { id: 'draft_time', key: 'time', value: 20, availability: 'known', unit: '分钟', source };
  const derived = { id: 'draft_derived', key: 'time_seconds', value: 1200, availability: 'known', unit: '秒', source: { kind: 'derived', materialId: null, materialVersion: null, locator: null, note: '20×60', sourceFactIds: [fact.id] } };
  h.send('ORGANIZATION_SET', { roundId: h.state.round.id, inputVersion: h.state.round.inputVersion, focus: '本轮限制', facts: [fact, derived], constraints: [{ id: 'draft_constraint', description: '本轮时间', value: 20, unit: '分钟', scope: 'round', sourceFactIds: [fact.id] }], unknowns: [] });
  h.send('QUESTION_SET', { questionId, status: 'answered', answer: { availability: 'unknown', rawText: null } });
  assert.deepEqual(h.state.input.facts, []);
  assert.deepEqual(h.state.input.constraints, []);
  assert.equal(h.state.input.unknowns[0].reason, 'unknown');
});
test('a correction to a removed fact cannot resurrect old input', () => {
  const h = harness('one_sentence_v1');
  const material = addTextMaterial(h);
  const fact = parsedFact(material);
  h.send('MATERIAL_RESULT_SET', { materialId: material.id, materialVersion: material.version, roundId: h.state.round.id, inputVersion: h.state.round.inputVersion, status: 'parsed', error: null, facts: [fact] });
  const previous = structuredClone(h.state.input.facts[0]);
  h.send('MATERIAL_REMOVE', { materialId: material.id });
  assert.throws(() => h.send('FACT_PATCH', { fact: { ...previous, value: 59.9 }, reason: '旧编辑' }), { code: 'stale_input' });
  assert.throws(() => h.send('FACT_PATCH', { fact: { ...previous, id: '', value: 59.9 } }), { code: 'stale_input' });
  assert.throws(() => h.send('FACT_PATCH', {}), { code: 'invalid_structure' });
  assert.deepEqual(h.state.input.facts, []);
});
test('a refusing discard guard prevents navigation and fixture/reset replacement', async () => {
  const remove = registerGuard({ isDirty: () => true, onSave: () => false, onDiscard: () => false });
  try {
    let count = 0;
    const notices = [];
    const allowed = await resolveDrafts({ confirm: () => ++count !== 1, notify: (message) => notices.push(message) });
    assert.equal(allowed, false);
    assert.equal(count, 2);
    assert.equal(notices.length, 1);
  } finally { remove(); }
});

test('real sample bytes flow through intake parsing and shared confirmation without a DOM', async () => {
  for (const name of ['metrics.csv', 'metrics.json', 'notes.txt']) {
    const bytes = await readFile(new URL('../samples/' + name, import.meta.url));
    const h = harness();
    h.send('MATERIAL_ADD', { file: null }, { preparedMaterial: { name, mime: 'text/plain', size: bytes.length, sha256: name, file: null } });
    const material = h.state.input.materials[0];
    const parsed = await readSupportedMaterial(new Blob([bytes]), material);
    assert.notEqual(parsed.status, 'failed');
    h.send('MATERIAL_RESULT_SET', { ...parsed, materialId: material.id, materialVersion: material.version, roundId: h.state.round.id, inputVersion: h.state.round.inputVersion });
    h.send('ORGANIZATION_SET', buildOrganization(h.state, '核对当前合成材料'));
    h.send('FOCUS_CONFIRM', { inputVersion: h.state.round.inputVersion });
    assert.equal(h.state.input.confirmedVersion, h.state.round.inputVersion);
    assert.equal(h.state.analysis, null);
    if (name !== 'notes.txt') assert.equal(h.state.input.facts.find((fact) => fact.key === 'paid_orders').value, 0);
    else assert.deepEqual(h.state.input.facts, []);
    assert(h.state.input.unknowns.length > 0);
  }
});

test('intake parser preserves missing values and physical locations and rejects unsupported JSON', async () => {
  const material = { id: 'sample', version: 1, name: 'metrics.csv' };
  const csv = '\uFEFFmetric,value,unit,subject\r\npaid_orders,0,单,"合成,对象\r\n第二行"\r\nfreight,,元,合成对象';
  const parsed = parseMetricText(csv, material);
  assert.equal(parsed.facts[0].value, 0);
  assert.equal(parsed.facts[0].source.locator.lineStart, 2);
  assert.equal(parsed.facts[0].source.locator.lineEnd, 3);
  assert.equal(parsed.facts[1].value, null);
  assert.equal(parsed.facts[1].availability, 'unknown');
  for (const input of [{ schema: 'demo.metrics.v1', metrics: [], command: 'run' }, { schema: 'demo.metrics.v1', metrics: [{ metric: 'paid_orders', value: '0' }] }]) {
    const result = parseMetricText(JSON.stringify(input), { ...material, name: 'metrics.json' });
    assert.equal(result.status, 'needs_review');
    assert.deepEqual(result.facts, []);
  }
  assert.equal((await readSupportedMaterial(new Blob([new Uint8Array([0xff])]), material)).status, 'failed');
});

test('screenshots and Excel originals are received for review without fabricating parsed facts', async () => {
  const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  // A PK-prefixed but corrupt container must fail honestly; a well-formed XLSX
  // with no recognizable columns stays needs_review (covered in table-parse tests).
  const xlsxBytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00]);
  const xlsBytes = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
  for (const [name, bytes, mime, expected] of [
    ['后台截图.png', pngBytes, 'image/png', 'needs_review'],
    ['数据表.xlsx', xlsxBytes, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'failed'],
    ['老报表.xls', xlsBytes, 'application/vnd.ms-excel', 'needs_review']
  ]) {
    const h = harness();
    h.send('MATERIAL_ADD', { file: null }, { preparedMaterial: { name, mime, size: bytes.length, sha256: name, file: null } });
    const material = h.state.input.materials[0];
    const parsed = await readSupportedMaterial(new Blob([bytes]), material);
    assert.equal(parsed.status, expected);
    assert.deepEqual(parsed.facts, []);
    h.send('MATERIAL_RESULT_SET', { ...parsed, materialId: material.id, materialVersion: material.version, roundId: h.state.round.id, inputVersion: h.state.round.inputVersion });
    h.send('ORGANIZATION_SET', buildOrganization(h.state, '核对原件'));
    assert(h.state.input.unknowns.some((entry) => entry.sourceId === 'material:' + material.id));
    assert.equal(h.state.input.facts.length, 0);
  }
});

test('intake organization preserves externally owned uncertainties and nonapplicable facts', () => {
  const h = harness('one_sentence_v1');
  const state = structuredClone(h.state);
  state.input.unknowns.push({ id: 'external', description: '外部已登记的业务不确定性', reason: 'unknown', sourceId: 'input:focus' });
  state.input.facts.push({ id: 'not_applicable', key: 'freight', value: null, availability: 'not_applicable', source: { kind: 'merchant_statement', materialId: null, locator: null } });
  const result = buildOrganization(state, '核对当前问题');
  assert(result.unknowns.some((entry) => entry.id === 'external' && entry.reason === 'unknown'));
  assert.equal(result.unknowns.some((entry) => entry.sourceId === 'fact:not_applicable'), false);
});

test('submit-key parameters protect composition and Shift+Enter without claiming real IME coverage', () => {
  const enter = { key: 'Enter', shiftKey: false, isComposing: false, keyCode: 13 };
  assert.equal(isSubmitKey(enter, false, 0, 1000), true);
  for (const event of [{ ...enter, shiftKey: true }, { ...enter, isComposing: true }, { ...enter, keyCode: 229 }, { ...enter, key: 'a' }]) {
    assert.equal(isSubmitKey(event, false, 0, 1000), false);
  }
  assert.equal(isSubmitKey(enter, true, 0, 1000), false);
  assert.equal(isSubmitKey(enter, false, 950, 1000), false);
  assert.equal(isSubmitKey(enter, false, 900, 1000), false);
});

test('action preview selects one saved artifact and separates content from steps without changing decisions', () => {
  for (const fixtureId of ['underbed_complete_v1', 'one_sentence_v1', 'scope_conflict_v1']) {
    const baseline = harness(fixtureId);
    analyze(baseline);
    for (const index of baseline.state.analysis.paths.keys()) {
      const h = harness(fixtureId);
      analyze(h);
      selectAndSave(h, index);
      const snapshot = structuredClone(h.state);
      const artifacts = currentArtifacts(h.state);
      assert.equal(artifacts.length, 2);
      const second = artifacts[1];
      const selected = selectPreviewArtifact(artifacts, `${second.id}:${second.version}`);
      assert.equal(selected.id, second.id);
      assert.equal(artifactPreviewText(selected, 'content'), second.body);
      assert.equal(artifactPreviewText(selected, 'steps'), second.usage.steps.map((step, i) => `${i + 1}. ${step}`).join('\n'));
      assert.equal(selectPreviewArtifact(artifacts, 'stale-preview-key').id, artifacts[0].id);
      assert.throws(() => artifactPreviewText(selected, 'unsupported'));
      assert.deepEqual(h.state, snapshot);
    }
  }
});

test('TXT export requires consent on every call and contains both saved artifacts with BOM and CRLF', () => {
  const h = harness('underbed_complete_v1');
  analyze(h);
  selectAndSave(h);
  const snapshot = structuredClone(h.state);
  const options = { exportId: 'export_pack', generatedAt: '2026-08-28T10:00:00.000Z' };
  assert.throws(() => buildActionPack(h.state, options), /确认/);
  const pack = buildActionPack(h.state, { ...options, allowSummaries: true });
  assert.deepEqual([...new TextEncoder().encode(pack.text).slice(0, 3)], [0xef, 0xbb, 0xbf]);
  assert.equal(/(?<!\r)\n|\r(?!\n)/.test(pack.text), false);
  for (const artifact of currentArtifacts(h.state)) {
    assert(pack.text.includes(`artifactId: ${artifact.id}\r\n`));
    assert(pack.text.includes(artifact.body.replace(/\r\n?/g, '\n').replace(/\n/g, '\r\n')));
  }
  assert.equal(pack.metadata.pathId, h.state.selection.pathId);
  assert.throws(() => buildActionPack(h.state, options), /确认/);
  assert.deepEqual(h.state, snapshot);

  for (const [locator, expected] of [
    [{ type: 'text', start: 0, end: 8 }, '文本位置 0—8'],
    [{ type: 'txt', lineStart: 1, lineEnd: 2 }, '文本第 1—2 行'],
    [{ type: 'csv', recordIndex: 2, column: 'value' }, 'CSV 第 2 条记录，value 列'],
  ]) {
    const source = describeActionSource({ key: 'paid_orders', value: 0, availability: 'known',
      evidenceStatus: 'confirmed_fact', source: { kind: 'file_extract', locator } });
    assert.equal(source.location, expected);
    assert.match(source.summary, /0/);
    assert.match(source.provenance, /未外部核验/);
    assert.doesNotMatch(source.location, /undefined/);
  }
  const annotated = structuredClone(h.state);
  const citedId = currentArtifacts(annotated)[0].sourceFactIds[0];
  assert(citedId);
  const cited = annotated.analysis.inputSnapshot.facts.find((fact) => fact.id === citedId);
  Object.assign(cited, { value: 'SOURCE_SUMMARY_ONLY', availability: 'known', intakeField: 'productName',
    evidenceStatus: 'owner_hypothesis', verification: 'conflicting',
    source: { kind: 'merchant_statement', locator: { type: 'intake', field: 'productName', source: 'voice', quote: 'RAW_QUOTE_NOT_EXPORTED' } } });
  annotated.input.facts.find((fact) => fact.id === citedId).value = 'CURRENT_VALUE_NOT_SNAPSHOT';
  const citedPack = buildActionPack(annotated, { ...options, allowSummaries: true });
  assert.match(citedPack.text, /引用资料摘要：/);
  assert.match(citedPack.text, /语音转写 · 具体商品/);
  assert.match(citedPack.text, /商家判断，待验证；存在冲突，待核对/);
  assert.match(citedPack.text, /SOURCE_SUMMARY_ONLY/);
  assert.doesNotMatch(citedPack.text, /RAW_QUOTE_NOT_EXPORTED|CURRENT_VALUE_NOT_SNAPSHOT/);
});

test('input invalidation makes prior action previews and TXT unavailable', () => {
  const h = harness('underbed_complete_v1');
  analyze(h);
  selectAndSave(h);
  h.send('INPUT_EDIT', { description: '本轮事实已改动，旧行动必须重新核对。' });
  assert.equal(activeSelection(h.state), null);
  assert.deepEqual(currentArtifacts(h.state), []);
  assert.throws(() => buildActionPack(h.state, { exportId: 'old_export', generatedAt: '2026-08-28T10:00:00.000Z', allowSummaries: true }), /没有当前有效/);
});

test('page feedback payload preserves done, worse and an unknown execution date through shared save', () => {
  const h = harness('underbed_complete_v1');
  analyze(h);
  selectAndSave(h);
  const artifact = currentArtifacts(h.state)[0];
  const payload = makeFeedbackPayload(artifact, { execution: 'done', observation: 'worse', executedAt: '', rawText: '合成测试：执行后感觉变差。', scope: '' });
  h.send('FEEDBACK_SAVE', payload);
  assert.equal(h.state.executionRecords[0].execution, 'done');
  assert.equal(h.state.executionRecords[0].adoption, 'unknown');
  assert.equal(h.state.executionRecords[0].executedAt, null);
  assert.equal(h.state.feedbackRecords[0].observation, 'worse');
  assert.equal(h.state.feedbackRecords[0].artifactId, artifact.id);
  assert.equal(h.state.feedbackRecords[0].executionRecordId, h.state.executionRecords[0].id);
});

test('a report for another viewed path does not replace the saved choice or record execution', () => {
  const h = harness('underbed_complete_v1');
  analyze(h);
  selectAndSave(h);
  const snapshot = structuredClone(h.state);
  const otherPath = h.state.analysis.paths[1];
  const report = buildPathReport(h.state, otherPath.id, { exportId: 'report_other_path', generatedAt: '2026-08-28T10:00:00.000Z', allowSummaries: true });
  assert.equal(report.ok, true, report.message);
  assert.equal(report.metadata.pathId, otherPath.id);
  assert.notEqual(report.metadata.pathId, h.state.selection.pathId);
  assert.deepEqual(h.state, snapshot);
});

test('fold title plans keep the Chinese and English reference headings within the entry budget', () => {
  for (const [text, count, totalMs] of [
    ['最近做抖音，哪件事最让你头疼？', 15, 680],
    ['Launch with clarity', 19, 760],
  ]) {
    const plan = getFoldTitlePlan(text);
    assert.equal(plan.ok, true, plan.reason);
    assert.equal(plan.pieces.length, count);
    assert.equal(plan.totalMs, totalMs);
  }
});

test('fold title pieces preserve graphemes and UTF-16 offsets for punctuation and numeric units', () => {
  const graphemes = ['e\u0301', '👨‍👩‍👧‍👦', '6', '9', '.', '9', '0', '元', '？'];
  const text = graphemes.join('');
  let offset = 0;
  const expected = graphemes.map((piece) => {
    const start = offset;
    offset += piece.length;
    return { text: piece, start, end: offset };
  });
  const plan = getFoldTitlePlan(text);
  assert.equal(plan.ok, true, plan.reason);
  assert.deepEqual(plan.pieces, expected);
  assert.equal(plan.pieces.map((piece) => text.slice(piece.start, piece.end)).join(''), text);
});

test('fold title planning falls back to static text for missing APIs, failures, line breaks and excess duration', () => {
  const boundary = getFoldTitlePlan('字'.repeat(21));
  assert.equal(boundary.ok, true, boundary.reason);
  assert.equal(boundary.totalMs, 800);
  class BrokenSegmenter {
    segment() { throw new Error('synthetic segmentation failure'); }
  }
  for (const [text, Segmenter] of [
    ['', Intl.Segmenter],
    ['标题\n副标题', Intl.Segmenter],
    ['标题\r\n副标题', Intl.Segmenter],
    ['字'.repeat(22), Intl.Segmenter],
    ['标题', null],
    ['标题', BrokenSegmenter],
  ]) {
    const plan = getFoldTitlePlan(text, Segmenter);
    assert.equal(plan.ok, false);
    assert.deepEqual(plan.pieces, []);
    assert.match(plan.reason, /\S/u);
  }
});

test('fold title enhancement is safe without a DOM and destroy is idempotent', () => {
  for (const heading of [undefined, null, {}]) {
    const controller = enhanceFoldTitle(heading);
    assert.equal(controller.status, 'skipped');
    assert.match(controller.reason, /\S/u);
    assert.doesNotThrow(() => controller.destroy());
    const afterDestroy = controller.status;
    assert.doesNotThrow(() => controller.destroy());
    assert.equal(controller.status, afterDestroy);
  }
});


function saveIntake(h, draft, description = '供确认的编辑文字', sourceBindings = []) {
  return h.send('INTAKE_SET', { roundId: h.state.round.id, inputVersion: h.state.round.inputVersion,
    draft, description, sourceBindings });
}

test('intake strict schema preserves null, zero, text price and hypothesis without coercing other fields', () => {
  const draft = createMerchantIntakeDraft({ sources: ['voice'], transcript: '原始口述', productName: '合成杯子',
    price: '19元', targetCustomerHypothesis: '学生可能会买', metrics: { productClicks: 0 } });
  assert.equal(validateMerchantIntakeDraft(draft).ok, true);
  assert.equal(draft.metrics.productClicks, 0);
  assert.equal(draft.metrics.paidOrders, null);
  assert.equal(validateMerchantIntakeDraft({ ...draft, price: 19 }).ok, false);
  assert.equal(validateMerchantIntakeDraft({ ...draft, unexpected: true }).ok, false);
  assert.equal(validateMerchantIntakeDraft({ ...draft, metrics: { ...draft.metrics, paidOrders: NaN } }).ok, false);
  assert.equal(validateMerchantIntakeDraft({ ...draft, sources: {} }).ok, false);
  assert.equal(mapConfirmedIntakeToAnalysisInput(draft, null).ok, false);
  const mapped = mapConfirmedIntakeToAnalysisInput(draft, { state: harness().state });
  assert.equal(mapped.ok, true);
  assert.equal(mapped.projection.facts.find((fact) => fact.key === 'price').value, '19元');
  assert.equal(mapped.projection.facts.some((fact) => fact.key === 'product_detail_visitors'), false);
  const hypothesis = mapped.projection.facts.find((fact) => fact.intakeField === 'targetCustomerHypothesis');
  assert.equal(hypothesis.evidenceStatus, 'owner_hypothesis');
  assert.equal(hypothesis.verification, 'unreviewed');
});

test('INTAKE_SET saves original transcript and edited text together without erasing external input', () => {
  const h = harness('underbed_complete_v1');
  const externalIds = h.state.input.facts.map((fact) => fact.id);
  const externalUnknown = structuredClone(h.state.input.unknowns);
  const version = h.state.round.inputVersion;
  const draft = createMerchantIntakeDraft({ sources: ['voice'], transcript: '保留这段未经编辑的原始识别',
    productName: '合成杯子', price: '19元', currentProblem: '先核对商品信息' });
  saveIntake(h, draft, '用户编辑后的一句话');
  assert.equal(h.state.round.inputVersion, version + 1);
  assert.equal(h.state.input.intake.inputVersion, version + 1);
  assert.equal(h.state.input.intake.draft.transcript, draft.transcript);
  assert.equal(h.state.input.description, '用户编辑后的一句话');
  assert.equal(h.state.fixtureId, null);
  assert(externalIds.every((id) => h.state.input.facts.some((fact) => fact.id === id)));
  assert(externalUnknown.every((entry) => h.state.input.unknowns.some((item) => item.id === entry.id)));
  assert(h.state.input.facts.every((fact) => !fact.id.startsWith('draft_')));
  const before = structuredClone(h.state);
  saveIntake(h, draft, '用户编辑后的一句话');
  assert.deepEqual(h.state, before);
});

test('intake changes invalidate downstream once and reject old snapshots without losing raw history', () => {
  const h = harness('one_sentence_v1');
  const draft = createMerchantIntakeDraft({ sources: ['manual'], transcript: '', productName: '合成商品', currentProblem: '原来的问题' });
  saveIntake(h, draft); analyze(h); selectAndSave(h);
  const version = h.state.round.inputVersion;
  const next = { ...draft, currentProblem: '新确认的问题' };
  saveIntake(h, next);
  assert.equal(h.state.round.inputVersion, version + 1);
  assert.equal(h.state.input.confirmedVersion, null);
  assert.equal(h.state.selection, null);
  assert.equal(h.state.analysis.status, 'stale');
  assert(h.state.artifacts.every((artifact) => artifact.status === 'stale'));
  assert(h.state.history.some((entry) => entry.type === 'intake_revision' && entry.intake.draft.currentProblem === '原来的问题'));
  const before = structuredClone(h.state);
  assert.throws(() => h.send('INTAKE_SET', { roundId: h.state.round.id, inputVersion: version,
    draft, description: '旧异步结果', sourceBindings: [] }), { code: 'stale_input' });
  assert.deepEqual(h.state, before);
  h.send('INPUT_EDIT', { description: '另行修改文字但尚未核对九组' });
  assert.equal(h.state.input.intake.status, 'stale');
  assert.throws(() => h.send('FOCUS_CONFIRM', { inputVersion: h.state.round.inputVersion }), { code: 'stale_input' });
});

test('explicit intake corrections can follow an earlier correction, including null, while ordinary reparse cannot', () => {
  const h = harness('one_sentence_v1');
  let draft = createMerchantIntakeDraft({ sources: ['manual'], transcript: '', productName: '合成商品', price: '10元', currentProblem: '问题A' });
  saveIntake(h, draft);
  const priceId = h.state.input.facts.find((fact) => fact.intakeField === 'price').id;
  const change = (field, after) => {
    draft = { ...draft, [field]: after,
      userCorrections: [...draft.userCorrections, { field, before: draft[field], after }] };
    saveIntake(h, draft);
  };
  change('price', '20元'); change('price', '30元');
  assert.equal(h.state.input.facts.find((fact) => fact.id === priceId).value, '30元');
  assert.equal(h.state.input.facts.filter((fact) => fact.id === priceId).length, 1);
  change('currentProblem', '问题B'); change('currentProblem', '问题C');
  assert.equal(h.state.input.focus, '问题C');
  change('price', null);
  const price = h.state.input.facts.find((fact) => fact.id === priceId);
  assert.equal(price.value, null);
  assert.equal(price.availability, 'unknown');
  assert.equal(price.verification, 'user_corrected');
  const oldParse = { ...draft, price: '旧解析99元' };
  assert.throws(() => saveIntake(h, oldParse), { code: 'correction_conflict' });
  const facts = structuredClone(h.state.input.facts);
  facts.find((fact) => fact.id === priceId).value = '旧解析99元';
  facts.find((fact) => fact.id === priceId).availability = 'known';
  h.send('ORGANIZATION_SET', { roundId: h.state.round.id, inputVersion: h.state.round.inputVersion,
    focus: h.state.input.focus, facts, constraints: h.state.input.constraints, unknowns: h.state.input.unknowns });
  assert.equal(h.state.input.facts.find((fact) => fact.id === priceId).value, null);
  assert.deepEqual(h.state.input.intake.draft.userCorrections, draft.userCorrections);
  for (const withPrefix of [false, true]) {
    const recovery = harness();
    const original = createMerchantIntakeDraft({ sources: ['manual'], productName: 'A',
      userCorrections: withPrefix ? [{ field: 'productName', before: '原值', after: 'A' }] : [] });
    saveIntake(recovery, original);
    const savedFact = recovery.state.input.facts.find((fact) => fact.intakeField === 'productName');
    recovery.send('FACT_PATCH', { roundId: recovery.state.round.id, inputVersion: recovery.state.round.inputVersion,
      fact: { ...savedFact, value: 'B' }, reason: '合成外部明确更正' });
    assert.equal(recovery.state.input.intake.status, 'stale');
    assert.equal(recovery.state.input.intake.draft.productName, 'A');
    const before = structuredClone(recovery.state);
    const corrected = (value) => ({ ...original, productName: 'C', userCorrections: [...original.userCorrections,
      { field: 'productName', before: value, after: 'C' }] });
    assert.throws(() => saveIntake(recovery, corrected('A')), { code: 'invalid_intake' });
    assert.deepEqual(recovery.state, before);
    const baseline = recovery.state.input.facts.find((fact) => fact.id === savedFact.id);
    assert.equal(getIntakeCorrectionConflicts(original, recovery.state.input.facts)[0].currentValue, 'B');
    const legacyEdit = editIntakeField(original, [], 'productName', 'C', baseline);
    assert.deepEqual(legacyEdit.draft.userCorrections, corrected('B').userCorrections);
    saveIntake(recovery, legacyEdit.draft);
    assert.equal(recovery.state.input.facts.find((fact) => fact.id === savedFact.id).value, 'C');
    assert.equal(recovery.state.round.inputVersion, before.round.inputVersion + 1);
    assert.deepEqual(recovery.state.input.intake.draft.userCorrections.slice(0, original.userCorrections.length), original.userCorrections);
    assert(recovery.state.history.some((entry) => entry.type === 'fact_correction' && entry.after.value === 'B'));
  }
});

test('file intake reuses an existing parsed source and a replaced material cannot accept an old binding', () => {
  const h = harness('one_sentence_v1');
  h.send('MATERIAL_ADD', {}, { preparedMaterial: { name: 'record.json', mime: 'application/json', size: 20, sha256: 'json_fixture_hash', file: null } });
  const material = h.state.input.materials[0];
  h.send('MATERIAL_RESULT_SET', { materialId: material.id, materialVersion: material.version,
    roundId: h.state.round.id, inputVersion: h.state.round.inputVersion, status: 'parsed', error: null,
    facts: [{ id: null, key: 'paid_orders', value: 0, availability: 'known', unit: '笔', subject: '合成商品',
      source: { kind: 'file_extract', materialId: material.id, materialVersion: material.version, locator: { type: 'json', pointer: '/metrics/0/value' } } }] });
  const originalFact = structuredClone(h.state.input.facts[0]);
  const draft = createMerchantIntakeDraft({ sources: ['json'], metrics: { paidOrders: 0 } });
  const sourceBindings = [{ field: 'metrics.paidOrders', source: 'json', materialId: material.id,
    materialVersion: material.version, locator: { type: 'json', pointer: '/metrics/0/value' } }];
  saveIntake(h, draft, '本轮先核对这份资料', sourceBindings);
  assert.equal(h.state.input.facts.filter((fact) => fact.id === originalFact.id).length, 1);
  assert.deepEqual(h.state.input.facts.find((fact) => fact.id === originalFact.id), originalFact);
  h.send('MATERIAL_REPLACE', { materialId: material.id, inputVersion: h.state.round.inputVersion },
    { preparedMaterial: { name: 'record.json', mime: 'application/json', size: 24, sha256: 'json_replaced_hash', file: null } });
  assert.equal(h.state.input.intake.status, 'stale');
  assert.throws(() => saveIntake(h, draft, '旧材料定位', sourceBindings), { code: 'invalid_intake' });
  h.send('MATERIAL_ADD', {}, { preparedMaterial: { name: 'record.csv', mime: 'text/csv', size: 20, sha256: 'csv_index_fixture', file: null } });
  const csv = h.state.input.materials.at(-1);
  const csvDraft = createMerchantIntakeDraft({ sources: ['csv'], metrics: { paidOrders: 0 } });
  const binding = { field: 'metrics.paidOrders', source: 'csv', materialId: csv.id, materialVersion: csv.version,
    locator: { type: 'csv', recordIndex: 2, lineStart: 2, lineEnd: 2, column: 'value' } };
  assert.equal(mapConfirmedIntakeToAnalysisInput(csvDraft, { state: h.state, sourceBindings: [binding] }).ok, true);
  assert.equal(mapConfirmedIntakeToAnalysisInput(csvDraft, { state: h.state, sourceBindings: [
    { ...binding, locator: { ...binding.locator, recordIndex: 0 } }] }).code, 'invalid_intake');
});

test('P1 recovery and shared saving keep file corrections, provenance and fresh snapshots aligned', () => {
  for (const firstReviewValue of [5, 7, null]) for (const finalValue of [11, null]) {
    const h = harness('one_sentence_v1');
    h.send('MATERIAL_ADD', {}, { preparedMaterial: {
      name: 'correction.json', mime: 'application/json', size: 20, sha256: 'synthetic_correction', file: null } });
    const material = h.state.input.materials[0];
    const locator = { type: 'json', pointer: '/metrics/0/value' };
    h.send('MATERIAL_RESULT_SET', { materialId: material.id, materialVersion: material.version,
      roundId: h.state.round.id, inputVersion: h.state.round.inputVersion, status: 'parsed', error: null,
      facts: [{ id: null, key: 'paid_orders', value: 0, availability: 'known', unit: '笔', subject: '合成商品',
        source: { kind: 'file_extract', materialId: material.id, materialVersion: material.version, locator } }] });
    const original = structuredClone(h.state.input.facts[0]);
    const originalMaterials = structuredClone(h.state.input.materials);
    const draft = createMerchantIntakeDraft({ sources: ['json'], metrics: { paidOrders: 0 } });
    const field = 'metrics.paidOrders';
    const bindings = [{ field, source: 'json', materialId: material.id,
      materialVersion: material.version, locator }];
    saveIntake(h, draft, '核对合成订单数', bindings);
    h.send('FACT_PATCH', { inputVersion: h.state.round.inputVersion, fact: { ...original, value: 5 } });
    assert.equal(h.state.input.intake.status, 'stale');
    assert.throws(() => h.send('FOCUS_CONFIRM', { inputVersion: h.state.round.inputVersion }));
    const before = structuredClone(h.state);
    assert.throws(() => saveIntake(h, draft, '不能恢复旧零值', bindings), { code: 'invalid_intake' });
    assert.deepEqual(h.state, before);
    const currentFive = findIntakeFieldFact(h.state, field, bindings);
    assert.deepEqual(getIntakeCorrectionConflicts(draft, h.state.input.facts, h.state, bindings), [
      { field, factId: original.id, oldValue: 0, currentValue: 5, canRecover: true }
    ]);
    const snapshot = { sessionId: h.state.sessionId, roundId: h.state.round.id,
      inputVersion: h.state.round.inputVersion, factId: currentFive.id, factSnapshot: JSON.stringify(currentFive) };
    assert.equal(isIntakeCorrectionSnapshotCurrent(h.state, snapshot), true);
    assert.equal(isIntakeCorrectionSnapshotCurrent({ ...h.state, revision: h.state.revision + 1 }, snapshot), true);
    for (const patch of [{ sessionId: 'another_session' }, { roundId: 'another_round' },
      { inputVersion: snapshot.inputVersion - 1 }, { factId: 'removed_fact' },
      { factSnapshot: JSON.stringify({ ...currentFive, intakeField: field }) }]) {
      assert.equal(isIntakeCorrectionSnapshotCurrent(h.state, { ...snapshot, ...patch }), false);
    }
    const changedFactState = { ...h.state, input: { ...h.state.input,
      facts: h.state.input.facts.map((fact) => fact.id === currentFive.id ? { ...fact, value: 6 } : fact) } };
    assert.equal(isIntakeCorrectionSnapshotCurrent(changedFactState, snapshot), false);
    assert.throws(() => editIntakeField(draft, bindings, field, '7',
      { ...currentFive, intakeField: field }, h.state));
    let reviewed = editIntakeField(draft, bindings, field,
      firstReviewValue === null ? '' : String(firstReviewValue), currentFive, h.state);
    assert.deepEqual(reviewed.draft.userCorrections, firstReviewValue === 5 ? [] : [
      { field, before: 5, after: firstReviewValue }
    ]);
    saveIntake(h, reviewed.draft, '明确核对当前更正后保存', reviewed.sourceBindings);
    let current = h.state.input.facts.find((fact) => fact.id === original.id);
    assert.equal(current.value, firstReviewValue);
    assert.equal(current.source.kind, 'merchant_statement');
    assert.equal(current.intakeField, undefined);
    assert.deepEqual(getIntakeCorrectionConflicts(reviewed.draft, h.state.input.facts, h.state, []), []);
    h.send('FACT_PATCH', { inputVersion: h.state.round.inputVersion,
      fact: { ...current, value: 9, availability: 'known' } });
    assert.equal(h.state.input.intake.status, 'stale');
    assert.equal(isIntakeCorrectionSnapshotCurrent(h.state, snapshot), false);
    assert.throws(() => editIntakeField(draft, bindings, field, '11', currentFive, h.state));
    current = findIntakeFieldFact(h.state, field);
    assert.deepEqual(getIntakeCorrectionConflicts(reviewed.draft, h.state.input.facts, h.state, []), [
      { field, factId: original.id, oldValue: firstReviewValue, currentValue: 9, canRecover: true }
    ]);
    const prefix = structuredClone(reviewed.draft.userCorrections);
    reviewed = editIntakeField(reviewed.draft, reviewed.sourceBindings, field,
      finalValue === null ? '' : String(finalValue), current, h.state);
    assert.deepEqual(reviewed.draft.userCorrections, [...prefix, { field, before: 9, after: finalValue }]);
    saveIntake(h, reviewed.draft, '以当前更正为起点再核对', reviewed.sourceBindings);
    current = h.state.input.facts.find((fact) => fact.id === original.id);
    assert.equal(current.value, finalValue);
    assert.equal(current.availability, finalValue === null ? 'unknown' : 'known');
    assert.equal(current.intakeField, undefined);
    assert.equal(current.unit, original.unit);
    assert.equal(h.state.input.facts.filter((fact) => fact.key === 'paid_orders').length, 1);
    assert.deepEqual(h.state.input.materials, originalMaterials);
    analyze(h);
    assert.equal(h.state.analysis.inputSnapshot.intake.draft.metrics.paidOrders, finalValue);
    assert.equal(h.state.analysis.inputSnapshot.facts.find((fact) => fact.id === original.id).value, finalValue);
    assert(h.state.history.some((entry) => entry.type === 'fact_correction'
      && entry.before?.source.kind === 'file_extract' && entry.before.value === 0));
  }
});

test('an explicit new file binding is not captured by an older corrected file fact', () => {
  for (const review of [{ recover: false }, ...[109, 110, null].map((value) => ({ recover: true, value }))]) {
    const h = harness('one_sentence_v1');
    function addFile(name, value) {
      h.send('MATERIAL_ADD', {}, { preparedMaterial: { name, mime: 'application/json', size: 20, sha256: name, file: null } });
      const material = h.state.input.materials.at(-1), locator = { type: 'json', pointer: '/metrics/0/value' };
      h.send('MATERIAL_RESULT_SET', { materialId: material.id, materialVersion: material.version,
        roundId: h.state.round.id, inputVersion: h.state.round.inputVersion, status: 'parsed', error: null,
        facts: [{ id: null, key: 'paid_orders', value, availability: 'known',
          source: { kind: 'file_extract', materialId: material.id, materialVersion: material.version, locator } }] });
      return { fact: h.state.input.facts.find((fact) => fact.source.materialId === material.id),
        binding: { field: 'metrics.paidOrders', source: 'json', materialId: material.id, materialVersion: material.version, locator } };
    }
    const a = addFile('source_a.json', 0);
    let draft = createMerchantIntakeDraft({ sources: ['json'], metrics: { paidOrders: 0 } });
    saveIntake(h, draft, '先确认A', [a.binding]);
    draft = { ...draft, sources: ['json', 'manual'], metrics: { ...draft.metrics, paidOrders: 5 },
      evidenceLedger: [{ field: 'metrics.paidOrders', value: 5, status: 'confirmed_fact', source: 'manual' }],
      userCorrections: [{ field: 'metrics.paidOrders', before: 0, after: 5 }] };
    saveIntake(h, draft, '明确更正A', []);
    const aCorrected = structuredClone(h.state.input.facts.find((fact) => fact.id === a.fact.id));
    const b = addFile('source_b.json', 99);
    const field = 'metrics.paidOrders';
    assert.equal(findIntakeFieldFact(h.state, field, [b.binding]).id, b.fact.id);
    assert.equal(findIntakeFieldFact(h.state, field, [{ ...b.binding, materialVersion: 99 }]), null);
    assert.equal(findIntakeFieldFact(h.state, field, [{ ...b.binding,
      locator: { type: 'json', pointer: '/another/value' } }]), null);
    let next = { ...draft, metrics: { ...draft.metrics, paidOrders: 99 },
      evidenceLedger: [{ field, value: 99, status: 'confirmed_fact', source: 'json' }] };
    let nextBindings = [b.binding];
    assert.deepEqual(getIntakeCorrectionConflicts(next, h.state.input.facts, h.state, nextBindings), []);
    assert.throws(() => editIntakeField(next, nextBindings, field, '100', aCorrected, h.state));
    if (review.recover) {
      h.send('FACT_PATCH', { inputVersion: h.state.round.inputVersion, fact: { ...b.fact, value: 109 } });
      const baseline = findIntakeFieldFact(h.state, field, nextBindings);
      assert.equal(findIntakeFieldFact(h.state, field).id, a.fact.id);
      assert.deepEqual(getIntakeCorrectionConflicts(next, h.state.input.facts, h.state, nextBindings), [
        { field, factId: b.fact.id, oldValue: 99, currentValue: 109, canRecover: true }
      ]);
      const recovered = editIntakeField(next, nextBindings, field,
        review.value === null ? '' : String(review.value), baseline, h.state);
      next = recovered.draft; nextBindings = recovered.sourceBindings;
      assert.deepEqual(nextBindings, [b.binding]);
      assert.deepEqual(next.userCorrections.slice(0, draft.userCorrections.length), draft.userCorrections);
      assert.equal(next.evidenceLedger.find((entry) => entry.field === field).source, 'manual');
    }
    saveIntake(h, next, '明确改为核对B', nextBindings);
    const expected = review.recover ? review.value : 99;
    const currentB = findIntakeFieldFact(h.state, field);
    assert.equal(currentB.id, b.fact.id);
    assert.equal(h.state.input.intake.draft.metrics.paidOrders, expected);
    assert.deepEqual(h.state.input.facts.find((fact) => fact.id === a.fact.id), aCorrected);
    assert.equal(currentB.value, expected);
    assert.equal(currentB.intakeField, undefined);
    assert.equal(currentB.source.kind, review.recover ? 'merchant_statement' : 'file_extract');
    const ambiguousFacts = [
      { ...b.fact, value: 100, verification: 'user_corrected' },
      { ...b.fact, id: 'other_same_source_fact', value: 101, verification: 'user_corrected' }
    ];
    const ambiguous = { ...h.state, input: { ...h.state.input,
      facts: [...h.state.input.facts.filter((fact) => fact.id !== b.fact.id), ...ambiguousFacts] } };
    const conflicts = getIntakeCorrectionConflicts(next, ambiguous.input.facts, ambiguous, [b.binding]);
    assert.equal(conflicts.length, 2);
    assert(conflicts.every((entry) => entry.field === field && !entry.canRecover));
    assert.throws(() => editIntakeField(next, [b.binding], field, '102', ambiguousFacts[0], ambiguous));
  }
});

test('answer saving leaves the confirmed intake intact and analysis preserves a question snapshot', () => {
  const h = harness('one_sentence_v1');
  const draft = createMerchantIntakeDraft({ sources: ['manual'], currentProblem: '先核对当前情况' });
  saveIntake(h, draft);
  const intake = structuredClone(h.state.input.intake);
  h.send('QUESTION_SET', { questionId: null, status: 'asked', questionText: '本轮有什么限制？', sourceFactIds: [] });
  const questionId = h.state.round.clarification.questionId;
  const version = h.state.round.inputVersion;
  h.send('QUESTION_SET', { questionId, status: 'answered', answer: { availability: 'known', rawText: '这是保留原话，不自动解析成数字' } });
  assert.equal(h.state.round.inputVersion, version + 1);
  assert.deepEqual(h.state.input.intake, intake);
  analyze(h);
  assert.equal(h.state.analysis.clarificationSnapshot.questions[0].answer.rawText, '这是保留原话，不自动解析成数字');
  assert.equal(h.state.analysis.inputSnapshot.intake.draft.currentProblem, draft.currentProblem);
});

const unconfiguredResponse = () => ({ ok: true, json: async () => ({ configured: false, baseUrl: null, model: null, hasKey: false }) });
const jsonResponse = (value, ok = true) => ({ ok, status: ok ? 200 : 500, json: async () => value });

function addMaterial(h, name, mime, sha256) {
  h.send('MATERIAL_ADD', {}, { preparedMaterial: { name, mime, size: 20, sha256, file: null } });
  return h.state.input.materials.at(-1);
}
function setFacts(h, facts) {
  h.send('ORGANIZATION_SET', { roundId: h.state.round.id, inputVersion: h.state.round.inputVersion,
    focus: null, facts, constraints: [], unknowns: [] });
}
function fileFact(material, key, value, options = {}) {
  return { id: options.id ?? 'test_fact_' + key + '_' + String(value), key, value, availability: 'known',
    unit: options.unit ?? null, subject: options.subject ?? null,
    window: options.window ?? { start: null, end: null }, channel: null, cohort: null,
    source: { kind: 'file_extract', materialId: material.id, materialVersion: material.version,
      locator: options.locator ?? { type: 'csv', recordIndex: 1, lineStart: 2, lineEnd: 2, column: 'value' }, note: '' },
    verification: 'unreviewed' };
}
const extractionRequest = (h, draft, description = '整理测试') =>
  ({ state: h.state, draft, transcript: draft.transcript, description, sources: draft.sources });

test('local extraction fills metrics from parsed facts with file bindings and never sends content', async () => {
  const h = harness('one_sentence_v1');
  const csv = addMaterial(h, 'data.csv', 'text/csv', 'local_extract_csv');
  const xlsx = addMaterial(h, 'export.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'local_extract_xlsx');
  setFacts(h, [
    fileFact(csv, 'video_views', 1234, { unit: '次', window: { start: '2026-08-01', end: '2026-08-07' } }),
    fileFact(csv, 'paid_orders', 3, { unit: '笔', id: 'test_fact_paid', locator: { type: 'csv', recordIndex: 2, lineStart: 3, lineEnd: 3, column: 'value' } }),
    fileFact(xlsx, 'product_clicks', 56, { unit: '次', locator: { type: 'xlsx', sheet: '作品数据', cell: 'C2' } })
  ]);
  const draft = createMerchantIntakeDraft({ sources: ['csv', 'xlsx'], transcript: '原话' });
  const calls = [];
  const result = await requestIntakeExtraction(extractionRequest(h, draft), {
    fetchImpl: async (url, options) => { calls.push({ url, options }); return unconfiguredResponse(); } });
  assert.equal(result.ok, true);
  assert.equal(result.mode, 'local');
  assert.equal(result.sentToExternal, false);
  assert.equal(result.draft.metrics.videoViews, 1234);
  assert.equal(result.draft.metrics.paidOrders, 3);
  assert.equal(result.draft.metrics.productClicks, 56);
  assert.equal(result.draft.metrics.windowStart, '2026-08-01');
  assert.equal(result.draft.metrics.windowEnd, '2026-08-07');
  const clickBinding = result.sourceBindings.find((binding) => binding.field === 'metrics.productClicks');
  assert.equal(clickBinding.source, 'xlsx');
  assert.equal(clickBinding.materialId, xlsx.id);
  assert(!calls.some((call) => call.url === '/api/ai/chat'));
});

test('local extraction keeps conflicting values empty and reports them instead of guessing', async () => {
  const h = harness('one_sentence_v1');
  const csv = addMaterial(h, 'conflict.csv', 'text/csv', 'local_extract_conflict');
  setFacts(h, [
    fileFact(csv, 'video_views', 100, { unit: '次', id: 'test_fact_a' }),
    fileFact(csv, 'video_views', 200, { unit: '次', id: 'test_fact_b', locator: { type: 'csv', recordIndex: 2, lineStart: 3, lineEnd: 3, column: 'value' } })
  ]);
  const draft = createMerchantIntakeDraft({ sources: ['csv'], transcript: '原话' });
  const result = await requestIntakeExtraction(extractionRequest(h, draft), { fetchImpl: async () => unconfiguredResponse() });
  assert.equal(result.ok, true);
  assert.equal(result.mode, 'local');
  assert.equal(result.draft.metrics.videoViews, null);
  assert(result.notes.some((note) => note.includes('多个不同取值')));
});

test('configured API reads the structured P1 data, fills verified quotes, and reports the external send', async () => {
  const h = harness('one_sentence_v1');
  const draft = createMerchantIntakeDraft({ sources: ['manual'], transcript: '我家卖便携榨汁杯，最近视频有播放但不出单。',
    metrics: { productClicks: 1450, paidOrders: 42 }, confirmedProductFacts: ['容量为350ml'] });
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    if (url === '/api/ai/settings') return jsonResponse({ configured: true, baseUrl: 'https://api.example.com', model: 'test-model', hasKey: true });
    return jsonResponse({ ok: true, content: JSON.stringify({ fields: {
      productName: { value: '便携榨汁杯', quote: '便携榨汁杯' },
      currentProblem: { value: '编造的问题', quote: '这段引文在原文中不存在' } } }) });
  };
  const result = await requestIntakeExtraction(extractionRequest(h, draft), { fetchImpl });
  assert.equal(result.ok, true);
  assert.equal(result.mode, 'api');
  assert.equal(result.sentToExternal, true);
  assert.equal(result.draft.productName, '便携榨汁杯');
  assert.equal(result.draft.currentProblem, null); // unverifiable quote dropped
  const chat = calls.find((call) => call.url === '/api/ai/chat');
  assert(chat, 'expected a chat call');
  const body = JSON.parse(chat.options.body);
  assert(!('temperature' in body), 'extraction must not send a fixed temperature');
  assert(body.messages.some((message) => message.content.includes('便携榨汁杯')));
  const prompt = body.messages.find((message) => message.role === 'user').content;
  assert.match(prompt, /当前结构化草稿/);
  assert.match(prompt, /"productClicks": 1450/);
  assert.match(prompt, /"paidOrders": 42/);
  assert.match(prompt, /容量为350ml/);
  const binding = result.sourceBindings.find((entry) => entry.field === 'productName');
  assert.equal(binding.source, 'manual');
  assert.equal(binding.locator.quote, '便携榨汁杯');
});

test('configured API still reads a fully filled draft and does not misreport a zero-change reply as local-only', async () => {
  const h = harness('one_sentence_v1');
  const values = Object.fromEntries(TEXT_FIELDS.map((field) => [field, '已填写-' + field]));
  const draft = createMerchantIntakeDraft({ sources: ['manual'], transcript: '完整资料原文', ...values,
    metrics: { videoViews: 58000, productClicks: 1450, addToCarts: 96, createdOrders: 54, paidOrders: 42 },
    evidenceLedger: TEXT_FIELDS.map((field) => ({ field, value: values[field], status: 'confirmed_fact', source: 'manual' })) });
  let chatBody = null;
  const result = await requestIntakeExtraction(extractionRequest(h, draft, '字段已经填写完整'), {
    fetchImpl: async (url, options) => {
      if (url === '/api/ai/settings') {
        return jsonResponse({ configured: true, baseUrl: 'https://api.example.com', model: 'test-model', hasKey: true });
      }
      chatBody = JSON.parse(options.body);
      return jsonResponse({ ok: true, content: '{"fields":{}}' });
    }
  });
  assert.equal(result.ok, true);
  assert.equal(result.mode, 'api');
  assert.equal(result.sentToExternal, true);
  assert.match(chatBody.messages.find((message) => message.role === 'user').content, /"videoViews": 58000/);
  assert(result.notes.some((note) => note.includes('已读取当前结构化草稿')));
  assert.equal(result.draft.productName, values.productName);
});

test('a failed AI reply never replaces the local extraction result', async () => {
  const h = harness('one_sentence_v1');
  const csv = addMaterial(h, 'fallback.csv', 'text/csv', 'local_extract_fallback');
  setFacts(h, [fileFact(csv, 'paid_orders', 2, { unit: '笔' })]);
  const draft = createMerchantIntakeDraft({ sources: ['csv'], transcript: '原话' });
  const fetchImpl = async (url) => url === '/api/ai/settings'
    ? jsonResponse({ configured: true, baseUrl: 'https://api.example.com', model: 'm', hasKey: true })
    : { ok: false, status: 409, json: async () => ({ ok: false, code: 'ai_not_configured', message: '尚未配置 AI。' }) };
  const result = await requestIntakeExtraction(extractionRequest(h, draft), { fetchImpl });
  assert.equal(result.ok, true);
  assert.equal(result.mode, 'api_failed');
  assert.equal(result.sentToExternal, null);
  assert.equal(result.draft.metrics.paidOrders, 2);
  assert(result.notes.some((note) => note.includes('AI')));
});

test('ai client defaults to globalThis.fetch when no fetchImpl is passed', async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => jsonResponse({ configured: false, baseUrl: null, model: null, hasKey: false });
    const result = await getAiSettings();
    assert.equal(result.ok, true);
    assert.equal(result.configured, false);
  } finally { globalThis.fetch = original; }
});

test('ai settings status client exposes only validated fields and never a key', async () => {
  for (const value of [null, [], {}, { configured: 'yes' }, { configured: true },
    { configured: true, baseUrl: 'x', model: 1 }, { configured: true, baseUrl: 'x', model: 'm', apiKey: 'SECRET' }]) {
    const result = await getAiSettings({ fetchImpl: async () => jsonResponse(value) });
    if (value && value.configured === true && value.model === 'm' && value.apiKey) {
      // key material must not be forwarded to the client surface
      assert.equal(result.ok, true);
      assert.equal(result.apiKey, undefined);
      continue;
    }
    assert.equal(result.ok, false);
  }
  const result = await getAiSettings({ fetchImpl: async () => jsonResponse({ configured: true, baseUrl: 'https://api.example.com', model: 'm', hasKey: true }) });
  assert.equal(result.ok, true);
  assert.equal(result.model, 'm');
});

test('intake accepts a contiguous unsaved correction chain from the persisted current value', () => {
  for (const field of ['productName', 'currentProblem']) {
    const h = harness('one_sentence_v1');
    let draft = createMerchantIntakeDraft({ sources: ['manual'], [field]: '值A' });
    saveIntake(h, draft);
    draft = { ...draft, [field]: '值B', userCorrections: [{ field, before: '值A', after: '值B' }] };
    saveIntake(h, draft);
    const id = h.state.input.facts.find((fact) => fact.intakeField === field).id;
    const version = h.state.round.inputVersion;
    draft = { ...draft, [field]: '值D', userCorrections: [...draft.userCorrections,
      { field, before: '值B', after: '值C' }, { field, before: '值C', after: '值D' }] };
    saveIntake(h, draft);
    const fact = h.state.input.facts.find((entry) => entry.id === id);
    assert.equal(fact.value, '值D');
    assert.equal(fact.verification, 'user_corrected');
    assert.equal(h.state.round.inputVersion, version + 1);
    if (field === 'currentProblem') assert.equal(h.state.input.focus, '值D');
    assert.equal(h.state.input.intake.draft[field], '值D');
  }
});

test('explicit deletion of a corrected intake array item removes it or keeps an unknown reference tombstone', () => {
  for (const referenced of [false, true]) {
    const h = harness('one_sentence_v1');
    let draft = createMerchantIntakeDraft({ sources: ['manual'], previousAttempts: ['动作A'] });
    saveIntake(h, draft);
    draft = { ...draft, previousAttempts: ['动作B'], userCorrections: [
      { field: 'previousAttempts.0', before: '动作A', after: '动作B' }] };
    saveIntake(h, draft);
    const id = h.state.input.facts.find((fact) => fact.intakeField === 'previousAttempts.0').id;
    if (referenced) h.send('ORGANIZATION_SET', {
      roundId: h.state.round.id, inputVersion: h.state.round.inputVersion,
      focus: h.state.input.focus, facts: h.state.input.facts, constraints: h.state.input.constraints,
      unknowns: [...h.state.input.unknowns, { id: null, description: '外部缺口仍引用原动作', reason: 'unknown', sourceId: `fact:${id}` }]
    });
    draft = { ...draft, previousAttempts: [], userCorrections: [...draft.userCorrections,
      { field: 'previousAttempts.0', before: '动作B', after: null }] };
    saveIntake(h, draft);
    const fact = h.state.input.facts.find((entry) => entry.id === id);
    if (referenced) {
      assert.equal(fact.value, null);
      assert.equal(fact.availability, 'unknown');
      assert(h.state.input.unknowns.some((entry) => entry.sourceId === `fact:${id}`));
    } else assert.equal(fact, undefined);
    assert.deepEqual(h.state.input.intake.draft.previousAttempts, []);
  }
});

test('intake rejects a broken correction chain without changing the persisted draft or original transcript', () => {
  const h = harness('one_sentence_v1');
  let draft = createMerchantIntakeDraft({ sources: ['voice', 'manual'], transcript: '原始口述值A', productName: '值A' });
  saveIntake(h, draft);
  draft = { ...draft, productName: '值B', userCorrections: [{ field: 'productName', before: '值A', after: '值B' }] };
  saveIntake(h, draft);
  const before = structuredClone(h.state);
  const broken = { ...draft, productName: '值D', userCorrections: [...draft.userCorrections,
    { field: 'productName', before: '其他旧值', after: '值C' }, { field: 'productName', before: '值C', after: '值D' }] };
  assert.throws(() => saveIntake(h, broken), (error) => ['correction_conflict', 'invalid_intake'].includes(error.code));
  assert.deepEqual(h.state, before);
});

test('intake and fact corrections invalidate transitive derived values while preserving unrelated external records', () => {
  for (const mode of ['INTAKE_SET', 'FACT_PATCH']) {
    const h = harness('one_sentence_v1');
    const draft = createMerchantIntakeDraft({ sources: ['manual'], metrics: { productClicks: 10, paidOrders: 2 } });
    saveIntake(h, draft);
    const clicks = h.state.input.facts.find((fact) => fact.intakeField === 'metrics.productClicks');
    const paid = h.state.input.facts.find((fact) => fact.intakeField === 'metrics.paidOrders');
    h.send('ORGANIZATION_SET', { roundId: h.state.round.id, inputVersion: h.state.round.inputVersion,
      focus: h.state.input.focus, facts: [...h.state.input.facts,
        { id: 'calc_rate', key: 'synthetic_ratio', value: 0.2, availability: 'known',
          source: { kind: 'derived', sourceFactIds: [clicks.id, paid.id] } },
        { id: 'calc_second', key: 'synthetic_derived_second', value: 20, availability: 'known',
          source: { kind: 'derived', sourceFactIds: ['calc_rate'] } },
        { id: 'independent_note', key: 'independent_note', value: '无关原话保留', availability: 'known',
          source: { kind: 'merchant_statement', locator: { type: 'text', start: 0, end: 6 } } }],
      constraints: [...h.state.input.constraints, { id: 'old_condition', description: '仅在旧比例成立',
        value: null, unit: null, scope: 'round', sourceFactIds: ['calc_rate'] }],
      unknowns: h.state.input.unknowns });
    const unrelated = structuredClone(h.state.input.facts.find((fact) => fact.id === 'independent_note'));
    const version = h.state.round.inputVersion;
    const correctedDraft = { ...draft, metrics: { ...draft.metrics, productClicks: 20 } };
    if (mode === 'INTAKE_SET') saveIntake(h, correctedDraft);
    else h.send('FACT_PATCH', { inputVersion: version, fact: { ...clicks, value: 20 } });
    assert.equal(h.state.round.inputVersion, version + 1);
    assert.equal(h.state.input.facts.find((fact) => fact.id === clicks.id).value, 20);
    assert.equal(h.state.input.facts.find((fact) => fact.id === paid.id).value, 2);
    for (const id of ['calc_rate', 'calc_second']) {
      const fact = h.state.input.facts.find((entry) => entry.id === id);
      assert.equal(fact.value, null);
      assert.equal(fact.availability, 'unknown');
      assert(h.state.input.unknowns.some((entry) => entry.sourceId === `fact:${id}`));
    }
    assert.equal(h.state.input.constraints.some((entry) => entry.id === 'old_condition'), false);
    assert.deepEqual(h.state.input.facts.find((fact) => fact.id === unrelated.id), unrelated);
    assert(h.state.history.some((entry) => entry.type === 'facts_invalidated'
      && entry.facts.some((fact) => fact.id === 'calc_rate' && fact.value === 0.2)));
    if (mode === 'FACT_PATCH') saveIntake(h, correctedDraft);
    analyze(h);
    assert.equal(h.state.analysis.inputSnapshot.facts.find((fact) => fact.id === 'calc_rate').value, null);
    assert.equal(h.state.analysis.inputSnapshot.constraints.some((entry) => entry.id === 'old_condition'), false);
  }
});

test('local parser facts must match the current material version before they can fill the draft', async () => {
  const h = harness('one_sentence_v1');
  const csv = addMaterial(h, 'stale.csv', 'text/csv', 'local_extract_stale');
  setFacts(h, [fileFact(csv, 'video_views', 9, { unit: '次', id: 'test_fact_stale' })]);
  // Simulate the parser fact pointing at a superseded material version.
  const staleFact = { ...h.state.input.facts[0],
    source: { ...h.state.input.facts[0].source, materialVersion: csv.version + 1 } };
  setFacts(h, [staleFact]);
  const draft = createMerchantIntakeDraft({ sources: ['csv'], transcript: '原话' });
  const result = await requestIntakeExtraction(extractionRequest(h, draft), { fetchImpl: async () => unconfiguredResponse() });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'invalid_intake');
  assert.equal(result.editable, true);
  assert.equal(result.draft.metrics.videoViews, 9);
  assert.equal(result.sentToExternal, false);
});

test('PRD V1 seed keeps four sourced product facts and the target audience as a hypothesis', () => {
  const h = harness('juicer_cup_v1');
  const draft = h.state.input.intake.draft;
  assert.equal(draft.merchantName, '轻活电器旗舰店');
  assert.deepEqual(draft.confirmedProductFacts, ['容量为350ml', '充电接口为USB-C', '全国包邮', '清洗方式以商品说明书为准']);
  const audience = h.state.input.facts.find((fact) => fact.intakeField === 'targetCustomerHypothesis');
  assert.equal(audience.evidenceStatus, 'owner_hypothesis');
  assert.match(audience.value, /租房上班族/);
  assert(draft.customerQuestions.length === 0);
  assert(!draft.confirmedProductFacts.some((fact) => /打冰|续航/.test(fact)));
  assert.equal(h.state.analysis, null);
});

test('PRD V1 strict 8 percent route uses comparable data and never fabricates A/B for missing scope', () => {
  const h = harness('juicer_cup_v1');
  h.send('FOCUS_CONFIRM', { inputVersion: h.state.round.inputVersion });
  for (const [carts, count] of [[115, 2], [116, 0], [117, 0], [0, 2]]) {
    const state = structuredClone(h.state);
    state.input.facts.find((fact) => fact.key === 'add_to_carts').value = carts;
    if (carts === 0) state.input.facts.filter((fact) => ['created_orders', 'paid_orders'].includes(fact.key)).forEach((fact) => { fact.value = 0; });
    const result = buildDemoAnalysis(state).analysis;
    assert.equal(result.paths.filter((path) => path.actionKey).length, count);
    assert.equal(result.routing.rule.threshold, 0.08);
    assert.equal(result.routing.rule.operator, 'lt');
    assert.match(result.routing.rule.description, /不是抖音官方或行业标准/);
    assert.equal(result.routing.expert?.status ?? 'not_called', 'not_called');
  }
  for (const mutate of [
    (state) => { state.input.facts.find((fact) => fact.key === 'product_clicks').window.end = '2026-08-26'; },
    (state) => { const fact = state.input.facts.find((fact) => fact.key === 'add_to_carts'); fact.value = null; fact.availability = 'unknown'; },
    (state) => { state.input.facts.filter((fact) => ['product_clicks', 'add_to_carts', 'created_orders', 'paid_orders'].includes(fact.key)).forEach((fact) => { fact.value = 0; }); },
    (state) => { state.fixtureId = null; }
  ]) {
    const state = structuredClone(h.state); mutate(state);
    const result = buildDemoAnalysis(state).analysis;
    assert.equal(result.priority.status, 'unavailable');
    assert.equal(result.routing.stage, null);
    assert(result.paths.every((path) => !path.actionKey));
  }
});

test('PRD V1 first-round A/B have stable experiment IDs and independently sourced hypotheses', () => {
  const h = harness('juicer_cup_v1'); analyze(h);
  assert.equal(h.state.analysis.prdVersion, '1.0');
  assert.equal(h.state.analysis.analysisSource, 'local_fallback');
  assert.equal(h.state.analysis.dataQuality.score, 100);
  assert.match(h.state.analysis.dataQuality.meaning, /不代表数据真实性/);
  assert.deepEqual(h.state.analysis.paths.map((path) => path.actionKey), ['juicer_first_screen', 'juicer_question_video']);
  for (const [index, label] of ['A', 'B'].entries()) {
    const path = h.state.analysis.paths[index];
    assert.equal(path.optionLabel, label);
    assert.equal(path.experiment.experimentId, 'EXP-JUICER01-click_cart-' + label + '-R1');
    assert.equal(path.experiment.round, 1);
    assert.equal(path.experiment.change, index === 0 ? '商品详情页首屏' : '一条真实问题验证视频');
    assert.match(path.validationMetric, /加购次数/);
    const assumption = path.estimate.assumptions.find((entry) => path.experiment.assumptionIds.includes(entry.id) && entry.note === path.experiment.hypothesis);
    assert(assumption);
    assert.equal(assumption.value, null);
    assert(assumption.sourceFactIds.length > 0);
    assert.equal(path.cost.money.value, null);
    assert.equal(path.cost.time.value, null);
  }
  assert.equal(h.state.selection, null);
});

test('PRD V1 rejects forged route, data quality, strategy identity and incomplete experiment cards atomically', () => {
  const h = harness('juicer_cup_v1');
  h.send('FOCUS_CONFIRM', { inputVersion: h.state.round.inputVersion });
  const draft = buildDemoAnalysis(h.state).analysis;
  for (const mutate of [
    (analysis) => { analysis.routing.rule.threshold = 0.5; },
    (analysis) => { analysis.routing.expert.status = 'done'; },
    (analysis) => { analysis.dataQuality.score = 99; },
    (analysis) => { analysis.paths[0].optionLabel = 'B'; },
    (analysis) => { analysis.paths[0].experiment.experimentId = 'EXP-JUICER01-click_cart-A-R2'; },
    (analysis) => { analysis.paths[0].experiment.hypothesis = '已证实信任不足'; },
    (analysis) => { analysis.paths[0].experiment.change = '同时改标题和价格'; },
    (analysis) => { analysis.paths[0].experiment.guardrails = []; },
    (analysis) => { delete analysis.paths[0].experiment.restoreSteps; },
    (analysis) => { analysis.paths[0].experiment.minSample = 0; }
  ]) {
    const before = structuredClone(h.state), changed = structuredClone(draft); mutate(changed);
    assert.throws(() => h.send('ANALYSIS_SET', { analysis: changed }), { code: 'invalid_structure' });
    assert.deepEqual(h.state, before);
  }
});

test('PRD V1 does not rename historical juicer action keys or generate first-screen copy for them', () => {
  for (const [key, title, copyTitle] of [
    ['juicer_faq', '补全商品购买问答区', '购买问答区已确认文案'],
    ['juicer_video_intro', '调整视频前几秒的信任表达', '视频开头字幕参考稿']
  ]) {
    const h = harness('juicer_cup_v1'); analyze(h);
    h.send('PATH_SELECT', { analysisId: h.state.analysis.id, pathId: h.state.analysis.paths[0].id, inputVersion: h.state.round.inputVersion });
    const old = structuredClone(h.state);
    old.analysis.paths[0].actionKey = key;
    old.analysis.paths[0].title = title;
    delete old.analysis.sourceFixtureId;
    const read = normalizeSessionState(old);
    assert.equal(read.analysis.paths[0].actionKey, key);
    assert.equal(read.analysis.paths[0].title, title);
    const result = buildDemoArtifact(read);
    assert.equal(result.artifacts.find((artifact) => artifact.kind === 'copy').title, copyTitle);
    assert.equal(result.artifacts.some((artifact) => artifact.title === '商品详情页首屏替换稿'), false);
  }
});

test('analysis sourceFixtureId is captured from state, survives feedback, and cannot be claimed by a draft', () => {
  const h = harness('juicer_cup_v1'); analyze(h); selectAndSave(h);
  assert.equal(h.state.analysis.sourceFixtureId, 'juicer_cup_v1');
  const artifact = h.state.artifacts[0];
  h.send('FEEDBACK_SAVE', { feedbackRecord: { artifactId: artifact.id, artifactVersion: artifact.version, rawText: '' } });
  assert.equal(h.state.fixtureId, null);
  assert.equal(h.state.analysis.sourceFixtureId, 'juicer_cup_v1');
  const normal = harness();
  normal.send('INPUT_EDIT', { description: '普通资料，没有合成来源' });
  normal.send('FOCUS_CONFIRM', { inputVersion: normal.state.round.inputVersion });
  const draft = buildDemoAnalysis(normal.state).analysis;
  draft.sourceFixtureId = 'juicer_cup_v1';
  normal.send('ANALYSIS_SET', { analysis: draft });
  assert.equal(normal.state.analysis.sourceFixtureId, null);
});

test('feedback details v1 preserve explicit null and zero without inferring execution or an outcome', () => {
  assert.equal(FEEDBACK_DETAILS_VERSION, 1);
  const h = harness('juicer_cup_v1'); analyze(h); selectAndSave(h);
  const artifact = h.state.artifacts[0];
  const details = { detailsVersion: 1, reason: '原话与空值保留', sampleSize: 0, sampleUnit: 'product_clicks',
    metricBefore: 0, metricAfter: null, constraintsLearned: [' 商品标题不能修改 '], guardrailStatus: 'unknown' };
  h.send('FEEDBACK_SAVE', {
    executionRecord: { artifactId: artifact.id, artifactVersion: artifact.version, adoption: 'adopted', scope: '只改了首屏' },
    feedbackRecord: { artifactId: artifact.id, artifactVersion: artifact.version, observation: 'unknown', rawText: '感觉没效果', ...details }
  });
  const record = normalizeSessionState(h.state).feedbackRecords.at(-1);
  for (const [key, value] of Object.entries(details)) assert.deepEqual(record[key], value);
  assert.equal(h.state.executionRecords.at(-1).adoption, 'adopted');
  assert.equal(h.state.executionRecords.at(-1).execution, 'unknown');
  assert.equal(h.state.executionRecords.at(-1).executedAt, null);
  assert.equal(record.observation, 'unknown');
  assert.equal(h.state.events.some((event) => event.type === 'execution_reported'), false);
});

test('feedback details v1 accept null sample values and boundary-length text as exact merchant input', () => {
  const h = harness('juicer_cup_v1'); analyze(h); selectAndSave(h);
  const artifact = h.state.artifacts[0];
  const details = { detailsVersion: 1, reason: '原'.repeat(1000), sampleSize: null, sampleUnit: null,
    metricBefore: null, metricAfter: 1, constraintsLearned: Array.from({length:20}, () => '限'.repeat(300)), guardrailStatus: 'clear' };
  h.send('FEEDBACK_SAVE', { feedbackRecord: { artifactId: artifact.id, artifactVersion: artifact.version, rawText: '话'.repeat(500), ...details } });
  const saved = h.state.feedbackRecords.at(-1);
  for (const [key, value] of Object.entries(details)) assert.deepEqual(saved[key], value);
  assert.equal(saved.rawText.length, 500);
});

test('invalid new feedback fields and missing version reject the whole save without changing legacy state', () => {
  const h = harness('juicer_cup_v1'); analyze(h); selectAndSave(h);
  const artifact = h.state.artifacts[0];
  const base = { artifactId: artifact.id, artifactVersion: artifact.version, detailsVersion: 1, reason: null,
    sampleSize: null, sampleUnit: null, metricBefore: null, metricAfter: null, constraintsLearned: [], guardrailStatus: 'unknown', rawText: '' };
  for (const patch of [
    { detailsVersion: undefined }, { detailsVersion: 2 }, { detailsVersion: '1' },
    { reason: false }, { reason: 'a'.repeat(1001) }, { sampleSize: -1 }, { sampleSize: 0.1 },
    { sampleSize: Number.MAX_SAFE_INTEGER + 1 }, { sampleSize: '0' }, { sampleSize: Infinity },
    { sampleUnit: 'people' }, { sampleUnit: 0 }, { metricBefore: -0.1 }, { metricAfter: 1.01 },
    { metricAfter: '0' }, { metricBefore: NaN }, { constraintsLearned: null }, { constraintsLearned: [''] },
    { constraintsLearned: ['a'.repeat(301)] }, { constraintsLearned: Array(21).fill('限制') },
    { guardrailStatus: 'safe' }, { rawText: 'a'.repeat(501) }
  ]) {
    const before = structuredClone(h.state);
    assert.throws(() => h.send('FEEDBACK_SAVE', {
      executionRecord: { artifactId: artifact.id, artifactVersion: artifact.version, adoption: 'adopted', execution: 'unknown' },
      feedbackRecord: { ...base, ...patch }
    }), { code: 'invalid_payload' });
    assert.deepEqual(h.state, before);
  }
  const missingVersion = { ...base }; delete missingVersion.detailsVersion;
  assert.throws(() => h.send('FEEDBACK_SAVE', { feedbackRecord: missingVersion }), { code: 'invalid_payload' });
});

test('legacy feedback payload and intended adoption stay compatible; details version is exported by state', async () => {
  const h = harness('underbed_complete_v1'); analyze(h); selectAndSave(h);
  const artifact = h.state.artifacts[0];
  h.send('FEEDBACK_SAVE', {
    executionRecord: { artifactId: artifact.id, artifactVersion: artifact.version, adoption: 'intended', execution: 'not_started' },
    feedbackRecord: { artifactId: artifact.id, artifactVersion: artifact.version, observation: 'unchanged', rawText: '旧版自述' }
  });
  assert.equal(h.state.executionRecords.at(-1).adoption, 'intended');
  assert.equal(h.state.executionRecords.at(-1).execution, 'not_started');
  assert.equal(h.state.feedbackRecords.at(-1).detailsVersion, undefined);
  assert.equal(h.state.feedbackRecords.at(-1).sampleSize, undefined);
  const stateSource = await readFile(new URL('../shared/state.js', import.meta.url), 'utf8');
  assert.match(stateSource, /export \{[^}]*FEEDBACK_DETAILS_VERSION[^}]*\} from '\.\/model\.js'/);
});


// C8: acceptance regression coverage. The preceding 90 tests are the frozen PRD V1 suite, unchanged.
import { validateAnalysis as validateAnalysisForC8 } from '../shared/model.js';
import { buildExperimentReview as buildExperimentReviewForC8 } from '../shared/experiment-memory.js';
import { prepareExperimentAcceptance as prepareExperimentAcceptanceForC8,
  getAcceptedExperimentRound as getAcceptedExperimentRoundForC8,
  matchesAcceptedExperimentPayload as matchesAcceptedExperimentPayloadForC8 } from '../shared/experiment-round.js';

// Keep the C8 harness local: it needs explicit command IDs and the real reducer context.
{
const validateAnalysis = validateAnalysisForC8;
const buildExperimentReview = buildExperimentReviewForC8;
const prepareExperimentAcceptance = prepareExperimentAcceptanceForC8;
const getAcceptedExperimentRound = getAcceptedExperimentRoundForC8;
const matchesAcceptedExperimentPayload = matchesAcceptedExperimentPayloadForC8;
const clone = structuredClone;
function harness() {
  let counter = 0;
  const context = { newId: () => 'c8_' + (++counter), now: '2026-08-28T15:30:00.000Z' };
  let state = createEmptyState(context);
  const send = (type, payload, commandId = 'cmd_' + (++counter)) => {
    const result = reduceCommand(state, { type, payload, commandId, expectedRevision: state.revision }, context);
    state = result.state; return result;
  };
  send('LOAD_FIXTURE', { fixtureId: 'juicer_cup_v1' });
  send('FOCUS_CONFIRM', { inputVersion: state.round.inputVersion });
  const analysis = buildDemoAnalysis(state); assert.equal(analysis.ok, true, analysis.message);
  send('ANALYSIS_SET', { analysis: analysis.analysis });
  send('PATH_SELECT', { analysisId: state.analysis.id, pathId: state.analysis.paths.find((path) => path.optionLabel === 'A').id,
    inputVersion: state.round.inputVersion });
  const artifacts = buildDemoArtifact(state); assert.equal(artifacts.ok, true, artifacts.message);
  for (const artifact of artifacts.artifacts) send('ARTIFACT_SAVE', { artifact });
  const artifact = state.artifacts.find((entry) => entry.kind === 'copy');
  const feedback = (detail = {}, execution = {}) => {
    send('FEEDBACK_SAVE', {
      executionRecord: { artifactId: artifact.id, artifactVersion: artifact.version,
        adoption: 'adopted', execution: 'done', scope: '只替换详情页首屏文字层', executedAt: '2026-08-28', ...execution },
      feedbackRecord: { artifactId: artifact.id, artifactVersion: artifact.version, detailsVersion: 1,
        observation: 'unchanged', rawText: '首屏已调整，新增100次商品点击，自述没有明显变化，商品标题不能修改',
        reason: '保持价格、投流及其他内容不变', sampleSize: 100, sampleUnit: 'product_clicks', metricBefore: null, metricAfter: null,
        constraintsLearned: ['商品标题不能修改', '没有打冰与续航测试数据'], guardrailStatus: 'clear', ...detail },
    });
    return state.feedbackRecords.at(-1).id;
  };
  return { context, send, feedback, artifact, get state() { return state; } };
}

function preview(h, detail, execution) {
  const feedbackId = h.feedback(detail, execution);
  const result = buildExperimentReview(h.state, feedbackId);
  assert.equal(result.ok, true, result.message);
  return { review: result.review, payload: { feedbackId, reviewFingerprint: result.review.fingerprint,
    roundId: result.review.roundId, inputVersion: result.review.inputVersion } };
}

test('C7 preview is read-only and yields A/R2 FAQ without creating a round or selection', () => {
  const h = harness(), p = preview(h), before = clone(h.state);
  const again = buildExperimentReview(h.state, p.payload.feedbackId);
  assert.equal(again.review.decision, 'change_variable');
  assert.equal(again.review.nextAction.status, 'candidate');
  assert.equal(again.review.nextAction.optionLabel, 'A');
  assert.equal(again.review.nextAction.experimentId, 'EXP-JUICER01-click_cart-A-R2');
  assert.deepEqual(h.state, before); assert.equal(h.state.round.index, 1);
  assert.equal(getAcceptedExperimentRound(h.state, p.payload.feedbackId).ok, false);
});

test('EXPERIMENT_ACCEPT atomically creates one valid selected FAQ R2 without fixture/execution defaults', () => {
  const h = harness(), p = preview(h), before = clone(h.state), originalObject = h.state;
  const result = h.send('EXPERIMENT_ACCEPT', p.payload);
  assert.equal(result.changed, true); assert.equal(h.state.revision, before.revision + 1);
  assert.deepEqual(originalObject, before, 'reducer never mutates its input on success');
  assert.equal(h.state.round.index, 2); assert.notEqual(h.state.round.id, before.round.id);
  assert.equal(h.state.round.inputVersion, before.round.inputVersion + 1);
  assert.equal(h.state.fixtureId, null); assert.equal(h.state.analysis.sourceFixtureId, null);
  assert.equal(h.state.analysis.mode, 'local_limited'); assert.equal(h.state.analysis.analysisSource, 'local_fallback');
  assert.equal(h.state.analysis.paths.length, 1);
  const path = h.state.analysis.paths[0];
  assert.equal(path.actionKey, 'juicer_faq'); assert.equal(path.optionLabel, 'A');
  assert.equal(path.experiment.experimentId, 'EXP-JUICER01-click_cart-A-R2');
  assert.equal(path.experiment.change, '购买问答区');
  assert.equal(h.state.selection.pathId, path.id); assert.equal(h.state.selection.analysisId, h.state.analysis.id);
  assert.equal(h.state.round.sourceFeedbackId, p.payload.feedbackId);
  assert.deepEqual(h.state.analysis.funnel, before.analysis.funnel);
  assert.equal(h.state.analysis.funnelSource.analysisId, before.analysis.id);
  assert.equal(h.state.analysis.funnelSource.roundId, before.round.id);
  assert.equal(h.state.selection.sourceFeedbackId, p.payload.feedbackId);
  assert.equal(h.state.executionRecords.filter((entry) => entry.roundId === h.state.round.id).length, 0);
  assert.equal(h.state.feedbackRecords.filter((entry) => entry.roundId === h.state.round.id).length, 0);
  assert.equal(result.roundLink.kind, 'experiment_acceptance');
  assert.equal(getAcceptedExperimentRound(h.state, p.payload.feedbackId, p.payload.reviewFingerprint).ok, true);
  assert.doesNotThrow(() => validateAnalysis(h.state.analysis, h.state));
});

test('same command or same feedback replays only the complete accepted result, never a third round', () => {
  const h = harness(), p = preview(h);
  h.send('EXPERIMENT_ACCEPT', p.payload, 'explicit_accept');
  const complete = clone(h.state), revision = complete.revision;
  for (const commandId of ['explicit_accept', 'other_accept_command']) {
    const result = h.send('EXPERIMENT_ACCEPT', p.payload, commandId);
    assert.equal(result.changed, false); assert.deepEqual(h.state, complete); assert.equal(h.state.revision, revision);
  }
  assert.equal(h.state.history.filter((entry) => entry.type === 'experiment_acceptance').length, 1);
});

test('ordinary ROUND_START empty new round cannot be mistaken for C8 accepted success', () => {
  const h = harness(), p = preview(h);
  h.send('ROUND_START', { feedbackId: p.payload.feedbackId });
  const before = clone(h.state);
  assert.equal(h.state.analysis, null); assert.equal(h.state.selection, null);
  assert.equal(getAcceptedExperimentRound(h.state, p.payload.feedbackId).ok, false);
  assert.throws(() => h.send('EXPERIMENT_ACCEPT', p.payload));
  assert.deepEqual(h.state, before);
});

test('fingerprint, extra payload or fresh input changes reject without modifying old records', () => {
  for (const mode of ['fingerprint', 'payload', 'input', 'unversioned-input']) {
    const h = harness(), p = preview(h);
    if (mode === 'fingerprint') p.payload.reviewFingerprint = 'sha256:' + '0'.repeat(64);
    if (mode === 'payload') p.payload.analysis = {};
    if (mode === 'input') h.send('INPUT_EDIT', { description: h.state.input.description + ' 补充一项' });
    const source = mode === 'unversioned-input' ? clone(h.state) : h.state;
    if (mode === 'unversioned-input') source.input.description += ' 非原快照';
    const before = clone(source);
    assert.throws(() => reduceCommand(source, { type: 'EXPERIMENT_ACCEPT', payload: p.payload, commandId: 'try_stale', expectedRevision: source.revision }, h.context));
    assert.deepEqual(source, before);
  }
});

test('different current analysis, selection or session cannot accept an old candidate', () => {
  for (const mode of ['analysis', 'selection', 'session']) {
    const h = harness(), p = preview(h), source = clone(h.state);
    if (mode === 'analysis') source.analysis.id = 'other_analysis';
    if (mode === 'selection') source.selection.pathId = source.analysis.paths.find((path) => path.optionLabel === 'B').id;
    if (mode === 'session') source.sessionId = 'other_session';
    const before = clone(source);
    assert.equal(prepareExperimentAcceptance(source, p.payload).ok, false);
    assert.deepEqual(source, before);
  }
});

test('a newer related feedback or execution blocks the previously displayed candidate', () => {
  for (const mode of ['feedback', 'execution']) {
    const h = harness(), p = preview(h);
    if (mode === 'feedback') h.feedback({ sampleSize: 101 });
    else h.send('FEEDBACK_SAVE', { executionRecord: { artifactId: h.artifact.id, artifactVersion: h.artifact.version,
      adoption: 'adopted', execution: 'partial', scope: '更正执行范围', executedAt: null } });
    const before = clone(h.state);
    assert.throws(() => h.send('EXPERIMENT_ACCEPT', p.payload));
    assert.deepEqual(h.state, before);
  }
});

test('a read-only view event does not invalidate candidate business identity', () => {
  const h = harness(), p = preview(h), beforeRevision = h.state.revision;
  h.send('EVENT_APPEND', { event: { type: 'path_viewed', refs: { pageId: 'action', analysisId: h.state.analysis.id,
    pathId: h.state.selection.pathId, inputVersion: h.state.round.inputVersion } } });
  assert.equal(h.state.revision, beforeRevision + 1);
  assert.equal(buildExperimentReview(h.state, p.payload.feedbackId).review.fingerprint, p.payload.reviewFingerprint);
  assert.equal(h.send('EXPERIMENT_ACCEPT', p.payload).changed, true);
});

test('not executed, insufficient sample, missing result and risk never create R2', () => {
  const variants = [
    [{}, { execution: 'unknown' }], [{}, { execution: 'not_started' }], [{}, { execution: 'partial' }],
    [{}, { adoption: 'declined' }], [{ sampleSize: null }, {}], [{ sampleSize: 0 }, {}],
    [{ sampleSize: 99 }, {}], [{ sampleUnit: null }, {}], [{ observation: 'unknown' }, {}],
    [{ observation: 'worse' }, {}], [{ guardrailStatus: 'triggered' }, {}],
  ];
  for (const [detail, execution] of variants) {
    const h = harness(), p = preview(h, detail, execution), before = clone(h.state);
    assert.notEqual(p.review.decision, 'change_variable');
    assert.throws(() => h.send('EXPERIMENT_ACCEPT', p.payload));
    assert.deepEqual(h.state, before);
  }
});

test('R2 artifacts use original four confirmed facts and keep title/unknown performance restrictions', () => {
  const h = harness(), p = preview(h); h.send('EXPERIMENT_ACCEPT', p.payload);
  const generated = buildDemoArtifact(h.state); assert.equal(generated.ok, true, generated.message);
  const copy = generated.artifacts.find((artifact) => artifact.kind === 'copy');
  assert.match(copy.title, /购买问答区/); assert.match(copy.body, /容量350ml|350ml/);
  assert.match(copy.body, /USB-C/); assert.match(copy.body, /全国包邮/); assert.match(copy.body, /清洗方式以商品说明书为准/);
  assert.match(copy.body, /不修改商品标题/); assert.match(copy.body, /无测试资料不作承诺/);
  assert.doesNotMatch(copy.body, /可以打冰|一次能榨350|续航\d+|测试成功/);
  const checklist = generated.artifacts.find((artifact) => artifact.kind === 'checklist');
  for (const constraint of p.review.nextAction.constraints) assert.ok(checklist.body.includes(constraint), constraint);
  assert.deepEqual(h.state.analysis.paths[0].experiment.constraintsLearned, p.review.constraintsLearned);
  assert.ok(generated.artifacts.every((artifact) => artifact.pathId === h.state.selection.pathId
    && artifact.experimentId === 'EXP-JUICER01-click_cart-A-R2'));
  for (const artifact of generated.artifacts) h.send('ARTIFACT_SAVE', { artifact });
  assert.equal(getAcceptedExperimentRound(h.state, p.payload.feedbackId).ok, true);
  assert.equal(h.state.executionRecords.some((entry) => entry.roundId === h.state.round.id), false);
  assert.equal(buildDemoAnalysis(h.state).ok, false, 'refresh cannot silently replace accepted experiment');
});

test('ordinary ANALYSIS_SET cannot inject a fake memory FAQ or overwrite accepted R2', () => {
  const h = harness(), p = preview(h);
  const fake = clone(h.state.analysis); fake.paths = [fake.paths[0]];
  fake.paths[0].actionKey = 'juicer_faq'; fake.mode = 'local_limited'; fake.sourceFixtureId = null;
  assert.throws(() => h.send('ANALYSIS_SET', { analysis: fake }));
  fake.experimentReview = { version: 1, sourceFeedbackId: p.payload.feedbackId, reviewFingerprint: p.payload.reviewFingerprint };
  assert.throws(() => h.send('ANALYSIS_SET', { analysis: fake }));
  h.send('EXPERIMENT_ACCEPT', p.payload);
  const before = clone(h.state);
  assert.throws(() => h.send('ANALYSIS_SET', { analysis: clone(h.state.analysis) }));
  assert.deepEqual(h.state, before);
});

test('an explicit new restriction against changing the FAQ prevents acceptance rather than being dropped', () => {
  const h = harness(), p = preview(h, { constraintsLearned: ['商品标题不能修改', '购买问答区不能修改'] });
  const before = clone(h.state);
  assert.equal(p.review.decision, 'change_variable', 'C7 only projects a candidate; acceptance still checks feasibility');
  assert.throws(() => h.send('EXPERIMENT_ACCEPT', p.payload), /禁止调整购买问答区/);
  assert.deepEqual(h.state, before);
});

test('incomplete/tampered destination or source proof never counts as idempotent accepted success', () => {
  const h = harness(), p = preview(h); h.send('EXPERIMENT_ACCEPT', p.payload);
  for (const mode of ['selection', 'analysis', 'source', 'archive', 'duplicate']) {
    const source = clone(h.state);
    if (mode === 'selection') source.selection = null;
    if (mode === 'analysis') source.analysis.paths[0].experiment.change = '重改首屏';
    if (mode === 'source') source.feedbackRecords[0].rawText += ' 新的限制';
    if (mode === 'archive') source.history.find((entry) => entry.type === 'round').input.description += ' 改写';
    if (mode === 'duplicate') source.history.push(clone(source.history.find((entry) => entry.type === 'experiment_acceptance')));
    const before = clone(source);
    assert.equal(matchesAcceptedExperimentPayload(source, p.payload).ok, false);
    assert.throws(() => reduceCommand(source, { type: 'EXPERIMENT_ACCEPT', payload: p.payload, commandId: 'replay', expectedRevision: source.revision }, h.context));
    assert.deepEqual(source, before);
  }
});

test('original input, feedback, execution and previous history stay unchanged after acceptance', () => {
  const h = harness(), p = preview(h), before = clone(h.state); h.send('EXPERIMENT_ACCEPT', p.payload);
  assert.deepEqual(h.state.feedbackRecords, before.feedbackRecords);
  assert.deepEqual(h.state.executionRecords, before.executionRecords);
  assert.deepEqual(h.state.history.slice(0, before.history.length), before.history);
  const archive = h.state.history.find((entry) => entry.type === 'round' && entry.sourceFeedbackId === p.payload.feedbackId);
  assert.deepEqual(archive.input, before.input); assert.deepEqual(archive.analysis, before.analysis);
  assert.deepEqual(archive.selection, before.selection); assert.deepEqual(archive.round, before.round);
  assert.deepEqual(h.state.input.facts, before.input.facts);
  for (const old of before.artifacts) {
    const current = h.state.artifacts.find((entry) => entry.id === old.id);
    assert.deepEqual({ ...current, status: old.status }, old); assert.equal(current.status, 'stale');
  }
});

test('synthetic before-commit rollback and lost after-commit reply retry one real reducer transaction', () => {
  for (const failure of ['before', 'after']) {
    const h = harness(), p = preview(h), before = clone(h.state);
    let stored = clone(before), receipt = false, commitCount = 0, failOnce = true;
    const command = { type: 'EXPERIMENT_ACCEPT', payload: p.payload, commandId: 'one_accept', expectedRevision: before.revision };
    const dispatch = () => {
      if (receipt) {
        assert.equal(matchesAcceptedExperimentPayload(stored, command.payload).ok, true);
        return { ok: true, state: clone(stored) };
      }
      assert.equal(stored.revision, command.expectedRevision);
      const next = reduceCommand(stored, command, h.context);
      if (failure === 'before' && failOnce) { failOnce = false; return { ok: false, code: 'write_failed' }; }
      stored = next.state; receipt = true; commitCount++;
      if (failure === 'after' && failOnce) { failOnce = false; return { ok: false, code: 'read_failed' }; }
      return { ok: true, state: clone(stored) };
    };
    assert.equal(dispatch().ok, false);
    if (failure === 'before') assert.deepEqual(stored, before);
    const reply = dispatch(); assert.equal(reply.ok, true);
    assert.equal(commitCount, 1); assert.equal(stored.round.index, 2); assert.equal(stored.revision, before.revision + 1);
    assert.equal(stored.history.filter((entry) => entry.type === 'experiment_acceptance').length, 1);
  }
});

test('read failure never supplies a state for acceptance; state adapter guards repeated receipt completeness', async () => {
  const h = harness(), p = preview(h), before = clone(h.state);
  const failedRead = { ok: false, code: 'storage_unavailable' };
  let dispatches = 0;
  if (failedRead.ok) { dispatches++; h.send('EXPERIMENT_ACCEPT', p.payload); }
  assert.equal(dispatches, 0); assert.deepEqual(h.state, before);
  const stateSource = await readFile(new URL('../shared/state.js', import.meta.url), 'utf8');
  assert.match(stateSource, /if \(command\.type === 'EXPERIMENT_ACCEPT'\) \{\s+const accepted = matchesAcceptedExperimentPayload/);
  assert.match(stateSource, /export \{ getAcceptedExperimentRound \}/);
  assert.match(stateSource, /export \{ buildExperimentReview \}/);
  assert.match(stateSource, /command\.expectedRevision !== state\.revision/);
});


function rejectIncompleteC8Acceptance(source, payload, context) {
  const before = clone(source);
  assert.equal(getAcceptedExperimentRound(source, payload.feedbackId, payload.reviewFingerprint).ok, false);
  assert.equal(matchesAcceptedExperimentPayload(source, payload).ok, false);
  assert.throws(() => reduceCommand(source, { type: 'EXPERIMENT_ACCEPT', payload,
    commandId: 'retry_incomplete_acceptance', expectedRevision: source.revision }, context));
  assert.deepEqual(source, before);
}

test('C8 completeness rejects missing or invalid acceptance identity and timestamp', () => {
  const h = harness(), p = preview(h); h.send('EXPERIMENT_ACCEPT', p.payload);
  for (const mode of ['missing-id', 'invalid-id', 'missing-time', 'invalid-time', 'invalid-calendar']) {
    const source = clone(h.state);
    const record = source.history.find((entry) => entry.type === 'experiment_acceptance');
    if (mode === 'missing-id') delete record.id;
    if (mode === 'invalid-id') record.id = 'draft_not_a_saved_id';
    if (mode === 'missing-time') delete record.at;
    if (mode === 'invalid-time') record.at = 'not-a-time';
    if (mode === 'invalid-calendar') record.at = '2026-02-30T15:30:00.000Z';
    if (mode.includes('time') || mode === 'invalid-calendar') source.selection.selectedAt = record.at;
    rejectIncompleteC8Acceptance(source, p.payload, h.context);
  }
});

test('C8 completeness requires the saved structured review for repeated acceptance', () => {
  const h = harness(), p = preview(h); h.send('EXPERIMENT_ACCEPT', p.payload);
  for (const mode of ['missing', 'null', 'array', 'empty', 'missing-revision', 'negative-revision', 'future-revision']) {
    const source = clone(h.state);
    const record = source.history.find((entry) => entry.type === 'experiment_acceptance');
    if (mode === 'missing') delete record.review;
    if (mode === 'null') record.review = null;
    if (mode === 'array') record.review = [];
    if (mode === 'empty') record.review = {};
    if (mode === 'missing-revision') delete record.review.sourceRevision;
    if (mode === 'negative-revision') record.review.sourceRevision = -1;
    if (mode === 'future-revision') record.review.sourceRevision = source.revision + 1;
    rejectIncompleteC8Acceptance(source, p.payload, h.context);
  }
});

test('C8 saved review matches recomputed business content while view-event revisions may advance', () => {
  const h = harness(), p = preview(h); h.send('EXPERIMENT_ACCEPT', p.payload);
  const savedRevision = h.state.history.find((entry) => entry.type === 'experiment_acceptance').review.sourceRevision;
  h.send('EVENT_APPEND', { event: { type: 'path_viewed', refs: { pageId: 'action', analysisId: h.state.analysis.id,
    pathId: h.state.selection.pathId, inputVersion: h.state.round.inputVersion } } });
  assert.ok(h.state.revision > savedRevision);
  assert.equal(getAcceptedExperimentRound(h.state, p.payload.feedbackId, p.payload.reviewFingerprint).ok, true);
  assert.equal(h.send('EXPERIMENT_ACCEPT', p.payload).changed, false);
  for (const mode of ['learned-constraint', 'candidate-constraint', 'observation', 'missing-evidence']) {
    const source = clone(h.state);
    const review = source.history.find((entry) => entry.type === 'experiment_acceptance').review;
    if (mode === 'learned-constraint') review.constraintsLearned.push('篡改保存的限制');
    if (mode === 'candidate-constraint') review.nextAction.constraints = [];
    if (mode === 'observation') review.reason = '未经来源支持的实验结论';
    if (mode === 'missing-evidence') delete review.evidence;
    rejectIncompleteC8Acceptance(source, p.payload, h.context);
  }
});

}

// Workspace projections and acceptance regressions; payload built with the merged page's command factory.
import { makeExperimentAcceptanceCommand, describeExperimentReview } from '../pages/action.js';
import { workspaceFeedbackSource, workspaceRounds, workspaceMemory } from '../shared/workspace-view.js';

function acceptancePayloadFor(state, review) {
  return makeExperimentAcceptanceCommand(state, review, 'test-accept-p3').payload;
}

{
function p3Review(draft = {}) {
  const h = harness('juicer_cup_v1');
  analyze(h);
  selectAndSave(h, h.state.analysis.paths.findIndex((path) => path.optionLabel === 'A'));
  const artifact = currentArtifacts(h.state).find((item) => item.kind === 'copy');
  const plan = activeSelection(h.state).path.experiment;
  const payload = makeFeedbackPayload(artifact, {
    adoption: 'adopted', execution: 'done', scope: '只替换详情页首屏文字层', executedAt: '2026-08-28',
    observation: 'unchanged', rawText: '首屏已调整，自述没有明显变化，商品标题不能修改。',
    sampleSize: String(plan.minSample), guardrailStatus: 'clear', constraintsText: '商品标题不能修改', ...draft,
  }, { detailsVersion: FEEDBACK_DETAILS_VERSION });
  h.send('FEEDBACK_SAVE', payload);
  const feedbackId = h.state.feedbackRecords.at(-1).id;
  const result = buildExperimentReviewForC8(h.state, feedbackId);
  assert.equal(result.ok, true, result.message);
  return { h, artifact, review: result.review, feedbackPayload: payload };
}

test('P3 acceptance payload carries exactly four fields and does not mutate the shared review', () => {
  const { h, review } = p3Review();
  const before = structuredClone(review);
  const payload = acceptancePayloadFor(h.state, review);
  assert.deepEqual(payload, { feedbackId: review.sourceFeedbackId, reviewFingerprint: review.fingerprint,
    roundId: review.roundId, inputVersion: review.inputVersion });
  assert.deepEqual(Object.keys(payload).sort(), ['feedbackId', 'inputVersion', 'reviewFingerprint', 'roundId']);
  payload.roundId = 'changed_only_in_projection';
  assert.deepEqual(review, before);
  for (const value of [null, {}, { ...review, decision: 'pause' }, { ...review, nextAction: null },
    { ...review, roundId: 'changed-round' }, { ...review, fingerprint: 'not-a-saved-fingerprint' }]) {
    assert.throws(() => makeExperimentAcceptanceCommand(h.state, value, 'test-accept-p3'));
  }
});

test('P3 conclusion presentation follows shared decisions and never infers success from missing data', () => {
  const { h, review } = p3Review({ execution: 'unknown', sampleSize: '', guardrailStatus: 'unknown' });
  assert.equal(review.decision, 'needs_information');
  assert.equal(review.observation.sampleSize, null);
  assert.equal(review.observation.guardrailStatus, 'unknown');
  assert.throws(() => makeExperimentAcceptanceCommand(h.state, review, 'test-accept-p3'));
  const presentation = describeExperimentReview(review);
  assert.ok(presentation.title.length > 0);
  assert.ok(presentation.treatment.length > 0);
  assert.match(presentation.source, /未调用外部 AI/);
  assert.throws(() => describeExperimentReview(null));
});

test('P3 exact projected payload accepts once, reads a complete round and is safe to retry', () => {
  const { h, review } = p3Review();
  const payload = acceptancePayloadFor(h.state, review);
  const before = structuredClone(h.state);
  assert.equal(h.send('EXPERIMENT_ACCEPT', payload).changed, true);
  const receipt = getAcceptedExperimentRoundForC8(h.state, payload.feedbackId, payload.reviewFingerprint);
  assert.equal(receipt.ok, true, receipt.message);
  assert.equal(receipt.source.sourceRoundId, payload.roundId);
  assert.equal(receipt.source.sourceInputVersion, payload.inputVersion);
  assert.equal(h.state.round.index, 2);
  assert.deepEqual(h.state.executionRecords, before.executionRecords);
  assert.deepEqual(h.state.feedbackRecords, before.feedbackRecords);
  const accepted = structuredClone(h.state);
  assert.equal(h.send('EXPERIMENT_ACCEPT', payload).changed, false);
  assert.deepEqual(h.state, accepted);
  assert.equal(h.state.history.filter((entry) => entry.type === 'experiment_acceptance').length, 1);
});

test('P3 previously displayed payload cannot accept after a newer related feedback record exists', () => {
  const { h, review, feedbackPayload } = p3Review();
  const payload = acceptancePayloadFor(h.state, review);
  h.send('FEEDBACK_SAVE', { ...feedbackPayload, feedbackRecord: {
    ...feedbackPayload.feedbackRecord, observation: 'worse', rawText: '后来发现观察变差，先核对。',
  } });
  const before = structuredClone(h.state);
  assert.throws(() => h.send('EXPERIMENT_ACCEPT', payload), /已有相关反馈|执行自述已更新/);
  assert.deepEqual(h.state, before);
  assert.equal(h.state.round.index, 1);
  assert.equal(getAcceptedExperimentRoundForC8(h.state, payload.feedbackId, payload.reviewFingerprint).ok, false);
});

test('workspace empty session has no invented archive, merchant, materials or business memory', () => {
  const h = harness();
  const before = structuredClone(h.state);
  assert.deepEqual(workspaceRounds(h.state), []);
  const memory = workspaceMemory(h.state);
  assert.equal(memory.merchant, null);
  assert.equal(memory.product, null);
  assert.equal(memory.problem, null);
  assert.equal(memory.materialCount, 0);
  assert.equal(memory.knownFactCount, 0);
  assert.equal(memory.archivedRoundCount, 0);
  assert.equal(memory.synthetic, false);
  assert.deepEqual(h.state, before);
});

test('workspace corrected unknown product does not restore old intake draft or hide synthetic provenance', () => {
  const h = harness('juicer_cup_v1');
  analyze(h);
  const product = findIntakeFieldFact(h.state, 'productName');
  assert.ok(product);
  const oldName = h.state.input.intake.draft.productName;
  assert.equal(workspaceMemory(h.state).product, oldName);
  h.send('FACT_PATCH', { inputVersion: h.state.round.inputVersion,
    fact: { ...product, value: null, availability: 'unknown' }, reason: '商品身份需重新核对，明确改为未知' });
  assert.equal(h.state.fixtureId, null);
  assert.equal(h.state.input.intake.draft.productName, oldName, 'old draft stays as history, not current fact');
  const before = structuredClone(h.state);
  const memory = workspaceMemory(h.state);
  assert.equal(memory.product, null);
  assert.equal(memory.stale, true);
  assert.equal(memory.synthetic, true);
  assert.equal(workspaceRounds(h.state)[0].status, '资料已更新，待重新分析');
  assert.deepEqual(h.state, before);
});

test('workspace feedback on A never labels a later B selection as already having feedback', () => {
  const { h, review } = p3Review();
  assert.equal(workspaceRounds(h.state)[0].status, '反馈已保存');
  const pathB = h.state.analysis.paths.find((path) => path.optionLabel === 'B');
  h.send('PATH_SELECT', { analysisId: h.state.analysis.id, pathId: pathB.id, inputVersion: h.state.round.inputVersion });
  const before = structuredClone(h.state);
  const current = workspaceRounds(h.state).find((entry) => !entry.archived);
  assert.equal(current.path.id, pathB.id);
  assert.equal(current.status, '已选择方案');
  assert.ok(current.feedbacks.some((record) => record.pathId === review.pathId));
  assert.equal(current.feedbacks.some((record) => record.pathId === pathB.id), false);
  assert.equal(current.executions.some((record) => record.pathId === pathB.id), false);
  const feedback = current.feedbacks.find((record) => record.pathId === review.pathId);
  const source = workspaceFeedbackSource(h.state, feedback);
  assert.equal(source.path.id, review.pathId, 'archive labels the original A, never the current B');
  assert.equal(source.artifact.id, feedback.artifactId);
  assert.equal(source.artifact.version, feedback.artifactVersion);
  assert.equal(source.execution.pathId, review.pathId);
  const missingVersion = workspaceFeedbackSource(h.state, { ...feedback, artifactVersion: feedback.artifactVersion + 1 });
  assert.equal(missingVersion.artifact, null, 'never borrow a different saved version');
  assert.equal(missingVersion.execution, null);
  assert.deepEqual(h.state, before);
});

test('workspace real acceptance groups original materials, selection and feedback by their saved round', () => {
  const { h, review } = p3Review();
  const original = structuredClone(h.state);
  const payload = acceptancePayloadFor(h.state, review);
  assert.equal(h.send('EXPERIMENT_ACCEPT', payload).changed, true);
  assert.equal(getAcceptedExperimentRoundForC8(h.state, payload.feedbackId, payload.reviewFingerprint).ok, true);
  const beforeProjection = structuredClone(h.state);
  const rounds = workspaceRounds(h.state);
  assert.deepEqual(rounds.map((entry) => entry.round.index), [2, 1]);
  const [current, archived] = rounds;
  assert.equal(archived.archived, true);
  assert.equal(archived.status, '已归档');
  assert.equal(archived.round.id, original.round.id);
  assert.deepEqual(archived.selection, original.selection);
  assert.deepEqual(archived.input.materials, original.input.materials);
  assert.deepEqual(archived.feedbacks, original.feedbackRecords);
  assert.deepEqual(archived.executions, original.executionRecords);
  assert.equal(archived.path.id, review.pathId);
  assert.equal(workspaceFeedbackSource(h.state, archived.feedbacks[0]).path.id, review.pathId);
  assert.equal(current.archived, false);
  assert.equal(current.path.actionKey, 'juicer_faq');
  assert.notEqual(current.path.id, archived.path.id);
  assert.deepEqual(current.feedbacks, []);
  assert.deepEqual(current.executions, []);
  assert.deepEqual(current.artifacts, []);
  assert.equal(current.status, '已选择方案');
  assert.equal(workspaceMemory(h.state).archivedRoundCount, 1);
  assert.equal(workspaceMemory(h.state).synthetic, true);
  assert.deepEqual(h.state, beforeProjection);

  // Add a real reducer material in R2: it must not appear retroactively in R1's input snapshot.
  h.send('MATERIAL_ADD', {}, { preparedMaterial: {
    name: '第二轮待核对问题.txt', mime: 'text/plain', size: 16, sha256: 'workspace-r2-material', file: null,
  } });
  const updated = workspaceRounds(h.state);
  assert.equal(updated[0].input.materials.length, 1);
  assert.deepEqual(updated[1].input.materials, original.input.materials);
  assert.deepEqual(updated[1].selection, original.selection);
  assert.deepEqual(updated[1].feedbacks, original.feedbackRecords);
  assert.deepEqual(updated[0].feedbacks, []);
  assert.equal(updated[0].path, null, 'new input invalidates selection instead of borrowing the old round path');
});
}

// ===== 以下为队友批次（e38d4cf）MoneyAI 客户端/契约边界测试：依赖 shared/moneyai.js 与 shared/moneyai-contract.js，两者已在合并中保留 =====
const SYNTHETIC_FINGERPRINT = 'sha256:' + 'a'.repeat(64);
function intakeMoneyAI(state, suffix = '1') {
  return { operationId: 'intake_operation_' + suffix, attemptId: 'intake_attempt_' + suffix,
    inputFingerprint: SYNTHETIC_FINGERPRINT, sendScope: ['confirmed_intake'], dataClasses: ['merchant_text'] };
}
function syntheticMoneyAIRequest(operation, payload, scope = {}) {
  return createMoneyAIEnvelope({ operation, operationId: scope.operationId || 'synthetic_operation',
    attemptId: scope.attemptId || 'synthetic_attempt',
    scope: { sessionId: scope.sessionId || 'synthetic_session', roundId: scope.roundId || 'synthetic_round',
      inputVersion: scope.inputVersion || 1, analysisId: scope.analysisId ?? null, pathId: scope.pathId ?? null,
      artifact: scope.artifact ?? null, feedback: scope.feedback ?? null,
      inputFingerprint: scope.inputFingerprint || SYNTHETIC_FINGERPRINT },
    consent: { granted: true, sendScope: scope.sendScope || ['confirmed_facts'],
      dataClasses: scope.dataClasses || ['merchant_text'] }, payload });
}
function syntheticMoneyAIReply(request, result, overrides = {}) {
  return { ok: true, contractVersion: MONEYAI_CONTRACT_VERSION, operation: request.operation,
    operationId: request.operationId, attemptId: request.attemptId,
    scope: structuredClone(request.scope), sentToMoneyAI: true, result, ...overrides };
}

function syntheticMoneyAIStatus(overrides = {}) {
  return { provider: 'moneyai', configured: true, serviceReachable: true, analysisReady: true,
    historyWriteReady: false, historyReadVerified: false, extractionReady: false,
    reason: '合成状态，仅用于客户端边界测试', ...overrides };
}
const moneyAIJsonResponse = (value, ok = true) => ({ ok, json: async () => value });
const analysisPayload = (overrides = {}) => ({ version: 'analysis.request.v1', focus: '合成测试焦点',
  facts: [], constraints: [], unknowns: [], ...overrides });
const analysisRequest = (scope = {}, payload = analysisPayload()) =>
  syntheticMoneyAIRequest(MONEYAI_OPERATIONS.analysis, payload, scope);

test('MoneyAI status rejects malformed flags and exposes only validated status fields', async () => {
  for (const value of [null, [], {}, syntheticMoneyAIStatus({ serviceReachable: 'false' }),
    syntheticMoneyAIStatus({ analysisReady: 1 }), syntheticMoneyAIStatus({ configured: false })]) {
    const result = await getMoneyAIStatus({ fetchImpl: async () => moneyAIJsonResponse(value) });
    assert.equal(result.ok, false);
    assert.equal(result.status, undefined);
  }
  const expected = syntheticMoneyAIStatus({ analysisReady: false });
  const result = await getMoneyAIStatus({ fetchImpl: async (_url, options) => {
    assert.equal(options.redirect, 'error');
    return moneyAIJsonResponse({ ...expected, unrelatedPersonalData: 'must not be forwarded' });
  } });
  assert.equal(result.ok, true);
  assert.deepEqual(result.status, expected);
});

test('MoneyAI analysis needs explicit send consent and readiness without posting a draft', async () => {
  let calls = [];
  const fetchImpl = async (url, options) => { calls.push({ url, options });
    return moneyAIJsonResponse(syntheticMoneyAIStatus({ analysisReady: false })); };
  const request = analysisRequest();
  const denied = await requestMoneyAIAnalysis(request, { fetchImpl });
  assert.equal(denied.code, 'external_consent_required');
  assert.equal(denied.sentToMoneyAI, false);
  assert.equal(calls.length, 0);
  const unready = await requestMoneyAIAnalysis(request, { fetchImpl, consentToExternalProcessing: true });
  assert.equal(unready.code, 'analysis_unavailable');
  assert.equal(unready.sentToMoneyAI, false);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.body, undefined);
});

test('MoneyAI transport rejects implicit conversions and oversized JSON without reading getters', async () => {
  let reads = 0, calls = 0;
  const getter = Object.defineProperty({}, 'summary', { enumerable: true, get() { reads++; return 'private'; } });
  const cyclic = {}; cyclic.self = cyclic;
  for (const request of [getter, cyclic, { value: NaN }, { value: undefined }, { value: 1n },
    { when: new Date() }, { value: new Blob(['synthetic']) }, { sparse: [, 1] },
    { toJSON() { reads++; return {}; } }, { summary: '字'.repeat(90000) }]) {
    const result = await requestMoneyAIAnalysis(request, { consentToExternalProcessing: true,
      fetchImpl: async () => { calls++; throw new Error('must not fetch'); } });
    assert.equal(result.code, 'invalid_payload');
    assert.equal(result.sentToMoneyAI, false);
  }
  assert.equal(reads, 0);
  assert.equal(calls, 0);
});

test('MoneyAI analysis freezes request bytes before capability lookup and preserves a no-send receipt', async () => {
  const request = analysisRequest({}, analysisPayload({ focus: '确认的合成摘要' }));
  const expected = JSON.stringify(request);
  let posted;
  const result = await requestMoneyAIAnalysis(request, { consentToExternalProcessing: true,
    fetchImpl: async (url, options) => {
      assert.equal(options.redirect, 'error');
      if (url.endsWith('/status')) {
        request.scope.inputVersion = 2; request.payload.focus = '晚到修改不得混入旧请求';
        return moneyAIJsonResponse(syntheticMoneyAIStatus());
      }
      posted = options.body;
      const sent = JSON.parse(options.body);
      return moneyAIJsonResponse(syntheticMoneyAIReply(sent, {}, {
        ok: false, code: 'moneyai_project_session_required', sentToMoneyAI: false }), false);
    } });
  assert.equal(posted, expected);
  assert.equal(result.ok, false);
  assert.equal(result.sentToMoneyAI, false);
});

test('MoneyAI HTTP failure or unvalidated success cannot become a usable analysis', async () => {
  for (const [reply, code, sent] of [
    [(request) => moneyAIJsonResponse(syntheticMoneyAIReply(request, {}, {
      ok: false, code: 'analysis_failed', sentToMoneyAI: false }), false), 'analysis_failed', false],
    [(request) => moneyAIJsonResponse(syntheticMoneyAIReply(request, { analysis: { fake: true } })), 'invalid_analysis', true],
    [() => { throw new Error('lost response'); }, 'backend_unavailable', null],
    [() => ({ ok: true, json: async () => { throw new Error('broken JSON'); } }), 'backend_unavailable', null]
  ]) {
    const request = analysisRequest();
    const result = await requestMoneyAIAnalysis(request, { consentToExternalProcessing: true,
      fetchImpl: async (url) => url.endsWith('/status') ? moneyAIJsonResponse(syntheticMoneyAIStatus()) : reply(request) });
    assert.equal(result.ok, false);
    assert.equal(result.code, code);
    assert.equal(result.sentToMoneyAI, sent);
    assert.equal(result.analysis, undefined);
  }
});

test('MoneyAI cancellation and timeout distinguish never posted from an uncertain send', async () => {
  const stopped = new AbortController(); stopped.abort();
  const cancelled = await requestMoneyAIAnalysis(analysisRequest(), { signal: stopped.signal,
    consentToExternalProcessing: true, fetchImpl: async () => { throw new Error('must not fetch'); } });
  assert.equal(cancelled.code, 'cancelled');
  assert.equal(cancelled.sentToMoneyAI, false);
  for (const waitAt of ['status', 'analysis']) {
    const result = await requestMoneyAIAnalysis(analysisRequest(), { timeoutMs: 5, consentToExternalProcessing: true,
      fetchImpl: async (url, options) => {
        if (!url.endsWith('/' + waitAt)) return moneyAIJsonResponse(syntheticMoneyAIStatus());
        return new Promise((_resolve, reject) => {
          if (options.signal.aborted) reject(new Error('aborted'));
          else options.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
        });
      } });
    assert.equal(result.code, 'timeout');
    assert.equal(result.sentToMoneyAI, waitAt === 'status' ? false : null);
  }
});

test('luya MoneyAI envelope fingerprints bounded JSON and decision/history use separate verified receipts', async () => {
  const fingerprint = await computeMoneyAIInputFingerprint({ roundId: 'synthetic_round', facts: [] });
  assert.match(fingerprint, /^sha256:[a-f0-9]{64}$/);
  const decision = syntheticMoneyAIRequest(MONEYAI_OPERATIONS.decisionWrite,
    { version: 'decision.record.v1', record: { localRecordId: 'record_1', execution: 'unknown' } },
    { inputFingerprint: fingerprint, sendScope: ['decision_record'], dataClasses: ['decision_record'] });
  const decisionResult = await requestMoneyAIDecisionWrite(decision, { consentToExternalProcessing: true,
    fetchImpl: async (url, options) => {
      if (url.endsWith('/status')) return moneyAIJsonResponse(syntheticMoneyAIStatus({ historyWriteReady: true }));
      assert.equal(url, '/api/moneyai/decisions');
      const sent = JSON.parse(options.body);
      return moneyAIJsonResponse(syntheticMoneyAIReply(sent, { writeReceipt: {
        recordId: 'moneyai_record_1', recordKey: 'moneyai:moneyai_record_1', providerRecordId: 'provider_1',
        operationId: sent.operationId, contentHash: 'sha256:' + 'b'.repeat(64),
        writtenAt: '2026-08-29T03:00:00.000Z', readBackVerified: true } }));
    } });
  assert.equal(decisionResult.ok, true);
  assert.equal(decisionResult.writeReceipt.recordId, 'moneyai_record_1');

  const history = syntheticMoneyAIRequest(MONEYAI_OPERATIONS.historyRead,
    { version: 'history.query.v1', query: { limit: 20, cursor: null, recordIds: ['moneyai_record_1'] } },
    { inputFingerprint: fingerprint, sendScope: ['history_query'], dataClasses: ['decision_record'] });
  const historyResult = await requestMoneyAIHistoryRead(history, { consentToExternalProcessing: true,
    fetchImpl: async (url, options) => {
      if (url.endsWith('/status')) return moneyAIJsonResponse(syntheticMoneyAIStatus({ historyReadVerified: true }));
      assert.equal(url, '/api/moneyai/history/read');
      const sent = JSON.parse(options.body);
      return moneyAIJsonResponse(syntheticMoneyAIReply(sent,
        { records: [{ recordId: 'moneyai_record_1' }], readReceipt: { count: 1 } }));
    } });
  assert.equal(historyResult.ok, true);
  assert.deepEqual(historyResult.records, [{ recordId: 'moneyai_record_1' }]);
});

test('a verified MoneyAI real_model draft is isolated from local modes and remains reducer-valid', async () => {
  const h = harness('juicer_cup_v1');
  h.send('FOCUS_CONFIRM', { inputVersion: h.state.round.inputVersion });
  const local = buildDemoAnalysis(h.state).analysis;
  const { processing: _processing, ...base } = local;
  const draft = { ...base, mode: 'real_model', analysisSource: 'moneyai',
    paths: base.paths.map(({ actionKey: _actionKey, ...path }) => path) };
  const request = analysisRequest({ sessionId: h.state.sessionId, roundId: h.state.round.id,
    inputVersion: h.state.round.inputVersion, operationId: 'real_analysis_1', attemptId: 'real_attempt_1' },
  analysisPayload({ focus: h.state.input.focus || '核对当前问题', facts: h.state.input.facts,
    constraints: h.state.input.constraints, unknowns: h.state.input.unknowns }));
  const result = await requestMoneyAIAnalysis(request, { state: h.state, consentToExternalProcessing: true,
    fetchImpl: async (url, options) => {
      if (url.endsWith('/status')) return moneyAIJsonResponse(syntheticMoneyAIStatus());
      const sent = JSON.parse(options.body);
      return moneyAIJsonResponse(syntheticMoneyAIReply(sent, { analysis: draft }));
    } });
  assert.equal(result.ok, true);
  assert.equal(result.analysis.mode, 'real_model');
  assert.equal(result.analysis.providerReceipt.operationId, 'real_analysis_1');
  assert.doesNotThrow(() => h.send('ANALYSIS_SET', { analysis: result.analysis }));
  assert.equal(h.state.analysis.mode, 'real_model');
  const forged = structuredClone(result.analysis);
  forged.providerReceipt.sessionId = 'another_session';
  assert.throws(() => h.send('ANALYSIS_SET', { analysis: forged }), { code: 'invalid_structure' });
});
