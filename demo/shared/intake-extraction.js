import { createMerchantIntakeDraft, validateMerchantIntakeDraft, mapConfirmedIntakeToAnalysisInput } from './intake-draft.js';
import { MONEYAI_OPERATIONS, freezeMoneyAIRequest, validateMoneyAIResponse } from './moneyai-contract.js';

const VERSION = 'intake.extract.v1';
const ID = /^[A-Za-z0-9_-]{1,80}$/;
const MIMES = new Set(['text/plain', 'text/csv', 'application/json']);
const clone = (value) => structuredClone(value);
const text = (value, limit) => typeof value === 'string' && value.length <= limit && !value.includes('\0');

// This is a project-local gateway client, not an ASR or a simulated extractor.
// Missing capability leaves an editable draft; only a validated real response is ok:true.
export async function requestIntakeExtraction(request, {
  signal, consentToExternalProcessing = false, fetchImpl = globalThis.fetch
} = {}) {
  let fallbackDraft = null, sourceBindings = [], requestContext = null;
  const fallback = (code, message, sentToMoneyAI = false) => ({
    ok: false, code, message, mode: 'manual_review', editable: fallbackDraft !== null,
    draft: fallbackDraft ? clone(fallbackDraft) : null, sourceBindings: clone(sourceBindings),
    requestContext, sentToMoneyAI
  });
  let envelope, body, snapshot;
  try {
    if (!request || !request.state?.round || !request.state?.input) throw new Error('context');
    snapshot = clone(request.state);
    const { transcript, description, sources, materials = [] } = request;
    if (!ID.test(snapshot.round.id) || !Number.isSafeInteger(snapshot.round.inputVersion)
      || snapshot.round.inputVersion < 1 || !text(transcript, 20000) || !text(description, 20000)) throw new Error('context');
    requestContext = { sessionId: snapshot.sessionId, roundId: snapshot.round.id, inputVersion: snapshot.round.inputVersion };
    const base = request.draft ?? createMerchantIntakeDraft({ transcript, sources });
    const validated = validateMerchantIntakeDraft(base);
    if (!validated.ok || base.transcript !== transcript || !Array.isArray(sources)
      || sources.length !== base.sources.length || sources.some((source) => !base.sources.includes(source))) throw new Error('draft');
    fallbackDraft = validated.draft;
    if (!Array.isArray(request.sourceBindings ?? [])) throw new Error('bindings');
    sourceBindings = clone(request.sourceBindings ?? []);
    if (!Array.isArray(materials) || materials.length > 6) throw new Error('materials');
    const seen = new Set();
    for (const material of materials) {
      const current = snapshot.input.materials.find((entry) => entry.id === material?.materialId);
      if (!current || !ID.test(material.materialId) || seen.has(material.materialId)
        || material.materialVersion !== current.version || material.mime !== current.mime || !MIMES.has(material.mime)
        || !text(material.text, 50000)
        || Object.keys(material).some((key) => !['materialId', 'materialVersion', 'mime', 'text'].includes(key))) throw new Error('materials');
      seen.add(material.materialId);
    }
    const transport = request.moneyai;
    if (transport) {
      const frozen = freezeMoneyAIRequest({ operation: MONEYAI_OPERATIONS.intake,
        operationId: transport.operationId, attemptId: transport.attemptId,
        scope: { sessionId: snapshot.sessionId, roundId: snapshot.round.id,
          inputVersion: snapshot.round.inputVersion, analysisId: null, pathId: null,
          artifact: null, feedback: null, inputFingerprint: transport.inputFingerprint },
        consent: { granted: true, sendScope: transport.sendScope, dataClasses: transport.dataClasses },
        payload: { version: VERSION, transcript, description, sources: clone(sources), materials: clone(materials) } });
      envelope = frozen.envelope;
      body = frozen.body;
    }
  } catch {
    return fallback('invalid_intake', '原文、草稿、材料版本或来源不一致；保留当前编辑，请核对后重试。');
  }
  if (signal?.aborted) return fallback('cancelled', '已取消提取，未发送原文。');
  if (typeof fetchImpl !== 'function' || typeof AbortController !== 'function') {
    return fallback('backend_unavailable', '提取服务不可用；请直接核对可编辑内容。');
  }
  const controller = new AbortController();
  let posted = false, timedOut = false;
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, 8000);
  try {
    // Capability lookup contains no transcript or material contents.
    const statusResponse = await fetchImpl('/api/moneyai/status', {
      cache: 'no-store', redirect: 'error', signal: controller.signal
    });
    if (!statusResponse.ok) return fallback('backend_unavailable', '未连上本项目提取服务；可以继续手动核对。');
    const status = await statusResponse.json();
    if (controller.signal.aborted) throw new Error('aborted');
    if (status?.extractionReady !== true) {
      return fallback('intake_unavailable', '结构化提取尚未接通；当前是手动核对草稿，没有把原文发送给MoneyAI。');
    }
    if (consentToExternalProcessing !== true) {
      return fallback('external_consent_required', '发送到本机MoneyAI项目Agent前，需要明确范围及其配置模型与费用；可以先手动核对。');
    }
    if (!body) return fallback('invalid_intake', '本次发送缺少稳定操作号、范围或输入指纹；原文未发送。');
    posted = true;
    const response = await fetchImpl('/api/intake/extract', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body, redirect: 'error', signal: controller.signal
    });
    const result = await response.json();
    if (controller.signal.aborted) throw new Error('aborted');
    const checked = validateMoneyAIResponse(result, envelope);
    const sent = checked.sentToMoneyAI;
    if (!response.ok || !checked.ok) {
      return fallback(checked.code === 'intake_unavailable' ? 'intake_unavailable' : 'extraction_failed',
        sent === false ? '提取未完成，服务确认未发送给MoneyAI；原文和编辑草稿已保留。'
          : '提取没有得到可用结果，不能据此断言未发送；原文和编辑草稿已保留。', sent);
    }
    const output = checked.result;
    const validated = validateMerchantIntakeDraft(output.draft);
    const bindings = output.sourceBindings;
    // A session material may have been omitted from this request. Returned file
    // evidence must refer only to the IDs and versions actually sent here.
    const sentMaterialVersions = new Map(envelope.payload.materials.map((material) => [material.materialId, material.materialVersion]));
    if (!validated.ok || sent !== true
      || output.draft.transcript !== envelope.payload.transcript || !Array.isArray(bindings)
      || output.draft.sources.some((source) => !envelope.payload.sources.includes(source))
      || bindings.some((binding) => ['txt', 'csv', 'json'].includes(binding?.source)
        && (!sentMaterialVersions.has(binding.materialId)
          || sentMaterialVersions.get(binding.materialId) !== binding.materialVersion))
      || !mapConfirmedIntakeToAnalysisInput(output.draft, { state: snapshot, sourceBindings: bindings }).ok) {
      return fallback('invalid_response', '提取返回的字段、来源或版本不合约定，未替换当前编辑。', sent);
    }
    return { ok: true, mode: 'moneyai', draft: validated.draft, sourceBindings: clone(bindings),
      requestContext, sentToMoneyAI: true, editable: true };
  } catch {
    return fallback(timedOut ? 'timeout' : controller.signal.aborted ? 'cancelled' : 'backend_unavailable',
      posted ? '未获得完整提取回执；原文和编辑草稿保留，发送结果尚未确认。'
        : '提取未完成，原文未发送给MoneyAI；可以直接手动核对。', posted ? null : false);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
}
