import { useEffect, useMemo, useState } from "react";
import { checkMoneyAiHealth, fetchExperimentFeedback, requestMoneyAiAnalysis, saveExperimentFeedback } from "./adapters/moneyAi";
import { AnalysisPanel } from "./components/AnalysisPanel";
import { BossJourney } from "./components/BossJourney";
import { DecisionCanvas } from "./components/DecisionCanvas";
import { InputPanel } from "./components/InputPanel";
import { OutputPanel } from "./components/OutputPanel";
import { cloneDemoCase } from "./data/demoCase";
import type { DemoScenarioId } from "./data/demoCase";
import { buildAnalysis, validateInput } from "./engine/analyze";
import type { BossJourneyStep } from "./engine/bossFlow";
import type {
  AdoptionStatus,
  AnalysisSource,
  DemoInput,
  MemoryRecord,
  MemoryStore,
  MoneyAiAnalysisResponse,
  MoneyAiHealth,
  MoneyAiRunStatus,
  StrategyId,
} from "./types";

const STORAGE_KEY = "douyin-conversion-agent-memory-v1";
type AppMode = "boss" | "professional";

// 老板模式的反馈原因必须是老板当轮的真实选择；不能把经营限制整段存进记忆，
// 否则“不能降价／不打冰／续航”会被误记为老板反馈并污染第二轮改判。
const bossOutcomeReasons: Record<AdoptionStatus, string> = {
  adopted: "老板确认已完整执行本轮方案。",
  partial: "老板确认只执行了一部分本轮方案。",
  declined: "老板确认没有采用本轮方案。",
  pending: "老板还没有执行本轮方案。",
};

function loadMemoryStore(): MemoryStore {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<MemoryStore>) : undefined;
    return parsed?.version === 1 && Array.isArray(parsed.records)
      ? { version: 1, records: parsed.records as MemoryRecord[] }
      : { version: 1, records: [] };
  } catch {
    return { version: 1, records: [] };
  }
}

export default function App() {
  const [input, setInput] = useState<DemoInput>(() => cloneDemoCase());
  const [memoryStore, setMemoryStore] = useState<MemoryStore>(() => loadMemoryStore());
  const [showSavedMemory, setShowSavedMemory] = useState(false);
  const [selectedStrategy, setSelectedStrategy] = useState<StrategyId>("A");
  const [appMode, setAppMode] = useState<AppMode>("boss");
  const [bossStep, setBossStep] = useState<BossJourneyStep>("quality");
  const [visitedBossSteps, setVisitedBossSteps] = useState<Set<string>>(() => new Set(["data"]));
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [moneyAiHealth, setMoneyAiHealth] = useState<MoneyAiHealth>({
    state: "checking",
    message: "正在检查MoneyAI本地服务",
  });
  const [moneyAiResult, setMoneyAiResult] = useState<MoneyAiAnalysisResponse>();
  const [moneyAiRun, setMoneyAiRun] = useState<MoneyAiRunStatus>({
    state: "idle",
    message: "尚未发起真实推理",
  });
  const [serverSyncedPairs, setServerSyncedPairs] = useState<Set<string>>(() => new Set());

  const storedMemory = useMemo(
    () =>
      memoryStore.records.find(
        (item) => item.merchantName === input.merchantName && item.productName === input.productName,
      ),
    [input.merchantName, input.productName, memoryStore.records],
  );
  const memory = showSavedMemory ? storedMemory : undefined;
  // 数据门：本地诊断只在输入通过质检时计算；校验失败时 analysis 为 undefined，
  // 下游面板渲染「数据未通过质检」占位，不再展示基于非法输入的断点、证据与实验处方。
  const inputGateError = useMemo(() => validateInput(input), [input]);
  const localAnalysis = useMemo(
    () => (inputGateError === null ? buildAnalysis(input, memory) : undefined),
    [input, memory, inputGateError],
  );
  const analysis = moneyAiResult?.analysis ?? localAnalysis;
  const analysisSource: AnalysisSource = moneyAiResult ? "moneyai" : "local";

  useEffect(() => {
    void checkMoneyAiHealth().then(setMoneyAiHealth);
  }, []);

  // 服务端反馈水合：localStorage 没有该商家+商品的记录时，从 BFF 拉取最近一次反馈（跨浏览器恢复第二轮复盘）。
  // “重新开始演示”会把当前组合记入 serverSyncedPairs，避免清空后又从服务端复活。
  useEffect(() => {
    const pairKey = `${input.merchantName}||${input.productName}`;
    if (serverSyncedPairs.has(pairKey)) return;
    let cancelled = false;
    void fetchExperimentFeedback(input.merchantName, input.productName).then((record) => {
      setServerSyncedPairs((previous) => new Set(previous).add(pairKey));
      if (cancelled || !record) return;
      setMemoryStore((previous) => {
        const exists = previous.records.some(
          (item) => item.merchantName === input.merchantName && item.productName === input.productName,
        );
        if (exists) return previous;
        return { version: 1, records: [...previous.records, record].slice(0, 20) };
      });
    });
    return () => {
      cancelled = true;
    };
  }, [input.merchantName, input.productName, serverSyncedPairs]);

  const clearAiResult = (message: string) => {
    setMoneyAiResult(undefined);
    setMoneyAiRun({ state: "idle", message });
  };

  const restartBossJourney = () => {
    setBossStep("quality");
    setVisitedBossSteps(new Set(["data"]));
    setShowSavedMemory(false);
  };

  const moveBossStep = (next: BossJourneyStep, completed: string[] = []) => {
    setVisitedBossSteps((previous) => {
      const nextVisited = new Set(previous);
      nextVisited.add(bossStep);
      completed.forEach((step) => nextVisited.add(step));
      return nextVisited;
    });
    setBossStep(next);
  };

  const runAnalysis = () => {
    const validationError = validateInput(input);
    if (validationError) {
      setError(validationError);
      return;
    }
    setError(null);
    clearAiResult("当前显示本地规则与Skill路由结果");
    setNotice("已完成数据质检、五段漏斗诊断与专家Skill路由。");
  };

  const runMoneyAiAnalysis = async () => {
    const validationError = validateInput(input);
    if (validationError) {
      setError(validationError);
      return;
    }
    if (moneyAiHealth.state !== "available") {
      setError("MoneyAI当前不可用，请先使用本地规则分析。");
      return;
    }
    if (!localAnalysis) {
      setError(inputGateError ?? "本地诊断未通过数据质检，无法发起MoneyAI分析。");
      return;
    }

    setError(null);
    setMoneyAiResult(undefined);
    setMoneyAiRun({ state: "running", message: "MoneyAI正在依据已路由Skill生成成交实验" });
    setNotice("MoneyAI → Codex总控推理已发起；断点与数据事实由本地规则锁定。");

    try {
      const result = await requestMoneyAiAnalysis(input, memory, localAnalysis);
      setMoneyAiResult(result);
      setMoneyAiRun({
        state: "success",
        message: "MoneyAI → Codex总控推理已完成",
        requestId: result.requestId,
        model: result.model,
      });
      setNotice(`MoneyAI推理完成，请求编号：${result.requestId}`);
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : "MoneyAI调用失败";
      setMoneyAiRun({ state: "error", message });
      setNotice(`${message}；页面已自动保留本地可信诊断结果。`);
    }
  };

  const updateInput = (next: DemoInput) => {
    setInput(next);
    restartBossJourney();
    clearAiResult("输入已改变，请重新发起MoneyAI分析");
  };

  const loadScenario = (id: DemoScenarioId) => {
    setInput(cloneDemoCase(id));
    setSelectedStrategy("A");
    setAppMode("boss");
    restartBossJourney();
    setError(null);
    clearAiResult("已载入新场景，请运行分析");
    setNotice("已切换合成场景，可验证不同断点与Skill路由。");
  };

  const resetDemo = () => {
    setInput(cloneDemoCase());
    setSelectedStrategy("A");
    setAppMode("boss");
    restartBossJourney();
    setMemoryStore({ version: 1, records: [] });
    setServerSyncedPairs((previous) => new Set(previous).add(`${input.merchantName}||${input.productName}`));
    setError(null);
    clearAiResult("尚未发起真实推理");
    setNotice("已恢复商品信任场景，并清空全部演示记忆。");
    window.localStorage.removeItem(STORAGE_KEY);
  };

  const saveFeedback = (status: AdoptionStatus, reason: string, outcome: string) => {
    if (!analysis) return;
    const nextMemory: MemoryRecord = {
      experimentId: analysis.experimentPlans[selectedStrategy].experimentId,
      merchantName: input.merchantName,
      productName: input.productName,
      status,
      strategy: selectedStrategy,
      reason: reason.trim(),
      outcome: outcome.trim(),
      savedAt: new Date().toISOString(),
    };
    const nextStore: MemoryStore = {
      version: 1,
      records: [nextMemory, ...memoryStore.records.filter(
        (item) => item.merchantName !== input.merchantName || item.productName !== input.productName,
      )].slice(0, 20),
    };

    setMemoryStore(nextStore);
    setShowSavedMemory(true);
    clearAiResult("反馈已改变诊断上下文，请重新发起MoneyAI分析");
    setNotice("反馈已保存。复盘记忆Skill已加入第二轮调用链，建议已重新排序。");
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextStore));
    } catch {
      setNotice("第二轮建议已生成，但浏览器未允许持久保存。");
    }
    void saveExperimentFeedback(nextMemory);
  };

  const saveBossOutcome = (status: AdoptionStatus, outcome: string, next: BossJourneyStep) => {
    saveFeedback(status, bossOutcomeReasons[status], outcome);
    moveBossStep(next, ["result"]);
  };

  const showSavedReview = () => {
    setShowSavedMemory(true);
    setBossStep("iterate");
    setVisitedBossSteps(new Set(["data", "quality", "diagnose", "confirm", "action", "sample", "result"]));
    clearAiResult("已载入同一商家与商品的最近一次反馈");
    setNotice("已载入最近一次复盘，系统会显示第二轮建议。");
  };

  return (
    <main className="app-shell">
      <header className="hero">
        <div className="brand-mark" aria-hidden="true"><span /><span /><span /></div>
        <div className="hero-copy">
          <p className="eyebrow">DOUYIN CONVERSION EXPERIMENT AGENT</p>
          <h1>抖音成交实验 Agent</h1>
          <p>让每一次不出单，都换来下一步最该验证的动作。</p>
        </div>
        <div className="system-status">
          <span className={`status-dot ${moneyAiHealth.state}`} />
          <div>
            <strong>{moneyAiHealth.state === "available" ? "MoneyAI在线" : moneyAiHealth.state === "mock" ? "Mock演示模式" : "本地可信模式"}</strong>
            <small>{moneyAiHealth.message}</small>
          </div>
        </div>
      </header>

      <div className="scope-strip">
        <span>线上实物电商</span><i /><span>一个商品</span><i /><span>一个实验</span><i /><span>两轮复盘</span>
        <b>{appMode === "boss" ? "一次只回答一个问题 · 不承诺成交增长" : analysis ? `${analysis.dataQuality.sourceLabel} · 证据质量 ${analysis.dataQuality.score}/100` : "数据未通过质检 · 暂无可用诊断"}</b>
      </div>

      {notice && <button className="notice" onClick={() => setNotice(null)} type="button">{notice}<span>×</span></button>}

      <div className="mode-toolbar">
        <div className="mode-switch" aria-label="页面模式">
          <button className={appMode === "boss" ? "active" : ""} onClick={() => setAppMode("boss")} type="button">老板使用</button>
          <button className={appMode === "professional" ? "active" : ""} onClick={() => setAppMode("professional")} type="button">专业详情</button>
        </div>
        <div className="mode-actions">
          {storedMemory && !showSavedMemory ? <button onClick={showSavedReview} type="button">查看已保存第二轮</button> : null}
          <button onClick={resetDemo} type="button">重新开始演示</button>
        </div>
      </div>

      {appMode === "boss" ? (
        <div className="boss-workspace">
          {analysis ? (
            <DecisionCanvas analysis={analysis} activeStep={bossStep} visitedSteps={visitedBossSteps} selectedStrategy={selectedStrategy} />
          ) : (
            <section className="decision-canvas-card" aria-label="成交决策流程图">
              <div className="decision-canvas-heading">
                <div>
                  <span>你的成交诊断路径</span>
                  <strong>数据未通过质检，暂不生成诊断路径</strong>
                </div>
              </div>
              <div className="error-message">数据未通过质检：{inputGateError ?? "请修正漏斗数据后重新发起分析。"}</div>
            </section>
          )}
          <BossJourney
            input={input}
            analysis={analysis}
            gateMessage={inputGateError ?? undefined}
            source={analysisSource}
            activeStep={bossStep}
            selectedStrategy={selectedStrategy}
            moneyAiHealth={moneyAiHealth}
            moneyAiRun={moneyAiRun}
            onMove={moveBossStep}
            onAnalyze={runAnalysis}
            onMoneyAiAnalyze={runMoneyAiAnalysis}
            onSelectStrategy={setSelectedStrategy}
            onOpenProfessional={() => setAppMode("professional")}
            onSaveOutcome={saveBossOutcome}
          />
          <details className="professional-proof">
            <summary><span>查看系统怎么判断</span><small>数据质量、漏斗、Skill和MoneyAI证据</small></summary>
            <AnalysisPanel analysis={analysis} gateMessage={inputGateError ?? undefined} selectedStrategy={selectedStrategy} onSelectStrategy={setSelectedStrategy} source={analysisSource} moneyAiRun={moneyAiRun} />
          </details>
        </div>
      ) : (
        <div className="pipeline-grid">
          <InputPanel input={input} error={error} onAnalyze={runAnalysis} onChange={updateInput} onLoadScenario={loadScenario} onMoneyAiAnalyze={runMoneyAiAnalysis} onReset={resetDemo} moneyAiRun={moneyAiRun} />
          <AnalysisPanel analysis={analysis} gateMessage={inputGateError ?? undefined} selectedStrategy={selectedStrategy} onSelectStrategy={setSelectedStrategy} source={analysisSource} moneyAiRun={moneyAiRun} />
          <OutputPanel analysis={analysis} gateMessage={inputGateError ?? undefined} memory={memory} selectedStrategy={selectedStrategy} onSaveFeedback={saveFeedback} />
        </div>
      )}

      <footer>
        <span>黑客松演示版本 V0.4 · 老板可理解成交决策流</span>
        <span>{analysis ? `${analysis.dataQuality.sourceLabel} · 不承诺成交增长` : "数据未通过质检 · 不承诺成交增长"}</span>
      </footer>
    </main>
  );
}
