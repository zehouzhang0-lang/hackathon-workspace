import { enhanceFoldTitle } from '../shared/title-motion.js';
import { buildExperimentReview } from '../shared/experiment-memory.js';

const CONTRACT_VERSION = 'demo.v1';
const EXECUTION_LABELS = { unknown: '执行情况未知', not_started: '还没执行', partial: '做了一部分', done: '自述已完成' };
const ADOPTION_LABELS = { unknown: '采用情况未知', intended: '有意采用，尚未确认采用', adopted: '已采用', partial: '采用了一部分', declined: '没有采用' };
const GUARDRAIL_LABELS = { unknown: '异常情况未知', clear: '暂未见明显异常（商家自述）', triggered: '自述发现异常，需核对' };
const REVIEW_LABELS = { pause: '先暂停并核对', needs_information: '还需要补充信息',
  continue_observation: '继续观察当前变量', change_variable: '可以评估下一变量' };
const REVIEW_TREATMENTS = {
  pause: '保留原稿，先核对异常与原计划停止条件；页面没有自动暂停或回滚。',
  needs_information: '保留本轮记录，先补清实际改动、执行或同口径数据，不记为实验失败。',
  continue_observation: '保留当前行动与观察，不自动更换变量或宣称建议有效。',
  change_variable: '保留这轮原稿和反馈，评估共享返回的候选；是否已经接受，以单独核对的接受记录为准。',
};
const OBSERVATION_LABELS = { unknown: '观察结果未知', better: '感觉好一些', unchanged: '感觉没变化', worse: '感觉变差' };
const SOURCE_LABELS = { merchant_statement: '商家自述', file_extract: '文件提取，待核对', derived: '派生计算', public_reference: '公共参考', scenario_assumption: '情景假设' };
const INTAKE_SOURCE_LABELS = { voice: '语音转写', paste: '粘贴文字', manual: '手动填写', txt: 'TXT 材料', csv: 'CSV 材料', json: 'JSON 材料' };
const EVIDENCE_STATUS_LABELS = { confirmed_fact: '商家确认理解，未外部核验', owner_hypothesis: '商家判断，待验证', unknown: '未知，未补值' };
const INTAKE_FIELD_LABELS = { merchantName: '商家名称', productName: '具体商品', category: '商品类目', price: '价格', specifications: '规格',
  platform: '经营平台', desiredAction: '希望改变的动作', targetCustomerHypothesis: '目标人群判断', usageScenarioHypothesis: '使用场景判断',
  purchaseReasonHypothesis: '购买原因判断', differentiationHypothesis: '差异判断', currentProblem: '本轮问题',
  'metrics.windowStart': '观察开始日期', 'metrics.windowEnd': '观察结束日期', 'metrics.videoViews': '视频观看次数',
  'metrics.productClicks': '商品点击次数', 'metrics.addToCarts': '加购次数', 'metrics.createdOrders': '创建订单数', 'metrics.paidOrders': '支付订单数',
  confirmedProductFacts: '商家确认的商品信息', proofMaterials: '证明材料', previousAttempts: '已尝试的动作', constraints: '本轮限制',
  customerQuestions: '顾客问题', unknowns: '重要未知' };
const FIELD_LABELS = { video_views: '播放次数', product_clicks: '商品点击', add_to_carts: '加购', click_to_cart_rate: '商品点击后的加购率', created_orders: '下单', paid_orders: '支付订单', product_detail_visitors: '商品详情访客', price: '价格', units_per_order: '每单件数',
  external_length: '单只外长', external_width: '单只外宽', external_height: '单只外高', dimension_scope: '尺寸口径',
  current_title: '现有标题', current_opening: '现有说明开头', selected_inquiries: '精选咨询' };
const EXECUTION_SKILL_LABELS = { 'douyin-copywriter': '抖音文案', 'douyin-video-creation': '抖音视频创作', 'douyin-live-ops': '抖音直播运营' };
const ANALYSIS_SKILL_IDS = Object.freeze(['douyin-data-analysis', 'douyin-account-diagnosis']);
const SKILL_RECEIPT_CONTRACT = 'luya.moneyai.v1';
const SKILL_OPERATION_ID = /^[A-Za-z0-9._:-]{1,120}$/;
const SKILL_INPUT_FINGERPRINT = /^sha256:[a-f0-9]{64}$/;

function textValue(value, fallback = '未知') {
  if (value === null || value === undefined || value === '') return fallback;
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  return fallback;
}

function sameReference(a, b) {
  return Boolean(a && b && a.roundId === b.roundId && a.analysisId === b.analysisId &&
    a.pathId === b.pathId && a.inputVersion === b.inputVersion);
}

export function activeSelection(state) {
  if (!state || state.contractVersion !== CONTRACT_VERSION) return null;
  const { round, input, analysis, selection } = state;
  if (!round || !input || !analysis || !selection || input.confirmedVersion !== round.inputVersion ||
      analysis.roundId !== round.id || analysis.inputVersion !== round.inputVersion ||
      !['ready', 'limited'].includes(analysis.status) || selection.analysisId !== analysis.id ||
      selection.inputVersion !== round.inputVersion) return null;
  const path = analysis.paths?.find((item) => item.id === selection.pathId);
  if (!path) return null;
  return { roundId: round.id, roundIndex: round.index, analysisId: analysis.id, pathId: path.id,
    inputVersion: round.inputVersion, mode: analysis.mode, path };
}

export function currentArtifacts(state, context = activeSelection(state)) {
  if (!context) return [];
  const latest = new Map();
  for (const artifact of state.artifacts ?? []) {
    if (!sameReference(artifact, context) || artifact.status !== 'current' || !artifact.id || artifact.version < 1) continue;
    if (!latest.has(artifact.id) || latest.get(artifact.id).version < artifact.version) latest.set(artifact.id, artifact);
  }
  return [...latest.values()];
}

function previewArtifactKey(artifact) {
  return artifact.id ? `${artifact.id}:${artifact.version}`
    : JSON.stringify([artifact.roundId, artifact.analysisId, artifact.pathId, artifact.inputVersion, artifact.kind, artifact.title, artifact.body]);
}

export function selectPreviewArtifact(artifacts, key) {
  return artifacts.find((artifact) => previewArtifactKey(artifact) === key) ?? artifacts[0] ?? null;
}

export function artifactPreviewText(artifact, part = 'content') {
  if (part === 'content') return textValue(artifact?.body, '');
  if (part === 'steps') return (artifact?.usage?.steps ?? []).map((step, index) => `${index + 1}. ${step}`).join('\n');
  throw new Error('未知的预览方式。');
}

export function hasFeedbackDetailsInput(draft = {}) {
  const filled = (value) => value !== undefined && value !== null && String(value).trim() !== '';
  return (draft.adoption ?? 'unknown') !== 'unknown' || (draft.guardrailStatus ?? 'unknown') !== 'unknown' ||
    ['reason', 'sampleSize', 'metricBeforePercent', 'metricAfterPercent', 'constraintsText'].some((key) => filled(draft[key]));
}

function feedbackHasContent(draft) {
  return Boolean(draft.rawText?.trim() || draft.scope?.trim() || draft.executedAt ||
    (draft.execution ?? 'unknown') !== 'unknown' || (draft.observation ?? 'unknown') !== 'unknown' || hasFeedbackDetailsInput(draft));
}

function optionalFeedbackText(value, label, limit) {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string' || value.length > limit) throw new Error(label + '最多 ' + limit + ' 字，请保留原意后自行精简。');
  return value.trim() || null;
}

function feedbackNumber(value, label, percentage = false) {
  if (value === null || value === undefined || (typeof value === 'string' && !value.trim())) return null;
  if (!['string', 'number'].includes(typeof value)) throw new Error(label + '请填写有效数字或留空。');
  const raw = String(value).trim();
  const valid = percentage ? /^(?:\d+(?:\.\d*)?|\.\d+)$/.test(raw) : /^\d+$/.test(raw);
  const number = Number(raw);
  if (!valid || !Number.isFinite(number) || number < 0 || (percentage ? number > 100 : !Number.isSafeInteger(number))) {
    throw new Error(label + (percentage ? '请填写 0—100 的百分数，不带百分号；留空表示未知。' : '请填写非负安全整数；留空表示未知。'));
  }
  return percentage ? number / 100 : number;
}

export function parseFeedbackDetails(draft = {}) {
  const reason = optionalFeedbackText(draft.reason, '采用或未采用的原因', 1000);
  const sampleSize = feedbackNumber(draft.sampleSize, '新增商品点击');
  const metricBefore = feedbackNumber(draft.metricBeforePercent, '改动前加购率', true);
  const metricAfter = feedbackNumber(draft.metricAfterPercent, '改动后加购率', true);
  const constraintsText = draft.constraintsText ?? '';
  if (typeof constraintsText !== 'string') throw new Error('新限制请按每行一项填写。');
  const constraintsLearned = constraintsText.split(/\r\n?|\n/).map((item) => item.trim()).filter(Boolean);
  if (constraintsLearned.length > 20 || constraintsLearned.some((item) => item.length > 300)) {
    throw new Error('新限制最多 20 项，每项最多 300 字；请自行精简，页面不会截断后保存。');
  }
  const guardrailStatus = draft.guardrailStatus ?? 'unknown';
  if (!Object.hasOwn(GUARDRAIL_LABELS, guardrailStatus)) throw new Error('异常状态无效，请重新选择。');
  return { detailsVersion: 1, reason, sampleSize, sampleUnit: sampleSize === null ? null : 'product_clicks',
    metricBefore, metricAfter, constraintsLearned, guardrailStatus };
}

export function makeFeedbackPayload(artifact, draft, { detailsVersion } = {}) {
  if (!artifact?.id || artifact.version < 1) throw new Error('请先保存对应的行动内容。');
  const rawText = optionalFeedbackText(draft.rawText, '本次文字反馈', 500);
  const adoption = draft.adoption ?? 'unknown';
  const execution = draft.execution ?? 'unknown';
  const observation = draft.observation ?? 'unknown';
  if (!Object.hasOwn(ADOPTION_LABELS, adoption) || !Object.hasOwn(EXECUTION_LABELS, execution) ||
      !Object.hasOwn(OBSERVATION_LABELS, observation)) throw new Error('反馈状态无效。');
  const details = parseFeedbackDetails(draft);
  if (hasFeedbackDetailsInput(draft) && detailsVersion !== 1) {
    throw new Error('新版反馈保存尚未接通；采用、原因、样本、比例、异常和新限制仍是本页草稿，没有交给旧接口保存。取用稿件不受影响。');
  }
  if (!feedbackHasContent(draft)) throw new Error('可以只记一句话或选一个状态；暂时不记录也可以直接离开。');
  if (draft.executedAt) {
    const date = new Date(draft.executedAt + 'T00:00:00.000Z');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.executedAt) || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== draft.executedAt) {
      throw new Error('请填写有效日期，或留空表示执行时间未知。');
    }
  }
  const refs = { roundId: artifact.roundId, analysisId: artifact.analysisId, pathId: artifact.pathId,
    inputVersion: artifact.inputVersion, artifactId: artifact.id, artifactVersion: artifact.version };
  return {
    executionRecord: { id: null, ...refs, adoption, execution,
      scope: draft.scope?.trim() || null, executedAt: draft.executedAt || null },
    feedbackRecord: { id: null, ...refs, executionRecordId: null, observation,
      rawText, metrics: [], observedWindow: { start: null, end: null }, ...(detailsVersion === 1 ? details : {}) },
  };
}

export function feedbackDetailsMatch(record, expected) {
  if (expected?.detailsVersion !== 1) return true;
  if (record?.detailsVersion !== 1) return false;
  return ['reason', 'sampleSize', 'sampleUnit', 'metricBefore', 'metricAfter'].every((key) =>
    record[key] === expected[key]) &&
    record.guardrailStatus === expected.guardrailStatus && Array.isArray(record.constraintsLearned) &&
    JSON.stringify(record.constraintsLearned) === JSON.stringify(expected.constraintsLearned);
}

function feedbackRatioLabel(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1
    ? String(Number((value * 100).toPrecision(12))) + '%（保存比例 ' + value + '）' : '未知';
}

export function feedbackDetailRows(record) {
  if (record?.detailsVersion !== 1) return [['补充反馈', '原记录未保存新版明细，原因、样本、比例、异常与新限制保持未知。']];
  const sample = Number.isSafeInteger(record.sampleSize) && record.sampleSize >= 0 ? record.sampleSize : null;
  return [
    ['采用或未采用原因', textValue(record.reason)],
    ['新增样本', sample === null ? '未知' : sample + (record.sampleUnit === 'product_clicks' ? ' 次新增商品点击' : '（计数单位未知）')],
    ['改动前加购率', feedbackRatioLabel(record.metricBefore)],
    ['改动后加购率', feedbackRatioLabel(record.metricAfter)],
    ['异常观察', GUARDRAIL_LABELS[record.guardrailStatus] ?? GUARDRAIL_LABELS.unknown],
    ['新发现的限制', Array.isArray(record.constraintsLearned) && record.constraintsLearned.length ? record.constraintsLearned.join('\n') : '未提供，保持未知'],
  ];
}

function originLabel(mode) {
  return mode === 'demo_fixture' ? '合成演示／预编写参考稿' : '本机有限整理／参考稿';
}

function intakeFieldLabel(field) {
  const indexed = /^(confirmedProductFacts|proofMaterials|previousAttempts|constraints|customerQuestions|unknowns)\.(\d+)$/.exec(field ?? '');
  return indexed ? `${INTAKE_FIELD_LABELS[indexed[1]]}第 ${Number(indexed[2]) + 1} 项`
    : INTAKE_FIELD_LABELS[field] ?? textValue(field, '理解字段');
}

function factSummary(fact) {
  const value = fact.availability === 'known'
    ? textValue(fact.value, '已提供结构化内容，请回来源核对') : '未知';
  const label = fact.intakeField ? intakeFieldLabel(fact.intakeField) : FIELD_LABELS[fact.key] ?? textValue(fact.key, '资料项');
  return `${label}：${value}${fact.unit ? ` ${fact.unit}` : ''}`;
}

function sourceLocation(source) {
  const locator = source?.locator;
  if (!locator) return '无原文定位';
  if (locator.type === 'input') return locator.field === 'focus' ? '本轮问题' : '问题描述';
  if (locator.type === 'intake') return `${INTAKE_SOURCE_LABELS[locator.source] ?? '来源未明'} · ${intakeFieldLabel(locator.field)}`;
  if (locator.type === 'question') return `补问 ${locator.questionId}`;
  if (locator.type === 'text' || locator.type === 'txt') {
    const positions = [];
    if (Number.isSafeInteger(locator.lineStart) && Number.isSafeInteger(locator.lineEnd)) positions.push(`第 ${locator.lineStart}—${locator.lineEnd} 行`);
    if (Number.isSafeInteger(locator.start) && Number.isSafeInteger(locator.end)) positions.push(`位置 ${locator.start}—${locator.end}`);
    return positions.length ? `文本${positions.join('，')}` : '文本（未提供行号或位置）';
  }
  if (locator.type === 'csv') return `CSV 第 ${locator.recordIndex} 条记录，${locator.column} 列`;
  if (locator.type === 'json') return `JSON 字段 ${locator.pointer}`;
  if (locator.type === 'correction') return `更正 ${locator.factId}，输入 v${locator.inputVersion}`;
  return '来源定位未知';
}

export function describeActionSource(fact) {
  const labels = [SOURCE_LABELS[fact.source?.kind] ?? '来源未明'];
  if (EVIDENCE_STATUS_LABELS[fact.evidenceStatus]) labels.push(EVIDENCE_STATUS_LABELS[fact.evidenceStatus]);
  if (fact.verification === 'user_corrected') labels.push('商家更正');
  if (fact.verification === 'checked') labels.push('仅原文／算式已核对');
  if (fact.verification === 'conflicting') labels.push('存在冲突，待核对');
  return { summary: factSummary(fact), provenance: labels.join('；'), location: sourceLocation(fact.source) };
}

function referenceAnalysis(snapshot, reference) {
  return [snapshot.analysis, ...(snapshot.history ?? []).map((entry) => entry.analysis)]
    .find((item) => item && item.id === reference?.analysisId &&
      item.roundId === reference.roundId && item.inputVersion === reference.inputVersion) ?? null;
}

function referenceSelection(snapshot, reference) {
  return [snapshot?.selection, ...(snapshot?.history ?? []).map((entry) => entry?.selection)].filter(Boolean)
    .find((selection) => selection.analysisId === reference?.analysisId && selection.pathId === reference.pathId &&
      selection.inputVersion === reference.inputVersion) ?? null;
}

function unavailableSkillChain(code, message) {
  return { ok: false, code, message, path: null, skillId: null, skillLabel: null, operationId: null, sourceLabel: null };
}

// Projection only: a saved path Skill is not upgraded into a new P3 Skill-call receipt.
export function resolveActionSkillChain(snapshot, reference = activeSelection(snapshot), artifact = null) {
  if (!snapshot || snapshot.contractVersion !== CONTRACT_VERSION || !reference) {
    return unavailableSkillChain('skill_source_missing', '尚未读到同一轮次的分析、选择与执行 Skill，内容准备已禁用。');
  }
  const analysis = referenceAnalysis(snapshot, reference);
  const selection = referenceSelection(snapshot, reference);
  const path = analysis?.paths?.find((item) => item.id === reference.pathId) ?? null;
  if (!analysis || !selection || !path || !['ready', 'limited'].includes(analysis.status) ||
      analysis.id !== reference.analysisId || analysis.roundId !== reference.roundId ||
      analysis.inputVersion !== reference.inputVersion || selection.analysisId !== analysis.id ||
      selection.pathId !== path.id || selection.inputVersion !== reference.inputVersion ||
      typeof analysis.savedAt !== 'string' || !analysis.savedAt ||
      typeof selection.selectedAt !== 'string' || !selection.selectedAt) {
    return unavailableSkillChain('skill_source_incomplete', '分析、选择或路径保存链不完整；执行 Skill 保持未知。');
  }
  if (analysis.mode !== 'real_model') {
    if (analysis.analysisSource !== 'local_fallback' || Object.hasOwn(analysis, 'providerReceipt')
        || Object.hasOwn(analysis, 'skillIds') || path.skillId != null) {
      return unavailableSkillChain('local_source_invalid', '本机分析携带了真实模型或执行 Skill 身份，已拒绝混用。');
    }
    if (artifact && (!sameReference(artifact, reference) || artifact.skillId != null
        || artifact.mode !== analysis.mode || !artifact.id || !Number.isSafeInteger(artifact.version)
        || artifact.version < 1 || typeof artifact.savedAt !== 'string' || !artifact.savedAt)) {
      return unavailableSkillChain('local_artifact_mismatch', '本机稿件版本或来源与所选路径不一致。');
    }
    return { ok: true, code: 'local_fallback_chain',
      message: '本机有限分析与保存链已核对；没有调用真实模型或专家 Skill。',
      path, skillId: null, skillLabel: null, operationId: `local:${analysis.id}`, sourceLabel: '本机规则' };
  }
  if (analysis.mode !== 'real_model' || !Array.isArray(analysis.skillIds) ||
      analysis.skillIds.length !== ANALYSIS_SKILL_IDS.length ||
      ANALYSIS_SKILL_IDS.some((skillId, index) => analysis.skillIds[index] !== skillId)) {
    return unavailableSkillChain('analysis_skills_missing', '真实分析或两项分析 Skill 身份无法核对；没有把页面标签当作调用回执。');
  }
  const receipt = analysis.providerReceipt;
  const provider = analysis.analysisSource === 'moneyai' && receipt?.provider === 'moneyai' && receipt.sentToMoneyAI === true
    ? { kind: 'moneyai', label: 'MoneyAI' }
    : analysis.analysisSource === 'ai_settings' && receipt?.provider === 'ai-settings' && receipt.sentToProvider === true
      ? { kind: 'provider_ai', label: '直连 API' } : null;
  if (!provider || receipt.contractVersion !== SKILL_RECEIPT_CONTRACT ||
      !SKILL_OPERATION_ID.test(receipt.operationId ?? '') || !SKILL_OPERATION_ID.test(receipt.attemptId ?? '') ||
      receipt.sessionId !== snapshot.sessionId || receipt.roundId !== reference.roundId ||
      receipt.inputVersion !== reference.inputVersion || !SKILL_INPUT_FINGERPRINT.test(receipt.inputFingerprint ?? '')) {
    return unavailableSkillChain('skill_receipt_invalid', '真实 provider 回执与本会话、轮次或输入版本不一致。');
  }
  const processing = analysis.processing;
  if (!Array.isArray(processing) || !processing.length || processing.some((entry) =>
    !entry?.name || entry.kind !== provider.kind || entry.status !== 'done' || entry.operationId !== receipt.operationId) ||
    ANALYSIS_SKILL_IDS.some((skillId) => !processing.some((entry) => entry.skillId === skillId))) {
    return unavailableSkillChain('skill_processing_invalid', '分析 processing 未用对应 skillId 完整关联同一 provider 回执。');
  }
  if (!Object.hasOwn(EXECUTION_SKILL_LABELS, path.skillId)) {
    return unavailableSkillChain('execution_skill_missing', '所选路径没有已保存且受支持的执行 Skill；页面不会猜测路由。');
  }
  if (artifact && (!sameReference(artifact, reference) || artifact.skillId !== path.skillId ||
      artifact.mode !== analysis.mode || !artifact.id || !Number.isSafeInteger(artifact.version) ||
      artifact.version < 1 || typeof artifact.savedAt !== 'string' || !artifact.savedAt)) {
    return unavailableSkillChain('artifact_skill_mismatch', '稿件 Skill、版本或来源身份与所选路径不一致。');
  }
  return { ok: true, code: 'skill_chain_verified', message: 'P2 分析回执、选择与执行 Skill 路由字段已核对；P3 未另报 Skill 调用。',
    path, skillId: path.skillId, skillLabel: EXECUTION_SKILL_LABELS[path.skillId],
    operationId: receipt.operationId, sourceLabel: provider.label };
}

function skillChainLabel(chain) {
  if (chain.ok && chain.code === 'local_fallback_chain') {
    return '执行 Skill：未调用 · 本机有限分析与稿件版本已核对';
  }
  return chain.ok
    ? `执行 Skill：${chain.skillLabel} · P2 ${chain.sourceLabel} 分析回执 ${chain.operationId.slice(-8)} 与路径字段已核对`
    : `执行 Skill：未知 · ${chain.message}`;
}

export function currentSkillArtifacts(snapshot, context = activeSelection(snapshot)) {
  const chain = resolveActionSkillChain(snapshot, context);
  return chain.ok ? currentArtifacts(snapshot, context).filter((artifact) =>
    resolveActionSkillChain(snapshot, context, artifact).ok) : [];
}

function analysisSourceFacts(snapshot, reference = null) {
  if (!reference) return snapshot.analysis?.inputSnapshot?.facts ?? snapshot.input?.facts ?? [];
  const analysis = referenceAnalysis(snapshot, reference);
  if (analysis?.inputSnapshot) return analysis.inputSnapshot.facts ?? [];
  return analysis?.id === snapshot.analysis?.id && snapshot.round?.inputVersion === reference.inputVersion ? snapshot.input?.facts ?? [] : [];
}

const SHOE_DEMO_FIXTURE_ID = 'shoe_store_report_fixed_v1';
const SHOE_DIAGNOSIS_FIELDS = Object.freeze([
  'female_factory_diagnosis',
  'sneaker_lab_diagnosis',
  'outdoor_flagship_diagnosis',
]);

function selectedShoeActionSteps(path) {
  if (path?.optionLabel === 'A') {
    return path.action.split(/；(?=(?:女鞋工厂直营店|国潮球鞋实验室)：)/).map((item) => item.trim()).filter(Boolean);
  }
  if (path?.optionLabel === 'B') {
    return path.action.split(/；(?=(?:导出全部评论|女鞋工厂直营店拍))/).map((item) => item.trim()).filter(Boolean);
  }
  return [];
}

// P3 only projects the selected, saved shoe-demo path. It does not choose a path,
// invoke a Skill, or upgrade an ordinary session into the fixed demo.
export function buildSelectedShoeActionCopy(snapshot, context, skillChain, existingDrafts = []) {
  const analysis = referenceAnalysis(snapshot, context);
  const path = skillChain?.path;
  if (snapshot?.fixtureId !== SHOE_DEMO_FIXTURE_ID || !analysis || analysis.mode !== 'demo_fixture' ||
      analysis.analysisSource !== 'local_fallback' || !skillChain?.ok || skillChain.code !== 'local_fallback_chain' ||
      skillChain.skillId !== null || !['A', 'B'].includes(path?.optionLabel) || typeof path.action !== 'string') return null;
  const steps = selectedShoeActionSteps(path);
  if (steps.length !== 3) return null;
  const facts = analysisSourceFacts(snapshot, context);
  const diagnoses = SHOE_DIAGNOSIS_FIELDS.map((field) => facts.find((fact) => fact?.intakeField === field));
  if (diagnoses.some((fact) => !fact?.id || typeof fact.value !== 'string' || !fact.value.trim() ||
      fact.evidenceStatus !== 'confirmed_fact' || fact.source?.kind !== 'merchant_statement' ||
      fact.source?.locator?.type !== 'fixed_demo_prompt' || fact.source.locator.field !== fact.intakeField)) return null;
  const evidenceIds = new Set(path.evidenceRefs?.flatMap((entry) => entry.factIds ?? []) ?? []);
  if (diagnoses.some((fact) => !evidenceIds.has(fact.id))) return null;
  const base = existingDrafts.find((draft) => sameReference(draft, context) && draft.mode === analysis.mode && draft.skillId === null);
  if (!base) return null;
  const diagnosisLines = diagnoses.map((fact) => '- ' + fact.value);
  return {
    ...base,
    id: null,
    version: 0,
    savedAt: null,
    kind: 'copy',
    title: `方案 ${path.optionLabel} · 三账号行动清单`,
    body: [`方案 ${path.optionLabel}｜${path.title}`, '', ...steps.map((step, index) => `${index + 1}. ${step}`), '',
      '诊断依据（用户指定的演示答案；未调用真实 AI 或专家 Skill）：', ...diagnosisLines].join('\n'),
    usage: {
      placement: '按账号逐项核对后执行；采用与实际执行分别记录',
      steps,
      risks: path.risk?.map((risk) => risk.description).filter(Boolean) ?? [],
    },
    sourceFactIds: diagnoses.map((fact) => fact.id),
    skillId: null,
    editedByUser: false,
  };
}

function packSignature(state) {
  const context = activeSelection(state);
  const chain = resolveActionSkillChain(state, context);
  if (!context || !chain.ok) return null;
  return JSON.stringify([context.roundId, context.inputVersion, context.analysisId, context.pathId,
    chain.operationId, chain.skillId, currentSkillArtifacts(state, context)
      .map((artifact) => [artifact.id, artifact.version, artifact.skillId]).sort((a, b) => a[0].localeCompare(b[0]))]);
}

// Presentation projections only: no diagnosis, candidate creation, storage or round mutation.
export function buildActionCopy(snapshot, { expectedSignature } = {}) {
  const context = activeSelection(snapshot);
  const chain = resolveActionSkillChain(snapshot, context);
  if (!context) throw new Error('当前行动还没有已保存的完整文案。');
  if (!chain.ok) throw new Error(chain.message);
  const artifacts = currentSkillArtifacts(snapshot, context).filter((artifact) => artifact.kind === 'copy' && artifact.body.trim());
  if (!artifacts.length) throw new Error('当前行动还没有通过 Skill 与版本核对的完整文案。');
  const signature = packSignature(snapshot);
  if (expectedSignature !== undefined && signature !== expectedSignature) throw new Error('依据、选择或稿件版本已变化；请核对当前内容后重新取用。');
  return { text: artifacts.map((artifact) => artifact.body).join('\n\n'), artifacts, context, signature };
}

export function describeActionPath(path, historical = false) {
  const label = path?.optionLabel
    ? (historical ? '历史方案 ' : '已选方案 ') + path.optionLabel
    : historical ? '已保存的原行动' : '已选行动';
  const prefix = historical ? '这份历史行动' : '当前已选行动';
  const note = path?.actionKey === 'juicer_first_screen'
    ? prefix + '只调整详情页首屏；文案与核对清单分开，未确认的商品信息不能直接发布。'
    : path?.actionKey === 'juicer_question_video'
    ? prefix + '提供真实问题验证内容的脚本与拍摄安排；还需实际验证和拍摄，不是视频文件，也不表示已执行。'
    : path?.actionKey === 'juicer_faq' && path.experiment?.sourceFeedbackId
    ? prefix + '来自明确接受后的购买问答区候选；只改问答区，保留未知说明，不修改已改首屏或商品标题。复制不记录采用或执行。'
    : path?.actionKey === 'juicer_faq'
    ? prefix + '提供购买问答参考稿；待核对的性能和售后另列清单，不进入“复制全部文案”。'
    : path?.actionKey === 'juicer_video_intro'
    ? prefix + '提供字幕稿与剪辑安排，不是视频文件，也不是未选择的候选方案。'
    : prefix + '的内容来自对应分析与稿件版本；查看不同内容不会重新选路或记录执行。';
  return { label, note };
}

export function experimentIdentityRows(path) {
  return [
    ['实验编号', textValue(path?.experiment?.experimentId, '原计划未提供实验编号，保持未知')],
    ['待验证假设', textValue(path?.experiment?.hypothesis, '原计划未提供假设，保持未知')],
  ];
}

export function experimentCardRows(path, mode = 'local_limited') {
  const plan = path?.experiment;
  const target = plan?.target;
  const metric = target ? (FIELD_LABELS[target.metric] ?? textValue(target.metric)) : '未知';
  const sample = plan?.minSample;
  const sampleUnit = textValue(plan?.minSampleUnit, '计数单位未知');
  const sampleLabel = sample === null || sample === undefined
    ? '尚未确定，不设默认达标门槛；' + sampleUnit
    : (mode === 'demo_fixture' ? '合成计划假设：' : '计划值（依据待核对）：') +
      textValue(sample) + ' ' + sampleUnit + '；不代表统计充分';
  const conditions = (items) => (items ?? []).map((item) => item.text).filter(Boolean);
  const guardrails = conditions(plan?.guardrails);
  const restore = conditions(plan?.restoreConditions).join('；');
  const restoreSteps = conditions(plan?.restoreSteps);
  const rollback = restoreSteps.length
    ? '回滚步骤（仅为计划，未记录执行）：\n' + restoreSteps.map((step, index) => (index + 1) + '. ' + step).join('\n') +
      '\n恢复条件：' + (restore || '原记录未提供，须先核对是否可以恢复')
    : restore ? '当前仅有恢复条件：' + restore + '。原记录未提供具体回滚步骤，不能声称已经回滚。'
    : '原记录未提供具体回滚步骤与恢复条件，不能声称已经回滚';
  return [
    ['本轮只改什么', textValue(plan?.change, '当前路径未提供修改对象')],
    ['本轮保持不变', plan?.keepFixed?.join('；') || '保持不变项尚未提供'],
    ['主要观察', metric + (target?.unit ? '（' + target.unit + '）' : '') + '；对象：' + textValue(target?.subject)],
    ['最小样本', sampleLabel],
    ['观察时间', textValue(plan?.window?.description, '尚未确定') + '；起止：' + textValue(plan?.window?.start) + '—' + textValue(plan?.window?.end)],
    ['护栏指标', guardrails.length ? guardrails.join('\n') : '原记录未提供护栏指标；缺少投诉／退款等数据不代表风险未触发'],
    ['停止条件', conditions(plan?.stopConditions).join('\n') || '停止条件尚未提供'],
    ['回滚方式', rollback],
  ];
}

export function experimentAssumptionLines(path) {
  const referenced = path?.experiment?.assumptionIds ?? [];
  if (!referenced.length) return ['原计划没有引用样本或时间参数，不补默认值。'];
  return referenced.map((assumptionId) => {
    const assumption = path.estimate?.assumptions?.find((item) => item.id === assumptionId);
    if (!assumption) return '计划参数 ' + assumptionId + '：原分析中未找到，保持未知。';
    return '计划假设 ' + assumption.id + '｜' + textValue(assumption.label) + '：' + textValue(assumption.value) +
      (assumption.unit ? ' ' + assumption.unit : '（单位未知）') + '；' + textValue(assumption.note, '参数依据尚未提供');
  });
}

export function feedbackMetricRows(metric) {
  const saved = metric && typeof metric === 'object' ? metric : {};
  const key = saved.key ?? saved.metric;
  const window = saved.window && typeof saved.window === 'object' ? saved.window
    : { start: saved.window_start, end: saved.window_end };
  return [
    ['指标', FIELD_LABELS[key] ?? textValue(key)], ['已报数值', textValue(saved.value)],
    ['单位', textValue(saved.unit)], ['对象', textValue(saved.subject)],
    ['渠道', textValue(saved.channel)], ['群体／计数口径', textValue(saved.cohort)],
    ['观察开始', textValue(window.start)], ['观察结束', textValue(window.end)],
  ];
}

export function resolveFeedbackRecord(snapshot, feedbackId) {
  if (!snapshot || snapshot.contractVersion !== CONTRACT_VERSION || !feedbackId) return null;
  const feedback = snapshot.feedbackRecords?.find((record) => record.id === feedbackId && record.savedAt);
  if (!feedback) return null;
  const artifact = snapshot.artifacts?.find((item) => item.id === feedback.artifactId &&
    item.version === feedback.artifactVersion && sameReference(item, feedback));
  if (!artifact) return null;
  const execution = feedback.executionRecordId
    ? snapshot.executionRecords?.find((record) => record.id === feedback.executionRecordId) : null;
  if (feedback.executionRecordId && (!execution || !sameReference(execution, feedback) ||
      execution.artifactId !== artifact.id || execution.artifactVersion !== artifact.version)) return null;
  const analysis = referenceAnalysis(snapshot, feedback);
  const path = analysis?.paths?.find((item) => item.id === feedback.pathId) ?? null;
  const round = snapshot.round?.id === feedback.roundId ? snapshot.round
    : snapshot.history?.find((entry) => entry.round?.id === feedback.roundId)?.round;
  return { feedback, execution: execution ?? null, artifact, analysis, path, roundIndex: round?.index ?? null };
}

export function describeExperimentReview(review) {
  if (review?.version !== 1 || !Object.hasOwn(REVIEW_LABELS, review.decision) ||
      review.source !== 'local_fallback' ||
      !(review.externalCalled === false || review.moneyaiCalled === false)) {
    throw new Error('判断来源或版本无法核对，未展示为外部 AI 结果。');
  }
  return { title: REVIEW_LABELS[review.decision], treatment: REVIEW_TREATMENTS[review.decision],
    source: '本机规则判断 · 未调用外部 AI · 商家自述尚未独立核验' };
}

export function candidatePlanRows(candidate) {
  if (candidate?.status !== 'candidate') return [];
  const sample = candidate.minSample === null || candidate.minSample === undefined ? '未知'
    : textValue(candidate.minSample) + ' ' + textValue(candidate.minSampleUnit, '计数单位未知') + '（候选计划，不保证统计充分）';
  return [
    ['候选实验编号', textValue(candidate.experimentId)],
    ['本轮只改什么', textValue(candidate.singleVariable)],
    ['继续保持不变', candidate.keepFixed?.join('；') || '候选尚未提供'],
    ['主要观察', FIELD_LABELS[candidate.target?.metric] ?? textValue(candidate.target?.metric)],
    ['候选样本计划', sample],
    ['观察时间', 'C7候选尚未提供完整窗口，不用原轮次代填'],
    ['停止条件', 'C7候选尚未提供；新轮完整计划生成后，执行前仍须核对'],
    ['回滚方式', 'C7候选尚未提供，不声称已经回滚'],
  ];
}

export function reviewSnapshotMatches(snapshot, review) {
  if (!review) return false;
  const checked = buildExperimentReview(snapshot, review.sourceFeedbackId);
  return checked.ok && checked.review.sessionId === review.sessionId &&
    checked.review.fingerprint === review.fingerprint;
}

export function canAcceptExperimentReview(snapshot, review) {
  const current = activeSelection(snapshot);
  const bundle = resolveFeedbackRecord(snapshot, review?.sourceFeedbackId);
  const skillChain = bundle ? resolveActionSkillChain(snapshot, bundle.feedback, bundle.artifact) : null;
  const relatedFeedback = (snapshot?.feedbackRecords ?? []).filter((record) => sameReference(record, review));
  const relatedExecutions = (snapshot?.executionRecords ?? []).filter((record) => sameReference(record, review));
  return Boolean(current && review?.decision === 'change_variable' && review.nextAction?.status === 'candidate' &&
    skillChain?.ok &&
    snapshot.sessionId === review.sessionId && current.roundId === review.roundId &&
    current.inputVersion === review.inputVersion && current.analysisId === review.analysisId &&
    current.pathId === review.pathId && relatedFeedback.at(-1)?.id === review.sourceFeedbackId &&
    relatedExecutions.at(-1)?.id === review.sourceExecutionId && reviewSnapshotMatches(snapshot, review));
}

export function makeExperimentAcceptanceCommand(snapshot, review, commandId) {
  if (!canAcceptExperimentReview(snapshot, review) || !/^[A-Za-z0-9_-]{1,80}$/.test(commandId ?? '') ||
      !Number.isSafeInteger(snapshot.revision)) throw new Error('当前会话、原轮次、分析、选择或候选已变化，请重新读取后明确接受。');
  return { type: 'EXPERIMENT_ACCEPT', commandId, expectedRevision: snapshot.revision,
    payload: { feedbackId: review.sourceFeedbackId, reviewFingerprint: review.fingerprint,
      roundId: review.roundId, inputVersion: review.inputVersion } };
}

export function acceptanceReceiptMatches(receipt, review) {
  return Boolean(receipt?.ok && receipt.accepted === true && receipt.sourceFeedbackId === review?.sourceFeedbackId &&
    receipt.reviewFingerprint === review.fingerprint && receipt.source?.sourceRoundId === review.roundId &&
    receipt.source.sourceInputVersion === review.inputVersion && receipt.source.sourceAnalysisId === review.analysisId &&
    receipt.source.sourcePathId === review.pathId && receipt.source.sourceArtifactId === review.artifactId &&
    receipt.source.sourceArtifactVersion === review.artifactVersion);
}

export function experimentOriginLines(analysis) {
  if (analysis?.funnelSource?.kind !== 'accepted_prior_snapshot') return [];
  const source = analysis.funnelSource;
  return [
    '本轮来自明确接受的反馈候选；采用、执行和结果仍分别记录。',
    '漏斗依据为原轮快照：分析 ' + textValue(source.analysisId) + '／轮次 ' + textValue(source.roundId) +
      '／输入 v' + textValue(source.inputVersion) + '。不是本轮新增样本，不把新反馈点击拼进旧时间窗。',
    '来源反馈：' + textValue(analysis.sourceFeedbackId) + '；原合成来源保留在原分析与接受记录中，不代表任何外部服务记忆。',
  ];
}

export function buildActionPack(state, { exportId, generatedAt, allowSummaries = false }) {
  const context = activeSelection(state);
  if (!context) throw new Error('没有当前有效且已保存的执行包。');
  const chain = resolveActionSkillChain(state, context);
  if (!chain.ok) throw new Error(chain.message);
  const artifacts = currentSkillArtifacts(state, context);
  if (!artifacts.length) throw new Error('没有通过 Skill 与版本核对的已保存执行包。');
  if (![exportId, context.pathId].every((id) => /^[A-Za-z0-9_-]{1,80}$/.test(id))) throw new Error('导出标识无效。');
  if (!allowSummaries) throw new Error('请先确认本次 TXT 可以包含页面所示的必要摘要。');
  const stamp = new Date(generatedAt);
  if (Number.isNaN(stamp.getTime())) throw new Error('导出时间无效。');
  const utc = stamp.toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
  const metadata = {
    exportVersion: 'demo.export.v1', contractVersion: state.contractVersion, exportId,
    generatedAt: stamp.toISOString(), sourceRevision: state.revision,
    roundId: context.roundId, roundIndex: state.round.index, inputVersion: context.inputVersion,
    analysisId: context.analysisId, pathId: context.pathId, mode: state.analysis.mode, fixtureId: state.fixtureId,
    skillId: chain.skillId, skillOperationId: chain.operationId,
  };
  const lines = [originLabel(state.analysis.mode), '行动执行包', '', ...Object.entries(metadata).map(([key, value]) => `${key}: ${value ?? 'null'}`),
    '', `本轮问题：${textValue(state.input.focus || state.input.description).slice(0, 300)}`,
    `选定行动：${context.path.title}`, `方案标识：${textValue(context.path.optionLabel)}；actionKey: ${textValue(context.path.actionKey)}`,
    `执行 Skill：${chain.skillLabel}（来自 P2 已保存路径；P3 未另报 Skill 调用）`,
    `要做什么：${context.path.action}`, '', '行动内容（整包包含文案、核对清单与观察计划；不等于复制全部文案）'];
  for (const [index, artifact] of artifacts.entries()) {
    lines.push('', `${index + 1}. ${artifact.title}`, `artifactId: ${artifact.id}`, `artifactVersion: ${artifact.version}`,
      `artifactSavedAt: ${artifact.savedAt ?? 'null'}`, `artifactKind: ${artifact.kind}`, `artifactSkillId: ${artifact.skillId}`, `来源标签：${originLabel(artifact.mode)}`,
      `使用位置：${textValue(artifact.usage?.placement)}`, '', artifact.body, '', '使用步骤：',
      ...(artifact.usage?.steps?.length ? artifact.usage.steps.map((step, i) => `${i + 1}. ${step}`) : ['未提供额外步骤。']),
      '必要风险：', ...(artifact.usage?.risks?.length ? artifact.usage.risks.map((risk) => `- ${risk}`) : ['没有补充风险资料，不表示没有风险。']),
      '引用资料摘要：');
    const facts = (artifact.sourceFactIds ?? []).map((id) => analysisSourceFacts(state, context).find((fact) => fact.id === id));
    lines.push(...(facts.length ? facts.map((fact) => {
      if (!fact) return '- 来源已更新，无法核对。';
      const source = describeActionSource(fact);
      return `- ${fact.id} | ${source.provenance} | ${source.location} | ${source.summary.slice(0, 240)}`;
    }) : ['没有可核对的商品资料；只提供有限参考。']));
  }
  lines.push('', '适用前提', ...(context.path.prerequisites?.length
    ? context.path.prerequisites.map((item) => `- ${item.text}（${item.status === 'met' ? '已满足' : item.status === 'unmet' ? '尚未满足' : '待核对'}）`)
    : ['尚未给出额外前提。']));
  lines.push('', '行动边界与风险', ...(context.path.risk?.length
    ? context.path.risk.flatMap((risk) => [`- ${risk.description}`, `触发条件：${textValue(risk.trigger?.text)}`,
      `暂停条件：${textValue(risk.stop?.text)}`, `恢复条件：${textValue(risk.restore?.text)}`]) : ['尚无完整风险资料。']));
  const plan = context.path.experiment;
  lines.push('', ...experimentOriginLines(referenceAnalysis(state, context)), '本轮实验卡', ...[...experimentIdentityRows(context.path), ...experimentCardRows(context.path, context.mode)].map(([label, value]) => label + '：' + value));
  if (plan) {
    lines.push('', '观察依据与口径',
      `观察对象：${textValue(plan.target?.subject)}`, `渠道：${textValue(plan.target?.channel)}；口径：${textValue(plan.target?.cohort)}`,
      `计划来源模式：${originLabel(context.mode)}`, ...experimentAssumptionLines(context.path),
      ...(plan.limitations ?? []).map((item) => `限制：${item}`));
  }
  lines.push('', '此文件为本机导出，不代表采用、执行、平台核验、真实模型生成或经营成效。',
    '实际执行和结果没有反馈时保持未知；本机下载不等于云同步或对外分享授权。');
  return { text: `\uFEFF${lines.join('\n').replace(/\r\n?/g, '\n').replace(/\n/g, '\r\n')}\r\n`,
    filename: `action-pack-r${state.round.index}-i${context.inputVersion}-${context.pathId}-${utc}.txt`,
    signature: packSignature(state), metadata };
}

let shared;
const MONEYAI_LOCAL_FEEDBACK_RECORD_VERSION = 1;
let state;
let pageMode = 'action';
let activeWorkspaceTab = typeof window !== 'undefined' && /^#(?:feedback|review=)/.test(window.location.hash || '') ? 'feedback' : 'work';
let initialHashApplied = false;
let reviewFeedbackId = null;
let activeReview = null;
let accepting = false;
let acceptanceBusyOwner = null;
let pendingAcceptance = null;
let acceptanceRecheckId = null;
let acceptedReceipt = null;
let acceptanceToken = 0;
let viewReadToken = 0;
const dialogOpeners = new Map();
let shownContext;
let artifactFingerprint = '';
let previewFingerprint = '';
let previewItems = [];
let previewKey = null;
let previewPart = 'content';
let previewStale = false;
let renderedPackSignature = null;
let copying = false;
let feedbackBinding;
let pendingFeedback;
let selectedFeedbackId;
let savedRecordNotice = '';
let lastSavedDraft = '';
let consentSignature = null;
let dirty = false;
let booting = false;
let generating = false;
let generationToken = 0;
let saving = false;
let exporting = false;
let readingReview = false;
let commandQueue = Promise.resolve();
let unsubscribe;
let unregisterGuard;
let generationFailures = [];
let generationLimitations = [];
const artifactCommands = new Map();
const pendingEvents = new Map();
const viewed = new Set();
const readFeedbackIds = new Set();
let readEventLogged = false;

const $ = (id) => document.getElementById(id);
const id = () => crypto.randomUUID();
const node = (tag, value, className) => {
  const element = document.createElement(tag);
  if (value !== undefined) element.textContent = value;
  if (className) element.className = className;
  return element;
};

function status(target, message, isError = false) {
  const element = $(target);
  if (element.textContent !== message) element.textContent = message;
  element.hidden = !message;
  element.classList.toggle('action-warning', isError);
}

function readableTime(value) {
  if (!value) return '未知';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '未知' : date.toLocaleString('zh-CN', { hour12: false });
}

function errorText(result) {
  const hints = { conflict: '其他页面已更新资料。请核对当前内容后重试，草稿仍保留。',
    stale_input: '依据或选择已变化，不能继续使用旧版本。请回第二页核对。',
    storage_unavailable: '本机浏览器存储不可用；尚未保存，草稿仍保留。',
    read_failed: '未能读取本机记录；没有将它当成空会话。',
    write_failed: '尚未确认保存结果。草稿仍保留，请重试或重新读取；重试会复用同一操作。',
    incompatible_version: '本机记录版本不兼容，请联系统筹处理；本页不会清空或迁移记录。' };
  return hints[result?.code] || result?.message || '操作未完成，请重试。';
}

function acceptState(next) {
  if (!next || next.contractVersion !== CONTRACT_VERSION) throw new Error('共享状态版本不兼容，本页没有改写记录。');
  if (state && state.sessionId !== next.sessionId) {
    readFeedbackIds.clear();
    acceptanceToken += 1;
    invalidateViewRead();
    reviewFeedbackId = null;
    activeReview = null;
    pageMode = 'action';
    activeWorkspaceTab = 'work';
    readEventLogged = false;
  }
  if (activeReview && !reviewSnapshotMatches(next, activeReview.review)) {
    readFeedbackIds.delete(activeReview.review.sourceFeedbackId);
    activeReview = null;
  }
  if (acceptedReceipt && (next.sessionId !== acceptedReceipt.sessionId ||
      !shared?.getAcceptedExperimentRound?.(next, acceptedReceipt.sourceFeedbackId, acceptedReceipt.reviewFingerprint)?.ok)) {
    acceptedReceipt = null;
  }
  state = next;
}

function checkedAcceptedIdentity(snapshot, expected = null) {
  const source = expected ?? snapshot.analysis?.experimentReview;
  if (!source) return null; // Ordinary first-round and legacy artifacts have no acceptance dependency.
  const receipt = typeof shared?.getAcceptedExperimentRound === 'function'
    ? shared.getAcceptedExperimentRound(snapshot, source.sourceFeedbackId, source.reviewFingerprint) : null;
  const identity = receipt?.ok ? Object.freeze({
    sessionId: snapshot.sessionId, sourceFeedbackId: receipt.sourceFeedbackId, reviewFingerprint: receipt.reviewFingerprint,
    acceptanceId: receipt.acceptanceId, acceptedAt: receipt.acceptedAt, roundId: receipt.roundId,
    inputVersion: receipt.inputVersion, analysisId: receipt.analysisId, pathId: receipt.pathId, experimentId: receipt.experimentId,
  }) : null;
  if (!identity || (expected && Object.keys(identity).some((key) => identity[key] !== expected[key]))) {
    throw Object.assign(new Error('接受来源已变化或未能完整核对，已停止准备和打开本轮稿件。' +
      (receipt?.message || '请重新读取原反馈与接受记录。')), { code: receipt?.code || 'stale_input' });
  }
  return identity;
}

function commit(command, beforeDispatch = null) {
  const work = commandQueue.then(async () => {
    // Synchronous guard and revision capture run together after earlier queued work, immediately before dispatch.
    beforeDispatch?.(state);
    const result = await shared.dispatch({ ...command, expectedRevision: command.expectedRevision ?? state.revision });
    if (result.ok) acceptState(result.state);
    else if (result.state) acceptState(result.state);
    return result;
  });
  commandQueue = work.catch(() => {});
  return work;
}

function command(type, payload) {
  return { type, payload, commandId: id() };
}

function rememberAcceptedRead(snapshot) {
  const feedbackId = snapshot.analysis?.sourceFeedbackId;
  const receipt = feedbackId && typeof shared?.getAcceptedExperimentRound === 'function'
    ? shared.getAcceptedExperimentRound(snapshot, feedbackId) : null;
  acceptedReceipt = receipt?.ok ? { ...receipt, sessionId: snapshot.sessionId } : null;
}

async function readState(markRead = false) {
  const result = await shared.loadSession();
  if (result.ok) {
    acceptState(result.state);
    rememberAcceptedRead(result.state);
    if (markRead && state.savedAt && state.revision > 0) {
      for (const record of state.feedbackRecords ?? []) readFeedbackIds.add(record.id);
    }
  }
  return result;
}

async function logEvent(type, refs, roundId = state?.round.id, onceKey = null) {
  if (onceKey && viewed.has(onceKey)) return;
  if (onceKey) viewed.add(onceKey);
  const eventCommand = command('EVENT_APPEND', { event: { type, roundId, refs } });
  try {
    const result = await commit(eventCommand);
    if (result.ok) return;
  } catch { /* Keep the completed operation separate from its failed log. */ }
  pendingEvents.set(eventCommand.commandId, eventCommand);
  $('event-retry').hidden = false;
  status('operation-status', '操作已发生，但操作记录尚未保存。重试只补记，不会再次复制或下载。', true);
}

function contextRefs(context, artifact) {
  const refs = { pageId: 'action', analysisId: context.analysisId, pathId: context.pathId, inputVersion: context.inputVersion };
  if (artifact?.id) Object.assign(refs, { artifactId: artifact.id, artifactVersion: artifact.version });
  return refs;
}

function appendList(container, items, fallback) {
  container.replaceChildren();
  for (const item of items?.length ? items : [fallback]) container.append(node('li', item));
}

function renderSources(context) {
  const sourceIds = new Set(currentSkillArtifacts(state, context).flatMap((artifact) => artifact.sourceFactIds ?? []));
  const container = $('source-list');
  container.replaceChildren();
  for (const factId of sourceIds) {
    const fact = analysisSourceFacts(state, context).find((item) => item.id === factId);
    const source = fact ? describeActionSource(fact) : null;
    const item = node('div', undefined, 'source-item');
    item.append(node('p', source?.summary ?? '来源已更新，暂时无法核对。'));
    if (fact) {
      item.append(node('p', `${source.provenance} · ${source.location}`, 'muted'));
      const button = node('button', '回到来源核对', 'button button--quiet');
      button.type = 'button';
      button.addEventListener('click', () => navigate('intake', { sourceId: `fact:${fact.id}` }));
      item.append(button);
    }
    container.append(item);
  }
  if (!sourceIds.size) container.append(node('p', '尚无可核对的商品事实；本页不补造规格、价格或承诺。', 'muted'));
}

function renderExperiment(path) {
  const container = $('experiment-content');
  const facts = node('dl', undefined, 'experiment-facts');
  const chain = resolveActionSkillChain(state, shownContext);
  for (const [label, value] of [...experimentIdentityRows(path),
    ['执行 Skill', chain.ok ? `${chain.skillLabel}（${chain.skillId}）` : '未知'],
    ...experimentCardRows(path, shownContext?.mode)]) facts.append(node('dt', label), node('dd', value));
  container.replaceChildren(facts);
  for (const line of experimentOriginLines(referenceAnalysis(state, shownContext))) {
    container.append(node('p', line, 'action-field-note'));
  }
  if (!chain.ok) container.append(node('p', chain.message + ' 页面未生成、保存或开放取用稿件。', 'action-warning'));
  container.append(node('p', '样本与观察时间只是计划条件，不代表统计充分或效果保证；缺失字段按原记录保留未知，不视为风险未触发。', 'action-warning'));
  const basis = $('experiment-basis');
  basis.replaceChildren(node('p', '沿用 P2 已保存的分析、选择与路径 Skill；P3 没有重新选 Skill，也不会用标签猜测调用。'));
  const plan = path.experiment;
  const scope = node('dl', undefined, 'experiment-facts');
  for (const [label, value] of [
    ['对象', plan?.target?.subject], ['渠道', plan?.target?.channel], ['群体／计数口径', plan?.target?.cohort],
    ['计划来源模式', originLabel(shownContext?.mode)],
  ]) scope.append(node('dt', label), node('dd', textValue(value)));
  basis.append(scope);
  const assumptions = node('ul', undefined, 'experiment-limits');
  for (const line of experimentAssumptionLines(path)) assumptions.append(node('li', line));
  basis.append(node('h3', '原计划参数及依据'), assumptions);
  const limitations = node('ul', undefined, 'experiment-limits');
  appendList(limitations, plan?.limitations, '计划依据尚未给全，请先核对来源和未知。');
  basis.append(limitations);
  for (const entry of path.evidenceRefs ?? []) {
    basis.append(node('p', (entry.kind === 'inference' ? '推断／待验证：' : '已有依据摘要：') + textValue(entry.summary)));
    if (entry.calculation) basis.append(node('p', entry.calculation, 'muted'));
  }
}

function renderRisks(path) {
  const list = $('risk-list');
  list.replaceChildren();
  for (const risk of path.risk ?? []) {
    const item = node('li');
    item.append(node('p', risk.description, 'risk-summary'));
    const conditions = node('dl', undefined, 'risk-conditions');
    for (const [label, condition] of [['触发', risk.trigger], ['暂停', risk.stop], ['恢复', risk.restore]]) {
      conditions.append(node('dt', label), node('dd', textValue(condition?.text)));
    }
    item.append(conditions);
    list.append(item);
  }
  if (!path.risk?.length) list.append(node('li', '风险资料尚不完整，不能视为无风险。'));
}

function logPreviewView() {
  const artifact = selectPreviewArtifact(previewItems, previewKey);
  const context = activeSelection(state);
  if (!artifact?.id || artifact.version < 1 || previewStale || !sameReference(artifact, context) ||
      !resolveActionSkillChain(state, context, artifact).ok ||
      pageMode !== 'action' || activeWorkspaceTab !== 'work' || $('action-content').hidden ||
      $('artifact-preview').hidden || document.visibilityState === 'hidden') return;
  void logEvent('artifact_viewed', contextRefs(context, artifact), context.roundId, `artifact:${artifact.id}:${artifact.version}`);
}

function renderPreview() {
  const artifact = selectPreviewArtifact(previewItems, previewKey);
  previewKey = artifact ? previewArtifactKey(artifact) : null;
  $('artifact-preview').hidden = !artifact;
  $('preview-empty').hidden = Boolean(artifact);
  for (const button of $('artifact-list').querySelectorAll('[role="tab"]')) {
    const selected = button.dataset.previewKey === previewKey;
    button.setAttribute('aria-selected', String(selected));
    button.tabIndex = selected ? 0 : -1;
    if (selected) $('artifact-preview').setAttribute('aria-labelledby', button.id);
  }
  if (!artifact) {
    $('preview-empty').textContent = generating ? '正在准备当前行动的内容…' : '当前资料不足以生成成品，请先按路径要求核对。';
    $('copy-artifact').disabled = true;
    $('select-artifact').disabled = true;
    previewFingerprint = '';
    renderCopyAllControls();
    return;
  }
  const saved = Boolean(artifact.id && artifact.version > 0);
  const hasText = Boolean(artifactPreviewText(artifact, previewPart));
  $('copy-artifact').textContent = copying ? '正在复制…' : previewPart === 'steps' ? '复制步骤' : '复制内容';
  $('copy-artifact').disabled = !saved || previewStale || copying || !hasText;
  $('select-artifact').disabled = !hasText;
  $('preview-content').hidden = previewPart !== 'content';
  $('preview-steps-panel').hidden = previewPart !== 'steps';
  for (const part of ['content', 'steps']) {
    const tab = $(`preview-${part}-tab`);
    tab.setAttribute('aria-selected', String(previewPart === part));
    tab.tabIndex = previewPart === part ? 0 : -1;
  }
  renderCopyAllControls();
  const fingerprint = JSON.stringify([previewKey, previewPart, previewStale, artifact.body, artifact.usage, artifact.mode]);
  if (fingerprint !== previewFingerprint) {
    previewFingerprint = fingerprint;
    $('preview-title').textContent = artifact.title;
    $('preview-meta').textContent = `${saved ? `稿件 v${artifact.version}` : '尚未保存'} · ${originLabel(artifact.mode)}${previewStale ? ' · 历史内容' : ''}`;
    $('preview-placement').textContent = `使用位置：${textValue(artifact.usage?.placement)}`;
    $('preview-body').value = artifactPreviewText(artifact);
    $('preview-body').setAttribute('aria-label', `${artifact.title}，只读内容预览`);
    $('preview-steps').setAttribute('aria-label', `${artifact.title}的使用步骤`);
    appendList($('preview-steps'), artifact.usage?.steps, '尚未提供额外的使用步骤，请先核对当前行动的适用条件。');
    appendList($('preview-risks'), artifact.usage?.risks, '没有补充风险资料，不表示没有风险。');
    status('preview-warning', previewStale
      ? '这是原行动的历史版本，当前复制与整包下载已停用；未保存反馈仍对应这一版。'
      : saved ? '' : '保存尚未完成。可手动选取；保存成功后才能复制、导出或关联反馈。', true);
  }
  logPreviewView();
}

function choosePreview(key) {
  if (!previewItems.some((artifact) => previewArtifactKey(artifact) === key)) return;
  previewKey = key;
  previewPart = 'content';
  renderPreview();
}

function choosePreviewPart(part) {
  if (!['content', 'steps'].includes(part)) return;
  previewPart = part;
  renderPreview();
}

function renderTakeawayChecklists(artifacts, stale) {
  const checklists = artifacts.filter((artifact) => artifact.kind === 'checklist' && artifact.id && artifact.version > 0);
  const section = $('takeaway-checklist');
  section.hidden = !checklists.length;
  $('takeaway-checklist-note').textContent = (stale ? '历史清单，仍对应原稿件；' : '') +
    '仅供内部核对，不随“复制全部文案”复制。请先核对未知项，再决定是否使用文案；TXT 整包另含这些清单。';
  const container = $('takeaway-checklist-items');
  container.replaceChildren();
  for (const artifact of checklists) {
    const item = node('article', undefined, 'takeaway-checklist-item');
    const heading = node('h4', artifact.title);
    const body = node('pre', artifact.body, 'takeaway-checklist-body');
    body.tabIndex = 0;
    body.setAttribute('aria-label', artifact.title + '，内部核对清单，稿件 v' + artifact.version);
    const view = node('button', '查看该清单与修改步骤', 'button button--secondary');
    view.type = 'button';
    view.addEventListener('click', () => {
      choosePreview(previewArtifactKey(artifact));
      $('preview-content-tab').focus();
    });
    item.append(heading, node('p', '稿件 v' + artifact.version + ' · ' + originLabel(artifact.mode), 'muted'), body, view);
    container.append(item);
  }
}

function renderArtifacts(artifacts, stale) {
  previewItems = [...artifacts];
  previewStale = stale;
  $('artifact-count').textContent = `${previewItems.length} 份内容`;
  const fingerprint = JSON.stringify([stale, previewItems.map((artifact) => [previewArtifactKey(artifact), artifact.kind, artifact.title])]);
  if (fingerprint !== artifactFingerprint) {
    artifactFingerprint = fingerprint;
    renderTakeawayChecklists(artifacts, stale);
    const container = $('artifact-list');
    container.replaceChildren();
    for (const [index, artifact] of previewItems.entries()) {
      const key = previewArtifactKey(artifact);
      const button = node('button', undefined, 'artifact-choice');
      button.type = 'button';
      button.id = `artifact-choice-${index}`;
      button.setAttribute('role', 'tab');
      button.setAttribute('aria-controls', 'artifact-preview');
      button.dataset.previewKey = key;
      button.append(node('span', { copy: '参考内容', checklist: '核对清单', experiment_plan: '观察计划' }[artifact.kind] ?? '行动内容', 'artifact-choice-kind'),
        node('span', artifact.title, 'artifact-choice-title'),
        node('span', artifact.id && artifact.version > 0 ? `稿件 v${artifact.version}` : '尚未保存', 'artifact-choice-meta'));
      button.addEventListener('click', () => choosePreview(key));
      container.append(button);
    }
  }
  renderPreview();
}

function getFormDraft() {
  return {
    adoption: $('adoption-select').value, execution: $('execution-select').value,
    observation: $('observation-select').value, rawText: $('feedback-text').value,
    scope: $('execution-scope').value, executedAt: $('executed-date').value || null,
    reason: $('feedback-reason').value, sampleSize: $('feedback-sample-size').value,
    metricBeforePercent: $('feedback-metric-before').value, metricAfterPercent: $('feedback-metric-after').value,
    constraintsText: $('feedback-constraints').value, guardrailStatus: $('feedback-guardrail').value,
  };
}

function formSignature() { return JSON.stringify([$('feedback-artifact').value, getFormDraft()]); }

function clearFeedbackForm() {
  $('feedback-form').reset();
  feedbackBinding = null;
  pendingFeedback = null;
  lastSavedDraft = '';
  dirty = false;
  syncFeedbackControls();
}

function formChanged() {
  syncFeedbackControls();
  if (!feedbackBinding) feedbackBinding = currentSkillArtifacts(state).find((artifact) => artifact.id === $('feedback-artifact').value);
  dirty = feedbackHasContent(getFormDraft()) && formSignature() !== lastSavedDraft;
  if (pendingFeedback && pendingFeedback.signature !== formSignature()) pendingFeedback = null;
  $('next-round').disabled = dirty || saving || readingReview || !selectedFeedbackId;
  if (dirty) status('feedback-status', '草稿尚未保存。');
}

function feedbackRecordsFor(context) {
  return (state.feedbackRecords ?? []).filter((record) => sameReference(record, context));
}

function renderSavedFeedback(context) {
  const records = feedbackRecordsFor(context);
  $('saved-feedback').hidden = !records.length;
  const container = $('saved-feedback-content');
  container.replaceChildren();
  if (!records.some((record) => record.id === selectedFeedbackId)) selectedFeedbackId = records.length === 1 ? records[0].id : null;
  if (records.length > 1) container.append(node('p', '选择一条已保存记录查看复盘；不会自动开始下一轮。'));
  for (const record of records) {
    const bundle = resolveFeedbackRecord(state, record.id);
    const execution = bundle?.execution;
    const chain = bundle ? resolveActionSkillChain(state, record, bundle.artifact)
      : unavailableSkillChain('skill_source_incomplete', '原记录来源链不完整。');
    const article = node('div', undefined, 'saved-record');
    const label = node('label');
    const radio = document.createElement('input');
    radio.type = 'radio'; radio.name = 'saved-feedback-choice'; radio.value = record.id;
    radio.checked = record.id === selectedFeedbackId;
    radio.addEventListener('change', () => {
      selectedFeedbackId = record.id;
      $('next-round').disabled = dirty || saving || readingReview;
    });
    label.append(radio, document.createTextNode(` ${EXECUTION_LABELS[execution?.execution ?? 'unknown']} · ${OBSERVATION_LABELS[record.observation] ?? '观察结果未知'}`));
    article.append(label, node('p', ADOPTION_LABELS[execution?.adoption ?? 'unknown'] + '（商家自述）', 'muted'));
    if (record.detailsVersion === 1) {
      const details = node('details', undefined, 'action-disclosure saved-feedback-details');
      details.append(node('summary', '查看已保存的采用原因、样本与异常'));
      const values = node('dl', undefined, 'experiment-facts');
      for (const [title, value] of feedbackDetailRows(record)) values.append(node('dt', title), node('dd', value));
      details.append(values);
      article.append(details);
    }
    if (record.rawText) article.append(node('p', record.rawText));
    if (execution?.scope) article.append(node('p', `自述执行范围：${execution.scope}`));
    article.append(node('p', skillChainLabel(chain), chain.ok ? 'muted' : 'action-warning'),
      node('p', `稿件 v${record.artifactVersion} · 实际执行时间：${execution?.executedAt || '未知'}`, 'muted'),
      node('p', `反馈时间：${readableTime(record.reportedAt)}`, 'muted'),
      node('p', `${readFeedbackIds.has(record.id) ? '已读取本机记录' : '已保存到本机浏览器'} · 保存时间：${readableTime(record.savedAt)}`, 'muted'));
    container.append(article);
  }
  if (records.length) container.append(node('p', '以上为商家自述，未由平台核验；未明确采用的状态仍为未知。', 'muted'));
  $('next-round').disabled = dirty || saving || readingReview || !selectedFeedbackId;
}

// A3_MONEYAI_HISTORY_GATE_START
function moneyAIHistoryIdentityKey(snapshot, bundle) {
  const feedback = bundle?.feedback;
  const artifact = bundle?.artifact;
  return snapshot && feedback && artifact ? [snapshot.sessionId, feedback.roundId, feedback.inputVersion,
    feedback.analysisId, feedback.pathId, artifact.id, artifact.version, feedback.id, feedback.savedAt].join('|') : null;
}

function nullableString(value) {
  return typeof value === 'string' && value.length ? value : null;
}

function moneyAIRecordScalar(value) {
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  return typeof value === 'string' ? value.slice(0, 2000) : null;
}

function stringArray(value, limit = 20) {
  return Array.isArray(value) ? value.filter((item) => typeof item === 'string').slice(0, limit) : [];
}

export function buildMoneyAIDecisionRecord(snapshot, feedbackId) {
  const bundle = resolveFeedbackRecord(snapshot, feedbackId);
  const input = bundle?.analysis?.inputSnapshot;
  if (!bundle?.analysis || !bundle.path || !input
      || ![input.facts, input.constraints, input.unknowns].every(Array.isArray)) return null;
  const { feedback, execution, artifact, path, analysis } = bundle;
  const skillChain = resolveActionSkillChain(snapshot, feedback, artifact);
  if (!skillChain.ok) return null;
  const experiment = path.experiment ?? {};
  const source = analysis.sourceFixtureId ? 'synthetic_demo' : 'confirmed_project_decision';
  const contextOrigin = source === 'synthetic_demo' ? 'synthetic_seed' : 'confirmed_merchant_input';
  return {
    schema: 'luya.p3.decision-feedback.v1',
    recordVersion: MONEYAI_LOCAL_FEEDBACK_RECORD_VERSION,
    source,
    identity: {
      sessionId: snapshot.sessionId,
      roundId: feedback.roundId,
      inputVersion: feedback.inputVersion,
      analysisId: feedback.analysisId,
      pathId: feedback.pathId,
      artifactId: artifact.id,
      artifactVersion: artifact.version,
      feedbackId: feedback.id,
      feedbackRecordVersion: MONEYAI_LOCAL_FEEDBACK_RECORD_VERSION,
      feedbackDetailsVersion: Number.isSafeInteger(feedback.detailsVersion) ? feedback.detailsVersion : 0,
      feedbackSavedAt: feedback.savedAt,
    },
    context: {
      focus: nullableString((input.focus || input.description || '').slice(0, 2000)),
      facts: input.facts.slice(0, 100).map((fact) => ({ id: nullableString(fact?.id), key: nullableString(fact?.key),
        value: moneyAIRecordScalar(fact?.value),
        availability: nullableString(fact?.availability), evidenceStatus: nullableString(fact?.evidenceStatus),
        unit: nullableString(fact?.unit), subject: nullableString(fact?.subject), sourceKind: nullableString(fact?.source?.kind),
        verification: nullableString(fact?.verification), dataOrigin: contextOrigin })),
      constraints: input.constraints.slice(0, 50).map((item) => ({ id: nullableString(item?.id),
        description: nullableString(item?.description), value: moneyAIRecordScalar(item?.value),
        unit: nullableString(item?.unit), scope: nullableString(item?.scope), sourceFactIds: stringArray(item?.sourceFactIds, 50), dataOrigin: contextOrigin })),
      unknowns: input.unknowns.slice(0, 50).map((item) => ({ id: nullableString(item?.id), description: nullableString(item?.description),
        reason: nullableString(item?.reason), sourceId: nullableString(item?.sourceId), dataOrigin: contextOrigin })),
    },
    decision: {
      actionKey: nullableString(path.actionKey),
      skillId: skillChain.skillId,
      optionLabel: nullableString(path.optionLabel),
      title: nullableString(path.title),
      experimentId: nullableString(experiment.experimentId),
      hypothesis: nullableString(experiment.hypothesis),
      singleVariable: nullableString(experiment.change),
      targetMetric: nullableString(experiment.target?.metric),
      minSample: Number.isSafeInteger(experiment.minSample) && experiment.minSample >= 0 ? experiment.minSample : null,
      minSampleUnit: nullableString(experiment.minSampleUnit),
      keepFixed: stringArray(experiment.keepFixed),
    },
    artifact: {
      skillId: skillChain.skillId,
      kind: nullableString(artifact.kind),
      title: nullableString(artifact.title),
      placement: nullableString(artifact.usage?.placement),
    },
    execution: {
      adoption: execution?.adoption ?? 'unknown',
      execution: execution?.execution ?? 'unknown',
      scope: nullableString(execution?.scope),
      executedAt: nullableString(execution?.executedAt),
    },
    feedback: {
      observation: feedback.observation ?? 'unknown',
      rawText: typeof feedback.rawText === 'string' ? feedback.rawText : '',
      reason: nullableString(feedback.reason),
      sampleSize: Number.isSafeInteger(feedback.sampleSize) && feedback.sampleSize >= 0 ? feedback.sampleSize : null,
      sampleUnit: nullableString(feedback.sampleUnit),
      metricBefore: typeof feedback.metricBefore === 'number' && Number.isFinite(feedback.metricBefore) ? feedback.metricBefore : null,
      metricAfter: typeof feedback.metricAfter === 'number' && Number.isFinite(feedback.metricAfter) ? feedback.metricAfter : null,
      constraintsLearned: stringArray(feedback.constraintsLearned),
      guardrailStatus: feedback.guardrailStatus ?? 'unknown',
      reportedAt: feedback.reportedAt ?? null,
    },
  };
}

export async function makeMoneyAIDecisionWriteRequest(snapshot, feedbackId, contract, attemptId) {
  const bundle = resolveFeedbackRecord(snapshot, feedbackId);
  const record = buildMoneyAIDecisionRecord(snapshot, feedbackId);
  if (!bundle || !record || typeof contract?.computeMoneyAIInputFingerprint !== 'function'
      || typeof contract?.createMoneyAIEnvelope !== 'function') throw new Error('moneyai_record_unavailable');
  const inputFingerprint = await contract.computeMoneyAIInputFingerprint(record);
  const scope = {
    sessionId: snapshot.sessionId,
    roundId: bundle.feedback.roundId,
    inputVersion: bundle.feedback.inputVersion,
    analysisId: bundle.feedback.analysisId,
    pathId: bundle.feedback.pathId,
    artifact: { id: bundle.artifact.id, version: bundle.artifact.version },
    feedback: {
      id: bundle.feedback.id,
      recordVersion: MONEYAI_LOCAL_FEEDBACK_RECORD_VERSION,
      detailsVersion: Number.isSafeInteger(bundle.feedback.detailsVersion) ? bundle.feedback.detailsVersion : 0,
    },
    inputFingerprint,
  };
  const operationId = `p3.decision.${inputFingerprint.slice('sha256:'.length)}`;
  const request = contract.createMoneyAIEnvelope({
    operation: 'decision.write',
    operationId,
    attemptId,
    scope,
    consent: {
      granted: true,
      sendScope: ['saved_analysis_context', 'saved_decision', 'saved_feedback'],
      dataClasses: record.source === 'synthetic_demo'
        ? ['synthetic_analysis_summary', 'decision_record', 'feedback_record']
        : ['confirmed_analysis_summary', 'decision_record', 'feedback_record'],
    },
    payload: { version: 'decision.record.v1', record },
  });
  return { identityKey: moneyAIHistoryIdentityKey(snapshot, bundle), record, scope, operationId, request };
}

export async function makeMoneyAIHistoryReadRequest(prepared, contract, { attemptId, operationId, recordId = null }) {
  if (!prepared?.record || !prepared.scope || typeof contract?.computeMoneyAIInputFingerprint !== 'function'
      || typeof contract?.createMoneyAIEnvelope !== 'function') throw new Error('moneyai_record_unavailable');
  const query = { limit: 1, cursor: null, operationIds: [prepared.operationId], roundIds: [prepared.scope.roundId] };
  if (recordId) query.recordIds = [recordId];
  const inputFingerprint = await contract.computeMoneyAIInputFingerprint(query);
  const request = contract.createMoneyAIEnvelope({
    operation: 'history.read',
    operationId,
    attemptId,
    scope: { ...prepared.scope, inputFingerprint },
    consent: {
      granted: true,
      sendScope: ['history_query'],
      dataClasses: ['record_identifiers'],
    },
    payload: { version: 'history.query.v1', query },
  });
  return { prepared, query, request, recordId };
}

function canonicalMoneyAIValue(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonicalMoneyAIValue).join(',') + ']';
  return '{' + Object.keys(value).sort().map((key) => JSON.stringify(key) + ':' + canonicalMoneyAIValue(value[key])).join(',') + '}';
}

export function verifyMoneyAIHistoryRead(result, prepared, writeReceipt = null) {
  if (!result?.ok || !Array.isArray(result.records) || result.records.length !== 1
      || result.readReceipt?.provider !== 'moneyai' || result.readReceipt.projectScoped !== true
      || result.readReceipt.count !== 1) return null;
  const entry = result.records[0];
  if (!entry || typeof entry.providerRecordId !== 'string' || !entry.providerRecordId
      || typeof entry.contentHash !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(entry.contentHash)
      || typeof entry.writtenAt !== 'string' || !Number.isFinite(Date.parse(entry.writtenAt))
      || entry.operationId !== prepared.operationId
      || writeReceipt && (entry.providerRecordId !== writeReceipt.recordId || entry.contentHash !== writeReceipt.contentHash)
      || canonicalMoneyAIValue(entry.scope) !== canonicalMoneyAIValue(prepared.scope)
      || canonicalMoneyAIValue(entry.record) !== canonicalMoneyAIValue(prepared.record)) return null;
  return { entry, readReceipt: { ...result.readReceipt }, receipt: { ...result.receipt } };
}

// A3_MONEYAI_HISTORY_GATE_END

function renderHistory() {
  const records = (state.feedbackRecords ?? []).filter((record) => !sameReference(record, activeSelection(state)));
  $('history-panel').hidden = !records.length;
  const container = $('history-list');
  container.replaceChildren();
  for (const record of records) {
    const bundle = resolveFeedbackRecord(state, record.id);
    const execution = bundle?.execution;
    const chain = bundle ? resolveActionSkillChain(state, record, bundle.artifact)
      : unavailableSkillChain('skill_source_incomplete', '原记录来源链不完整。');
    const article = node('div', undefined, 'history-item');
    article.append(node('p', `历史稿件 v${record.artifactVersion} · ${EXECUTION_LABELS[execution?.execution ?? 'unknown']} · ${OBSERVATION_LABELS[record.observation] ?? '观察结果未知'}`),
      node('p', record.rawText || '未填写观察原话。'), node('p', skillChainLabel(chain), chain.ok ? 'muted' : 'action-warning'),
      node('p', `实际执行时间：${execution?.executedAt || '未知'}；保存时间：${readableTime(record.savedAt)}`, 'muted'));
    container.append(article);
  }
}

function writeActionHash(hash) {
  try { window.history.replaceState(window.history.state, '', hash); }
  catch { /* Blocked URL updates must not change business state or discard a draft. */ }
}

function renderActionTabs() {
  const hasContext = Boolean(shownContext);
  const reviewing = pageMode === 'review' && !$('review-content').hidden;
  $('action-view-tabs').hidden = !hasContext && !reviewing;
  const busy = accepting || saving || readingReview || Boolean(pendingAcceptance);
  for (const [name, control] of [['work', 'action-work-tab'], ['feedback', 'action-feedback-tab']]) {
    const selected = name === (reviewing ? 'feedback' : activeWorkspaceTab);
    $(control).setAttribute('aria-selected', String(selected));
    $(control).tabIndex = selected ? 0 : -1;
    $(control).disabled = busy || (name === 'work' && !hasContext);
  }
  $('action-feedback-tab').setAttribute('aria-controls', reviewing ? 'review-content' : 'feedback-panel');
  $('work-panel').hidden = !hasContext || reviewing || activeWorkspaceTab !== 'work';
  $('feedback-panel').hidden = !hasContext || reviewing || activeWorkspaceTab !== 'feedback';
}

function setWorkspaceTab(tab, { updateHash = true, focus = false } = {}) {
  if (!['work', 'feedback'].includes(tab)) return;
  if (accepting || saving || readingReview || pendingAcceptance) {
    status('operation-status', '正在保存或核对本机记录，请完成后再切换。');
    return;
  }
  invalidateViewRead();
  pageMode = 'action';
  activeWorkspaceTab = tab;
  if (updateHash) writeActionHash(tab === 'feedback' ? '#feedback' : '#work');
  render();
  if (focus) $(tab === 'work' ? (activeSelection(state) ? 'action-title' : 'action-main') : 'action-feedback-tab').focus();
  if (tab === 'work') logPreviewView();
}

async function applyActionHash() {
  if (!state || accepting) return;
  const hash = window.location.hash || '';
  if (hash === '#history') { openProject(); return; }
  if (hash.startsWith('#review=')) {
    const feedbackId = hash.slice('#review='.length);
    if (/^[A-Za-z0-9_-]{1,80}$/.test(feedbackId) && resolveFeedbackRecord(state, feedbackId)) {
      if (reviewFeedbackId !== feedbackId || pageMode !== 'review') await openReview(feedbackId);
    } else status('operation-status', '这条档案链接没有完整的本机记录，请在活动档案中重新选择。', true);
    return;
  }
  setWorkspaceTab(hash === '#feedback' ? 'feedback' : 'work', { updateHash: false });
}

function render() {
  if (!state) return;
  renderAcceptanceControls();
  $('open-project').disabled = accepting;
  $('open-review').disabled = accepting || saving || readingReview || !(state.feedbackRecords ?? []).some((record) => resolveFeedbackRecord(state, record.id));
  const current = activeSelection(state);
  const keepOldDraft = dirty && shownContext && !sameReference(current, shownContext);
  const context = keepOldDraft ? shownContext : current;
  $('load-state').hidden = true;
  $('empty-state').hidden = Boolean(context);
  $('action-content').hidden = !context;
  renderHistory();
  if (!context) {
    const confirmed = state.input.confirmedVersion === state.round.inputVersion;
    $('empty-description').textContent = !confirmed
      ? '本轮问题还需要确认。先到第一页核对，再到第二页选择行动；本页不会替你默认选路。'
      : state.selection || state.analysis?.status === 'stale'
      ? '原来的依据或选择已更新。请回第二页重新核对并选择；已有记录不会被删除。'
      : '这里会放你在第二页选好的行动内容。先看清取舍，再选一件要做的事。';
    $('go-decisions-empty').textContent = confirmed ? '去第二页看选择' : '先到第一页确认问题';
    clearFeedbackForm();
    $('export-summary-consent').checked = false;
    consentSignature = null;
    shownContext = null;
    previewItems = [];
    previewKey = null;
    previewPart = 'content';
    previewFingerprint = '';
    artifactFingerprint = '';
    renderedPackSignature = null;
    $('all-copy-fallback').value = '';
    $('all-copy-fallback').hidden = true;
    renderReview();
    return;
  }
  if (!sameReference(shownContext, context)) {
    clearFeedbackForm();
    shownContext = context;
    artifactFingerprint = '';
    previewFingerprint = '';
    previewKey = null;
    previewPart = 'content';
    selectedFeedbackId = null;
    feedbackBinding = null;
  }
  const skillChain = resolveActionSkillChain(state, context);
  const artifacts = skillChain.ok ? currentSkillArtifacts(state, context) : [];
  $('round-label').textContent = `第 ${context.roundIndex} 轮 · 输入 v${context.inputVersion}`;
  $('action-title').textContent = context.path.title;
  const pathPresentation = describeActionPath(context.path, keepOldDraft);
  $('selected-plan-label').textContent = pathPresentation.label;
  $('action-path-note').textContent = pathPresentation.note;
  appendList($('keep-fixed-list'), context.path.experiment?.keepFixed, '本轮保持不变项尚未提供，请先核对。');
  $('problem-summary').textContent = keepOldDraft
    ? '本轮资料或选择已更新；这里保留原行动的反馈草稿，不把新资料写入原版本。'
    : textValue(state.input.focus || state.input.description, '本轮范围尚未填写');
  $('context-meta').textContent = `${originLabel(context.mode)} · ${skillChainLabel(skillChain)}${keepOldDraft ? ' · 历史行动，草稿仍对应原版本' : ''}`;
  renderArtifacts(artifacts, keepOldDraft);
  renderedPackSignature = keepOldDraft ? null : packSignature(state);
  renderRisks(context.path);
  appendList($('prerequisite-list'), context.path.prerequisites?.map((item) => `${item.text}${item.status === 'unknown' ? '（待核对）' : item.status === 'unmet' ? '（尚未满足）' : ''}`), '尚未给出额外使用条件。');
  renderExperiment(context.path);
  renderSources(context);
  $('generation-limitations').hidden = !generationLimitations.length;
  appendList($('generation-limitations'), generationLimitations, '');
  $('export-consent').hidden = false;
  if (consentSignature !== packSignature(state)) {
    $('export-summary-consent').checked = false;
    consentSignature = null;
  }
  $('export-pack').disabled = exporting || generating || generationFailures.length > 0 || !artifacts.length || keepOldDraft || !skillChain.ok;
  $('feedback-fields').disabled = saving || accepting || Boolean(pendingAcceptance) || !artifacts.length || !skillChain.ok;
  const select = $('feedback-artifact');
  const optionsKey = artifacts.map((artifact) => `${artifact.id}:${artifact.version}`).join('|');
  if (!dirty && select.dataset.optionsKey !== optionsKey) {
    clearFeedbackForm();
    select.replaceChildren();
    for (const artifact of artifacts) {
      const option = node('option', `${artifact.title} · v${artifact.version}`);
      option.value = artifact.id; select.append(option);
    }
    select.dataset.optionsKey = optionsKey;
  }
  $('feedback-artifact-field').hidden = artifacts.length <= 1;
  renderSavedFeedback(context);
  syncFeedbackControls();
  renderCopyAllControls();
  renderReview();
  if (!skillChain.ok) {
    generationFailures = [];
    $('artifact-retry').hidden = false;
    $('artifact-retry').disabled = true;
    status('artifact-status', skillChain.message + ' 页面没有生成、保存或开放取用稿件。', true);
  } else $('artifact-retry').disabled = false;
  if (keepOldDraft) status('feedback-status', '资料或选择已更新。这份草稿仍对应原行动；保存时不会搬到新路径，也可以明确放弃草稿。', true);
}

function matchesDraft(artifact, draft) {
  return sameReference(artifact, draft) && artifact.kind === draft.kind && artifact.title === draft.title &&
    artifact.body === draft.body && artifact.skillId === draft.skillId && JSON.stringify(artifact.usage) === JSON.stringify(draft.usage);
}

async function ensureArtifacts() {
  if (generating || dirty || accepting || pendingAcceptance) return;
  const context = activeSelection(state);
  if (!context) return;
  const skillChain = resolveActionSkillChain(state, context);
  if (!skillChain.ok) {
    generationFailures = [];
    $('artifact-retry').hidden = false;
    $('artifact-retry').disabled = true;
    status('artifact-status', skillChain.message + ' 未调用稿件生成或保存接口。', true);
    render();
    return false;
  }
  const skillIdentity = { sessionId: state.sessionId, roundId: context.roundId, inputVersion: context.inputVersion,
    analysisId: context.analysisId, pathId: context.pathId, operationId: skillChain.operationId, skillId: skillChain.skillId };
  const token = ++generationToken;
  const acceptanceRequest = acceptanceToken;
  generating = true;
  generationFailures = [];
  let drafts = [];
  let acceptedIdentity = null;
  const checkBeforeSave = (snapshot) => {
    if (token !== generationToken || (acceptedIdentity && acceptanceRequest !== acceptanceToken)) {
      throw Object.assign(new Error('本次稿件准备已被后续操作取代，没有继续保存。'), { code: 'request_cancelled' });
    }
    if (acceptedIdentity) checkedAcceptedIdentity(snapshot, acceptedIdentity);
    const current = activeSelection(snapshot);
    const currentChain = resolveActionSkillChain(snapshot, current);
    if (!currentChain.ok || snapshot.sessionId !== skillIdentity.sessionId || current?.roundId !== skillIdentity.roundId ||
        current.inputVersion !== skillIdentity.inputVersion || current.analysisId !== skillIdentity.analysisId ||
        current.pathId !== skillIdentity.pathId || currentChain.operationId !== skillIdentity.operationId ||
        currentChain.skillId !== skillIdentity.skillId) {
      throw new Error('分析、选择、provider 回执或执行 Skill 已变化；本次稿件没有继续保存。');
    }
  };
  $('artifact-retry').hidden = true;
  try {
    // Freeze the original acceptance identity; a later cleared UI receipt must not downgrade this run to first-round behavior.
    acceptedIdentity = checkedAcceptedIdentity(state);
    const result = shared.buildDemoArtifact(state);
    if (!result.ok) { status('artifact-status', errorText(result), true); $('artifact-retry').hidden = false; return; }
    drafts = result.artifacts;
    const selectedShoeCopy = buildSelectedShoeActionCopy(state, context, skillChain, drafts);
    if (selectedShoeCopy && !drafts.some((draft) => draft.kind === 'copy')) drafts = [selectedShoeCopy, ...drafts];
    if (!Array.isArray(drafts) || !drafts.length || drafts.some((draft) =>
      !sameReference(draft, context) || draft.mode !== context.mode || draft.skillId !== skillIdentity.skillId)) {
      throw new Error('生成结果没有继承所选路径的 Skill 与版本身份；没有保存任何稿件。');
    }
    generationLimitations = result.limitations ?? [];
    for (const draft of result.artifacts) {
      if (!sameReference(activeSelection(state), context)) break;
      if (currentSkillArtifacts(state, context).some((artifact) => matchesDraft(artifact, draft))) continue;
      const key = JSON.stringify(draft);
      if (!artifactCommands.has(key)) artifactCommands.set(key, command('ARTIFACT_SAVE', { artifact: draft }));
      const saved = await commit(artifactCommands.get(key), checkBeforeSave);
      if (!saved.ok) {
        generationFailures = result.artifacts;
        $('artifact-retry').hidden = false;
        status('artifact-status', errorText(saved), true);
        break;
      }
      artifactCommands.delete(key);
    }
    checkBeforeSave(state);
    if (!generationFailures.length && drafts.some((draft) =>
      !currentSkillArtifacts(state, context).some((artifact) => matchesDraft(artifact, draft)))) {
      throw new Error('稿件保存后的 Skill、版本或来源读回不一致；本次准备未确认完成。');
    }
    if (!generationFailures.length) status('artifact-status', '');
  } catch (error) {
    if (token !== generationToken || (acceptedIdentity && acceptanceRequest !== acceptanceToken)) return false;
    generationFailures = drafts;
    status('artifact-status', error.message || '行动内容准备失败。', true);
    $('artifact-retry').hidden = false;
    return false;
  } finally {
    if (token === generationToken) {
      generating = false;
      render();
    }
  }
  if (token !== generationToken || (acceptedIdentity && acceptanceRequest !== acceptanceToken)) return false;
  if (!sameReference(context, activeSelection(state))) {
    if (activeSelection(state) && !dirty) void ensureArtifacts();
    return false;
  }
  return generationFailures.length === 0;
}

function renderCopyAllControls() {
  let pack = null;
  try { pack = buildActionCopy(state); } catch { /* A checklist is not publishable copy. */ }
  const blocked = !pack || pack.signature !== renderedPackSignature || previewStale || copying || generating || generationFailures.length > 0;
  $('copy-all').disabled = blocked;
  $('select-all').disabled = blocked;
  $('copy-all').textContent = copying ? '正在复制…' : '复制全部文案';
  $('copy-all').title = pack ? '复制当前方案的全部已保存文案，不包含核对清单或观察计划' : '当前尚无已保存文案；已有核对清单仍可分别取用或下载';
  const area = $('all-copy-fallback');
  if (!area.hidden && (!pack || area.dataset.signature !== pack.signature)) {
    area.value = ''; area.hidden = true; delete area.dataset.signature;
  }
}

function showAllCopy(pack) {
  const area = $('all-copy-fallback');
  area.hidden = false; area.value = pack.text; area.dataset.signature = pack.signature;
  selectPreviewText(area);
}

async function copyAllAction(manual = false) {
  if (copying || generating || previewStale || generationFailures.length) return;
  let pack;
  copying = true;
  try {
    // Lock the user's intent to what was rendered, not a selection discovered during the read.
    const intent = buildActionCopy(state, { expectedSignature: renderedPackSignature });
    renderCopyAllControls();
    const result = await readState();
    if (!result.ok) throw new Error(errorText(result));
    pack = buildActionCopy(state, { expectedSignature: intent.signature });
    if (manual) {
      showAllCopy(pack);
      status('artifact-status', '已选中本方案全部文案；请使用系统复制。没有记录为已复制或已执行。');
      return;
    }
    if (!navigator.clipboard?.writeText) throw new Error('浏览器未提供剪贴板写入。');
    await navigator.clipboard.writeText(pack.text);
    status('artifact-status', pack.signature === packSignature(state)
      ? '已复制本方案全部文案；未记录采用或执行。'
      : '原版本全文已复制，但当前资料已变化；请核对后再使用。');
    for (const artifact of pack.artifacts) await logEvent('copy_succeeded', contextRefs(pack.context, artifact), pack.context.roundId);
  } catch (error) {
    const canSelect = pack && pack.signature === packSignature(state);
    if (canSelect) {
      try { showAllCopy(pack); } catch { /* Read-only full copy remains visible. */ }
    }
    status('artifact-status', '未确认全文复制成功：' + error.message + (canSelect ? ' 可使用下方只读全文手动复制。' : ''), true);
  } finally { copying = false; render(); }
}

function selectPreviewText(area) {
  area.focus();
  if (typeof area.select === 'function') { area.select(); return; }
  const selection = window.getSelection();
  if (!selection) throw new Error('当前浏览器未提供文字选区，可直接拖选所需文字。');
  const range = document.createRange();
  range.selectNodeContents(area);
  selection.removeAllRanges();
  selection.addRange(range);
}

function manuallySelectPreview() {
  const artifact = selectPreviewArtifact(previewItems, previewKey);
  if (!artifact || !artifactPreviewText(artifact, previewPart)) return;
  try {
    selectPreviewText($(previewPart === 'steps' ? 'preview-steps' : 'preview-body'));
    status('artifact-status', `${previewPart === 'steps' ? '步骤' : '内容'}已选中，可按 Ctrl+C 或使用系统复制菜单；尚未确认复制成功。`);
  } catch (error) { status('artifact-status', error.message, true); }
}

async function copyArtifact(artifact, area, part = 'content') {
  if (!artifact || copying) return;
  let checked = false;
  copying = true;
  renderPreview();
  try {
    const fresh = await readState();
    if (!fresh.ok) throw new Error(errorText(fresh));
    const context = activeSelection(state);
    if (!currentSkillArtifacts(state, context).some((item) => item.id === artifact.id && item.version === artifact.version)) {
      render(); status('artifact-status', '这份内容已失效，未复制。请回第二页核对当前选择。', true); return;
    }
    checked = true;
    const text = artifactPreviewText(artifact, part);
    if (!text) throw new Error('当前预览没有可复制的文字。');
    if (!navigator.clipboard?.writeText) throw new Error('浏览器未提供剪贴板写入。');
    await navigator.clipboard.writeText(text);
    status('artifact-status', `已复制「${artifact.title}」的${part === 'steps' ? '步骤' : '内容'}；没有记录为采用或执行。`);
    await logEvent('copy_succeeded', contextRefs(context, artifact), context.roundId);
  } catch (error) {
    if (checked && previewKey === previewArtifactKey(artifact) && previewPart === part) {
      try { selectPreviewText(area); } catch { /* The visible text remains available for direct selection. */ }
    }
    status('artifact-status', checked
      ? `没有确认「${artifact.title}」复制成功。${error.message} 文字仍可手动选取，按 Ctrl+C 或使用系统复制菜单。`
      : `未复制：${error.message} 请先重试读取并核对版本。`, true);
  } finally {
    copying = false;
    renderPreview();
  }
}

async function exportPack() {
  if (exporting) return;
  exporting = true; render();
  let objectUrl;
  try {
    await commandQueue;
    const firstRead = await readState();
    if (!firstRead.ok) throw new Error(errorText(firstRead));
    const frozen = structuredClone(state);
    const pack = buildActionPack(frozen, { exportId: id(), generatedAt: new Date().toISOString(),
      allowSummaries: $('export-summary-consent').checked && consentSignature === packSignature(frozen) });
    const secondRead = await readState();
    if (!secondRead.ok) throw new Error(errorText(secondRead));
    if (pack.signature !== packSignature(state)) throw new Error('导出期间依据、选择或稿件版本变化，未发起下载。请核对后重试。');
    objectUrl = URL.createObjectURL(new Blob([pack.text], { type: 'text/plain;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = objectUrl; anchor.download = pack.filename;
    document.body.append(anchor); anchor.click(); anchor.remove();
    const usedUrl = objectUrl;
    setTimeout(() => URL.revokeObjectURL(usedUrl), 1000);
    objectUrl = null;
    status('operation-status', '已发起 TXT 下载，请在浏览器中查看；尚未确认文件落盘，也未记录为执行。');
    const context = activeSelection(frozen);
    await logEvent('download_requested', { ...contextRefs(context), exportId: pack.metadata.exportId, format: 'txt' }, context.roundId);
  } catch (error) {
    status('operation-status', error.message || '导出失败，页面文字仍可手动取用。', true);
  } finally {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    $('export-summary-consent').checked = false;
    consentSignature = null;
    exporting = false; render();
  }
}

export function findSavedFeedback(pending, next) {
  const expected = pending.command.payload.feedbackRecord;
  const matching = (next.feedbackRecords ?? []).filter((record) => !pending.beforeIds.has(record.id) &&
    sameReference(record, expected) && record.artifactId === expected.artifactId && record.artifactVersion === expected.artifactVersion &&
    record.observation === expected.observation && (record.rawText || null) === expected.rawText && feedbackDetailsMatch(record, expected));
  const exact = matching.filter((record) => {
    const execution = next.executionRecords?.find((item) => item.id === record.executionRecordId);
    const wanted = pending.command.payload.executionRecord;
    return execution?.execution === wanted.execution && execution.adoption === wanted.adoption &&
      (execution.scope ?? null) === wanted.scope && (execution.executedAt ?? null) === wanted.executedAt;
  });
  return exact.length === 1 ? exact[0] : null;
}

async function saveFeedback(event) {
  event?.preventDefault();
  if (saving || accepting || pendingAcceptance) return false;
  const signature = formSignature();
  if (signature === lastSavedDraft && !dirty) return true;
  try {
    if (!pendingFeedback || pendingFeedback.signature !== signature) {
      const artifact = feedbackBinding || currentSkillArtifacts(state).find((item) => item.id === $('feedback-artifact').value);
      const payload = makeFeedbackPayload(artifact, getFormDraft(), { detailsVersion: shared?.FEEDBACK_DETAILS_VERSION });
      pendingFeedback = { signature, command: command('FEEDBACK_SAVE', payload), beforeIds: new Set((state.feedbackRecords ?? []).map((item) => item.id)) };
      feedbackBinding = artifact;
    }
    saving = true; $('feedback-fields').disabled = true;
    status('feedback-status', '正在保存到本机浏览器…');
    const saved = await commit(pendingFeedback.command);
    if (!saved.ok) { status('feedback-status', errorText(saved), true); return false; }
    const savedAttempt = pendingFeedback;
    const expectedFeedback = savedAttempt.command.payload.feedbackRecord;
    const record = findSavedFeedback(pendingFeedback, state);
    if (expectedFeedback.detailsVersion === 1 && !record) {
      dirty = true;
      status('feedback-status', '提交已返回，但完整明细保存尚未确认。原草稿与本次命令仍保留；可重试核对，不会自动退回旧版字段或重复新建记录。', true);
      return false;
    }
    selectedFeedbackId = record?.id ?? null;
    lastSavedDraft = pendingFeedback.signature;
    dirty = false;
    pendingFeedback = null;
    savedRecordNotice = record
      ? `已保存到本机浏览器 · 稿件 v${record.artifactVersion} · ${readableTime(record.savedAt)}。实际执行时间仍按你的填写记录。`
      : '保存已完成。请从本机记录中明确选择复盘对象；本页没有猜测最后一条记录。';
    if (record) {
      let rereadConfirmed = false;
      try {
        const reread = await readState();
        const rereadBundle = reread.ok ? resolveFeedbackRecord(state, record.id) : null;
        rereadConfirmed = Boolean(rereadBundle && findSavedFeedback(savedAttempt, state)?.id === record.id);
        if (rereadConfirmed) readFeedbackIds.add(record.id);
        else readFeedbackIds.delete(record.id);
      } catch { /* Save was confirmed; a read failure must not become a second save. */ }
      savedRecordNotice += rereadConfirmed ? ' 已重新读取对应记录，可查看反馈后改判。'
        : ' 本机保存已确认，但对应记录读回尚未确认；打开复盘时可重试，不会再次保存。';
    }
    status('feedback-status', savedRecordNotice);
    return true;
  } catch (error) {
    status('feedback-status', error.message || '保存失败，草稿仍保留。', true);
    return false;
  } finally {
    saving = false;
    render();
  }
}

function discardFeedback() {
  if (saving) return false;
  clearFeedbackForm();
  status('feedback-status', '未保存草稿已放弃；已有记录保留。');
  render();
  return true;
}

function invalidateViewRead() {
  viewReadToken += 1;
  readingReview = false;
}

async function readReviewRecord(feedbackId, token, sessionId) {
  // A closed or superseded view must not adopt a late snapshot or reopen a dialog.
  const result = await shared.loadSession();
  if (token !== viewReadToken || state?.sessionId !== sessionId) return null;
  if (!result.ok) throw new Error(errorText(result));
  if (result.state.sessionId !== sessionId) throw new Error('当前项目已变化，请返回当前项目重新核对。');
  if (result.state.revision < state.revision) throw new Error('读取期间记录已更新，请重新打开最新记录。');
  const bundle = resolveFeedbackRecord(result.state, feedbackId);
  if (!bundle) throw new Error('该记录或原稿引用不完整，未使用其他版本代替。');
  acceptState(result.state);
  rememberAcceptedRead(result.state);
  readFeedbackIds.add(feedbackId);
  return { ...bundle, snapshot: result.state };
}

async function openReview(feedbackId) {
  if (readingReview || saving || accepting) return;
  if (dirty) { status('round-status', '当前还有未保存的填写，请先保存或明确放弃，再查看已存记录的复盘。', true); return; }
  if (!feedbackId) { openProject(); return; }
  readingReview = true;
  const token = ++viewReadToken;
  const sessionId = state.sessionId;
  $('next-round').disabled = true;
  try {
    status('round-status', '正在重新读取这条本机记录；不会创建下一轮。');
    const bundle = await readReviewRecord(feedbackId, token, sessionId);
    if (!bundle) return;
    const result = buildExperimentReview(bundle.snapshot, feedbackId);
    if (!result.ok) throw new Error(result.message || '原记录来源核对失败，没有生成判断或候选。');
    describeExperimentReview(result.review);
    if (!reviewSnapshotMatches(state, result.review)) throw new Error('读取后来源已变化，请重新读取这条记录。');
    activeReview = { bundle, review: result.review };
    acceptanceRecheckId = null;
    reviewFeedbackId = feedbackId;
    pageMode = 'review';
    activeWorkspaceTab = 'feedback';
    writeActionHash('#review=' + feedbackId);
    render();
    $('review-title').focus();
    status('round-status', '');
    await logEvent('session_read', { pageId: 'action', stateRevision: state.revision });
  } catch (error) {
    if (token !== viewReadToken) return;
    status('operation-status', '尚未打开复盘：' + error.message, true);
    status('round-status', '记录读回尚未确认，可以重试；不会重复保存或建轮。', true);
  } finally {
    if (token === viewReadToken) readingReview = false;
    render();
  }
}

function returnToAction() {
  if (accepting) { status('acceptance-status', '正在核对接受操作，请稍候。'); return; }
  const wasReading = readingReview;
  invalidateViewRead();
  if (wasReading) status('round-status', '已取消查看；记录保持不变。');
  pageMode = 'action';
  activeWorkspaceTab = 'work';
  writeActionHash('#work');
  render();
  (activeSelection(state) ? $('action-title') : $('action-main')).focus();
}

function showDialog(dialogId, opener = document.activeElement) {
  const dialog = $(dialogId);
  dialogOpeners.set(dialogId, opener);
  if (typeof dialog.showModal === 'function') {
    if (!dialog.open) dialog.showModal();
  } else {
    dialog.setAttribute('open', '');
    dialog.setAttribute('role', 'dialog');
    dialog.scrollIntoView?.({ block: 'start' });
  }
}

function closeDialog(dialogId) {
  const wasReading = readingReview;
  invalidateViewRead();
  const dialog = $(dialogId);
  if (typeof dialog.close === 'function') dialog.close();
  else dialog.removeAttribute('open');
  if (dialogId === 'project-dialog' && window.location.hash === '#history') {
    writeActionHash(pageMode === 'review' && reviewFeedbackId ? '#review=' + reviewFeedbackId : '#' + activeWorkspaceTab);
  }
  if (wasReading) render();
  dialogOpeners.get(dialogId)?.focus?.();
  dialogOpeners.delete(dialogId);
}

function sourceViewEvents() {
  if (!$('evidence-dialog').open || !$('source-details').open || pageMode !== 'action') return;
  const context = activeSelection(state);
  if (!context) return;
  const ids = new Set(currentSkillArtifacts(state, context).flatMap((artifact) => artifact.sourceFactIds ?? []));
  for (const factId of ids) void logEvent('source_viewed', { ...contextRefs(context), sourceId: 'fact:' + factId },
    context.roundId, 'source:' + context.inputVersion + ':' + factId);
}

function renderAcceptanceControls() {
  const button = $('acceptance-retry');
  button.hidden = !pendingAcceptance && !acceptanceRecheckId;
  button.disabled = accepting || readingReview || saving;
  button.textContent = pendingAcceptance
    ? pendingAcceptance.phase === 'readback' ? '重试读取建轮记录' : '核对结果并重试原接受操作'
    : '重新读取候选，核对后再接受';
}

function discardAcceptanceReminder() {
  if (accepting) return false;
  if (!window.confirm('只放弃本页的重试提示，不会撤销可能已保存的接受操作。离开后仍需从本机记录核对结果，确定继续？')) return false;
  pendingAcceptance = null;
  acceptanceRecheckId = null;
  status('acceptance-status', '本页重试提示已放弃，没有撤销本机记录；操作结果仍须按实际记录核对。');
  renderAcceptanceControls();
  return true;
}

async function completeAcceptedExperiment(snapshot, review, receipt, token) {
  if (token !== acceptanceToken || !acceptanceReceiptMatches(receipt, review)) return false;
  let identity;
  try {
    identity = checkedAcceptedIdentity(snapshot, { ...receipt, sessionId: snapshot.sessionId });
    checkedAcceptedIdentity(state, identity);
  } catch (error) {
    status('acceptance-status', error.message, true);
    return false;
  }
  if (snapshot.revision >= state.revision) acceptState(snapshot);
  acceptedReceipt = { ...receipt, sessionId: snapshot.sessionId };
  pendingAcceptance = null;
  acceptanceRecheckId = null;
  pageMode = 'action';
  activeWorkspaceTab = 'work';
  writeActionHash('#work');
  if (acceptanceBusyOwner === token) accepting = false;
  render();
  status('acceptance-status', '已接受并重新读取完整建轮记录：' + receipt.experimentId +
    '。接受操作不会自动记录采用或执行，正在准备所选稿件。');
  await ensureArtifacts();
  if (token !== acceptanceToken) return false;
  try { checkedAcceptedIdentity(state, identity); }
  catch (error) {
    acceptedReceipt = null;
    status('acceptance-status', error.message, true);
    return false;
  }
  const current = activeSelection(state);
  if (current?.roundId === receipt.roundId && current.pathId === receipt.pathId) {
    const count = currentSkillArtifacts(state).length;
    status('acceptance-status', '已接受并重新读回本轮实验 ' + receipt.experimentId + '；当前已保存 ' + count +
      ' 份稿件。' + (generationFailures.length ? '部分稿件尚未准备好，请使用“重试准备内容”。' : '') +
      '接受、稿件保存与实际执行分开；实际状态以本轮已保存记录为准。');
    $('action-title').focus();
  }
  return true;
}

async function acceptCandidate(retry = false, readOnly = false) {
  if (accepting || saving || readingReview || dirty) return false;
  if (typeof shared?.getAcceptedExperimentRound !== 'function') {
    status('acceptance-status', '当前页面尚未载入已发布的接受接口，请重新加载页面；没有发送接受命令。', true);
    return false;
  }
  if (pendingAcceptance && !retry) {
    status('acceptance-status', '上一接受操作的结果仍待核对，请使用下方的原操作重试入口。', true);
    return false;
  }
  let attempt = pendingAcceptance;
  const review = attempt?.review ?? activeReview?.review;
  if (!review || (!attempt && (!readFeedbackIds.has(review.sourceFeedbackId) || acceptanceRecheckId))) {
    status('acceptance-status', '请先重新读取并核对这条反馈的候选，再明确接受。', true);
    return false;
  }
  const token = ++acceptanceToken;
  const stillCurrent = () => token === acceptanceToken && pendingAcceptance === attempt;
  const readFresh = async () => {
    const loaded = await shared.loadSession();
    if (!stillCurrent()) return null;
    if (!loaded.ok) throw Object.assign(new Error('当前无法读回接受记录，接受结果尚未确认，不能据此认定未保存。请重试读取。'), { code: loaded.code });
    if (loaded.state.sessionId !== review.sessionId || state?.sessionId !== review.sessionId) {
      throw Object.assign(new Error('当前项目已变化，未向新项目重放旧接受操作；原操作结果需回原项目核对。'), { code: 'source_changed' });
    }
    if (loaded.state.revision < state.revision) throw Object.assign(new Error('读回版本落后于已知记录，请重新读取；没有继续发送或生成稿件。'), { code: 'read_failed' });
    acceptState(loaded.state);
    return loaded.state;
  };
  const rejectOldIntent = (message) => {
    pendingAcceptance = null;
    attempt = null;
    acceptanceRecheckId = review.sourceFeedbackId;
    status('acceptance-status', message + ' 请重新读取候选，核对后再次明确接受；不会自动换命令重提。', true);
  };
  acceptanceBusyOwner = token;
  accepting = true;
  render();
  status('acceptance-status', '正在重新读取并核对候选及接受记录…');
  try {
    await commandQueue;
    if (!stillCurrent()) return false;
    const fresh = await readFresh();
    if (!fresh || !stillCurrent()) return false;
    const existing = shared.getAcceptedExperimentRound(fresh, review.sourceFeedbackId, review.fingerprint);
    if (acceptanceReceiptMatches(existing, review)) return await completeAcceptedExperiment(fresh, review, existing, token);
    if (readOnly) {
      status('acceptance-status', '尚未完整读回已建立的新轮；此入口只读取，不会替你接受候选或创建轮次。', true);
      return false;
    }
    if (attempt?.phase === 'readback' || existing.code !== 'not_found') {
      status('acceptance-status', '接受结果尚未完整读回：' + (existing.message || '来源或当前轮次需要核对') +
        '。没有将它当成未保存，也没有再次提交或生成稿件。', true);
      return false;
    }
    if (!canAcceptExperimentReview(fresh, review)) {
      rejectOldIntent('当前会话、原轮次、分析、选择或候选依据已变化。');
      return false;
    }
    if (!attempt) {
      attempt = { sessionId: review.sessionId, review, phase: 'uncertain',
        command: makeExperimentAcceptanceCommand(fresh, review, id()) };
      pendingAcceptance = attempt;
    }
    status('acceptance-status', '正在保存本次明确接受；尚未确认新轮建立…');
    const result = await commit(attempt.command);
    if (!stillCurrent()) return false;
    if (!result.ok && ['conflict', 'stale_input', 'invalid_transition', 'invalid_payload', 'invalid_structure',
      'source_mismatch', 'missing_source', 'ambiguous_source', 'invalid_feedback', 'invalid_state',
      'unsupported_feedback_version', 'incompatible_version'].includes(result.code)) {
      rejectOldIntent(errorText(result));
      return false;
    }
    if (result.ok) attempt.phase = 'readback';
    // Even a lost write response may be confirmed by this fresh, complete read.
    const reread = await readFresh();
    if (!reread || !stillCurrent()) return false;
    const receipt = shared.getAcceptedExperimentRound(reread, review.sourceFeedbackId, review.fingerprint);
    if (acceptanceReceiptMatches(receipt, review)) return await completeAcceptedExperiment(reread, review, receipt, token);
    status('acceptance-status', '接受操作结果尚未完整确认：' + (receipt.message || '请重试读取') +
      '。保留原命令与候选；不把提交回执当作建轮成功，不生成下一轮稿件。', true);
    return false;
  } catch (error) {
    if (token !== acceptanceToken) return false;
    if (error.code === 'source_changed') {
      pendingAcceptance = null;
      acceptanceRecheckId = null;
    }
    status('acceptance-status', acceptedReceipt?.sourceFeedbackId === review.sourceFeedbackId
      ? '新轮已完整读回，但稿件准备尚未完成；请在当前行动重试准备内容。'
      : (error.message || '接受结果尚未确认，请重试核对。') + (pendingAcceptance ? ' 原命令仍保留，重试不改载荷或版本。' : ''), true);
    return false;
  } finally {
    // A cancelled request may release its own busy flag, but never a newer request's flag.
    if (acceptanceBusyOwner === token) {
      acceptanceBusyOwner = null;
      accepting = false;
      render();
    }
  }
}

async function openAcceptedContent(kind) {
  const view = activeReview;
  if (!view) return;
  try {
    const identity = checkedAcceptedIdentity(view.bundle.snapshot);
    if (!identity) throw new Error('尚未核对已建立轮次的接受记录，没有打开稿件。');
    if (!await acceptCandidate(false, true)) return;
    checkedAcceptedIdentity(state, identity);
    const artifact = currentSkillArtifacts(state).find((item) => item.kind === kind);
    if (!artifact) {
      status('artifact-status', '本轮已建立，但这份稿件尚未保存，请重试准备内容。', true);
      return;
    }
    choosePreview(previewArtifactKey(artifact));
    $('artifact-preview').scrollIntoView?.({ block: 'start' });
  } catch (error) {
    status('artifact-status', error.message || '尚未完整核对本轮来源，没有打开稿件。', true);
  }
}

function renderReview() {
  const view = activeReview?.review.sourceFeedbackId === reviewFeedbackId &&
    activeReview.review.sessionId === state?.sessionId ? activeReview : null;
  const visible = pageMode === 'review' && Boolean(view);
  $('review-content').hidden = !visible;
  if (!visible) {
    if (pageMode === 'review') {
      pageMode = 'action';
      status('operation-status', '原复盘记录或来源已变化，请重新读取对应记录后再判断。', true);
    }
    renderActionTabs();
    return;
  }
  $('action-content').hidden = true;
  $('empty-state').hidden = true;
  $('history-panel').hidden = true;
  const { feedback, artifact, roundIndex } = view.bundle;
  const review = view.review;
  const presentation = describeExperimentReview(review);
  const hasRead = readFeedbackIds.has(feedback.id);
  $('review-receipt').textContent = (hasRead ? '已保存并重新读取本机记录' : '本机已保存，读回尚未确认') +
    ' · ' + (roundIndex ? '第 ' + roundIndex + ' 轮' : '原轮次') + ' · 稿件 v' + artifact.version +
    ' · 保存于 ' + readableTime(feedback.savedAt);
  $('open-record').disabled = !hasRead;

  $('review-last-action').replaceChildren(node('p', review.priorAction.title),
    node('p', '实验：' + textValue(review.priorAction.experimentId), 'muted'),
    node('p', '本轮变量：' + textValue(review.priorAction.singleVariable)),
    node('p', artifact.title + ' · 输入 v' + review.inputVersion + ' · 稿件 v' + review.artifactVersion, 'muted'));
  $('review-last-execution').replaceChildren(node('p', ADOPTION_LABELS[review.execution.adoption] ?? ADOPTION_LABELS.unknown),
    node('p', EXECUTION_LABELS[review.execution.execution] ?? EXECUTION_LABELS.unknown),
    node('p', '实际改动：' + textValue(review.execution.scope)),
    node('p', '实际执行日期：' + textValue(review.execution.executedAt) + '；商家自述，未由平台核验。', 'muted'));
  $('review-last-observation').replaceChildren(node('p', OBSERVATION_LABELS[review.observation.status] ?? OBSERVATION_LABELS.unknown),
    node('p', review.observation.rawText || '未填写观察原话。'),
    node('p', '新增商品点击：' + textValue(review.observation.sampleSize) +
      (review.observation.sampleUnit === 'product_clicks' ? ' 次' : '（单位未知）')),
    node('p', '前后加购率：' + feedbackRatioLabel(review.observation.metricBefore) + ' → ' +
      feedbackRatioLabel(review.observation.metricAfter), 'muted'));
  $('review-last-conclusion').replaceChildren(node('p', presentation.title, 'review-decision'),
    node('p', '本机规则建议，不是统计充分、因果证明或经营效果承诺。', 'muted'));
  $('review-old-treatment').replaceChildren(node('p', presentation.treatment));
  const candidate = review.nextAction?.status === 'candidate' ? review.nextAction : null;
  $('review-next-suggestion').replaceChildren(node('p', candidate?.title || '本次没有返回下一轮候选'),
    node('p', candidate?.action || '先按本次结论核对或继续观察；页面不会默认切换另一条路径。', 'muted'));

  const reason = $('review-reason');
  reason.replaceChildren(node('p', review.reason, 'review-reason-text'),
    node('p', '风险护栏：' + (GUARDRAIL_LABELS[review.observation.guardrailStatus] ?? GUARDRAIL_LABELS.unknown) +
      '。缺少退款、投诉等数据不能视为风险未触发。', 'action-warning'));
  const evidence = node('details', undefined, 'action-disclosure review-evidence-details');
  evidence.open = true;
  evidence.append(node('summary', '核对判断依据、重要未知与新限制'));
  const evidenceGrid = node('div', undefined, 'review-evidence-grid');
  const basis = node('section');
  basis.append(node('h3', '本次依据'));
  const values = node('dl', undefined, 'experiment-facts');
  for (const [label, value] of [
    ['本机判断来源', review.source + '；外部 AI 未调用'],
    ['原分析来源', originLabel(review.evidence.analysisMode)],
    ['原计划样本', textValue(review.evidence.minimumSample) + ' ' + textValue(review.evidence.minimumSampleUnit)],
    ['样本对照', review.evidence.sampleMeetsPlan ? '达到原计划门槛，不代表统计充分'
      : '未满足或尚无法核对原计划门槛，详见未知项'],
    ['反馈与分析', review.sourceFeedbackId + ' / ' + review.analysisId],
    ['原稿版本', review.artifactId + ' / v' + review.artifactVersion],
  ]) values.append(node('dt', label), node('dd', value));
  basis.append(values, node('p', review.evidence.thresholdMeaning, 'muted'),
    node('p', review.evidence.observationMeaning, 'muted'));
  const limits = node('section');
  limits.append(node('h3', '重要未知'));
  const unknowns = node('ul', undefined, 'review-evidence-list');
  appendList(unknowns, review.unknowns, '没有额外未知记录，不代表没有风险。');
  limits.append(unknowns, node('h3', '这次反馈带来的新限制'));
  const constraints = node('ul', undefined, 'review-evidence-list');
  for (const text of review.constraintsLearned ?? []) {
    const sources = (review.evidence.constraintSources ?? []).filter((entry) => entry.text === text);
    const label = sources.some((entry) => entry.source === 'feedback.constraintsLearned')
      ? '商家在补充反馈中明确填写'
      : sources.some((entry) => entry.source === 'feedback.rawText') ? '本机从反馈原话提取，待核对' : '来源未明，待核对';
    constraints.append(node('li', text + '（' + label + '，不是平台核验）'));
  }
  if (!constraints.childElementCount) constraints.append(node('li', '未填写新的限制，没有代填或改写原输入。'));
  limits.append(constraints);
  evidenceGrid.append(basis, limits);
  evidence.append(evidenceGrid);
  reason.append(evidence);

  $('review-candidate-region').hidden = !candidate;
  if (candidate) {
    $('review-candidate-preview').replaceChildren(node('h3', candidate.title),
      node('p', '待接受候选 · ' + textValue(candidate.optionLabel, '未标方案') + ' · ' + textValue(candidate.experimentId), 'muted'),
      node('p', candidate.action));
    const candidateLimits = node('ul', undefined, 'review-evidence-list');
    appendList(candidateLimits, candidate.limitations, '候选限制尚未提供，请先核对。');
    $('review-candidate-preview').append(candidateLimits);
    const rules = node('dl', undefined, 'experiment-facts');
    for (const [label, value] of candidatePlanRows(candidate)) rules.append(node('dt', label), node('dd', value));
    $('review-rules').replaceChildren(rules,
      node('p', '这里只展示共享返回的候选字段；缺失的窗口、停止与回滚条件没有用当前行动代填。', 'action-warning'));
  } else {
    $('review-candidate-preview').replaceChildren();
    $('review-rules').replaceChildren();
  }
  const capable = typeof shared?.getAcceptedExperimentRound === 'function';
  const readAcceptance = capable ? shared.getAcceptedExperimentRound(view.bundle.snapshot, review.sourceFeedbackId, review.fingerprint) : null;
  const alreadyRead = acceptanceReceiptMatches(readAcceptance, review);
  $('review-capability').textContent = presentation.source + '。结论绑定本次读回的原版本；' +
    (alreadyRead ? '另已完整读回接受记录。候选接受与实际执行分别记录。'
      : '本次没有确认完整接受记录；候选预览不代表下一轮已开始。');
  const canStart = hasRead && candidate && canAcceptExperimentReview(state, review) && readAcceptance?.code === 'not_found';
  const blocked = accepting || readingReview || Boolean(pendingAcceptance) || Boolean(acceptanceRecheckId);
  $('start-candidate').hidden = !candidate;
  $('start-candidate').disabled = blocked || !capable || (!alreadyRead && !canStart);
  $('start-candidate').textContent = alreadyRead ? '读取已建立的本轮行动' : '接受候选并开始下一轮';
  $('candidate-dependency').textContent = alreadyRead
    ? '本机接受记录已随本次复盘读回。完整稿与修改清单仍由当前唯一所选方案生成，不覆盖原稿。'
    : '当前只是候选预览。明确接受并完整读回新轮后，才生成完整稿与修改清单；不把当前稿冒充候选稿。';
  $('candidate-start-dependency').textContent = !capable ? '当前页面未载入接受接口，请重新加载后核对。'
    : alreadyRead ? '已找到完整接受记录；点击只重新读回并打开该轮行动，不创建重复轮次或记录执行。'
    : canStart ? '接受前会再次核对原轮次和候选指纹；只有接受保存及完整读回都成功，才建立可取用的新轮稿件。'
    : '这份候选与当前有效轮次/选择或接受记录不一致，请重新读取核对；不会直接接受历史候选。';
  $('generate-candidate').disabled = blocked || !alreadyRead;
  $('show-change-list').disabled = blocked || !alreadyRead;
  renderMemoryList($('review-memory-list'));
  renderActionTabs();
}

function renderMemoryList(container) {
  container.replaceChildren();
  if (acceptedReceipt && acceptedReceipt.sessionId === state.sessionId && acceptedReceipt.roundId === state.round.id) {
    const accepted = node('div', undefined, 'history-item');
    const execution = (state.executionRecords ?? []).filter((item) => item.roundId === acceptedReceipt.roundId).at(-1);
    accepted.append(node('p', '已接受并读回 · 第 ' + state.round.index + ' 轮 · ' + acceptedReceipt.experimentId),
      node('p', '接受记录 ' + acceptedReceipt.acceptanceId + ' · ' + readableTime(acceptedReceipt.acceptedAt) +
        '；来源反馈 ' + acceptedReceipt.sourceFeedbackId, 'muted'),
      node('p', execution ? ADOPTION_LABELS[execution.adoption] + ' · ' + EXECUTION_LABELS[execution.execution] + '（本轮自述）'
        : '尚无本轮采用或执行自述，保持未知；接受记录不等于已执行。', 'muted'));
    container.append(accepted);
  }
  for (const feedback of state.feedbackRecords ?? []) {
    const bundle = resolveFeedbackRecord(state, feedback.id);
    const chain = bundle ? resolveActionSkillChain(state, feedback, bundle.artifact)
      : unavailableSkillChain('skill_source_incomplete', '原记录来源链不完整。');
    const item = node('div', undefined, 'history-item');
    item.append(node('p', (bundle?.roundIndex ? '第 ' + bundle.roundIndex + ' 轮 · ' : '') +
      (bundle?.path?.title || '原路径待核对') + ' · 稿件 v' + feedback.artifactVersion),
      node('p', ADOPTION_LABELS[bundle?.execution?.adoption ?? 'unknown'] + ' · ' + EXECUTION_LABELS[bundle?.execution?.execution ?? 'unknown'] + ' · ' +
        (OBSERVATION_LABELS[feedback.observation] || '观察结果未知') + ' · 本机自述记录', 'muted'),
      node('p', skillChainLabel(chain), chain.ok ? 'muted' : 'action-warning'));
    const view = node('button', '查看这次完整记录', 'button button--quiet');
    view.type = 'button'; view.disabled = !bundle;
    view.addEventListener('click', () => { void openRecord(feedback.id); });
    item.append(view);
    container.append(item);
  }
  if (!state.feedbackRecords?.length) container.append(node('p', '当前项目还没有保存过实验反馈。'));
  container.append(node('p', '本机判断中的候选不属于正式新轮；未明确接受并成功开始前，不追加下一轮记录。未写入外部历史。', 'muted'));
}

async function openRecord(feedbackId) {
  if (accepting) return;
  invalidateViewRead();
  const token = viewReadToken;
  const sessionId = state?.sessionId;
  const opener = document.activeElement;
  try {
    const bundle = await readReviewRecord(feedbackId, token, sessionId);
    if (!bundle) return;
    const { feedback, execution, artifact, analysis, path, snapshot } = bundle;
    const skillChain = resolveActionSkillChain(snapshot, feedback, artifact);
    const container = $('record-content');
    const details = node('dl', undefined, 'experiment-facts');
    for (const [label, value] of [
      ['原行动', path?.title], ['会话', snapshot.sessionId], ['轮次 ID', feedback.roundId],
      ['分析 ID／输入版本', feedback.analysisId + ' / v' + feedback.inputVersion],
      ['路径 ID', feedback.pathId], ['稿件 ID／版本', artifact.id + ' / v' + artifact.version],
      ['执行 Skill', skillChain.ok ? `${skillChain.skillLabel}（${skillChain.skillId}）` : '未知'],
      ['P2 分析调用回执', skillChain.ok ? `${skillChain.sourceLabel} · ${skillChain.operationId}；执行 Skill 为保存的路径字段` : skillChain.message],
      ['执行自述', EXECUTION_LABELS[execution?.execution ?? 'unknown']],
      ['采用', ADOPTION_LABELS[execution?.adoption ?? 'unknown']], ['实际执行时间', execution?.executedAt],
      ['实际范围', execution?.scope], ['观察', OBSERVATION_LABELS[feedback.observation] ?? '未知'],
      ['反馈原话', feedback.rawText], ['观察开始／结束', textValue(feedback.observedWindow?.start) + '—' + textValue(feedback.observedWindow?.end)],
      ['保存时间', readableTime(feedback.savedAt)], ['本机读回', '本次已成功读回'],
      ['产物来源', originLabel(artifact.mode)], ['外部 AI 写入／读回', '未使用，未核验'],
    ]) details.append(node('dt', label), node('dd', textValue(value)));
    const feedbackDetails = node('dl', undefined, 'experiment-facts');
    for (const [label, value] of feedbackDetailRows(feedback)) feedbackDetails.append(node('dt', label), node('dd', value));
    container.replaceChildren(details, node('h3', '已保存的补充反馈'), feedbackDetails,
      node('p', '采用、执行、样本与观察分别记录；有样本但没有明确执行，不据此判定行动失败。', 'action-field-note'),
      node('h3', '已保存的观察指标'));
    for (const [index, metric] of (feedback.metrics ?? []).entries()) {
      const values = node('dl', undefined, 'experiment-facts');
      for (const [label, value] of feedbackMetricRows(metric)) values.append(node('dt', label), node('dd', value));
      container.append(node('h4', '指标 ' + (index + 1)), values);
    }
    if (!feedback.metrics?.length) container.append(node('p', '没有额外保存带对象、时间和口径的指标条目；上方补充反馈按原值展示，不以 0 补齐。', 'muted'));
    container.append(node('h3', '当时保存的稿件'), node('pre', artifact.body, 'record-artifact-body'), node('h3', '原稿使用步骤'));
    const steps = node('ol');
    appendList(steps, artifact.usage?.steps, '当时未保存使用步骤。');
    const risks = node('ul');
    appendList(risks, artifact.usage?.risks, '当时没有完整风险资料，不表示没有风险。');
    for (const line of experimentOriginLines(analysis)) container.append(node('p', line, 'action-field-note'));
    container.append(steps, node('h3', '原稿必要风险'), risks, node('h3', '当时的实验计划'));
    if (path) {
      const plan = node('dl', undefined, 'experiment-facts');
      for (const [label, value] of [...experimentIdentityRows(path), ...experimentCardRows(path, analysis?.mode)]) plan.append(node('dt', label), node('dd', value));
      const assumptions = node('ul', undefined, 'experiment-limits');
      for (const line of experimentAssumptionLines(path)) assumptions.append(node('li', line));
      container.append(plan, node('h4', '原计划参数与依据'), assumptions);
    } else container.append(node('p', '原计划快照缺失，没有用当前实验代替。', 'action-warning'));
    container.append(node('h3', '原分析引用资料（不是本次反馈附件）'));
    const facts = analysis?.inputSnapshot?.facts ?? [];
    for (const factId of artifact.sourceFactIds ?? []) {
      const fact = facts.find((item) => item.id === factId);
      if (!fact) { container.append(node('p', '来源 ' + factId + ' 的原快照不可用。', 'muted')); continue; }
      const source = describeActionSource(fact);
      container.append(node('p', source.summary), node('p', source.provenance + ' · ' + source.location, 'muted'));
      if (fact.source?.materialId) {
        const material = analysis?.inputSnapshot?.materials?.find((item) => item.id === fact.source.materialId && item.version === fact.source.materialVersion);
        const current = state.input.materials?.some((item) => item.id === fact.source.materialId && item.version === fact.source.materialVersion);
        container.append(node('p', '原材料：' + (material?.name || fact.source.materialId) + ' · v' + fact.source.materialVersion +
          (current ? '；同版本元数据仍在，未在这里读取原件。' : '；原件已移除或版本已变化，不使用新版替代。'), 'muted'));
      }
    }
    container.append(node('p', '反馈附件原子保存 C6 待接通；本记录没有已接通的反馈文件回执，不将输入材料冒充反馈附件。', 'action-warning'));
    showDialog('record-dialog', opener);
    render();
    await logEvent('session_read', { pageId: 'action', stateRevision: state.revision });
  } catch (error) {
    if (token === viewReadToken) status('operation-status', '完整记录尚未打开：' + error.message, true);
  }
}

function openProject() {
  if (!state) return;
  const wasReading = readingReview;
  invalidateViewRead();
  if (wasReading) render();
  const container = $('project-content');
  container.replaceChildren(node('p', '当前仅有这个本机项目，不是个人账号或多商家中心。'),
    node('p', '会话：' + state.sessionId, 'muted'),
    node('p', '当前第 ' + state.round.index + ' 轮 · 输入 v' + state.round.inputVersion +
      '；未接入外部个人历史。', 'muted'));
  const records = node('div');
  renderMemoryList(records);
  container.append(records);
  for (const feedback of state.feedbackRecords ?? []) {
    const button = node('button', '查看记录复盘 · 稿件 v' + feedback.artifactVersion, 'button button--secondary');
    button.type = 'button'; button.disabled = !resolveFeedbackRecord(state, feedback.id);
    button.addEventListener('click', () => { closeDialog('project-dialog'); void openReview(feedback.id); });
    container.append(button);
  }
  showDialog('project-dialog');
  writeActionHash('#history');
}

function syncFeedbackControls() {
  const adoption = $('adoption-select').value;
  for (const button of document.querySelectorAll('[data-adoption]')) {
    button.setAttribute('aria-pressed', String(button.dataset.adoption === adoption));
  }
  $('adoption-status').textContent = adoption === 'unknown' ? '尚未选择，采用情况保持未知。'
    : ADOPTION_LABELS[adoption] + '（商家自述）；不会自动记录为已执行。';
  $('feedback-details-status').textContent = shared?.FEEDBACK_DETAILS_VERSION === 1
    ? '新版反馈保存已接通。各项可留空；本机保存和读回分开确认，不代表平台核验。'
    : '新版反馈保存尚未接通：采用、原因、样本、比例、异常与新限制可先填写，但不能提交到旧接口。仅原有文字／执行自述可保存；取用不受影响。';
  $('feedback-details-status').dataset.available = String(shared?.FEEDBACK_DETAILS_VERSION === 1);
  const execution = $('execution-select').value;
  for (const button of document.querySelectorAll('[data-execution]')) {
    button.setAttribute('aria-pressed', String(button.dataset.execution === execution));
  }
  $('execution-status').textContent = execution === 'unknown' ? '尚未选择，执行情况保持未知。' : EXECUTION_LABELS[execution] + '（商家自述）';
  const length = $('feedback-text').value.length;
  $('feedback-count').textContent = length + '/500';
  $('feedback-text').setAttribute('aria-invalid', String(length > 500));
}

function postponeFeedback() {
  setWorkspaceTab('work');
  status('operation-status', dirty ? '填写仍留在本页，尚未保存；离开前会提示处理。稍后不等于没有执行。'
    : '可以先取用内容，稍后再补充；没有新增执行或反馈记录。');
  ($('copy-all').disabled ? $('action-title') : $('copy-all')).focus();
}

async function navigate(pageId, options) {
  if (!shared) return;
  if (saving || readingReview || accepting) { status('operation-status', '当前记录或接受操作正在核对，请完成后再离开。'); return; }
  try { await shared.navigateTo(pageId, options); }
  catch (error) { status('operation-status', error.message || '暂时无法跳转，当前内容已保留。', true); }
}

async function refresh() {
  $('retry-load').hidden = true;
  const result = await readState(true);
  if (!result.ok) {
    $('load-state').hidden = false;
    status('load-message', errorText(result), true);
    $('retry-load').hidden = false;
    return;
  }
  render();
  if (!initialHashApplied) { initialHashApplied = true; await applyActionHash(); }
  if (state.savedAt && !readEventLogged) {
    readEventLogged = true;
    await logEvent('session_read', { pageId: 'action', stateRevision: state.revision });
  }
  await logEvent('page_viewed', { pageId: 'action' }, state.round.id, `page:${state.sessionId}`);
  await ensureArtifacts();
}

async function boot() {
  if (booting) return;
  booting = true;
  status('load-message', '正在读取本机的当前选择…');
  try {
    if (!shared) {
      const [store, generator, navigation, shell] = await Promise.all([
        import('../shared/state.js'), import('../shared/demo-data.js'), import('../shared/navigation.js'), import('../shared/shell.js'),
      ]);
      shared = { ...store, ...generator, ...navigation };
      shell.mountShell('action');
      unregisterGuard = shared.registerNavigationGuard({ isDirty: () => dirty || saving || accepting || Boolean(pendingAcceptance),
        onSave: () => pendingAcceptance ? acceptCandidate(true) : accepting ? false : saveFeedback(),
        onDiscard: () => pendingAcceptance ? discardAcceptanceReminder() : accepting ? false : discardFeedback() });
      unsubscribe = shared.subscribeSession((result) => {
        if (!result.ok) { status('operation-status', errorText(result), true); return; }
        const previous = activeSelection(state);
        acceptState(result.state);
        if (!generating && !saving && !readingReview && !accepting) {
          render();
          if (!dirty && !sameReference(previous, activeSelection(state))) void ensureArtifacts();
        }
      });
    }
    await refresh();
  } catch (error) {
    status('load-message', `暂时无法接入共享模块或读取记录。${error.message || ''} 本页没有另建状态库，也没有自动载入案例。`, true);
    $('retry-load').hidden = false;
  } finally { booting = false; }
}

function handlePreviewTabKey(event, container, orientation) {
  const tabs = [...container.querySelectorAll('[role="tab"]')].filter((tab) => !tab.disabled);
  const current = tabs.indexOf(event.target.closest('[role="tab"]'));
  if (current < 0) return;
  const previous = orientation === 'vertical' ? 'ArrowUp' : 'ArrowLeft';
  const next = orientation === 'vertical' ? 'ArrowDown' : 'ArrowRight';
  let index;
  if (event.key === previous) index = (current - 1 + tabs.length) % tabs.length;
  else if (event.key === next) index = (current + 1) % tabs.length;
  else if (event.key === 'Home') index = 0;
  else if (event.key === 'End') index = tabs.length - 1;
  else return;
  event.preventDefault();
  tabs[index].focus();
  tabs[index].click();
}

function connectPage() {
  // Enhance one fixed title before business boot; hidden-title waiting stays inside the shared controller.
  let titleMotion;
  try { titleMotion = enhanceFoldTitle($('delivery-title')); }
  catch { /* Optional presentation must leave the static title and business startup usable. */ }
  $('retry-load').addEventListener('click', boot);
  $('action-work-tab').addEventListener('click', () => setWorkspaceTab('work'));
  $('action-feedback-tab').addEventListener('click', () => setWorkspaceTab('feedback'));
  $('action-view-tabs').addEventListener('keydown', (event) => handlePreviewTabKey(event, $('action-view-tabs'), 'horizontal'));
  $('go-feedback').addEventListener('click', () => setWorkspaceTab('feedback', { focus: true }));
  $('go-decisions-empty').addEventListener('click', () => navigate(state?.input.confirmedVersion === state?.round.inputVersion ? 'decisions' : 'intake'));
  document.querySelectorAll('[data-nav="decisions"]').forEach((button) => button.addEventListener('click', () => navigate('decisions')));
  $('artifact-retry').addEventListener('click', async () => { const result = await readState(); if (result.ok) await ensureArtifacts(); else status('artifact-status', errorText(result), true); });
  $('artifact-list').addEventListener('keydown', (event) => handlePreviewTabKey(event, $('artifact-list'), $('artifact-list').getAttribute('aria-orientation') || 'horizontal'));
  $('preview-tabs').addEventListener('keydown', (event) => handlePreviewTabKey(event, $('preview-tabs'), 'horizontal'));
  $('preview-content-tab').addEventListener('click', () => choosePreviewPart('content'));
  $('preview-steps-tab').addEventListener('click', () => choosePreviewPart('steps'));
  $('copy-artifact').addEventListener('click', () => {
    const artifact = selectPreviewArtifact(previewItems, previewKey);
    void copyArtifact(artifact, $(previewPart === 'steps' ? 'preview-steps' : 'preview-body'), previewPart);
  });
  $('select-artifact').addEventListener('click', manuallySelectPreview);
  $('export-pack').addEventListener('click', exportPack);
  $('export-summary-consent').addEventListener('change', () => {
    consentSignature = $('export-summary-consent').checked ? packSignature(state) : null;
  });
  $('feedback-form').addEventListener('submit', saveFeedback);
  $('feedback-form').addEventListener('input', formChanged);
  $('feedback-form').addEventListener('change', formChanged);
  $('feedback-artifact').addEventListener('change', () => { feedbackBinding = currentSkillArtifacts(state).find((artifact) => artifact.id === $('feedback-artifact').value); });
  $('discard-feedback').addEventListener('click', () => { if (!dirty || window.confirm('放弃这份尚未保存的反馈草稿？已保存的记录不会删除。')) discardFeedback(); });
  $('next-round').addEventListener('click', () => { void openReview(selectedFeedbackId); });
  $('copy-all').addEventListener('click', () => { void copyAllAction(false); });
  $('select-all').addEventListener('click', () => { void copyAllAction(true); });
  $('open-experiment-evidence').addEventListener('click', () => { showDialog('evidence-dialog'); sourceViewEvents(); });
  $('open-project').addEventListener('click', openProject);
  $('open-review').addEventListener('click', () => {
    const records = (state?.feedbackRecords ?? []).filter((record) => resolveFeedbackRecord(state, record.id));
    const recordId = records.some((record) => record.id === selectedFeedbackId) ? selectedFeedbackId : records.length === 1 ? records[0].id : null;
    if (recordId) void openReview(recordId); else openProject();
  });
  $('return-action').addEventListener('click', returnToAction);
  $('pause-review').addEventListener('click', () => {
    if (accepting) return;
    returnToAction();
    status('operation-status', '仅返回当前行动；这次点击没有创建轮次、撤销接受或改变执行状态。');
  });
  $('start-candidate').addEventListener('click', () => { void acceptCandidate(false); });
  $('acceptance-retry').addEventListener('click', () => {
    if (pendingAcceptance) void acceptCandidate(true);
    else if (acceptanceRecheckId) void openReview(acceptanceRecheckId);
  });
  $('generate-candidate').addEventListener('click', () => { void openAcceptedContent('copy'); });
  $('show-change-list').addEventListener('click', () => { void openAcceptedContent('checklist'); });
  $('open-record').addEventListener('click', () => { void openRecord(reviewFeedbackId); });
  $('feedback-later').addEventListener('click', postponeFeedback);
  document.querySelectorAll('[data-execution]').forEach((button) => button.addEventListener('click', () => {
    $('execution-select').value = button.dataset.execution;
    formChanged();
  }));
  $('clear-execution').addEventListener('click', () => { $('execution-select').value = 'unknown'; formChanged(); });
  document.querySelectorAll('[data-adoption]').forEach((button) => button.addEventListener('click', () => {
    $('adoption-select').value = button.dataset.adoption;
    formChanged();
  }));
  $('clear-adoption').addEventListener('click', () => { $('adoption-select').value = 'unknown'; formChanged(); });
  document.querySelectorAll('[data-close-dialog]').forEach((button) => button.addEventListener('click', () => closeDialog(button.dataset.closeDialog)));
  document.querySelectorAll('dialog').forEach((dialog) => dialog.addEventListener('cancel', (event) => {
    event.preventDefault(); closeDialog(dialog.id);
  }));
  $('source-details').addEventListener('toggle', sourceViewEvents);
  $('event-retry').addEventListener('click', async () => {
    $('event-retry').disabled = true;
    try {
      const loaded = await readState();
      if (!loaded.ok) throw new Error(errorText(loaded));
      for (const [eventId, eventCommand] of pendingEvents) {
        const result = await commit(eventCommand);
        if (!result.ok) throw new Error(errorText(result));
        pendingEvents.delete(eventId);
      }
      $('event-retry').hidden = true;
      status('operation-status', '操作记录已补存；没有再次复制或下载。');
    } catch (error) { status('operation-status', error.message, true); }
    finally { $('event-retry').disabled = false; }
  });
  window.addEventListener('pageshow', (event) => { if (event.persisted && shared) void refresh(); });
  window.addEventListener('hashchange', () => { void applyActionHash(); });
  window.addEventListener('pagehide', (event) => {
    acceptanceToken += 1;
    invalidateViewRead();
    titleMotion?.destroy();
    if (!event.persisted) { unsubscribe?.(); unregisterGuard?.(); }
  });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') logPreviewView(); });
  void boot();
}

if (typeof document !== 'undefined') connectPage();
