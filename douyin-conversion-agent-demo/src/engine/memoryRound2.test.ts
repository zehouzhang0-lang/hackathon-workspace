import { describe, expect, it } from "vitest";
import { cloneDemoCase } from "../data/demoCase";
import type { MemoryRecord } from "../types";
import { buildAnalysis } from "./analyze";

/**
 * 冻结验收口径（PRD V1.0 §10 + 三页演示路径）：
 * 反馈保存后，第三页进入下一轮状态；系统记住上一轮动作与结果；
 * 下一轮不再重复已验证无效的动作；单变量实验中的“保持不变条件”两轮完全一致。
 */

function makeMemory(overrides: Partial<MemoryRecord> = {}): MemoryRecord {
  return {
    experimentId: "EXP-JUICER01-click_cart-A-R1",
    merchantName: "轻活电器旗舰店（合成案例）",
    productName: "350ml便携榨汁杯",
    status: "adopted",
    strategy: "A",
    reason: "已按方案A执行，新增100次商品点击。",
    outcome: "点击到加购率没有变化，暂未观察到明显变化。",
    savedAt: "2026-08-28T10:00:00.000Z",
    ...overrides,
  };
}

describe("反馈保存后进入下一轮状态（演示路径核心）", () => {
  const input = cloneDemoCase("trust");
  const round1 = buildAnalysis(input);
  const round2 = buildAnalysis(input, makeMemory());

  it("携带记忆时轮次升级为2并挂载复盘记忆Skill", () => {
    expect(round1.round).toBe(1);
    expect(round2.round).toBe(2);
    expect(round2.skillTrace.at(-1)?.id).toBe("memory_review");
  });

  it("改判理由必须可见且非空（PRD 10.6）", () => {
    expect(round1.memoryAdjustment).toBeUndefined();
    expect(round2.memoryAdjustment).toBeTruthy();
    expect(round2.memoryAdjustment!.length).toBeGreaterThan(0);
  });

  it("无变化反馈后不再重复首屏改法，切换到购买问答区", () => {
    expect(round2.options[0].title).toContain("购买问答");
    expect(round2.options[0].title).not.toBe(round1.options[0].title);
    expect(round2.outputs.A.label).toBe("购买问答区替换稿");
    expect(round2.outputs.A.body).toContain("不重复上一轮首屏改法");
  });

  it("第二轮问答成品只使用已确认商品事实和真实顾客问题", () => {
    expect(round2.outputs.A.body).toContain("顾客最常问");
    expect(round2.outputs.A.body).toContain("一次能榨多少");
    expect(round2.outputs.A.body).toContain("USB-C充电");
    expect(round2.outputs.A.body).toContain("未知项继续标注待验证");
  });

  it("实验编号按轮次递增且与商品、断点、方案对齐", () => {
    expect(round1.experimentPlans.A.experimentId).toBe("EXP-JUICER01-click_cart-A-R1");
    expect(round1.experimentPlans.B.experimentId).toBe("EXP-JUICER01-click_cart-B-R1");
    expect(round2.experimentPlans.A.experimentId).toBe("EXP-JUICER01-click_cart-A-R2");
    expect(round2.experimentPlans.B.experimentId).toBe("EXP-JUICER01-click_cart-B-R2");
  });

  it("第二轮B方案的单一变量切换为真实问题验证视频", () => {
    expect(round2.experimentPlans.B.singleVariable).toBe("真实问题验证视频");
  });
});

describe("保持不变的条件（单变量实验合同两轮一致）", () => {
  const input = cloneDemoCase("trust");
  const round1 = buildAnalysis(input);
  const round2 = buildAnalysis(input, makeMemory());

  const lockedFields = [
    "hypothesis",
    "control",
    "primaryMetric",
    "guardrailMetric",
    "minimumSample",
    "observationWindow",
    "stopCondition",
    "rollbackCondition",
  ] as const;

  it("A/B方案八项实验合同字段在两轮完全一致", () => {
    for (const strategy of ["A", "B"] as const) {
      for (const field of lockedFields) {
        expect(
          round2.experimentPlans[strategy][field],
          `第二轮方案${strategy}的 ${field} 必须与第一轮一致`,
        ).toBe(round1.experimentPlans[strategy][field]);
      }
    }
  });

  it("控制组明确锁定价格与流量来源不改", () => {
    expect(round2.experimentPlans.A.control).toContain("价格");
    expect(round2.experimentPlans.A.control).toContain("流量来源");
  });

  it("改判只更换验证变量，主观察指标保持不变", () => {
    expect(round1.experimentPlans.A.singleVariable).toBe("详情页首屏");
    expect(round2.experimentPlans.A.singleVariable).toBe("购买问答区");
    expect(round2.experimentPlans.A.primaryMetric).toBe(round1.experimentPlans.A.primaryMetric);
    expect(round2.experimentPlans.A.primaryMetric).toBe("商品点击→加购率");
  });

  it("B方案内容在改判前后保持原样，只升级A", () => {
    const b1 = round1.options.find((option) => option.id === "B");
    const b2 = round2.options.find((option) => option.id === "B");
    expect(b1).toEqual(b2);
  });
});

describe("不同反馈触发不同改判（PRD 10.3 / 19.3）", () => {
  const input = cloneDemoCase("trust");

  it("只反馈标题不能改时：保留标题重写成品，但不切换验证变量", () => {
    const analysis = buildAnalysis(
      input,
      makeMemory({ reason: "商品标题不能改，标题字段动不了。", outcome: "首屏修改后加购率有小幅提升。" }),
    );
    expect(analysis.round).toBe(2);
    expect(analysis.memoryAdjustment).toContain("标题不能修改");
    expect(analysis.options[0].title).toContain("补全首屏");
    expect(analysis.outputs.A.headline).toBe("轻巧便携，随时鲜榨");
  });

  it("反馈没有测试数据时：成品不输出性能承诺", () => {
    const analysis = buildAnalysis(
      input,
      makeMemory({ reason: "没有真实的打冰和续航测试数据。", outcome: "无法验证性能表现。" }),
    );
    expect(analysis.memoryAdjustment).toContain("不输出打冰");
    expect(analysis.outputs.A.body).toContain("待验证性能不作承诺");
  });

  it("反馈不能降价时：本轮保持价格不变", () => {
    const analysis = buildAnalysis(
      input,
      makeMemory({ reason: "这个月不能降价，价格不能动。", outcome: "维持原价运行。" }),
    );
    expect(analysis.memoryAdjustment).toContain("保持价格不变");
  });

  it("无变化优先于其他限制，作为最高优先改判依据", () => {
    const analysis = buildAnalysis(
      input,
      makeMemory({ reason: "标题不能改，而且这轮改动后加购没变化。", outcome: "" }),
    );
    expect(analysis.memoryAdjustment).toContain("停止重复同一改法");
  });

  it("无匹配关键词的反馈也会进入第二轮并引用原文", () => {
    const analysis = buildAnalysis(
      input,
      makeMemory({ reason: "客服人手不足，问答区先不做了。", outcome: "只完成了一半修改。" }),
    );
    expect(analysis.round).toBe(2);
    expect(analysis.memoryAdjustment).toContain("已记住上一轮反馈");
    expect(analysis.memoryAdjustment).toContain("问答区先不做了");
    expect(analysis.options[0].title).toContain("补全首屏");
  });
});

describe("未采用与老板真实反馈（缺陷观察项修复回归）", () => {
  const input = cloneDemoCase("trust");

  it("老板未采用（declined）同样阻断重复并切换验证变量（PRD 10.5）", () => {
    const analysis = buildAnalysis(
      input,
      makeMemory({
        status: "declined",
        reason: "老板确认没有采用本轮方案。",
        outcome: "商品点击→加购率变差，按回滚条件恢复。",
      }),
    );
    expect(analysis.round).toBe(2);
    expect(analysis.options[0].title).toContain("购买问答");
    expect(analysis.experimentPlans.A.singleVariable).toBe("购买问答区");
    expect(analysis.memoryAdjustment).toContain("没有采用");
    expect(analysis.memoryAdjustment).toContain("停止重复同一改法");
  });

  it("老板模式只反馈执行结果时，不再误触发降价或性能限制记忆", () => {
    const analysis = buildAnalysis(
      input,
      makeMemory({
        reason: "老板确认已完整执行本轮方案。",
        outcome: "已达到新增至少100次商品点击，商品点击→加购率没有变化。",
      }),
    );
    expect(analysis.memoryAdjustment).toContain("没有明显变化");
    expect(analysis.memoryAdjustment).not.toContain("不输出打冰");
    expect(analysis.memoryAdjustment).not.toContain("保持价格不变");
  });

  it("declined 的第二轮实验编号仍按 R2 递增", () => {
    const analysis = buildAnalysis(
      input,
      makeMemory({ status: "declined", reason: "老板确认没有采用本轮方案。", outcome: "已按回滚条件恢复。" }),
    );
    expect(analysis.experimentPlans.A.experimentId).toBe("EXP-JUICER01-click_cart-A-R2");
  });
});
