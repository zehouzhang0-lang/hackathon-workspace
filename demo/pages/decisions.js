// B-REVIEW-CORE-START
// Transient intent helpers only. Persistent state remains in the shared reducer.
export function decisionScope(snapshot) {
  return { sessionId: snapshot?.sessionId, roundId: snapshot?.round?.id,
    inputVersion: snapshot?.round?.inputVersion, analysisId: snapshot?.analysis?.id };
}

export function sameDecisionInput(snapshot, origin) {
  return Boolean(snapshot && origin && snapshot.sessionId === origin.sessionId
    && snapshot.round?.id === origin.roundId && snapshot.round?.inputVersion === origin.inputVersion);
}

export function currentDecisionAnalysis(snapshot) {
  return Boolean(snapshot?.analysis && snapshot.input?.confirmedVersion === snapshot.round?.inputVersion
    && snapshot.analysis.roundId === snapshot.round.id
    && snapshot.analysis.inputVersion === snapshot.round.inputVersion
    && ['ready', 'limited', 'insufficient'].includes(snapshot.analysis.status));
}

export function latestDecisionReview(snapshot) {
  return [...(snapshot?.history ?? [])].reverse().find((record) => record.type === 'analysis_review'
    && record.roundId === snapshot.round.id && record.inputVersion === snapshot.round.inputVersion) ?? null;
}

export function reviewDisplayToken(snapshot) {
  return JSON.stringify([decisionScope(snapshot), snapshot?.analysis?.status, latestDecisionReview(snapshot)?.id ?? null]);
}

export function reviewError(message, code = 'stale_input') {
  return Object.assign(new Error(message), { code });
}

export function prepareDecisionReview(snapshot, fields, newId) {
  if (!currentDecisionAnalysis(snapshot)) throw reviewError('请先核对当前有效分析，再提交感受。');
  const { stance } = fields;
  if (!['agree', 'uncertain', 'disagree', 'not_actionable'].includes(stance)) {
    throw reviewError('感受类型无效。', 'invalid_payload');
  }
  if (fields.reason != null && typeof fields.reason !== 'string') throw reviewError('原因必须是文字。', 'invalid_payload');
  const reason = fields.reason?.trim() || null;
  if (reason && reason.length > 1000) throw reviewError('原因不能超过1000字。', 'invalid_payload');
  const ids = fields.blockedPathIds ?? [];
  if (!Array.isArray(ids) || new Set(ids).size !== ids.length
    || !ids.every((id) => snapshot.analysis.paths.some((path) => path.id === id))) {
    throw reviewError('无法执行的路径已变化，请重新核对。', 'invalid_payload');
  }
  if (stance === 'not_actionable' ? !reason || !ids.length : ids.length > 0) {
    throw reviewError('无法执行需选择当前路径并填写原因；其他感受不代替路径限制。', 'invalid_payload');
  }
  const origin = decisionScope(snapshot);
  const intentId = newId();
  return { origin, displayToken: reviewDisplayToken(snapshot),
    payload: { roundId: origin.roundId, inputVersion: origin.inputVersion, analysisId: origin.analysisId,
      stance, reason, blockedPathIds: [...ids].sort() },
    reviewKey: 'review:' + intentId, analysisKey: 'review-analysis:' + intentId,
    reviewAttempted: false, reviewSaved: false, reviewId: null,
    analysisAttempted: false, analysisDraft: null, phase: 'review', error: null };
}

export function matchingDecisionReview(snapshot, operation) {
  const record = latestDecisionReview(snapshot), payload = operation.payload;
  return record && ['roundId', 'inputVersion', 'analysisId', 'stance', 'reason'].every((key) => record[key] === payload[key])
    && JSON.stringify([...(record.blockedPathIds ?? [])].sort()) === JSON.stringify(payload.blockedPathIds) ? record : null;
}

export function decisionSelectionMatches(snapshot, pathId) {
  return currentDecisionAnalysis(snapshot) && snapshot.selection?.analysisId === snapshot.analysis.id
    && snapshot.selection?.pathId === pathId && snapshot.selection?.inputVersion === snapshot.round.inputVersion;
}

export function isReviewSubmitEvent(event, composing, endedAt, now) {
  return !composing && !event?.isComposing && event?.keyCode !== 229 && !event?.repeat
    && (!Number.isFinite(endedAt) || now - endedAt >= 100);
}

// The adapter reuses the page's read/apply/dispatchIntent functions. No storage is added.
export function createDecisionReviewRunner(adapter) {
  let running = false;
  const assertInput = (snapshot, operation) => {
    if (!sameDecisionInput(snapshot, operation.origin)
      || !sameDecisionInput(adapter.getState(), operation.origin)) {
      throw reviewError('会话或输入已经变化，未把旧感受或旧判断写入当前资料。');
    }
  };
  const announce = (operation, message) => adapter.onStage?.(operation, message);
  const completed = (operation, snapshot) => {
    operation.phase = 'done'; operation.error = null;
    announce(operation, snapshot.analysis.paths.length
      ? '感受和更新后的本机判断已保存；请重新比较路径。未调用外部 AI 或确认根因。'
      : '感受已保存，已更新本机判断；当前没有有依据的可行路径，请补充资料。未自动选路。');
    return { ok: true, state: snapshot, reviewSaved: true };
  };
  return {
    isRunning: () => running,
    async run(operation) {
      if (running) return { ok: false, code: 'busy', reviewSaved: operation.reviewSaved };
      running = true;
      operation.error = null;
      try {
        let snapshot = await adapter.read(operation.origin);
        assertInput(snapshot, operation);
        if (operation.phase === 'review') {
          const sameView = currentDecisionAnalysis(snapshot) && reviewDisplayToken(snapshot) === operation.displayToken;
          const alreadyVisible = operation.reviewAttempted && matchingDecisionReview(snapshot, operation);
          if (snapshot.analysis?.id !== operation.origin.analysisId || (!sameView && !alreadyVisible)) {
            throw reviewError('显示后的分析或感受记录已变化；原因草稿保留，请重新核对。');
          }
          operation.reviewAttempted = true;
          announce(operation, '正在保存这条感受，尚未确认成功。');
          snapshot = await adapter.dispatch(operation.reviewKey, 'ANALYSIS_REVIEW_SAVE', operation.payload, snapshot,
            { exactRevision: true, scope: operation.origin });
          assertInput(snapshot, operation);
          const saved = matchingDecisionReview(snapshot, operation);
          if (!saved) throw reviewError('未找到对应感受回执，不能宣称保存完成。', 'read_failed');
          operation.reviewSaved = true; operation.reviewId = saved.id; operation.phase = 'analysis';
          announce(operation, '感受已保存到本机；更新判断尚未完成。');
        }
        if (operation.phase === 'done') {
          if (currentDecisionAnalysis(snapshot) && snapshot.analysis.reviewId === operation.reviewId
            && latestDecisionReview(snapshot)?.id === operation.reviewId) return completed(operation, snapshot);
          throw reviewError('原操作已完成，但当前判断已有变化。');
        }
        const latest = latestDecisionReview(snapshot);
        if (latest?.id !== operation.reviewId) throw reviewError('已有更新的感受记录，未覆盖当前判断。');
        if (snapshot.analysis?.id !== operation.origin.analysisId) {
          if (currentDecisionAnalysis(snapshot) && snapshot.analysis.reviewId === operation.reviewId) return completed(operation, snapshot);
          throw reviewError('分析已变化；已保存感受保留，不用旧草稿覆盖。');
        }
        if (!operation.analysisDraft) {
          const generated = adapter.generate(structuredClone(snapshot));
          if (generated?.ok !== true) throw reviewError(generated?.message || '本机判断生成失败。', generated?.code || 'generation_failed');
          operation.analysisDraft = structuredClone(generated.analysis);
        }
        snapshot = await adapter.read(operation.origin);
        assertInput(snapshot, operation);
        if (latestDecisionReview(snapshot)?.id !== operation.reviewId) throw reviewError('生成期间已有更新的感受，未保存旧判断。');
        if (snapshot.analysis?.id !== operation.origin.analysisId) {
          if (currentDecisionAnalysis(snapshot) && snapshot.analysis.reviewId === operation.reviewId) return completed(operation, snapshot);
          throw reviewError('生成期间分析已更新，未保存旧判断。');
        }
        operation.analysisAttempted = true;
        announce(operation, '感受已保存；正在保存更新后的本机判断。');
        snapshot = await adapter.dispatch(operation.analysisKey, 'ANALYSIS_SET', { analysis: operation.analysisDraft }, snapshot,
          { exactRevision: true, scope: operation.origin });
        assertInput(snapshot, operation);
        if (!currentDecisionAnalysis(snapshot) || snapshot.analysis.reviewId !== operation.reviewId
          || latestDecisionReview(snapshot)?.id !== operation.reviewId) {
          throw reviewError('更新判断的回执未核对完成；已保存感受仍保留。', 'read_failed');
        }
        return completed(operation, snapshot);
      } catch (error) {
        operation.error = { code: error?.code || 'operation_failed', message: error?.message || '操作未完成。' };
        announce(operation, (operation.reviewSaved ? '感受已保存，但更新判断尚未完成。' : '感受保存尚未确认。')
          + operation.error.message + ' 原因草稿保留；重试不会另建一条感受。');
        return { ok: false, ...operation.error, reviewSaved: operation.reviewSaved };
      } finally { running = false; }
    },
  };
}
// B-REVIEW-CORE-END

// B-DECISION-DISPLAY-START
// Display existing shared paths only; never synthesize a missing A or B.
export function visibleDecisionPaths(paths) {
  return Array.isArray(paths) ? paths.slice() : [];
}

export function decisionMetricText(path) {
  const target = path?.experiment?.target;
  if (!target || typeof target.metric !== 'string' || !target.metric.trim()) return '未知；当前方案未提供验证指标';
  const names = { click_to_cart_rate: '商品点击到加购率', paid_orders: '支付订单',
    product_detail_visitors: '商品详情访客', product_clicks: '商品点击', add_to_carts: '加购' };
  return (names[target.metric] || target.metric)
    + (typeof target.unit === 'string' && target.unit.trim() ? '；单位：' + target.unit : '；单位未知');
}

export function decisionSelectionLabel(path, selected) {
  if (selected) return '继续准备已选方案';
  if (path?.optionLabel === 'A') return '先执行方案A';
  if (path?.optionLabel === 'B') return '改选方案B';
  return '选择这条行动';
}

export const DOUYIN_ANALYSIS_SKILL_IDS = Object.freeze([
  'douyin-data-analysis', 'douyin-account-diagnosis'
]);
export const DOUYIN_PATH_SKILL_IDS = Object.freeze([
  'douyin-copywriter', 'douyin-video-creation', 'douyin-live-ops'
]);
const DOUYIN_SKILL_LABELS = Object.freeze({
  'douyin-data-analysis': '抖音数据分析',
  'douyin-account-diagnosis': '抖音账号诊断',
  'douyin-copywriter': '抖音文案',
  'douyin-video-creation': '抖音视频创作',
  'douyin-live-ops': '抖音直播运营',
});

export function decisionTraceRows(analysis) {
  const savedText = (value, fallback = '未知；当前分析未保存') => typeof value === 'string' && value.trim() ? value : fallback;
  const fraction = (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1
    ? new Intl.NumberFormat('zh-CN', { style: 'percent', maximumFractionDigits: 2 }).format(value) : '未知';
  const source = analysis?.analysisSource;
  const local = source === 'local_fallback' || (!source && ['demo_fixture', 'local_limited'].includes(analysis?.mode));
  const quality = analysis?.dataQuality, routing = analysis?.routing;
  const score = typeof quality?.score === 'number' && Number.isFinite(quality.score) && quality.score >= 0 && quality.score <= 100
    ? String(quality.score) + '/100' : '未知；当前分析未提供质量评分';
  const stage = typeof routing?.stage === 'string' && routing.stage.trim()
    ? ({ click_cart: '商品点击→加购（click_cart）' }[routing.stage] || routing.stage)
    : routing?.rule?.matched === false ? '本次未命中已保存路由规则' : '未知；当前分析未保存路由断点';
  const receipt = analysis?.providerReceipt;
  const real = analysis?.mode === 'real_model' && ['moneyai', 'ai_settings'].includes(analysis?.analysisSource);
  const skillIds = Array.isArray(analysis?.skillIds) ? analysis.skillIds : [];
  return [
    ['AI 服务', local ? '本次未调用外部 AI；当前结果来自本机规则'
      : real ? (analysis.analysisSource === 'moneyai' ? 'MoneyAI 项目分析' : 'AI 设置中的模型') : '调用来源未通过核对'],
    ['请求ID', real ? savedText(receipt?.operationId, '缺少请求 ID') : '当前分析未请求外部 AI，没有请求 ID'],
    ['使用模型', real ? savedText(receipt?.model, '模型名称未随回执保存') : '当前分析未调用外部模型'],
    ['分析Skill链', skillIds.length ? skillIds.map((id) => DOUYIN_SKILL_LABELS[id] || id).join(' → ')
      : routing?.expert ? savedText(routing.expert.label) + '；状态：' + savedText(routing.expert.status)
        + '；' + savedText(routing.expert.reason) : '未保存可核对的分析 Skill 调用记录'],
    ['分析来源', savedText(source) + '；模式：' + savedText(analysis?.mode)],
    ['数据质量分', score + '；' + savedText(quality?.meaning, '仅说明数据检查，不代表真实性、根因或成功概率')],
    ['质量方法与口径', savedText(quality?.method) + '；口径可用程度：' + savedText(quality?.confidence)],
    ['路由断点', stage],
    ['路由依据', savedText(routing?.reason) + '；' + savedText(routing?.rule?.description)],
    ['路由数值', '已保存观测率：' + fraction(routing?.rule?.observedRate) + '；规则阈值：' + fraction(routing?.rule?.threshold)
      + '。这是Demo路由规则，不是行业标准、根因或成功概率。'],
  ];
}
// B-DECISION-DISPLAY-END

// MONEYAI-PAGE-BOUNDARY-START
// Send only the current confirmed structured projection. Raw materials, blobs,
// locators, transcripts, credentials and personal history are deliberately absent.
export function moneyAIRequestOrigin(snapshot) {
  return { sessionId: snapshot?.sessionId, roundId: snapshot?.round?.id,
    inputVersion: snapshot?.round?.inputVersion, revision: snapshot?.revision };
}

export function sameMoneyAIRequestOrigin(snapshot, origin) {
  return Boolean(snapshot && origin && snapshot.sessionId === origin.sessionId
    && snapshot.round?.id === origin.roundId && snapshot.round?.inputVersion === origin.inputVersion
    && snapshot.revision === origin.revision);
}

const boundedMoneyAIText = (value, limit = 2000) => typeof value === 'string' ? value.trim().slice(0, limit) : '';
const moneyAIScalar = (value) => value === null || typeof value === 'boolean'
  || typeof value === 'number' && Number.isFinite(value) ? value
  : typeof value === 'string' ? value.slice(0, 2000) : null;
const moneyAIWindow = (value) => value && typeof value === 'object'
  ? { start: boundedMoneyAIText(value.start, 40) || null, end: boundedMoneyAIText(value.end, 40) || null } : null;

const pageRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

function currentFactSource(fact, input) {
  const source = fact?.source;
  if (!pageRecord(source) || !['merchant_statement', 'file_extract'].includes(source.kind)
    || !pageRecord(source.locator)) return false;
  if (source.kind === 'file_extract') {
    return typeof source.materialId === 'string' && Number.isSafeInteger(source.materialVersion)
      && input.materials.some((material) => material.id === source.materialId
        && material.version === source.materialVersion);
  }
  return source.materialId == null && source.materialVersion == null
    && (source.locator.type === 'intake' && typeof source.locator.field === 'string'
      || source.locator.type === 'correction' && source.locator.factId === fact.id
      || typeof source.locator.questionId === 'string');
}

export function verifiedAnalysisInput(snapshot) {
  if (snapshot?.contractVersion !== 'demo.v1' || !snapshot?.round || !snapshot?.input
    || snapshot.input.confirmedVersion !== snapshot.round.inputVersion) {
    return { ok: false, code: 'unconfirmed_input', message: '请先回第一页确认当前轮次和资料。', facts: [] };
  }
  const input = snapshot.input;
  if (input.intake?.status !== 'current' || !pageRecord(input.intake.draft)
    || ![input.facts, input.materials, input.constraints, input.unknowns].every(Array.isArray)) {
    return { ok: false, code: 'missing_saved_intake',
      message: '当前没有第一页已保存且有效的结构化资料；不会生成或发送方案。', facts: [] };
  }
  const facts = input.facts.filter((fact) => typeof fact?.id === 'string'
    && fact.availability === 'known' && fact.value !== null
    && fact.verification !== 'conflicting' && fact.evidenceStatus === 'confirmed_fact'
    && currentFactSource(fact, input));
  if (!facts.length) return { ok: false, code: 'no_verifiable_facts',
    message: '当前没有可定位来源的已确认事实；不会调用 Skill，也不会补造固定方案。', facts: [] };
  return { ok: true, facts, factIds: new Set(facts.map((fact) => fact.id)) };
}

export function buildMoneyAIAnalysisSummary(snapshot) {
  const eligibility = verifiedAnalysisInput(snapshot);
  if (!eligibility.ok) return eligibility;
  const input = snapshot.input;
  const dataOrigin = snapshot.fixtureId ? 'synthetic_seed' : 'confirmed_merchant_input';
  const focus = boundedMoneyAIText(input.focus || input.description, 2000);
  const summary = {
    version: 'analysis.request.v1',
    focus,
    facts: eligibility.facts.slice(0, 100).map((fact) => ({
      id: boundedMoneyAIText(fact?.id, 120) || null,
      key: boundedMoneyAIText(fact?.key, 120) || null,
      value: moneyAIScalar(fact?.value),
      availability: boundedMoneyAIText(fact?.availability, 40) || 'unknown',
      evidenceStatus: boundedMoneyAIText(fact?.evidenceStatus, 40) || null,
      unit: boundedMoneyAIText(fact?.unit, 80) || null,
      subject: boundedMoneyAIText(fact?.subject, 300) || null,
      window: moneyAIWindow(fact?.window),
      channel: boundedMoneyAIText(fact?.channel, 300) || null,
      cohort: boundedMoneyAIText(fact?.cohort, 500) || null,
      sourceKind: boundedMoneyAIText(fact?.source?.kind, 80) || null,
      sourceId: 'fact:' + fact.id,
      sourceMaterialId: boundedMoneyAIText(fact?.source?.materialId, 120) || null,
      sourceMaterialVersion: Number.isSafeInteger(fact?.source?.materialVersion) ? fact.source.materialVersion : null,
      verification: boundedMoneyAIText(fact?.verification, 80) || null,
      dataOrigin,
    })),
    constraints: input.constraints.filter((item) => Array.isArray(item?.sourceFactIds)
      && item.sourceFactIds.length > 0 && item.sourceFactIds.every((id) => eligibility.factIds.has(id)))
      .slice(0, 50).map((item) => ({
      id: boundedMoneyAIText(item?.id, 120) || null,
      description: boundedMoneyAIText(item?.description, 1000),
      value: moneyAIScalar(item?.value), unit: boundedMoneyAIText(item?.unit, 80) || null,
      scope: boundedMoneyAIText(item?.scope, 80) || null,
      sourceFactIds: Array.isArray(item?.sourceFactIds) ? item.sourceFactIds.filter((id) => typeof id === 'string').slice(0, 50) : [],
      dataOrigin,
    })),
    unknowns: input.unknowns.slice(0, 50).map((item) => ({
      id: boundedMoneyAIText(item?.id, 120) || null,
      description: boundedMoneyAIText(item?.description, 1000),
      reason: boundedMoneyAIText(item?.reason, 200) || 'unknown',
      sourceId: boundedMoneyAIText(item?.sourceId, 120) || null,
      dataOrigin,
    })),
  };
  const prefix = snapshot.fixtureId ? 'synthetic_' : 'confirmed_';
  const dataClasses = [prefix + 'facts'];
  if (summary.focus) dataClasses.push(prefix + 'focus');
  if (summary.constraints.length) dataClasses.push(prefix + 'constraints');
  if (summary.unknowns.length) dataClasses.push(prefix + 'unknowns');
  return { ok: true, summary, dataClasses, factIds: [...eligibility.factIds] };
}

function skillIdentityError(message) {
  return Object.assign(new Error(message), { code: 'invalid_skill_identity' });
}

export function validateP2SkillAnalysisIdentity(analysis, frozenState, expectedScope = null) {
  const eligibility = verifiedAnalysisInput(frozenState);
  if (!eligibility.ok) throw skillIdentityError('本次请求没有可核验事实，真实分析不得保存。');
  if (analysis?.mode !== 'real_model' || !['moneyai', 'ai_settings'].includes(analysis.analysisSource)
    || !Array.isArray(analysis.skillIds)
    || analysis.skillIds.length !== DOUYIN_ANALYSIS_SKILL_IDS.length
    || DOUYIN_ANALYSIS_SKILL_IDS.some((id, index) => analysis.skillIds[index] !== id)) {
    throw skillIdentityError('真实分析缺少精确的两个分析 Skill 身份。');
  }
  const receipt = analysis.providerReceipt;
  const sourceReceiptValid = analysis.analysisSource === 'moneyai'
    ? receipt?.provider === 'moneyai' && receipt.sentToMoneyAI === true
    : receipt?.provider === 'ai-settings' && receipt.sentToProvider === true;
  if (!receipt || receipt.contractVersion !== 'luya.moneyai.v1' || !sourceReceiptValid
    || !/^[A-Za-z0-9._:-]{1,120}$/.test(receipt.operationId)
    || receipt.sessionId !== frozenState.sessionId || receipt.roundId !== frozenState.round.id
    || receipt.inputVersion !== frozenState.round.inputVersion
    || !/^sha256:[a-f0-9]{64}$/.test(receipt.inputFingerprint)
    || expectedScope && (receipt.sessionId !== expectedScope.sessionId
      || receipt.roundId !== expectedScope.roundId || receipt.inputVersion !== expectedScope.inputVersion
      || receipt.inputFingerprint !== expectedScope.inputFingerprint)) {
    throw skillIdentityError('真实分析的输入与回执身份不一致。');
  }
  const processingSkills = (Array.isArray(analysis.processing) ? analysis.processing : [])
    .filter((entry) => entry?.skillId != null);
  const expectedKind = analysis.analysisSource === 'moneyai' ? 'moneyai' : 'provider_ai';
  if (processingSkills.length !== DOUYIN_ANALYSIS_SKILL_IDS.length
    || DOUYIN_ANALYSIS_SKILL_IDS.some((id) => !processingSkills.some((entry) => entry.skillId === id
      && entry.kind === expectedKind && entry.status === 'done' && entry.operationId === receipt.operationId))
    || processingSkills.some((entry) => !DOUYIN_ANALYSIS_SKILL_IDS.includes(entry.skillId))) {
    throw skillIdentityError('处理回执没有逐项证明两个分析 Skill 已调用，或包含不相干 Skill。');
  }
  const paths = Array.isArray(analysis.paths) ? analysis.paths : [];
  if (paths.length > 2 || analysis.status === 'insufficient' && paths.length
    || paths.some((path) => !DOUYIN_PATH_SKILL_IDS.includes(path?.skillId))) {
    throw skillIdentityError('路径数量、空方案状态或执行 Skill 身份不合法。');
  }
  for (const path of paths) {
    const factIds = [...new Set((Array.isArray(path.evidenceRefs) ? path.evidenceRefs : [])
      .flatMap((entry) => Array.isArray(entry?.factIds) ? entry.factIds : []))];
    if (!factIds.length || factIds.some((id) => !eligibility.factIds.has(id))) {
      throw skillIdentityError('路径没有引用本次实际发送且可核验的事实来源。');
    }
  }
  return analysis;
}

export function moneyAIResultMessage(result) {
  const fromProvider = result?.sentToMoneyAI === undefined && result?.sentToProvider !== undefined;
  const sent = result?.sentToMoneyAI ?? result?.sentToProvider;
  const channel = fromProvider ? '「AI 设置」所配置的模型' : 'MoneyAI';
  const delivery = sent === true ? '服务确认已发送到 ' + channel + '。'
    : sent === false ? '服务确认未发送到 ' + channel + '。'
      : '是否发送尚未确认，请勿立即重复提交。';
  return { delivery, kind: result?.ok ? 'success' : result?.code === 'cancelled' ? 'info' : 'error',
    message: typeof result?.message === 'string' && result.message.trim()
      ? result.message : result?.ok ? '已收到回执。' : '未取得可用分析回执。' };
}
// MONEYAI-PAGE-BOUNDARY-END

// Page-local view state only. All persisted data goes through shared/state.js.
const byId = (id) => document.getElementById(id);
const list = (value) => Array.isArray(value) ? value : [];
const text = (value, fallback = '未知') => typeof value === 'string' && value.trim() ? value : fallback;
const number = (value) => typeof value === 'number' && Number.isFinite(value);
const formatNumber = (value) => new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 6 }).format(value);
const labels = {
  source: { merchant_statement: '商家自述', file_extract: '文件提取', derived: '派生计算', public_reference: '公共参考', scenario_assumption: '情景假设' },
  verification: { unreviewed: '尚未核对', user_corrected: '用户更正', checked: '已核对对应原文或算式', conflicting: '存在冲突' },
  evidence: { observation: '观察', calculation: '计算', inference: '推断' },
  branch: { not_executed: '明确反馈尚未执行', insufficient_evidence: '尚无反馈或证据不足', risk_triggered: '触发风险', comparable_positive: '可比观察出现正向变化', comparable_unchanged: '可比观察没有明显变化', comparable_negative: '可比观察出现负向变化' },
  basis: { known: '来自已提供内容', scenario: '情景假设', unknown: '尚未提供' },
  metric: { paid_orders: '支付订单', product_detail_visitors: '商品详情访客', published_videos: '发布视频', price: '售价', units_per_order: '每单件数', external_length: '外尺寸长度', external_width: '外尺寸宽度', external_height: '外尺寸高度', dimension_scope: '尺寸口径', current_title: '当前标题', current_opening: '当前说明开头', selected_inquiries: '选取的咨询摘录' },
};

let api = null;
let state = null;
let viewedPathId = null;
let renderedSignature = '';
let busy = false;
let pathInvalid = false;
let subscriptionFailed = false;
let readFailureVisible = false;
let booting = false;
let unsubscribe = null;
let commandQueue = Promise.resolve();
let pendingExport = null;
const pendingCommands = new Map();
const pendingEvents = new Map();
const seenEvents = new Set();

// B-REVIEW-UI-START
let reviewOperation = null;
let reviewDraftMode = null;
let reviewDraftScope = null;
let reviewDraftToken = null;
let reviewComposing = false;
let reviewCompositionEndedAt = -Infinity;
let unregisterReviewGuard = null;
const hasPendingReview = () => Boolean(reviewOperation && reviewOperation.phase !== 'done');
const hasReviewDraft = () => hasPendingReview() || Boolean(byId('review-reason').value.trim());
const reviewRunner = createDecisionReviewRunner({
  getState: () => state,
  read: (origin) => readDecisionState(origin),
  dispatch: (...args) => dispatchIntent(...args),
  generate: (snapshot) => api.buildDemoAnalysis(snapshot),
  onStage: (operation, value) => {
    byId('review-status').textContent = value;
    byId('review-status').dataset.kind = operation.error ? 'error' : 'info';
    syncReviewControls();
  },
});


let moneyAIStatus = null;
let moneyAIStatusBusy = false;
let moneyAIRequestPreparing = false;
let moneyAIRequestBusy = false;
let moneyAIPreview = null;
let moneyAIPreviewToken = '';
let moneyAIOperation = null;
// 真实分析通路：'moneyai'（本机MoneyAI应用）或 'provider'（AI 设置所配模型直连）。
let moneyAIPanelMode = 'moneyai';
let providerSettings = null;
let providerSettingsBusy = false;
const moneyAIChannelName = () => moneyAIPanelMode === 'provider' ? '直连 AI（AI 设置）' : 'MoneyAI';
const analysisReadyForMode = () => moneyAIPanelMode === 'provider'
  ? providerSettings?.configured === true
  : moneyAIStatus?.analysisReady === true;

const MONEYAI_MODE_BRANDING = {
  moneyai: {
    title: '让 MoneyAI 重新分析当前确认摘要',
    consent: '我已核对上方摘要，并仅同意这一次发送到本机 MoneyAI 所配置的模型；可能产生 API 调用。此同意不包含材料原件、凭据或个人历史。',
    checkLabel: '检查分析能力', sendLabel: '发送摘要并请求真实分析',
  },
  provider: {
    title: '让「AI 设置」的模型重新分析当前确认摘要',
    consent: '我已核对上方摘要，并仅同意这一次发送到「AI 设置」所配置的模型；可能产生 API 调用。此同意不包含材料原件、凭据或个人历史。',
    checkLabel: '检查 AI 设置', sendLabel: '发送摘要并请求直连 AI 分析',
  },
};

function renderMoneyAIMode() {
  const branding = MONEYAI_MODE_BRANDING[moneyAIPanelMode];
  if (!branding) return;
  byId('moneyai-title').textContent = branding.title;
  byId('moneyai-consent-text').textContent = branding.consent;
  byId('moneyai-request-analysis').textContent = branding.sendLabel;
  byId('moneyai-check-status').textContent = branding.checkLabel;
  const moneyaiButton = byId('moneyai-mode-moneyai');
  const providerButton = byId('moneyai-mode-provider');
  moneyaiButton.setAttribute('aria-pressed', String(moneyAIPanelMode === 'moneyai'));
  providerButton.setAttribute('aria-pressed', String(moneyAIPanelMode === 'provider'));
  moneyaiButton.classList.toggle('button--secondary', moneyAIPanelMode !== 'moneyai');
  providerButton.classList.toggle('button--secondary', moneyAIPanelMode !== 'provider');
}

function setMoneyAIPanelMode(mode) {
  if (!MONEYAI_MODE_BRANDING[mode] || moneyAIPanelMode === mode) return;
  moneyAIPanelMode = mode;
  byId('moneyai-consent').checked = false;
  renderMoneyAIMode();
  renderMoneyAICapability();
  syncMoneyAIControls();
  if (mode === 'provider' && !providerSettings) void refreshProviderSettings();
  moneyAIStatusText('已切换到「' + moneyAIChannelName() + '」通路；尚未发送任何内容。');
}

function moneyAIStatusText(value, kind = 'info') {
  const node = byId('moneyai-request-status');
  node.textContent = value;
  node.dataset.kind = kind;
  message(value, kind === 'success' ? 'success' : kind === 'error' ? 'error' : 'info');
}

function renderMoneyAICapability() {
  const tag = byId('moneyai-capability-tag');
  const status = byId('moneyai-capability-status');
  if (moneyAIPanelMode === 'provider') {
    if (providerSettingsBusy) {
      tag.textContent = '正在核对'; tag.dataset.state = 'checking';
      status.textContent = '正在读取「AI 设置」；尚未发送分析摘要。';
    } else if (!providerSettings) {
      tag.textContent = '设置待核对'; tag.dataset.state = 'unknown';
      status.textContent = '尚未读取「AI 设置」状态。';
    } else if (providerSettings.configured) {
      tag.textContent = '直连 AI 可请求'; tag.dataset.state = 'ready';
      status.textContent = '「AI 设置」已配置（模型：' + (providerSettings.model || '未知')
        + '）；仍须逐次同意，结果经共享校验后才可保存。';
    } else {
      tag.textContent = '直连 AI 未配置'; tag.dataset.state = 'unavailable';
      status.textContent = '尚未在「AI 设置」保存 API；不会发送任何内容。';
    }
    return;
  }
  if (moneyAIStatusBusy) {
    tag.textContent = '正在核对'; tag.dataset.state = 'checking';
    status.textContent = '正在读取项目后端状态；尚未发送分析摘要。';
  } else if (!moneyAIStatus) {
    tag.textContent = '能力待核对'; tag.dataset.state = 'unknown';
    status.textContent = '尚未取得完整能力回执。';
  } else if (moneyAIStatus.analysisReady) {
    tag.textContent = '真实分析可请求'; tag.dataset.state = 'ready';
    status.textContent = '项目通路声明分析已就绪；仍须逐次同意并核对业务回执。' + (moneyAIStatus.reason ? ' ' + moneyAIStatus.reason : '');
  } else {
    tag.textContent = '真实分析未就绪'; tag.dataset.state = 'unavailable';
    status.textContent = '项目后端可报告状态，但分析能力尚未开放。' + (moneyAIStatus.reason ? ' ' + moneyAIStatus.reason : '');
  }
}

function syncMoneyAIControls() {
  const eligibility = state ? buildMoneyAIAnalysisSummary(state) : { ok: false };
  const previewCurrent = Boolean(moneyAIPreview && state
    && sameMoneyAIRequestOrigin(state, moneyAIPreview.origin));
  const consent = byId('moneyai-consent');
  const requestLocked = moneyAIRequestPreparing || moneyAIRequestBusy;
  consent.disabled = requestLocked || !eligibility.ok;
  byId('moneyai-check-status').disabled = (moneyAIPanelMode === 'provider' ? providerSettingsBusy : moneyAIStatusBusy)
    || requestLocked || !api;
  byId('moneyai-request-analysis').disabled = requestLocked || moneyAIStatusBusy || providerSettingsBusy
    || analysisReadyForMode() !== true || !eligibility.ok || !previewCurrent || !consent.checked;
  byId('moneyai-cancel-analysis').hidden = !requestLocked || !moneyAIOperation;
  byId('moneyai-cancel-analysis').disabled = !requestLocked || moneyAIOperation?.cancelRequested;
}

function prepareMoneyAIPreview(snapshot) {
  const result = buildMoneyAIAnalysisSummary(snapshot);
  const preview = byId('moneyai-summary-preview');
  const fingerprint = byId('moneyai-summary-fingerprint');
  const token = JSON.stringify(moneyAIRequestOrigin(snapshot));
  const scopeChanged = moneyAIPreviewToken !== token;
  moneyAIPreviewToken = token;
  moneyAIPreview = null;
  if (scopeChanged) byId('moneyai-consent').checked = false;
  if (!result.ok) {
    preview.textContent = result.message;
    fingerprint.textContent = '摘要指纹：未生成';
    byId('moneyai-consent').checked = false;
    syncMoneyAIControls();
    return;
  }
  preview.textContent = JSON.stringify(result.summary, null, 2);
  fingerprint.textContent = '摘要指纹：正在本机计算……';
  if (typeof api?.computeMoneyAIInputFingerprint !== 'function') {
    fingerprint.textContent = '共享指纹契约尚未载入；真实分析入口保持关闭。';
    syncMoneyAIControls();
    return;
  }
  void api.computeMoneyAIInputFingerprint(result.summary).then((value) => {
    if (!state || moneyAIPreviewToken !== token || !sameMoneyAIRequestOrigin(state, moneyAIRequestOrigin(snapshot))) return;
    moneyAIPreview = { origin: moneyAIRequestOrigin(snapshot), summary: result.summary, dataClasses: result.dataClasses, inputFingerprint: value };
    fingerprint.textContent = '摘要指纹：' + value;
    syncMoneyAIControls();
  }).catch(() => {
    if (moneyAIPreviewToken !== token) return;
    fingerprint.textContent = '摘要指纹计算失败；真实分析入口保持关闭。';
    syncMoneyAIControls();
  });
}

function renderMoneyAIPanel() {
  const mode = state?.analysis?.mode;
  byId('moneyai-analysis-source').textContent = mode === 'real_model'
    ? (state?.analysis?.analysisSource === 'ai_settings'
      ? '当前已保存分析标记为直连 AI（AI 设置）真实模型结果；仍以保存的来源、请求与版本回执为准。'
      : '当前已保存分析标记为 MoneyAI 真实模型结果；仍以保存的来源、请求与版本回执为准。')
    : mode === 'demo_fixture' ? '当前已保存的是合成资料的本机规则分析，不是 MoneyAI 结果。请求失败不会替换它。'
      : mode === 'local_limited' ? '当前已保存的是本机有限分析，不是 MoneyAI 结果。请求失败不会替换它。'
        : '当前没有已保存的有效分析；不会用自然语言回包或 HTTP 成功冒充分析结果。';
  renderMoneyAIMode();
  renderMoneyAICapability();
  prepareMoneyAIPreview(state);
  syncMoneyAIControls();
}

async function refreshMoneyAIStatus() {
  if (!api || moneyAIStatusBusy || moneyAIRequestPreparing || moneyAIRequestBusy) return;
  moneyAIStatusBusy = true;
  renderMoneyAICapability(); syncMoneyAIControls();
  const result = await api.getMoneyAIStatus();
  moneyAIStatusBusy = false;
  if (result?.ok) {
    moneyAIStatus = result.status;
    moneyAIStatusText(result.status.analysisReady
      ? '能力已就绪；核对发送摘要并逐次同意后，才可发起请求。'
      : '真实分析目前不可用；当前本机判断保持不变。', result.status.analysisReady ? 'success' : 'info');
  } else {
    moneyAIStatus = null;
    moneyAIStatusText(result?.message || '未取得完整能力回执；没有发送分析摘要。', 'error');
  }
  renderMoneyAICapability(); syncMoneyAIControls();
}

function invalidateMoneyAIRequest(next) {
  if (!moneyAIOperation || sameMoneyAIRequestOrigin(next, moneyAIOperation.origin)) return;
  moneyAIOperation.stale = true;
  moneyAIOperation.controller.abort();
  moneyAIStatusText('请求期间会话、轮次、输入版本或revision已变化；已取消等待，迟到回执不会保存。', 'error');
}

async function requestMoneyAIFromPage() {
  if (!api || moneyAIRequestPreparing || moneyAIRequestBusy || analysisReadyForMode() !== true) return;
  if (!byId('moneyai-consent').checked) {
    moneyAIStatusText('请先展开并核对摘要，再为这一次请求明确同意。', 'error');
    return;
  }
  if (!moneyAIPreview || !sameMoneyAIRequestOrigin(state, moneyAIPreview.origin)) {
    byId('moneyai-consent').checked = false;
    moneyAIStatusText('当前预览已经过期；未发送，请重新核对摘要并逐次同意。', 'error');
    syncMoneyAIControls();
    return;
  }
  // Consume consent and freeze the exact preview before the first await. The
  // preflight lock prevents one checkbox action from starting two requests.
  const frozenPreview = structuredClone(moneyAIPreview);
  const controller = new AbortController();
  const operation = { origin: frozenPreview.origin, request: null, controller,
    cancelRequested: false, stale: false };
  moneyAIOperation = operation;
  moneyAIRequestPreparing = true;
  byId('moneyai-consent').checked = false;
  moneyAIStatusText('正在本机复核摘要和指纹，尚未发送。');
  syncMoneyAIControls();
  let prepared = null;
  try {
    const snapshot = await readState();
    if (controller.signal.aborted || operation.stale
      || !sameMoneyAIRequestOrigin(snapshot, frozenPreview.origin)
      || !sameMoneyAIRequestOrigin(state, frozenPreview.origin)) {
      throw new Error('发送前会话或revision已变化，或本次请求已取消；未发送，请重新核对摘要。');
    }
    const summaryResult = buildMoneyAIAnalysisSummary(snapshot);
    if (!summaryResult.ok) throw new Error(summaryResult.message);
    if (JSON.stringify(summaryResult.summary) !== JSON.stringify(frozenPreview.summary)
      || JSON.stringify(summaryResult.dataClasses) !== JSON.stringify(frozenPreview.dataClasses)) {
      throw new Error('发送摘要与已预览内容不一致；未发送，请重新核对。');
    }
    let inputFingerprint;
    try { inputFingerprint = await api.computeMoneyAIInputFingerprint(summaryResult.summary); }
    catch { throw new Error('摘要指纹计算失败，未发送。'); }
    if (controller.signal.aborted || operation.stale
      || !sameMoneyAIRequestOrigin(state, frozenPreview.origin)
      || frozenPreview.inputFingerprint !== inputFingerprint) {
      throw new Error('请求已取消、身份已变化或指纹不一致；未发送，请重新核对并逐次同意。');
    }
    const operationId = 'analysis:' + crypto.randomUUID();
    const attemptId = 'attempt:' + crypto.randomUUID();
    const request = api.createMoneyAIEnvelope({
      operation: api.MONEYAI_OPERATIONS.analysis, operationId, attemptId,
      scope: {
        sessionId: snapshot.sessionId, roundId: snapshot.round.id,
        inputVersion: snapshot.round.inputVersion, analysisId: null, pathId: null,
        artifact: null, feedback: null, inputFingerprint,
      },
      consent: {
        granted: true, sendScope: ['confirmed_analysis_input'],
        dataClasses: summaryResult.dataClasses,
      },
      payload: frozenPreview.summary,
    });
    prepared = { origin: { ...moneyAIRequestOrigin(snapshot), operationId, attemptId, inputFingerprint },
      request, frozenState: structuredClone(snapshot) };
    if (!sameMoneyAIRequestOrigin(state, prepared.origin)) {
      throw new Error('发送前会话或revision已变化；未发送，请重新核对摘要。');
    }
  } catch (error) {
    if (!operation.cancelRequested && !operation.stale) {
      moneyAIStatusText(error?.message || '当前会话未能读回，未发送摘要。', 'error');
    }
    prepared = null;
  } finally {
    moneyAIRequestPreparing = false;
    if (!prepared || controller.signal.aborted) {
      if (moneyAIOperation === operation) moneyAIOperation = null;
      syncMoneyAIControls();
    }
  }
  if (!prepared || controller.signal.aborted || operation.stale) return;
  operation.origin = prepared.origin;
  operation.request = prepared.request;
  operation.frozenState = prepared.frozenState;
  moneyAIRequestBusy = true;
  byId('moneyai-send-status').textContent = '请求已开始；是否发送仍待服务回执。';
  moneyAIStatusText('正在等待' + moneyAIChannelName() + '的分析回执；当前本地分析尚未改变。');
  syncMoneyAIControls();
  let result;
  try {
    result = moneyAIPanelMode === 'provider'
      ? await api.requestProviderAnalysis(operation.request, {
          state: operation.frozenState, signal: controller.signal, consentToExternalProcessing: true,
        })
      : await api.requestMoneyAIAnalysis(operation.request, {
          state: operation.frozenState, signal: controller.signal, consentToExternalProcessing: true,
        });
  } catch {
    result = { ok: false, code: 'backend_unavailable',
      message: '共享分析调用异常；未取得完整回执。', sentToMoneyAI: null };
  }
  if (moneyAIOperation !== operation) return;
  const described = moneyAIResultMessage(result);
  byId('moneyai-send-status').textContent = described.delivery;
  if (operation.stale || !sameMoneyAIRequestOrigin(state, operation.origin)) {
    moneyAIStatusText('收到迟到回执，但请求身份已过期；未保存、未替换当前分析。' + described.delivery, 'error');
  } else if (!result?.ok) {
    moneyAIStatusText(described.message + ' ' + described.delivery + ' 当前已保存分析保持不变。', described.kind);
  } else {
    try {
      api.validateRealModelAnalysisDraft(result.analysis, operation.frozenState, operation.request.scope);
      validateP2SkillAnalysisIdentity(result.analysis, operation.frozenState, operation.request.scope);
      if (!sameMoneyAIRequestOrigin(state, operation.origin)) {
        throw reviewError('真实分析回执到达时本机revision已变化，未保存旧分析。');
      }
      moneyAIStatusText(moneyAIChannelName() + '回执已通过共享结构和身份校验；正在保存，当前本机分析尚未改变。');
      // From here the reducer's exact expectedRevision is the sole commit
      // authority. Hide cancellation so our successful revision is not
      // mistaken for a late network response by the request guard.
      moneyAIOperation = null;
      syncMoneyAIControls();
      const saved = await dispatchIntent('moneyai-analysis:' + operation.origin.operationId,
        'ANALYSIS_SET', { analysis: result.analysis }, operation.frozenState,
        { exactRevision: true, scope: operation.origin });
      if (saved.analysis?.mode !== 'real_model'
        || saved.analysis.providerReceipt?.operationId !== result.receipt?.operationId
        || saved.analysis.providerReceipt?.inputFingerprint !== operation.origin.inputFingerprint) {
        throw reviewError('真实分析保存回执与本次MoneyAI身份不一致。', 'read_failed');
      }
      validateP2SkillAnalysisIdentity(saved.analysis, operation.frozenState, operation.request.scope);
      moneyAIStatusText(moneyAIChannelName() + '真实分析已通过共享校验并保存；请重新比较当前最多两条路径。', 'success');
    } catch (error) {
      moneyAIStatusText(moneyAIChannelName() + '回执未能安全保存：' + (error?.message || '共享校验或版本回执不完整。')
        + ' 当前已保存分析保持不变或以最新共享状态为准。', 'error');
    }
  }
  moneyAIRequestBusy = false;
  if (moneyAIOperation === operation) moneyAIOperation = null;
  prepareMoneyAIPreview(state);
  syncMoneyAIControls();
}

function cancelMoneyAIRequest() {
  if (!moneyAIOperation || !moneyAIRequestPreparing && !moneyAIRequestBusy) return;
  moneyAIOperation.cancelRequested = true;
  moneyAIOperation.controller.abort();
  moneyAIStatusText(moneyAIRequestPreparing
    ? '已取消本机发送前复核；尚未调用共享分析请求。'
    : '正在取消本次等待；若请求已送达，是否发送仍以最终回执为准。');
  syncMoneyAIControls();
}

// —— 直连 AI（AI 设置）设置状态 ——

async function refreshProviderSettings() {
  if (!api || providerSettingsBusy) return;
  providerSettingsBusy = true;
  if (moneyAIPanelMode === 'provider') { renderMoneyAICapability(); syncMoneyAIControls(); }
  const result = await api.getAiSettings();
  providerSettingsBusy = false;
  providerSettings = result?.ok
    ? { configured: result.configured, model: result.model, hasKey: result.hasKey } : null;
  renderMoneyAICapability();
  syncMoneyAIControls();
}

function revisionRecoveryEntry() {
  if (hasPendingReview()) {
    const key = reviewOperation.phase === 'review' ? reviewOperation.reviewKey : reviewOperation.analysisKey;
    const entry = pendingCommands.get(key);
    return Number.isInteger(entry?.revisionRejected) ? { key, entry } : null;
  }
  const match = [...pendingCommands.entries()].find(([key, entry]) => entry.command.type === 'PATH_SELECT'
    && entry.command.payload.pathId === viewedPathId && Number.isInteger(entry.revisionRejected));
  return match ? { key: match[0], entry: match[1] } : null;
}

function syncRevisionRecovery() {
  const recovery = revisionRecoveryEntry();
  byId('conflict-retry-panel').hidden = !recovery;
  byId('conflict-retry').disabled = busy || reviewComposing || !recovery;
  if (recovery) {
    const selecting = recovery.entry.command.type === 'PATH_SELECT';
    byId('conflict-retry-summary').textContent = '共享层已明确拒绝本次版本冲突，原操作未应用。'
      + (selecting ? '将重新核对当前方案后，再提交这次选择。' : '将重新核对当前分析和限制，再提交被拒绝的这一步。')
      + '不会自动换操作，也不会把失败当成功。';
  }
}

async function retryRejectedDecisionIntent() {
  if (busy || reviewComposing) return;
  const recovery = revisionRecoveryEntry();
  if (!recovery) return;
  await operate(async () => {
    const { key, entry } = recovery;
    const snapshot = await readDecisionState(entry.scope);
    if (pendingCommands.get(key) !== entry) throw reviewError('待重提操作已变化，请重新核对。');
    if (entry.command.type === 'PATH_SELECT') {
      const pathId = entry.command.payload.pathId;
      if (hasPendingReview() || !currentAnalysis(snapshot) || snapshot.analysis.id !== entry.scope.analysisId
        || viewedPathId !== pathId || !visibleDecisionPaths(snapshot.analysis.paths).some((path) => path.id === pathId)) {
        throw reviewError('当前方案已变化，未重新提交旧选择。');
      }
      renewRejectedDecisionIntent(key, snapshot);
      const saved = decisionSelectionMatches(snapshot, pathId) ? snapshot
        : await dispatchIntent(key, 'PATH_SELECT', entry.command.payload, snapshot, { exactRevision: true, scope: entry.scope });
      if (!decisionSelectionMatches(saved, pathId)) throw reviewError('选择回执未核对完成，未前往执行页。', 'read_failed');
      const result = await api.navigateTo('action');
      if (result === false || result?.ok === false) throw reviewError('选择已保存，但暂时无法进入下一页；可继续已选方案。');
      return;
    }
    if (!hasPendingReview() || (reviewOperation.phase === 'review'
      ? key !== reviewOperation.reviewKey || reviewDisplayToken(snapshot) !== reviewOperation.displayToken
      : key !== reviewOperation.analysisKey || latestDecisionReview(snapshot)?.id !== reviewOperation.reviewId)
      || snapshot.analysis?.id !== reviewOperation.origin.analysisId) {
      throw reviewError('分析或限制已变化，未重新提交旧操作；原因仍保留。');
    }
    renewRejectedDecisionIntent(key, snapshot);
    await submitReviewDraftDirect();
  });
}

function syncReviewControls() {
  syncRevisionRecovery();
  const valid = currentAnalysis(state) && !subscriptionFailed;
  const pending = hasPendingReview();
  for (const id of ['review-agree', 'review-uncertain']) {
    byId(id).disabled = busy || !valid || pending || reviewComposing;
  }
  // Incorrect source information goes back to P1, including stale/insufficient analyses.
  byId('review-disagree').disabled = busy || reviewComposing;
  byId('review-not-actionable').disabled = busy || !valid || pending || reviewComposing || !visibleDecisionPaths(state?.analysis?.paths).length;
  const sameDraft = reviewDraftScope && sameDecisionInput(state, reviewDraftScope)
    && reviewDraftToken === reviewDisplayToken(state);
  byId('review-submit').disabled = busy || pending || reviewComposing || !valid || !sameDraft;
  byId('review-reason').readOnly = busy || pending;
  byId('review-blocked-paths').disabled = busy || pending;
  byId('review-retry').hidden = !pending;
  byId('review-retry').disabled = busy || reviewComposing;
  byId('review-cancel').hidden = !pending && !reviewDraftMode;
  byId('review-cancel').disabled = busy;
  byId('review-count').textContent = byId('review-reason').value.length + '/1000';
  byId('review-panel').setAttribute('aria-busy', String(busy && Boolean(reviewDraftMode || pending)));
  const latest = latestDecisionReview(state);
  const saved = byId('review-saved-summary');
  saved.hidden = !latest;
  saved.textContent = latest ? '本机已保存感受：' + ({ agree: '符合', uncertain: '不确定', disagree: '不符合', not_actionable: '路径无法执行' })[latest.stance]
    + (latest.reason ? '；原因：' + latest.reason : '；未填写原因') + '。这不是事实核验或执行反馈。' : '';
  if (reviewDraftMode && !pending && !sameDraft) {
    byId('review-draft-note').textContent = '分析或输入已变化，原因保留但不能直接提交。请关闭后重新打开限制说明并核对。';
  }
}

function openReviewReason(stance) {
  if (stance !== 'not_actionable' || busy || hasPendingReview() || !currentAnalysis(state) || subscriptionFailed) return;
  reviewDraftMode = stance;
  reviewDraftScope = decisionScope(state);
  reviewDraftToken = reviewDisplayToken(state);
  byId('review-form-title').textContent = '哪些方案做不了？请说明限制';
  byId('review-reason').required = true;
  byId('review-draft-note').textContent = '勾选当前做不了的方案并填写原因。本机保存后重新筛选，不记为执行失败，也不新增补问。';
  const fieldset = byId('review-blocked-paths');
  fieldset.hidden = false;
  const choices = byId('review-blocked-choices');
  choices.replaceChildren();
  for (const path of visibleDecisionPaths(state.analysis.paths)) {
    const label = element('label', 'review-blocked-choice');
    const checkbox = element('input');
    checkbox.type = 'checkbox'; checkbox.name = 'review-blocked-path'; checkbox.value = path.id; checkbox.checked = true;
    label.append(checkbox, document.createTextNode((path.optionLabel ? path.optionLabel + '：' : '') + text(path.title)));
    choices.append(label);
  }
  byId('review-panel').hidden = false;
  syncReviewControls();
  byId('review-reason').focus();
}

function showDecisionDifferences() {
  if (busy || hasPendingReview() || !currentAnalysis(state) || subscriptionFailed) return;
  const target = byId('decision-difference-content');
  target.replaceChildren();
  const paths = visibleDecisionPaths(state.analysis.paths);
  appendParagraph(target, '这里只比较当前已保存方案，不保存感受、不重新判断，也不会替你选择。');
  if (paths.length < 2) appendParagraph(target, paths.length
    ? '当前只有一条有依据的方案；另一条尚未提供，不补造A/B。'
    : '当前没有有效方案。请返回第一页核对关键资料，不编造两条方案。');
  for (const path of paths) {
    const section = element('section', 'decision-difference-path');
    section.append(element('h4', '', optionText(path) + '：' + text(path.title)));
    appendParagraph(section, '动作：' + text(path.action));
    appendParagraph(section, '成本：' + costText(path.cost?.money, '元') + '；' + costText(path.cost?.time, '小时'));
    appendList(section, [path.cost?.money?.note, path.cost?.time?.note].filter((value) => typeof value === 'string' && value.trim()));
    appendParagraph(section, '风险：');
    appendList(section, list(path.risk).map((entry) => text(entry.description)), '风险尚未提供，不能当成没有风险。');
    appendParagraph(section, '验证指标：' + decisionMetricText(path));
    target.append(section);
  }
  byId('decision-differences').hidden = false;
  byId('decision-difference-title').focus({ preventScroll: true });
  byId('decision-differences').scrollIntoView({ block: 'nearest' });
}

async function runReviewFields(fields, prepared = null) {
  reviewOperation = prepared ?? prepareDecisionReview(state, fields, () => crypto.randomUUID());
  const result = await reviewRunner.run(reviewOperation);
  if (result.ok) {
    if ((byId('review-reason').value.trim() || null) === reviewOperation.payload.reason) byId('review-reason').value = '';
    reviewDraftMode = null; reviewDraftScope = null; reviewDraftToken = null;
    byId('review-panel').hidden = true;
  }
  syncReviewControls();
  return result;
}

async function submitReviewDraftDirect() {
  if (reviewComposing) return { ok: false };
  if (hasPendingReview()) {
    const result = await reviewRunner.run(reviewOperation);
    if (result.ok) {
      if ((byId('review-reason').value.trim() || null) === reviewOperation.payload.reason) byId('review-reason').value = '';
      reviewDraftMode = null; reviewDraftScope = null; reviewDraftToken = null;
      byId('review-panel').hidden = true;
    }
    syncReviewControls();
    return result;
  }
  if (!reviewDraftMode || !sameDecisionInput(state, reviewDraftScope) || reviewDisplayToken(state) !== reviewDraftToken) {
    throw reviewError('原因对应的分析已变化，草稿保留，请重新核对。');
  }
  const blockedPathIds = reviewDraftMode === 'not_actionable'
    ? [...byId('review-blocked-choices').querySelectorAll('input:checked')].map((input) => input.value) : [];
  return runReviewFields({ stance: reviewDraftMode, reason: byId('review-reason').value, blockedPathIds });
}

function stopReviewRetry(discard = false) {
  if (busy) return false;
  if (reviewOperation) {
    pendingCommands.delete(reviewOperation.reviewKey);
    pendingCommands.delete(reviewOperation.analysisKey);
  }
  reviewOperation = null; reviewDraftMode = null; reviewDraftScope = null; reviewDraftToken = null;
  if (discard) byId('review-reason').value = '';
  byId('review-panel').hidden = true;
  byId('review-status').textContent = discard ? '已放弃本页原因草稿；不会撤销已保存的感受。'
    : '已停止本页重试，原因文字暂留在本页。停止不等于撤销已保存操作；请重新读取后核对。';
  setBusy(false);
  return true;
}

function bindReviewControls() {
  byId('conflict-retry').addEventListener('click', (event) => {
    if (!isReviewSubmitEvent(event, reviewComposing, reviewCompositionEndedAt, performance.now())) return;
    void retryRejectedDecisionIntent();
  });
  byId('review-agree').addEventListener('click', (event) => {
    if (busy || hasPendingReview() || !isReviewSubmitEvent(event, reviewComposing, reviewCompositionEndedAt, performance.now())) return;
    byId(currentAnalysis(state) && visibleDecisionPaths(state.analysis.paths).length ? 'path-workspace' : 'no-paths').scrollIntoView({ block: 'start' });
  });
  byId('review-uncertain').addEventListener('click', (event) => {
    if (!isReviewSubmitEvent(event, reviewComposing, reviewCompositionEndedAt, performance.now())) return;
    showDecisionDifferences();
  });
  byId('review-disagree').addEventListener('click', (event) => {
    if (busy || !isReviewSubmitEvent(event, reviewComposing, reviewCompositionEndedAt, performance.now())) return;
    void goTo('intake');
  });
  byId('review-not-actionable').addEventListener('click', (event) => {
    if (!isReviewSubmitEvent(event, reviewComposing, reviewCompositionEndedAt, performance.now())) return;
    openReviewReason('not_actionable');
  });
  byId('decision-difference-close').addEventListener('click', () => {
    byId('decision-differences').hidden = true;
    byId('review-uncertain').focus({ preventScroll: true });
  });
  byId('review-form').addEventListener('submit', (event) => {
    event.preventDefault();
    if (busy || !isReviewSubmitEvent(event, reviewComposing, reviewCompositionEndedAt, performance.now())) return;
    void operate(submitReviewDraftDirect);
  });
  byId('review-reason').addEventListener('compositionstart', () => { reviewComposing = true; syncReviewControls(); });
  byId('review-reason').addEventListener('compositionend', () => {
    reviewComposing = false; reviewCompositionEndedAt = performance.now(); syncReviewControls();
  });
  byId('review-reason').addEventListener('input', () => syncReviewControls());
  byId('review-reason').addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' || !(event.ctrlKey || event.metaKey)) return;
    event.preventDefault();
    if (busy || !isReviewSubmitEvent(event, reviewComposing, reviewCompositionEndedAt, performance.now())) return;
    void operate(submitReviewDraftDirect);
  });
  byId('review-retry').addEventListener('click', (event) => {
    if (busy || !hasPendingReview() || !isReviewSubmitEvent(event, reviewComposing, reviewCompositionEndedAt, performance.now())) return;
    void operate(submitReviewDraftDirect);
  });
  byId('review-cancel').addEventListener('click', () => stopReviewRetry(false));
}

function registerReviewNavigationGuard() {
  unregisterReviewGuard?.();
  unregisterReviewGuard = api.registerNavigationGuard({
    isDirty: () => hasReviewDraft(),
    onSave: async () => (await submitReviewDraftDirect())?.ok === true,
    onDiscard: () => {
      if (reviewRunner.isRunning()) return false;
      if (reviewOperation) {
        pendingCommands.delete(reviewOperation.reviewKey); pendingCommands.delete(reviewOperation.analysisKey);
      }
      reviewOperation = null; reviewDraftMode = null; reviewDraftScope = null; reviewDraftToken = null;
      byId('review-reason').value = ''; byId('review-panel').hidden = true;
      syncReviewControls();
      return true;
    },
  });
}
// B-REVIEW-UI-END


function element(tag, className, value) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (value !== undefined) node.textContent = String(value);
  return node;
}

function appendParagraph(parent, value, className = '') {
  parent.append(element('p', className, text(value)));
}

function appendList(parent, values, fallback = null) {
  const entries = list(values);
  if (!entries.length) {
    if (fallback) appendParagraph(parent, fallback, 'muted');
    return;
  }
  const ul = element('ul', 'decisions-notes');
  entries.forEach((value) => ul.append(element('li', '', text(value))));
  parent.append(ul);
}

function addDefinition(parent, title, value, note) {
  const group = element('div');
  group.append(element('dt', '', title));
  const dd = element('dd');
  dd.append(element('span', note !== undefined ? 'cost-value' : '', value));
  if (note) dd.append(element('span', 'cost-note', note));
  group.append(dd);
  parent.append(group);
}

function message(value, kind = 'info') {
  const node = byId('decisions-message');
  node.textContent = value || '';
  node.dataset.kind = kind;
  node.hidden = !value;
}

function currentAnalysis(snapshot) {
  return Boolean(snapshot?.analysis && snapshot.input?.confirmedVersion === snapshot.round?.inputVersion
    && snapshot.analysis.roundId === snapshot.round.id
    && snapshot.analysis.inputVersion === snapshot.round.inputVersion
    && ['ready', 'limited', 'insufficient'].includes(snapshot.analysis.status));
}

function confirmed(snapshot) {
  return Boolean(snapshot?.round && snapshot.input
    && snapshot.input.confirmedVersion === snapshot.round.inputVersion);
}

function identity(snapshot, pathId) {
  return [snapshot?.sessionId, snapshot?.round?.id, snapshot?.round?.inputVersion, snapshot?.analysis?.id, pathId].join('|');
}

function selectedPath(snapshot = state) {
  return visibleDecisionPaths(snapshot?.analysis?.paths).find((path) => path.id === viewedPathId) || null;
}

function setBusy(value) {
  busy = value;
  const valid = currentAnalysis(state) && selectedPath() && !pathInvalid && !subscriptionFailed && !hasPendingReview();
  byId('choose-path').disabled = busy || !valid;
  byId('download-report').disabled = busy || !valid;
  byId('refresh-analysis').disabled = busy || hasPendingReview() || !confirmed(state);
  byId('retry-load').disabled = busy;
  byId('retry-event').disabled = busy;
  byId('defer-choice').disabled = busy;
  document.querySelectorAll('[data-action="return"], .path-choice').forEach((node) => { node.disabled = busy; });
  document.querySelectorAll('.path-select').forEach((node) => {
    node.disabled = busy || hasPendingReview() || !currentAnalysis(state) || subscriptionFailed
      || (node.dataset.pathId === viewedPathId && pathInvalid);
  });
  byId('path-detail').setAttribute('aria-busy', String(busy));
  syncReviewControls();
  syncMoneyAIControls();
}

function serialize(work) {
  const promise = commandQueue.then(work, work);
  commandQueue = promise.catch(() => {});
  return promise;
}

async function operate(work) {
  if (busy) return;
  setBusy(true);
  try {
    await serialize(work);
  } catch (error) {
    // Shared errors are displayed as text, never as executable markup.
    message(text(error?.message, '操作未完成。当前资料保留，请重试。'), 'error');
  } finally {
    setBusy(false);
  }
}

function fail(result, fallback) {
  const error = new Error(text(result?.message, fallback));
  error.code = result?.code || 'operation_failed';
  throw error;
}

function showStart(title, description, { retry = true, goBack = true, backLabel = '先说说情况' } = {}) {
  byId('decisions-start').hidden = false;
  byId('decisions-content').hidden = true;
  byId('start-title').textContent = title;
  byId('start-description').textContent = description;
  byId('retry-load').hidden = !retry;
  byId('start-return').hidden = !goBack;
  byId('start-return').textContent = backLabel;
}

function stateShape(snapshot) {
  return snapshot?.contractVersion === 'demo.v1' && snapshot.round && snapshot.input
    && Number.isInteger(snapshot.round.inputVersion) && Number.isInteger(snapshot.revision);
}

function applyState(next) {
  if (!stateShape(next)) {
    showStart('暂时无法读取这份会话', '会话结构或契约版本不兼容。不会自动覆盖已有资料。');
    state = null;
    renderedSignature = '';
    setBusy(busy);
    return false;
  }
  // A late load/dispatch response must not undo a newer subscription snapshot.
  if (state?.sessionId === next.sessionId && next.revision < state.revision) return true;
  invalidateMoneyAIRequest(next);
  const signature = JSON.stringify([next.sessionId, next.round.id, next.round.inputVersion,
    next.input.confirmedVersion, next.fixtureId, next.analysis?.id, next.analysis?.status, latestDecisionReview(next)?.id,
    next.selection?.analysisId, next.selection?.pathId, next.savedAt === null]);
  state = next;
  if (signature !== renderedSignature) {
    renderedSignature = signature;
    pendingExport = null;
    byId('decision-differences').hidden = true;
    byId('report-consent').checked = false;
    renderState();
  } else prepareMoneyAIPreview(state);
  setBusy(busy);
  return true;
}

async function readState() {
  const result = await api.loadSession();
  if (!result?.ok) {
    readFailureVisible = true;
    fail(result, '读取共享资料失败，未将失败当作空会话。');
  }
  if (readFailureVisible) { readFailureVisible = false; message(''); }
  subscriptionFailed = false;
  if (!applyState(result.state)) fail({ code: 'incompatible_version' }, '会话结构不兼容。');
  return state;
}

function subscribe() {
  if (unsubscribe) unsubscribe();
  unsubscribe = api.subscribeSession((result) => {
    if (!result?.ok) {
      readFailureVisible = true;
      message(text(result?.message, '跨页更新未能读回，当前内容暂不能用于选择或导出。'), 'error');
      subscriptionFailed = true;
      setBusy(busy);
      return;
    }
    if (state?.sessionId === result.state?.sessionId && result.state.revision < state.revision) return;
    const previous = state;
    if (readFailureVisible) { readFailureVisible = false; message(''); }
    subscriptionFailed = false;
    applyState(result.state);
    if (previous && (previous.round.id !== state?.round.id || previous.round.inputVersion !== state?.round.inputVersion)) {
      message('资料已在其他页面更新。旧判断不能继续用于选择或下载，请先核对当前资料。');
    }
  });
}

function eventWarning() {
  byId('decisions-log-warning').hidden = pendingEvents.size === 0;
  if (pendingEvents.size) {
    byId('decisions-log-message').textContent = '查看或下载操作已发生，但操作记录尚未保存。重试只补记日志，不会重新下载、选择或执行。';
  }
}

function recordEvent(type, refs, snapshot, onceKey = null) {
  if (!snapshot || (onceKey && seenEvents.has(onceKey))) return;
  if (onceKey) seenEvents.add(onceKey);
  const commandId = crypto.randomUUID();
  const entry = { sessionId: snapshot.sessionId, command: {
    type: 'EVENT_APPEND', commandId,
    payload: { event: { type, roundId: snapshot.round.id, refs } },
  } };
  pendingEvents.set(commandId, entry);
  void serialize(() => saveEvent(entry)).catch(() => eventWarning());
}

async function saveEvent(entry) {
  try {
    const loaded = await api.loadSession();
    if (!loaded?.ok || loaded.state.sessionId !== entry.sessionId) { eventWarning(); return; }
    const result = await api.dispatch({ ...entry.command, expectedRevision: loaded.state.revision });
    if (!result?.ok) { eventWarning(); return; }
    pendingEvents.delete(entry.command.commandId);
    applyState(result.state);
  } catch {
    // Failure to log cannot undo a browser operation or erase the page.
  }
  eventWarning();
}

function recordVisiblePath(path) {
  if (!currentAnalysis(state)) return;
  recordEvent('path_viewed', { pageId: 'decisions', analysisId: state.analysis.id, pathId: path.id, inputVersion: state.round.inputVersion },
    state, `view:${identity(state, path.id)}`);
}

// B-INTENT-ADAPTER-START
async function readDecisionState(origin) {
  if (!sameDecisionInput(state, origin)) throw reviewError('当前会话或输入已变化，未重放旧操作。');
  const result = await api.loadSession();
  if (!result?.ok) fail(result, '读取共享资料失败，草稿保留。');
  if (!sameDecisionInput(state, origin) || !sameDecisionInput(result.state, origin)) {
    throw reviewError('读回期间会话或输入已变化，未采用迟到的快照。');
  }
  if (!applyState(result.state)) throw reviewError('会话结构不兼容。', 'incompatible_version');
  return state;
}

async function dispatchIntent(key, type, payload, snapshot, options = {}) {
  let entry = pendingCommands.get(key);
  const fingerprint = JSON.stringify([type, payload]);
  if (!entry) {
    entry = { command: { type, payload: structuredClone(payload), commandId: crypto.randomUUID() },
      sessionId: snapshot.sessionId, roundId: snapshot.round.id, inputVersion: snapshot.round.inputVersion,
      exactRevision: options.exactRevision === true, expectedRevision: snapshot.revision,
      scope: options.scope ? { ...options.scope } : null, fingerprint };
    pendingCommands.set(key, entry);
  }
  if (entry.fingerprint !== fingerprint || entry.sessionId !== snapshot.sessionId
    || entry.roundId !== snapshot.round.id || entry.inputVersion !== snapshot.round.inputVersion) {
    throw reviewError('旧操作不能换载荷、会话或输入版本，请保留草稿后重新核对。');
  }
  if (entry.scope && !sameDecisionInput(state, entry.scope)) throw reviewError('派发前会话已变化，旧操作未发送。');
  // A new uncertain attempt must not inherit permission from an older rejection.
  entry.revisionRejected = null;
  const result = await api.dispatch({ ...entry.command,
    expectedRevision: entry.exactRevision ? entry.expectedRevision : snapshot.revision });
  if (entry.scope && (!sameDecisionInput(state, entry.scope)
    || (result?.state && !sameDecisionInput(result.state, entry.scope)))) {
    throw reviewError('回执期间会话或输入已变化，未采用旧回执或跳转。');
  }
  if (!result?.ok) {
    // The shared store checks a saved command receipt before its revision check.
    // Only this explicit rejection proves this command was not applied.
    const revisionRejected = result?.code === 'revision_conflict'
      || (result?.code === 'conflict' && result?.message === '其他操作已更新资料，请重读后保留并核对你的草稿。');
    entry.revisionRejected = revisionRejected && entry.exactRevision && entry.scope
      && Number.isInteger(result?.state?.revision) && result.state.revision > entry.expectedRevision
      && sameDecisionInput(result.state, entry.scope) ? result.state.revision : null;
    if (result?.state) applyState(result.state);
    fail(result, entry.revisionRejected !== null
      ? '共享层已明确拒绝这次版本冲突；请使用“重新核对后提交”，不会自动更换操作。'
      : '保存回执尚未确认，草稿保留，可重试原操作。');
  }
  if (!result.state || !applyState(result.state)) throw reviewError('保存后的状态无法核对。', 'read_failed');
  pendingCommands.delete(key);
  return state;
}


// Called only by the explicit recheck/resubmit control, never by ordinary retry.
function renewRejectedDecisionIntent(key, snapshot) {
  const entry = pendingCommands.get(key);
  if (!entry || !Number.isInteger(entry.revisionRejected) || !entry.scope
    || !sameDecisionInput(snapshot, entry.scope) || !sameDecisionInput(state, entry.scope)
    || snapshot.analysis?.id !== entry.scope.analysisId || state.analysis?.id !== entry.scope.analysisId
    || snapshot.revision < entry.revisionRejected) {
    throw reviewError('未确认原操作被版本冲突拒绝，或资料已变化；没有另建提交。');
  }
  pendingCommands.delete(key);
  return entry;
}
// B-INTENT-ADAPTER-END


async function generateAnalysis() {
  if (hasPendingReview()) throw reviewError('请先处理当前感受保存或判断重试，未另起生成。');
  const snapshot = await readState();
  if (!confirmed(snapshot)) fail({ code: 'invalid_transition', message: '请先回第一页确认本轮问题与资料。' });
  const summaryResult = buildMoneyAIAnalysisSummary(snapshot);
  if (!summaryResult.ok) {
    message(summaryResult.message, 'error');
    renderState();
    return;
  }
  if (!moneyAIStatus) {
    const capability = await api.getMoneyAIStatus();
    moneyAIStatus = capability?.ok ? capability.status : null;
  }
  if (!providerSettings) {
    const settings = await api.getAiSettings();
    providerSettings = settings?.ok
      ? { configured: settings.configured, model: settings.model, hasKey: settings.hasKey } : null;
  }
  const route = moneyAIStatus?.analysisReady === true ? 'moneyai'
    : providerSettings?.configured === true ? 'provider' : null;
  if (!route) {
    message('真实分析尚未就绪；没有发送资料，也没有生成固定演示路径。', 'error');
    return;
  }
  if (moneyAIPanelMode !== route) setMoneyAIPanelMode(route);
  const fingerprint = await api.computeMoneyAIInputFingerprint(summaryResult.summary);
  if (!sameMoneyAIRequestOrigin(state, moneyAIRequestOrigin(snapshot))) {
    throw reviewError('准备分析时资料版本已变化；没有发送旧摘要。');
  }
  const confirmedByUser = window.confirm('本次只发送第一页已确认且来源可定位的结构化摘要：'
    + summaryResult.summary.facts.length + ' 条事实、'
    + summaryResult.summary.constraints.length + ' 条限制、'
    + summaryResult.summary.unknowns.length + ' 条未知。\n\n'
    + '不发送附件原件、图片、Excel、录音、完整转写、个人历史或凭据。'
    + moneyAIChannelName() + '将调用“抖音数据分析”和“抖音账号诊断”Skill；是否继续？');
  if (!confirmedByUser) {
    message('已取消本次真实分析；没有发送资料。');
    return;
  }
  moneyAIPreview = { origin: moneyAIRequestOrigin(snapshot), summary: summaryResult.summary,
    dataClasses: summaryResult.dataClasses, inputFingerprint: fingerprint };
  moneyAIPreviewToken = JSON.stringify(moneyAIPreview.origin);
  byId('moneyai-consent').checked = true;
  await requestMoneyAIFromPage();
}

async function refreshSession(autoAnalyze = false) {
  await operate(async () => {
    let snapshot;
    try {
      snapshot = await readState();
    } catch (error) {
      if (!state) showStart('资料暂时没有读回', '共享存储读取失败，不能将其当成首次访问。已有资料不会被空会话覆盖，请重试。');
      throw error;
    }
    recordEvent('page_viewed', { pageId: 'decisions', inputVersion: snapshot.round.inputVersion }, snapshot, `page:${snapshot.sessionId}`);
    if (snapshot.savedAt) recordEvent('session_read', { pageId: 'decisions', stateRevision: snapshot.revision }, snapshot, `read:${snapshot.sessionId}`);
    if (autoAnalyze && !hasPendingReview() && confirmed(snapshot) && !currentAnalysis(snapshot)) {
      message('资料已确认；请明确点击“用已确认资料更新判断”后再发送摘要。');
    }
  });
}

const funnelDefinitions = [
  ['video_views', '播放'], ['product_clicks', '商品点击'], ['add_to_carts', '加购'],
  ['created_orders', '下单'], ['paid_orders', '支付'],
];

function storedFunnel(analysis) {
  const saved = analysis?.funnel;
  return {
    available: Boolean(saved),
    comparable: saved?.status === 'comparable',
    stages: funnelDefinitions.map(([key, label]) =>
      list(saved?.stages).find((stage) => stage.key === key)
      || { key, label, value: null, unit: null, factIds: [], window: {} }),
    transitions: list(saved?.transitions),
    issues: list(saved?.issues),
    maximumLoss: saved?.maximumLoss ?? {},
    limitations: list(saved?.limitations),
  };
}

function countText(value, fallback = '未知') {
  return number(value) ? formatNumber(value) : fallback;
}

function rateText(value) {
  return number(value) && value >= 0 && value <= 1
    ? new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 }).format(value * 100) + '%'
    : '不可计算';
}

function sourceRefs(entry) {
  return [...new Set([
    ...list(entry?.sourceIds).filter((value) => typeof value === 'string'),
    ...[...list(entry?.sourceFactIds), ...list(entry?.factIds)]
      .filter((value) => typeof value === 'string').map((value) => 'fact:' + value),
  ])];
}

function stageName(funnel, key) {
  return text(funnel.stages.find((stage) => stage.key === key)?.label, '环节未知');
}

function transitionView(funnel, transition) {
  return {
    label: stageName(funnel, transition.fromKey) + ' → ' + stageName(funnel, transition.toKey),
    numerator: countText(transition.numerator),
    denominator: countText(transition.denominator),
    conversion: funnel.comparable ? rateText(transition.conversionRate) : '不可计算',
    lossRate: funnel.comparable ? rateText(transition.lossRate) : '不可计算',
    lossCount: funnel.comparable ? countText(transition.lossCount, '不可计算') : '不可计算',
    calculation: text(transition.calculation, text(transition.reason, '尚无可核对算式')),
  };
}

function optionText(path) {
  const option = text(path?.optionLabel, '');
  return option ? '方案' + option : '这条行动';
}

function isCurrentSelection(snapshot, pathId) {
  return Boolean(currentAnalysis(snapshot)
    && snapshot.selection?.analysisId === snapshot.analysis.id
    && snapshot.selection?.inputVersion === snapshot.round.inputVersion
    && snapshot.selection?.pathId === pathId);
}

function reportNeedsConsent(snapshot) {
  return !(snapshot?.analysis?.mode === 'demo_fixture'
    && typeof snapshot.fixtureId === 'string' && snapshot.fixtureId.length > 0);
}

function appendSourceRefs(parent, entry, compact = false) {
  const refs = sourceRefs(entry);
  if (!refs.length) {
    appendParagraph(parent, '没有可核对的来源ID。', 'muted');
    return;
  }
  const wrap = element(compact ? 'details' : 'div', compact ? 'source-details' : 'source-refs');
  if (compact) wrap.append(element('summary', '', '查看来源（' + refs.length + '）'));
  const content = compact ? element('div', 'source-refs') : wrap;
  const valid = currentAnalysis(state);
  refs.forEach((sourceId) => {
    const line = element('p');
    line.append(element('code', 'source-ref-id', sourceId));
    content.append(line);
    if (!valid) {
      appendParagraph(content, '旧分析引用；当前输入不能替代原证据快照。', 'muted');
      return;
    }
    if (sourceId.startsWith('fact:')) {
      const fact = list(state.input.facts).find((item) => item.id === sourceId.slice(5));
      if (fact) {
        appendParagraph(content, (labels.source[fact.source?.kind] || '来源类型未知') + ' · '
          + (labels.verification[fact.verification] || '尚未核对') + '；' + locatorText(fact.source?.locator), 'muted');
      } else appendParagraph(content, '对应事实已更新或未找到，不能替补来源。', 'muted');
    }
    if (/^(input:(description|focus)|(material|fact|question):[A-Za-z0-9_-]{1,80})$/.test(sourceId)) {
      content.append(correctionButton(sourceId));
    }
  });
  if (compact) wrap.append(content);
  parent.append(wrap);
}

function createTable(headers, caption, className) {
  const table = element('table', 'estimate-table ' + className);
  table.append(element('caption', '', caption));
  const head = element('thead');
  const row = element('tr');
  headers.forEach((label) => {
    const cell = element('th', '', label);
    cell.scope = 'col';
    row.append(cell);
  });
  head.append(row);
  const body = element('tbody');
  table.append(head, body);
  return { table, body };
}

function stageArrow() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', 'stage-connector');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const line = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  line.setAttribute('d', 'M4 12h15m-6-6 6 6-6 6');
  line.setAttribute('fill', 'none');
  line.setAttribute('stroke', 'currentColor');
  line.setAttribute('stroke-width', '1.5');
  line.setAttribute('stroke-linecap', 'round');
  line.setAttribute('stroke-linejoin', 'round');
  svg.append(line);
  return svg;
}

function renderFunnel(analysis) {
  const funnel = storedFunnel(analysis);
  const container = byId('funnel-stages');
  container.replaceChildren();
  container.dataset.comparable = String(funnel.comparable);
  byId('funnel-status').textContent = !funnel.available
    ? '这份已保存分析没有五阶段快照；未根据当前输入补造。可更新本轮判断。'
    : funnel.comparable ? '共享质检判为可比；以下为已保存的事件次数／订单笔数，不代表独立顾客人数。'
      : '仅并列展示当前记录：口径、来源或嵌套关系未满足条件，不连接成漏斗。';
  const priority = analysis?.priority;
  funnel.stages.forEach((stage, index) => {
    const highlighted = priority?.status === 'hypothesis'
      && [priority.fromKey, priority.toKey].includes(stage.key);
    const item = element('li', 'funnel-stage' + (highlighted ? ' is-priority' : ''));
    item.append(element('span', 'stage-label', text(stage.label)));
    item.append(element('strong', 'stage-value', countText(stage.value)));
    item.append(element('span', 'stage-unit', text(stage.unit, '单位未知')));
    if (funnel.comparable && index < funnel.stages.length - 1) item.append(stageArrow());
    container.append(item);
  });
  byId('funnel-priority').textContent = text(priority?.title, '尚无已保存的优先验证环节');

  const maxima = [['按数量差', funnel.maximumLoss.byCount], ['按流失率', funnel.maximumLoss.byRate]];
  byId('funnel-loss-summary').textContent = !funnel.comparable ? '当前没有可比的最大流失排名。'
    : maxima.map(([label, entry]) => entry
      ? label + '最大：' + stageName(funnel, entry.fromKey) + ' → ' + stageName(funnel, entry.toKey)
        + '，' + (label === '按流失率' ? rateText(entry.value) : countText(entry.value))
      : label + '最大：不可计算').join('；') + '。数值排名不能推出根因或优先行动。';

  const transitions = byId('funnel-transition-table');
  transitions.replaceChildren();
  if (funnel.transitions.length) {
    const { table, body } = createTable(['环节', '分子', '分母', '转换率', '流失率', '数量差', '算式与限制', '来源ID'],
      '仅显示共享分析已保存的计算；0是已知计数，未知或分母为0不会显示成0%。', 'calculation-table');
    funnel.transitions.forEach((transition) => {
      const row = element('tr');
      const view = transitionView(funnel, transition);
      [view.label, view.numerator, view.denominator, view.conversion, view.lossRate, view.lossCount]
        .forEach((value) => row.append(element('td', '', value)));
      const calculation = element('td');
      appendParagraph(calculation, view.calculation);
      if (transition.calculation && transition.reason) appendParagraph(calculation, transition.reason, 'muted');
      const sources = element('td');
      appendSourceRefs(sources, transition);
      row.append(calculation, sources);
      body.append(row);
    });
    transitions.append(table);
  } else appendParagraph(transitions, '此分析没有保存逐阶段计算。');

  const sources = byId('funnel-source-table');
  sources.replaceChildren();
  const { table, body } = createTable(['记录', '经营对象', '时间范围', '渠道与群体', '计数单位', '来源与定位'],
    '来源和口径按每个阶段分别列出；不同记录不会自动合并。', 'source-table');
  funnel.stages.forEach((stage) => {
    const row = element('tr');
    [text(stage.label) + '：' + countText(stage.value), text(stage.subject),
      text(stage.window?.start, '起日未知') + ' 至 ' + text(stage.window?.end, '止日未知'),
      text(stage.channel) + '；' + text(stage.cohort), text(stage.unit)].forEach((value) => row.append(element('td', '', value)));
    const cell = element('td');
    appendSourceRefs(cell, stage);
    row.append(cell);
    body.append(row);
  });
  sources.append(table);

  const issues = byId('funnel-issues');
  issues.replaceChildren();
  if (!funnel.issues.length) appendParagraph(issues, funnel.comparable
    ? '本份已保存快照通过共享可比性检查；这不代表未来转化或因果效果已知。'
    : '此分析未提供可比性检查结果。', 'muted');
  funnel.issues.forEach((issue) => {
    const item = element('div', 'evidence-entry');
    appendParagraph(item, issue.description);
    if (sourceRefs(issue).length) appendSourceRefs(item, issue, true);
    issues.append(item);
  });
  const limitations = byId('funnel-limitations');
  limitations.replaceChildren();
  funnel.limitations.forEach((value) => limitations.append(element('li', '', text(value))));
}

function renderPriority(analysis) {
  const trace = byId('decision-call-trace');
  trace.replaceChildren();
  decisionTraceRows(analysis).forEach(([label, value]) => addDefinition(trace, label, value));
  const priority = analysis?.priority;
  byId('priority-title').textContent = text(priority?.title, '当前尚不能确定优先问题');
  byId('priority-hypothesis').textContent = text(priority?.hypothesis?.text, '当前没有可展示的优先假设。');
  byId('priority-reason').textContent = text(priority?.reason, '这份分析没有保存优先问题依据；请更新判断或补充可核对资料。');
  const facts = byId('priority-facts');
  facts.replaceChildren();
  if (!list(priority?.facts).length) appendParagraph(facts, '没有足够观测支持优先问题；不把假设列为事实。', 'muted');
  list(priority?.facts).forEach((entry) => {
    const item = element('div');
    appendParagraph(item, entry.text);
    appendSourceRefs(item, entry, true);
    facts.append(item);
  });
  const assumptions = byId('priority-assumptions');
  assumptions.replaceChildren();
  if (priority?.hypothesis) {
    appendParagraph(assumptions, priority.hypothesis.text);
    appendSourceRefs(assumptions, priority.hypothesis, true);
  } else appendParagraph(assumptions, '尚无已保存的待验证假设。', 'muted');
  const unknowns = byId('priority-unknowns');
  unknowns.replaceChildren();
  appendList(unknowns, priority?.unknowns, '尚未列出；不代表没有未知。');
  const processing = byId('analysis-processing');
  processing.replaceChildren();
  if (!list(analysis?.processing).length) processing.append(element('li', 'muted', '未保存处理记录'));
  const real = analysis?.mode === 'real_model' && ['moneyai', 'ai_settings'].includes(analysis?.analysisSource);
  const receipt = analysis?.providerReceipt;
  const expectedKind = analysis?.analysisSource === 'ai_settings' ? 'provider_ai' : 'moneyai';
  const savedSkills = Array.isArray(analysis?.skillIds) ? analysis.skillIds : [];
  list(analysis?.processing).forEach((entry) => {
    const item = element('li');
    item.append(element('span', '', text(entry.name, '处理名称未提供')));
    const skillCalled = real && DOUYIN_ANALYSIS_SKILL_IDS.includes(entry.skillId)
      && savedSkills.includes(entry.skillId) && entry.kind === expectedKind
      && entry.status === 'done' && entry.operationId === receipt?.operationId;
    const providerDone = real && entry.skillId == null && entry.kind === expectedKind
      && entry.status === 'done' && entry.operationId === receipt?.operationId;
    const status = element('span', 'processing-status', entry.kind === 'local_rule'
      ? ({ done: '已完成', not_run: '未运行' })[entry.status] || '状态未知'
      : skillCalled ? 'Skill 已调用' : providerDone ? '分析已完成' : '身份未核对');
    status.dataset.status = entry.kind === 'local_rule' ? entry.status
      : skillCalled || providerDone ? 'done' : 'unknown';
    item.append(status);
    processing.append(item);
  });
}

function renderScope() {
  byId('scope-question').textContent = text(state.input.focus, text(state.input.description, '本轮以已接收的材料为主，问题描述未提供。'));
  const facts = list(state.input.facts);
  const subjects = [...new Set(facts.map((fact) => fact.subject).filter((item) => typeof item === 'string' && item.trim()))];
  const windows = [...new Set(facts.filter((fact) => fact.window?.start || fact.window?.end)
    .map((fact) => text(fact.window.start, '起日未知') + ' 至 ' + text(fact.window.end, '止日未知')))];
  const sourceKinds = [...new Set(facts.map((fact) => labels.source[fact.source?.kind]).filter(Boolean))];
  const materialStates = { received: '已接收，未解析', parsed: '已解析，仍需核对', needs_review: '待核对', failed: '解析失败' };
  const materials = list(state.input.materials).map((material) =>
    text(material.name, '已接收材料') + '（' + (materialStates[material.status] || '处理状态未知') + '）');
  const sourceParts = [...(state.fixtureId ? ['显式合成资料'] : []), ...materials,
    ...sourceKinds, ...(text(state.input.description, '') ? ['文字／经营背景'] : [])];
  byId('scope-sources').textContent = sourceParts.join('；') || '来源尚未提供';
  byId('scope-window').textContent = windows.length === 1 ? windows[0]
    : windows.length ? '有多个时间范围，请展开分别核对' : '未知';
  const funnel = storedFunnel(state.analysis);
  byId('scope-status').textContent = !confirmed(state) ? '当前输入尚未确认'
    : !currentAnalysis(state) ? '输入已确认，等待本轮有效判断'
      : funnel.comparable ? '输入已确认，五阶段可比' : '输入已确认，仅支持有限分析';
  const gaps = [...new Set([...list(state.input.unknowns).map((entry) => text(entry.description, '一项资料尚待核对')),
    ...(currentAnalysis(state) ? funnel.stages.filter((stage) => stage.value === null).map((stage) => stage.label + '未知') : [])])];
  byId('scope-gaps').textContent = gaps.length ? gaps.slice(0, 2).join('；')
    + (gaps.length > 2 ? '；另' + (gaps.length - 2) + '项见资料范围' : '')
    : '未登记缺口，不代表资料完整。';
  const meta = byId('scope-meta');
  meta.replaceChildren();
  addDefinition(meta, '经营对象', subjects.length === 1 ? subjects[0] : subjects.length ? subjects.join('；') : '未知');
  addDefinition(meta, '资料时间', windows.join('；') || '未知');
  addDefinition(meta, '输入版本', '第 ' + (state.round.index ?? '未知') + ' 轮 · v' + state.round.inputVersion);
  const mode = state.analysis?.mode;
  addDefinition(meta, '分析来源', mode === 'demo_fixture' ? '合成演示 · 本机规则，非真实模型'
    : mode === 'local_limited' ? '本机有限分析 · 非真实模型'
      : mode === 'real_model' ? (state.analysis?.analysisSource === 'ai_settings'
        ? '直连AI真实模型（AI 设置） · 以保存回执为准' : 'MoneyAI真实模型 · 以保存回执为准') : '尚未生成');
  addDefinition(meta, '当前全部缺口', gaps.join('；') || '未登记，不代表没有未知');
}

function renderState() {
  pathInvalid = false;
  const hasInput = Boolean(text(state.input.description, '') || list(state.input.materials).length);
  if (!confirmed(state) && !state.analysis) {
    showStart(hasInput ? '先确认这轮要看的问题' : '先说说情况，再看可选的路', hasInput
      ? '资料已保留，但本轮范围还没有确认。回到第一页核对后再继续。'
      : '这里还没有已确认的问题或材料。写一句现状，或放一份手头材料即可开始。',
    { retry: true, backLabel: hasInput ? '返回核对并确认' : '先说说情况' });
    return;
  }
  byId('decisions-start').hidden = true;
  byId('decisions-content').hidden = false;
  renderScope();
  const analysis = state.analysis;
  const valid = currentAnalysis(state);
  byId('stale-notice').hidden = !analysis || valid;
  byId('stale-description').textContent = `当前输入 v${state.round.inputVersion}，此分析基于 v${analysis?.inputVersion ?? '未知'}。旧内容只供查看，不能据此选路或下载当前报告。`;
  byId('analysis-summary').textContent = analysis ? text(analysis.summary, '现有资料暂不能支持明确判断。') : '尚未生成本轮判断。';
  const limitations = byId('analysis-limitations');
  limitations.replaceChildren();
  list(analysis?.limitations).forEach((value) => limitations.append(element('li', '', text(value))));
  renderFunnel(analysis);
  renderPriority(analysis);
  renderMoneyAIPanel();
  if (analysis && !Array.isArray(analysis.paths)) {
    pathInvalid = true;
    message('分析的路径结构不完整，无法继续。请更新判断或返回核对。', 'error');
  }
  const paths = visibleDecisionPaths(analysis?.paths);
  const eligibility = verifiedAnalysisInput(state);
  byId('no-paths').hidden = paths.length > 0;
  byId('no-paths-description').textContent = analysis
    ? '当前分析没有保存有依据的行动路径；保留未知，不补造第二条。'
    : eligibility.ok ? '资料已确认，尚未取得通过身份核验的真实分析；不会先放入固定演示路径。'
      : eligibility.message;
  byId('path-workspace').hidden = paths.length === 0;
  byId('path-detail-disclosure').hidden = paths.length === 0;
  byId('review-not-actionable').textContent = paths.length === 2 ? '两个都做不了，告诉AI原因'
    : paths.length === 1 ? '这条做不了，告诉AI原因' : '这些都做不了，告诉AI原因';
  const unknowns = byId('no-paths-unknowns');
  unknowns.replaceChildren();
  list(state.input.unknowns).forEach((entry) => unknowns.append(element('li', '', text(entry.description, '一项资料尚待核对'))));
  if (!paths.length) {
    viewedPathId = null;
    byId('path-list').replaceChildren();
    byId('path-detail-disclosure').open = false;
    return;
  }
  if (!paths.some((path) => path.id === viewedPathId)) {
    const previousSelection = valid && state.selection?.analysisId === analysis.id ? state.selection.pathId : null;
    viewedPathId = paths.some((path) => path.id === previousSelection) ? previousSelection : paths[0].id;
  }
  renderPath(selectedPath());
  renderPathList(list(analysis?.paths));
}

function costText(cost, unit) {
  if (!cost || cost.basis === 'unknown' || !number(cost.value) || cost.value < 0) return `${unit === '分钟' ? '时间' : '金额'}未知`;
  return `${formatNumber(cost.value)}${unit}${cost.basis === 'scenario' ? '（假设）' : ''}`;
}

function viewPath(pathId, openDetails = false) {
  if (busy) return false;
  const path = visibleDecisionPaths(state?.analysis?.paths).find((item) => item.id === pathId);
  if (!path) return false;
  viewedPathId = path.id;
  pendingExport = null;
  byId('report-consent').checked = false;
  renderPath(path);
  renderPathList(list(state.analysis.paths));
  setBusy(false);
  if (openDetails) {
    byId('path-detail-disclosure').open = true;
    byId('path-title').focus({ preventScroll: true });
    byId('path-detail-disclosure').scrollIntoView({ block: 'start' });
  }
  return !pathInvalid && !subscriptionFailed;
}

function renderPathList(paths) {
  paths = visibleDecisionPaths(paths);
  byId('paths-availability-note').textContent = paths.length < 2 ? '当前仅有' + paths.length + '条有依据的方案，不补造第二条。' : '当前' + paths.length + '条方案均需由你明确选择；按钮不会自动执行平台操作。';
  const container = byId('path-list');
  container.replaceChildren();
  container.dataset.count = String(paths.length);
  byId('paths-count').textContent = paths.length + ' 条可选行动';
  const chosen = paths.find((path) => isCurrentSelection(state, path.id));
  byId('paths-selection-summary').textContent = chosen
    ? '本轮已选：' + text(chosen.title) + '。查看其他行动不会改选。'
    : '本轮尚未选择。查看依据不会选路，选择保存成功后才进入下一页。';
  paths.forEach((path) => {
    const isViewed = path.id === viewedPathId;
    const isSelected = isCurrentSelection(state, path.id);
    const card = element('article', 'path-card');
    card.dataset.pathId = path.id;
    if (path.actionKey) card.dataset.actionKey = path.actionKey;
    card.dataset.viewed = String(isViewed);
    card.dataset.selected = String(isSelected);
    // The existing A/B contract determines emphasis; unlabeled paths get no invented recommendation.
    card.dataset.recommended = String(path.optionLabel === 'A');
    const topline = element('div', 'path-card-topline');
    topline.append(element('span', 'path-option-label', path.optionLabel ? '方案 ' + path.optionLabel : '可选方案'));
    if (path.optionLabel === 'A' || path.optionLabel === 'B') {
      topline.append(element('span', path.optionLabel === 'A' ? 'path-recommend-label' : 'path-alternative-label',
        path.optionLabel === 'A' ? '主推荐' : '备选路径'));
    }
    card.append(topline);
    const heading = element('header', 'path-card-heading');
    const title = element('h3', '', text(path.title, '未命名行动'));
    title.id = 'path-card-' + path.id;
    card.setAttribute('aria-labelledby', title.id);
    heading.append(title);
    card.append(heading);
    if (path.skillId) card.append(element('p', 'muted', '后续执行 Skill · '
      + (DOUYIN_SKILL_LABELS[path.skillId] || path.skillId) + ' · 尚未调用'));
    card.append(element('p', 'path-card-status', [isViewed ? '当前查看' : '', isSelected ? '本轮已选' : '尚未选择'].filter(Boolean).join(' · ')));
    const resources = element('div', 'path-card-resources');
    for (const [label, value] of [['资金投入', costText(path.cost?.money, '元')], ['准备时间', costText(path.cost?.time, '分钟')]]) {
      const resource = element('div');
      resource.append(element('span', '', label), element('strong', '', value));
      resources.append(resource);
    }
    card.append(resources);
    const costNotes = [path.cost?.time?.note, path.cost?.money?.note].filter((value) => typeof value === 'string' && value.trim());
    if (costNotes.length) card.append(element('p', 'path-card-cost-note', costNotes.join('；')));

    const actionSection = element('section', 'path-card-section');
    actionSection.append(element('h4', '', '具体会做什么'));
    const steps = element('ol', 'path-card-steps');
    // Split only existing clauses for readability; do not invent tasks or execution records.
    text(path.action, '具体动作尚未提供').split('；').filter((value) => value.trim())
      .forEach((value) => steps.append(element('li', '', value.trim())));
    actionSection.append(steps);
    card.append(actionSection);

    const content = element('dl', 'path-card-content');
    const addRow = (label, value) => {
      const group = element('div');
      const dd = element('dd');
      group.append(element('dt', '', label), dd);
      if (Array.isArray(value)) {
        if (value.length === 1) dd.textContent = text(value[0]);
        else appendList(dd, value, '尚未提供');
      } else dd.textContent = value;
      content.append(group);
      return dd;
    };
    addRow('验证指标', decisionMetricText(path));
    const risk = addRow('选择前先看风险', list(path.risk).map((entry) => text(entry.description, '风险待核对')));
    risk.parentElement.classList.add('path-card-risk');
    card.append(content);

    const more = element('details', 'path-card-more');
    more.append(element('summary', '', '查看依据、前提与观察计划'));
    const moreContent = element('div', 'path-card-more-content');
    if (text(path.experiment?.hypothesis, '')) {
      moreContent.append(element('h4', '', '待验证假设'));
      appendParagraph(moreContent, path.experiment.hypothesis);
    }
    moreContent.append(element('h4', '', '来自现有资料'));
    appendList(moreContent, list(path.evidenceRefs).map((entry) => text(entry.summary)), '尚未提供依据，不能当作已经验证。');
    moreContent.append(element('h4', '', '行动前先核对'));
    appendList(moreContent, list(path.prerequisites).map((entry) =>
      (({ met: '条件具备', unmet: '尚不具备', unknown: '待核对' })[entry.status] || '待核对') + '：' + text(entry.text)), '执行条件尚未提供。');
    moreContent.append(element('h4', '', '本轮保持不变'));
    appendList(moreContent, path.experiment?.keepFixed, '尚未提供，执行前需核对。');
    moreContent.append(element('h4', '', '观察计划'));
    appendParagraph(moreContent, text(path.experiment?.window?.description, '观察期尚未提供，不能编造固定门槛。'));
    moreContent.append(element('h4', '', '何时先停下来'));
    appendList(moreContent, list(path.experiment?.stopConditions).map((entry) => text(entry.text)), '停止条件尚待核对。');
    more.append(moreContent);
    card.append(more);

    const actions = element('div', 'path-card-actions');
    const view = element('button', 'button button--quiet path-choice', '完整依据与报告');
    view.type = 'button';
    view.dataset.pathId = path.id;
    view.setAttribute('aria-pressed', String(isViewed));
    view.setAttribute('aria-controls', 'path-detail-disclosure');
    view.setAttribute('aria-label', '查看' + optionText(path) + '：' + text(path.title));
    view.addEventListener('click', () => viewPath(path.id, true));
    const select = element('button', 'button' + (path.optionLabel === 'B' && !isSelected ? ' button--secondary' : '') + ' path-select', decisionSelectionLabel(path, isSelected));
    select.type = 'button';
    select.dataset.pathId = path.id;
    select.disabled = busy || hasPendingReview() || !currentAnalysis(state) || subscriptionFailed;
    select.addEventListener('click', () => {
      if (viewPath(path.id)) void choosePath();
    });
    actions.append(select, view);
    card.append(actions);
    container.append(card);
  });
}

function renderPath(path) {
  if (!path) return;
  pathInvalid = false;
  byId('path-title').textContent = text(path.title, '路径名称未提供');
  byId('path-action').textContent = text(path.action, '具体动作尚未提供');
  const isSelected = isCurrentSelection(state, path.id);
  byId('path-selection-note').textContent = isSelected ? '当前查看 · 本轮已选；执行情况仍以实际反馈为准。' : '当前查看 · 未选定这条行动；不会改变已有选择。';
  byId('choose-path').textContent = decisionSelectionLabel(path, isSelected);
  byId('defer-choice').textContent = state.selection ? '暂不改选' : '暂不选';
  byId('report-consent-row').hidden = !reportNeedsConsent(state);
  const costs = byId('path-costs');
  costs.replaceChildren();
  [['资金', path.cost?.money, '元'], ['时间', path.cost?.time, '分钟']].forEach(([label, cost, unit]) => {
    addDefinition(costs, label, costText(cost, unit), `${labels.basis[cost?.basis] || '依据未知'}。${text(cost?.note, '投入边界仍需核对。')}`);
  });
  const prerequisites = byId('path-prerequisites');
  prerequisites.replaceChildren();
  const conditions = list(path.prerequisites);
  if (!conditions.length) prerequisites.append(element('li', '', '执行条件未提供，行动前需要核对。'));
  conditions.forEach((condition) => {
    const li = element('li');
    li.append(element('span', 'condition-status', `${({ met: '条件具备', unmet: '尚不具备', unknown: '待核对' })[condition.status] || '待核对'}：`));
    li.append(document.createTextNode(text(condition.text)));
    prerequisites.append(li);
  });
  renderEstimate(path.estimate);
  renderRisks(path.risk);
  renderEvidence(path);
  renderExperiment(path.experiment);
  renderTree(path.tree);
  recordVisiblePath(path);
}

function scenarioRows(estimate) {
  if (estimate?.calculation?.method !== 'visitors_times_rate' || !list(estimate.values).length) return null;
  const assumptions = new Map(list(estimate.assumptions).map((item) => [item.id, item]));
  if (assumptions.size !== list(estimate.assumptions).length) return null;
  const rows = [];
  for (const value of estimate.values) {
    const visitors = assumptions.get(value.visitorAssumptionId);
    const rate = assumptions.get(value.rateAssumptionId);
    if (!number(visitors?.value) || visitors.value < 0 || !number(rate?.value) || rate.value < 0 || rate.value > 1
      || !number(value.value) || Math.abs(visitors.value * rate.value - value.value) > 1e-8) return null;
    rows.push({ label: text(value.label, '情景'), visitors: visitors.value, rate: rate.value, value: value.value });
  }
  return rows;
}

function renderEstimate(estimate) {
  const target = byId('path-estimate');
  target.replaceChildren();
  const rows = estimate?.kind === 'scenario' ? scenarioRows(estimate) : null;
  appendParagraph(target, rows ? '假设下的情景测算' : '暂不可估', 'estimate-type');
  if (estimate?.target) appendParagraph(target, `观察指标：${labels.metric[estimate.target.metric] || text(estimate.target.metric)}；单位：${text(estimate.target.unit)}；对象：${text(estimate.target.subject)}。`);
  appendParagraph(target, `观察范围：${text(estimate?.horizon?.description, '观察期尚未确定')}。`);
  if (rows) {
    appendParagraph(target, text(estimate.calculation.displayFormula, '期望订单 = 可比访客 × 假设支付率'), 'estimate-formula');
    const wrap = element('div', 'estimate-table-wrap');
    const table = element('table', 'estimate-table');
    const caption = element('caption', '', '合成或明确假设条件下的期望值，不是实际订单上下界');
    table.append(caption);
    const thead = element('thead');
    const header = element('tr');
    ['条件', '可比访客', '假设支付率', '期望订单'].forEach((value) => {
      const th = element('th', '', value); th.scope = 'col'; header.append(th);
    });
    thead.append(header); table.append(thead);
    const tbody = element('tbody');
    rows.forEach((row) => {
      const tr = element('tr');
      [row.label, `${formatNumber(row.visitors)} 人`, `${formatNumber(row.rate * 100)}%`, `${formatNumber(row.value)} 笔`].forEach((value) => tr.append(element('td', '', value)));
      tbody.append(tr);
    });
    table.append(tbody); wrap.append(table); target.append(wrap);
    const assumptions = list(estimate.assumptions).map((item) => `${text(item.label)}：${number(item.value) ? formatNumber(item.value) : '未知'} ${text(item.unit, '')}。${text(item.note, '假设来源未提供')}`);
    appendList(target, assumptions);
    appendParagraph(target, '这些值不是统计置信区间，不保证实际订单落在其间，也不能解释为采用这条路径带来的增量。');
  } else if (estimate?.kind === 'scenario') {
    appendParagraph(target, '情景参数或算式不完整／不一致，已停止展示数值。请更新判断后再试。');
    pathInvalid = true;
  } else if (estimate?.kind && estimate.kind !== 'unavailable') {
    appendParagraph(target, '当前版本不支持该估算方法，未展示未经核验的统计区间。');
    pathInvalid = true;
  }
  appendList(target, estimate?.limitations, '资料不足，尚无可核对的结果估计。');
  appendParagraph(target, `行动增量：${text(estimate?.incrementalEffect?.reason, '无法估计行动增量')}。`, 'muted');
}

function conditionText(condition, fallback) {
  return text(condition?.text, fallback);
}

function renderRisks(risks) {
  const parent = byId('path-risks');
  parent.replaceChildren();
  if (!list(risks).length) appendParagraph(parent, '风险资料尚未提供，不能据此视为没有风险。');
  list(risks).forEach((risk) => {
    const item = element('div', 'risk-item');
    appendParagraph(item, text(risk.description, '风险说明尚待核对'), 'risk-item-title');
    appendParagraph(item, `留意：${conditionText(risk.trigger, '触发条件未知')}。`);
    appendParagraph(item, `停止：${conditionText(risk.stop, '停止条件尚待核对')}。`);
    appendParagraph(item, `恢复：${conditionText(risk.restore, '恢复条件尚待核对')}。`);
    parent.append(item);
  });
  appendParagraph(parent, '时间或资金预算只是当前依据下的投入说明，不是保证的最大损失。', 'muted');
}

function locatorText(locator) {
  if (!locator) return '未提供原文定位';
  if (locator.type === 'input') return locator.field === 'focus' ? '本轮关注范围' : '问题描述';
  if (locator.type === 'question') return '本轮补问原话';
  if (locator.type === 'text' || locator.type === 'csv') {
    return `第 ${locator.lineStart ?? '未知'}–${locator.lineEnd ?? locator.lineStart ?? '未知'} 行${locator.type === 'csv' ? `，记录 ${locator.recordIndex ?? '未知'}，列 ${text(locator.column)}` : ''}`;
  }
  if (locator.type === 'json') return `JSON 字段 ${text(locator.pointer)}`;
  if (locator.type === 'correction') return `用户更正，输入版本 ${locator.inputVersion ?? '未知'}`;
  return '定位格式暂不支持';
}

function correctionButton(sourceId) {
  const button = element('button', 'button button--quiet source-correction', '核对／更正这条来源');
  button.type = 'button';
  button.addEventListener('click', () => goTo('intake', { sourceId }));
  return button;
}

function renderEvidence(path) {
  const parent = byId('path-evidence');
  parent.replaceChildren();
  const valid = currentAnalysis(state);
  const facts = new Map((valid ? list(state.input.facts) : []).map((fact) => [fact.id, fact]));
  [['支持这条路径的依据', path.evidenceRefs], ['反面线索与尚不能支持的部分', path.counterEvidence]].forEach(([title, entries]) => {
    const group = element('section', 'evidence-group');
    group.append(element('h4', '', title));
    if (!list(entries).length) appendParagraph(group, '未提供；没有列出不代表不存在。', 'muted');
    list(entries).forEach((entry) => {
      const item = element('div', 'evidence-entry');
      appendParagraph(item, labels.evidence[entry.kind] || '类型待核对', 'evidence-kind');
      appendParagraph(item, entry.summary);
      if (entry.calculation) appendParagraph(item, `计算：${text(entry.calculation)}`);
      if (!valid) appendParagraph(item, '此处为旧分析摘要，当前输入不能替代它原来的证据快照。请返回核对。', 'muted');
      const refs = new Set(list(entry.sourceIds));
      list(entry.factIds).forEach((factId) => {
        const fact = facts.get(factId);
        if (!fact) { appendParagraph(item, '对应事实未提供、已更新或不可核对。', 'muted'); return; }
        const value = fact.availability === 'known' && (typeof fact.value === 'string' || number(fact.value)) ? String(fact.value) : '未知';
        appendParagraph(item, `${labels.metric[fact.key] || text(fact.key, '事实条目')}：${value}${fact.unit ? ` ${fact.unit}` : ''}。${labels.source[fact.source?.kind] || '来源类型未知'} · ${labels.verification[fact.verification] || '尚未核对'}。`);
        appendParagraph(item, `来源位置：${locatorText(fact.source?.locator)}。对象：${text(fact.subject)}；渠道：${text(fact.channel)}。`, 'muted');
        if (fact.source?.materialId) {
          const material = list(state.input.materials).find((value) => value.id === fact.source.materialId);
          if (!material) appendParagraph(item, '原件未提供或已移除。', 'muted');
          else if (fact.source.materialVersion !== material.version) appendParagraph(item, '原件版本已变化，请勿用当前原件替代旧引用。', 'muted');
        }
        refs.add(`fact:${fact.id}`);
      });
      [...refs].filter((sourceId) => typeof sourceId === 'string' && /^(input:(description|focus)|(material|fact|question):[A-Za-z0-9_-]{1,80})$/.test(sourceId))
        .forEach((sourceId) => item.append(correctionButton(sourceId)));
      group.append(item);
    });
    parent.append(group);
  });
}

function renderExperiment(experiment) {
  const parent = byId('path-experiment');
  parent.replaceChildren();
  if (!experiment) { appendParagraph(parent, '尚未提供观察计划；不能据此宣称具备停止或恢复条件。'); return; }
  const grid = element('div', 'experiment-grid');
  [['只改变什么', text(experiment.change)], ['保持不变', list(experiment.keepFixed).join('；') || '尚未提供'],
    ['观察什么', `${labels.metric[experiment.target?.metric] || text(experiment.target?.metric)}；单位 ${text(experiment.target?.unit)}`],
    ['观察期', text(experiment.window?.description)], ['样本要求', number(experiment.minSample) ? `${formatNumber(experiment.minSample)}；仅为当前计划条件，不表示已满足统计要求` : '未知，不编造固定样本门槛']]
    .forEach(([title, value]) => { const part = element('div'); part.append(element('h4', '', title)); appendParagraph(part, value); grid.append(part); });
  parent.append(grid);
  parent.append(element('h4', '', '停止条件'));
  appendList(parent, list(experiment.stopConditions).map((item) => item.text), '尚待核对');
  parent.append(element('h4', '', '恢复条件'));
  appendList(parent, list(experiment.restoreConditions).map((item) => item.text), '尚待核对');
  appendList(parent, experiment.limitations);
}

function renderTree(tree) {
  const parent = byId('path-tree');
  parent.replaceChildren();
  const validation = api.validateDecisionTree(tree);
  if (!validation?.ok) {
    appendParagraph(parent, text(validation?.message, '业务树结构无效，不能展示或导出不完整的决策依据。'));
    pathInvalid = true;
    return;
  }
  appendParagraph(parent, '先判断风险与资料是否足够，再看可比变化。没有反馈不等于没执行，正向变化也不证明建议有效。', 'muted');
  const nodes = new Map(tree.nodes.map((node) => [node.id, node]));
  const children = new Map();
  tree.edges.forEach((edge) => {
    if (!children.has(edge.from)) children.set(edge.from, []);
    children.get(edge.from).push(edge);
  });
  const appendNode = (nodeId, container) => {
    const node = nodes.get(nodeId);
    appendParagraph(container, node.title, 'tree-node-title');
    if (node.detail) appendParagraph(container, node.detail, 'tree-node-detail');
    const outgoing = children.get(nodeId) || [];
    if (!outgoing.length) return;
    const ul = element('ul', 'tree-list');
    outgoing.forEach((edge) => {
      const li = element('li', 'tree-branch');
      li.append(element('span', 'tree-branch-label', labels.branch[edge.branch] || edge.branch));
      appendParagraph(li, edge.condition.text, 'tree-condition');
      appendNode(edge.to, li);
      ul.append(li);
    });
    container.append(ul);
  };
  appendNode(tree.rootId, parent);
  appendList(parent, list(tree.notApplicableBranches).map((entry) => `${labels.branch[entry.branch] || entry.branch}不适用：${text(entry.reason)}`));
}

async function goTo(pageId, options) {
  if (busy) return;
  if (!api) { message('共享导航尚未载入。请在统筹提供的本地 HTTP 服务中重试。', 'error'); return; }
  await operate(async () => {
    const result = await api.navigateTo(pageId, options);
    if (result === false || result?.ok === false) fail(result, '暂时不能离开本页，请先处理未保存的内容。');
  });
}

async function choosePath() {
  if (busy || hasPendingReview() || pathInvalid || subscriptionFailed || !selectedPath()) return;
  const pathId = viewedPathId;
  const viewedIdentity = identity(state, pathId);
  const origin = decisionScope(state);
  await operate(async () => {
    const snapshot = await readDecisionState(origin);
    if (!currentAnalysis(snapshot) || identity(snapshot, pathId) !== viewedIdentity
      || !snapshot.analysis.paths.some((path) => path.id === pathId)) {
      fail({ code: 'stale_input', message: '查看期间资料或分析已变化，请查看当前路径后重新选择。' });
    }
    // A valid existing selection continues without issuing PATH_SELECT again.
    const saved = isCurrentSelection(snapshot, pathId) ? snapshot
      : await dispatchIntent('select:' + viewedIdentity, 'PATH_SELECT', {
        analysisId: snapshot.analysis.id, pathId, inputVersion: snapshot.round.inputVersion,
      }, snapshot, { exactRevision: true, scope: origin });
    if (!isCurrentSelection(saved, pathId) || saved.selection.analysisId !== snapshot.analysis.id) {
      fail({ message: '选择尚未在共享状态中确认，停留本页以免误跳转。' });
    }
    const result = await api.navigateTo('action');
    if (result === false || result?.ok === false) fail(result, '选择已保存，但暂时无法进入下一页；可重试继续。');
  });
}

async function downloadReport() {
  const pathId = viewedPathId;
  const requestedIdentity = identity(state, pathId);
  const allowSummaries = byId('report-consent').checked;
  await operate(async () => {
    const snapshot = await readState();
    if (!currentAnalysis(snapshot) || identity(snapshot, pathId) !== requestedIdentity) {
      fail({ code: 'stale_input', message: '资料或分析已更新，未发出旧报告下载。请重新查看。' });
    }
    if (!pendingExport || pendingExport.identity !== requestedIdentity || pendingExport.allowSummaries !== allowSummaries) {
      pendingExport = { identity: requestedIdentity, exportId: crypto.randomUUID(), generatedAt: new Date().toISOString(), allowSummaries };
    }
    const exportOptions = { ...pendingExport };
    const frozen = structuredClone(snapshot);
    const report = api.buildPathReport(frozen, pathId, exportOptions);
    if (!report?.ok) fail(report, '报告生成失败，未发出下载请求。');
    const latest = await readState();
    if (!currentAnalysis(latest) || identity(latest, pathId) !== requestedIdentity) {
      fail({ code: 'stale_input', message: '报告生成期间资料已变化，已取消下载。请查看当前结果后重试。' });
    }
    const objectUrl = URL.createObjectURL(new Blob([report.html], { type: 'text/html;charset=utf-8' }));
    const link = element('a');
    link.href = objectUrl;
    link.download = report.filename;
    link.hidden = true;
    document.body.append(link);
    try {
      link.click();
    } catch (error) {
      URL.revokeObjectURL(objectUrl);
      throw error;
    } finally {
      link.remove();
    }
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1500);
    pendingExport = null;
    byId('report-consent').checked = false;
    message('已向浏览器请求下载 HTML 报告；是否保存请查看下载列表。此操作不会选择、采用或执行路径。');
    recordEvent('download_requested', { pageId: 'decisions', analysisId: frozen.analysis.id, pathId,
      inputVersion: frozen.round.inputVersion, stateRevision: frozen.revision, exportId: exportOptions.exportId, format: 'html' }, frozen);
  });
}

async function boot() {
  if (booting) return;
  booting = true;
  try {
    if (!['http:', 'https:'].includes(window.location.protocol)) throw new Error('请使用统筹提供的同源本地 HTTP 地址，不能通过 file:// 运行共享会话。');
    const [storage, navigation, shell, data, report, moneyai, moneyaiContract, model, ai] = await Promise.all([
      import('../shared/state.js'), import('../shared/navigation.js'), import('../shared/shell.js'),
      import('../shared/demo-data.js'), import('./report.js'), import('../shared/moneyai.js'),
      import('../shared/moneyai-contract.js'), import('../shared/model.js'), import('../shared/ai.js'),
    ]);
    api = { ...storage, ...navigation, ...shell, ...data, ...report, ...moneyai, ...ai,
      computeMoneyAIInputFingerprint: moneyaiContract.computeMoneyAIInputFingerprint,
      createMoneyAIEnvelope: moneyaiContract.createMoneyAIEnvelope,
      validateRealModelAnalysisDraft: model.validateRealModelAnalysisDraft,
      MONEYAI_OPERATIONS: moneyaiContract.MONEYAI_OPERATIONS };
    for (const name of ['loadSession', 'dispatch', 'subscribeSession', 'navigateTo', 'registerNavigationGuard', 'mountShell', 'buildDemoAnalysis', 'buildPathReport', 'validateDecisionTree', 'getMoneyAIStatus', 'requestMoneyAIAnalysis', 'computeMoneyAIInputFingerprint', 'createMoneyAIEnvelope', 'validateRealModelAnalysisDraft', 'getAiSettings', 'requestProviderAnalysis']) {
      if (typeof api[name] !== 'function') throw new Error(`共享或报告模块缺少 ${name}，未创建替代实现。`);
    }
    if (api.MONEYAI_OPERATIONS?.analysis !== 'analysis.run') throw new Error('MoneyAI分析操作契约不兼容。');
    await api.mountShell('decisions');
    registerReviewNavigationGuard();
    subscribe();
    await refreshSession();
    void refreshMoneyAIStatus();
    void refreshProviderSettings();
  } catch (error) {
    api = null;
    showStart('第二页暂时无法启动', '共享模块或本地服务还未准备好。不会载入假案例，也没有改写已保存的资料。', { goBack: false });
    message(text(error?.message, '模块加载失败，请等待统筹完成共享接口后重新读取。'), 'error');
  } finally {
    booting = false;
  }
}

if (typeof document !== 'undefined') {
// Page wiring; helpers above remain pure or explicit render functions.
bindReviewControls();
document.querySelectorAll('[data-action="return"]').forEach((button) => button.addEventListener('click', () => goTo('intake')));
byId('retry-load').addEventListener('click', () => api ? refreshSession() : window.location.reload());
byId('refresh-analysis').addEventListener('click', () => operate(generateAnalysis));
byId('moneyai-check-status').addEventListener('click', () => {
  if (moneyAIPanelMode === 'provider') void refreshProviderSettings();
  else void refreshMoneyAIStatus();
});
byId('moneyai-mode-moneyai').addEventListener('click', () => setMoneyAIPanelMode('moneyai'));
byId('moneyai-mode-provider').addEventListener('click', () => setMoneyAIPanelMode('provider'));
byId('moneyai-consent').addEventListener('change', () => syncMoneyAIControls());
byId('moneyai-request-analysis').addEventListener('click', () => void requestMoneyAIFromPage());
byId('moneyai-cancel-analysis').addEventListener('click', cancelMoneyAIRequest);
byId('choose-path').addEventListener('click', choosePath);
byId('download-report').addEventListener('click', downloadReport);
byId('calculation-return').addEventListener('click', () => {
  byId('funnel-calculations').open = false;
  byId('funnel-calculations').querySelector('summary').focus({ preventScroll: true });
  byId('funnel-stages').scrollIntoView({ block: 'center' });
});
byId('return-paths').addEventListener('click', () => {
  byId('path-detail-disclosure').open = false;
  byId('path-list').querySelector('[aria-pressed="true"]')?.focus({ preventScroll: true });
  byId('path-workspace').scrollIntoView({ block: 'start' });
});
byId('defer-choice').addEventListener('click', () => message(state?.selection
  ? '没有新增或替换选择，已有选择及材料继续保留。可以继续比较，或返回补充。'
  : '本轮暂不选择，资料和当前结果继续保留。可以继续比较，或返回补充。'));
byId('retry-event').addEventListener('click', () => operate(async () => {
  for (const entry of [...pendingEvents.values()]) await saveEvent(entry);
}));
for (const id of ['evidence-disclosure', 'experiment-disclosure', 'tree-disclosure']) {
  byId(id).addEventListener('toggle', () => {
    if (byId(id).open && state && selectedPath()) {
      recordVisiblePath(selectedPath());
    }
  });
}
window.addEventListener('pagehide', () => {
  if (moneyAIOperation) { moneyAIOperation.stale = true; moneyAIOperation.controller.abort(); }
  unsubscribe?.(); unsubscribe = null; unregisterReviewGuard?.(); unregisterReviewGuard = null;
});
window.addEventListener('pageshow', (event) => { if (event.persisted && api) { registerReviewNavigationGuard(); subscribe(); void refreshSession(false); } });
// Cosmetic only: a missing or late title enhancement cannot block shared state.
void import('../shared/title-motion.js')
  .then(({ enhanceFoldTitle }) => enhanceFoldTitle(byId('decisions-title')))
  .catch(() => {});
void boot();

}
