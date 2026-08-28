// Read-only projections for the workspace shell. IndexedDB remains the only store.
import { findIntakeFieldFact } from './intake-draft.js';

const meaningfulInput = (input) => Boolean(input?.description?.trim() || input?.materials?.length || input?.intake);

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
    if (entry.type === 'round' && entry.round?.id) rounds.set(entry.round.id, { ...entry, archived: true });
  }
  if (meaningfulInput(state.input) || state.analysis || state.selection) {
    rounds.set(state.round.id, {
      round: state.round, input: state.input, analysis: state.analysis, selection: state.selection,
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
  const draft = state.input.intake?.draft;
  const strings = (items = []) => items.map((item) => typeof item === 'string' ? item : item.description
    ? item.description + (item.value === null || item.value === undefined ? '' : '：' + item.value + (item.unit || '')) : null).filter(Boolean);
  // A changed fact takes precedence over the old confirmation draft, including an explicit unknown.
  const fieldValue = (field, fallback) => {
    const fact = findIntakeFieldFact(state, field);
    if (fact) {
      if (fact.availability !== 'known' || fact.verification === 'conflicting') return null;
      return fact.evidenceStatus === 'owner_hypothesis' ? String(fact.value) + '（商家假设，待验证）' : fact.value;
    }
    return state.input.intake?.status === 'stale' ? null : fallback;
  };
  return {
    merchant: fieldValue('merchantName', draft?.merchantName) || null,
    product: fieldValue('productName', draft?.productName) || null,
    problem: fieldValue('currentProblem', draft?.currentProblem || state.input.description) || null,
    constraints: [...new Set(strings(state.input.constraints))],
    unknowns: [...new Set(strings(state.input.unknowns))],
    materialCount: state.input.materials.length,
    knownFactCount: state.input.facts.filter((fact) => fact.availability === 'known').length,
    archivedRoundCount: workspaceRounds(state).filter((entry) => entry.archived).length,
    stale: state.input.intake?.status === 'stale',
    synthetic: Boolean(state.fixtureId || state.analysis?.sourceFixtureId || state.analysis?.experimentReview?.sourceFixtureId
      || state.analysis?.mode === 'demo_fixture' || state.input.facts.some((fact) => /合成演示|合成案例|虚构/.test(fact.source?.note || '')))
  };
}
