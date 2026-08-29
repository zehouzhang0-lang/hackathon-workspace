// Read-only projections for the workspace shell. IndexedDB remains the only store.
import { findIntakeFieldFact } from './intake-draft.js';

const SOURCE_KINDS = new Set(['merchant_statement', 'file_extract', 'derived', 'public_reference', 'scenario_assumption']);
const MEMORY_FIELDS = ['merchantName', 'productName', 'currentProblem'];

const traceableSource = (fact, field = null) => {
  const source = fact?.source, locator = source?.locator;
  if (!source || !SOURCE_KINDS.has(source.kind)) return false;
  if (source.kind === 'file_extract') {
    return typeof source.materialId === 'string' && Number.isInteger(source.materialVersion)
      && locator && typeof locator === 'object' && !Array.isArray(locator);
  }
  if (source.kind === 'merchant_statement' && field) {
    return locator?.type === 'intake' && locator.field === field
      || locator?.type === 'correction' && fact.intakeField === field;
  }
  return true;
};

const knownFact = (fact, field = null) => Boolean(fact && fact.availability === 'known'
  && fact.value !== null && fact.value !== undefined && fact.verification !== 'conflicting'
  && traceableSource(fact, field));

const meaningfulInput = (input) => Boolean(input?.description?.trim() || input?.materials?.length
  || input?.facts?.some((fact) => knownFact(fact)));

function projectedField(state, field) {
  const fact = findIntakeFieldFact(state, field);
  return fact ? { present: true, fact, value: knownFact(fact, field) ? fact.value : null }
    : { present: false, fact: null, value: null };
}

// Older or partially written records may contain a populated intake draft without
// the fact that INTAKE_SET persists with its provenance. Keep that draft out of
// workspace/archive projections; it remains untouched in the source state.
function projectedInput(state, input) {
  const draft = input?.intake?.draft;
  if (!draft) return input;
  const scoped = { ...state, input };
  const values = Object.fromEntries(MEMORY_FIELDS.map((field) => [field, projectedField(scoped, field).value]));
  if (MEMORY_FIELDS.every((field) => Object.is(draft[field], values[field]))) return input;
  return { ...input, intake: { ...input.intake, draft: { ...draft, ...values } } };
}

export function workspaceFeedbackSource(state, feedback) {
  const sameScope = (item) => item && ['roundId', 'analysisId', 'pathId', 'inputVersion'].every((key) => item[key] === feedback[key]);
  const artifact = state.artifacts.find((item) => item.id === feedback.artifactId
    && item.version === feedback.artifactVersion && sameScope(item)) || null;
  const execution = state.executionRecords.find((item) => item.id === feedback.executionRecordId
    && item.artifactId === feedback.artifactId && item.artifactVersion === feedback.artifactVersion && sameScope(item)) || null;
  const analysis = [state.analysis, ...state.history.map((entry) => entry.analysis)].find((item) => item
    && item.id === feedback.analysisId && item.roundId === feedback.roundId && item.inputVersion === feedback.inputVersion);
  const path = analysis?.paths?.find((item) => item.id === feedback.pathId) || null;
  return { artifact, execution, path };
}

export function workspaceRounds(state) {
  const rounds = new Map();
  for (const entry of state.history) {
    if (entry.type === 'round' && entry.round?.id
      && (meaningfulInput(entry.input) || entry.analysis || entry.selection)) {
      rounds.set(entry.round.id, { ...entry, input: projectedInput(state, entry.input), archived: true });
    }
  }
  if (meaningfulInput(state.input) || state.analysis || state.selection) {
    rounds.set(state.round.id, {
      round: state.round, input: projectedInput(state, state.input), analysis: state.analysis, selection: state.selection,
      at: state.savedAt, archived: false
    });
  }
  return [...rounds.values()].sort((a, b) => b.round.index - a.round.index).map((entry) => {
    const artifacts = state.artifacts.filter((item) => item.roundId === entry.round.id);
    const feedbacks = state.feedbackRecords.filter((item) => item.roundId === entry.round.id);
    const executions = state.executionRecords.filter((item) => item.roundId === entry.round.id);
    const path = entry.selection?.analysisId === entry.analysis?.id
      ? entry.analysis?.paths?.find((item) => item.id === entry.selection.pathId) : null;
    const currentScope = (item) => path && item.analysisId === entry.analysis.id && item.pathId === path.id
      && item.inputVersion === entry.round.inputVersion;
    const status = entry.archived ? '已归档'
      : entry.analysis?.status === 'stale' ? '资料已更新，待重新分析'
      : feedbacks.some(currentScope) ? '反馈已保存'
      : artifacts.some((item) => currentScope(item) && item.status === 'current') ? '已有交付稿'
      : path ? '已选择方案'
      : entry.analysis ? '等待选择'
      : entry.input?.confirmedVersion === entry.round.inputVersion ? '资料已确认' : '资料整理中';
    return { ...entry, artifacts, feedbacks, executions, path, status };
  });
}

export function workspaceMemory(state) {
  const strings = (items = []) => items.map((item) => typeof item === 'string' ? item : item.description
    ? item.description + (item.value === null || item.value === undefined ? '' : '：' + item.value + (item.unit || '')) : null).filter(Boolean);
  // Only the provenance-bound fact written by INTAKE_SET can populate a draft
  // field here. An API response that is still only an editable page draft is not
  // business memory. An explicit unknown also blocks any older fallback value.
  const fieldValue = (field, fallback = null) => {
    const projected = projectedField(state, field);
    if (projected.present) {
      if (projected.value === null) return null;
      return projected.fact.evidenceStatus === 'owner_hypothesis'
        ? String(projected.value) + '（商家假设，待验证）' : projected.value;
    }
    return state.input.intake?.status === 'stale' ? null : fallback;
  };
  const savedDescription = typeof state.input.description === 'string' && state.input.description.trim()
    ? state.input.description.trim() : null;
  return {
    merchant: fieldValue('merchantName'),
    product: fieldValue('productName'),
    problem: fieldValue('currentProblem', savedDescription),
    constraints: [...new Set(strings(state.input.constraints))],
    unknowns: [...new Set(strings(state.input.unknowns))],
    materialCount: state.input.materials.length,
    knownFactCount: state.input.facts.filter((fact) => knownFact(fact)).length,
    archivedRoundCount: workspaceRounds(state).filter((entry) => entry.archived).length,
    stale: state.input.intake?.status === 'stale',
    synthetic: Boolean(state.fixtureId || state.analysis?.sourceFixtureId || state.analysis?.experimentReview?.sourceFixtureId
      || state.analysis?.mode === 'demo_fixture' || state.input.facts.some((fact) => /合成演示|合成案例|虚构/.test(fact.source?.note || '')))
  };
}
