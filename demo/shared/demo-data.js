const errorResult = (code, message) => ({ ok: false, code, message });
const valid = (state) => state?.input?.confirmedVersion === state?.round?.inputVersion;
const availableFact = (state, key) => state.input.facts.find((fact) => fact.key === key && fact.availability === 'known');

export function buildDemoAnalysis(state) {
  if (!valid(state)) return errorResult('invalid_transition', '请先确认这轮问题和材料。');
  try {
    let number = 0;
    const id = () => 'draft_' + (++number);
    const mode = state.fixtureId ? 'demo_fixture' : 'local_limited';
    const facts = state.input.facts;
    const detail = availableFact(state, 'product_detail_visitors');
    const paid = availableFact(state, 'paid_orders');
    const comparable = detail && paid && detail.subject === paid.subject && detail.channel === paid.channel && detail.cohort === paid.cohort && JSON.stringify(detail.window) === JSON.stringify(paid.window) && detail.window?.start && detail.window?.end;
    const hasSpecs = ['price', 'units_per_order', 'external_length', 'external_width', 'external_height'].every((key) => availableFact(state, key));
    const completeDemo = state.fixtureId === 'underbed_complete_v1' && hasSpecs;
    const limitations = ['本结果由本地规则生成，不是MoneyAI或真实模型分析。', '观察到的订单变化不能直接归因于建议。'];
    if (!comparable) limitations.push('数据缺少可比口径，不能计算成交漏斗或确定根因。');
    if (state.fixtureId === 'juicer_cup_v1') limitations.push('榨汁杯仅载入首次合成资料；五阶段判断、专用A/B路径与执行稿仍待共享后续交付，当前只给本机核对步骤。');
    if (state.input.materials.some((material) => material.status !== 'parsed')) limitations.push('有材料尚未提取或核对，当前路径不能代表已经读懂全部附件。');
    if (state.input.unknowns.length) limitations.push('仍有' + state.input.unknowns.length + '项重要信息未知。');
    const condition = (text, factIds = [], assumptionIds = []) => ({ text, sourceFactIds: factIds, assumptionIds });
    function tree() {
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
    function estimate() {
      const result = {
        kind: 'unavailable',
        target: { metric: 'paid_orders', unit: '笔', subject: detail?.subject ?? null, channel: detail?.channel ?? null, cohort: detail?.cohort ?? null },
        horizon: { description: '观察期尚未确定', start: null, end: null },
        assumptions: [], calculation: null, values: [],
        limitations: ['没有足够依据估计真实结果或成功概率。'],
        incrementalEffect: { kind: 'unavailable', reason: '无法估计行动增量' }
      };
      if (completeDemo && comparable) {
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
    function path(title, action, factKeys) {
      const supporting = facts.filter((fact) => factKeys.includes(fact.key));
      const factIds = supporting.map((fact) => fact.id);
      const scenario = estimate();
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
        estimate: scenario,
        experiment: {
          change: action, keepFixed: ['不同时新增投流或改价，以便保留比较线索'],
          target: scenario.target, window: { description: '观察期需结合实际流量确定', start: null, end: null },
          minSample: null, sourceFactIds: factIds, assumptionIds: [], limitations: ['最低样本和观察期尚未确定，不预设固定达标阈值。'],
          stopConditions: [condition('出现不实承诺或明显风险时先暂停核对')],
          restoreConditions: [condition('有可核对的原版本且商家明确决定恢复')]
        },
        tree: tree()
      };
    }
    const paths = completeDemo
      ? [
        path('把尺寸和套装说明写清楚', '先核对外尺寸、套装数量和价格，再只改商品说明中的这一段。', ['price', 'units_per_order', 'external_length', 'external_width', 'external_height', 'dimension_scope', 'current_title', 'current_opening', 'selected_inquiries']),
        path('先统一尺寸咨询回复', '先使用一份不保证适配的测量与核对回复，记录顾客仍不清楚的地方。', ['external_length', 'external_width', 'external_height', 'dimension_scope', 'selected_inquiries'])
      ]
      : [path('先留一份可核对的记录', '选择同一商品、同一渠道和同一时间窗口的一份现有记录，保留原值与出处，再比较变化。', ['product_detail_visitors', 'paid_orders'])];
    const lastFeedback = state.feedbackRecords.at(-1);
    let summary = completeDemo ? '先把顾客反复问到的信息说清楚，是当前可以比较的两种小动作；它们不是已证实的成交原因。' : '现有资料不足以判断唯一原因，先给出一个可以执行的核对步骤。';
    if (lastFeedback) summary += ' 本轮读取了已保存的本地反馈；执行与观察仍按原自述保留，不代表MoneyAI已读取历史。';
    return { ok: true, analysis: { id: null, savedAt: null, roundId: state.round.id, inputVersion: state.round.inputVersion, status: completeDemo ? 'ready' : 'limited', mode, summary, paths, limitations } };
  } catch {
    return errorResult('generation_failed', '本地参考生成失败，未套用旧答案。');
  }
}

export function buildDemoArtifact(state) {
  if (!valid(state) || !state.analysis || state.analysis.status === 'stale' || !state.selection) return errorResult('stale_input', '请先选择当前有效路径。');
  const analysis = state.analysis;
  const path = analysis.paths.find((entry) => entry.id === state.selection.pathId);
  if (!path || state.selection.analysisId !== analysis.id || analysis.inputVersion !== state.round.inputVersion) return errorResult('stale_input', '所选路径已更新。');
  const sourceFactIds = [...new Set(path.evidenceRefs.flatMap((entry) => entry.factIds))];
  const limitations = ['以下为本地参考稿，不是MoneyAI生成结果；发布前请核对实际规格与履约。'];
  const value = (key) => availableFact(state, key)?.value;
  function artifact(kind, title, body, placement) {
    return {
      id: null, version: 0, savedAt: null, roundId: state.round.id, analysisId: analysis.id, pathId: path.id,
      inputVersion: state.round.inputVersion, status: 'current', kind, title, body,
      usage: { placement, steps: ['先核对引用事实和未知项', '只使用本次选定动作需要的部分', '记录实际执行范围及之后的观察'], risks: ['不能保证适配、销量或成交；未知运费与发货时间不能编写承诺。'] },
      sourceFactIds, mode: analysis.mode, editedByUser: false
    };
  }
  const artifacts = [];
  const specsKnown = ['external_length', 'external_width', 'external_height'].every((key) => value(key) !== undefined);
  if (path.title === '把尺寸和套装说明写清楚' && specsKnown && value('price') !== undefined && value('units_per_order') !== undefined) {
    const body = value('units_per_order') + '只装，' + Number(value('price')).toFixed(2) + '元。\n单只使用状态外尺寸约' + value('external_length') + '×' + value('external_width') + '×' + value('external_height') + 'cm。购买前请核对入口、床底内部和横梁位置；仅看床底高度不能保证放入。\n运费、发货时间及尺寸公差仍需另行核对，不在此承诺。';
    artifacts.push(artifact('copy', '商品说明参考稿', body, '核对后用于商品尺寸与套装说明'));
  } else if (path.title === '先统一尺寸咨询回复' && specsKnown) {
    artifacts.push(artifact('copy', '尺寸咨询回复参考', '这款单只使用状态外尺寸约' + value('external_length') + '×' + value('external_width') + '×' + value('external_height') + 'cm。请同时量一下入口、内部可用空间和横梁位置；这些尺寸没有核对前，不能保证适配。您可以先按这三个位置检查，再决定是否购买。', '回复主动询问尺寸的顾客'));
  } else {
    artifacts.push(artifact('checklist', '这次先做的核对步骤', '1. ' + path.action + '\n2. 保留商品、渠道、开始/结束日期和原始出处。\n3. 不知道的项写“未知”，不要补0；不同口径分别保存。\n4. 带这份记录再判断，不把未反馈当未执行。', '整理一份手头已有记录'));
  }
  artifacts.push(artifact('experiment_plan', '简单观察计划', '只改变：' + path.experiment.change + '\n尽量保持：' + path.experiment.keepFixed.join('；') + '\n观察期与最低样本：尚未确定。\n记录实际做了哪一部分，以及之后看到什么。出现不实承诺或其他风险先暂停核对；有改善也不直接归因于本次动作。', '自行记录本次执行与观察'));
  return { ok: true, artifacts, limitations };
}
