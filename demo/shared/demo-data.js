import { getAcceptedExperimentRound } from './experiment-round.js';
import { buildFunnelSnapshot, latestAnalysisReview, analysisReviewPolicy, applyAnalysisReviewPolicy, juicerProductFacts, buildDemoBreakpoint, buildDemoDataQuality } from './analysis-evidence.js';
import { ROADSHOW_SHOE_FIXTURE_ID, matchesRoadshowShoeQuestion,
  hasRoadshowShoeFixtureCore, ROADSHOW_ACCOUNT_DIAGNOSIS_FACTS } from './roadshow-shoe-fixture.js';

const errorResult = (code, message) => ({ ok: false, code, message });
const valid = (state) => state?.input?.confirmedVersion === state?.round?.inputVersion;
const availableFact = (state, key) => state.input.facts.find((fact) => fact.key === key && fact.availability === 'known');

export function buildDemoAnalysis(state) {
  if (state?.round?.sourceFeedbackId && getAcceptedExperimentRound(state, state.round.sourceFeedbackId).ok) {
    return errorResult('invalid_transition', '当前已接受的第二轮保持不变；请执行或反馈，不能重复生成覆盖已选实验。');
  }
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
    const shoeReady = state.fixtureId === ROADSHOW_SHOE_FIXTURE_ID
      && matchesRoadshowShoeQuestion(state.input.description) && hasRoadshowShoeFixtureCore(state);
    const funnel = buildFunnelSnapshot(state);
    const routing = buildDemoBreakpoint(funnel);
    const dataQuality = buildDemoDataQuality(funnel);
    const product = juicerProductFacts(state.input);
    const ownerHypothesis = facts.find((fact) => fact.intakeField === 'currentProblem' && fact.evidenceStatus === 'owner_hypothesis' && fact.availability === 'known' && fact.verification !== 'conflicting');
    const juicerReady = state.fixtureId === 'juicer_cup_v1' && funnel.status === 'comparable'
      && routing.stage === 'click_cart' && product.capacity && product.charging && product.shipping && product.cleaning;
    const review = latestAnalysisReview(state);
    const reviewPolicy = analysisReviewPolicy(state);
    const limitations = ['本结果由本地规则生成，不是外部 AI 或真实模型分析。', '观察到的订单变化不能直接归因于建议。'];
    if (!comparable && funnel.status !== 'comparable') limitations.push('数据缺少可比口径，不能计算成交漏斗或确定根因。');
    if (state.fixtureId === 'juicer_cup_v1') limitations.push('榨汁杯为显式合成首次资料；A/B仅为本机待验证方案，未调用专家Skill、真实模型或外部 AI。');
    if (shoeReady) limitations.unshift(
      '预设演示数据／伪数据兜底：以下为本机固定展示，不是现场AI实时分析，也不代表真实商家效果。',
      '报告未注明统计周期；底层鞋店商品数据.xlsx未随样例提供，只能核对HTML可见报告与本机算术。',
      '报告共60行但商品ID仅20个唯一值；商品名虽为60个唯一值，商品主键口径仍待核对。',
      '价格带图五档GMV合计291.0万元，与全店506.4万元范围不一致；本轮排除“43.9%”等价格带贡献结论。',
      '搜索与商品卡的相关系数是报告已有结论；相关性不等于因果，不能据此确认渠道优劣。'
    );
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

    function shoePath(optionLabel) {
      const diagnosisKeys = Object.keys(ROADSHOW_ACCOUNT_DIAGNOSIS_FACTS);
      const diagnoses = diagnosisKeys.map((key) => availableFact(state, key));
      const ids = diagnoses.map((fact) => fact.id);
      const isA = optionLabel === 'A';
      const title = isA ? '先稳住账号健康与内容节奏' : '复用爆款结构并回应评论需求';
      const action = isA
        ? '运动户外鞋旗舰店：立即停发搬运/混剪内容，补齐头像、昵称、简介基础设置（当前全缺），消除疑似降权风险，并去创作者中心核查违规记录，确认健康度状态后再谈内容；女鞋工厂直营店：固定发布时间到粉丝活跃时段（10:00 或 21:00），一周内停止随机发布，统一封面模板，封面加大字号人群标签（如「妈妈鞋」「学生党通勤」），让算法知道推给谁；国潮球鞋实验室：测评与推荐二选一——推荐向固定「本周必入 Top3」栏目，测评向固定「实测拆解」栏目，一周内停止内容类型摇摆，昵称保留「实验室」但简介补一句价值主张（如「每周三实测 3 双国潮鞋」）。'
        : '把「德训鞋百搭」和「AJ平替实测」两条爆款逐帧拆解，提炼成自家选题模板（标题公式 + 前3秒钩子 + 结尾引导），产出 10 个备选选题；导出全部评论按需求聚类，选出下周一期的「评论区需求回应」选题并拍出来；女鞋工厂直营店拍第一条「货源透明」内容（仓库随手拍 + 29.9指向），发布后置顶评论区「工厂实拍」旧链接。';
      const result = path(title, action, diagnosisKeys);
      result.optionLabel = optionLabel;
      result.validationMetric = isA ? '账号健康状态、发布节奏与内容栏目是否按计划完成'
        : '10个备选选题、评论需求聚类与首条货源透明内容是否按计划完成';
      result.prerequisites = [
        { ...condition('先核对三份账号诊断来自用户指定的预设演示答案，不冒充平台实时读取或AI现场结论', ids), status: 'unknown' },
        { ...condition('执行前由账号负责人核对违规记录、素材权利、商品信息和可公开范围'), status: 'unknown' }
      ];
      result.cost.money.note = '本轮未预设新增投流；制作、人工与机会成本仍需现场核对。';
      result.cost.time.note = '一周内完成是演示计划，不是效果或工期保证。';
      result.risk = [{
        id: id(),
        description: '诊断未经过平台实时核验；不得把疑似降权、受众错位或发布时间差异写成已确认因果。',
        trigger: condition('账号后台、违规记录或真实发布数据与预设答案不一致', ids),
        stop: condition('停止沿用不一致的诊断，保留原记录并重新核对'),
        restore: condition('由账号负责人确认真实状态后再决定是否恢复原内容安排'),
        sourceFactIds: ids,
        assumptionIds: []
      }];
      result.evidenceRefs = [{
        id: id(), kind: 'observation', factIds: ids, sourceIds: ids.map((factId) => 'fact:' + factId),
        summary: '以下三账号诊断为用户指定的预设演示答案，已按原文保存来源；未从鞋店HTML提取，也未做平台实时核验。',
        calculation: null
      }];
      result.counterEvidence = [{
        id: id(), kind: 'inference', factIds: [], sourceIds: ['input:description'],
        summary: '真实账号后台、违规记录、逐条视频明细与评论原文尚未在本轮读取；执行前仍需核对。',
        calculation: null
      }];
      result.estimate.target = {
        metric: isA ? 'account_health_and_content_consistency' : 'topic_and_comment_response_delivery',
        unit: '完成状态', subject: '三个鞋类账号', channel: '抖音', cohort: null
      };
      result.estimate.horizon.description = '预设演示计划为一周；真实观察窗由账号负责人确认';
      result.estimate.limitations = ['只列执行动作，不估计播放、成交、成功概率或行动增量。'];
      result.experiment = {
        change: isA ? '先修账号健康、发布节奏与内容栏目' : '拆解爆款结构、聚类评论需求并制作货源透明内容',
        keepFixed: ['不伪造平台结论', '不自动发布', '不自动修改账号资料或投流'],
        target: { ...result.estimate.target },
        window: { description: '演示计划：一周内完成动作并记录结果；未执行或未读取时保持未知。', start: null, end: null },
        minSample: null,
        sourceFactIds: ids,
        assumptionIds: [],
        limitations: ['预设答案不是实时AI分析、平台诊断或效果保证。', '行动完成与业务改善是两个不同事件。'],
        guardrails: [condition('发现侵权、违规或账号健康风险时先暂停并核对', ids)],
        stopConditions: [condition('真实后台事实与预设诊断不一致时停止沿用该判断', ids)],
        restoreConditions: [condition('保留修改前账号与内容版本，由负责人决定是否恢复')],
        restoreSteps: [condition('执行前记录账号资料、发布节奏和内容版本'), condition('需要恢复时由负责人手动恢复；应用不会自动发布或改号')]
      };
      return result;
    }

    function juicerPath(actionKey) {
      const firstScreen = actionKey === 'juicer_first_screen';
      const optionLabel = firstScreen ? 'A' : 'B';
      const title = firstScreen ? '补全首屏购买判断' : '制作真实问题验证内容';
      const change = firstScreen ? '商品详情页首屏' : '一条真实问题验证视频';
      const productIds = [product.capacity.id, product.charging.id, product.shipping.id, product.cleaning.id];
      const metricIds = funnel.stages.flatMap((stage) => stage.factIds);
      const hypothesis = '商品价值、适用边界或购买风险说明不足，可能增加点击后的犹豫；尚未证实。';
      const result = path(title, firstScreen
        ? '保持价格、投流和原内容不变，只替换商品详情页首屏；说明已确认规格、场景假设、限制和售后未知。'
        : '先核对真实顾客问题及频次，围绕一个问题完成一次安全实测和一条单变量短视频；没有实测结果时不编写性能结论。',
        ['video_views', 'product_clicks', 'add_to_carts', 'created_orders', 'paid_orders', 'intake_product_fact']);
      result.actionKey = actionKey;
      result.optionLabel = optionLabel;
      result.validationMetric = '商品点击到加购率（同商品、同窗口、同渠道的加购次数 / 商品点击次数）';
      result.prerequisites = [
        { ...condition('核对商品事实与未确认清单，不编造打冰、续航或售后权益', productIds), status: 'unknown' },
        { ...condition(firstScreen ? '能够只替换详情页首屏文字层，且保存实验前版本'
          : '能核对一个真实问题并完成安全实测与简单拍摄；没有问题频次时不冒称最高频'), status: 'unknown' }
      ];
      result.cost.money.note = '不增加投流是本轮计划，不代表实际总成本、拍摄成本或损失为0。';
      result.cost.time.note = firstScreen ? '合成计划工作量：低，只改详情页一处文字层；实际耗时未知。'
        : '需要一次真实测试与短视频拍摄；不安排复杂重拍，实际耗时未知。';
      const sample = { id: id(), label: '合成计划最低样本', value: 100, unit: '次新增商品点击',
        sourceFactIds: [], note: '仅为Demo计划起点，不代表统计充分、显著性或有效。' };
      const fromHour = { id: id(), label: '合成观察计划下限', value: 24, unit: '小时', sourceFactIds: [], note: '复查安排，不是见效保证。' };
      const toHour = { id: id(), label: '合成观察计划上限', value: 72, unit: '小时', sourceFactIds: [], note: '到时样本或口径不足仍保持未知。' };
      const hypothesisAssumption = { id: id(), label: '待验证假设', value: null, unit: null,
        sourceFactIds: ownerHypothesis ? [ownerHypothesis.id] : [], note: hypothesis };
      result.estimate.target = { metric: 'click_to_cart_rate', unit: '比例', subject: funnel.stages[1].subject,
        channel: funnel.stages[1].channel, cohort: funnel.stages[1].cohort };
      result.estimate.assumptions = [sample, fromHour, toHour, hypothesisAssumption];
      result.estimate.limitations = ['只提供合成实验安排，行动增量与未来成功概率均不可估。',
        '当前观测转换率不能直接当作实施后效果预测。'];
      const stop = [
        condition('出现商品事实错误或未核实性能／售后承诺时立即暂停并核对，不等最低样本', productIds),
        condition('投诉增加、退款或有效点击等护栏明显恶化时暂停，先核对同期变化；缺资料不表示风险未触发', metricIds)
      ];
      const restore = condition('未达到最低样本前不下效果结论；确认恶化且有实验前版本时，由商家决定恢复。');
      result.risk = [{
        id: id(), description: firstScreen ? '如果核心问题是商品竞争力，首屏信息优化帮助可能有限；不实说明会增加风险。'
          : '样本不足时不能提前判断胜负；未经实测的性能不能作为视频结论。',
        trigger: condition('出现不实描述、投诉增加、退款或有效点击恶化', [...productIds, ...metricIds]),
        stop: stop[0], restore, sourceFactIds: [...productIds, ...metricIds], assumptionIds: []
      }];
      const edge = funnel.transitions.find((item) => item.fromKey === 'product_clicks' && item.toKey === 'add_to_carts');
      result.evidenceRefs = [
        { id: id(), kind: 'calculation', factIds: [...edge.factIds], sourceIds: edge.factIds.map((factId) => 'fact:' + factId),
          summary: '同一合成嵌套事件链中的点击与加购观测，不是信任根因证据。' + routing.rule.description,
          calculation: edge.numerator + ' / ' + edge.denominator + ' = ' + (edge.conversionRate * 100).toFixed(2)
            + '%；数量差 = ' + edge.lossCount + '。' },
        { id: id(), kind: 'observation', factIds: productIds, sourceIds: productIds.map((factId) => 'fact:' + factId),
          summary: '当前合成资料已确认容量、USB-C、全国包邮与清洗以说明书为准；未做平台或第三方核验。', calculation: null },
        { id: id(), kind: 'inference', factIds: ownerHypothesis ? [ownerHypothesis.id] : [],
          sourceIds: ownerHypothesis ? ['fact:' + ownerHypothesis.id] : ['input:focus'],
          summary: hypothesis + ' 本机规则未调用专家Skill或外部 AI。', calculation: null }
      ];
      result.counterEvidence = [{ id: id(), kind: 'inference', factIds: [], sourceIds: ['input:description'],
        summary: '价格、竞争力与流量质量仍可能影响加购；目标人群是假设，真实顾客问题及频次尚待核对。', calculation: null }];
      result.experiment = {
        experimentId: 'EXP-JUICER01-click_cart-' + optionLabel + '-R' + state.round.index,
        round: state.round.index, hypothesis, change,
        keepFixed: firstScreen ? ['商品与商品标题', '价格', '投流设置与流量来源', '原内容和其他页面']
          : ['商品与商品标题', '价格', '商品页', '投流设置与其他内容'],
        target: { ...result.estimate.target },
        window: { description: '合成计划：实施后24—72小时安排复查，且新增至少100次同口径商品点击；不足时保留未知。', start: null, end: null },
        minSample: sample.value, minSampleUnit: sample.unit,
        sourceFactIds: [...metricIds, ...productIds],
        assumptionIds: [sample.id, fromHour.id, toHour.id, hypothesisAssumption.id],
        limitations: ['100次新增商品点击和24—72小时仅为合成计划，不证明统计充分、显著性或因果效果。',
          '目标人群和适用场景保持待验证；容量不等于一次实际处理量。',
          '实际流量来源变化必须另记，采用不等于执行，不自动填执行时间。'],
        guardrails: [
          condition('有效点击、退款或投诉不得明显恶化；观察值缺失时状态未知', metricIds),
          condition('不得出现未核实的商品性能或售后承诺', productIds)
        ],
        stopConditions: stop, restoreConditions: [restore],
        restoreSteps: [
          condition(firstScreen ? '实验前保存详情页首屏原版本，记录本次文字层改动' : '实验前保存原内容与发布状态，记录本次单条视频变量'),
          condition(firstScreen ? '商家确认恶化并决定恢复后，手动恢复首屏原版本并记录；应用不会自动修改商品页'
            : '商家确认恶化并决定恢复后，手动停止该视频实验并恢复原内容安排；应用不会自动发布或删除内容')
        ]
      };
      return result;
    }
    // A real, non-fixture round must not receive a canned action merely because
    // the page was confirmed. At least one provenance-bound known fact is needed
    // before local rules may offer a path; otherwise the honest result is empty.
    const hasTraceableFact = state.input.facts.some((fact) => fact?.availability === 'known'
      && fact.value !== null && fact.value !== undefined && fact.verification !== 'conflicting'
      && ['merchant_statement', 'file_extract'].includes(fact.source?.kind)
      && fact.source?.locator && typeof fact.source.locator === 'object');
    let paths = completeDemo
      ? [
        path('把尺寸和套装说明写清楚', '先核对外尺寸、套装数量和价格，再只改商品说明中的这一段。', ['price', 'units_per_order', 'external_length', 'external_width', 'external_height', 'dimension_scope', 'current_title', 'current_opening', 'selected_inquiries']),
        path('先统一尺寸咨询回复', '先使用一份不保证适配的测量与核对回复，记录顾客仍不清楚的地方。', ['external_length', 'external_width', 'external_height', 'dimension_scope', 'selected_inquiries'])
      ]
      : juicerReady ? [juicerPath('juicer_first_screen'), juicerPath('juicer_question_video')]
      : shoeReady ? [shoePath('A'), shoePath('B')]
      : state.fixtureId || hasTraceableFact
        ? [path('先留一份可核对的记录', '选择同一商品、同一渠道和同一时间窗口的一份现有记录，保留原值与出处，再比较变化。', ['product_detail_visitors', 'paid_orders'])]
        : [];
    paths = applyAnalysisReviewPolicy(paths, reviewPolicy);
    if (reviewPolicy.withdrawn) limitations.push('本轮此前异议已撤回原优先假设；后续认可或不确定不自动解除，须补充可核对资料。');
    if (reviewPolicy.unresolved || reviewPolicy.blockedActionKeys.length || reviewPolicy.blockedTitles.length) {
      limitations.push(paths.length ? '已累计排除本轮明确无法执行的路径；后续认可不解除限制，剩余路径仍需显式选择。'
        : '当前路径均不可执行或原路径无法核对，本机规则尚无有依据的替代方案；已保留原因，不自动选路。');
    }
    const priorityActive = juicerReady && paths.some((entry) => entry.actionKey);
    const shoeFacts = shoeReady ? Object.fromEntries(Object.keys(ROADSHOW_ACCOUNT_DIAGNOSIS_FACTS)
      .map((key) => [key, availableFact(state, key)])) : null;
    const priority = {
      status: priorityActive ? 'hypothesis' : 'unavailable',
      stage: priorityActive ? 'click_cart' : null,
      fromKey: priorityActive ? 'product_clicks' : null, toKey: priorityActive ? 'add_to_carts' : null,
      title: priorityActive ? '这轮先看：商品点击后的价值与信任承接'
        : shoeReady ? '三个账号的优先问题已经定位' : '当前不确定优先验证环节',
      reason: priorityActive ? routing.reason + ' ' + routing.rule.description + ' 在不能降价、不编造性能、不复杂重拍的限制下，一轮只改一个变量。'
        : shoeReady ? [
          ROADSHOW_ACCOUNT_DIAGNOSIS_FACTS.female_factory_diagnosis,
          ROADSHOW_ACCOUNT_DIAGNOSIS_FACTS.sneaker_lab_diagnosis,
          ROADSHOW_ACCOUNT_DIAGNOSIS_FACTS.outdoor_flagship_diagnosis
        ].join('\n\n')
        : reviewPolicy.withdrawn ? '已撤回被质疑的假设，等待可核对的新依据。' : routing.reason + ' 商品事实或可执行路径不足时不生成固定A/B。',
      rootCauseConfirmed: false,
      facts: priorityActive ? [{ text: '当前合成资料记录' + funnel.stages[1].value + '次商品点击、' + funnel.stages[2].value + '次加购。', sourceFactIds: [...funnel.stages[1].factIds, ...funnel.stages[2].factIds] }]
        : shoeReady ? Object.entries(ROADSHOW_ACCOUNT_DIAGNOSIS_FACTS).map(([key, value]) => ({
          text: value,
          sourceFactIds: [shoeFacts[key].id],
          sourceIds: ['fact:' + shoeFacts[key].id]
        })) : [],
      hypothesis: priorityActive ? { text: '商品价值、适用边界或购买风险说明不足，可能增加点击后的犹豫；尚未证实。', sourceFactIds: ownerHypothesis ? [ownerHypothesis.id] : [], sourceIds: ownerHypothesis ? ['fact:' + ownerHypothesis.id] : ['input:description'] }
        : null,
      unknowns: shoeReady
        ? ['预设诊断尚未通过账号后台、违规记录、逐条视频与评论原文做现场核验。']
        : ['价格、商品吸引力或流量质量是否影响加购仍未知。', '投流、退款、投诉与真实顾客疑问资料未提供。']
    };

    const lastFeedback = state.feedbackRecords.at(-1);
    let summary = completeDemo ? '先把顾客反复问到的信息说清楚，是当前可以比较的两种小动作；它们不是已证实的成交原因。'
      : priorityActive ? '先验证商品点击后的价值与信任承接：A只改详情页首屏，B围绕一个真实问题做实测内容；仍不是根因结论。'
        : shoeReady ? '已按用户指定的预设演示答案定位三个鞋类账号的主要问题，并给出A/B两组行动；未调用真实AI或专家Skill。'
        : paths.length ? '现有资料不足以判断唯一原因，先给出一个可以执行的核对步骤。' : '已保留商家反馈，当前没有足够依据给出可执行的新方案。';
    if (review) summary += review.stance === 'agree' ? ' 商家认可当前感受，不代表根因已被证实。'
      : review.stance === 'uncertain' ? ' 商家表示不确定，事实和假设保持分开。'
        : review.stance === 'disagree' ? ' 已按异议撤回原假设，重新判断仍需要资料。' : ' 已排除明确做不了的方案，未记录为执行失败。';
    if (lastFeedback) summary += ' 本轮读取了已保存的本地反馈；执行与观察仍按原自述保留，不代表外部服务已读取历史。';
    return { ok: true, analysis: { id: null, savedAt: null, roundId: state.round.id, inputVersion: state.round.inputVersion,
      status: paths.length && (completeDemo || priorityActive || shoeReady) ? 'ready' : 'limited', mode, summary, paths, limitations,
      prdVersion: '1.0', analysisSource: 'local_fallback', routing, dataQuality,
      funnel, priority, reviewId: review?.id ?? null, reviewIds: reviewPolicy.reviewIds,
      processing: shoeReady ? [
        { name: '本机静态样例读取值核对', kind: 'local_rule', status: 'done' },
        { name: '本机分子分母算术复核', kind: 'local_rule', status: 'done' },
        { name: '报告结论、数据冲突与本机推断分层', kind: 'local_rule', status: 'done' },
        { name: '外部AI或专家Skill', kind: 'local_rule', status: 'not_run' }
      ] : [
        { name: '本机口径与来源检查', kind: 'local_rule', status: 'done' },
        { name: '本机逐阶段算术', kind: 'local_rule', status: funnel.status === 'comparable' ? 'done' : 'not_run' },
        { name: '本机合成行动模板', kind: 'local_rule', status: juicerReady || completeDemo ? 'done' : 'not_run' },
        { name: '本机感受反馈规则', kind: 'local_rule', status: review ? 'done' : 'not_run' }
      ] } };
  } catch {
    return errorResult('generation_failed', '本地参考生成失败，未套用旧答案。');
  }
}

export function buildDemoArtifact(state) {
  if (!valid(state) || !state.analysis || state.analysis.status === 'stale' || !state.selection) return errorResult('stale_input', '请先选择当前有效路径。');
  const analysis = state.analysis;
  const path = analysis.paths.find((entry) => entry.id === state.selection.pathId);
  if (!path || state.selection.analysisId !== analysis.id || state.selection.inputVersion !== state.round.inputVersion
    || analysis.roundId !== state.round.id || analysis.inputVersion !== state.round.inputVersion) return errorResult('stale_input', '所选路径已更新。');
  const sourceFactIds = [...new Set(path.evidenceRefs.flatMap((entry) => entry.factIds))];
  const limitations = ['以下为本地参考稿，不是外部 AI 生成结果；发布前请核对实际规格与履约。'];
  const sourceInput = analysis.inputSnapshot ?? state.input;
  const value = (key) => availableFact({ input: sourceInput }, key)?.value;
  function artifact(kind, title, body, placement, options = {}) {
    return {
      id: null, version: 0, savedAt: null, roundId: state.round.id, analysisId: analysis.id, pathId: path.id,
      inputVersion: state.round.inputVersion, status: 'current', kind, title, body,
      usage: { placement, steps: options.steps ?? ['先核对引用事实和未知项', '只使用本次选定动作需要的部分', '记录实际执行范围及之后的观察'], risks: options.risks ?? ['不能保证适配、销量或成交；未知运费与发货时间不能编写承诺。'] },
      sourceFactIds: options.factIds ?? sourceFactIds, mode: analysis.mode,
      skillId: path.skillId ?? null, editedByUser: false
    };
  }
  const artifacts = [];

  const memoryFaq = path.actionKey === 'juicer_faq' && analysis.experimentReview?.version === 1;
  if (memoryFaq && !getAcceptedExperimentRound(state, analysis.sourceFeedbackId).ok) return errorResult('stale_input', '第二轮来源或接受记录无法完整核对，未生成新稿。');
  if (['juicer_first_screen', 'juicer_question_video'].includes(path.actionKey) || memoryFaq) {
    const firstScreen = path.actionKey === 'juicer_first_screen';
    const product = juicerProductFacts(sourceInput);
    const plan = path.experiment;
    const productFacts = [product.capacity, product.charging, product.shipping, product.cleaning].filter(Boolean);
    const productIds = productFacts.map((fact) => fact.id);
    const fullProductFacts = productFacts.length === 4;
    const currentTextFact = (field, status) => {
      const entries = sourceInput.facts.filter((fact) => fact.intakeField === field);
      const fact = entries.length === 1 ? entries[0] : null;
      return fact && fact.availability === 'known' && fact.evidenceStatus === status
        && fact.verification !== 'conflicting' && typeof fact.value === 'string'
        && ['merchant_statement', 'file_extract'].includes(fact.source?.kind) ? fact : null;
    };
    const productName = currentTextFact('productName', 'confirmed_fact');
    const audience = currentTextFact('targetCustomerHypothesis', 'owner_hypothesis');
    const copyIds = [...productIds, ...[productName, audience].filter(Boolean).map((fact) => fact.id)];
    const knownLines = productFacts.map((fact) => fact.value);
    const name = productName?.value ?? '商品名称待核对';
    const audienceLine = audience?.value ?? '尚未提供，不猜适用人群';
    const steps = memoryFaq ? [
      '保存购买问答区原版本；商品标题和已调整首屏保持不变',
      '只回答已确认商品事实，未知性能和售后先核对，不发布占位承诺',
      '记录实际问答区改动与新增同口径商品点击；不把接受或复制记为执行'
    ] : firstScreen ? [
      '保存实验前详情页首屏，只替换一处文字层，不改商品标题',
      '核对已确认事实、场景假设和未承诺事项，不修改价格、投流或原内容',
      '记录实际执行范围，再按同口径新增点击观察加购'
    ] : [
      '先保留一个真实顾客问题的原话与出现频次；资料不足时不冒称最高频',
      '依据商品说明安排一次安全测试，记录条件、方法、次数与真实现象',
      '只制作围绕该问题的一条验证视频；没有实测结果前不发布性能结论'
    ];
    const risks = ['容量350ml不等于一次实际处理量；打冰能力、续航次数和未提供售后权益不能承诺。',
      '人群与使用场景仍是假设；没有视频实测数据不能伪造测试成功。',
      '这是本机执行参考，不是外部 AI 生成、发布或已执行记录。'];
    if (fullProductFacts) {
      const body = memoryFaq ? [
        name + '｜下单前先回答真实问题', '',
        '已确认信息：', ...knownLines, '',
        '容量问题只回答商品规格，不扩写为一次实际处理量。',
        '真实顾客问题及频次：先保留原话核对，不冒称最高频。',
        '未知项继续核对：能否打冰、续航次数和未提供售后权益；无测试资料不作承诺。',
        '只修改购买问答区；不修改商品标题，不重复改首屏。',
        '目标人群（待验证假设）：' + audienceLine
      ].join('\n') : firstScreen ? [
        name + '｜购买前先确认这几件事', '',
        '已确认信息：', ...knownLines, '',
        '目标人群（老板假设，尚未验证，不作为适用承诺）：', audienceLine, '',
        '本轮不承诺：', '打冰块能力、续航次数、一次实际处理量和未提供的售后权益。'
      ].join('\n') : [
        name + '｜真实问题验证视频执行提纲', '内部草稿：真实问题、测试方法和结果核对前不可直接发布。', '',
        '本条只验证一个真实问题：当前问题原话与频次未提供，先核对，不猜最高频。', '',
        '已确认商品信息：', ...knownLines, '',
        '安全测试安排：按商品说明选方法并记录条件，不为展示效果进行未获支持的打冰等测试。',
        '真实测试结果：尚未提供，不填写成功、耗时、次数或性能结论。',
        '视频表达顺序：真实问题 → 测试条件与方法 → 如实展示现象 → 说明适用边界。',
        '目标人群（待验证假设）：' + audienceLine,
        '本轮不承诺：打冰能力、续航次数、一次实际处理量和未提供售后权益。'
      ].join('\n');
      artifacts.push(artifact('copy', memoryFaq ? '购买问答区已确认内容稿' : firstScreen ? '商品详情页首屏替换稿' : '真实问题验证视频执行提纲', body,
        memoryFaq ? '核对后只用于购买问答区，不更改商品标题或已改首屏' : firstScreen ? '核对后只替换商品详情页首屏文字层' : '完成真实问题与实测核对后的单条视频；当前仅为内部提纲',
        { factIds: copyIds, steps, risks }));
    } else limitations.push('所选稿的四项已确认商品事实缺失或冲突，未生成首屏稿／视频提纲；不能从商品名补容量或从旧稿补承诺。');
    artifacts.push(artifact('checklist', memoryFaq ? '购买问答区事实与限制核对清单' : firstScreen ? '首屏事实与修改核对清单' : '真实问题与测试记录清单', [
      '当前已确认：', ...knownLines,
      '容量是商品规格，不是一次实际处理量。',
      '目标人群仍是老板假设：' + audienceLine,
      '未知：打冰块能力、续航次数、具体清洗步骤和未提供的售后权益。',
      '清洗只引用说明书要求，不补写未核对的操作。',
      '真实顾客问题与频次：尚待核对；没有测试数据不生成性能承诺。',
      '', '本次执行步骤：', ...steps.map((step, index) => (index + 1) + '. ' + step),
      ...(memoryFaq ? ['原资料与本次反馈限制（自述，不改写商品事实）：', ...plan.constraints] : []),
      '采用状态和实际执行分别记录，不自动填写执行日期或把未反馈记为失败。'
    ].join('\n'), '商家内部核对与执行记录', { factIds: copyIds, steps, risks }));
    const conditions = (entries) => entries?.map((entry) => entry.text).join('；') || '尚未提供';
    const planBody = [
      '实验编号：' + (plan.experimentId ?? '未知'),
      '待验证假设：' + (plan.hypothesis ?? '未知；不从最新分析补写旧假设'),
      '本轮只改什么：' + plan.change,
      '本轮保持不变：' + plan.keepFixed.join('；'),
      '主要观察：' + (path.validationMetric ?? '商品点击到加购率') + '；对象：' + (plan.target.subject ?? '未知'),
      '最小样本：合成计划 ' + (plan.minSample ?? '未知') + (plan.minSampleUnit ? ' ' + plan.minSampleUnit : '') + '；不代表统计充分',
      '观察时间：' + plan.window.description,
      '护栏指标：' + conditions(plan.guardrails),
      '停止条件：' + conditions(plan.stopConditions),
      '回滚方式：' + conditions(plan.restoreSteps),
      '恢复前提：' + conditions(plan.restoreConditions),
      ...plan.limitations
    ].join('\n');
    artifacts.push(artifact('experiment_plan', '本轮实验卡（合成计划）', planBody, '记录所选实验的执行与观察',
      { factIds: plan.sourceFactIds, steps: plan.restoreSteps?.map((entry) => entry.text) ?? ['先核对实验前版本与恢复方法'], risks: plan.limitations }));
    artifacts.forEach((entry) => { entry.experimentId = plan.experimentId ?? null; });
    limitations.push(memoryFaq ? '购买问答区是明确接受后的唯一第二轮变量；不生成首屏或视频另一路成品，不代表已经执行。' : '首屏与视频是不同实验变量；这里只生成已选方案，不生成另一路成品。');
    return { ok: true, artifacts, limitations };
  }

  if (['juicer_faq', 'juicer_video_intro'].includes(path.actionKey)) {
    const faq = path.actionKey === 'juicer_faq';
    const product = juicerProductFacts(sourceInput);
    const productIds = [product.capacity?.id, product.charging?.id].filter(Boolean);
    const plan = path.experiment;
    const fullProductFacts = Boolean(product.capacity && product.charging);
    const steps = faq ? ['保存原购买问答区全文', '只添加已确认的容量与充电接口问答', '未确认问答先核对真实资料，不发布占位承诺']
      : ['0—2秒说明已确认容量', '2—4秒说明已确认充电接口', '4—5秒提醒核对商品说明，不展示或承诺未确认性能'];
    const risks = ['仅使用当前已确认的商品资料；没有核验冰块、续航、清洗或售后规则。',
      '此处是文案和剪辑安排，没有生成视频、发布内容或替商家执行。'];
    if (fullProductFacts) {
      const body = faq ? '问：容量是多少？\n答：' + product.capacity.value + '。\n\n问：充电接口是什么？\n答：' + product.charging.value + '。'
        : '0—2秒：' + product.capacity.value + '。\n2—4秒：' + product.charging.value + '。\n4—5秒：请先核对商品说明。';
      artifacts.push(artifact('copy', faq ? '购买问答区已确认文案' : '视频开头字幕参考稿', body,
        faq ? '核对后用于商品购买问答区' : '核对后用于原视频前约5秒字幕或剪辑', { factIds: productIds, steps, risks }));
    } else limitations.push('所选稿的容量或充电接口事实缺失／存在冲突，未生成可发布文案；请先回资料确认。');
    const checklist = [
      '待核对问题清单（不是可直接发布的回答）：',
      '容量：' + (product.capacity?.value ?? '尚未确认，不能从商品名称补值'),
      '充电接口：' + (product.charging?.value ?? '尚未确认，不能编写充电承诺'),
      '能不能打冰块：当前资料无法确认，不展示或承诺这一性能。',
      '续航多久：当前资料无法确认，不填写时长。',
      '杯体怎么清洗：请核对真实商品说明，不擅自提供清洗操作。',
      '坏了怎么处理：先补充真实售后规则；保修、退换与赔付承诺不得编造。',
      '', '本次修改步骤：', ...steps.map((step, index) => (index + 1) + '. ' + step),
      '实际流量、投诉、退款等观察尚未提供，缺失不等于风险未触发。'
    ].join('\n');
    artifacts.push(artifact('checklist', faq ? '问答待核对项与修改清单' : '视频修改与待核对清单',
      checklist, '供商家内部核对，不作为对外承诺', { factIds: productIds, steps, risks }));
    const conditions = (entries) => entries?.map((entry) => entry.text).join('；') || '尚未提供';
    const planBody = [
      '本轮只改什么：' + plan.change,
      '本轮保持不变：' + plan.keepFixed.join('；'),
      '主要观察：商品点击后的加购率（加购次数 / 同口径商品点击次数）；对象：' + (plan.target.subject ?? '未知'),
      '最小样本：合成计划假设 ' + (plan.minSample ?? '未知') + (plan.minSampleUnit ? ' ' + plan.minSampleUnit : '') + '；不代表统计充分',
      '观察时间：' + plan.window.description,
      '护栏指标：' + conditions(plan.guardrails),
      '停止条件：' + conditions(plan.stopConditions),
      '回滚方式：' + conditions(plan.restoreSteps),
      '恢复前提：' + conditions(plan.restoreConditions),
      ...plan.limitations
    ].join('\n');
    artifacts.push(artifact('experiment_plan', '本轮实验计划（合成假设）', planBody, '记录本轮实际执行与之后观察',
      { factIds: plan.sourceFactIds, steps: plan.restoreSteps?.map((entry) => entry.text) ?? ['具体回滚步骤尚未提供，请先核对原版本与恢复方法。'], risks: plan.limitations }));
    limitations.push('待核对问题与可发布文案分开；复制文案不能把未知条目当作已确认回答。');
    return { ok: true, artifacts, limitations };
  }
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
