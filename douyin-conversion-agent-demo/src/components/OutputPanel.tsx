import { useEffect, useState } from "react";
import type {
  AdoptionStatus,
  AnalysisResult,
  MemoryRecord,
  StrategyId,
} from "../types";

interface OutputPanelProps {
  analysis: AnalysisResult | undefined;
  gateMessage?: string;
  selectedStrategy: StrategyId;
  memory?: MemoryRecord;
  onSaveFeedback: (status: AdoptionStatus, reason: string, outcome: string) => void;
}

const statusLabels: Record<AdoptionStatus, string> = {
  pending: "尚未执行",
  adopted: "已采用",
  partial: "部分采用",
  declined: "未采用",
};

export function OutputPanel({
  analysis,
  gateMessage,
  selectedStrategy,
  memory,
  onSaveFeedback,
}: OutputPanelProps) {
  const [status, setStatus] = useState<AdoptionStatus>(memory?.status ?? "pending");
  const [reason, setReason] = useState(memory?.reason ?? "商品标题不能改，但详情页可以调整。");
  const [outcome, setOutcome] = useState(memory?.outcome ?? "");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setStatus(memory?.status ?? "pending");
    setReason(memory?.reason ?? "商品标题不能改，但详情页可以调整。");
    setOutcome(memory?.outcome ?? "");
  }, [memory]);

  if (!analysis) {
    return (
      <section className="panel output-panel">
        <div className="panel-heading">
          <span className="step-number">03</span>
          <div><p className="eyebrow">成品、实验与复盘</p><h2>拿走一件做得动的事</h2></div>
        </div>
        <div className="error-message">数据未通过质检：{gateMessage ?? "请修正漏斗数据后重新发起分析。"}</div>
      </section>
    );
  }

  const output = analysis.outputs[selectedStrategy];
  const plan = analysis.experimentPlans[selectedStrategy];

  const copyOutput = async () => {
    const text = [
      output.headline,
      output.body,
      `实验编号：${plan.experimentId}`,
      `单一变量：${plan.singleVariable}`,
      `主指标：${plan.primaryMetric}`,
      `最低样本：${plan.minimumSample}`,
      `观察周期：${plan.observationWindow}`,
      `停止条件：${plan.stopCondition}`,
      `回滚条件：${plan.rollbackCondition}`,
    ].join("\n\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  return (
    <section className="panel output-panel">
      <div className="panel-heading">
        <span className="step-number">03</span>
        <div><p className="eyebrow">成品、实验与复盘</p><h2>拿走一件做得动的事</h2></div>
      </div>

      <div className="round-badge">第 {analysis.round} 轮建议 · {plan.experimentId}</div>

      <article className="output-card">
        <div className="output-card-heading">
          <div><p className="eyebrow">{output.label}</p><h3>{output.headline}</h3></div>
          <button className="copy-button" onClick={copyOutput} type="button">{copied ? "已复制" : "复制"}</button>
        </div>
        <pre>{output.body}</pre>
      </article>

      <div className="experiment-prescription">
        <div className="block-title-row"><h3>单变量成交实验处方</h3><span>可停止 · 可回滚</span></div>
        <div className="prescription-grid">
          <div><span>只改什么</span><strong>{plan.singleVariable}</strong></div>
          <div><span>保持不变</span><strong>{plan.control}</strong></div>
          <div><span>主指标</span><strong>{plan.primaryMetric}</strong></div>
          <div><span>护栏指标</span><strong>{plan.guardrailMetric}</strong></div>
          <div><span>最低样本</span><strong>{plan.minimumSample}</strong></div>
          <div><span>观察周期</span><strong>{plan.observationWindow}</strong></div>
        </div>
        <p><b>停止：</b>{plan.stopCondition}</p>
        <p><b>回滚：</b>{plan.rollbackCondition}</p>
      </div>

      <div className="feedback-card">
        <div className="block-title-row"><h3>老板实际怎么选？</h3><span>进入复盘记忆</span></div>
        <div className="status-row four-statuses">
          {(Object.keys(statusLabels) as AdoptionStatus[]).map((value) => (
            <button className={status === value ? "active" : ""} key={value} onClick={() => setStatus(value)} type="button">{statusLabels[value]}</button>
          ))}
        </div>
        <label><span>采用、拒绝或经营限制</span><textarea rows={2} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="例如：商品标题不能改，但详情页可以调整。" /></label>
        <label><span>执行结果，没有结果可留空</span><textarea rows={2} value={outcome} onChange={(event) => setOutcome(event.target.value)} placeholder="例如：已跑满100次商品点击，加购率没有变化。" /></label>
        <button className="secondary-button" onClick={() => onSaveFeedback(status, reason, outcome)} type="button">保存反馈并生成第二轮</button>
      </div>

      {memory && (
        <div className="memory-record">
          <span>最近一次结构化记忆</span>
          <strong>{statusLabels[memory.status]} · 方案{memory.strategy} · {memory.experimentId}</strong>
          <p>{memory.reason || "未填写原因"}</p>
          {memory.outcome ? <p>结果：{memory.outcome}</p> : null}
        </div>
      )}
    </section>
  );
}
