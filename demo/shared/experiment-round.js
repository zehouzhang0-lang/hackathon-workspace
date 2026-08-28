import { buildExperimentReview } from './experiment-memory.js';
import { buildDemoBreakpoint, buildDemoDataQuality, juicerProductFacts } from './analysis-evidence.js';

// C8 pure validation/building only. The existing reducer owns the single write transaction.
const copy = structuredClone;
const id = (value) => typeof value === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(value) && !value.startsWith('draft_');
const hash = (value) => typeof value === 'string' && /^sha256:[a-f0-9]{64}$/.test(value);
const timestamp = (value) => typeof value === 'string' && Number.isFinite(Date.parse(value))
  && new Date(value).toISOString() === value;
const reviewBusiness = ({ sourceRevision, ...review }) => review;
const text = (value) => typeof value === 'string' && value.trim().length > 0;
const canonical = (value) => JSON.stringify(value, function (key, entry) {
  return entry && typeof entry === 'object' && !Array.isArray(entry)
    ? Object.fromEntries(Object.keys(entry).sort().map((name) => [name, entry[name]])) : entry;
});
const same = (left, right) => canonical(left) === canonical(right);
function requireValue(value, message, code = 'stale_input') {
  if (!value) throw Object.assign(new Error(message), { code });
}
const failed = (error) => ({ ok: false, code: error.code || 'invalid_structure', message: error.message || '未能完整核对候选，原记录保留。' });
const scoped = (record, review) => record && ['roundId', 'inputVersion', 'analysisId', 'pathId'].every((key) => record[key] === review[key]);

function readReview(state, feedbackId) {
  const result = buildExperimentReview(state, feedbackId);
  requireValue(result.ok, result.message, result.code);
  const review = result.review;
  requireValue(review.decision === 'change_variable' && review.source === 'local_fallback' && review.moneyaiCalled === false
    && review.evidence.sourceFixtureId === 'juicer_cup_v1' && review.evidence.analysisMode === 'demo_fixture'
    && review.priorAction.actionKey === 'juicer_first_screen'
    && review.priorAction.experimentId === 'EXP-JUICER01-click_cart-A-R1'
    && review.nextAction?.status === 'candidate' && review.nextAction.actionKey === 'juicer_faq'
    && review.nextAction.optionLabel === 'A' && review.nextAction.experimentId === 'EXP-JUICER01-click_cart-A-R2'
    && review.nextAction.singleVariable === '购买问答区', '当前反馈没有可接受的首屏→购买问答区候选。', 'invalid_transition');
  requireValue(!review.nextAction.constraints.some((value) =>
    /(?:购买)?问答区[^，。；\n]*(?:不能|无法|不可|不允许)[^，。；\n]*(?:改|动|调整)/.test(value)
    || /(?:不能|无法|不可|不允许)[^，。；\n]*(?:改|动|调整)[^，。；\n]*(?:购买)?问答区/.test(value)),
  '当前限制明确禁止调整购买问答区，不能接受这一候选。', 'invalid_transition');
  return review;
}

function latestSourceRecords(state, review) {
  const feedbacks = state.feedbackRecords.filter((record) => scoped(record, review));
  const executions = state.executionRecords.filter((record) => scoped(record, review));
  requireValue(feedbacks.at(-1)?.id === review.sourceFeedbackId, '这条反馈后已有相关反馈，请重新查看改判，未接受旧候选。');
  requireValue(executions.at(-1)?.id === review.sourceExecutionId, '关联执行自述已更新，请重新核对，未接受旧候选。');
}

function checkPayload(payload) {
  requireValue(payload && id(payload.feedbackId) && hash(payload.reviewFingerprint) && id(payload.roundId)
    && Number.isSafeInteger(payload.inputVersion) && payload.inputVersion > 0
    && Object.keys(payload).every((key) => ['feedbackId', 'reviewFingerprint', 'roundId', 'inputVersion'].includes(key)),
  '接受命令只允许指定反馈、候选指纹及原轮次/输入版本。', 'invalid_payload');
}

export function prepareExperimentAcceptance(state, payload) {
  try {
    checkPayload(payload);
    requireValue(state.round.id === payload.roundId && state.round.inputVersion === payload.inputVersion
      && state.input.confirmedVersion === state.round.inputVersion, '原轮次或输入已变化，未建立下一轮。');
    requireValue(!state.history.some((entry) => entry.sourceFeedbackId === payload.feedbackId
      && ['round', 'experiment_acceptance'].includes(entry.type)), '此反馈已经关联一个轮次，不能补造第二轮。', 'invalid_transition');
    const review = readReview(state, payload.feedbackId);
    requireValue(review.fingerprint === payload.reviewFingerprint && review.roundId === state.round.id
      && review.inputVersion === state.round.inputVersion && review.sessionId === state.sessionId, '候选依据或会话已经变化，请重读。');
    latestSourceRecords(state, review);
    const analysis = state.analysis;
    requireValue(state.fixtureId === null && state.round.index === 1
      && analysis?.id === review.analysisId && analysis.roundId === review.roundId
      && analysis.inputVersion === review.inputVersion && ['ready', 'limited'].includes(analysis.status)
      && state.selection?.analysisId === analysis.id && state.selection.pathId === review.pathId
      && state.selection.inputVersion === state.round.inputVersion, '当前分析或显式选择与原实验不同，未接受历史候选。');
    requireValue(same(state.input, analysis.inputSnapshot), '当前输入与原确认快照不一致，未复用旧事实。');
    return { ok: true, review };
  } catch (error) { return failed(error); }
}

export function carryExperimentInput(sourceInput, nextRound) {
  const input = copy(sourceInput);
  input.confirmedVersion = nextRound.inputVersion;
  if (input.intake) {
    input.intake.roundId = nextRound.id;
    input.intake.inputVersion = nextRound.inputVersion;
  }
  // Original operating constraints remain; learned restrictions stay attributed to feedback.
  return input;
}

function reviewSource(review) {
  return { version: 1, sourceFeedbackId: review.sourceFeedbackId, reviewFingerprint: review.fingerprint,
    sourceRoundId: review.roundId, sourceInputVersion: review.inputVersion, sourceAnalysisId: review.analysisId,
    sourcePathId: review.pathId, sourceArtifactId: review.artifactId, sourceArtifactVersion: review.artifactVersion,
    sourceExecutionId: review.sourceExecutionId, sourceExperimentId: review.priorAction.experimentId,
    sourceFixtureId: review.evidence.sourceFixtureId };
}

export function buildAcceptedExperimentAnalysis(archive, nextState, review) {
  requireValue(archive?.analysis?.id === review.analysisId && archive.round.id === review.roundId
    && archive.selection?.pathId === review.pathId && nextState.round.index === 2,
  '不能从其他历史记录生成第二轮。', 'invalid_structure');
  const sourcePath = archive.analysis.paths.find((path) => path.id === review.pathId);
  requireValue(sourcePath && sourcePath.actionKey === 'juicer_first_screen', '原实验路径不完整。', 'invalid_structure');
  const product = juicerProductFacts(nextState.input);
  requireValue(product.capacity && product.charging && product.shipping && product.cleaning,
    '原已确认商品事实缺失或冲突，不能生成第二轮稿。', 'invalid_structure');
  const analysis = copy(archive.analysis), path = copy(sourcePath), candidate = review.nextAction;
  const condition = (value, factIds = []) => ({ text: value, sourceFactIds: factIds, assumptionIds: [] });
  const productIds = [product.capacity.id, product.charging.id, product.shipping.id, product.cleaning.id];
  path.id = null;
  path.actionKey = 'juicer_faq'; path.optionLabel = 'A';
  path.title = candidate.title.replace(/^下一轮候选：/, '');
  path.action = candidate.action.replace('再考虑只调整', '只调整');
  path.validationMetric = '商品点击到加购率（同商品、同窗口、同渠道的加购次数 / 商品点击次数）';
  path.cost.time.note = '仅调整购买问答区；实际耗时未知，不重复改详情页首屏或商品标题。';
  path.cost.money.note = '不改变价格或投流是本轮计划，不表示实际总成本或损失为0。';
  path.prerequisites = [
    { ...condition('先核对真实购买问题与已确认商品资料，不假装已有最高频问题证据', productIds), status: 'unknown' },
    { ...condition('能只修改购买问答区并保存原版本；保持已改首屏和商品标题不变'), status: 'unknown' },
    ...candidate.constraints.map((value) => ({ ...condition('继续遵守原资料或反馈限制：' + value), status: 'unknown' }))
  ];
  path.risk.forEach((entry) => { entry.description = '如果问题来自商品竞争力，问答信息优化帮助可能有限；未经核实的性能或售后说明会增加风险。'; });
  path.experiment = { ...path.experiment,
    experimentId: candidate.experimentId, round: 2, change: candidate.singleVariable,
    keepFixed: ['商品与商品标题', '已调整的详情页首屏及购买问答区以外内容', '价格', '投流设置与流量来源'],
    target: copy(candidate.target), minSample: candidate.minSample, minSampleUnit: candidate.minSampleUnit,
    sourceFactIds: copy(candidate.sourceFactIds), sourceFeedbackId: review.sourceFeedbackId,
    constraintsLearned: copy(review.constraintsLearned), constraints: copy(candidate.constraints),
    limitations: [...new Set([...path.experiment.limitations,
      '本轮由商家明确接受购买问答区候选建立；未记录本轮采用或执行。',
      '上一轮无明显变化仅是商家自述，计划样本不是统计保证，不认定首屏已被科学证伪。',
      ...candidate.constraints.map((value) => '原资料或反馈限制：' + value)])],
    restoreSteps: [condition('实施前保存购买问答区原版本；不修改商品标题和已调整首屏'),
      condition('出现风险时先暂停核对，由商家决定是否手动恢复问答区原版本；应用不操作平台')]
  };
  Object.assign(analysis, { id: null, savedAt: null, roundId: nextState.round.id, inputVersion: nextState.round.inputVersion,
    sourceFixtureId: null, mode: 'local_limited', status: 'ready', analysisSource: 'local_fallback',
    sourceFeedbackId: review.sourceFeedbackId, experimentReview: reviewSource(review),
    paths: [path], reviewId: null, reviewIds: [],
    summary: '已接受下一轮购买问答区实验；不再重复修改首屏。' + review.reason,
    funnel: copy(archive.analysis.funnel),
    funnelSource: { kind: 'accepted_prior_snapshot', analysisId: review.analysisId,
      roundId: review.roundId, inputVersion: review.inputVersion } });
  analysis.routing = buildDemoBreakpoint(analysis.funnel);
  analysis.dataQuality = buildDemoDataQuality(analysis.funnel);
  analysis.priority = { ...analysis.priority, title: '下一轮先验证：购买问答区', reason: review.reason,
    rootCauseConfirmed: false, unknowns: [...new Set([...analysis.priority.unknowns, ...review.unknowns])] };
  analysis.limitations = [...new Set([...analysis.limitations,
    '当前是已接受的本机历史反馈候选；未调用MoneyAI或真实模型读取记忆。',
    '原合成资料来源保留在原分析；当前fixtureId不恢复，反馈不重标为合成商家事实。',
    '沿用原已保存漏斗只作先前依据；新增点击样本单独来自反馈自述，未拼入原时间窗。',
    '接受、采用、执行与结果不同；新轮次没有默认执行状态。'])];
  analysis.processing = [
    { name: '本机历史来源与反馈链核对', kind: 'local_rule', status: 'done' },
    { name: '本机反馈候选规则', kind: 'local_rule', status: 'done' },
    { name: '商家明确接受后的单一变量建立', kind: 'local_rule', status: 'done' }
  ];
  delete analysis.inputSnapshot; delete analysis.clarificationSnapshot;
  return analysis;
}

function normalizedAnalysis(analysis) {
  return { ...analysis, id: null, savedAt: null, inputSnapshot: null, clarificationSnapshot: null,
    paths: analysis.paths.map((path) => ({ ...path, id: null })) };
}

export function makeExperimentAcceptanceRecord(review, state, at, recordId) {
  const path = state.analysis.paths[0];
  return { id: recordId, type: 'experiment_acceptance', at, sourceFeedbackId: review.sourceFeedbackId,
    reviewFingerprint: review.fingerprint, source: reviewSource(review), review: copy(review),
    destination: { roundId: state.round.id, inputVersion: state.round.inputVersion,
      analysisId: state.analysis.id, pathId: path.id, experimentId: path.experiment.experimentId } };
}

/** True only for a complete active accepted round, never an ordinary ROUND_START shell. */
export function getAcceptedExperimentRound(state, feedbackId, reviewFingerprint = null) {
  try {
    requireValue(id(feedbackId), '反馈标识不合法。', 'invalid_payload');
    const records = state.history.filter((entry) => entry.type === 'experiment_acceptance' && entry.sourceFeedbackId === feedbackId);
    requireValue(records.length === 1, '未找到唯一且完整的已接受记录。', records.length ? 'invalid_structure' : 'not_found');
    const record = records[0], destination = record.destination;
    requireValue(id(record.id) && timestamp(record.at), '接受记录的标识或保存时间缺失／不合法。', 'invalid_structure');
    requireValue(record.review && typeof record.review === 'object' && !Array.isArray(record.review)
      && record.review.version === 1 && Number.isSafeInteger(record.review.sourceRevision)
      && record.review.sourceRevision >= 0 && record.review.sourceRevision <= state.revision,
    '接受记录缺少完整的已保存候选。', 'invalid_structure');
    requireValue(!reviewFingerprint || record.reviewFingerprint === reviewFingerprint, '已接受记录与候选指纹不一致。');
    const review = readReview(state, feedbackId);
    requireValue(review.fingerprint === record.reviewFingerprint && same(record.source, reviewSource(review)), '原反馈或计划已变化，未把旧接受记录当作本次成功。');
    requireValue(same(reviewBusiness(record.review), reviewBusiness(review)),
      '已保存候选与重新核对的业务内容不一致，未把残缺或改写记录当作成功。', 'invalid_structure');
    latestSourceRecords(state, review);
    const archives = state.history.filter((entry) => entry.type === 'round' && entry.sourceFeedbackId === feedbackId);
    requireValue(archives.length === 1 && archives[0].round.id === review.roundId, '原轮次归档缺失或不唯一。', 'invalid_structure');
    const archive = archives[0];
    requireValue(same(archive.input, archive.analysis.inputSnapshot)
      && archive.selection?.analysisId === review.analysisId && archive.selection.pathId === review.pathId,
    '原轮次归档与原选择/输入不一致。', 'invalid_structure');
    requireValue(state.fixtureId === null && state.round.id === destination.roundId && state.round.index === 2
      && state.round.inputVersion === destination.inputVersion && state.round.inputVersion === archive.round.inputVersion + 1
      && state.round.sourceFeedbackId === feedbackId && state.round.acceptedReviewFingerprint === record.reviewFingerprint
      && state.input.confirmedVersion === state.round.inputVersion
      && same(state.input, carryExperimentInput(archive.input, state.round)), '已接受轮次已变化或输入未完整读回。');
    const analysis = state.analysis, selection = state.selection;
    requireValue(analysis?.id === destination.analysisId && analysis.roundId === state.round.id
      && analysis.inputVersion === state.round.inputVersion && analysis.status === 'ready'
      && same(analysis.inputSnapshot, state.input) && selection?.analysisId === analysis.id
      && selection.pathId === destination.pathId && selection.inputVersion === state.round.inputVersion
      && selection.selectedAt === record.at && selection.sourceFeedbackId === feedbackId
      && analysis.paths.length === 1 && analysis.paths[0].id === destination.pathId
      && analysis.paths[0].experiment.experimentId === destination.experimentId,
    '新轮、分析和唯一选择尚未全部有效，不能宣称接受完成。');
    const expected = buildAcceptedExperimentAnalysis(archive, state, review);
    requireValue(same(normalizedAnalysis(analysis), normalizedAnalysis(expected)), '已接受分析不再等于已核验候选，不能放宽来源。', 'invalid_structure');
    return { ok: true, accepted: true, sourceFeedbackId: feedbackId, reviewFingerprint: record.reviewFingerprint,
      acceptanceId: record.id, acceptedAt: record.at, source: copy(record.source), ...copy(destination) };
  } catch (error) { return failed(error); }
}

export function matchesAcceptedExperimentPayload(state, payload) {
  try {
    checkPayload(payload);
    const result = getAcceptedExperimentRound(state, payload.feedbackId, payload.reviewFingerprint);
    requireValue(result.ok, result.message, result.code);
    requireValue(result.source.sourceRoundId === payload.roundId && result.source.sourceInputVersion === payload.inputVersion,
      '重试命令不是原接受轮次和版本。');
    return result;
  } catch (error) { return failed(error); }
}

export function isAcceptedExperimentAnalysis(analysis, state) {
  const source = analysis?.experimentReview;
  return Boolean(source?.version === 1 && same(analysis, state.analysis)
    && getAcceptedExperimentRound(state, source.sourceFeedbackId, source.reviewFingerprint).ok);
}
