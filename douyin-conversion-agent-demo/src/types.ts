export type DataSourceType = "synthetic" | "merchant_export" | "public_real";

export interface DataContext {
  sourceType: DataSourceType;
  windowStart: string;
  windowEnd: string;
  contentId: string;
  productId: string;
}

export interface FunnelMetrics {
  videoViews: number;
  productClicks: number;
  addToCarts: number;
  createdOrders: number;
  paidOrders: number;
}

export interface DemoInput {
  merchantName: string;
  category: string;
  productName: string;
  price: string;
  targetCustomer: string;
  productFacts: string;
  currentProductCopy: string;
  constraints: string;
  customerQuestions: string;
  dataContext: DataContext;
  metrics: FunnelMetrics;
}

export interface FunnelRates {
  viewToClick: number;
  clickToCart: number;
  cartToOrder: number;
  orderToPay: number;
}

export type BreakpointStage =
  | "content_click"
  | "click_cart"
  | "cart_order"
  | "order_pay";

export type EvidenceConfidence = "low" | "medium" | "high";

export interface DataQualityResult {
  score: number;
  label: string;
  sourceLabel: string;
  confidence: EvidenceConfidence;
  issues: string[];
}

export type SkillId =
  | "data_quality"
  | "content_traffic"
  | "product_value"
  | "trust_objection"
  | "transaction_friction"
  | "experiment_design"
  | "memory_review";

export interface SkillTraceItem {
  id: SkillId;
  label: string;
  reason: string;
}

export interface ExperimentPlan {
  experimentId: string;
  hypothesis: string;
  singleVariable: string;
  control: string;
  action: string;
  primaryMetric: string;
  guardrailMetric: string;
  minimumSample: string;
  observationWindow: string;
  stopCondition: string;
  rollbackCondition: string;
}

export type StrategyId = "A" | "B";

export interface StrategyOption {
  id: StrategyId;
  title: string;
  action: string;
  cost: string;
  risk: string;
}

export interface OutputDraft {
  label: string;
  headline: string;
  body: string;
  experiment: string;
}

export interface AnalysisResult {
  rates: FunnelRates;
  breakpointStage: BreakpointStage;
  breakpointTitle: string;
  breakpointSummary: string;
  evidence: string[];
  hypothesis: string;
  options: StrategyOption[];
  outputs: Record<StrategyId, OutputDraft>;
  dataQuality: DataQualityResult;
  skillTrace: SkillTraceItem[];
  experimentPlans: Record<StrategyId, ExperimentPlan>;
  round: 1 | 2;
  memoryAdjustment?: string;
}

export type AdoptionStatus = "pending" | "adopted" | "partial" | "declined";

export interface MemoryRecord {
  experimentId: string;
  merchantName: string;
  productName: string;
  status: AdoptionStatus;
  strategy: StrategyId;
  reason: string;
  outcome: string;
  savedAt: string;
}

export interface MemoryStore {
  version: 1;
  records: MemoryRecord[];
}

export type MoneyAiHealthState = "checking" | "available" | "mock" | "unavailable";

export interface MoneyAiHealth {
  state: MoneyAiHealthState;
  message: string;
}

export type AnalysisSource = "local" | "moneyai";
export type MoneyAiRunState = "idle" | "running" | "success" | "error";

export interface MoneyAiRunStatus {
  state: MoneyAiRunState;
  message: string;
  requestId?: string;
  model?: string;
}

export interface MoneyAiAnalysisResponse {
  analysis: AnalysisResult;
  requestId: string;
  model: string;
  rawResult: string;
}
