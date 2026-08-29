import type {
  AnalysisResult,
  AnalysisSource,
  BreakpointStage,
  MoneyAiRunStatus,
  StrategyId,
} from "../types";

interface AnalysisPanelProps {
  analysis: AnalysisResult | undefined;
  gateMessage?: string;
  selectedStrategy: StrategyId;
  onSelectStrategy: (strategy: StrategyId) => void;
  source: AnalysisSource;
  moneyAiRun: MoneyAiRunStatus;
}

const confidenceLabels = { low: "低置信", medium: "中置信", high: "高置信" } as const;

export function AnalysisPanel({
  analysis,
  gateMessage,
  selectedStrategy,
  onSelectStrategy,
  source,
  moneyAiRun,
}: AnalysisPanelProps) {
  if (!analysis) {
    return (
      <section className="panel analysis-panel">
        <div className="panel-heading">
          <span className="step-number">02</span>
          <div><p className="eyebrow">质检、路由与诊断</p><h2>先找一处最值得验证</h2></div>
        </div>
        <div className="error-message">数据未通过质检：{gateMessage ?? "请修正漏斗数据后重新发起分析。"}</div>
      </section>
    );
  }

  const rates: Array<[BreakpointStage, string, number]> = [
    ["content_click", "播放→点击", analysis.rates.viewToClick],
    ["click_cart", "点击→加购", analysis.rates.clickToCart],
    ["cart_order", "加购→订单", analysis.rates.cartToOrder],
    ["order_pay", "订单→支付", analysis.rates.orderToPay],
  ];

  return (
    <section className="panel analysis-panel">
      <div className="panel-heading">
        <span className="step-number">02</span>
        <div><p className="eyebrow">质检、路由与诊断</p><h2>先找一处最值得验证</h2></div>
      </div>

      <div className={`quality-card ${analysis.dataQuality.confidence}`}>
        <div>
          <span>数据质量</span>
          <strong>{analysis.dataQuality.score}/100 · {analysis.dataQuality.label}</strong>
        </div>
        <b>{analysis.dataQuality.sourceLabel} · {confidenceLabels[analysis.dataQuality.confidence]}</b>
        <p>{analysis.dataQuality.issues[0]}</p>
      </div>

      <div className="funnel-row four-rates">
        {rates.map(([stage, label, value], index) => (
          <div className={analysis.breakpointStage === stage ? "rate-warning" : ""} key={stage}>
            <span>{label}</span><strong>{value}%</strong>{index < rates.length - 1 ? <i>→</i> : null}
          </div>
        ))}
      </div>

      <div className={`analysis-source ${source}`}>
        <strong>{source === "moneyai" ? "MoneyAI总控推理＋本地事实锁定" : "本地可信规则＋真实Skill路由"}</strong>
        <span>
          {source === "moneyai"
            ? `${moneyAiRun.model} · 请求 ${moneyAiRun.requestId}`
            : moneyAiRun.state === "error" ? moneyAiRun.message : "模型失败时仍保留质检、断点和实验处方"}
        </span>
      </div>

      <div className="skill-trace">
        <div className="block-title-row"><h3>本次真实调用链</h3><span>{analysis.skillTrace.length}个 Skills</span></div>
        <div className="skill-flow">
          {analysis.skillTrace.map((skill, index) => (
            <div key={skill.id} title={skill.reason}>
              <span>{skill.label}</span>{index < analysis.skillTrace.length - 1 ? <i>→</i> : null}
            </div>
          ))}
        </div>
      </div>

      {analysis.memoryAdjustment && (
        <div className="memory-banner"><span>复盘记忆已改变本轮建议</span><p>{analysis.memoryAdjustment}</p></div>
      )}

      <div className="breakpoint-card">
        <p className="eyebrow">最高优先级断点</p>
        <h3>{analysis.breakpointTitle}</h3>
        <p>{analysis.breakpointSummary}</p>
      </div>

      <div className="analysis-block">
        <h3>已确认事实</h3>
        <ul className="evidence-list">{analysis.evidence.map((item) => <li key={item}>{item}</li>)}</ul>
      </div>

      <div className="hypothesis-card"><span>待验证假设</span><p>{analysis.hypothesis}</p></div>

      <div className="analysis-block">
        <div className="block-title-row"><h3>选择一条改法</h3><span>推荐A</span></div>
        <div className="strategy-list">
          {analysis.options.map((option) => (
            <button className={`strategy-card ${selectedStrategy === option.id ? "selected" : ""}`} key={option.id} onClick={() => onSelectStrategy(option.id)} type="button">
              <span className="strategy-id">{option.id}</span>
              <div><h4>{option.title}</h4><p>{option.action}</p><small>代价：{option.cost}</small><small>风险：{option.risk}</small></div>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
