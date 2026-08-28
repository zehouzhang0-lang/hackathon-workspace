// Only the project backend is reachable here, never MoneyAI management ports.
const MAX_REQUEST_BYTES = 256 * 1024;
const STATUS_FLAGS = ['configured', 'serviceReachable', 'analysisReady', 'historyWriteReady', 'historyReadVerified', 'extractionReady'];
const record = (value) => value !== null && typeof value === 'object' &&
  [Object.prototype, null].includes(Object.getPrototypeOf(value));
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

// Freeze transport bytes before an await. No getters, toJSON, binary objects,
// implicit coercion or automatic expansion of a session into an upload.
function requestBody(request) {
  if (!record(request)) throw new Error('invalid_payload');
  const ancestors = new Set();
  let nodes = 0;
  const copy = (value, depth = 0) => {
    if (++nodes > 10000 || depth > 64) throw new Error('invalid_payload');
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if ((!Array.isArray(value) && !record(value)) || ancestors.has(value)) throw new Error('invalid_payload');
    ancestors.add(value);
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const keys = Reflect.ownKeys(descriptors).filter((key) => !(Array.isArray(value) && key === 'length'));
    if (keys.some((key) => typeof key !== 'string' || key === 'toJSON' || !descriptors[key].enumerable ||
      !Object.hasOwn(descriptors[key], 'value'))) throw new Error('invalid_payload');
    let result;
    if (Array.isArray(value)) {
      if (value.length > 10000 || keys.length !== value.length ||
        keys.some((key) => !/^(0|[1-9][0-9]*)$/.test(key) || Number(key) >= value.length)) throw new Error('invalid_payload');
      result = Array.from({ length: value.length }, (_, index) => copy(descriptors[index].value, depth + 1));
    } else {
      result = Object.create(null);
      for (const key of keys) result[key] = copy(descriptors[key].value, depth + 1);
    }
    ancestors.delete(value);
    return result;
  };
  const body = JSON.stringify(copy(request));
  if (new TextEncoder().encode(body).byteLength > MAX_REQUEST_BYTES) throw new Error('invalid_payload');
  return body;
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
    if (!record(payload) || payload.provider !== 'moneyai' ||
      STATUS_FLAGS.some((key) => typeof payload[key] !== 'boolean') ||
      typeof payload.reason !== 'string' || payload.reason.length > 2000 ||
      payload.analysisReady && (!payload.configured || !payload.serviceReachable)) {
      return failed('invalid_status', 'MoneyAI状态返回不完整，不能据此宣称业务已接通。');
    }
    return { ok: true, status: { provider: 'moneyai',
      ...Object.fromEntries(STATUS_FLAGS.map((key) => [key, payload[key]])), reason: payload.reason } };
  } catch {
    return failed(control.timedOut ? 'timeout' : control.signal.aborted ? 'cancelled' : 'backend_unavailable',
      '未获得完整状态回执，MoneyAI业务是否可用尚未确认。');
  } finally { control.close(); }
}

export async function requestMoneyAIAnalysis(request, {
  signal, consentToExternalProcessing = false, fetchImpl = globalThis.fetch, timeoutMs = 8000
} = {}) {
  if (signal?.aborted) return failed('cancelled', '已取消分析，未发送资料。');
  if (consentToExternalProcessing !== true) {
    return failed('external_consent_required', '发送分析资料前须明确项目模型、费用和发送范围。');
  }
  let body;
  try { body = requestBody(request); }
  catch { return failed('invalid_payload', '分析请求须是有界的纯JSON摘要；未发送资料。'); }
  if (typeof fetchImpl !== 'function' || typeof AbortController !== 'function') {
    return failed('backend_unavailable', '本项目分析入口不可用；未发送资料。');
  }
  const control = requestControl(signal, timeoutMs);
  let posted = false;
  try {
    const readiness = await getMoneyAIStatus({ signal: control.signal, fetchImpl, timeoutMs });
    if (control.signal.aborted) throw new Error('aborted');
    if (!readiness.ok) return failed(readiness.code, readiness.message);
    if (!readiness.status.analysisReady) {
      return failed('analysis_unavailable', '项目分析通路尚未就绪，未发送资料；本地演示不是MoneyAI分析。');
    }
    posted = true;
    const response = await fetchImpl('/api/moneyai/analysis', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body,
      redirect: 'error', signal: control.signal
    });
    const result = await response.json();
    if (control.signal.aborted) throw new Error('aborted');
    const sent = typeof result?.sentToMoneyAI === 'boolean' ? result.sentToMoneyAI : null;
    if (!record(result) || !response.ok || result.ok !== true) {
      return failed(result?.code === 'moneyai_project_session_required' ? result.code : 'analysis_failed',
        sent === false ? '分析未完成，服务确认未向MoneyAI发送。' : '分析未获得可用结果，不能据此断言未发送。', sent);
    }
    // No verified AnalysisDraft/provider mapping exists yet. A successful HTTP
    // body is not permission to enable real_model or dispatch ANALYSIS_SET.
    return failed('analysis_validation_unavailable', '已收到分析回包，但真实分析结构与来源校验尚未接通；未接受为可用分析。', sent);
  } catch {
    return failed(control.timedOut ? 'timeout' : control.signal.aborted ? 'cancelled' : 'backend_unavailable',
      posted ? '未取得完整分析回执，发送结果尚未确认；不会用演示答案代替。' : '分析未完成，资料未发送。', posted ? null : false);
  } finally { control.close(); }
}
