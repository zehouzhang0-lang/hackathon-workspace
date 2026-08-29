import { MONEYAI_CONTRACT_VERSION, MONEYAI_OPERATIONS, freezeMoneyAIRequest,
  validateMoneyAIResponse } from './moneyai-contract.js';
import { validateRealModelAnalysisDraft } from './model.js';

// Only the project backend is reachable here, never MoneyAI management ports.
const STATUS_FLAGS = ['configured', 'serviceReachable', 'analysisReady', 'historyWriteReady', 'historyReadVerified', 'extractionReady'];
const record = (value) => value !== null && typeof value === 'object'
  && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const failed = (code, message, sentToMoneyAI = false) => ({ ok: false, code, message, sentToMoneyAI });

function requestControl(signal, timeoutMs) {
  const controller = new AbortController();
  let timedOut = false;
  const abort = () => controller.abort();
  if (signal?.aborted) abort();
  else signal?.addEventListener('abort', abort, { once: true });
  const duration = Number.isSafeInteger(timeoutMs) && timeoutMs > 0 && timeoutMs <= 30000 ? timeoutMs : 8000;
  const timer = setTimeout(() => { timedOut = true; abort(); }, duration);
  return { signal: controller.signal, get timedOut() { return timedOut; }, close() {
    clearTimeout(timer); signal?.removeEventListener('abort', abort);
  } };
}

export async function getMoneyAIStatus({ signal, fetchImpl = globalThis.fetch, timeoutMs = 8000 } = {}) {
  if (signal?.aborted) return failed('cancelled', '已取消状态查询。');
  if (typeof fetchImpl !== 'function' || typeof AbortController !== 'function') {
    return failed('backend_unavailable', '本项目后端未连接，不能判断MoneyAI业务通路是否可用。');
  }
  const control = requestControl(signal, timeoutMs);
  try {
    const response = await fetchImpl('/api/moneyai/status', {
      cache: 'no-store', redirect: 'error', signal: control.signal
    });
    if (!response.ok) return failed('backend_unavailable', '未获得本项目后端的有效状态。');
    const payload = await response.json();
    if (control.signal.aborted) throw new Error('aborted');
    const optionalContract = !Object.hasOwn(payload || {}, 'contractVersion')
      || payload.contractVersion === MONEYAI_CONTRACT_VERSION;
    const optionalProject = !Object.hasOwn(payload || {}, 'projectSpaceConfigured')
      || typeof payload.projectSpaceConfigured === 'boolean';
    const optionalCapabilities = !Object.hasOwn(payload || {}, 'capabilities')
      || record(payload.capabilities) && Object.values(payload.capabilities).every((value) => typeof value === 'boolean');
    if (!record(payload) || payload.provider !== 'moneyai' || STATUS_FLAGS.some((key) => typeof payload[key] !== 'boolean')
      || typeof payload.reason !== 'string' || payload.reason.length > 2000 || !optionalContract || !optionalProject || !optionalCapabilities
      || payload.analysisReady && (!payload.configured || !payload.serviceReachable)
      || payload.extractionReady && (!payload.configured || !payload.serviceReachable)
      || (payload.historyWriteReady || payload.historyReadVerified) && (!payload.configured || !payload.serviceReachable)) {
      return failed('invalid_status', 'MoneyAI状态返回不完整，不能据此宣称业务已接通。');
    }
    const status = { provider: 'moneyai',
      ...Object.fromEntries(STATUS_FLAGS.map((key) => [key, payload[key]])), reason: payload.reason };
    if (Object.hasOwn(payload, 'contractVersion')) status.contractVersion = payload.contractVersion;
    if (Object.hasOwn(payload, 'projectSpaceConfigured')) status.projectSpaceConfigured = payload.projectSpaceConfigured;
    if (Object.hasOwn(payload, 'capabilities')) status.capabilities = { ...payload.capabilities };
    return { ok: true, status };
  } catch {
    return failed(control.timedOut ? 'timeout' : control.signal.aborted ? 'cancelled' : 'backend_unavailable',
      '未获得完整状态回执，MoneyAI业务是否可用尚未确认。');
  } finally { control.close(); }
}

const OPERATIONS = Object.freeze({
  [MONEYAI_OPERATIONS.analysis]: {
    endpoint: '/api/moneyai/analysis', ready: 'analysisReady', unavailable: 'analysis_unavailable',
    unavailableMessage: '项目分析通路尚未就绪，未发送资料；本地演示不是MoneyAI分析。'
  },
  [MONEYAI_OPERATIONS.decisionWrite]: {
    endpoint: '/api/moneyai/decisions', ready: 'historyWriteReady', unavailable: 'history_write_unavailable',
    unavailableMessage: 'MoneyAI决策写入尚未就绪；本机保存不等于已经写入MoneyAI。'
  },
  [MONEYAI_OPERATIONS.historyRead]: {
    endpoint: '/api/moneyai/history/read', ready: 'historyReadVerified', unavailable: 'history_read_unavailable',
    unavailableMessage: 'MoneyAI历史读回尚未验证；不会用本机历史冒充MoneyAI记录。'
  }
});

async function requestOperation(request, operation, {
  signal, consentToExternalProcessing = false, fetchImpl = globalThis.fetch, timeoutMs = 8000
} = {}) {
  if (signal?.aborted) return failed('cancelled', '已取消请求，未发送资料。');
  if (consentToExternalProcessing !== true) {
    return failed('external_consent_required', '本次调用前须确认发送到本机MoneyAI项目Agent的范围、数据类型，以及其配置模型与费用。');
  }
  let frozen;
  try {
    frozen = freezeMoneyAIRequest(request);
    if (frozen.envelope.operation !== operation) throw new Error('invalid_payload');
  } catch { return failed('invalid_payload', 'MoneyAI请求不符合有界项目契约；未发送资料。'); }
  if (typeof fetchImpl !== 'function' || typeof AbortController !== 'function') {
    return failed('backend_unavailable', '本项目MoneyAI入口不可用；未发送资料。');
  }
  const configuration = OPERATIONS[operation];
  const control = requestControl(signal, timeoutMs);
  let posted = false;
  try {
    const readiness = await getMoneyAIStatus({ signal: control.signal, fetchImpl, timeoutMs });
    if (control.signal.aborted) throw new Error('aborted');
    if (!readiness.ok) return failed(readiness.code, readiness.message);
    if (!readiness.status[configuration.ready]) return failed(configuration.unavailable, configuration.unavailableMessage);
    posted = true;
    const response = await fetchImpl(configuration.endpoint, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: frozen.body,
      redirect: 'error', signal: control.signal
    });
    const payload = await response.json();
    if (control.signal.aborted) throw new Error('aborted');
    const validated = validateMoneyAIResponse(payload, frozen.envelope);
    if (!response.ok || !validated.ok) {
      return failed(!response.ok && validated.ok ? 'http_error'
        : validated.code === 'invalid_response' ? 'invalid_response' : validated.code,
        validated.message || (validated.sentToMoneyAI === false
          ? '服务确认本次资料未发送给MoneyAI。' : '未获得完整可用回执，不能断言本次资料未发送。'),
        validated.sentToMoneyAI);
    }
    return validated;
  } catch {
    return failed(control.timedOut ? 'timeout' : control.signal.aborted ? 'cancelled' : 'backend_unavailable',
      posted ? '未取得完整MoneyAI回执，发送结果尚未确认；不会用本地结果代替。' : '请求未完成，资料未发送。',
      posted ? null : false);
  } finally { control.close(); }
}

export async function requestMoneyAIAnalysis(request, options = {}) {
  const response = await requestOperation(request, MONEYAI_OPERATIONS.analysis, options);
  if (!response.ok) return response;
  const scope = response.receipt.scope;
  const analysis = record(response.result.analysis) ? {
    ...response.result.analysis,
    processing: response.result.analysis.processing ?? [{
      name: 'MoneyAI项目分析', kind: 'moneyai', status: 'done', operationId: response.receipt.operationId
    }],
    providerReceipt: {
      contractVersion: MONEYAI_CONTRACT_VERSION, provider: 'moneyai', sentToMoneyAI: true,
      operationId: response.receipt.operationId, attemptId: response.receipt.attemptId,
      sessionId: scope.sessionId, roundId: scope.roundId,
      inputVersion: scope.inputVersion, inputFingerprint: response.receipt.inputFingerprint
    }
  } : null;
  try { validateRealModelAnalysisDraft(analysis, options.state, scope); }
  catch { return failed('invalid_analysis', 'MoneyAI返回未通过真实分析结构、来源和当前输入校验。', true); }
  return { ok: true, analysis, receipt: response.receipt, sentToMoneyAI: true };
}

export async function requestMoneyAIDecisionWrite(request, options = {}) {
  const response = await requestOperation(request, MONEYAI_OPERATIONS.decisionWrite, options);
  if (!response.ok) return response;
  const receipt = response.result.writeReceipt;
  if (!record(receipt) || typeof receipt.recordId !== 'string' || !receipt.recordId
    || typeof receipt.recordKey !== 'string' || !receipt.recordKey
    || typeof receipt.providerRecordId !== 'string' || !receipt.providerRecordId
    || receipt.operationId !== response.receipt.operationId
    || typeof receipt.contentHash !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(receipt.contentHash)
    || typeof receipt.writtenAt !== 'string' || !Number.isFinite(Date.parse(receipt.writtenAt))
    || typeof receipt.readBackVerified !== 'boolean') {
    return failed('invalid_write_receipt', 'MoneyAI写入回执不完整，本机记录不能标为已同步。', true);
  }
  return { ok: true, writeReceipt: { ...receipt }, receipt: response.receipt, sentToMoneyAI: true };
}

export async function requestMoneyAIHistoryRead(request, options = {}) {
  const response = await requestOperation(request, MONEYAI_OPERATIONS.historyRead, options);
  if (!response.ok) return response;
  if (!Array.isArray(response.result.records) || response.result.records.length > request.payload.query.limit
    || response.result.records.some((entry) => !record(entry)) || !record(response.result.readReceipt)
    || response.result.readReceipt.count !== response.result.records.length) {
    return failed('invalid_history_response', 'MoneyAI历史读回结构不完整，不会合并到本机记录。', true);
  }
  return { ok: true, records: response.result.records.map((entry) => ({ ...entry })),
    readReceipt: { ...response.result.readReceipt }, receipt: response.receipt, sentToMoneyAI: true };
}
