import type { AnalysisResult, StrategyId } from "../types";

export type BossJourneyStep =
  | "quality"
  | "missing"
  | "diagnose"
  | "confirm"
  | "evidence"
  | "action"
  | "alternative"
  | "sample"
  | "result"
  | "keep"
  | "iterate";

export type BossFlowNodeStatus = "completed" | "current" | "upcoming" | "success" | "warning";

export interface BossFlowNode {
  id: string;
  position: { x: number; y: number };
  eyebrow: string;
  title: string;
  caption: string;
  status: BossFlowNodeStatus;
}

export interface BossFlowEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
  active: boolean;
  tone?: "positive" | "negative" | "neutral";
}

const nodePositions: Record<string, { x: number; y: number }> = {
  data: { x: 0, y: 0 },
  quality: { x: 260, y: 0 },
  missing: { x: 260, y: 150 },
  diagnose: { x: 520, y: 0 },
  action: { x: 520, y: 180 },
  alternative: { x: 260, y: 340 },
  sample: { x: 520, y: 340 },
  result: { x: 520, y: 500 },
  keep: { x: 260, y: 660 },
  iterate: { x: 520, y: 660 },
};

function activeNodeFor(step: BossJourneyStep): string {
  if (step === "confirm") return "diagnose";
  if (step === "evidence") return "missing";
  return step;
}

function statusFor(
  id: string,
  activeStep: BossJourneyStep,
  visited: ReadonlySet<string>,
): BossFlowNodeStatus {
  if (id === activeNodeFor(activeStep)) return "current";
  if (visited.has(id) || (id === "diagnose" && visited.has("confirm")) || (id === "missing" && visited.has("evidence"))) return "completed";
  return "upcoming";
}

export function buildBossDecisionFlow(
  analysis: AnalysisResult,
  activeStep: BossJourneyStep,
  visited: ReadonlySet<string>,
  selectedStrategy: StrategyId,
): { nodes: BossFlowNode[]; edges: BossFlowEdge[] } {
  const option = analysis.options.find((item) => item.id === selectedStrategy) ?? analysis.options[0];
  const plan = analysis.experimentPlans[selectedStrategy];
  const nodes: BossFlowNode[] = [
    {
      id: "data",
      position: nodePositions.data,
      eyebrow: "经营现场",
      title: "交一件商品的数据",
      caption: "同一商品、同一时间窗",
      status: statusFor("data", activeStep, visited),
    },
    {
      id: "quality",
      position: nodePositions.quality,
      eyebrow: "先检查",
      title: "数据够不够？",
      caption: `${analysis.dataQuality.sourceLabel} · ${analysis.dataQuality.score}/100`,
      status: statusFor("quality", activeStep, visited),
    },
    {
      id: "missing",
      position: nodePositions.missing,
      eyebrow: "No",
      title: "告诉老板还缺什么",
      caption: "缺证据时不强行诊断",
      status: statusFor("missing", activeStep, visited),
    },
    {
      id: "diagnose",
      position: nodePositions.diagnose,
      eyebrow: "系统判断",
      title: "最该先查哪一步？",
      caption: analysis.breakpointTitle,
      status: statusFor("diagnose", activeStep, visited),
    },
    {
      id: "action",
      position: nodePositions.action,
      eyebrow: "今日动作",
      title: "今天只做一件事",
      caption: option.title,
      status: statusFor("action", activeStep, visited),
    },
    {
      id: "alternative",
      position: nodePositions.alternative,
      eyebrow: "做不到",
      title: "换一个能执行的动作",
      caption: analysis.options.find((item) => item.id !== selectedStrategy)?.title ?? "根据经营限制换方案",
      status: statusFor("alternative", activeStep, visited),
    },
    {
      id: "sample",
      position: nodePositions.sample,
      eyebrow: "开始验证",
      title: plan.singleVariable,
      caption: plan.minimumSample,
      status: statusFor("sample", activeStep, visited),
    },
    {
      id: "result",
      position: nodePositions.result,
      eyebrow: "执行反馈",
      title: "结果变好了吗？",
      caption: "变好 / 没变化 / 变差",
      status: statusFor("result", activeStep, visited),
    },
    {
      id: "keep",
      position: nodePositions.keep,
      eyebrow: "Yes",
      title: "保留这项改法",
      caption: "继续观察下一处问题",
      status: statusFor("keep", activeStep, visited),
    },
    {
      id: "iterate",
      position: nodePositions.iterate,
      eyebrow: "No",
      title: "停止、回滚、换变量",
      caption: "不重复无效建议",
      status: statusFor("iterate", activeStep, visited),
    },
  ];

  const edge = (
    source: string,
    target: string,
    label?: string,
    tone: BossFlowEdge["tone"] = "neutral",
  ): BossFlowEdge => ({
    id: `${source}-${target}`,
    source,
    target,
    label,
    tone,
    active: visited.has(source) && (visited.has(target) || target === activeNodeFor(activeStep)),
  });

  return {
    nodes,
    edges: [
      edge("data", "quality"),
      edge("quality", "missing", "No", "negative"),
      edge("quality", "diagnose", "Yes", "positive"),
      edge("missing", "quality", "补齐后"),
      edge("diagnose", "missing", "不确定", "negative"),
      edge("diagnose", "action", "确认", "positive"),
      edge("action", "alternative", "No", "negative"),
      edge("action", "sample", "Yes", "positive"),
      edge("alternative", "sample", "能执行", "positive"),
      edge("sample", "result", "跑满样本"),
      edge("result", "keep", "Yes", "positive"),
      edge("result", "iterate", "No", "negative"),
      edge("iterate", "action", "下一轮"),
    ],
  };
}
