import { demoScenarios } from "../data/demoCase";
import type { DemoScenarioId } from "../data/demoCase";
import type { DataSourceType, DemoInput, MoneyAiRunStatus } from "../types";

interface InputPanelProps {
  input: DemoInput;
  error: string | null;
  onChange: (next: DemoInput) => void;
  onAnalyze: () => void;
  onMoneyAiAnalyze: () => void;
  onLoadScenario: (id: DemoScenarioId) => void;
  onReset: () => void;
  moneyAiRun: MoneyAiRunStatus;
}

export function InputPanel({
  input,
  error,
  onChange,
  onAnalyze,
  onMoneyAiAnalyze,
  onLoadScenario,
  onReset,
  moneyAiRun,
}: InputPanelProps) {
  const updateField = <K extends keyof DemoInput>(key: K, value: DemoInput[K]) => {
    onChange({ ...input, [key]: value });
  };

  const updateContext = <K extends keyof DemoInput["dataContext"]>(
    key: K,
    value: DemoInput["dataContext"][K],
  ) => {
    onChange({ ...input, dataContext: { ...input.dataContext, [key]: value } });
  };

  const updateMetric = (key: keyof DemoInput["metrics"], value: string) => {
    onChange({ ...input, metrics: { ...input.metrics, [key]: Number(value) || 0 } });
  };

  return (
    <section className="panel input-panel">
      <div className="panel-heading">
        <span className="step-number">01</span>
        <div><p className="eyebrow">输入与事实确认</p><h2>把成交现场交进来</h2></div>
      </div>

      <div className="scenario-switcher">
        <span>三类验收场景</span>
        <div>
          {demoScenarios.map((scenario) => (
            <button key={scenario.id} onClick={() => onLoadScenario(scenario.id)} type="button" title={`预期路由：${scenario.expectedRoute}`}>
              {scenario.label}
            </button>
          ))}
        </div>
      </div>

      <div className="field-grid two-columns">
        <label>
          <span>数据来源</span>
          <select value={input.dataContext.sourceType} onChange={(event) => updateContext("sourceType", event.target.value as DataSourceType)}>
            <option value="synthetic">合成演示数据</option>
            <option value="merchant_export">商家授权脱敏导出</option>
            <option value="public_real">公开真实电商数据</option>
          </select>
        </label>
        <label><span>商家</span><input value={input.merchantName} onChange={(event) => updateField("merchantName", event.target.value)} /></label>
      </div>

      <div className="field-grid two-columns">
        <label><span>数据开始</span><input type="date" value={input.dataContext.windowStart} onChange={(event) => updateContext("windowStart", event.target.value)} /></label>
        <label><span>数据结束</span><input type="date" value={input.dataContext.windowEnd} onChange={(event) => updateContext("windowEnd", event.target.value)} /></label>
      </div>

      <div className="field-grid two-columns">
        <label><span>具体商品</span><input value={input.productName} onChange={(event) => updateField("productName", event.target.value)} /></label>
        <label><span>价格（元）</span><input value={input.price} inputMode="decimal" onChange={(event) => updateField("price", event.target.value)} /></label>
      </div>

      <label><span>目标用户</span><input value={input.targetCustomer} onChange={(event) => updateField("targetCustomer", event.target.value)} /></label>

      <div className="metric-grid five-columns">
        {([
          ["videoViews", "播放"],
          ["productClicks", "点击"],
          ["addToCarts", "加购"],
          ["createdOrders", "订单"],
          ["paidOrders", "支付"],
        ] as const).map(([key, label]) => (
          <label className="metric-field" key={key}>
            <span>{label}</span>
            <input type="number" min="0" value={input.metrics[key]} onChange={(event) => updateMetric(key, event.target.value)} />
          </label>
        ))}
      </div>

      <details>
        <summary>查看14项核心字段与经营材料</summary>
        <div className="field-grid two-columns">
          <label><span>类目</span><input value={input.category} onChange={(event) => updateField("category", event.target.value)} /></label>
          <label><span>商品ID</span><input value={input.dataContext.productId} onChange={(event) => updateContext("productId", event.target.value)} /></label>
        </div>
        <label><span>内容ID</span><input value={input.dataContext.contentId} onChange={(event) => updateContext("contentId", event.target.value)} /></label>
        <label><span>已确认商品事实</span><textarea rows={4} value={input.productFacts} onChange={(event) => updateField("productFacts", event.target.value)} /></label>
        <label><span>当前商品页表达</span><textarea rows={3} value={input.currentProductCopy} onChange={(event) => updateField("currentProductCopy", event.target.value)} /></label>
        <label><span>经营限制</span><textarea rows={3} value={input.constraints} onChange={(event) => updateField("constraints", event.target.value)} /></label>
        <label><span>顾客高频问题</span><textarea rows={4} value={input.customerQuestions} onChange={(event) => updateField("customerQuestions", event.target.value)} /></label>
      </details>

      {error && <div className="error-message">{error}</div>}

      <div className="panel-actions">
        <button className="primary-button" disabled={moneyAiRun.state === "running"} onClick={onMoneyAiAnalyze} type="button">
          {moneyAiRun.state === "running" ? "MoneyAI分析中…" : "MoneyAI总控分析"}
        </button>
        <button className="ghost-button" onClick={onAnalyze} type="button">可信规则分析</button>
        <button className="ghost-button" onClick={onReset} type="button">清空记忆</button>
      </div>
    </section>
  );
}
