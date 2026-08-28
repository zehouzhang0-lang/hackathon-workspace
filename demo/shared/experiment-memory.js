/**
 * Pure C7 projection of one saved feedback chain. No persistence, new round,
 * clock, randomness, DOM, filesystem, network or model calls.
 */
const VERSION = 1;
const ID = /^[A-Za-z0-9_-]{1,80}$/;
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const validId = value => typeof value === 'string' && ID.test(value) && !value.startsWith('draft_');
const nonempty = value => typeof value === 'string' && value.trim().length > 0;
const positiveInt = value => Number.isSafeInteger(value) && value > 0;
const count = value => Number.isSafeInteger(value) && value >= 0;
const nullableText = value => value === null || typeof value === 'string';
const has = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
class ReviewError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}
function requireValue(value, message, code = 'invalid_feedback') {
  if (!value) throw new ReviewError(code, message);
}
function canonical(value, ancestors = new Set()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') {
    requireValue(Number.isFinite(value), '记录含非JSON数值。', 'invalid_state');
    return JSON.stringify(value);
  }
  requireValue(value && typeof value === 'object' && !ancestors.has(value), '记录不是纯JSON或存在循环。', 'invalid_state');
  requireValue(Array.isArray(value) || [Object.prototype, null].includes(Object.getPrototypeOf(value)), '记录不是普通JSON对象。', 'invalid_state');
  ancestors.add(value);
  let result;
  if (Array.isArray(value)) {
    requireValue(value.every((_, index) => has(value, index)) && Object.keys(value).length === value.length, '记录列表有空洞或额外属性。', 'invalid_state');
    result = '[' + Array.from(value, entry => canonical(entry, ancestors)).join(',') + ']';
  } else {
    const fields = Object.keys(value).sort();
    requireValue(fields.every(key => has(Object.getOwnPropertyDescriptor(value, key), 'value')), '记录不能含访问器。', 'invalid_state');
    result = '{' + fields.map(key => JSON.stringify(key) + ':' + canonical(value[key], ancestors)).join(',') + '}';
  }
  ancestors.delete(value);
  return result;
}
const copy = value => JSON.parse(canonical(value));
function withoutStatus(value) {
  return Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'status'));
}
// Synchronous SHA-256 keeps the public projection deterministic and browser-native.
function sha256(text) {
  const bytes = new TextEncoder().encode(text);
  const padded = new Uint8Array(Math.ceil((bytes.length + 9) / 64) * 64);
  padded.set(bytes); padded[bytes.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 8, Math.floor(bytes.length / 0x20000000));
  view.setUint32(padded.length - 4, (bytes.length * 8) >>> 0);
  const constants = [
    0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
    0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
    0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
    0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
    0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
    0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
    0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
    0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2
  ];
  const hash = [0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
  const rotate = (value, bits) => (value >>> bits) | (value << (32 - bits));
  const words = new Uint32Array(64);
  for (let offset = 0; offset < padded.length; offset += 64) {
    for (let index = 0; index < 16; index++) words[index] = view.getUint32(offset + index * 4);
    for (let index = 16; index < 64; index++) {
      const a = words[index - 15], b = words[index - 2];
      words[index] = (words[index - 16] + (rotate(a, 7) ^ rotate(a, 18) ^ (a >>> 3))
        + words[index - 7] + (rotate(b, 17) ^ rotate(b, 19) ^ (b >>> 10))) >>> 0;
    }
    let [a,b,c,d,e,f,g,h] = hash;
    for (let index = 0; index < 64; index++) {
      const first = (h + (rotate(e, 6) ^ rotate(e, 11) ^ rotate(e, 25))
        + ((e & f) ^ (~e & g)) + constants[index] + words[index]) >>> 0;
      const second = ((rotate(a, 2) ^ rotate(a, 13) ^ rotate(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
      h=g; g=f; f=e; e=(d+first)>>>0; d=c; c=b; b=a; a=(first+second)>>>0;
    }
    [a,b,c,d,e,f,g,h].forEach((value, index) => { hash[index] = (hash[index] + value) >>> 0; });
  }
  return hash.map(value => value.toString(16).padStart(8, '0')).join('');
}
function timestamp(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)) return false;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && [date.toISOString(), date.toISOString().replace('.000Z', 'Z')].includes(value);
}
function date(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(value + 'T00:00:00Z');
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}
function sessionMatches(record, sessionId) {
  requireValue(!has(record, 'sessionId') || record.sessionId === sessionId, '记录来自其他会话。', 'source_mismatch');
}
function scopeMatches(record, feedback, sessionId) {
  requireValue(object(record), '关联记录缺失。', 'missing_source');
  sessionMatches(record, sessionId);
  for (const key of ['roundId', 'inputVersion', 'analysisId', 'pathId', 'artifactId', 'artifactVersion']) {
    requireValue(record[key] === feedback[key], '记录的轮次、分析、路径或产物版本不一致。', 'source_mismatch');
  }
}
function uniqueMatch(items, predicate, description) {
  const found = items.filter(predicate);
  requireValue(found.length === 1, description + (found.length ? '不唯一。' : '缺失。'), found.length ? 'ambiguous_source' : 'missing_source');
  return found[0];
}
function savedAnalysis(state, feedback) {
  const candidates = [];
  if (object(state.analysis) && state.analysis.id === feedback.analysisId) candidates.push(state.analysis);
  for (const entry of state.history) {
    if (!object(entry) || !['analysis', 'round'].includes(entry.type) || !object(entry.analysis)
      || entry.analysis.id !== feedback.analysisId) continue;
    sessionMatches(entry, state.sessionId);
    if (entry.type === 'round') requireValue(entry.round?.id === feedback.roundId, '归档轮次与原分析不一致。', 'source_mismatch');
    candidates.push(entry.analysis);
  }
  requireValue(candidates.length, '没有找到这条反馈的原分析，不使用当前其他分析补位。', 'missing_source');
  let identity = null;
  for (const analysis of candidates) {
    sessionMatches(analysis, state.sessionId);
    requireValue(analysis.roundId === feedback.roundId && analysis.inputVersion === feedback.inputVersion
      && validId(analysis.id) && timestamp(analysis.savedAt) && Array.isArray(analysis.paths)
      && ['ready', 'limited', 'insufficient', 'stale'].includes(analysis.status), '原分析版本或保存标记不正确。', 'source_mismatch');
    const input = analysis.inputSnapshot;
    requireValue(object(input) && typeof input.description === 'string' && input.confirmedVersion === feedback.inputVersion
      && ['facts', 'materials', 'constraints', 'unknowns'].every(key => Array.isArray(input[key])),
    '原分析缺少完整的已确认输入原文快照。', 'missing_source');
    if (input.intake != null) requireValue(object(input.intake) && object(input.intake.draft)
      && typeof input.intake.draft.transcript === 'string', '原分析缺少保存的原始转写快照。', 'missing_source');
    if (input.intake != null) requireValue((!has(input.intake, 'roundId') || input.intake.roundId === feedback.roundId)
      && (!has(input.intake, 'inputVersion') || input.intake.inputVersion === feedback.inputVersion),
    '原分析的整理快照轮次或版本不一致。', 'source_mismatch');
    const next = canonical(withoutStatus(analysis));
    requireValue(identity === null || identity === next, '同一分析ID对应不同内容，不能猜选原版本。', 'ambiguous_source');
    identity = next;
  }
  return candidates[0];
}
function factIndex(input) {
  const facts = new Map();
  for (const fact of input.facts) {
    requireValue(object(fact) && validId(fact.id) && !facts.has(fact.id), '原输入事实索引缺失或重复。', 'missing_source');
    facts.set(fact.id, fact);
  }
  return facts;
}
function checkFactRefs(refs, facts) {
  requireValue(Array.isArray(refs) && refs.every(id => validId(id) && facts.has(id)), '原路径或产物引用了原快照中不存在的事实。', 'missing_source');
}
function detailsOf(feedback) {
  requireValue(feedback.detailsVersion === undefined || feedback.detailsVersion === 1, '反馈详情版本不受支持。', 'unsupported_feedback_version');
  const current = feedback.detailsVersion === 1;
  const detail = {
    detailsVersion: current ? 1 : null,
    reason: current ? feedback.reason ?? null : null,
    sampleSize: current ? feedback.sampleSize ?? null : null,
    sampleUnit: current ? feedback.sampleUnit ?? null : null,
    metricBefore: current ? feedback.metricBefore ?? null : null,
    metricAfter: current ? feedback.metricAfter ?? null : null,
    constraintsLearned: current ? feedback.constraintsLearned ?? [] : [],
    guardrailStatus: current ? feedback.guardrailStatus ?? 'unknown' : 'unknown'
  };
  requireValue(nullableText(detail.reason) && (detail.sampleSize === null || count(detail.sampleSize))
    && [null, 'product_clicks'].includes(detail.sampleUnit)
    && [detail.metricBefore, detail.metricAfter].every(value => value === null || typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1)
    && Array.isArray(detail.constraintsLearned) && detail.constraintsLearned.every(nonempty)
    && ['unknown', 'clear', 'triggered'].includes(detail.guardrailStatus), '反馈详情含非法类型、数值或未知枚举。');
  return detail;
}
function titleConstraint(rawText) {
  // Deliberately narrow: no extraction from questions, negations or past restrictions.
  if (/[?？]|不是|并非|以前|之前|曾经|不再|现在可以|现在允许|已经可以/.test(rawText)) return null;
  return rawText.split(/[，,。；;！!\n\r]/).map(value => value.trim().replace(/^(?:限制|经营限制)[：:]\s*/, ''))
    .find(value => /^(?:商品)?标题(?:目前|暂时)?(?:不能|无法|不可|不允许)(?:改|修改|改动|更改)$/.test(value)) ?? null;
}
function observedFact(fact, unit) {
  return fact && fact.availability === 'known' && count(fact.value) && fact.unit === unit
    && !['owner_hypothesis', 'unknown'].includes(fact.evidenceStatus)
    && fact.verification !== 'conflicting' && ['merchant_statement', 'file_extract'].includes(fact.source?.kind);
}
function eligibleFirstScreen(analysis, path, facts) {
  const plan = path.experiment;
  if (analysis.sourceFixtureId !== 'juicer_cup_v1' || analysis.mode !== 'demo_fixture'
    || path.actionKey !== 'juicer_first_screen' || plan?.experimentId !== 'EXP-JUICER01-click_cart-A-R1'
    || plan?.target?.metric !== 'click_to_cart_rate' || !positiveInt(plan.minSample)
    || plan.minSample < 100 || !['product_clicks', '次新增商品点击'].includes(plan.minSampleUnit)
    || !Array.isArray(plan.sourceFactIds)) return false;
  const source = plan.sourceFactIds.map(id => facts.get(id));
  const clicks = source.filter(fact => fact.key === 'product_clicks'), carts = source.filter(fact => fact.key === 'add_to_carts');
  if (clicks.length !== 1 || carts.length !== 1 || !observedFact(clicks[0], '次商品点击') || !observedFact(carts[0], '次加购')) return false;
  const first = clicks[0], next = carts[0];
  return first.value > 0 && next.value <= first.value && ['subject', 'channel', 'cohort'].every(key => nonempty(plan.target[key])
    && first[key] === plan.target[key] && next[key] === first[key])
    && object(first.window) && object(next.window) && date(first.window.start) && date(first.window.end)
    && first.window.start <= first.window.end && first.window.start === next.window.start && first.window.end === next.window.end;
}

/** Read a saved feedback chain. Historical rounds are readable; C8 owns current-round acceptance. */
export function buildExperimentReview(state, feedbackId) {
  try {
    requireValue(object(state) && state.contractVersion === 'demo.v1' && validId(state.sessionId)
      && count(state.revision) && ['feedbackRecords', 'executionRecords', 'artifacts', 'history'].every(key => Array.isArray(state[key])),
    '会话或保存记录结构不受支持。', 'invalid_state');
    requireValue(validId(feedbackId), '反馈标识无效。');
    const feedback = uniqueMatch(state.feedbackRecords, item => object(item) && item.id === feedbackId, '指定反馈');
    sessionMatches(feedback, state.sessionId);
    requireValue(['roundId', 'analysisId', 'pathId', 'artifactId'].every(key => validId(feedback[key]))
      && positiveInt(feedback.inputVersion) && positiveInt(feedback.artifactVersion)
      && timestamp(feedback.savedAt) && timestamp(feedback.reportedAt)
      && ['unknown', 'better', 'unchanged', 'worse'].includes(feedback.observation)
      && typeof feedback.rawText === 'string', '反馈的来源、保存版本或原话结构无效。');
    const artifact = uniqueMatch(state.artifacts, item => object(item) && item.id === feedback.artifactId && item.version === feedback.artifactVersion, '原产物版本');
    scopeMatches({ ...artifact, artifactId: artifact.id, artifactVersion: artifact.version }, feedback, state.sessionId);
    requireValue(nonempty(artifact.title) && typeof artifact.body === 'string' && timestamp(artifact.savedAt)
      && ['current', 'stale'].includes(artifact.status), '原产物没有完整保存内容。', 'missing_source');
    const analysis = savedAnalysis(state, feedback);
    requireValue(artifact.mode === analysis.mode, '原产物与原分析来源模式不一致。', 'source_mismatch');
    const path = uniqueMatch(analysis.paths, item => object(item) && item.id === feedback.pathId, '原路径');
    requireValue(nonempty(path.title) && nonempty(path.action) && (path.experiment == null || object(path.experiment)), '原路径内容不完整。', 'missing_source');
    const facts = factIndex(analysis.inputSnapshot);
    checkFactRefs(artifact.sourceFactIds ?? [], facts);
    const plan = path.experiment ?? null;
    if (plan) checkFactRefs(plan.sourceFactIds ?? [], facts);
    let executionRecord = null;
    if (feedback.executionRecordId != null) {
      requireValue(validId(feedback.executionRecordId), '关联执行记录标识无效。');
      executionRecord = uniqueMatch(state.executionRecords, item => object(item) && item.id === feedback.executionRecordId, '关联执行记录');
      scopeMatches(executionRecord, feedback, state.sessionId);
      requireValue(['unknown', 'intended', 'adopted', 'partial', 'declined'].includes(executionRecord.adoption)
        && ['unknown', 'not_started', 'partial', 'done'].includes(executionRecord.execution)
        && nullableText(executionRecord.scope) && (executionRecord.executedAt === null || date(executionRecord.executedAt) || timestamp(executionRecord.executedAt))
        && timestamp(executionRecord.savedAt) && timestamp(executionRecord.reportedAt), '执行自述的状态、范围或日期无效。');
    }
    const detail = detailsOf(feedback);
    const inferredTitle = titleConstraint(feedback.rawText);
    const constraintsLearned = [...new Set([...detail.constraintsLearned, ...(inferredTitle ? [inferredTitle] : [])])];
    const originalConstraints = [
      ...analysis.inputSnapshot.constraints.map(item => object(item) ? item.description : item).filter(nonempty),
      ...(analysis.inputSnapshot.intake?.draft?.constraints ?? []).filter(nonempty)
    ];
    const constraints = [...new Set([...originalConstraints, ...constraintsLearned])];
    const unknowns = [...new Set([
      ...analysis.inputSnapshot.unknowns.map(item => object(item) ? item.description : item).filter(nonempty),
      ...(analysis.inputSnapshot.intake?.draft?.unknowns ?? []).filter(nonempty)
    ])];
    const addUnknown = value => { if (!unknowns.includes(value)) unknowns.push(value); };
    const execution = executionRecord ? { adoption: executionRecord.adoption, execution: executionRecord.execution,
      scope: executionRecord.scope, executedAt: executionRecord.executedAt, reportedAt: executionRecord.reportedAt, basis: 'merchant_statement' }
      : { adoption: 'unknown', execution: 'unknown', scope: null, executedAt: null, reportedAt: null, basis: 'unknown' };
    const observation = { status: feedback.observation, rawText: feedback.rawText, reason: detail.reason,
      sampleSize: detail.sampleSize, sampleUnit: detail.sampleUnit, metricBefore: detail.metricBefore, metricAfter: detail.metricAfter,
      guardrailStatus: detail.guardrailStatus, reportedAt: feedback.reportedAt,
      observedWindow: copy(feedback.observedWindow ?? { start: null, end: null }), basis: 'merchant_statement' };
    const requiredSample = positiveInt(plan?.minSample) ? plan.minSample : null;
    const sampleUnitMatchesPlan = ['product_clicks', '次新增商品点击'].includes(plan?.minSampleUnit);
    const sampleMeetsPlan = requiredSample !== null && sampleUnitMatchesPlan && detail.sampleUnit === 'product_clicks' && detail.sampleSize !== null && detail.sampleSize >= requiredSample;
    const eligible = eligibleFirstScreen(analysis, path, facts);
    if (!executionRecord || execution.execution === 'unknown') addUnknown('是否实际执行原方案仍未知，采用意向不能代替执行自述。');
    if (execution.executedAt === null) addUnknown('实际执行日期未知，未用反馈保存时间代填。');
    if (detail.sampleSize === null || detail.sampleUnit === null) addUnknown('新增商品点击样本量或单位未知，未从原漏斗或一句感觉补值。');
    if (detail.metricBefore === null || detail.metricAfter === null) addUnknown('前后指标数值尚未完整提供；无明显变化只按商家自述保留。');
    if (detail.guardrailStatus === 'unknown') addUnknown('退款、投诉及有效点击护栏尚未确认，缺数据不代表风险未触发。');
    if (requiredSample === null) addUnknown('原保存计划缺少可用的最低样本门槛。');
    if (requiredSample !== null && !sampleUnitMatchesPlan) addUnknown('原保存计划的样本单位无法与新增商品点击对应。');
    let decision, reason, nextAction = null;
    if (detail.guardrailStatus === 'triggered') {
      decision = 'pause'; reason = '商家自述护栏已触发，先暂停并核对异常与原版本；不认定由本动作造成，也不自动回滚。';
    } else if (execution.execution !== 'done' || execution.adoption === 'declined') {
      decision = 'needs_information'; reason = '尚没有一致的明确已执行记录；先确认实际改动与执行情况，不用采用、复制或下载代替执行。';
    } else if (feedback.observation === 'worse') {
      decision = 'pause'; reason = '商家自述观察变差，先核对风险和同期变动；这不是行动导致恶化的因果结论。';
    } else if (detail.sampleSize === null || detail.sampleUnit !== 'product_clicks' || requiredSample === null || !sampleUnitMatchesPlan) {
      decision = 'needs_information'; reason = '还缺同口径的新增商品点击样本或原计划门槛；感觉没效果不能判定实验失败。';
    } else if (!sampleMeetsPlan) {
      decision = 'continue_observation'; reason = '新增样本尚未达到原保存计划门槛，保留当前观察，暂不切换验证变量。';
    } else if (feedback.observation === 'unknown') {
      decision = 'needs_information'; reason = '已有样本自述，但主指标变化仍未知；请补充结果，不自动认定无效。';
    } else if (feedback.observation === 'unchanged' && eligible) {
      decision = 'change_variable';
      reason = '商家明确自述首屏已执行，新增商品点击达到原合成计划门槛且自述无明显变化；可提出购买问答区候选，不代表统计充分、因果证明或已科学证实首屏无效。';
      nextAction = {
        status: 'candidate', actionKey: 'juicer_faq', optionLabel: 'A',
        experimentId: 'EXP-JUICER01-click_cart-A-R2', title: '下一轮候选：验证购买问答区',
        singleVariable: '购买问答区',
        action: '先核对真实购买问题和已确认商品资料，再考虑只调整购买问答区；不继续重复本轮首屏改法。',
        keepFixed: copy(plan.keepFixed ?? []), target: copy(plan.target),
        minSample: plan.minSample, minSampleUnit: plan.minSampleUnit,
        constraints, sourceFactIds: copy(plan.sourceFactIds),
        limitations: ['这只是待商家明确接受的候选，没有创建新轮次或记录已执行。',
          '沿用的样本门槛仍是合成实验计划参数，不证明统计充分或经营效果。',
          '不得编造打冰能力、续航次数或未提供的售后承诺；护栏未知时须先核对。']
      };
    } else {
      decision = 'continue_observation';
      reason = eligible ? '保留商家自述的变化与当前观察，不据此自动切换变量或证明建议有效。'
        : '这不是有完整来源证明的首屏首次实验；保留原反馈与限制，本机规则不把旧方案或其他商品强套为购买问答区第二轮。';
    }
    const evidence = {
      sourceFixtureId: analysis.sourceFixtureId ?? null, analysisMode: analysis.mode,
      inputSnapshotAvailable: true, detailsVersion: detail.detailsVersion,
      planSourceFactIds: copy(plan?.sourceFactIds ?? []),
      minimumSample: requiredSample, minimumSampleUnit: plan?.minSampleUnit ?? null,
      sampleMeetsPlan, sampleUnitMatchesPlan, thresholdMeaning: '仅为原保存计划的样本门槛，不是统计充分或因果证明',
      observationMeaning: '商家自述，未独立核验经营效果',
      constraintSources: [
        ...detail.constraintsLearned.map(text => ({ text, source: 'feedback.constraintsLearned', sourceFeedbackId: feedback.id })),
        ...(inferredTitle ? [{ text: inferredTitle, source: 'feedback.rawText', sourceFeedbackId: feedback.id }] : [])
      ]
    };
    const analysisDependency = Object.fromEntries(Object.entries(withoutStatus(analysis)).filter(([key]) => key !== 'paths'));
    const dependencies = { version: VERSION, sessionId: state.sessionId, feedback: copy(feedback),
      execution: executionRecord ? copy(executionRecord) : null, artifact: copy(withoutStatus(artifact)),
      analysis: copy(analysisDependency), path: copy(path), constraints };
    const review = { version: VERSION, sessionId: state.sessionId, roundId: feedback.roundId,
      inputVersion: feedback.inputVersion, analysisId: analysis.id, pathId: path.id,
      artifactId: artifact.id, artifactVersion: artifact.version, sourceFeedbackId: feedback.id,
      sourceExecutionId: executionRecord?.id ?? null, sourceRevision: state.revision,
      fingerprint: 'sha256:' + sha256(canonical(dependencies)), source: 'local_fallback', moneyaiCalled: false,
      decision, reason,
      priorAction: { actionKey: path.actionKey ?? null, title: path.title, action: path.action,
        experimentId: plan?.experimentId ?? null, singleVariable: plan?.change ?? null },
      execution, observation, evidence, unknowns, constraintsLearned, nextAction };
    return { ok: true, review: copy(review) };
  } catch (error) {
    return error instanceof ReviewError ? { ok: false, code: error.code, message: error.message }
      : { ok: false, code: 'review_failed', message: '无法完整核对原实验记录，未生成改判或新轮次。' };
  }
}
