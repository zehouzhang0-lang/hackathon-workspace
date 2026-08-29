import { buildSkillTrace } from "../skills/registry";
import type {
  AnalysisResult,
  BreakpointStage,
  DemoInput,
  ExperimentPlan,
  FunnelRates,
  MemoryRecord,
  OutputDraft,
  StrategyId,
  StrategyOption,
} from "../types";
import { assessDataQuality } from "./quality";

function rate(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return Number(((numerator / denominator) * 100).toFixed(1));
}

export function calculateRates(input: DemoInput): FunnelRates {
  return {
    viewToClick: rate(input.metrics.productClicks, input.metrics.videoViews),
    clickToCart: rate(input.metrics.addToCarts, input.metrics.productClicks),
    cartToOrder: rate(input.metrics.createdOrders, input.metrics.addToCarts),
    orderToPay: rate(input.metrics.paidOrders, input.metrics.createdOrders),
  };
}

function memoryFlags(memory?: MemoryRecord) {
  const feedback = `${memory?.reason ?? ""} ${memory?.outcome ?? ""}`;
  // PRD 10.5：下一轮主动排除“已验证无效”与“不可执行”的动作——老板未采用（declined）同样阻断重复。
  const repeatBlocked =
    memory?.status === "declined" || /无变化|没变化|没有变化|没提升|没有提升/.test(feedback);
  return {
    repeatBlocked,
    titleLocked: /标题.*不能|不能.*标题/.test(feedback),
    lacksTests: /没有.*测试|没有.*数据|冰块|续航/.test(feedback),
    priceLocked: /不能.*降价|价格.*不能/.test(feedback),
  };
}

function buildMemoryAdjustment(memory?: MemoryRecord): string | undefined {
  if (!memory) return undefined;
  const flags = memoryFlags(memory);
  if (flags.repeatBlocked) {
    return memory.status === "declined"
      ? "已记住上一轮没有采用，本轮停止重复同一改法并切换验证变量。"
      : "已记住上一轮执行后没有明显变化，本轮停止重复同一改法并切换验证变量。";
  }
  if (flags.titleLocked) return "已记住商品标题不能修改，本轮只调整详情页、问答或交易说明。";
  if (flags.lacksTests) return "已记住缺少性能测试数据，本轮不输出打冰、降噪或续航承诺。";
  if (flags.priceLocked) return "已记住当前不能降价，本轮保持价格不变。";
  return memory.reason.trim()
    ? `已记住上一轮反馈：“${memory.reason.trim()}”，本轮建议避开该限制。`
    : "已读取上一轮采用状态，本轮不再从零开始。";
}

function breakpointCopy(stage: BreakpointStage) {
  const copies = {
    content_click: {
      title: "内容到商品点击的承接",
      summary: "用户看到了内容，但还没有足够理由进入商品页，先验证内容钩子与商品关系。",
      hypothesis: "内容前5秒没有让目标用户快速理解商品解决什么问题，可能造成有效点击不足；这仍是待验证假设。",
    },
    click_cart: {
      title: "商品点击后的价值与信任承接",
      summary: "用户愿意点进商品，但点击到加购的损耗更值得优先验证。",
      hypothesis: "商品价值、适用边界或购买风险说明不足，可能增加点击后的犹豫；现有数据不能证明它是唯一原因。",
    },
    cart_order: {
      title: "加购后的下单决策",
      summary: "用户已有购买意愿，但优惠、库存、运费或结算信息可能阻碍创建订单。",
      hypothesis: "结算前的价格构成或履约信息可能让用户推迟下单；需要用单变量实验验证。",
    },
    order_pay: {
      title: "创建订单后的支付交易阻力",
      summary: "用户已经创建订单，但支付完成率偏低，优先检查交易、发货和售后顾虑。",
      hypothesis: "支付方式、最终价格、发货时效或售后不确定性可能阻碍支付；不能仅凭漏斗数据断定主因。",
    },
  };
  return copies[stage];
}

function buildOptions(stage: BreakpointStage, memory?: MemoryRecord): StrategyOption[] {
  const flags = memoryFlags(memory);
  if (stage === "content_click") {
    return [
      { id: "A", title: "改前5秒问题钩子", action: "只替换开头字幕和封面，明确目标用户与真实使用问题。", cost: "不重拍主体视频。", risk: "点击可能仍受商品竞争力影响。" },
      { id: "B", title: "补一条真实场景验证", action: "用一次真实使用过程回答最常见问题。", cost: "需要简单补拍与剪辑。", risk: "未经测试的功能不能演示。" },
    ];
  }
  if (stage === "click_cart") {
    return [
      { id: "A", title: flags.repeatBlocked ? "切换到购买问答验证" : "补全首屏购买判断", action: flags.titleLocked ? "保留标题，只改详情页首屏的适用、限制与售后说明。" : "集中回答规格、适用场景、限制和售后，不改价格。", cost: "只改一处文字层。", risk: "若核心问题在商品竞争力，信息优化帮助有限。" },
      { id: "B", title: "制作真实问题验证内容", action: "围绕一个最高频问题拍摄单变量验证视频。", cost: "需要完成一次真实测试和短视频。", risk: "样本不足时不能提前判断胜负。" },
    ];
  }
  if (stage === "cart_order") {
    return [
      { id: "A", title: "前置最终到手信息", action: "在加购前说明到手价、运费、库存与发货条件。", cost: "需要核对真实交易规则。", risk: "信息更透明可能减少低意向加购。" },
      { id: "B", title: "优化结算提醒", action: "只调整加购后的客服或页面提醒，不新增优惠承诺。", cost: "需要跟踪未下单人群反馈。", risk: "频繁触达可能引起反感。" },
    ];
  }
  return [
    { id: "A", title: "补齐支付前交易说明", action: "集中说明最终价格、发货、退换和支付失败处理。", cost: "需要核对平台与店铺规则。", risk: "不能承诺后台未确认的时效和权益。" },
    { id: "B", title: "回收未支付原因", action: "用客服问答或小样本访谈收集真实阻力，再决定下一轮。", cost: "需要人工回收反馈。", risk: "短期不一定直接增加支付。" },
  ];
}

function buildOutputs(input: DemoInput, stage: BreakpointStage, memory?: MemoryRecord): Record<StrategyId, OutputDraft> {
  const flags = memoryFlags(memory);
  const safeTitle = flags.titleLocked ? input.currentProductCopy.split("。", 1)[0] || input.productName : `${input.productName}｜购买前先确认这几件事`;
  const caution = flags.lacksTests ? "\n\n待验证性能不作承诺，以真实测试与商品说明为准。" : "\n\n未提供的性能参数不作承诺。";

  if (stage === "content_click") {
    return {
      A: { label: "前5秒字幕替换稿", headline: `先别急着买，看看${input.productName}是否适合你`, body: `适合：${input.targetCustomer}\n\n本次只验证一个问题：目标用户能否在5秒内理解商品与自己的关系。`, experiment: "保持商品、价格和预算不变，只替换前5秒字幕与封面。" },
      B: { label: "15秒真实场景脚本", headline: `用一次真实过程，看清${input.productName}`, body: "0-3秒：提出顾客最高频问题。\n3-10秒：连续展示真实使用过程。\n10-13秒：标出已确认事实。\n13-15秒：引导查看商品页。", experiment: "与原内容使用同类流量，比较商品点击率。" },
    };
  }
  if (stage === "click_cart") {
    if (flags.repeatBlocked) {
      const questions = input.customerQuestions.split("\n").filter(Boolean).slice(0, 3).join("\n");
      return {
        A: { label: "购买问答区替换稿", headline: flags.titleLocked ? safeTitle : `${input.productName}｜下单前先回答真实问题`, body: `顾客最常问：\n${questions}\n\n已确认事实：\n${input.productFacts}\n\n未知项继续标注待验证，不重复上一轮首屏改法。${caution}`, experiment: "上一轮首屏修改无明显变化，本轮保持首屏不变，只新增购买问答区。" },
        B: { label: "真实问题验证视频脚本", headline: `把顾客最犹豫的问题拍出来`, body: "0-3秒：展示最高频问题。\n3-10秒：只验证这一项，不扩大承诺。\n10-13秒：标出事实与未知。\n13-15秒：引导查看商品页问答。", experiment: "停止重复修改首屏，只验证真实问题内容。" },
      };
    }
    return {
      A: { label: "商品详情页首屏替换稿", headline: safeTitle, body: `${input.productFacts}\n\n适合：${input.targetCustomer}\n\n购买限制：${input.constraints}${caution}`, experiment: "保持价格、投流和原内容不变，只替换商品页首屏。" },
      B: { label: "真实问题验证视频脚本", headline: `别先听我说好用，直接验证${input.productName}`, body: "0-3秒：展示本次验证的问题。\n3-10秒：连续展示真实过程。\n10-13秒：标出已确认规格与未知项。\n13-15秒：引导查看价格、发货与售后。", experiment: "保持商品页和预算不变，只替换验证内容。" },
    };
  }
  if (stage === "cart_order") {
    return {
      A: { label: "加购前交易说明", headline: `${input.productName}｜下单前核对`, body: `价格：${input.price}元\n\n商品事实：\n${input.productFacts}\n\n限制：\n${input.constraints}`, experiment: "只前置最终到手信息，观察加购到创建订单率。" },
      B: { label: "加购后提醒话术", headline: "下单前还有哪一点没确认？", body: "价格、发货、适用条件或售后有任何一项不清楚，可以先确认再下单。未确认信息不作额外承诺。", experiment: "只对新增加购用户使用该提醒，记录未下单原因。" },
    };
  }
  return {
    A: { label: "支付前交易说明", headline: `${input.productName}｜支付前请确认`, body: `当前价格：${input.price}元\n\n已确认商品事实：\n${input.productFacts}\n\n经营限制：\n${input.constraints}`, experiment: "不改价格，只补齐支付、发货与售后说明。" },
    B: { label: "未支付原因回收话术", headline: "这次没有完成支付，主要卡在哪一步？", body: "可以只回复一个选项：最终价格／支付方式／发货时间／售后退换／商品仍有疑问。你的反馈只用于改进下一步说明。", experiment: "回收至少10条真实原因，再决定下一轮动作。" },
  };
}

function planFor(
  stage: BreakpointStage,
  strategy: StrategyId,
  input: DemoInput,
  round: 1 | 2,
  memory?: MemoryRecord,
): ExperimentPlan {
  const plans = {
    content_click: ["播放→商品点击率", "新增至少2000次播放", "24至48小时", "前5秒字幕或验证视频"],
    click_cart: ["商品点击→加购率", "新增至少100次商品点击", "24至72小时", "详情页首屏或验证视频"],
    cart_order: ["加购→创建订单率", "新增至少50次加购", "48至72小时", "到手信息或加购提醒"],
    order_pay: ["创建订单→支付率", "新增至少30次创建订单", "48至72小时", "支付说明或原因回收"],
  } as const;
  const [metric, sample, window, variable] = plans[stage];
  const idPart = input.dataContext.productId.replace(/[^a-z0-9]/gi, "").slice(-8) || "DEMO";
  const flags = memoryFlags(memory);
  const secondRoundVariable = stage === "click_cart" && flags.repeatBlocked
    ? strategy === "A" ? "购买问答区" : "真实问题验证视频"
    : undefined;
  return {
    experimentId: `EXP-${idPart}-${stage}-${strategy}-R${round}`,
    hypothesis: breakpointCopy(stage).hypothesis,
    singleVariable: secondRoundVariable ?? (strategy === "A" ? variable.split("或")[0] : variable.split("或")[1] || variable),
    control: "商品、价格、流量来源和其他页面保持不变。",
    action: strategy === "A" ? "执行推荐方案A，完整记录修改时间。" : "执行备选方案B，完整记录修改时间。",
    primaryMetric: metric,
    guardrailMetric: "退款、投诉或有效点击不得出现明显恶化。",
    minimumSample: sample,
    observationWindow: window,
    stopCondition: "出现事实错误、投诉增加或核心护栏明显恶化时立即停止。",
    rollbackCondition: "未达到最低样本前不下结论；确认恶化时恢复实验前版本。",
  };
}

export function validateInput(input: DemoInput): string | null {
  if (!input.productName.trim()) return "请填写具体商品。";
  if (!input.targetCustomer.trim()) return "请填写目标用户。";
  const values = Object.values(input.metrics);
  if (values.some((value) => !Number.isFinite(value))) return "漏斗数据必须是有效数字。";
  if (values.some((value) => value < 0)) return "漏斗数据不能为负数。";
  const { videoViews, productClicks, addToCarts, createdOrders, paidOrders } = input.metrics;
  if (productClicks > videoViews || addToCarts > productClicks || createdOrders > addToCarts || paidOrders > createdOrders) {
    return "漏斗数据应满足：播放 ≥ 商品点击 ≥ 加购 ≥ 创建订单 ≥ 支付。";
  }
  if (videoViews === 0) return "播放量必须大于0。";
  if (input.dataContext.windowStart && input.dataContext.windowEnd && input.dataContext.windowStart > input.dataContext.windowEnd) {
    return "数据开始日期不能晚于结束日期。";
  }
  return null;
}

export function buildAnalysis(input: DemoInput, memory?: MemoryRecord): AnalysisResult {
  const rates = calculateRates(input);
  const { breakpointStage, trace } = buildSkillTrace(input, rates, memory);
  const copy = breakpointCopy(breakpointStage);
  const round = memory ? 2 : 1;
  const questions = input.customerQuestions.split("\n").filter(Boolean).slice(0, 3).join("、");
  const evidence = [
    `${input.dataContext.windowStart || "未标注"}至${input.dataContext.windowEnd || "未标注"}：${input.metrics.videoViews.toLocaleString()}次播放，${input.metrics.productClicks.toLocaleString()}次商品点击。`,
    `播放→点击 ${rates.viewToClick}%，点击→加购 ${rates.clickToCart}%，加购→创建订单 ${rates.cartToOrder}%，创建订单→支付 ${rates.orderToPay}%。`,
    questions ? `顾客高频问题：${questions}` : "尚未提供顾客问题，当前只能依据漏斗形成低置信假设。",
    "当前断点由保守演示规则排序，只用于决定下一项实验，不作为行业因果结论。",
  ];

  return {
    rates,
    breakpointStage,
    breakpointTitle: copy.title,
    breakpointSummary: copy.summary,
    evidence,
    hypothesis: copy.hypothesis,
    options: buildOptions(breakpointStage, memory),
    outputs: buildOutputs(input, breakpointStage, memory),
    dataQuality: assessDataQuality(input),
    skillTrace: trace,
    experimentPlans: {
      A: planFor(breakpointStage, "A", input, round, memory),
      B: planFor(breakpointStage, "B", input, round, memory),
    },
    round,
    memoryAdjustment: buildMemoryAdjustment(memory),
  };
}
