import { describe, expect, it } from "vitest";
import { cloneDemoCase } from "../data/demoCase";
import type { MemoryRecord } from "../types";
import { buildAnalysis, validateInput } from "./analyze";

describe("成交断点与Skill路由", () => {
  it("把低点击场景路由到内容承接Skill", () => {
    const analysis = buildAnalysis(cloneDemoCase("content"));
    expect(analysis.breakpointStage).toBe("content_click");
    expect(analysis.skillTrace.map((item) => item.id)).toEqual([
      "data_quality",
      "content_traffic",
      "experiment_design",
    ]);
  });

  it("把点击后疑问场景路由到信任与疑问Skill", () => {
    const analysis = buildAnalysis(cloneDemoCase("trust"));
    expect(analysis.breakpointStage).toBe("click_cart");
    expect(analysis.skillTrace[1].id).toBe("trust_objection");
    expect(analysis.dataQuality.sourceLabel).toBe("合成演示数据");
    expect(analysis.dataQuality.confidence).toBe("medium");
  });

  it("把鞋类尺码与穿着疑虑评价路由到信任与疑问Skill", () => {
    const input = cloneDemoCase("trust");
    input.customerQuestions = "尺码偏大了一码，鞋头也偏宽，磨脚后跟";
    const analysis = buildAnalysis(input);
    expect(analysis.breakpointStage).toBe("click_cart");
    expect(analysis.skillTrace[1].id).toBe("trust_objection");
  });

  it("把低支付场景路由到交易阻力Skill", () => {
    const analysis = buildAnalysis(cloneDemoCase("transaction"));
    expect(analysis.breakpointStage).toBe("order_pay");
    expect(analysis.skillTrace[1].id).toBe("transaction_friction");
    expect(analysis.experimentPlans.A.primaryMetric).toBe("创建订单→支付率");
  });
});

describe("事实门禁与第二轮记忆", () => {
  it("阻止倒挂的五段漏斗", () => {
    const input = cloneDemoCase("trust");
    input.metrics.createdOrders = input.metrics.addToCarts + 1;
    expect(validateInput(input)).toContain("播放 ≥ 商品点击 ≥ 加购 ≥ 创建订单 ≥ 支付");
  });

  it("把同一商品反馈加入第二轮并避开标题修改", () => {
    const input = cloneDemoCase("trust");
    const memory: MemoryRecord = {
      experimentId: "EXP-ROUND-1",
      merchantName: input.merchantName,
      productName: input.productName,
      status: "partial",
      strategy: "A",
      reason: "商品标题不能改，但详情页可以调整。",
      outcome: "已跑满100次商品点击，加购率没有变化。",
      savedAt: "2026-08-28T00:00:00.000Z",
    };
    const analysis = buildAnalysis(input, memory);
    expect(analysis.round).toBe(2);
    expect(analysis.skillTrace.at(-1)?.id).toBe("memory_review");
    expect(analysis.memoryAdjustment).toContain("停止重复同一改法");
    expect(analysis.options[0].title).toContain("购买问答");
    expect(analysis.outputs.A.label).toBe("购买问答区替换稿");
    expect(analysis.experimentPlans.A.singleVariable).toBe("购买问答区");
  });

  it("实验处方始终包含样本、停止和回滚边界", () => {
    const analysis = buildAnalysis(cloneDemoCase("content"));
    for (const plan of Object.values(analysis.experimentPlans)) {
      expect(plan.minimumSample).toBeTruthy();
      expect(plan.stopCondition).toContain("停止");
      expect(plan.rollbackCondition).toContain("恢复");
    }
  });
});
