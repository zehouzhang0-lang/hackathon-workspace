import { describe, expect, it } from "vitest";
import { cloneDemoCase } from "../data/demoCase";
import { buildAnalysis } from "./analyze";
import { buildBossDecisionFlow } from "./bossFlow";

describe("老板端成交决策流", () => {
  it("把系统诊断转换成可读的Yes和No分支", () => {
    const analysis = buildAnalysis(cloneDemoCase("trust"));
    const flow = buildBossDecisionFlow(analysis, "confirm", new Set(["data", "quality", "diagnose"]), "A");

    expect(flow.nodes.find((node) => node.id === "diagnose")?.status).toBe("current");
    expect(flow.nodes.find((node) => node.id === "diagnose")?.caption).toBe(analysis.breakpointTitle);
    expect(flow.edges.find((edge) => edge.id === "quality-diagnose")?.label).toBe("Yes");
    expect(flow.edges.find((edge) => edge.id === "quality-missing")?.label).toBe("No");
  });

  it("老板端始终展示单一今日动作和最低样本", () => {
    const analysis = buildAnalysis(cloneDemoCase("transaction"));
    const flow = buildBossDecisionFlow(analysis, "sample", new Set(["data", "quality", "diagnose", "confirm", "action"]), "A");

    expect(flow.nodes.find((node) => node.id === "action")?.caption).toBe(analysis.options[0].title);
    expect(flow.nodes.find((node) => node.id === "sample")?.caption).toBe(analysis.experimentPlans.A.minimumSample);
    expect(flow.nodes.find((node) => node.id === "sample")?.status).toBe("current");
  });
});
