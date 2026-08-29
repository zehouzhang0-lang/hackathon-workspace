import { describe, expect, it } from "vitest";
import { cloneDemoCase } from "../data/demoCase";
import type { DemoScenarioId } from "../data/demoCase";
import type { DemoInput } from "../types";
import { buildAnalysis, calculateRates, validateInput } from "./analyze";
import { assessDataQuality } from "./quality";
import { chooseBreakpoint } from "../skills/registry";

function withMetrics(id: DemoScenarioId, metrics: DemoInput["metrics"]): DemoInput {
  const input = cloneDemoCase(id);
  input.metrics = metrics;
  return input;
}

describe("漏斗数据门禁（PRD 11.4 / 15）", () => {
  it("合法主演示案例通过校验", () => {
    expect(validateInput(cloneDemoCase("trust"))).toBeNull();
  });

  it("缺少商品或目标用户时拒绝分析", () => {
    const noProduct = cloneDemoCase("trust");
    noProduct.productName = " ";
    expect(validateInput(noProduct)).toContain("商品");

    const noCustomer = cloneDemoCase("trust");
    noCustomer.targetCustomer = "";
    expect(validateInput(noCustomer)).toContain("目标用户");
  });

  it("负数漏斗数据被拒绝", () => {
    const input = cloneDemoCase("trust");
    input.metrics.addToCarts = -1;
    expect(validateInput(input)).toContain("不能为负数");
  });

  it("NaN 或 Infinity 漏斗数据被拒绝（解析失败不得进入断点路由）", () => {
    const allNan = withMetrics("trust", {
      videoViews: NaN,
      productClicks: NaN,
      addToCarts: NaN,
      createdOrders: NaN,
      paidOrders: NaN,
    });
    expect(validateInput(allNan)).toContain("有效数字");

    const singleNan = withMetrics("trust", {
      videoViews: 58000,
      productClicks: NaN,
      addToCarts: 96,
      createdOrders: 54,
      paidOrders: 42,
    });
    expect(validateInput(singleNan)).toContain("有效数字");

    const infinity = withMetrics("trust", {
      videoViews: Infinity,
      productClicks: 1450,
      addToCarts: 96,
      createdOrders: 54,
      paidOrders: 42,
    });
    expect(validateInput(infinity)).toContain("有效数字");
  });

  it("任意一段漏斗倒挂都被拒绝", () => {
    const inversions: Array<[keyof DemoInput["metrics"], number]> = [
      ["productClicks", cloneDemoCase("trust").metrics.videoViews + 1],
      ["addToCarts", cloneDemoCase("trust").metrics.productClicks + 1],
      ["createdOrders", cloneDemoCase("trust").metrics.addToCarts + 1],
      ["paidOrders", cloneDemoCase("trust").metrics.createdOrders + 1],
    ];
    for (const [field, value] of inversions) {
      const input = cloneDemoCase("trust");
      input.metrics[field] = value;
      expect(validateInput(input), `字段 ${field} 倒挂应被拦截`).toContain("播放 ≥ 商品点击 ≥ 加购 ≥ 创建订单 ≥ 支付");
    }
  });

  it("播放为0时拒绝，不用0冒充真实数据", () => {
    const input = withMetrics("trust", {
      videoViews: 0,
      productClicks: 0,
      addToCarts: 0,
      createdOrders: 0,
      paidOrders: 0,
    });
    expect(validateInput(input)).toContain("播放量必须大于0");
  });

  it("时间窗开始晚于结束被拒绝", () => {
    const input = cloneDemoCase("trust");
    input.dataContext.windowStart = "2026-08-27";
    input.dataContext.windowEnd = "2026-08-21";
    expect(validateInput(input)).toContain("开始日期不能晚于结束日期");
  });
});

describe("优先断点路由边界（保守规则阈值）", () => {
  it("播放到点击率恰好1.2%时不进入内容断点", () => {
    const rates = calculateRates(
      withMetrics("trust", { videoViews: 100000, productClicks: 1200, addToCarts: 100, createdOrders: 60, paidOrders: 50 }),
    );
    expect(rates.viewToClick).toBe(1.2);
    expect(chooseBreakpoint(rates)).not.toBe("content_click");
  });

  it("点击到加购率恰好8%时不进入点击断点", () => {
    const rates = calculateRates(
      withMetrics("trust", { videoViews: 50000, productClicks: 1200, addToCarts: 96, createdOrders: 54, paidOrders: 42 }),
    );
    expect(rates.clickToCart).toBe(8);
    expect(chooseBreakpoint(rates)).not.toBe("click_cart");
  });

  it("点击到加购率7.9%时锁定点击断点（主演示路径）", () => {
    const rates = calculateRates(
      withMetrics("trust", { videoViews: 50000, productClicks: 1200, addToCarts: 95, createdOrders: 54, paidOrders: 42 }),
    );
    expect(rates.clickToCart).toBe(7.9);
    expect(chooseBreakpoint(rates)).toBe("click_cart");
  });

  it("加购到创建订单率44.5%时锁定下单断点，45%时不锁定", () => {
    const below = calculateRates(
      withMetrics("transaction", { videoViews: 50000, productClicks: 2000, addToCarts: 200, createdOrders: 89, paidOrders: 60 }),
    );
    expect(below.cartToOrder).toBe(44.5);
    expect(chooseBreakpoint(below)).toBe("cart_order");

    const at = calculateRates(
      withMetrics("transaction", { videoViews: 50000, productClicks: 2000, addToCarts: 200, createdOrders: 90, paidOrders: 60 }),
    );
    expect(at.cartToOrder).toBe(45);
    expect(chooseBreakpoint(at)).toBe("order_pay");
  });
});

describe("数据质量分档（PRD 8.3 / 15）", () => {
  it("完整商家授权导出得满分并标注高置信", () => {
    const input = cloneDemoCase("content");
    input.dataContext.sourceType = "merchant_export";
    const quality = assessDataQuality(input);
    expect(quality.score).toBe(100);
    expect(quality.confidence).toBe("high");
    expect(quality.label).toBe("证据较完整");
    expect(quality.sourceLabel).toBe("商家授权脱敏导出");
  });

  it("主演示合成案例降25分后仍可形成实验假设", () => {
    const quality = assessDataQuality(cloneDemoCase("trust"));
    expect(quality.score).toBe(75);
    expect(quality.confidence).toBe("medium");
    expect(quality.issues.join()).toContain("合成案例");
  });

  it("缺少时间窗把中等置信压到低置信", () => {
    const input = cloneDemoCase("trust");
    input.dataContext.windowStart = "";
    input.dataContext.windowEnd = "";
    const quality = assessDataQuality(input);
    expect(quality.score).toBe(60);
    expect(quality.confidence).toBe("low");
  });

  it("多项缺失时分数有下限并逐项写出缺口", () => {
    const input = cloneDemoCase("trust");
    input.dataContext.windowStart = "";
    input.dataContext.windowEnd = "";
    input.dataContext.contentId = "";
    input.dataContext.productId = "";
    input.customerQuestions = "";
    input.productFacts = "";
    input.metrics = { videoViews: 50, productClicks: 40, addToCarts: 20, createdOrders: 10, paidOrders: 5 };
    const quality = assessDataQuality(input);
    expect(quality.score).toBe(12);
    expect(quality.confidence).toBe("low");
    expect(quality.issues).toHaveLength(7);
  });
});
