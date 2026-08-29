import type { DataQualityResult, DemoInput } from "../types";

const sourceLabels = {
  synthetic: "合成演示数据",
  merchant_export: "商家授权脱敏导出",
  public_real: "公开真实电商数据",
} as const;

export function assessDataQuality(input: DemoInput): DataQualityResult {
  let score = 100;
  const issues: string[] = [];
  const { dataContext, metrics } = input;

  if (dataContext.sourceType === "synthetic") {
    score -= 25;
    issues.push("当前为合成案例，只能验证产品流程，不能证明真实经营效果。");
  }
  if (dataContext.sourceType === "public_real") {
    score -= 10;
    issues.push("公开真实数据可验证漏斗算法，但不能冒充真实抖音商家经营数据。");
  }
  if (!dataContext.windowStart || !dataContext.windowEnd) {
    score -= 15;
    issues.push("缺少完整数据时间窗，无法确认不同指标是否同口径。");
  }
  if (!dataContext.contentId.trim()) {
    score -= 8;
    issues.push("缺少内容ID，暂时不能做内容间对照。");
  }
  if (!dataContext.productId.trim()) {
    score -= 8;
    issues.push("缺少商品ID，暂时不能确认是否混入其他商品。");
  }
  if (!input.customerQuestions.trim()) {
    score -= 10;
    issues.push("缺少顾客疑问或评论，成交阻力只能作为低置信假设。");
  }
  if (!input.productFacts.trim()) {
    score -= 10;
    issues.push("缺少已确认商品事实，输出成品存在失真风险。");
  }
  if (metrics.productClicks < 100 || metrics.paidOrders < 10) {
    score -= 12;
    issues.push("当前样本量偏小，建议只形成下一步实验，不下因果结论。");
  }

  const boundedScore = Math.max(0, score);
  const confidence = boundedScore >= 85 ? "high" : boundedScore >= 65 ? "medium" : "low";
  const label = confidence === "high" ? "证据较完整" : confidence === "medium" ? "可形成实验假设" : "仅供初步排查";

  return {
    score: boundedScore,
    label,
    sourceLabel: sourceLabels[dataContext.sourceType],
    confidence,
    issues: issues.length > 0 ? issues : ["核心字段完整，可继续形成实验假设。"],
  };
}
