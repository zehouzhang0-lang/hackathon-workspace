// Client for the user-configured OpenAI-compatible AI boundary (server/server/app.py).
// MoneyAI was removed by product decision; the only external path is the API the
// user explicitly saves in 「AI 设置」. The key never reaches browser storage.
const record = (value) => value !== null && typeof value === 'object' &&
  [Object.prototype, null].includes(Object.getPrototypeOf(value));

const failed = (code, message) => ({ ok: false, code, message });

function requestControl(signal, timeoutMs) {
  const controller = new AbortController();
  let timedOut = false;
  const abort = () => controller.abort();
  if (signal?.aborted) abort();
  else signal?.addEventListener('abort', abort, { once: true });
  const duration = Number.isSafeInteger(timeoutMs) && timeoutMs > 0 && timeoutMs <= 120000 ? timeoutMs : 8000;
  const timer = setTimeout(() => { timedOut = true; abort(); }, duration);
  return { signal: controller.signal, get timedOut() { return timedOut; }, close() {
    clearTimeout(timer); signal?.removeEventListener('abort', abort);
  } };
}

async function getJson(url, { signal, fetchImpl = globalThis.fetch, timeoutMs } = {}) {
  if (signal?.aborted) return failed('cancelled', '已取消请求。');
  if (typeof fetchImpl !== 'function' || typeof AbortController !== 'function') {
    return failed('backend_unavailable', '本项目后端未连接；页面仍可使用本机能力。');
  }
  const control = requestControl(signal, timeoutMs);
  try {
    const response = await fetchImpl(url, { cache: 'no-store', redirect: 'error', signal: control.signal });
    if (!response.ok) return failed('backend_unavailable', '未获得本项目后端的有效响应。');
    const payload = await response.json();
    if (control.signal.aborted) throw new Error('aborted');
    return { ok: true, payload };
  } catch {
    return failed(control.timedOut ? 'timeout' : control.signal.aborted ? 'cancelled' : 'backend_unavailable',
      '未取得完整回执，结果尚未确认。');
  } finally { control.close(); }
}

async function postJson(url, body, { signal, fetchImpl = globalThis.fetch, timeoutMs } = {}) {
  if (signal?.aborted) return failed('cancelled', '已取消请求，未发送内容。');
  if (typeof fetchImpl !== 'function' || typeof AbortController !== 'function') {
    return failed('backend_unavailable', '本项目后端未连接；页面仍可使用本机能力。');
  }
  const control = requestControl(signal, timeoutMs);
  try {
    const response = await fetchImpl(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body), redirect: 'error', signal: control.signal
    });
    const payload = await response.json();
    if (control.signal.aborted) throw new Error('aborted');
    if (!record(payload)) return failed('invalid_response', '后端返回不是JSON对象。');
    return { ok: true, status: response.status, payload };
  } catch {
    return failed(control.timedOut ? 'timeout' : control.signal.aborted ? 'cancelled' : 'backend_unavailable',
      '未取得完整回执，发送结果尚未确认。');
  } finally { control.close(); }
}

/** {ok:true, configured, baseUrl, model, hasKey} — never includes the key. */
export async function getAiSettings(options = {}) {
  const result = await getJson('/api/ai/settings', options);
  if (!result.ok) return result;
  const payload = result.payload;
  if (!record(payload) || typeof payload.configured !== 'boolean' ||
    (payload.configured && (typeof payload.baseUrl !== 'string' || typeof payload.model !== 'string'))) {
    return failed('invalid_status', 'AI 设置状态返回不完整。');
  }
  return { ok: true, configured: payload.configured,
    baseUrl: payload.configured ? payload.baseUrl : null,
    model: payload.configured ? payload.model : null,
    hasKey: payload.configured ? payload.hasKey !== false : false };
}

/** save: {baseUrl, apiKey?, model}; clear: {clear:true}. Empty/absent apiKey keeps the stored key. */
export async function saveAiSettings(settings, options = {}) {
  const result = await postJson('/api/ai/settings', settings, options);
  if (!result.ok) return result;
  if (result.status !== 200) {
    return failed(result.payload?.code || 'save_failed', result.payload?.message || 'AI 设置未保存。');
  }
  return getAiSettings(options);
}

/** messages: [{role:'system'|'user'|'assistant', content:string}]; returns {ok:true, content}.
 * temperature 可选：省略时不发送，服务端也不向模型转发（部分模型只允许固定采样参数）。 */
export async function requestAiChat({ messages, temperature, maxTokens = 2048 }, options = {}) {
  const result = await postJson('/api/ai/chat', {
    messages, maxTokens,
    ...(temperature === undefined ? {} : { temperature }),
  }, options);
  if (!result.ok) return result;
  if (result.status !== 200 || result.payload?.ok !== true || typeof result.payload?.content !== 'string') {
    return failed(result.payload?.code || 'ai_request_failed',
      result.payload?.message || 'AI 服务未返回可用结果；原文仍在本页。');
  }
  return { ok: true, content: result.payload.content };
}
