import { useState } from "react";
import type { BossJourneyStep } from "../engine/bossFlow";
import type {
  AdoptionStatus,
  AnalysisResult,
  AnalysisSource,
  DemoInput,
  MoneyAiHealth,
  MoneyAiRunStatus,
  StrategyId,
} from "../types";

interface BossJourneyProps {
  input: DemoInput;
  analysis: AnalysisResult | undefined;
  gateMessage?: string;
  source: AnalysisSource;
  activeStep: BossJourneyStep;
  selectedStrategy: StrategyId;
  moneyAiHealth: MoneyAiHealth;
  moneyAiRun: MoneyAiRunStatus;
  onMove: (next: BossJourneyStep, completed?: string[]) => void;
  onAnalyze: () => void;
  onMoneyAiAnalyze: () => void;
  onSelectStrategy: (strategy: StrategyId) => void;
  onOpenProfessional: () => void;
  onSaveOutcome: (status: AdoptionStatus, outcome: string, next: BossJourneyStep) => void;
}

const metricLabels = [
  ["videoViews", "播放"],
  ["productClicks", "点击"],
  ["addToCarts", "加购"],
  ["createdOrders", "订单"],
  ["paidOrders", "支付"],
] as const;

export function BossJourney({
  input,
  analysis,
  gateMessage,
  source,
  activeStep,
  selectedStrategy,
  moneyAiHealth,
  moneyAiRun,
  onMove,
  onAnalyze,
  onMoneyAiAnalyze,
  onSelectStrategy,
  onOpenProfessional,
  onSaveOutcome,
}: BossJourneyProps) {
  const [copied, setCopied] = useState(false);

  if (!analysis) {
    return (
      <section className="boss-journey-card">
        <p className="boss-question-kicker">数据未通过质检</p>
        <h2>先修正数据，再开始诊断</h2>
        <p className="boss-question-copy">当前输入没有通过数据质检，系统不会基于这组数据生成断点、证据或实验方案。</p>
        <div className="boss-help-card warning"><strong>质检未通过</strong><span>{gateMessage ?? "请检查漏斗数据后重新发起分析。"}</span></div>
        <div className="boss-button-row">
          <button className="primary-button" onClick={onOpenProfessional} type="button">打开完整数据输入</button>
        </div>
      </section>
    );
  }

  const option = analysis.options.find((item) => item.id === selectedStrategy) ?? analysis.options[0];
  const alternative = analysis.options.find((item) => item.id !== selectedStrategy) ?? analysis.options[1];
  const output = analysis.outputs[selectedStrategy];
  const plan = analysis.experimentPlans[selectedStrategy];

  const copyTodayAction = async () => {
    const text = [
      `今天只做一件事：${option.title}`,
      option.action,
      output.headline,
      output.body,
      `至少观察：${plan.minimumSample}`,
      `主要看：${plan.primaryMetric}`,
      `停止：${plan.stopCondition}`,
      `回滚：${plan.rollbackCondition}`,
    ].join("\n\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  const qualityStep = (
    <>
      <p className="boss-question-kicker">第1步 · 先检查数据</p>
      <h2>这组数据能代表同一件商品吗？</h2>
      <p className="boss-question-copy">系统需要同一商品、同一时间窗的五个数字，缺数据时不会强行判断。</p>
      <div className="boss-product-line"><strong>{input.productName}</strong><span>{input.dataContext.windowStart} 至 {input.dataContext.windowEnd}</span></div>
      <div className="boss-metrics">
        {metricLabels.map(([key, label]) => <div key={key}><span>{label}</span><strong>{input.metrics[key].toLocaleString()}</strong></div>)}
      </div>
      <div className="boss-choice-row three-choices">
        <button className="boss-choice primary" onClick={() => { onAnalyze(); onMove("confirm", ["quality", "diagnose"]); }} type="button"><b>是</b><span>数据没问题，开始诊断</span></button>
        <button className="boss-choice" onClick={() => onMove("missing", ["quality"])} type="button"><b>否</b><span>我没有完整数据</span></button>
        <button className="boss-choice" onClick={() => onMove("missing", ["quality"])} type="button"><b>?</b><span>我不确定数据是否完整</span></button>
      </div>
    </>
  );

  const missingStep = (
    <>
      <p className="boss-question-kicker">缺数据时先停一下</p>
      <h2>先补齐这五个数字，再判断哪里不出单</h2>
      <p className="boss-question-copy">播放、商品点击、加购、创建订单、支付，必须来自同一商品和同一时间窗。</p>
      <div className="boss-help-card"><strong>你不需要懂报表</strong><span>把对应后台截图或脱敏导出交进来即可，系统会检查顺序和样本量。</span></div>
      <div className="boss-button-row">
        <button className="primary-button" onClick={() => onMove("quality")} type="button">我补好了，重新检查</button>
        <button className="ghost-button" onClick={onOpenProfessional} type="button">打开完整数据输入</button>
      </div>
    </>
  );

  const confirmStep = (
    <>
      <p className="boss-question-kicker">第2步 · 系统找到最值得先查的一步</p>
      <h2>{analysis.breakpointTitle}</h2>
      <p className="boss-question-copy">{analysis.breakpointSummary}</p>
      <div className="boss-verdict"><span>系统看到</span><strong>{analysis.evidence[1]}</strong><small>这只是优先验证顺序，不是行业因果结论。</small></div>
      <h3>这符合你平时看到的情况吗？</h3>
      <div className="boss-choice-row three-choices">
        <button className="boss-choice primary" onClick={() => onMove("action", ["confirm"])} type="button"><b>是</b><span>就是这个问题</span></button>
        <button className="boss-choice" onClick={onOpenProfessional} type="button"><b>否</b><span>实际情况不是这样</span></button>
        <button className="boss-choice" onClick={() => onMove("evidence", ["confirm"])} type="button"><b>?</b><span>我还不能确定</span></button>
      </div>
    </>
  );

  const evidenceStep = (
    <>
      <p className="boss-question-kicker">不确定没有关系</p>
      <h2>先把事实和猜测分开</h2>
      <div className="boss-help-card"><strong>已经确认</strong><span>{analysis.evidence[0]}</span></div>
      <div className="boss-help-card warning"><strong>还要验证</strong><span>{analysis.hypothesis}</span></div>
      <div className="boss-button-row">
        <button className="primary-button" onClick={() => onMove("action", ["evidence"])} type="button">先做一个小实验验证</button>
        <button className="ghost-button" onClick={onOpenProfessional} type="button">我要修正事实</button>
      </div>
    </>
  );

  const actionStep = (
    <>
      <p className="boss-question-kicker">第3步 · 今天只做一件事</p>
      <h2>{option.title}</h2>
      <p className="boss-question-copy">{option.action}</p>
      <div className="boss-tradeoff"><span><b>需要付出：</b>{option.cost}</span><span><b>要注意：</b>{option.risk}</span></div>
      <h3>这件事你今天做得到吗？</h3>
      <div className="boss-choice-row three-choices">
        <button className="boss-choice primary" onClick={() => onMove("sample", ["action"])} type="button"><b>是</b><span>我能执行</span></button>
        <button className="boss-choice" onClick={() => { onSelectStrategy(alternative.id); onMove("alternative", ["action"]); }} type="button"><b>否</b><span>这个动作我做不到</span></button>
        <button className="boss-choice" onClick={() => { onSelectStrategy(alternative.id); onMove("alternative", ["action"]); }} type="button"><b>换</b><span>不适合我的店</span></button>
      </div>
    </>
  );

  const alternativeStep = (
    <>
      <p className="boss-question-kicker">根据经营限制换一个动作</p>
      <h2>{analysis.options.find((item) => item.id === selectedStrategy)?.title}</h2>
      <p className="boss-question-copy">{analysis.options.find((item) => item.id === selectedStrategy)?.action}</p>
      <div className="boss-help-card"><strong>为什么换</strong><span>系统保留同一个成交问题，只把动作改成老板做得到的版本。</span></div>
      <div className="boss-button-row">
        <button className="primary-button" onClick={() => onMove("sample", ["alternative"])} type="button">这个动作可以做</button>
        <button className="ghost-button" onClick={onOpenProfessional} type="button">补充我的经营限制</button>
      </div>
    </>
  );

  const sampleStep = (
    <>
      <p className="boss-question-kicker">第4步 · 拿走成品并开始验证</p>
      <h2>{output.headline}</h2>
      <pre className="boss-output">{output.body}</pre>
      <div className="boss-experiment-strip">
        <div><span>这次只改</span><strong>{plan.singleVariable}</strong></div>
        <div><span>至少观察</span><strong>{plan.minimumSample}</strong></div>
        <div><span>主要看</span><strong>{plan.primaryMetric}</strong></div>
      </div>
      <div className="boss-button-row wrap">
        <button className="primary-button" onClick={copyTodayAction} type="button">{copied ? "已经复制" : "复制今天的动作"}</button>
        <button className="secondary-button" onClick={() => onMove("result", ["sample"])} type="button">我已经开始执行</button>
        <button className="ghost-button" disabled={moneyAiRun.state === "running" || moneyAiHealth.state === "unavailable"} onClick={onMoneyAiAnalyze} type="button">
          {moneyAiRun.state === "running" ? "MoneyAI生成中…" : source === "moneyai" ? "MoneyAI已经生成" : moneyAiHealth.state === "mock" ? "让BFF生成契约演示版" : "让MoneyAI生成贴合版本"}
        </button>
      </div>
      {moneyAiRun.state === "success" ? <p className="boss-proof">MoneyAI已返回，请求 {moneyAiRun.requestId}；数据事实仍由本地规则锁定。</p> : null}
    </>
  );

  const resultStep = (
    <>
      <p className="boss-question-kicker">第5步 · 把执行结果交回来</p>
      <h2>跑满最低样本以后，结果怎么样？</h2>
      <p className="boss-question-copy">没有跑满样本时先继续观察，不提前宣布有效或无效。</p>
      <div className="boss-choice-row four-choices">
        <button className="boss-choice primary" onClick={() => onSaveOutcome("adopted", `已达到${plan.minimumSample}，${plan.primaryMetric}改善。`, "keep")} type="button"><b>↑</b><span>变好了</span></button>
        <button className="boss-choice" onClick={() => onSaveOutcome("partial", `已达到${plan.minimumSample}，${plan.primaryMetric}没有变化。`, "iterate")} type="button"><b>＝</b><span>没变化</span></button>
        <button className="boss-choice danger" onClick={() => onSaveOutcome("declined", `${plan.primaryMetric}变差，按回滚条件恢复。`, "iterate")} type="button"><b>↓</b><span>变差了</span></button>
        <button className="boss-choice" onClick={() => onMove("sample")} type="button"><b>…</b><span>还没跑满样本</span></button>
      </div>
    </>
  );

  const finishStep = activeStep === "keep" ? (
    <>
      <p className="boss-question-kicker">这一轮有效</p><h2>保留这项改法，再看下一处问题</h2>
      <div className="boss-help-card success"><strong>系统已经记住</strong><span>{analysis.memoryAdjustment ?? "本轮动作与结果已保存。"}</span></div>
      <button className="primary-button" onClick={() => onMove("action", ["keep"])} type="button">进入下一轮建议</button>
    </>
  ) : (
    <>
      <p className="boss-question-kicker">这一轮没有证明有效</p><h2>停止重复原改法，换一个验证变量</h2>
      <div className="boss-help-card warning"><strong>系统已经记住</strong><span>{analysis.memoryAdjustment ?? "本轮结果已保存，下一轮不重复同一改法。"}</span></div>
      <button className="primary-button" onClick={() => onMove("action", ["iterate"])} type="button">查看第二轮动作</button>
    </>
  );

  const content = activeStep === "quality" ? qualityStep
    : activeStep === "missing" ? missingStep
      : activeStep === "confirm" || activeStep === "diagnose" ? confirmStep
        : activeStep === "evidence" ? evidenceStep
          : activeStep === "action" ? actionStep
            : activeStep === "alternative" ? alternativeStep
              : activeStep === "sample" ? sampleStep
                : activeStep === "result" ? resultStep
                  : finishStep;

  return <section className="boss-journey-card">{content}</section>;
}
