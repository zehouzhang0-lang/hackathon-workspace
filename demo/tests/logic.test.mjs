import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createEmptyState, normalizeSessionState, reduceCommand, validSourceId } from '../shared/model.js';
import { buildDemoAnalysis, buildDemoArtifact } from '../shared/demo-data.js';
import { registerGuard, resolveDrafts } from '../shared/draft-guards.js';
import { parseMetricText, readSupportedMaterial, buildOrganization, isSubmitKey,
  getIntakeCorrectionConflicts, editIntakeField, isIntakeCorrectionSnapshotCurrent } from '../pages/intake.js';
import { activeSelection, currentArtifacts, selectPreviewArtifact, artifactPreviewText, makeFeedbackPayload, buildActionPack, describeActionSource } from '../pages/action.js';
import { buildPathReport } from '../pages/report.js';
import { getFoldTitlePlan, enhanceFoldTitle } from '../shared/title-motion.js';
import { createMerchantIntakeDraft, validateMerchantIntakeDraft, mapConfirmedIntakeToAnalysisInput, findIntakeFieldFact } from '../shared/intake-draft.js';
import { requestIntakeExtraction } from '../shared/intake-extraction.js';
import { getMoneyAIStatus, requestMoneyAIAnalysis } from '../shared/moneyai.js';

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

test('three seeds start without analysis, selection, execution or future feedback', () => {
  for (const fixtureId of ['underbed_complete_v1', 'one_sentence_v1', 'scope_conflict_v1']) {
    const h = harness(fixtureId);
    assert.equal(h.state.analysis, null);
    assert.equal(h.state.selection, null);
    assert.deepEqual(h.state.executionRecords, []);
    assert.deepEqual(h.state.feedbackRecords, []);
    assert.equal(h.state.input.confirmedVersion, null);
    assert.equal(h.state.round.clarification.status, 'unused');
  }
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

test('unready or unapproved extraction preserves the editable draft and never POSTs the transcript', async () => {
  const h = harness('one_sentence_v1');
  const draft = createMerchantIntakeDraft({ sources: ['voice'], transcript: '要保留的语音原文', productName: '用户已填的商品' });
  const request = { state: h.state, draft, transcript: draft.transcript, description: '编辑文字', sources: draft.sources };
  const calls = [];
  const fetchImpl = async (url, options) => { calls.push({ url, options }); return { ok: true, json: async () => ({ extractionReady: false }) }; };
  const result = await requestIntakeExtraction(request, { fetchImpl });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'intake_unavailable');
  assert.equal(result.sentToMoneyAI, false);
  assert.deepEqual(result.draft, draft);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, '/api/moneyai/status');
  assert.equal(calls[0].options.body, undefined);
  const withoutConsent = await requestIntakeExtraction(request, { fetchImpl: async () => ({ ok: true, json: async () => ({ extractionReady: true }) }) });
  assert.equal(withoutConsent.code, 'external_consent_required');
  assert.equal(withoutConsent.sentToMoneyAI, false);
});

test('a lost extraction response is not called unsent, and invalid output never replaces the draft', async () => {
  const h = harness('one_sentence_v1');
  const draft = createMerchantIntakeDraft({ sources: ['manual'], transcript: '原文保持' });
  const request = { state: h.state, draft, transcript: draft.transcript, description: '可编辑内容', sources: draft.sources };
  const status = { ok: true, json: async () => ({ extractionReady: true }) };
  const lost = await requestIntakeExtraction(request, { consentToExternalProcessing: true,
    fetchImpl: async (url) => { if (url.endsWith('/status')) return status; throw new Error('lost-response'); } });
  assert.equal(lost.sentToMoneyAI, null);
  assert.deepEqual(lost.draft, draft);
  const invalid = await requestIntakeExtraction(request, { consentToExternalProcessing: true,
    fetchImpl: async (url) => url.endsWith('/status') ? status : { ok: true, json: async () => ({ ok: true, draft: { ...draft, price: 9 }, sentToMoneyAI: true, mode: 'moneyai' }) } });
  assert.equal(invalid.code, 'invalid_response');
  assert.deepEqual(invalid.draft, draft);
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

test('extraction response file sources must be in this request, not merely in the saved session', async () => {
  const h = harness('one_sentence_v1');
  for (const name of ['a.json', 'b.json']) h.send('MATERIAL_ADD', {}, { preparedMaterial: {
    name, mime: 'application/json', size: 20, sha256: 'unique_' + name, file: null } });
  const [a, b] = h.state.input.materials;
  const draft = createMerchantIntakeDraft({ sources: ['json'] });
  const request = { state: h.state, draft, transcript: '', description: '只整理A', sources: draft.sources,
    materials: [{ materialId: a.id, materialVersion: a.version, mime: a.mime, text: '{"metrics":[]}' }] };
  const answer = (material) => ({ ok: true, mode: 'moneyai', sentToMoneyAI: true,
    roundId: h.state.round.id, inputVersion: h.state.round.inputVersion,
    draft: { ...draft, metrics: { ...draft.metrics, paidOrders: 0 } },
    sourceBindings: [{ field: 'metrics.paidOrders', source: 'json', materialId: material.id,
      materialVersion: material.version, locator: { type: 'json', pointer: '/metrics/0/value' } }] });
  const simulate = (material) => async (url) => ({ ok: true, json: async () =>
    url.endsWith('/status') ? { extractionReady: true } : answer(material) });
  const rejected = await requestIntakeExtraction(request, { consentToExternalProcessing: true, fetchImpl: simulate(b) });
  assert.equal(rejected.ok, false);
  assert.equal(rejected.code, 'invalid_response');
  assert.deepEqual(rejected.draft, draft);
  assert.equal(rejected.sentToMoneyAI, true);
  const accepted = await requestIntakeExtraction(request, { consentToExternalProcessing: true, fetchImpl: simulate(a) });
  assert.equal(accepted.ok, true);
  assert.equal(accepted.draft.metrics.paidOrders, 0);
});

function syntheticMoneyAIStatus(overrides = {}) {
  return { provider: 'moneyai', configured: true, serviceReachable: true, analysisReady: true,
    historyWriteReady: false, historyReadVerified: false, extractionReady: false,
    reason: '合成状态，仅用于客户端边界测试', ...overrides };
}
const jsonResponse = (value, ok = true) => ({ ok, json: async () => value });

test('MoneyAI status rejects malformed flags and exposes only validated status fields', async () => {
  for (const value of [null, [], {}, syntheticMoneyAIStatus({ serviceReachable: 'false' }),
    syntheticMoneyAIStatus({ analysisReady: 1 }), syntheticMoneyAIStatus({ configured: false })]) {
    const result = await getMoneyAIStatus({ fetchImpl: async () => jsonResponse(value) });
    assert.equal(result.ok, false);
    assert.equal(result.status, undefined);
  }
  const expected = syntheticMoneyAIStatus({ analysisReady: false });
  const result = await getMoneyAIStatus({ fetchImpl: async (_url, options) => {
    assert.equal(options.redirect, 'error');
    return jsonResponse({ ...expected, unrelatedPersonalData: 'must not be forwarded' });
  } });
  assert.equal(result.ok, true);
  assert.deepEqual(result.status, expected);
});

test('MoneyAI analysis needs explicit send consent and readiness without posting a draft', async () => {
  let calls = [];
  const fetchImpl = async (url, options) => { calls.push({ url, options });
    return jsonResponse(syntheticMoneyAIStatus({ analysisReady: false })); };
  const request = { summary: '合成且尚未同意发送的摘要' };
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
  const request = { roundId: 'synthetic_round', inputVersion: 1, summary: '确认的合成摘要' };
  const expected = JSON.stringify(request);
  let posted;
  const result = await requestMoneyAIAnalysis(request, { consentToExternalProcessing: true,
    fetchImpl: async (url, options) => {
      assert.equal(options.redirect, 'error');
      if (url.endsWith('/status')) {
        request.inputVersion = 2; request.summary = '晚到修改不得混入旧请求';
        return jsonResponse(syntheticMoneyAIStatus());
      }
      posted = options.body;
      return jsonResponse({ ok: false, code: 'moneyai_project_session_required', sentToMoneyAI: false }, false);
    } });
  assert.equal(posted, expected);
  assert.equal(result.ok, false);
  assert.equal(result.sentToMoneyAI, false);
});

test('MoneyAI HTTP failure or unvalidated success cannot become a usable analysis', async () => {
  for (const [reply, code, sent] of [
    [() => jsonResponse({ ok: true, sentToMoneyAI: true, analysis: { fake: true } }, false), 'analysis_failed', true],
    [() => jsonResponse({ ok: true, sentToMoneyAI: true, analysis: { fake: true } }), 'analysis_validation_unavailable', true],
    [() => { throw new Error('lost response'); }, 'backend_unavailable', null],
    [() => ({ ok: true, json: async () => { throw new Error('broken JSON'); } }), 'backend_unavailable', null]
  ]) {
    const result = await requestMoneyAIAnalysis({ synthetic: true }, { consentToExternalProcessing: true,
      fetchImpl: async (url) => url.endsWith('/status') ? jsonResponse(syntheticMoneyAIStatus()) : reply() });
    assert.equal(result.ok, false);
    assert.equal(result.code, code);
    assert.equal(result.sentToMoneyAI, sent);
    assert.equal(result.analysis, undefined);
  }
});

test('MoneyAI cancellation and timeout distinguish never posted from an uncertain send', async () => {
  const stopped = new AbortController(); stopped.abort();
  const cancelled = await requestMoneyAIAnalysis({ synthetic: true }, { signal: stopped.signal,
    consentToExternalProcessing: true, fetchImpl: async () => { throw new Error('must not fetch'); } });
  assert.equal(cancelled.code, 'cancelled');
  assert.equal(cancelled.sentToMoneyAI, false);
  for (const waitAt of ['status', 'analysis']) {
    const result = await requestMoneyAIAnalysis({ synthetic: true }, { timeoutMs: 5, consentToExternalProcessing: true,
      fetchImpl: async (url, options) => {
        if (!url.endsWith('/' + waitAt)) return jsonResponse(syntheticMoneyAIStatus());
        return new Promise((_resolve, reject) => {
          if (options.signal.aborted) reject(new Error('aborted'));
          else options.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
        });
      } });
    assert.equal(result.code, 'timeout');
    assert.equal(result.sentToMoneyAI, waitAt === 'status' ? false : null);
  }
});
