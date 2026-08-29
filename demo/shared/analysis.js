// Shared deterministic analysis engine (standalone, NOT wired into
// buildDemoAnalysis — the published PRD V1 demo keeps its own generator).
// Consumes the confirmed input facts (including facts parsed from uploaded
// XLSX/CSV/JSON on page one) and builds a demo.v1-valid analysis: five-stage
// funnel when one comparable chain exists, traffic/uptake layer findings for
// ranking snapshots, content-layer findings for video exports, and a generic
// record-keeping fallback. Everything is a hypothesis to verify — never a
// proven root cause. No model is called; mode stays local/demo.

const errorResult = (code, message) => ({ ok: false, code, message });
const valid = (state) => state?.input?.confirmedVersion === state?.round?.inputVersion;
const availableFact = (state, key) => state.input.facts.find((fact) => fact.key === key && fact.availability === 'known');
const numberFact = (fact) => fact && fact.availability === 'known' && typeof fact.value === 'number' && Number.isFinite(fact.value) ? fact : null;
const caliber = (fact) => JSON.stringify([fact.subject ?? null, fact.channel ?? null, fact.cohort ?? null, fact.window?.start ?? null, fact.window?.end ?? null]);
const sameWindow = (left, right) => JSON.stringify(left.window) === JSON.stringify(right.window);
const percent = (rate) => {
  const value = rate * 100;
  return (value >= 1 ? value.toFixed(2) : value.toFixed(3)).replace(/\.?0+$/, '') + '%';
};
const compact = (value) => value >= 100000000 ? (value / 100000000).toFixed(2).replace(/\.?0+$/, '') + '亿'
  : value >= 10000 ? (value / 10000).toFixed(2).replace(/\.?0+$/, '') + '万' : String(Math.round(value * 100) / 100);

// 头部账号的粉看比天然偏低，横向对比只对同类规模有意义；这是本机处理规则，
// 不是行业结论。超过该粉丝量的账号不参与粉看比参照带，也不据此判定断点。
const HEAD_ACCOUNT_FOLLOWERS = 1_000_000;

const STAGES = [
  { key: 'video_views', label: '播放' },
  { key: 'product_clicks', label: '商品点击' },
  { key: 'add_to_carts', label: '加购' },
  { key: 'created_orders', label: '创建订单' },
  { key: 'paid_orders', label: '支付' }
];

const STAGE_ACTIONS = [
  { title: '先改进内容的开头承接', action: '核对近几条内容的前几秒是否直接呼应标题承诺，只改开头这一个变量，其余保持不变，再对比播放到点击的变化。' },
  { title: '先补全商品页的承接信息', action: '核对商品页首屏是否说清利益点、规格和顾客高频疑问，补全这一段信息后保持其他条件不变，再对比点击到加购的变化。' },
  { title: '先减少下单环节的犹豫', action: '核对加购到下单之间的价格说明、套装与运费信息是否清楚，补全说明后保持其他条件不变，再对比加购到下单的变化。' },
  { title: '先排查支付环节的阻力', action: '核对创建订单到支付之间的支付方式、订单保留时长和支付提醒是否正常，处理异常后保持其他条件不变，再对比变化。' }
];

export function buildLocalAnalysis(state) {
  if (!valid(state)) return errorResult('invalid_transition', '请先确认这轮问题和材料。');
  try {
    let number = 0;
    const id = () => 'draft_' + (++number);
    const mode = state.fixtureId ? 'demo_fixture' : 'local_limited';
    const facts = state.input.facts;
    const limitations = ['本结果由本机规则生成，不是外部 AI 或真实模型分析。', '观察到的订单变化不能直接归因于建议。'];
    const materialsPending = state.input.materials.filter((material) => material.status !== 'parsed');
    if (materialsPending.length) limitations.push('有' + materialsPending.length + '份材料尚未完成解析或核对，当前判断不代表已经读懂全部附件。');
    if (state.input.unknowns.length) limitations.push('仍有' + state.input.unknowns.length + '项重要信息未知。');

    const hasSpecs = ['price', 'units_per_order', 'external_length', 'external_width', 'external_height'].every((key) => availableFact(state, key));
    const completeDemo = state.fixtureId === 'underbed_complete_v1' && hasSpecs;
    if (completeDemo) return legacyCompleteDemo({ state, id, mode, facts, limitations });
    if (state.fixtureId && state.fixtureId !== 'juicer_cup_v1') return legacyGeneric({ state, id, mode, facts, limitations });

    const condition = (text, factIds = [], assumptionIds = []) => ({ text, sourceFactIds: factIds, assumptionIds });
    const findings = { funnel: null, traffic: [], uptake: [], content: null, priority: null };
    const pathPlans = [];

    const funnel = analyzeFunnel(facts);
    findings.funnel = funnel.summary;
    const traffic = analyzeTraffic(facts);
    findings.traffic = traffic.findings;
    const uptake = analyzeUptake(facts);
    findings.uptake = uptake.findings;
    const content = analyzeContent(state);
    findings.content = content;

    if (funnel.chain && funnel.priority) {
      const stage = funnel.priority;
      const plan = STAGE_ACTIONS[stage.index];
      const target = { metric: STAGES[stage.index + 1].key, unit: stage.toFact.unit ?? null };
      limitations.push('五阶段只在同一对象、渠道、群体口径和时间窗口内计算；入口流失包含流量规模与自然兴趣因素，不能只凭排序断定原因。');
      limitations.push('“本轮优先验证”与数值上流失最大的环节分开说明；优先不等于已证明的根因。');
      pathPlans.push({
        title: plan.title, action: plan.action, sourceFactIds: stage.factIds, target,
        evidence: '同一口径下' + stage.fromLabel + '→' + stage.toLabel + '约为' + percent(stage.rate) + '，流失约' + compact(stage.lossCount) + '；' +
          (funnel.maxLoss.index === stage.index ? '它也是当前数值上流失最大的环节。' : '数值上流失最大的是' + funnel.maxLoss.fromLabel + '→' + funnel.maxLoss.toLabel + '（流失约' + percent(funnel.maxLoss.lossRate) + '，约' + compact(funnel.maxLoss.lossCount) + '），两者分开记录。')
      });
      if (funnel.maxLoss.index !== stage.index) {
        const maxPlan = STAGE_ACTIONS[funnel.maxLoss.index];
        pathPlans.push({
          title: maxPlan.title, action: maxPlan.action, sourceFactIds: funnel.maxLoss.factIds,
          target: { metric: STAGES[funnel.maxLoss.index + 1].key, unit: funnel.maxLoss.toFact.unit ?? null },
          evidence: '这是数值上流失最大的环节：' + funnel.maxLoss.fromLabel + '→' + funnel.maxLoss.toLabel + '流失约' + percent(funnel.maxLoss.lossRate) + '（约' + compact(funnel.maxLoss.lossCount) + '）；先记录观察，不与优先路径同时改动。'
        });
      }
      findings.priority = {
        question: '同口径漏斗中，“' + stage.fromLabel + '→' + stage.toLabel + '”是否是当前最值得先改的环节？',
        hypothesis: '改进“' + stage.toLabel + '”环节的承接后，该环节转化率会高于当前观察值' + percent(stage.rate) + '。',
        basis: '同一口径下逐环节计算；优先环节的选择同时说明了入口流失的局限。',
        sourceFactIds: stage.factIds
      };
    }
    for (const candidate of traffic.anomalies) {
      pathPlans.push({
        title: '先核对流量的异常来源', action: '针对' + candidate.subject + '：核对最近一场直播的限流状态、开播提醒、开播时段和账号标签设置，并把核对结果记录下来；先不改内容和货盘。',
        sourceFactIds: candidate.factIds, target: { metric: 'live_viewers', unit: '人次' },
        evidence: candidate.reason
      });
    }
    for (const candidate of uptake.anomalies) {
      pathPlans.push({
        title: '先做货盘与承接的核对', action: '针对' + candidate.subject + '：核对在售货盘深度和排品逻辑，记录观看、点击和成交的逐环节人数；补齐口径后再比较变化。',
        sourceFactIds: candidate.factIds, target: { metric: 'live_product_count', unit: '个' },
        evidence: candidate.reason
      });
    }
    if (!funnel.chain && !traffic.anomalies.length && content.summary) {
      pathPlans.push({
        title: '先补齐流量与成交口径数据', action: '导出或补记带播放口径的作品数据，并记录挂车商品与成交件数；把同一窗口、同一对象的口径补齐后再判断。',
        sourceFactIds: content.factIds, target: { metric: 'video_views', unit: '次' },
        evidence: content.summary
      });
    }
    if (!pathPlans.length) return legacyGeneric({ state, id, mode, facts, limitations });

    const mergedPlans = new Map();
    for (const plan of pathPlans) {
      if (!mergedPlans.has(plan.title)) {
        mergedPlans.set(plan.title, { ...plan, sourceFactIds: [...new Set(plan.sourceFactIds || [])] });
      } else {
        const entry = mergedPlans.get(plan.title);
        entry.sourceFactIds = [...new Set([...entry.sourceFactIds, ...(plan.sourceFactIds || [])])].slice(0, 8);
        entry.evidence += '另外，' + plan.evidence;
      }
    }
    const uniquePlans = [...mergedPlans.values()].slice(0, 3);
    const summaryParts = [];
    if (funnel.chain) summaryParts.push('本轮按同一口径计算了五阶段漏斗，优先验证“' + funnel.priority.fromLabel + '→' + funnel.priority.toLabel + '”。');
    if (traffic.anomalies.length) summaryParts.push(traffic.anomalies.map((entry) => entry.subject).join('、') + '的单场观看明显低于同规模参照，属于流量层待验证线索。');
    if (uptake.anomalies.length) summaryParts.push(uptake.anomalies.map((entry) => entry.subject).join('、') + '的货盘深度明显低于同表参照，属于承接层待验证线索。');
    if (content.summary) summaryParts.push(content.summary);
    summaryParts.push('以上都是待验证的判断，不是已证实的根因；可以从中选一条先做。');
    if (state.fixtureId === 'juicer_cup_v1') {
      limitations.push('榨汁杯为合成首次资料；执行稿与专用A/B问答内容仍由第三页共享生成，本页只做本机核对判断。');
    }

    const paths = uniquePlans.map((plan) => buildPath({ id, plan, condition }));
    return {
      ok: true,
      analysis: {
        id: null, savedAt: null, roundId: state.round.id, inputVersion: state.round.inputVersion,
        status: funnel.chain ? 'ready' : 'limited', mode,
        summary: summaryParts.join(''), paths, limitations, findings
      }
    };
  } catch {
    return errorResult('generation_failed', '本地参考生成失败，未套用旧答案。');
  }
}

function analyzeFunnel(facts) {
  const stageFacts = STAGES.map(({ key }) => (facts || []).filter((fact) => fact.key === key && numberFact(fact)));
  const groups = stageFacts.map((entries) => {
    const byCaliber = new Map();
    for (const fact of entries) {
      const signature = caliber(fact);
      if (!byCaliber.has(signature)) byCaliber.set(signature, []);
      byCaliber.get(signature).push(fact);
    }
    return byCaliber;
  });
  let chain = null;
  for (const [signature, entries] of groups[0]) {
    if (entries.length !== 1) continue;
    const line = [entries[0]];
    for (let index = 1; index < STAGES.length; index += 1) {
      const next = groups[index].get(signature);
      if (!next || next.length !== 1) break;
      line.push(next[0]);
    }
    const complete = line.length === STAGES.length && line.every((fact) => fact.window?.start && fact.window?.end);
    if (complete) { chain = line; break; }
  }
  if (!chain) {
    const partial = stageFacts.filter((entries) => entries.length).length;
    return { chain: null, priority: null, maxLoss: null,
      summary: { comparable: false, knownStages: partial,
        note: partial ? '存在分阶段数值，但对象、渠道、口径或时间窗口不一致，未拼成同一漏斗。' : '没有可用的分阶段数值。' } };
  }
  const steps = [];
  for (let index = 0; index < chain.length - 1; index += 1) {
    const from = chain[index], to = chain[index + 1];
    const rate = from.value > 0 ? to.value / from.value : null;
    steps.push({
      index, fromLabel: STAGES[index].label, toLabel: STAGES[index + 1].label,
      fromFact: from, toFact: to, rate,
      lossRate: rate === null ? null : 1 - rate,
      lossCount: rate === null ? null : from.value - to.value,
      factIds: [from.id, to.id]
    });
  }
  const computable = steps.filter((step) => step.rate !== null);
  const maxLoss = computable.reduce((worst, step) => (!worst || step.lossRate > worst.lossRate ? step : worst), null);
  let priority = maxLoss;
  let priorityNote = null;
  if (maxLoss && maxLoss.index === 0 && maxLoss.rate <= 0.1 && computable.length > 1) {
    // 入口流失常包含流量规模与自然兴趣因素；同为高流失的后段改法对象更明确，
    // 优先验证后段，并把两者分开记录。这是处理规则，不是因果结论。
    priority = computable.reduce((worst, step) => (step.index === 0 ? worst : (!worst || step.lossRate > worst.lossRate ? step : worst)), null);
    priorityNote = '入口流失包含流量规模与自然兴趣因素，口径未知；优先选择改法对象更明确的“' + priority.fromLabel + '→' + priority.toLabel + '”环节。';
  }
  return {
    chain, steps, maxLoss, priority,
    summary: {
      comparable: true,
      window: { start: chain[0].window.start, end: chain[0].window.end },
      subject: chain[0].subject, channel: chain[0].channel, cohort: chain[0].cohort,
      steps: steps.map((step) => ({ from: step.fromLabel, to: step.toLabel, fromValue: step.fromFact.value,
        toValue: step.toFact.value, rate: step.rate, lossRate: step.lossRate, lossCount: step.lossCount })),
      maxLoss: maxLoss ? { from: maxLoss.fromLabel, to: maxLoss.toLabel, lossRate: maxLoss.lossRate } : null,
      priorityNote
    }
  };
}

// 粉看比等跨口径比值只在“同一份榜单快照内相对比较”时有意义，全部标注为待
// 验证线索；不把第三方估算当作审计数据，也不给绝对的健康阈值。
function subjectFacts(facts, key) {
  const bySubject = new Map();
  for (const fact of facts || []) {
    if (fact.key !== key || !numberFact(fact) || !fact.subject) continue;
    bySubject.set(fact.subject, fact);
  }
  return bySubject;
}
const median = (values) => { const sorted = [...values].sort((a, b) => a - b); const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2; };

function analyzeTraffic(facts) {
  const followers = subjectFacts(facts, 'followers');
  const viewers = subjectFacts(facts, 'live_viewers');
  const averages = subjectFacts(facts, 'avg_live_viewers');
  const findings = [], anomalies = [];
  const subjects = [...followers.keys()].filter((subject) => viewers.has(subject));
  const comparable = subjects.filter((subject) => followers.get(subject).value <= HEAD_ACCOUNT_FOLLOWERS);
  const ratios = comparable.map((subject) => ({ subject, ratio: viewers.get(subject).value / followers.get(subject).value }));
  const bandMiddle = ratios.length >= 3 ? median(ratios.map((entry) => entry.ratio)) : null;
  for (const subject of subjects) {
    const ratio = viewers.get(subject).value / followers.get(subject).value;
    const headAccount = followers.get(subject).value > HEAD_ACCOUNT_FOLLOWERS;
    const entry = { subject, followers: followers.get(subject).value, viewers: viewers.get(subject).value, ratio,
      headAccount, note: null };
    const average = averages.get(subject);
    if (average && numberFact(average) && average.value >= viewers.get(subject).value * 10) {
      entry.note = '同账号近30天场均场观约' + compact(average.value) + '，远高于这一单场记录；两榜口径不同源，仅作线索。';
    }
    if (headAccount) {
      // 头部账号粉看比天然偏低，只记录数值，不参与参照带与断点判定。
      entry.judgment = 'head_account';
    } else if (bandMiddle && ratio < bandMiddle / 10) {
      entry.judgment = 'traffic_gap';
      anomalies.push({
        subject, factIds: [followers.get(subject).id, viewers.get(subject).id],
        reason: subject + '：单场观看' + compact(viewers.get(subject).value) + ' ÷ 粉丝' + compact(followers.get(subject).value) +
          ' ≈ ' + percent(ratio) + '，明显低于同表同类账号的中位水平（约' + percent(bandMiddle) + '）；这是待验证线索，不是已证实的限流结论。' + (entry.note || '')
      });
    } else {
      entry.judgment = 'within_band';
    }
    findings.push(entry);
  }
  return { findings, anomalies };
}

function analyzeUptake(facts) {
  const counts = subjectFacts(facts, 'live_product_count');
  const findings = [], anomalies = [];
  const subjects = [...counts.keys()];
  if (subjects.length >= 3) {
    const middle = median(subjects.map((subject) => counts.get(subject).value));
    for (const subject of subjects) {
      const value = counts.get(subject).value;
      const entry = { subject, productCount: value, bandMedian: middle };
      if (value < middle / 2) {
        entry.judgment = 'shallow';
        anomalies.push({
          subject, factIds: [counts.get(subject).id],
          reason: subject + '：单场货盘仅' + value + '个商品，低于同表中位水平（约' + Math.round(middle) + '个）；观看规模不缺时，承接选择少是待验证的转化层线索，不是已证实的结论。'
        });
      } else entry.judgment = 'within_band';
      findings.push(entry);
    }
  }
  return { findings, anomalies };
}

function analyzeContent(state) {
  const engagement = ['likes', 'comments', 'collects', 'shares'].flatMap((key) => (state.input.facts || [])
    .filter((fact) => fact.key === key && numberFact(fact)));
  if (!engagement.length) return { summary: null, factIds: [] };
  const gapFact = (state.input.facts || []).find((fact) => fact.key === 'video_views' && fact.availability === 'unknown');
  const subjects = new Set(engagement.map((fact) => fact.subject));
  const perVideo = [...subjects].length > 1;
  const summary = '已读取' + (perVideo ? subjects.size + '条作品的' : '') + '互动数据（点赞、评论、收藏或分享）；' +
    (gapFact ? '播放量整列疑似采集缺失，流量侧是否异常暂时无法判断，不当真实0。' : '缺少同口径的播放与成交数据，流量侧暂不能判断。');
  return { summary, factIds: engagement.slice(0, 12).map((fact) => fact.id).concat(gapFact ? [gapFact.id] : []) };
}

// Assembles a demo.v1-valid path around an evidence plan. Estimates stay
// unavailable here: this engine does not attach fabricated scenario numbers to
// real uploads — observed rates are quoted in the evidence text instead.
function buildPath({ id, plan, condition }) {
  const factIds = [...new Set(plan.sourceFactIds || [])];
  return {
    id: id(), title: plan.title, action: plan.action,
    prerequisites: [{ ...condition('先核对本路径引用的资料与未知项', factIds), status: 'unknown' }],
    cost: {
      money: { value: null, unit: 'CNY', basis: 'unknown', sourceFactIds: [], note: '未提供预算依据；不新增投流，机会成本未知' },
      time: { value: null, unit: 'minute', basis: 'unknown', sourceFactIds: [], note: '可用时间是限制，不是任务耗时保证' }
    },
    risk: [{
      id: id(), description: '把待验证线索当成已证实原因，或同时改动多个变量，会让结果无法比较。',
      trigger: condition('发现把本路径结论表述为已证明的根因，或同时引入其他改动', factIds),
      stop: condition('先暂停改动，回到单一变量并补齐口径'),
      restore: condition('由商家核对原始表述后决定是否恢复'), sourceFactIds: factIds, assumptionIds: []
    }],
    evidenceRefs: factIds.length ? [{ id: id(), kind: 'observation', factIds, sourceIds: factIds.map((factId) => 'fact:' + factId), summary: plan.evidence, calculation: null }]
      : [{ id: id(), kind: 'inference', factIds: [], sourceIds: ['input:focus'], summary: plan.evidence, calculation: null }],
    counterEvidence: [{ id: id(), kind: 'inference', factIds: [], sourceIds: ['input:focus'], summary: '时段、流量结构、价格、履约与商品吸引力等因素同样可能影响结果；本路径一次只验证一个变量，不构成因果证明。', calculation: null }],
    estimate: {
      kind: 'unavailable',
      target: { metric: plan.target?.metric ?? null, unit: plan.target?.unit ?? null, subject: null, channel: null, cohort: null },
      horizon: { description: '观察期需结合实际流量确定', start: null, end: null },
      assumptions: [], calculation: null, values: [],
      limitations: ['没有足够依据估计真实结果或成功概率；观察到的变化先按记录处理。'],
      incrementalEffect: { kind: 'unavailable', reason: '无法估计行动增量' }
    },
    experiment: {
      change: plan.action, keepFixed: ['不同时新增投流或改价，以便保留比较线索'],
      target: { metric: plan.target?.metric ?? null, unit: plan.target?.unit ?? null, subject: null, channel: null, cohort: null },
      window: { description: '观察期需结合实际流量确定', start: null, end: null },
      minSample: null, sourceFactIds: factIds, assumptionIds: [], limitations: ['最低样本和观察期尚未确定，不预设固定达标阈值。'],
      stopConditions: [condition('出现不实承诺或明显风险时先暂停核对')],
      restoreConditions: [condition('有可核对的原版本且商家明确决定恢复')]
    },
    tree: buildTree({ id, condition })
  };
}

function legacyCompleteDemo({ state, id, mode, facts, limitations }) {
  const availableFact = (key) => state.input.facts.find((fact) => fact.key === key && fact.availability === 'known');
  const detail = availableFact('product_detail_visitors');
  const paid = availableFact('paid_orders');
  const comparable = detail && paid && detail.subject === paid.subject && detail.channel === paid.channel && detail.cohort === paid.cohort && sameWindow(detail, paid) && detail.window?.start && detail.window?.end;
  if (!comparable) limitations.push('数据缺少可比口径，不能计算成交漏斗或确定根因。');
  if (state.input.materials.some((material) => material.status !== 'parsed')) limitations.push('有材料尚未提取或核对，当前路径不能代表已经读懂全部附件。');
  if (state.input.unknowns.length) limitations.push('仍有' + state.input.unknowns.length + '项重要信息未知。');
  const condition = (text, factIds = [], assumptionIds = []) => ({ text, sourceFactIds: factIds, assumptionIds });
  const tree = buildTree({ id, condition });
  const path = (title, action, factKeys) => {
    const supporting = facts.filter((fact) => factKeys.includes(fact.key));
    const factIds = supporting.map((fact) => fact.id);
    return {
      id: id(), title, action,
      prerequisites: [{ ...condition('先核对本路径引用的资料与未知项', factIds), status: 'unknown' }],
      cost: {
        money: { value: null, unit: 'CNY', basis: 'unknown', sourceFactIds: [], note: '不新增投流；机会成本与其他损失仍未知' },
        time: { value: null, unit: 'minute', basis: 'unknown', sourceFactIds: [], note: '可用时间是限制，不是任务耗时保证' }
      },
      risk: [{
        id: id(), description: '错误规格或未经核对的承诺可能增加误解与售后。',
        trigger: condition('发现规格、价格或履约说法与实际不符', factIds),
        stop: condition('先暂停使用有争议的文字，不继续扩大承诺'),
        restore: condition('由商家核对原说明后决定是否恢复'), sourceFactIds: factIds, assumptionIds: []
      }],
      evidenceRefs: supporting.length ? [{ id: id(), kind: 'observation', factIds, sourceIds: factIds.map((factId) => 'fact:' + factId), summary: '使用当前资料中的相关记录；来源和原值可展开核对。', calculation: null }]
        : [{ id: id(), kind: 'inference', factIds: [], sourceIds: ['input:description'], summary: '资料不足，先收集一份可比记录是有限参考，不是根因判断。', calculation: null }],
      counterEvidence: [{ id: id(), kind: 'inference', factIds: [], sourceIds: ['input:focus'], summary: '流量质量、商品吸引力、价格、履约等仍可能影响结果；不能由少量咨询确定唯一原因。', calculation: null }],
      estimate: completeScenario({ id, state, detail, comparable }),
      experiment: {
        change: action, keepFixed: ['不同时新增投流或改价，以便保留比较线索'],
        target: { metric: 'paid_orders', unit: '笔', subject: detail?.subject ?? null, channel: detail?.channel ?? null, cohort: detail?.cohort ?? null },
        window: { description: '观察期需结合实际流量确定', start: null, end: null },
        minSample: null, sourceFactIds: factIds, assumptionIds: [], limitations: ['最低样本和观察期尚未确定，不预设固定达标阈值。'],
        stopConditions: [condition('出现不实承诺或明显风险时先暂停核对')],
        restoreConditions: [condition('有可核对的原版本且商家明确决定恢复')]
      },
      tree: buildTree({ id, condition })
    };
  };
  const paths = [
    path('把尺寸和套装说明写清楚', '先核对外尺寸、套装数量和价格，再只改商品说明中的这一段。', ['price', 'units_per_order', 'external_length', 'external_width', 'external_height', 'dimension_scope', 'current_title', 'current_opening', 'selected_inquiries']),
    path('先统一尺寸咨询回复', '先使用一份不保证适配的测量与核对回复，记录顾客仍不清楚的地方。', ['external_length', 'external_width', 'external_height', 'dimension_scope', 'selected_inquiries'])
  ];
  const summary = '先把顾客反复问到的信息说清楚，是当前可以比较的两种小动作；它们不是已证实的成交原因。';
  return { ok: true, analysis: { id: null, savedAt: null, roundId: state.round.id, inputVersion: state.round.inputVersion, status: 'ready', mode, summary, paths, limitations, findings: null } };
}

function completeScenario({ id, state, detail, comparable }) {
  const hasSpecs = ['price', 'units_per_order', 'external_length', 'external_width', 'external_height'].every((key) => availableFact(state, key));
  const result = {
    kind: 'unavailable',
    target: { metric: 'paid_orders', unit: '笔', subject: detail?.subject ?? null, channel: detail?.channel ?? null, cohort: detail?.cohort ?? null },
    horizon: { description: '观察期尚未确定', start: null, end: null },
    assumptions: [], calculation: null, values: [],
    limitations: ['没有足够依据估计真实结果或成功概率。'],
    incrementalEffect: { kind: 'unavailable', reason: '无法估计行动增量' }
  };
  if (state.fixtureId === 'underbed_complete_v1' && hasSpecs && comparable) {
    const visitors = { id: id(), label: '假设可比访客', value: 100, unit: '人', sourceFactIds: [], note: '合成演示条件，不是未来流量预测' };
    const rates = [0, 0.01, 0.02].map((value) => ({ id: id(), label: '假设支付率 ' + value * 100 + '%', value, unit: '比例', sourceFactIds: [], note: '合成演示参数，不是本店测得或模型成功概率' }));
    result.kind = 'scenario';
    result.horizon.description = '假设未来100名口径相同的访客';
    result.assumptions = [visitors, ...rates];
    result.calculation = { method: 'visitors_times_rate', displayFormula: '期望订单 = 可比访客 × 假设支付率' };
    result.values = rates.map((rate) => ({ id: id(), label: rate.label, visitorAssumptionId: visitors.id, rateAssumptionId: rate.id, value: visitors.value * rate.value }));
    result.limitations = ['0/1/2笔是不同假设下的期望，不是实际结果必在0—2笔。', '同一组条件用于说明算式，不能作为路径效果排名或行动增量。'];
  }
  return result;
}

function buildTree({ id, condition }) {
  const root = { id: id(), kind: 'decision', title: '执行后，依据什么决定下一步？', detail: '先检查风险，再判断是否执行、资料是否可比；未知不当作失败。' };
  const choices = [
    ['not_executed', '明确反馈尚未执行', '先保留这份计划', '尚未执行不能判断方案有效或失败。'],
    ['insufficient_evidence', '未反馈，或执行范围/口径/样本仍不清楚', '补记最少的观察信息', '保持未知，不追加一长串必答问题。'],
    ['risk_triggered', '已经执行且出现承诺、成本或误导风险；优先处理', '暂停相关变更并核对', '先核实风险及可恢复的原说明，不自动回滚或宣称已回滚。'],
    ['comparable_positive', '已执行、未触发风险，且可比记录出现改善', '保留观察，继续记录', '改善是观察结果，不是已经证明行动导致改善。'],
    ['comparable_unchanged', '已执行、未触发风险，且可比记录无明显变化', '保持其他因素不变再观察', '样本要求与观察期未知时，不直接判无效。'],
    ['comparable_negative', '已执行、未触发风险，且可比记录变差', '核对差异与停止条件', '检查同期变化；是否恢复旧文案由商家决定。']
  ];
  const nodes = [root], edges = [];
  for (const [branch, text, title, detailText] of choices) {
    const node = { id: id(), kind: 'next_step', title, detail: detailText };
    nodes.push(node);
    edges.push({ id: id(), from: root.id, to: node.id, branch, condition: condition(text) });
  }
  return { rootId: root.id, nodes, edges, notApplicableBranches: [] };
}

function legacyGeneric({ state, id, mode, facts, limitations }) {
  const availableFact = (key) => state.input.facts.find((fact) => fact.key === key && fact.availability === 'known');
  const condition = (text, factIds = [], assumptionIds = []) => ({ text, sourceFactIds: factIds, assumptionIds });
  const lastFeedback = state.feedbackRecords.at(-1);
  let summary = '现有资料不足以判断唯一原因，先给出一个可以执行的核对步骤。';
  if (state.fixtureId === 'juicer_cup_v1') summary = '榨汁杯仅载入首次合成资料；先给一个可以执行的核对步骤。';
  if (lastFeedback) summary += ' 本轮读取了已保存的本地反馈；执行与观察仍按原自述保留，不代表外部服务已读取历史。';
  const detail = availableFact('product_detail_visitors');
  const paid = availableFact('paid_orders');
  const scenario = completeScenario({ id, state, detail, comparable: false });
  const factIds = facts.filter((fact) => ['product_detail_visitors', 'paid_orders'].includes(fact.key)).map((fact) => fact.id);
  const path = {
    id: id(), title: '先留一份可核对的记录', action: '选择同一商品、同一渠道和同一时间窗口的一份现有记录，保留原值与出处，再比较变化。',
    prerequisites: [{ ...condition('先核对本路径引用的资料与未知项', factIds), status: 'unknown' }],
    cost: {
      money: { value: null, unit: 'CNY', basis: 'unknown', sourceFactIds: [], note: '不新增投流；机会成本与其他损失仍未知' },
      time: { value: null, unit: 'minute', basis: 'unknown', sourceFactIds: [], note: '可用时间是限制，不是任务耗时保证' }
    },
    risk: [{
      id: id(), description: '错误规格或未经核对的承诺可能增加误解与售后。',
      trigger: condition('发现规格、价格或履约说法与实际不符', factIds),
      stop: condition('先暂停使用有争议的文字，不继续扩大承诺'),
      restore: condition('由商家核对原说明后决定是否恢复'), sourceFactIds: factIds, assumptionIds: []
    }],
    evidenceRefs: factIds.length ? [{ id: id(), kind: 'observation', factIds, sourceIds: factIds.map((factId) => 'fact:' + factId), summary: '使用当前资料中的相关记录；来源和原值可展开核对。', calculation: null }]
      : [{ id: id(), kind: 'inference', factIds: [], sourceIds: ['input:description'], summary: '资料不足，先收集一份可比记录是有限参考，不是根因判断。', calculation: null }],
    counterEvidence: [{ id: id(), kind: 'inference', factIds: [], sourceIds: ['input:focus'], summary: '流量质量、商品吸引力、价格、履约等仍可能影响结果；不能由少量咨询确定唯一原因。', calculation: null }],
    estimate: scenario,
    experiment: {
      change: '保留同一口径的记录并比较变化', keepFixed: ['不同时新增投流或改价，以便保留比较线索'],
      target: scenario.target, window: { description: '观察期需结合实际流量确定', start: null, end: null },
      minSample: null, sourceFactIds: factIds, assumptionIds: [], limitations: ['最低样本和观察期尚未确定，不预设固定达标阈值。'],
      stopConditions: [condition('出现不实承诺或明显风险时先暂停核对')],
      restoreConditions: [condition('有可核对的原版本且商家明确决定恢复')]
    },
    tree: buildTree({ id, condition })
  };
  return { ok: true, analysis: { id: null, savedAt: null, roundId: state.round.id, inputVersion: state.round.inputVersion, status: 'limited', mode, summary, paths: [path], limitations, findings: null } };
}
