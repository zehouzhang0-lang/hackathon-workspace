import type {
  BreakpointStage,
  DemoInput,
  FunnelRates,
  MemoryRecord,
  SkillId,
  SkillTraceItem,
} from "../types";

const skillLabels: Record<SkillId, string> = {
  data_quality: "数据质检 Skill",
  content_traffic: "内容承接 Skill",
  product_value: "商品利益点 Skill",
  trust_objection: "信任与疑问 Skill",
  transaction_friction: "交易阻力 Skill",
  experiment_design: "实验设计 Skill",
  memory_review: "复盘记忆 Skill",
};

export function chooseBreakpoint(rates: FunnelRates): BreakpointStage {
  if (rates.viewToClick < 1.2) return "content_click";
  if (rates.clickToCart < 8) return "click_cart";
  if (rates.cartToOrder < 45) return "cart_order";
  return "order_pay";
}

function chooseExpertSkill(input: DemoInput, stage: BreakpointStage): SkillId {
  if (stage === "content_click") return "content_traffic";
  if (stage === "cart_order" || stage === "order_pay") return "transaction_friction";

  const hasTrustSignals = /能不能|是否|适配|售后|真假|保证|安全吗|靠谱吗|发货|退换|尺码|偏大|偏小|磨脚|脚感|鞋底|色差|实物|开胶|脱胶|异味|做工/.test(
    input.customerQuestions,
  );
  return hasTrustSignals ? "trust_objection" : "product_value";
}

export function buildSkillTrace(
  input: DemoInput,
  rates: FunnelRates,
  memory?: MemoryRecord,
): { breakpointStage: BreakpointStage; expertSkill: SkillId; trace: SkillTraceItem[] } {
  const breakpointStage = chooseBreakpoint(rates);
  const expertSkill = chooseExpertSkill(input, breakpointStage);
  const trace: SkillTraceItem[] = [
    {
      id: "data_quality",
      label: skillLabels.data_quality,
      reason: "先核对来源、时间窗、漏斗顺序与样本量。",
    },
    {
      id: expertSkill,
      label: skillLabels[expertSkill],
      reason: `根据${breakpointStage}断点自动路由，只激活一个领域专家。`,
    },
    {
      id: "experiment_design",
      label: skillLabels.experiment_design,
      reason: "把建议转换成单变量、可停止、可回滚的实验。",
    },
  ];

  if (memory) {
    trace.push({
      id: "memory_review",
      label: skillLabels.memory_review,
      reason: "读取同一商家与商品的上一轮反馈，调整本轮建议。",
    });
  }

  return { breakpointStage, expertSkill, trace };
}
