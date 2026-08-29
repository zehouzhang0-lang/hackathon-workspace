import { prepareExperimentAcceptance, carryExperimentInput, buildAcceptedExperimentAnalysis, makeExperimentAcceptanceRecord, matchesAcceptedExperimentPayload, isAcceptedExperimentAnalysis } from './experiment-round.js';
export { getAcceptedExperimentRound, matchesAcceptedExperimentPayload } from './experiment-round.js';
import { makeFixtureInput, makeFixtureIntake } from './seeds.js';
import { buildFunnelSnapshot, latestAnalysisReview, analysisReviewPolicy, applyAnalysisReviewPolicy, juicerProductFacts, buildDemoBreakpoint, buildDemoDataQuality } from './analysis-evidence.js';
import { mapConfirmedIntakeToAnalysisInput, validateMerchantIntakeDraft, intakeReferencesFact } from './intake-draft.js';
import { ROADSHOW_SHOE_FIXTURE_ID, matchesRoadshowShoeQuestion, hasRoadshowShoeFixtureCore } from './roadshow-shoe-fixture.js';

export const CONTRACT_VERSION = 'demo.v1';
export const FEEDBACK_DETAILS_VERSION = 1;
export const MONEYAI_ANALYSIS_CONTRACT_VERSION = 'luya.moneyai.v1';
export const ID_PATTERN = /^[A-Za-z0-9_-]{1,80}$/;
export const PAGE_IDS = ['intake', 'decisions', 'action'];
export const MATERIAL_LIMITS = Object.freeze({ maxFiles: 6, maxFileBytes: 10_000_000, maxTotalBytes: 20 * 1024 * 1024 });
export const MATERIAL_CATEGORIES = Object.freeze(['unknown', 'content', 'product', 'transactions', 'ads']);
export const MATERIAL_CAPABILITIES = Object.freeze(Object.fromEntries([
  ['png', 'image/png', true, 'image', 'none', '图片可接收和预览；未进行OCR，内容仍待核对。'],
  ['jpg', 'image/jpeg', true, 'image', 'none', '图片可接收和预览；未进行OCR，内容仍待核对。'],
  ['jpeg', 'image/jpeg', true, 'image', 'none', '图片可接收和预览；未进行OCR，内容仍待核对。'],
  ['webp', 'image/webp', true, 'image', 'none', '保留WebP接收预览兼容；未进行OCR。'],
  ['txt', 'text/plain', true, 'text', 'explicit_text', '读取UTF-8原文，并仅从明确标签和值提取可定位字段；其余内容保持未知。'],
  ['csv', 'text/csv', true, 'text', 'metric_csv', '仅支持UTF-8约定指标表头；其他结构保留原文待核对。'],
  ['json', 'application/json', true, 'text', 'metric_json', '仅支持UTF-8的demo.metrics.v1结构；不执行导入内容。'],
  ['xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', true, null, 'table_xlsx', 'Excel原件可接收并在本机寻找可信表头、解析已知经营指标列；无法识别的列保留待核对。'],
  ['xls', 'application/vnd.ms-excel', true, null, 'none', 'XLS旧格式仅接收保存；解析未支持，请另存为XLSX或导出UTF-8 CSV后再上传以自动读取指标。']
].map(([extension, mime, receive, preview, parse, reason]) => [extension, Object.freeze({ extension, mime, receive, preview, parse, reason })])));

// Declared capability only: dispatch still checks bytes, MIME, quota and decoding.
export function getMaterialCapability(fileName) {
  const extension = typeof fileName === 'string' ? /\.([^.]+)$/.exec(fileName.toLowerCase())?.[1] : null;
  return Object.prototype.hasOwnProperty.call(MATERIAL_CAPABILITIES, extension) ? MATERIAL_CAPABILITIES[extension] : null;
}

const clone = (value) => structuredClone(value);
const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const allowedEvents = new Set(['page_viewed', 'path_viewed', 'source_viewed', 'artifact_viewed', 'copy_succeeded', 'download_requested', 'session_read']);
const refKeys = new Set(['pageId', 'questionId', 'analysisId', 'pathId', 'inputVersion', 'artifactId', 'artifactVersion', 'materialId', 'sourceId', 'executionRecordId', 'feedbackId', 'stateRevision', 'exportId', 'format']);
const refFields = new Set(['id', 'rootId', 'from', 'to', 'visitorAssumptionId', 'rateAssumptionId', 'sourceFactIds', 'factIds', 'assumptionIds', 'questionId', 'factId']);
const branches = ['not_executed', 'insufficient_evidence', 'risk_triggered', 'comparable_positive', 'comparable_unchanged', 'comparable_negative'];

export function fail(code, message) {
  throw Object.assign(new Error(message), { code });
}
export function requireValue(condition, message, code = 'invalid_payload') {
  if (!condition) fail(code, message);
}
export function stable(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']';
  return '{' + Object.keys(value).sort().map((key) => JSON.stringify(key) + ':' + stable(value[key])).join(',') + '}';
}
function jsonSafe(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number') return requireValue(Number.isFinite(value), '数字必须是有限值。');
  requireValue(typeof value === 'object' && !ArrayBuffer.isView(value) && !(value instanceof Date), '状态只能包含JSON值。');
  for (const entry of Object.values(value)) jsonSafe(entry);
}
const nonempty = (value) => typeof value === 'string' && value.trim().length > 0;
function validId(value) { requireValue(typeof value === 'string' && ID_PATTERN.test(value), '引用标识不合法。', 'invalid_structure'); }
function uniqueIds(items) {
  const ids = new Set();
  for (const item of items) {
    validId(item.id);
    requireValue(!ids.has(item.id), '存在重复标识。', 'invalid_structure');
    ids.add(item.id);
  }
  return ids;
}
function semantic(value) {
  if (Array.isArray(value)) return value.map(semantic).sort((a, b) => stable(a).localeCompare(stable(b)));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'id').map(([key, entry]) => [key, semantic(entry)]));
  }
  return value;
}
const same = (left, right) => stable(left) === stable(right);
const blankQuestion = () => ({ status: 'unused', questionId: null, questionText: null, sourceFactIds: [], askedAt: null, answeredAt: null, answer: null });
const blankClarification = () => ({ limit: 3, questions: [], activeQuestionId: null, remaining: 3, ...blankQuestion() });

// A read-only, lossless view of the original one-question record. Persist only
// with the next successful business write; loading must not create a save event.
export function normalizeClarification(value) {
  requireValue(value && typeof value === 'object' && !Array.isArray(value), '补问历史结构不完整，未覆盖原记录。', 'incompatible_version');
  let questions;
  if (own(value, 'questions')) {
    requireValue(Array.isArray(value.questions), '补问历史不是列表。', 'incompatible_version');
    questions = clone(value.questions);
  } else {
    requireValue(['unused', 'asked', 'answered', 'skipped'].includes(value.status), '旧补问状态无法迁移。', 'incompatible_version');
    questions = value.status === 'unused' ? [] : [Object.fromEntries(Object.keys(blankQuestion()).map((key) => [key, clone(value[key] ?? blankQuestion()[key])]))];
  }
  requireValue(questions.length <= 3, '本轮补问记录超过三项，未截断原历史。', 'incompatible_version');
  const ids = new Set();
  for (const question of questions) {
    requireValue(question && ['asked', 'answered', 'skipped'].includes(question.status), '补问记录状态无效。', 'incompatible_version');
    validId(question.questionId);
    requireValue(!ids.has(question.questionId), '补问历史包含重复标识。', 'incompatible_version');
    ids.add(question.questionId);
    requireValue(nonempty(question.questionText) && question.questionText.length <= 2000 && Array.isArray(question.sourceFactIds), '补问正文或来源结构无效。', 'incompatible_version');
    question.sourceFactIds.forEach(validId);
    if (question.status === 'answered') {
      requireValue(['known', 'unknown'].includes(question.answer?.availability)
        && (question.answer.rawText === null || typeof question.answer.rawText === 'string')
        && (question.answer.availability !== 'known' || nonempty(question.answer.rawText)), '已存答案结构无效。', 'incompatible_version');
    } else requireValue(question.answer === null, '未回答的问题不能持有答案。', 'incompatible_version');
  }
  const active = questions.filter((question) => question.status === 'asked');
  requireValue(active.length <= 1, '同轮存在多个未完成补问，未自动丢弃。', 'incompatible_version');
  const current = active[0] || questions.at(-1) || blankQuestion();
  return { limit: 3, questions, activeQuestionId: active[0]?.questionId ?? null, remaining: 3 - questions.length,
    ...Object.fromEntries(Object.keys(blankQuestion()).map((key) => [key, clone(current[key] ?? blankQuestion()[key])])) };
}

export function normalizeSessionState(original) {
  assertState(original);
  const state = clone(original);
  state.round.clarification = normalizeClarification(state.round.clarification);
  state.input.intake ??= null;
  return state;
}

export function createEmptyState(context) {
  return {
    contractVersion: CONTRACT_VERSION, sessionId: context.newId(), fixtureId: null, revision: 0, savedAt: null,
    round: { id: context.newId(), index: 1, inputVersion: 1, clarification: blankClarification() },
    input: { description: '', focus: null, confirmedVersion: null, materials: [], facts: [], constraints: [], unknowns: [], intake: null },
    analysis: null, selection: null, artifacts: [], executionRecords: [], feedbackRecords: [], history: [], events: []
  };
}

export function assertState(state) {
  requireValue(state?.contractVersion === CONTRACT_VERSION, '本地记录版本不兼容，未覆盖原记录。', 'incompatible_version');
  requireValue(state.round && state.input && Number.isInteger(state.revision), '本地记录结构不完整。', 'incompatible_version');
  for (const key of ['artifacts', 'executionRecords', 'feedbackRecords', 'history', 'events']) {
    requireValue(Array.isArray(state[key]), '本地记录结构不完整。', 'incompatible_version');
  }
  jsonSafe(state);
}

function sourceSignature(fact) {
  return stable([fact.key, fact.source?.materialId, fact.source?.materialVersion, fact.source?.locator]);
}
function mapDrafts(value, context, reuse = new Map()) {
  const mapping = new Map(reuse);
  const seen = new Set();
  function collect(entry) {
    if (!entry || typeof entry !== 'object') return;
    if (Array.isArray(entry)) return entry.forEach(collect);
    if (typeof entry.id === 'string' && entry.id.startsWith('draft_')) {
      requireValue(!seen.has(entry.id), '草稿局部标识重复。', 'invalid_structure');
      seen.add(entry.id);
      if (!mapping.has(entry.id)) mapping.set(entry.id, context.newId());
    }
    Object.values(entry).forEach(collect);
  }
  collect(value);
  function visit(entry, field = '') {
    if (Array.isArray(entry)) return entry.map((child) => visit(child, field));
    if (entry && typeof entry === 'object') return Object.fromEntries(Object.entries(entry).map(([key, child]) => [key, visit(child, key)]));
    if (field === 'id' && entry === null) return context.newId();
    if (typeof entry === 'string' && refFields.has(field) && entry.startsWith('draft_')) {
      requireValue(mapping.has(entry), '草稿引用没有目标。', 'invalid_structure');
      return mapping.get(entry);
    }
    if (field === 'sourceId' && typeof entry === 'string' && entry.startsWith('fact:draft_')) {
      const id = entry.slice(5);
      requireValue(mapping.has(id), '草稿来源没有目标。', 'invalid_structure');
      return 'fact:' + mapping.get(id);
    }
    return entry;
  }
  return visit(value);
}

function normalizeFact(fact, context) {
  const next = clone(fact);
  if (!next.id) next.id = context.newId();
  validId(next.id);
  requireValue(nonempty(next.key), '事实缺少字段名。');
  requireValue(['known', 'unknown', 'not_applicable'].includes(next.availability), '事实必须区分已知和未知。');
  if (next.availability !== 'known') next.value = null;
  requireValue(next.availability !== 'known' || next.value !== null, '已知事实不能没有值。');
  requireValue(next.source && ['merchant_statement', 'file_extract', 'derived', 'public_reference', 'scenario_assumption'].includes(next.source.kind), '事实缺少可核对来源。');
  next.unit ??= null;
  next.subject ??= null;
  next.window ??= { start: null, end: null };
  next.channel ??= null;
  next.cohort ??= null;
  next.source.materialId ??= null;
  next.source.materialVersion ??= null;
  next.source.locator ??= null;
  next.source.note ??= '';
  next.verification ??= 'unreviewed';
  requireValue(['unreviewed', 'user_corrected', 'checked', 'conflicting'].includes(next.verification), '事实核对状态不合法。');
  jsonSafe(next);
  return next;
}
function prepareProjection(payload, state, context, explicitIntake = false, correctedFactIds = new Set()) {
  const reuse = new Map();
  function previousFact(fact) {
    // Different file facts can share an intake locator after explicit edits.
    // A stored identity must win before any source-based reuse fallback.
    const direct = state.input.facts.find((item) => item.id === fact.id) ||
      state.input.facts.find((item) => sourceSignature(item) === sourceSignature(fact));
    if (direct) return direct;
    const correction = [...state.history].reverse().find((item) => item.type === 'fact_correction' && item.before && sourceSignature(item.before) === sourceSignature(fact));
    return correction ? state.input.facts.find((item) => item.id === correction.factId && item.verification === 'user_corrected') : undefined;
  }
  for (const fact of payload.facts || []) {
    const previous = previousFact(fact);
    if (previous && typeof fact.id === 'string' && fact.id.startsWith('draft_')) reuse.set(fact.id, previous.id);
  }
  const projected = mapDrafts(payload, context, reuse);
  projected.facts = (projected.facts || []).map((fact) => {
    const previous = previousFact(fact);
    if (previous?.verification === 'user_corrected' && !(explicitIntake && (fact.intakeField || correctedFactIds.has(fact.id)))) return clone(previous);
    if (previous) fact.id = previous.id;
    return normalizeFact(fact, context);
  });
  uniqueIds(projected.facts);
  return projected;
}
function removeFactsAndDependents(state, ids, context, materialIds = []) {
  const removed = new Set(ids);
  let expanded = true;
  while (expanded) {
    expanded = false;
    for (const fact of state.input.facts) {
      const references = [...(fact.source?.sourceFactIds || []), ...(fact.sourceFactIds || [])];
      if (!removed.has(fact.id) && references.some((id) => removed.has(id))) {
        removed.add(fact.id); expanded = true;
      }
    }
  }
  const oldFacts = state.input.facts.filter((fact) => removed.has(fact.id));
  if (oldFacts.length) state.history.push({ type: 'facts_invalidated', at: context.now, facts: clone(oldFacts) });
  state.input.facts = state.input.facts.filter((fact) => !removed.has(fact.id));
  state.input.constraints = state.input.constraints.filter((entry) => !(entry.sourceFactIds || []).some((id) => removed.has(id)));
  state.input.unknowns = state.input.unknowns.filter((entry) => !removed.has((entry.sourceId || '').replace(/^fact:/, '')) && !materialIds.some((id) => entry.sourceId === 'material:' + id));
}
// Keep external provenance, but never carry an old calculated value across changed inputs.
function invalidateInputDependents(projected, state, context, reason = 'intake_dependency_changed') {
  const oldFacts = new Map(state.input.facts.map((fact) => [fact.id, fact]));
  const currentFacts = new Map(projected.facts.map((fact) => [fact.id, fact]));
  const roots = new Set(state.input.facts.filter((fact) => !currentFacts.has(fact.id)
    || !same(fact, currentFacts.get(fact.id))).map((fact) => fact.id));
  if (!roots.size) return;
  const affected = new Set(roots), invalid = new Set();
  let expanded = true;
  while (expanded) {
    expanded = false;
    for (const fact of projected.facts) {
      const refs = [...(fact.source?.sourceFactIds || []), ...(fact.sourceFactIds || [])];
      if (!affected.has(fact.id) && refs.some((id) => affected.has(id))) {
        invalid.add(fact.id); affected.add(fact.id); expanded = true;
      }
    }
  }
  const previousConstraints = new Map(state.input.constraints.map((entry) => [entry.id, entry]));
  const invalidConstraints = projected.constraints.filter((entry) => same(entry, previousConstraints.get(entry.id))
    && (entry.sourceFactIds || []).some((id) => affected.has(id)));
  if (!invalid.size && !invalidConstraints.length) return;
  state.history.push({ type: 'facts_invalidated', at: context.now,
    reason, facts: [...invalid].map((id) => clone(oldFacts.get(id) || currentFacts.get(id))),
    constraints: clone(invalidConstraints) });
  projected.facts = projected.facts.map((fact) => !invalid.has(fact.id) ? fact : {
    ...fact, value: null, availability: 'unknown', evidenceStatus: 'unknown', verification: 'unreviewed',
    source: { ...fact.source, note: '依赖的输入已变化，旧推导值不可沿用；来源保留，等待重新核对或计算。' }
  });
  const invalidConstraintIds = new Set(invalidConstraints.map((entry) => entry.id));
  projected.constraints = projected.constraints.filter((entry) => !invalidConstraintIds.has(entry.id));
  for (const id of invalid) {
    if (!projected.unknowns.some((entry) => entry.sourceId === 'fact:' + id)) {
      projected.unknowns.push({ id: context.newId(), description: '依赖输入已变更，原推导结果需要重新核对。',
        reason: 'conflicting', sourceId: 'fact:' + id });
    }
  }
}
function archiveSelection(state, context) {
  if (state.selection) state.history.push({ type: 'selection', at: context.now, selection: clone(state.selection) });
  state.selection = null;
  state.artifacts.forEach((artifact) => { artifact.status = 'stale'; });
}
function invalidate(state, context) {
  if (state.analysis && state.analysis.status !== 'stale') {
    state.history.push({ type: 'analysis', at: context.now, analysis: clone(state.analysis) });
    state.analysis.status = 'stale';
  }
  archiveSelection(state, context);
  state.input.confirmedVersion = null;
  state.round.inputVersion += 1;
}
function currentInput(payload, state, material) {
  requireValue(payload.inputVersion === state.round.inputVersion, '资料已变化，请从当前输入重新整理。', 'stale_input');
  if (own(payload, 'roundId')) requireValue(payload.roundId === state.round.id, '这份结果属于之前的一轮。', 'stale_input');
  if (material) requireValue(payload.materialVersion === material.version, '材料已被替换，请重新读取。', 'stale_input');
}
function activeAnalysis(state) {
  const analysis = state.analysis;
  requireValue(analysis && analysis.status !== 'stale' && analysis.roundId === state.round.id && analysis.inputVersion === state.round.inputVersion && state.input.confirmedVersion === state.round.inputVersion, '请先确认当前资料并重新分析。', 'stale_input');
  return analysis;
}
function checkRefs(ids, available) {
  requireValue(Array.isArray(ids) && ids.every((id) => available.has(id)), '证据或假设引用不完整。', 'invalid_structure');
}
export function validateAnalysis(analysis, state) {
  const acceptedExperiment = isAcceptedExperimentAnalysis(analysis, state);
  const realModel = analysis?.mode === 'real_model';
  const analysisSkillIds = ['douyin-data-analysis', 'douyin-account-diagnosis'];
  const executionSkillIds = new Set(['douyin-copywriter', 'douyin-video-creation', 'douyin-live-ops']);
  requireValue(['ready', 'limited', 'insufficient'].includes(analysis.status), '分析状态不合法。', 'invalid_structure');
  requireValue(['demo_fixture', 'local_limited', 'real_model'].includes(analysis.mode), '当前没有可核对的分析能力。', 'invalid_structure');
  requireValue(Array.isArray(analysis.paths) && Array.isArray(analysis.limitations), '分析结构不完整。', 'invalid_structure');
  if (!realModel) requireValue(analysis.analysisSource === 'local_fallback'
    && !own(analysis, 'providerReceipt') && !own(analysis, 'skillIds'),
    '本机或固定样例分析不能携带真实模型回执或调用身份。', 'invalid_structure');
  if (realModel) {
    const receipt = analysis.providerReceipt;
    const sourceOk = analysis.analysisSource === 'moneyai'
      ? receipt?.provider === 'moneyai' && receipt.sentToMoneyAI === true
      : analysis.analysisSource === 'ai_settings'
        ? receipt?.provider === 'ai-settings' && receipt.sentToProvider === true
        : false;
    requireValue(sourceOk && analysis.paths.length <= 2
      && receipt?.contractVersion === MONEYAI_ANALYSIS_CONTRACT_VERSION
      && /^[A-Za-z0-9._:-]{1,120}$/.test(receipt.operationId)
      && /^[A-Za-z0-9._:-]{1,120}$/.test(receipt.attemptId)
      && receipt.sessionId === state.sessionId && receipt.roundId === state.round.id
      && receipt.inputVersion === state.round.inputVersion && /^sha256:[a-f0-9]{64}$/.test(receipt.inputFingerprint),
    '真实分析缺少提供方回执、输入身份或路径上限。', 'invalid_structure');
    requireValue(Array.isArray(analysis.skillIds)
      && analysis.skillIds.length === analysisSkillIds.length
      && analysisSkillIds.every((skillId, index) => analysis.skillIds[index] === skillId)
      && analysis.paths.every((path) => executionSkillIds.has(path.skillId)),
    '真实分析缺少已核对的分析Skill或路径执行Skill身份。', 'invalid_structure');
  }
  uniqueIds(analysis.paths);
  const reviewPolicy = analysisReviewPolicy(state);
  requireValue(applyAnalysisReviewPolicy(analysis.paths, reviewPolicy).length === analysis.paths.length
    && (!(reviewPolicy.withdrawn || reviewPolicy.unresolved) || analysis.priority?.status !== 'hypothesis' && analysis.priority?.hypothesis == null),
  '分析不能恢复本轮已撤回的假设或明确无法执行的路径。', 'invalid_structure');
  const facts = new Set(state.input.facts.map((fact) => fact.id));
  if (own(analysis, 'funnel')) {
    requireValue(acceptedExperiment || same(analysis.funnel, buildFunnelSnapshot(state)), '漏斗来源、口径或算式与当前输入不一致。', 'invalid_structure');
  }
  if (own(analysis, 'routing')) requireValue(same(analysis.routing, buildDemoBreakpoint(acceptedExperiment ? analysis.funnel : buildFunnelSnapshot(state))),
    'Demo路由必须使用当前可比数据与明确阈值，不能改写规则或伪造专家调用。', 'invalid_structure');
  if (own(analysis, 'dataQuality')) requireValue(same(analysis.dataQuality, buildDemoDataQuality(acceptedExperiment ? analysis.funnel : buildFunnelSnapshot(state))),
    '数据质量分必须可从本机检查逐项复核。', 'invalid_structure');
  if (own(analysis, 'priority')) {
    const priority = analysis.priority;
    requireValue(priority && ['hypothesis', 'unavailable'].includes(priority.status)
      && priority.rootCauseConfirmed === false && nonempty(priority.title) && nonempty(priority.reason)
      && Array.isArray(priority.facts) && Array.isArray(priority.unknowns) && priority.unknowns.every(nonempty),
    '优先问题必须保留假设与未知，不能确认根因。', 'invalid_structure');
    for (const entry of [...priority.facts, ...(priority.hypothesis ? [priority.hypothesis] : [])]) {
      requireValue(nonempty(entry.text), '优先问题依据缺少说明。', 'invalid_structure');
      checkRefs(entry.sourceFactIds || [], facts);
      for (const sourceId of entry.sourceIds || []) requireValue(validSourceId(sourceId, state), '优先假设来源无法定位。', 'invalid_structure');
    }
    for (const entry of priority.facts) {
      const sourceIds = entry.sourceIds || [];
      requireValue(Array.isArray(sourceIds) && sourceIds.every((sourceId) => typeof sourceId === 'string' && sourceId.startsWith('fact:')),
        '观测来源必须定位事实，不能用原话或材料标签绕过类型检查。', 'invalid_structure');
      const references = [...new Set([...(entry.sourceFactIds || []), ...sourceIds.map((sourceId) => sourceId.slice(5))])];
      requireValue(references.length > 0 && references.every((factId) => {
        const fact = state.input.facts.find((item) => item.id === factId);
        return fact && fact.availability === 'known' && !['owner_hypothesis', 'unknown'].includes(fact.evidenceStatus)
          && fact.verification !== 'conflicting' && ['merchant_statement', 'file_extract'].includes(fact.source?.kind);
      }), '不能把空依据、假设、冲突或参考值列为已提供观测。', 'invalid_structure');
    }
    if (priority.status === 'hypothesis') {
      if (realModel) {
        requireValue(analysis.funnel?.status === 'comparable' && priority.hypothesis
          && analysis.funnel.transitions?.some((edge) => edge.fromKey === priority.fromKey && edge.toKey === priority.toKey),
        'MoneyAI优先假设必须对应当前可比漏斗中的相邻阶段。', 'invalid_structure');
      } else requireValue(analysis.funnel?.status === 'comparable' && (state.fixtureId === 'juicer_cup_v1' || acceptedExperiment)
          && priority.fromKey === 'product_clicks' && priority.toKey === 'add_to_carts'
          && priority.hypothesis && buildDemoBreakpoint(analysis.funnel).stage === 'click_cart',
        '当前没有可支持的优先环节或未命中Demo规则。', 'invalid_structure');
    }
  }
  if (own(analysis, 'processing')) requireValue(Array.isArray(analysis.processing)
    && analysis.processing.every((entry) => nonempty(entry.name)
      && (realModel
        ? (analysis.analysisSource === 'ai_settings' ? entry.kind === 'provider_ai' : entry.kind === 'moneyai')
          && entry.status === 'done'
          && entry.operationId === analysis.providerReceipt.operationId
        : entry.kind === 'local_rule' && ['done', 'not_run'].includes(entry.status)))
    && (!realModel || analysisSkillIds.every((skillId) => analysis.processing.some((entry) => entry.skillId === skillId))),
  '不能伪造专家或模型调用过程。', 'invalid_structure');
  const actionKeys = new Set();

  for (const path of analysis.paths) {
    if (own(path, 'actionKey')) {
      const product = juicerProductFacts(state.input);
      requireValue(['juicer_faq', 'juicer_video_intro', 'juicer_first_screen', 'juicer_question_video'].includes(path.actionKey) && !actionKeys.has(path.actionKey)
        && !realModel && (state.fixtureId === 'juicer_cup_v1' && analysis.mode === 'demo_fixture'
          || acceptedExperiment && path.actionKey === 'juicer_faq' && analysis.mode === 'local_limited')
        && analysis.funnel?.status === 'comparable'
        && product.capacity && product.charging, '行动模板缺少本轮合成依据或重复标识。', 'invalid_structure');
      if (['juicer_first_screen', 'juicer_question_video'].includes(path.actionKey)) {
        const firstScreen = path.actionKey === 'juicer_first_screen';
        requireValue(analysis.prdVersion === '1.0' && product.shipping && product.cleaning
          && analysis.routing?.stage === 'click_cart' && buildDemoBreakpoint(analysis.funnel).stage === 'click_cart'
          && path.optionLabel === (firstScreen ? 'A' : 'B')
          && path.title === (firstScreen ? '补全首屏购买判断' : '制作真实问题验证内容')
          && nonempty(path.validationMetric),
        'PRD首轮行动缺少四项事实、稳定方案身份、路由或验证指标。', 'invalid_structure');
      }
      actionKeys.add(path.actionKey);
    }
    requireValue(nonempty(path.title) && nonempty(path.action), '路径没有具体行动。', 'invalid_structure');
    requireValue(path.estimate && ['scenario', 'unavailable'].includes(path.estimate.kind), '估计必须区分情景和不可估。', 'invalid_structure');
    requireValue(path.estimate.incrementalEffect?.kind === 'unavailable', '本Demo不能估计行动增量。', 'invalid_structure');
    const assumptions = uniqueIds(path.estimate.assumptions || []);
    for (const item of path.estimate.assumptions || []) checkRefs(item.sourceFactIds || [], facts);
    const condition = (entry) => {
      if (entry === null) return;
      requireValue(entry && nonempty(entry.text), '分支条件缺少文字。', 'invalid_structure');
      checkRefs(entry.sourceFactIds || [], facts);
      checkRefs(entry.assumptionIds || [], assumptions);
    };
    for (const item of path.prerequisites || []) condition(item);
    for (const item of [...(path.evidenceRefs || []), ...(path.counterEvidence || [])]) {
      checkRefs(item.factIds || [], facts);
      for (const source of item.sourceIds || []) requireValue(validSourceId(source, state), '证据来源无法定位。', 'invalid_structure');
    }
    for (const risk of path.risk || []) {
      checkRefs(risk.sourceFactIds || [], facts);
      checkRefs(risk.assumptionIds || [], assumptions);
      condition(risk.trigger); condition(risk.stop); condition(risk.restore);
    }
    if (path.estimate.kind === 'scenario') {
      requireValue(path.estimate.calculation?.method === 'visitors_times_rate' && path.estimate.values?.length > 0, '情景缺少可复算方法。', 'invalid_structure');
      for (const result of path.estimate.values) {
        const visitors = path.estimate.assumptions.find((item) => item.id === result.visitorAssumptionId);
        const rate = path.estimate.assumptions.find((item) => item.id === result.rateAssumptionId);
        requireValue(visitors && rate && Number.isFinite(visitors.value) && visitors.value >= 0 && Number.isFinite(rate.value) && rate.value >= 0 && rate.value <= 1 && Math.abs(result.value - visitors.value * rate.value) < 1e-9, '情景参数或算式不一致。', 'invalid_structure');
      }
    }

    const plan = path.experiment;
    requireValue(plan && nonempty(plan.change) && Array.isArray(plan.keepFixed) && plan.keepFixed.every(nonempty)
      && plan.target && nonempty(plan.target.metric) && plan.window && nonempty(plan.window.description)
      && Array.isArray(plan.limitations) && plan.limitations.every(nonempty)
      && (plan.minSample === null || Number.isFinite(plan.minSample) && plan.minSample > 0),
    '实验计划的修改项、对象或样本结构不完整。', 'invalid_structure');
    if (['juicer_first_screen', 'juicer_question_video'].includes(path.actionKey)) {
      const firstScreen = path.actionKey === 'juicer_first_screen';
      requireValue(plan.experimentId === 'EXP-JUICER01-click_cart-' + path.optionLabel + '-R' + state.round.index
        && plan.round === state.round.index && nonempty(plan.hypothesis)
        && plan.change === (firstScreen ? '商品详情页首屏' : '一条真实问题验证视频')
        && plan.target.metric === 'click_to_cart_rate'
        && plan.minSample === 100 && plan.minSampleUnit === '次新增商品点击'
        && Array.isArray(plan.guardrails) && plan.guardrails.length > 0
        && Array.isArray(plan.restoreSteps) && plan.restoreSteps.length > 0
        && Array.isArray(plan.assumptionIds) && Array.isArray(path.estimate.assumptions)
        && path.estimate.assumptions.some((entry) => plan.assumptionIds.includes(entry.id) && entry.note === plan.hypothesis),
      'PRD实验卡的编号、假设来源、单变量、指标、样本或护栏不完整。', 'invalid_structure');
    }
    if (own(plan, 'minSampleUnit')) requireValue(nonempty(plan.minSampleUnit), '样本单位必须明确。', 'invalid_structure');
    checkRefs(plan.sourceFactIds || [], facts); checkRefs(plan.assumptionIds || [], assumptions);
    for (const key of ['stopConditions', 'restoreConditions', 'guardrails', 'restoreSteps']) {
      if (plan[key] === undefined && ['guardrails', 'restoreSteps'].includes(key)) continue;
      requireValue(Array.isArray(plan[key]), '实验计划的条件列表不完整。', 'invalid_structure');
      for (const entry of plan[key]) { requireValue(entry !== null, '实验条件不能是空条目。', 'invalid_structure'); condition(entry); }
    }
    const tree = path.tree;
    requireValue(tree && Array.isArray(tree.nodes) && Array.isArray(tree.edges), '缺少完整业务树。', 'invalid_structure');
    const nodes = uniqueIds(tree.nodes);
    requireValue(nodes.has(tree.rootId), '业务树没有有效根节点。', 'invalid_structure');
    uniqueIds(tree.edges);
    const incoming = new Map([...nodes].map((id) => [id, 0]));
    for (const edge of tree.edges) {
      requireValue(nodes.has(edge.from) && nodes.has(edge.to) && branches.includes(edge.branch), '业务树存在断边或未知分支。', 'invalid_structure');
      incoming.set(edge.to, incoming.get(edge.to) + 1);
      condition(edge.condition);
    }
    for (const id of nodes) requireValue(incoming.get(id) === (id === tree.rootId ? 0 : 1), '业务树必须是有向根树。', 'invalid_structure');
    const visited = new Set();
    function walk(id) {
      requireValue(!visited.has(id), '业务树有环。', 'invalid_structure');
      visited.add(id);
      const node = tree.nodes.find((item) => item.id === id);
      const outgoing = tree.edges.filter((edge) => edge.from === id);
      requireValue(node.kind === 'decision' ? outgoing.length >= 2 : node.kind === 'next_step' && outgoing.length === 0, '业务树节点与分支不一致。', 'invalid_structure');
      outgoing.forEach((edge) => walk(edge.to));
    }
    walk(tree.rootId);
    requireValue(visited.size === nodes.size, '业务树包含不可达节点。', 'invalid_structure');
    for (const branch of branches) requireValue(tree.edges.some((edge) => edge.branch === branch) || tree.notApplicableBranches?.some((entry) => entry.branch === branch && nonempty(entry.reason)), '业务树遗漏适用分支。', 'invalid_structure');
  }
  jsonSafe(analysis);
}
export function validateRealModelAnalysisDraft(analysis, state, expectedScope = null) {
  requireValue(state?.round && state?.input && analysis?.mode === 'real_model',
    '缺少当前会话或真实模型分析。', 'invalid_structure');
  if (expectedScope) requireValue(expectedScope.sessionId === state.sessionId
    && expectedScope.roundId === state.round.id && expectedScope.inputVersion === state.round.inputVersion
    && expectedScope.inputFingerprint === analysis.providerReceipt?.inputFingerprint,
  'MoneyAI回包不属于当前输入快照。', 'stale_input');
  validateAnalysis(analysis, state);
  return analysis;
}
export function validSourceId(sourceId, state) {
  if (sourceId === 'input:description' || sourceId === 'input:focus') return true;
  if (typeof sourceId !== 'string') return false;
  const match = /^(material|fact|question):([A-Za-z0-9_-]{1,80})$/.exec(sourceId);
  if (!match) return false;
  return match[1] === 'material' ? state.input.materials.some((entry) => entry.id === match[2])
    : match[1] === 'fact' ? state.input.facts.some((entry) => entry.id === match[2])
      : normalizeClarification(state.round.clarification).questions.some((question) => question.questionId === match[2])
        || state.history.some((entry) => entry.type === 'round' && entry.round?.clarification
          && normalizeClarification(entry.round.clarification).questions.some((question) => question.questionId === match[2]));
}

const feedbackDetailFields = ['reason', 'sampleSize', 'sampleUnit', 'metricBefore', 'metricAfter', 'constraintsLearned', 'guardrailStatus'];
function feedbackDetails(source) {
  if (!own(source, 'detailsVersion') && !feedbackDetailFields.some((key) => own(source, key))) return {};
  requireValue(source.detailsVersion === FEEDBACK_DETAILS_VERSION, '新增反馈字段需要detailsVersion:1，未保存未识别的数据。');
  const nullableText = (key, limit) => {
    if (own(source, key)) requireValue(source[key] === null || typeof source[key] === 'string' && source[key].length <= limit,
      key + '必须是规定长度的文字或未知。');
  };
  nullableText('reason', 1000);
  if (own(source, 'sampleSize')) requireValue(source.sampleSize === null
    || Number.isSafeInteger(source.sampleSize) && source.sampleSize >= 0, '样本量必须是非负安全整数或未知。');
  if (own(source, 'sampleUnit')) requireValue(source.sampleUnit === null || source.sampleUnit === 'product_clicks',
    '样本单位仅支持product_clicks或未知。');
  for (const key of ['metricBefore', 'metricAfter']) if (own(source, key)) requireValue(source[key] === null
    || typeof source[key] === 'number' && Number.isFinite(source[key]) && source[key] >= 0 && source[key] <= 1,
    key + '必须是0至1的比例或未知，不能把百分数字符串当数值。');
  if (own(source, 'constraintsLearned')) requireValue(Array.isArray(source.constraintsLearned)
    && source.constraintsLearned.length <= 20 && source.constraintsLearned.every((entry) =>
      typeof entry === 'string' && entry.trim().length > 0 && entry.length <= 300),
    '新增限制最多20条，每条为1至300字文字。');
  if (own(source, 'guardrailStatus')) requireValue(['unknown', 'clear', 'triggered'].includes(source.guardrailStatus),
    '护栏状态只能为unknown、clear或triggered。');
  return Object.fromEntries(['detailsVersion', ...feedbackDetailFields].filter((key) => own(source, key)).map((key) => [key, clone(source[key])]));
}

export function reduceCommand(original, command, context) {
  assertState(original);
  const state = normalizeSessionState(original);
  const payload = command.payload || {};
  const effects = { putBlobs: [], deleteBlobs: [], clearSession: false };
  const events = [];
  let changed = true;
  let inputChanged = false;
  let patchedIntake = false;
  let roundLink = null;
  const event = (type, refs = {}) => events.push({ id: context.newId(), type, roundId: state.round.id, at: context.now, refs });
  const hasDownstream = original.input.confirmedVersion !== null || (original.analysis && original.analysis.status !== 'stale') || !!original.selection;
  switch (command.type) {
    case 'LOAD_FIXTURE': {
      const fresh = createEmptyState(context);
      fresh.sessionId = state.sessionId;
      fresh.revision = state.revision;
      fresh.round.inputVersion = state.round.inputVersion + 1;
      fresh.input = makeFixtureInput(payload.fixtureId, context, fresh.round.id);
      fresh.fixtureId = payload.fixtureId;
      const draft = makeFixtureIntake(payload.fixtureId);
      fresh.input.intake = { draft, sourceBindings: [], status: 'current',
        roundId: fresh.round.id, inputVersion: fresh.round.inputVersion, savedAt: context.now };
      const merged = mapConfirmedIntakeToAnalysisInput(draft, { state: fresh, sourceBindings: [] });
      if (!merged.ok) fail(merged.code, merged.message);
      Object.assign(fresh.input, prepareProjection(merged.projection, fresh, context, true));
      fresh.input.focus ??= fresh.input.description.trim() || null;
      Object.assign(state, fresh);
      effects.clearSession = true;
      break;
    }
    case 'INPUT_EDIT':
      requireValue(typeof payload.description === 'string' && payload.description.length <= 20000, '描述过长或格式不正确。');
      changed = payload.description !== state.input.description;
      if (changed) { state.input.description = payload.description; inputChanged = true; }
      break;
    case 'INTAKE_SET': {
      requireValue(own(payload, 'roundId'), '经营草稿缺少轮次，未保存。');
      currentInput(payload, state);
      requireValue(typeof payload.description === 'string' && payload.description.length <= 20000, '编辑文字过长或格式不正确。');
      const validated = validateMerchantIntakeDraft(payload.draft);
      if (!validated.ok) fail(validated.code, validated.message);
      const sourceBindings = payload.sourceBindings ?? [];
      const merged = mapConfirmedIntakeToAnalysisInput(validated.draft, { state, sourceBindings });
      if (!merged.ok) fail(merged.code, merged.message);
      for (const previous of state.input.facts.filter((fact) => fact.intakeField && fact.verification === 'user_corrected')) {
        const next = merged.projection.facts.find((fact) => fact.id === previous.id);
        const requested = previous.intakeField.split('.').reduce((value, key) => value?.[key], validated.draft) ?? null;
        requireValue(!next || !same(previous, next) || same(requested, next.value),
          '这项经营信息已有更新的用户更正，请重读并核对当前值；没有覆盖更正或保存不一致的确认卡。', 'correction_conflict');
      }
      const projected = prepareProjection(merged.projection, state, context, true,
        new Set(merged.factCorrections.map((entry) => entry.factId)));
      for (const entry of merged.factCorrections) {
        state.history.push({ type: 'fact_correction', factId: entry.factId,
          inputVersion: state.round.inputVersion + 1, reason: '经营信息确认中的明确更正',
          before: clone(entry.before), after: clone(projected.facts.find((fact) => fact.id === entry.factId)), at: context.now });
      }
      invalidateInputDependents(projected, state, context);
      const intakeContent = (entry) => entry ? { draft: entry.draft, sourceBindings: entry.sourceBindings } : null;
      const previous = { description: state.input.description, focus: state.input.focus,
        projection: semantic({ facts: state.input.facts, constraints: state.input.constraints, unknowns: state.input.unknowns }),
        intake: intakeContent(state.input.intake) };
      state.input.description = payload.description;
      state.input.focus = projected.focus ?? (payload.description.trim() || null);
      state.input.facts = projected.facts;
      state.input.constraints = projected.constraints;
      state.input.unknowns = projected.unknowns;
      state.input.intake = { draft: validated.draft, sourceBindings: clone(sourceBindings), status: 'current',
        roundId: state.round.id, inputVersion: state.round.inputVersion, savedAt: context.now };
      const next = { description: state.input.description, focus: state.input.focus,
        projection: semantic({ facts: state.input.facts, constraints: state.input.constraints, unknowns: state.input.unknowns }),
        intake: intakeContent(state.input.intake) };
      inputChanged = !same(previous, next);
      changed = inputChanged || original.input.intake?.status !== 'current';
      if (changed && original.input.intake) {
        state.history.push({ type: 'intake_revision', at: context.now, roundId: state.round.id,
          inputVersion: original.round.inputVersion, description: original.input.description, intake: clone(original.input.intake) });
      }
      if (inputChanged) state.input.intake.inputVersion += 1;
      break;
    }
    case 'MATERIAL_ADD':
    case 'MATERIAL_REPLACE': {
      const file = context.preparedMaterial;
      requireValue(file, '没有可接收的文件。');
      requireValue(Number.isInteger(file.size) && file.size > 0 && file.size <= MATERIAL_LIMITS.maxFileBytes,
        '单份文件需大于0且不超过10,000,000字节。', 'file_limit');
      const userCategory = own(payload, 'userCategory') ? payload.userCategory : 'unknown';
      requireValue(MATERIAL_CATEGORIES.includes(userCategory), '材料来源类别不合法。');
      const old = command.type === 'MATERIAL_REPLACE' ? state.input.materials.find((item) => item.id === payload.materialId) : null;
      if (command.type === 'MATERIAL_REPLACE') {
        requireValue(old, '原材料已不存在。', 'stale_input');
        requireValue(payload.inputVersion === state.round.inputVersion, '材料版本已变化。', 'stale_input');
      }
      if (old?.sha256 === file.sha256 && old.size === file.size) { changed = false; break; }
      requireValue(!state.input.materials.some((item) => item.id !== old?.id && item.size === file.size && item.sha256 === file.sha256), '相同内容的材料已经在本轮中。', 'duplicate_material');
      requireValue(state.input.materials.length + (old ? 0 : 1) <= MATERIAL_LIMITS.maxFiles
        && state.input.materials.reduce((sum, item) => sum + item.size, 0) - (old?.size || 0) + file.size <= MATERIAL_LIMITS.maxTotalBytes,
        '最多6份，单份10,000,000字节，总计20MiB。', 'file_limit');
      const material = { id: old?.id || context.newId(), name: file.name, mime: file.mime, size: file.size, status: 'received', sourceKind: 'user_file', userCategory, blobKey: old?.id || null, error: null, version: (old?.version || 0) + 1, sha256: file.sha256 };
      material.blobKey = material.id;
      if (old) {
        state.history.push({ type: 'material_replaced', at: context.now, material: clone(old) });
        state.input.materials = state.input.materials.filter((item) => item.id !== old.id);
        removeFactsAndDependents(state, state.input.facts.filter((fact) => fact.source.materialId === old.id).map((fact) => fact.id), context, [old.id]);
      }
      state.input.materials.push(material);
      effects.putBlobs.push({ materialId: material.id, file: file.file });
      inputChanged = true;
      break;
    }
    case 'MATERIAL_CATEGORY_SET': {
      const material = state.input.materials.find((entry) => entry.id === payload.materialId);
      requireValue(material && payload.roundId === state.round.id, '材料或轮次已变化，请重新读取。', 'stale_input');
      currentInput(payload, state, material);
      requireValue(MATERIAL_CATEGORIES.includes(payload.userCategory), '材料来源类别不合法。');
      const previousUserCategory = material.userCategory ?? 'unknown';
      if (previousUserCategory === payload.userCategory) { changed = false; break; }
      state.history.push({ type: 'material_category_changed', at: context.now, roundId: state.round.id,
        inputVersion: state.round.inputVersion, materialId: material.id, materialVersion: material.version,
        previousUserCategory, userCategory: payload.userCategory });
      material.userCategory = payload.userCategory;
      // A user label is context, never a parsed fact, verified origin or new Blob.
      inputChanged = true;
      break;
    }
    case 'MATERIAL_REMOVE': {
      const material = state.input.materials.find((entry) => entry.id === payload.materialId);
      requireValue(material, '材料已经移除。', 'stale_input');
      state.history.push({ type: 'material_removed', at: context.now, material: clone(material) });
      state.input.materials = state.input.materials.filter((entry) => entry.id !== material.id);
      const removedIds = new Set(state.input.facts.filter((fact) => fact.source.materialId === material.id).map((fact) => fact.id));
      removeFactsAndDependents(state, removedIds, context, [material.id]);
      effects.deleteBlobs.push(material.id);
      inputChanged = true;
      break;
    }
    case 'MATERIAL_RESULT_SET':
    case 'ORGANIZATION_SET': {
      const material = command.type === 'MATERIAL_RESULT_SET' ? state.input.materials.find((entry) => entry.id === payload.materialId) : null;
      if (command.type === 'MATERIAL_RESULT_SET') requireValue(material, '材料已移除，旧结果不能恢复。', 'stale_input');
      currentInput(payload, state, material);
      if (material) requireValue((payload.facts || []).every((fact) => fact.source?.materialId === material.id && fact.source?.materialVersion === material.version), '解析事实与原材料版本不符。', 'invalid_structure');
      const projected = prepareProjection(payload, state, context);
      const before = semantic({ facts: state.input.facts, focus: state.input.focus, constraints: state.input.constraints, unknowns: state.input.unknowns });
      if (material) {
        requireValue(['received', 'parsed', 'needs_review', 'failed'].includes(projected.status), '解析状态不正确。');
        material.status = projected.status;
        material.error = projected.error ?? null;
        const corrected = state.input.facts.filter((fact) => fact.source.materialId === material.id && fact.verification === 'user_corrected');
        const projectedIds = new Set(projected.facts.map((fact) => fact.id));
        state.input.facts = state.input.facts.filter((fact) => fact.source.materialId !== material.id && !projectedIds.has(fact.id));
        state.input.facts.push(...projected.facts, ...corrected.filter((fact) => !projected.facts.some((item) => item.id === fact.id)));
      } else {
        requireValue(projected.focus === null || typeof projected.focus === 'string', '本轮问题应是一段文字。');
        state.input.focus = projected.focus;
        state.input.facts = projected.facts;
        for (const corrected of original.input.facts.filter((fact) => fact.verification === 'user_corrected')) {
          if (!state.input.facts.some((fact) => fact.id === corrected.id)) state.input.facts.push(clone(corrected));
        }
        state.input.constraints = projected.constraints || [];
        state.input.unknowns = projected.unknowns || [];
        for (const entry of state.input.unknowns) {
          if (!entry.id) entry.id = context.newId();
          requireValue(nonempty(entry.description) && ['not_provided', 'unknown', 'skipped', 'conflicting', 'unparsed'].includes(entry.reason), '未知项缺少说明。');
        }
      }
      const after = semantic({ facts: state.input.facts, focus: state.input.focus, constraints: state.input.constraints, unknowns: state.input.unknowns });
      inputChanged = hasDownstream && !same(before, after);
      changed = !same(state.input, original.input);
      break;
    }
    case 'FACT_PATCH': {
      if (own(payload, 'inputVersion')) currentInput(payload, state);
      requireValue(payload.fact && typeof payload.fact === 'object' && !Array.isArray(payload.fact), '更正缺少事实对象。', 'invalid_structure');
      const previous = state.input.facts.find((fact) => fact.id === payload.fact?.id);
      requireValue(payload.fact.id == null || previous, '这项事实已被删除或替换，不能用旧编辑恢复。', 'stale_input');
      let next = normalizeFact(payload.fact, context);
      if (previous && same(previous, next)) { changed = false; break; }
      const reason = typeof payload.reason === 'string' ? payload.reason : '用户主动核对';
      next.source = { kind: 'merchant_statement', materialId: null, materialVersion: null, locator: { type: 'correction', factId: next.id, inputVersion: state.round.inputVersion + 1 }, note: reason };
      next.verification = 'user_corrected';
      state.history.push({ type: 'fact_correction', factId: next.id, inputVersion: state.round.inputVersion + 1, reason, before: previous ? clone(previous) : null, after: clone(next), at: context.now });
      patchedIntake = intakeReferencesFact(state, previous);
      const projected = { facts: [...state.input.facts.filter((fact) => fact.id !== next.id), next],
        constraints: clone(state.input.constraints), unknowns: clone(state.input.unknowns) };
      invalidateInputDependents(projected, state, context, 'fact_dependency_changed');
      state.input.facts = projected.facts;
      state.input.constraints = projected.constraints;
      state.input.unknowns = projected.unknowns;
      inputChanged = true;
      break;
    }
    case 'QUESTION_SET': {
      if (own(payload, 'inputVersion')) currentInput(payload, state);
      else if (own(payload, 'roundId')) requireValue(payload.roundId === state.round.id, '这份回答属于之前的一轮。', 'stale_input');
      const clarification = state.round.clarification;
      if (payload.status === 'asked') {
        requireValue(payload.questionId === null && clarification.activeQuestionId === null && clarification.remaining > 0,
          '本轮最多主动补问三次；先回答或跳过当前一问，不能替换已问内容。', 'invalid_transition');
        requireValue(nonempty(payload.questionText) && payload.questionText.length <= 2000, '补问缺少正文或过长。');
        requireValue(!clarification.questions.some((question) => question.questionText.trim() === payload.questionText.trim()), '同一问题已登记，请沿用原问题的回答入口。', 'invalid_transition');
        checkRefs(payload.sourceFactIds || [], new Set(state.input.facts.map((fact) => fact.id)));
        const question = { ...blankQuestion(), status: 'asked', questionId: context.newId(), questionText: payload.questionText,
          sourceFactIds: clone(payload.sourceFactIds || []), askedAt: context.now };
        clarification.questions.push(question);
        event('clarification_asked', { questionId: question.questionId });
      } else {
        const question = clarification.questions.find((item) => item.questionId === payload.questionId);
        requireValue(question, '请使用本轮已经保存的问题。', 'invalid_transition');
        requireValue(!own(payload, 'questionText') || payload.questionText === question.questionText, '已问正文不能替换，请保留原题并记录回答。', 'invalid_transition');
        requireValue(!own(payload, 'sourceFactIds') || same(payload.sourceFactIds, question.sourceFactIds), '已问来源不能替换。', 'invalid_transition');
        if (payload.status === 'skipped') {
          requireValue(question.status === 'asked' || question.status === 'skipped', '不能用跳过删除已经保存的答案。', 'invalid_transition');
          changed = question.status !== 'skipped';
          question.status = 'skipped';
          question.answer = null;
          if (changed) event('clarification_skipped', { questionId: question.questionId });
        } else {
          requireValue(payload.status === 'answered' && ['known', 'unknown'].includes(payload.answer?.availability), '答案状态不正确。');
          requireValue(payload.answer.rawText == null || typeof payload.answer.rawText === 'string', '答案原话应为文字或未知。');
          requireValue((payload.answer.rawText?.length || 0) <= 20000, '答案原话过长。');
          requireValue(payload.answer.availability === 'unknown' || nonempty(payload.answer.rawText), '已知答案需要原话。');
          const answer = { availability: payload.answer.availability, rawText: payload.answer.rawText ?? null };
          changed = question.status !== 'answered' || !same(question.answer, answer);
          inputChanged = !same(question.answer, answer);
          question.status = 'answered';
          question.answer = answer;
          if (changed) { question.answeredAt = context.now; event('clarification_answered', { questionId: question.questionId }); }
          if (inputChanged) removeFactsAndDependents(state, state.input.facts.filter((fact) => fact.source.locator?.questionId === question.questionId).map((fact) => fact.id), context);
        }
        const sourceId = 'question:' + question.questionId;
        const previous = state.input.unknowns.find((entry) => entry.sourceId === sourceId);
        state.input.unknowns = state.input.unknowns.filter((entry) => entry.sourceId !== sourceId);
        if (question.status === 'skipped' || question.answer?.availability === 'unknown') {
          state.input.unknowns.push({ id: previous?.id || context.newId(), description: question.questionText, reason: question.status === 'skipped' ? 'skipped' : 'unknown', sourceId });
        }
      }
      state.round.clarification = normalizeClarification(clarification);
      break;
    }
    case 'FOCUS_CONFIRM':
      currentInput(payload, state);
      requireValue(state.input.intake?.status !== 'stale', '经营信息已变化，请先重新核对并保存理解内容。', 'stale_input');
      requireValue(nonempty(state.input.description) || state.input.materials.length > 0
        || state.input.intake?.status === 'current' && (nonempty(state.input.intake.draft.transcript)
          || state.input.facts.some((fact) => fact.intakeField && fact.availability === 'known')),
        '先说一句，或交一份材料。', 'invalid_transition');
      // Confirm every provenance-bound parser fact from the current material version, not
      // only the small subset mapped into intake cards. P2 still rejects conflicting facts.
      // No cell value is created or changed here; this records the user's explicit confirmation.
      let confirmedMaterialFacts = false;
      state.input.facts = state.input.facts.map((fact) => {
        const source = fact?.source;
        const currentMaterial = source?.kind === 'file_extract'
          && typeof source.materialId === 'string' && Number.isSafeInteger(source.materialVersion)
          && source.locator && typeof source.locator === 'object'
          && state.input.materials.some((material) => material.id === source.materialId
            && material.version === source.materialVersion);
        if (!currentMaterial || fact.availability !== 'known' || fact.value === null
          || fact.verification === 'conflicting' || fact.evidenceStatus === 'confirmed_fact') return fact;
        confirmedMaterialFacts = true;
        return { ...fact, evidenceStatus: 'confirmed_fact' };
      });
      changed = state.input.confirmedVersion !== state.round.inputVersion || confirmedMaterialFacts;
      state.input.focus ||= state.input.description.trim() || '先核对手头材料，明确这轮要解决的问题';
      state.input.confirmedVersion = state.round.inputVersion;
      break;
    case 'ANALYSIS_SET': {
      requireValue(!payload.analysis?.experimentReview, '历史候选只能通过明确接受事务建立，不能用普通分析保存绕过。', 'invalid_transition');
      const analysis = mapDrafts(payload.analysis, context);
      // Capture provenance from the confirmed state, never from a draft claim.
      analysis.sourceFixtureId = state.fixtureId ?? null;
      requireValue(analysis.roundId === state.round.id && analysis.inputVersion === state.round.inputVersion, '分析依据已过期。', 'stale_input');
      requireValue(state.input.confirmedVersion === state.round.inputVersion, '请先确认这轮问题。', 'invalid_transition');
      const review = latestAnalysisReview(state);
      requireValue((analysis.reviewId ?? null) === (review?.id ?? null), '分析感受已变化，请重新判断，不能覆盖新反馈。', 'stale_input');
      validateAnalysis(analysis, state);
      requireValue(same(analysis.reviewIds ?? [], analysisReviewPolicy(state).reviewIds), '分析未包含本轮感受和限制的完整版本，请重新判断。', 'stale_input');
      if (state.analysis) state.history.push({ type: 'analysis', at: context.now, analysis: clone(state.analysis) });
      archiveSelection(state, context);
      analysis.id = analysis.id || context.newId();
      analysis.savedAt = context.now;
      analysis.inputSnapshot = clone(state.input);
      analysis.clarificationSnapshot = clone(state.round.clarification);
      state.analysis = analysis;
      break;
    }
    case 'ANALYSIS_REVIEW_SAVE': {
      currentInput(payload, state);
      requireValue(payload.roundId === state.round.id && payload.analysisId === state.analysis?.id,
        '这条感受反馈不属于当前分析。', 'stale_input');
      requireValue(['agree', 'uncertain', 'disagree', 'not_actionable'].includes(payload.stance), '分析感受类型不合法。');
      requireValue(payload.reason == null || typeof payload.reason === 'string', '原因必须是文字或未知。');
      const reason = payload.reason?.trim() || null;
      requireValue(reason === null || reason.length <= 1000, '原因不能超过1000字。');
      const blockedPathIds = payload.blockedPathIds ?? [];
      requireValue(Array.isArray(blockedPathIds) && new Set(blockedPathIds).size === blockedPathIds.length
        && blockedPathIds.every((pathId) => state.analysis.paths.some((path) => path.id === pathId)), '无法执行的路径引用不正确。', 'invalid_structure');
      requireValue(payload.stance === 'not_actionable' ? blockedPathIds.length > 0 && reason !== null : blockedPathIds.length === 0,
        '无法执行需明确路径和原因；其他感受不代替路径限制。');
      const record = { type: 'analysis_review', roundId: state.round.id, inputVersion: state.round.inputVersion,
        analysisId: state.analysis.id, stance: payload.stance, reason, blockedPathIds: [...blockedPathIds].sort(),
        source: { kind: 'merchant_statement', note: '商家对当前分析的感受或限制，不是事实核验，也不是执行反馈。' } };
      const prior = latestAnalysisReview(state);
      if (prior && ['roundId', 'inputVersion', 'analysisId', 'stance', 'reason', 'blockedPathIds'].every((key) => same(prior[key], record[key]))) { changed = false; break; }
      const analysis = activeAnalysis(state);
      if (['disagree', 'not_actionable'].includes(record.stance)) {
        state.history.push({ type: 'analysis', at: context.now, analysis: clone(analysis) });
        analysis.status = 'stale';
        archiveSelection(state, context);
      }
      state.history.push({ ...record, id: context.newId(), at: context.now });
      event('analysis_review_saved', { analysisId: analysis.id, inputVersion: state.round.inputVersion });
      break;
    }
    case 'PATH_SELECT': {
      const analysis = activeAnalysis(state);
      requireValue(payload.analysisId === analysis.id && payload.inputVersion === state.round.inputVersion && analysis.paths.some((path) => path.id === payload.pathId), '请从当前有效分析选择路径。', 'stale_input');
      if (state.selection?.analysisId === analysis.id && state.selection.pathId === payload.pathId) { changed = false; break; }
      archiveSelection(state, context);
      state.selection = { analysisId: analysis.id, pathId: payload.pathId, inputVersion: state.round.inputVersion, selectedAt: context.now };
      event('path_selected', { analysisId: analysis.id, pathId: payload.pathId, inputVersion: state.round.inputVersion });
      break;
    }
    case 'ARTIFACT_SAVE': {
      const analysis = activeAnalysis(state);
      requireValue(state.selection, '请先选择一条路径。', 'invalid_transition');
      const draft = payload.artifact;
      requireValue(draft && draft.analysisId === analysis.id && draft.pathId === state.selection.pathId && draft.roundId === state.round.id && draft.inputVersion === state.round.inputVersion, '执行内容所依赖的选择已变化。', 'stale_input');
      requireValue(['copy', 'checklist', 'experiment_plan'].includes(draft.kind) && typeof draft.body === 'string' && nonempty(draft.title), '执行内容结构不正确。');
      checkRefs(draft.sourceFactIds || [], new Set(state.input.facts.map((fact) => fact.id)));
      requireValue(draft.usage && nonempty(draft.usage.placement) && Array.isArray(draft.usage.steps)
        && draft.usage.steps.every(nonempty) && Array.isArray(draft.usage.risks) && draft.usage.risks.every(nonempty),
      '执行内容需要明确使用位置、步骤和风险。', 'invalid_structure');
      if (draft.id !== null) {
        const old = state.artifacts.find((artifact) => artifact.id === draft.id && artifact.version === draft.version);
        requireValue(old && old.status === 'current', '编辑版本已经过期。', 'stale_input');
        if (old.body === draft.body && old.title === draft.title && same(old.usage, draft.usage)) { changed = false; break; }
        fail('invalid_transition', '基础版暂只读成品；涉及事实或承诺的修改请回第一页核对。');
      }
      const artifact = mapDrafts(draft, context);
      Object.assign(artifact, { id: artifact.id || context.newId(), version: 1, status: 'current', savedAt: context.now, mode: analysis.mode, editedByUser: false });
      state.artifacts.push(artifact);
      event('artifact_saved', { artifactId: artifact.id, artifactVersion: artifact.version, analysisId: analysis.id, pathId: artifact.pathId, inputVersion: artifact.inputVersion });
      break;
    }
    case 'FEEDBACK_SAVE': {
      requireValue(payload.executionRecord || payload.feedbackRecord, '没有要保存的自愿反馈。');
      state.fixtureId = null;
      const submitted = payload.executionRecord || payload.feedbackRecord;
      const artifact = state.artifacts.find((item) => item.id === submitted.artifactId && item.version === submitted.artifactVersion);
      requireValue(artifact, '反馈需要关联已保存的行动内容。', 'invalid_transition');
      const common = { roundId: artifact.roundId, analysisId: artifact.analysisId, pathId: artifact.pathId, inputVersion: artifact.inputVersion, artifactId: artifact.id, artifactVersion: artifact.version, reportedAt: context.now, savedAt: context.now };
      function checkRecord(record) {
        requireValue(record.id === null || record.id === undefined, '基础版只追加新的自述记录。');
        for (const key of ['roundId', 'analysisId', 'pathId', 'inputVersion', 'artifactId', 'artifactVersion']) {
          if (record[key] !== undefined) requireValue(record[key] === common[key], '反馈引用必须属于同一份已保存成品。', 'invalid_structure');
        }
      }
      let executionId = null;
      if (payload.executionRecord) {
        const source = payload.executionRecord;
        checkRecord(source);
        requireValue(['unknown', 'intended', 'adopted', 'partial', 'declined'].includes(source.adoption ?? 'unknown') && ['unknown', 'not_started', 'partial', 'done'].includes(source.execution ?? 'unknown'), '执行状态不合法。');
        requireValue(source.scope == null || typeof source.scope === 'string', '实际改动范围必须是文字或未知。');
        const record = { ...common, id: context.newId(), adoption: source.adoption ?? 'unknown', execution: source.execution ?? 'unknown', scope: source.scope ?? null, executedAt: source.executedAt ?? null };
        state.executionRecords.push(record);
        executionId = record.id;
        if (record.adoption !== 'unknown') event('adoption_reported', { executionRecordId: record.id, artifactId: artifact.id, artifactVersion: artifact.version });
        if (record.execution !== 'unknown') event('execution_reported', { executionRecordId: record.id, artifactId: artifact.id, artifactVersion: artifact.version });
      }
      if (payload.feedbackRecord) {
        const source = payload.feedbackRecord;
        checkRecord(source);
        requireValue(['unknown', 'better', 'unchanged', 'worse'].includes(source.observation ?? 'unknown'), '观察状态不合法。');
        const record = { ...common, id: context.newId(), executionRecordId: executionId, observation: source.observation ?? 'unknown', rawText: source.rawText ?? '', metrics: source.metrics ?? [], observedWindow: source.observedWindow ?? { start: null, end: null } };
        requireValue(typeof record.rawText === 'string' && record.rawText.length <= 500 && Array.isArray(record.metrics), '反馈原话须不超过500字且指标为列表。');
        Object.assign(record, feedbackDetails(source));
        state.feedbackRecords.push(record);
        event('feedback_saved', { feedbackId: record.id, artifactId: artifact.id, artifactVersion: artifact.version });
        if (record.observation !== 'unknown') event('observation_reported', { feedbackId: record.id, artifactId: artifact.id, artifactVersion: artifact.version });
      } else event('feedback_saved', { executionRecordId: executionId, artifactId: artifact.id, artifactVersion: artifact.version });
      break;
    }
    case 'EXPERIMENT_ACCEPT': {
      const replay = matchesAcceptedExperimentPayload(state, payload);
      if (replay.ok) { changed = false; break; }
      const prepared = prepareExperimentAcceptance(state, payload);
      requireValue(prepared.ok, prepared.message, prepared.code);
      const review = prepared.review;
      const archive = { type: 'round', sourceFeedbackId: review.sourceFeedbackId, at: context.now,
        round: clone(state.round), input: clone(state.input), analysis: clone(state.analysis), selection: clone(state.selection) };
      state.history.push(archive);
      state.round = { id: context.newId(), index: state.round.index + 1, inputVersion: state.round.inputVersion + 1,
        clarification: blankClarification(), sourceFeedbackId: review.sourceFeedbackId,
        acceptedReviewFingerprint: review.fingerprint };
      state.fixtureId = null;
      state.input = carryExperimentInput(archive.input, state.round);
      const analysis = mapDrafts(buildAcceptedExperimentAnalysis(archive, state, review), context);
      analysis.id = analysis.id || context.newId();
      analysis.savedAt = context.now;
      analysis.inputSnapshot = clone(state.input);
      analysis.clarificationSnapshot = clone(state.round.clarification);
      state.analysis = analysis;
      state.selection = { analysisId: analysis.id, pathId: analysis.paths[0].id,
        inputVersion: state.round.inputVersion, selectedAt: context.now, sourceFeedbackId: review.sourceFeedbackId };
      state.artifacts.forEach((artifact) => { artifact.status = 'stale'; });
      state.history.push(makeExperimentAcceptanceRecord(review, state, context.now, context.newId()));
      const accepted = matchesAcceptedExperimentPayload(state, payload);
      requireValue(accepted.ok, accepted.message, accepted.code);
      validateAnalysis(analysis, state);
      roundLink = { feedbackId: review.sourceFeedbackId, roundId: state.round.id,
        kind: 'experiment_acceptance', analysisId: analysis.id, pathId: state.selection.pathId,
        reviewFingerprint: review.fingerprint };
      event('round_started', { feedbackId: review.sourceFeedbackId });
      event('path_selected', { analysisId: analysis.id, pathId: state.selection.pathId, inputVersion: state.round.inputVersion });
      break;
    }

    case 'ROUND_START': {
      const feedback = state.feedbackRecords.find((record) => record.id === payload.feedbackId);
      requireValue(feedback && feedback.roundId === state.round.id, '请先保存本轮反馈，再开始下一轮。', 'invalid_transition');
      state.history.push({ type: 'round', sourceFeedbackId: feedback.id, at: context.now, round: clone(state.round), input: clone(state.input), analysis: clone(state.analysis), selection: clone(state.selection) });
      const wasConfirmed = state.input.confirmedVersion === state.round.inputVersion;
      state.round = { id: context.newId(), index: state.round.index + 1, inputVersion: state.round.inputVersion + 1, clarification: blankClarification() };
      state.input.constraints = state.input.constraints.filter((constraint) => constraint.scope !== 'round');
      state.input.facts = state.input.facts.filter((fact) => !fact.key.startsWith('round_constraint_'));
      state.input.confirmedVersion = wasConfirmed ? state.round.inputVersion : null;
      state.analysis = null;
      state.selection = null;
      state.artifacts.forEach((artifact) => { artifact.status = 'stale'; });
      roundLink = { feedbackId: feedback.id, roundId: state.round.id };
      event('round_started', { feedbackId: feedback.id });
      break;
    }
    case 'EVENT_APPEND': {
      const entry = payload.event;
      requireValue(entry && allowedEvents.has(entry.type), '页面不能伪造业务保存或执行事件。', 'invalid_transition');
      const refs = entry.refs || {};
      for (const [key, value] of Object.entries(refs)) {
        requireValue(refKeys.has(key), '操作记录包含不允许的字段。');
        if (key === 'pageId') requireValue(PAGE_IDS.includes(value), '页面标识不合法。');
        else if (key === 'format') requireValue(['html', 'txt'].includes(value), '导出格式不合法。');
        else if (key === 'sourceId') requireValue(validSourceId(value, state), '来源已更新或不存在。', 'invalid_structure');
        else if (['inputVersion', 'artifactVersion', 'stateRevision'].includes(key)) requireValue(Number.isInteger(value) && value >= 0, '版本不合法。');
        else validId(value);
      }
      if (entry.roundId !== undefined) requireValue(entry.roundId === state.round.id || state.history.some((item) => item.round?.id === entry.roundId), '轮次引用不存在。', 'invalid_structure');
      state.events.push({ id: context.newId(), type: entry.type, roundId: entry.roundId || state.round.id, at: context.now, refs: clone(refs) });
      break;
    }
    case 'RESET_SESSION': {
      requireValue(payload.confirmed === true, '清空需要明确确认。', 'invalid_transition');
      const empty = createEmptyState(context);
      empty.sessionId = state.sessionId;
      empty.revision = state.revision;
      empty.round.inputVersion = state.round.inputVersion + 1;
      Object.assign(state, empty);
      effects.clearSession = true;
      break;
    }
    default: fail('invalid_transition', '未知共享命令，未写入本地记录。');
  }
  if (!changed) return { state: original, changed: false, effects, roundLink: null };
  if (inputChanged) {
    invalidate(state, context);
    // The original facts retain their source notes; new user input is never relabelled as synthetic.
    const preserveRoadshowFixture = command.type === 'INTAKE_SET'
      && original.fixtureId === ROADSHOW_SHOE_FIXTURE_ID
      && original.input.description === ''
      && matchesRoadshowShoeQuestion(state.input.description)
      && hasRoadshowShoeFixtureCore(original) && hasRoadshowShoeFixtureCore(state)
      && same(original.input.materials, state.input.materials)
      && same(original.input.facts, state.input.facts)
      && same(original.input.constraints, state.input.constraints)
      && same(original.input.unknowns, state.input.unknowns)
      && same(original.input.intake?.draft, state.input.intake?.draft)
      && same(original.input.intake?.sourceBindings, state.input.intake?.sourceBindings);
    if (!preserveRoadshowFixture) state.fixtureId = null;
    if (state.input.intake && (command.type === 'INPUT_EDIT'
      || command.type === 'FACT_PATCH' && patchedIntake
      || ['MATERIAL_REMOVE', 'MATERIAL_REPLACE'].includes(command.type)
        && state.input.intake.sourceBindings.some((binding) => binding.materialId === payload.materialId))) {
      state.input.intake.status = 'stale';
    }
  }
  state.revision = original.revision + 1;
  state.savedAt = context.now;
  state.events.push(...events);
  if (command.type !== 'EVENT_APPEND') state.events.push({ id: context.newId(), type: 'session_saved', roundId: state.round.id, at: context.now, refs: { stateRevision: state.revision } });
  assertState(state);
  return { state, changed: true, effects, roundLink };
}
