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

const SAFE_ANALYSIS_RULES = '只依据摘要中的焦点、事实、限制与未知；不得把未知补成0或事实；不得声称根因已确认；'
  + '不得编造缺失数据、概率、收入或效果；总结必须说明结论仍需商家核对。';
const INSIGHT_INSTRUCTION = '只输出一个JSON对象，不要输出其他文字或代码块外的内容。'
  + 'JSON精确字段为：mode固定"real_model"；status只能是"ready"、"limited"或"insufficient"；'
  + 'summary为不超过2000字的总结；limitations为最多20条、每条不超过500字的字符串数组；'
  + 'paths为1至2条，每条精确只有title（不超过160字）与action（不超过1200字）两个非空字符串。'
  + SAFE_ANALYSIS_RULES;

const ANALYSIS_SKILLS = ['douyin-data-analysis', 'douyin-account-diagnosis'];
const EXECUTION_SKILLS = ['douyin-copywriter', 'douyin-video-creation', 'douyin-live-ops'];
const PROVIDER_SKILL_INSTRUCTION = '只输出一个JSON对象，不要输出其他文字或代码块外的内容。'
  + 'JSON精确字段为mode、status、summary、limitations、skillsUsed、paths；mode固定real_model；'
  + 'status只能是ready、limited或insufficient；summary不超过2000字；limitations为最多20条字符串。'
  + '本次必须按仓库已审查Skill职责路由：'
  + 'douyin-data-analysis只分析已确认且口径可核对的数据，证据不足时只给补数方向；'
  + 'douyin-account-diagnosis只把账号状态分成事实、推断、待验证和未知，不确认限流或根因；'
  + '每条执行路径只选择一个最匹配的Skill：文字成品用douyin-copywriter，短视频脚本/分镜/拍摄草稿用douyin-video-creation，直播执行稿或复盘用douyin-live-ops。'
  + '不得为了凑Skill生成路径。返回skillsUsed必须精确为["douyin-data-analysis","douyin-account-diagnosis"]；'
  + '每条path精确包含title、action、skillId，skillId只能是上述三个执行Skill之一；status为insufficient时paths必须为空。'
  + SAFE_ANALYSIS_RULES;

const clampText = (value, limit) => typeof value === 'string' && value.trim() ? value.trim().slice(0, limit) : null;

/** 超长摘要压缩：把高频重复的同指标事实聚合为一条（条数/最小/最大/均值），
 * 保留低频事实原文。返回{summary, note}；note非空时说明发生过聚合或截断。
 * 只改变发送体积，不改变已确认事实的口径；聚合值由原始记录算出，不引入新数据。 */
export function compactSummaryForModel(summary, budgetChars = 18000) {
  if (!record(summary) || JSON.stringify(summary).length <= budgetChars) {
    return { summary, note: null };
  }
  const facts = Array.isArray(summary.facts) ? summary.facts : [];
  const groups = new Map();
  const singles = [];
  for (const fact of facts) {
    if (!record(fact)) { singles.push(fact); continue; }
    const groupKey = [fact.key, fact.availability, fact.unit || ''].join('\u0001');
    if (!groups.has(groupKey)) groups.set(groupKey, []);
    groups.get(groupKey).push(fact);
  }
  const compacted = [...singles];
  let aggregated = 0;
  for (const group of groups.values()) {
    if (group.length <= 3) { compacted.push(...group); continue; }
    const first = group[0];
    const values = group.map((fact) => fact.value)
      .filter((value) => typeof value === 'number' && Number.isFinite(value));
    const range = values.length
      ? '（共' + group.length + '条：最小 ' + Math.min(...values) + '，最大 ' + Math.max(...values)
        + '，均值 ' + Math.round(values.reduce((sum, value) => sum + value, 0) / values.length * 1000) / 1000 + '）'
      : '（共' + group.length + '条：无数值）';
    compacted.push({
      id: 'agg:' + (first.id || first.key), key: first.key,
      availability: group.some((fact) => fact.availability === 'known') ? 'known' : 'unknown',
      evidenceStatus: first.evidenceStatus ?? null, unit: first.unit ?? null,
      subject: '聚合' + range + '，主体见各条原始记录', value: null,
      window: { start: null, end: null }, channel: first.channel ?? null, cohort: first.cohort ?? null,
      sourceKind: first.sourceKind ?? null, verification: first.verification ?? null,
    });
    aggregated += group.length;
  }
  const compactSummary = { ...summary, facts: compacted };
  let note = '原摘要含' + facts.length + '条事实；其中' + aggregated + '条同指标明细已按指标聚合为'
    + (compacted.length - singles.length) + '条（保留条数/最小/最大/均值），其余' + singles.length + '条原样保留。';
  if (JSON.stringify(compactSummary).length > budgetChars && compacted.length > 12) {
    compactSummary.facts = compacted.slice(0, Math.max(12, Math.floor(compacted.length / 2)));
    note += ' 仍超预算，已进一步截断到' + compactSummary.facts.length + '条。';
  }
  return { summary: compactSummary, note };
}

/** 解析模型返回的小型提议JSON；不符合结构时返回null，由调用方降级为原文展示。 */
function parseProposalText(content, { requireSkills = false } = {}) {
  const text = String(content ?? '').trim();
  const start = text.indexOf('{'), end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  let parsed;
  try { parsed = JSON.parse(text.slice(start, end + 1)); } catch { return null; }
  if (!record(parsed) || parsed.mode !== 'real_model'
    || !['ready', 'limited', 'insufficient'].includes(parsed.status)
    || !clampText(parsed.summary, 2000)
    || !Array.isArray(parsed.limitations) || !parsed.limitations.length
    || !Array.isArray(parsed.paths) || parsed.paths.length > 2
    || parsed.status === 'insufficient' && parsed.paths.length
    || parsed.status !== 'insufficient' && !parsed.paths.length
    || requireSkills && (!Array.isArray(parsed.skillsUsed)
      || parsed.skillsUsed.length !== ANALYSIS_SKILLS.length
      || ANALYSIS_SKILLS.some((skillId, index) => parsed.skillsUsed[index] !== skillId))) return null;
  const limitations = parsed.limitations.map((item) => clampText(item, 500)).filter(Boolean).slice(0, 20);
  const paths = parsed.paths.map((path) => record(path) ? {
    title: clampText(path.title, 160), action: clampText(path.action, 1200),
    ...(requireSkills ? { skillId: EXECUTION_SKILLS.includes(path.skillId) ? path.skillId : null } : {}),
  } : null).filter(Boolean).slice(0, 2);
  if (!limitations.length || paths.some((path) => !path.title || !path.action || requireSkills && !path.skillId)) return null;
  return {
    mode: 'real_model', status: parsed.status,
    summary: clampText(parsed.summary, 2000), limitations, paths,
    ...(requireSkills ? { skillsUsed: [...ANALYSIS_SKILLS] } : {}),
  };
}

/** 直连AI解读（参考块）：把已确认摘要发给「AI 设置」配置的模型。
 * 结果仅作参考，不代表MoneyAI通路，不写入保存记录；输出必须由人工核对。
 * 返回{ok:true, proposal|raw}；未配置API时failed('ai_not_configured')且不发送。 */
export async function requestAiInsight(summary, options = {}) {
  const settings = await getAiSettings(options);
  if (!settings.ok) return settings;
  if (!settings.configured) {
    return failed('ai_not_configured', '尚未在「AI 设置」配置 API；未发送任何内容。');
  }
  const compacted = compactSummaryForModel(summary);
  const result = await requestAiChat({
    maxTokens: 2048,
    messages: [
      { role: 'system', content: '你是路芽项目的受限分析助手。禁止调用工具、文件、网络或个人历史；只使用用户提供的已确认摘要。'
        + '不得把未知补成0或事实；不得声称根因已确认；不得编造缺失数据、概率、收入或效果。' + INSIGHT_INSTRUCTION },
      { role: 'user', content: '已确认摘要（JSON）：' + JSON.stringify(compacted.summary)
        + (compacted.note ? '\n摘要说明：' + compacted.note : '') },
    ],
  }, { ...options, timeoutMs: options.timeoutMs ?? 60000 });
  if (!result.ok) return result;
  const proposal = parseProposalText(result.content);
  return proposal ? { ok: true, proposal, model: settings.model } : { ok: true, raw: result.content, model: settings.model };
}

/** 直连AI正式分析提议：与MoneyAI通路相同的小型提议结构，由「AI 设置」配置的模型生成。
 * 只做传输与结构解析；身份回执、结构重建与保存校验仍由共享层（moneyai.js/model.js）完成。
 * 一旦摘要已发出，后续失败返回sentToProvider:true，不能断言资料未发送。 */
export async function requestProviderAnalysisProposal(envelope, options = {}) {
  const settings = await getAiSettings(options);
  if (!settings.ok) return { ...settings, sentToProvider: false };
  if (!settings.configured) {
    return { ...failed('ai_not_configured', '尚未在「AI 设置」配置 API；未发送任何内容。'), sentToProvider: false };
  }
  const compacted = compactSummaryForModel(envelope.payload);
  const result = await requestAiChat({
    maxTokens: 2048,
    messages: [
      { role: 'system', content: '你是路芽项目的受限JSON处理器。禁止调用工具、文件、网络或个人历史；只使用下列获准摘要。'
        + '必须原样回显身份；不得把未知补成0或事实。' + PROVIDER_SKILL_INSTRUCTION },
      { role: 'user', content: '请求：' + JSON.stringify({
        contractVersion: envelope.contractVersion, operation: envelope.operation,
        operationId: envelope.operationId, scope: envelope.scope, payload: compacted.summary,
      }) + (compacted.note ? '\n摘要说明：' + compacted.note : '') },
    ],
  }, { ...options, timeoutMs: options.timeoutMs ?? 60000 });
  if (!result.ok) return { ...result, sentToProvider: true, model: settings.model };
  const proposal = parseProposalText(result.content, { requireSkills: true });
  if (!proposal) {
    return { ...failed('provider_response_invalid', '直连AI返回未通过提议结构校验；不会保存，不会替换当前分析。'),
      sentToProvider: true, model: settings.model };
  }
  return { ok: true, proposal, sentToProvider: true, model: settings.model };
}

/** 直连AI材料解析（直连数据提取）：把解析失败的材料文本交给「AI 设置」配置的模型，
 * 转换成约定指标长表。模型只负责"表结构翻译"；本机在此函数内逐条核对——
 * source_line必须逐字存在于对应材料文本、数值必须出现在该行中——未通过的一律剔除。
 * 返回{ok:true, entries, dropped, model}；未配置API时failed('ai_not_configured')且不发送。 */
export async function requestMaterialFacts(materials, options = {}) {
  const settings = await getAiSettings(options);
  if (!settings.ok) return settings;
  if (!settings.configured) {
    return failed('ai_not_configured', '尚未在「AI 设置」配置 API；未发送任何内容。');
  }
  const result = await requestAiChat({
    maxTokens: 4096,
    messages: [
      { role: 'system', content: '你是数据提取器。把用户提供的表格/文本材料整理成指标长表。'
        + '只输出一个JSON数组，不要输出其他文字。每个元素精确字段为：'
        + 'metric（指标名，非空字符串）、value（材料中逐字出现的有限十进制数字，禁止换算）、'
        + 'unit（单位字符串或null，万/亿等单位写在这里）、subject（主体字符串或null）、'
        + 'window_start/window_end（YYYY-MM-DD或null）、source_line（该数值所在的原文行片段，20-200字，逐字来自材料文本）。'
        + '只使用材料文本中真实出现的数字；禁止编造、推断、补0或求和；一行只提取一次；缺失字段用null。' },
      { role: 'user', content: materials.map((entry) => '《' + entry.name + '》\n' + entry.text).join('\n\n') },
    ],
  }, { ...options, timeoutMs: options.timeoutMs ?? 60000 });
  if (!result.ok) return result;
  const text = result.content.trim();
  const start = text.indexOf('['), end = text.lastIndexOf(']');
  let parsed = null;
  if (start >= 0 && end > start) {
    try { parsed = JSON.parse(text.slice(start, end + 1)); } catch { parsed = null; }
  }
  if (!Array.isArray(parsed)) {
    return failed('provider_response_invalid', '直连AI返回不是JSON数组；未提取任何内容。');
  }
  const entries = [];
  let dropped = 0;
  for (const raw of parsed.slice(0, 400)) {
    if (!record(raw)) { dropped += 1; continue; }
    const metric = clampText(raw.metric, 120);
    const sourceLine = clampText(raw.source_line, 400);
    const value = raw.value;
    if (!metric || typeof value !== 'number' || !Number.isFinite(value) || !sourceLine) { dropped += 1; continue; }
    const host = materials.find((entry) => entry.text.includes(sourceLine));
    if (!host) { dropped += 1; continue; }
    if (!sourceLine.replace(/,/g, '').includes(String(value))) { dropped += 1; continue; }
    entries.push({
      metric,
      value,
      unit: clampText(raw.unit, 40),
      subject: clampText(raw.subject, 300),
      window_start: clampText(raw.window_start, 10),
      window_end: clampText(raw.window_end, 10),
      source_line: sourceLine, material: host.name,
    });
  }
  return { ok: true, entries, dropped, model: settings.model };
}
