// Pure shared projections. No I/O, model calls, storage or inferred event nesting.
const definitions = [
  ['video_views', '播放', '次播放'],
  ['product_clicks', '商品点击', '次商品点击'],
  ['add_to_carts', '加购', '次加购'],
  ['created_orders', '下单', '笔创建订单'],
  ['paid_orders', '支付', '笔支付订单']
];
const text = (value) => typeof value === 'string' && value.trim().length > 0;
const observation = (fact) => fact && fact.availability === 'known'
  && !['owner_hypothesis', 'unknown'].includes(fact.evidenceStatus)
  && fact.verification !== 'conflicting'
  && ['merchant_statement', 'file_extract'].includes(fact.source?.kind);
function calendarDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value ?? '')) return false;
  const date = new Date(value + 'T00:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function buildFunnelSnapshot(state) {
  const facts = state?.input?.facts ?? [];
  const issues = [];
  const addIssue = (code, description, factIds = []) => issues.push({ code, description, factIds });
  const stages = definitions.map(([key, label, expectedUnit]) => {
    const candidates = facts.filter((fact) => fact.key === key);
    const fact = candidates.length === 1 ? candidates[0] : null;
    let value = null;
    if (!candidates.length) addIssue('missing_value', label + '未提供。');
    else if (candidates.length !== 1) addIssue('ambiguous_value', label + '存在多份记录，不能自动选一份拼接。', candidates.map((item) => item.id));
    else if (!observation(fact)) addIssue('not_observation', label + '为未知、冲突、假设或非本店观测，不能用于转换率。', [fact.id]);
    else if (!Number.isSafeInteger(fact.value) || fact.value < 0) addIssue('invalid_count', label + '不是非负安全整数，不能自动换算成次数或人数。', [fact.id]);
    else value = fact.value;
    if (fact && fact.unit !== expectedUnit) addIssue('unit_unconfirmed', label + '计数单位未与本合成事件链核对。', [fact.id]);
    return {
      key, label, value, unit: fact?.unit ?? null,
      factIds: candidates.map((item) => item.id),
      subject: fact?.subject ?? null, window: fact?.window ? { ...fact.window } : { start: null, end: null },
      channel: fact?.channel ?? null, cohort: fact?.cohort ?? null
    };
  });
  const first = stages[0];
  const sameScope = stages.every((stage) => text(stage.subject) && text(stage.channel) && text(stage.cohort)
    && calendarDate(stage.window.start) && calendarDate(stage.window.end) && stage.window.start <= stage.window.end
    && stage.subject === first.subject && stage.channel === first.channel && stage.cohort === first.cohort
    && stage.window.start === first.window.start && stage.window.end === first.window.end);
  if (!sameScope) addIssue('scope_unconfirmed', '对象、日期、渠道、群体或计数口径缺失／不一致；仅并列展示，不能拼漏斗。', stages.flatMap((stage) => stage.factIds));
  const declaredNesting = state?.fixtureId === 'juicer_cup_v1';
  if (!declaredNesting) addIssue('nesting_unconfirmed', '当前只有显式榨汁杯合成种子声明嵌套事件链；普通资料的口径文字相同不证明嵌套。');
  for (let index = 1; index < stages.length; index++) {
    if (stages[index].value !== null && stages[index - 1].value !== null && stages[index].value > stages[index - 1].value) {
      addIssue('non_nested_counts', stages[index].label + '大于前一阶段，不能按嵌套漏斗解释。', [...stages[index - 1].factIds, ...stages[index].factIds]);
    }
  }
  const comparable = issues.length === 0;
  const transitions = stages.slice(1).map((stage, index) => {
    const previous = stages[index];
    const hasRatio = comparable && previous.value > 0;
    const lossCount = comparable ? previous.value - stage.value : null;
    return {
      fromKey: previous.key, toKey: stage.key,
      factIds: [...previous.factIds, ...stage.factIds],
      numerator: stage.value, denominator: previous.value,
      conversionRate: hasRatio ? stage.value / previous.value : null,
      lossRate: hasRatio ? (previous.value - stage.value) / previous.value : null,
      lossCount,
      calculation: hasRatio ? stage.value + ' / ' + previous.value + '；数量差 = ' + previous.value + ' - ' + stage.value : null,
      reason: hasRatio ? null : comparable ? '分母为0，转换率与流失率不可计算；0是已提供的计数。' : '口径或来源尚不满足计算条件，见质检项。'
    };
  });
  const maximum = (field) => {
    const available = transitions.filter((entry) => entry[field] !== null);
    if (!available.length) return null;
    const winner = available.reduce((best, entry) => entry[field] > best[field] ? entry : best);
    return { fromKey: winner.fromKey, toKey: winner.toKey, value: winner[field] };
  };
  return {
    status: comparable ? 'comparable' : 'unavailable',
    source: declaredNesting ? 'explicit_synthetic_input' : 'current_input',
    nesting: declaredNesting ? 'synthetic_declared' : 'unconfirmed',
    stages, transitions, issues,
    maximumLoss: { byCount: maximum('lossCount'), byRate: maximum('lossRate') },
    limitations: ['阶段值为事件次数或订单笔数，不代表独立用户人数。', '观测转换率不是未来成功概率；最大流失不等于根因或最值得先做的行动。',
      '投流成本、退款与投诉数据仍需分别提供，缺失不等于0或风险未触发。']
  };
}

export function latestAnalysisReview(state) {
  return [...(state?.history ?? [])].reverse().find((entry) => entry.type === 'analysis_review'
    && entry.roundId === state.round.id && entry.inputVersion === state.round.inputVersion) ?? null;
}
export function reviewedAnalysis(state, review) {
  if (!review) return null;
  return [state.analysis, ...(state.history ?? []).map((entry) => entry.analysis)]
    .find((analysis) => analysis?.id === review.analysisId && analysis.roundId === review.roundId
      && analysis.inputVersion === review.inputVersion) ?? null;
}

export function analysisReviewPolicy(state) {
  const reviews = (state?.history ?? []).filter((entry) => entry.type === 'analysis_review'
    && entry.roundId === state.round.id && entry.inputVersion === state.round.inputVersion);
  const blockedActionKeys = new Set(), blockedTitles = new Set();
  let withdrawn = false, unresolved = false;
  for (const review of reviews) {
    if (review.stance === 'disagree') withdrawn = true;
    if (review.stance !== 'not_actionable') continue;
    const analysis = reviewedAnalysis(state, review);
    if (!analysis) { unresolved = true; continue; }
    for (const pathId of review.blockedPathIds) {
      const path = analysis.paths.find((entry) => entry.id === pathId);
      if (!path) { unresolved = true; continue; }
      if (path.actionKey) blockedActionKeys.add(path.actionKey);
      // Older drafts may omit actionKey; retain the reviewed title as a compatibility identity.
      blockedTitles.add(path.title);
    }
  }
  return { reviewIds: reviews.map((review) => review.id), withdrawn, unresolved,
    blockedActionKeys: [...blockedActionKeys], blockedTitles: [...blockedTitles] };
}
export function applyAnalysisReviewPolicy(paths, policy) {
  if (policy.withdrawn || policy.unresolved) return [];
  return paths.filter((path) => !policy.blockedActionKeys.includes(path.actionKey) && !policy.blockedTitles.includes(path.title));
}

export function juicerProductFacts(input) {
  const find = (field, expected) => {
    const candidates = input?.facts?.filter((fact) => fact.intakeField === field) ?? [];
    const fact = candidates.length === 1 ? candidates[0] : null;
    return fact && fact.value === expected && observation(fact) && fact.evidenceStatus === 'confirmed_fact' ? fact : null;
  };
  return {
    capacity: find('confirmedProductFacts.0', '容量为350ml'),
    charging: find('confirmedProductFacts.1', '充电接口为USB-C'),
    shipping: find('confirmedProductFacts.2', '全国包邮'),
    cleaning: find('confirmedProductFacts.3', '清洗方式以商品说明书为准')
  };
}


// PRD V1.0 demo routing, not a platform benchmark or a causal diagnosis.
export function buildDemoBreakpoint(funnel) {
  const edge = funnel?.transitions?.find((item) => item.fromKey === 'product_clicks' && item.toKey === 'add_to_carts');
  const observedRate = funnel?.status === 'comparable' && typeof edge?.conversionRate === 'number'
    && Number.isFinite(edge.conversionRate) ? edge.conversionRate : null;
  const matched = observedRate !== null && observedRate >= 0 && observedRate < 0.08;
  return {
    stage: matched ? 'click_cart' : null,
    fromKey: matched ? 'product_clicks' : null,
    toKey: matched ? 'add_to_carts' : null,
    sourceFactIds: matched ? [...edge.factIds] : [],
    rule: {
      id: 'demo_click_cart_lt_8_v1', kind: 'local_rule', metric: 'click_to_cart_rate',
      operator: 'lt', threshold: 0.08, observedRate, matched,
      description: '8%仅为Demo保守路由规则，不是抖音官方或行业标准，也不能证明信任不足是根因。'
    },
    expert: matched ? { id: 'trust_questions', label: '信任与疑问 Skill', status: 'not_called',
      reason: 'click_cart对应的计划领域专家；本次仅运行本机规则，未实际调用专家或MoneyAI。' } : null,
    reason: matched ? '同口径点击到加购率低于Demo阈值，先验证商品价值、适用边界与购买风险的表达。'
      : observedRate === null ? '当前缺少可比点击到加购率，停止优先断点判断。'
        : '未命中本Demo的点击到加购路由；没有依据时不另造断点或A/B。'
  };
}

export function buildDemoDataQuality(funnel) {
  const issues = funnel?.issues ?? [];
  const completeShape = Array.isArray(funnel?.stages) && funnel.stages.length === 5 && Array.isArray(funnel?.issues);
  const checks = [
    ...(funnel?.stages ?? []).map((stage) => ({ id: stage.key, passed: Number.isSafeInteger(stage.value) && stage.value >= 0 })),
    { id: 'scope', passed: completeShape && !issues.some((item) => item.code === 'scope_unconfirmed') },
    { id: 'unit', passed: completeShape && !issues.some((item) => item.code === 'unit_unconfirmed') },
    { id: 'nesting', passed: funnel?.nesting === 'synthetic_declared' },
    { id: 'order', passed: completeShape && !issues.some((item) => item.code === 'non_nested_counts') }
  ];
  const passed = checks.filter((entry) => entry.passed).length;
  return {
    score: checks.length ? Math.round(passed / checks.length * 100) : 0,
    confidence: funnel?.status === 'comparable' ? 'high' : 'low',
    method: 'local_checks_passed_fraction_v1',
    meaning: '本机检查通过项占比；confidence只表示口径可用程度，不代表数据真实性、根因可信度或成功概率。',
    checks, issues: issues.map((entry) => entry.description)
  };
}
