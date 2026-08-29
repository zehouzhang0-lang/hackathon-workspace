import type {
  AnalysisResult,
  DemoInput,
  MemoryRecord,
  MoneyAiAnalysisResponse,
  MoneyAiHealth,
  OutputDraft,
  StrategyId,
  StrategyOption,
} from "../types";

/**
 * MoneyAI 适配器（v2：经 douyin-backend BFF 编排，契约见 douyin-backend/contracts/EXPERIMENT_API.md）
 *
 * 责任边界不变：本地质检、断点、Skill路由、实验合同由前端规则引擎锁定（buildAnalysis）；
 * 模型只产出 hypothesis / options / outputs；断点三字段强制使用本地值（后端亦有同样的覆盖，双保险）。
 */

const HEALTH_URL = "/api/experiment/health";
const SUBMIT_URL = "/api/experiment";
const FEEDBACK_URL = "/api/experiment/feedback";
const POLL_INTERVAL_MS = 1200;
const REQUEST_TIMEOUT_MS = 280_000;
const HEALTH_TIMEOUT_MS = 1800;

interface ExperimentHealthResponse {
  ok?: boolean;
  mode?: string;
  sidecarPort?: string;
  moneyaiReachable?: boolean;
}

interface ExperimentSubmitResponse {
  jobId: string;
  requestId: string;
}

interface ExperimentJobResponse {
  jobId: string;
  requestId: string;
  status: "queued" | "running" | "done" | "error";
  progress?: string;
  error?: string;
  result?: ExperimentResultPayload;
}

interface ExperimentResultPayload {
  requestId: string;
  hypothesis: string;
  options: Record<StrategyId, StrategyOption>;
  outputs: Record<StrategyId, OutputDraft>;
  model?: string;
  rawText?: string;
}

interface LockedDiagnosisPayload {
  breakpointStage: string;
  breakpointTitle: string;
  breakpointSummary: string;
  evidence: string[];
  dataQuality: AnalysisResult["dataQuality"];
  skillTrace: AnalysisResult["skillTrace"];
  experimentPlans: AnalysisResult["experimentPlans"];
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

async function readJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const raw = await response.text();
  let body: T & { error?: string };

  try {
    body = JSON.parse(raw) as T & { error?: string };
  } catch {
    throw new Error(`BFF接口未返回JSON：${url}`);
  }

  if (!response.ok) {
    throw new Error(body.error || `BFF接口返回 ${response.status}`);
  }

  return body;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`MoneyAI结果缺少字段：${key}`);
  }
  return value.trim();
}

function readStrategy(value: unknown, id: StrategyId): StrategyOption {
  if (!isRecord(value)) throw new Error(`MoneyAI缺少方案${id}`);
  return {
    id,
    title: readString(value, "title"),
    action: readString(value, "action"),
    cost: readString(value, "cost"),
    risk: readString(value, "risk"),
  };
}

function readOutput(value: unknown, id: StrategyId): OutputDraft {
  if (!isRecord(value)) throw new Error(`MoneyAI缺少方案${id}的输出成品`);
  return {
    label: readString(value, "label"),
    headline: readString(value, "headline"),
    body: readString(value, "body"),
    experiment: readString(value, "experiment"),
  };
}

/** 对 BFF 返回结果做结构硬化，再叠加本地锁定事实 */
function parseStructuredResult(
  payload: ExperimentResultPayload,
  expectedRequestId: string,
  localAnalysis: AnalysisResult,
): { analysis: AnalysisResult; requestId: string } {
  if (!isRecord(payload as unknown)) throw new Error("MoneyAI结果不是JSON对象");
  const record = payload as unknown as Record<string, unknown>;
  if (payload.requestId !== expectedRequestId) {
    throw new Error("MoneyAI返回的请求编号不匹配");
  }

  const options = payload.options;
  const outputs = payload.outputs;
  if (!isRecord(options as unknown) || !isRecord(outputs as unknown)) {
    throw new Error("MoneyAI结果缺少A/B方案或输出成品");
  }

  return {
    requestId: expectedRequestId,
    analysis: {
      ...localAnalysis,
      // 锁定事实：模型观点不得覆盖
      breakpointTitle: localAnalysis.breakpointTitle,
      breakpointSummary: localAnalysis.breakpointSummary,
      evidence: localAnalysis.evidence,
      dataQuality: localAnalysis.dataQuality,
      skillTrace: localAnalysis.skillTrace,
      experimentPlans: localAnalysis.experimentPlans,
      // 模型产出：假设、A/B方案、可直接使用的成品
      hypothesis: readString(record, "hypothesis"),
      options: [readStrategy(options.A, "A"), readStrategy(options.B, "B")],
      outputs: {
        A: readOutput(outputs.A, "A"),
        B: readOutput(outputs.B, "B"),
      },
    },
  };
}

function buildLockedDiagnosis(analysis: AnalysisResult): LockedDiagnosisPayload {
  return {
    breakpointStage: analysis.breakpointStage,
    breakpointTitle: analysis.breakpointTitle,
    breakpointSummary: analysis.breakpointSummary,
    evidence: analysis.evidence,
    dataQuality: analysis.dataQuality,
    skillTrace: analysis.skillTrace,
    experimentPlans: analysis.experimentPlans,
  };
}

export async function checkMoneyAiHealth(): Promise<MoneyAiHealth> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);

  try {
    const health = await readJson<ExperimentHealthResponse>(HEALTH_URL, { signal: controller.signal });
    if (health.mode === "mock") {
      return { state: "mock", message: "BFF已连接 · mock模式（契约演示，非真实推理）" };
    }
    if (health.moneyaiReachable) {
      return { state: "available", message: `MoneyAI在线 · BFF编排 · sidecar ${health.sidecarPort ?? "auto"}` };
    }
    return { state: "unavailable", message: "BFF已连接，但MoneyAI未启动，本地演示仍可运行" };
  } catch {
    return {
      state: "unavailable",
      message: "BFF未连接（douyin-backend未启动），本地演示仍可运行",
    };
  } finally {
    window.clearTimeout(timeout);
  }
}

export async function requestMoneyAiAnalysis(
  input: DemoInput,
  memory: MemoryRecord | undefined,
  localAnalysis: AnalysisResult,
): Promise<MoneyAiAnalysisResponse> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const submitted = await readJson<ExperimentSubmitResponse>(SUBMIT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        input,
        memory: memory ?? null,
        lockedDiagnosis: buildLockedDiagnosis(localAnalysis),
      }),
    });

    const deadline = Date.now() + REQUEST_TIMEOUT_MS;
    while (Date.now() < deadline) {
      await delay(POLL_INTERVAL_MS);
      const job = await readJson<ExperimentJobResponse>(`${SUBMIT_URL}/${submitted.jobId}`, { signal: controller.signal });

      if (job.status === "done" && job.result) {
        const structured = parseStructuredResult(job.result, submitted.requestId, localAnalysis);
        return {
          analysis: structured.analysis,
          requestId: structured.requestId,
          model: job.result.model?.trim() || "MoneyAI/BFF",
          rawResult: job.result.rawText ?? "",
        };
      }
      if (job.status === "error") {
        throw new Error(job.error?.trim() || "MoneyAI实验失败，已保留本地规则结果");
      }
    }

    throw new Error("MoneyAI分析超时，已保留本地规则结果");
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("MoneyAI分析超时，已保留本地规则结果");
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

/** 反馈上报到 BFF（存档 + 沉淀 MoneyAI 长期记忆）。失败静默返回 false，不打断演示。 */
export async function saveExperimentFeedback(record: MemoryRecord): Promise<boolean> {
  try {
    const body = await readJson<{ ok?: boolean }>(FEEDBACK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ record }),
    });
    return body.ok === true;
  } catch {
    return false;
  }
}

/** 拉取同一商家+商品的服务端反馈（跨浏览器恢复第二轮复盘）。无记录或失败返回 null。 */
export async function fetchExperimentFeedback(merchantName: string, productName: string): Promise<MemoryRecord | null> {
  try {
    const query = `?merchant=${encodeURIComponent(merchantName)}&product=${encodeURIComponent(productName)}`;
    const body = await readJson<{ record?: MemoryRecord | null }>(`${FEEDBACK_URL}${query}`);
    const record = body.record;
    if (!isRecord(record as unknown)) return null;
    const r = record as unknown as Record<string, unknown>;
    if (typeof r.experimentId !== "string" || typeof r.savedAt !== "string") return null;
    return record ?? null;
  } catch {
    return null;
  }
}
