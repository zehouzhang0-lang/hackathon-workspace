import { useMemo } from "react";
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import { buildBossDecisionFlow } from "../engine/bossFlow";
import type { BossFlowNodeStatus, BossJourneyStep } from "../engine/bossFlow";
import type { AnalysisResult, StrategyId } from "../types";

interface DecisionCanvasProps {
  analysis: AnalysisResult;
  activeStep: BossJourneyStep;
  visitedSteps: ReadonlySet<string>;
  selectedStrategy: StrategyId;
}

interface DecisionNodeData extends Record<string, unknown> {
  eyebrow: string;
  title: string;
  caption: string;
  status: BossFlowNodeStatus;
}

type DecisionNode = Node<DecisionNodeData, "decision">;

function DecisionNodeCard({ data }: NodeProps<DecisionNode>) {
  return (
    <div className={`decision-node ${data.status}`}>
      <Handle type="target" position={Position.Left} isConnectable={false} />
      <span>{data.eyebrow}</span>
      <strong>{data.title}</strong>
      <small>{data.caption}</small>
      <Handle type="source" position={Position.Right} isConnectable={false} />
    </div>
  );
}

const nodeTypes = { decision: DecisionNodeCard };

export function DecisionCanvas({
  analysis,
  activeStep,
  visitedSteps,
  selectedStrategy,
}: DecisionCanvasProps) {
  const flow = useMemo(
    () => buildBossDecisionFlow(analysis, activeStep, visitedSteps, selectedStrategy),
    [activeStep, analysis, selectedStrategy, visitedSteps],
  );
  const nodes = useMemo<DecisionNode[]>(
    () => flow.nodes.map((node) => ({
      id: node.id,
      type: "decision",
      position: node.position,
      data: {
        eyebrow: node.eyebrow,
        title: node.title,
        caption: node.caption,
        status: node.status,
      },
      draggable: false,
      selectable: false,
    })),
    [flow.nodes],
  );
  const edges = useMemo<Edge[]>(
    () => flow.edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      type: "smoothstep",
      label: edge.label,
      animated: edge.active,
      className: `decision-edge ${edge.active ? "active" : ""} ${edge.tone ?? "neutral"}`,
      markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14 },
      labelStyle: { fill: "#b7c8d9", fontSize: 11, fontWeight: 700 },
      labelBgStyle: { fill: "#0b1726", fillOpacity: 0.92 },
      labelBgPadding: [5, 3],
      labelBgBorderRadius: 5,
    })),
    [flow.edges],
  );

  return (
    <section className="decision-canvas-card" aria-label="成交决策流程图">
      <div className="decision-canvas-heading">
        <div>
          <span>你的成交诊断路径</span>
          <strong>绿色是已经走过，黄色是现在要回答</strong>
        </div>
        <small>只能查看，不能拖动或改流程</small>
      </div>
      <div className="decision-canvas">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          panOnDrag
          zoomOnDoubleClick={false}
          zoomOnScroll={false}
          minZoom={0.56}
          maxZoom={1.15}
          fitView
          fitViewOptions={{ padding: 0.11, maxZoom: 0.9 }}
        >
          <Background color="rgba(114, 148, 180, 0.18)" gap={24} size={1} />
          <Controls showInteractive={false} position="bottom-right" />
        </ReactFlow>
      </div>
    </section>
  );
}
