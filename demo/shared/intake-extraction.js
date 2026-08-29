// Local-first structured intake. MoneyAI was removed by product decision (2026-08-29).
// Two honest layers, both provenance-bound:
//   1. local  — metric facts already parsed on this machine (CSV/JSON/XLSX readers)
//               are projected into matching draft fields with exact file locators.
//   2. api    — only when the user saved an OpenAI-compatible API in 「AI 设置」,
//               the transcript/description are sent to that endpoint and the model
//               may fill still-empty text fields; every value must carry a verbatim
//               quote that is verified against the text actually sent.
// Nothing is invented, nothing is sent without the user's own configured endpoint.
import { createMerchantIntakeDraft, validateMerchantIntakeDraft, mapConfirmedIntakeToAnalysisInput,
  TEXT_FIELDS, FIELD_LABELS } from './intake-draft.js';
import { getAiSettings, requestAiChat } from './ai.js';

const VERSION = 'v0.5-intake-1';
const ID = /^[A-Za-z0-9_-]{1,80}$/;
const clone = (value) => structuredClone(value);
const text = (value, limit) => typeof value === 'string' && value.length <= limit && !value.includes('\0');

// Inverse of shared/intake-draft.js KEYS for scalar fields that local parsers produce.
const FACT_KEY_FIELDS = {
  merchant_name: 'merchantName', product_name: 'productName', category: 'category', price: 'price',
  specifications: 'specifications', platform: 'platform', desired_action: 'desiredAction',
  target_customer_hypothesis: 'targetCustomerHypothesis',
  usage_scenario_hypothesis: 'usageScenarioHypothesis',
  purchase_reason_hypothesis: 'purchaseReasonHypothesis',
  differentiation_hypothesis: 'differentiationHypothesis', current_problem: 'currentProblem',
  intake_window_start: 'metrics.windowStart', intake_window_end: 'metrics.windowEnd',
  video_views: 'metrics.videoViews', product_clicks: 'metrics.productClicks',
  add_to_carts: 'metrics.addToCarts', created_orders: 'metrics.createdOrders',
  paid_orders: 'metrics.paidOrders'
};
const COUNT_FIELDS = new Set(['metrics.videoViews', 'metrics.productClicks', 'metrics.addToCarts',
  'metrics.createdOrders', 'metrics.paidOrders']);
const LOCATOR_SOURCES = { csv: 'csv', json: 'json', xlsx: 'xlsx' };
const AI_TEXT_LIMIT = 6000;

const leafValue = (draft, field) => field.startsWith('metrics.')
  ? draft?.metrics?.[field.slice(8)] ?? null : draft?.[field] ?? null;
const setLeaf = (draft, field, value) => {
  if (field.startsWith('metrics.')) draft.metrics[field.slice(8)] = value;
  else draft[field] = value;
};
const validDate = (value) => {
  if (typeof value !== 'string' || !/^(?!0000)\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const days = [31, year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28,
    31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1];
};

function ensureSource(draft, source) {
  if (!draft.sources.includes(source)) draft.sources.push(source);
}

// Layer 1: project locally parsed file facts into empty scalar fields.
// Only fills fields that are still null and unbound; conflicts stay empty and
// are reported instead of guessed.
function applyLocalFacts(draft, bindings, state, notes) {
  const facts = (state?.input?.facts || []).filter((fact) =>
    fact && fact.availability === 'known' && fact.value !== null && fact.value !== undefined &&
    fact.source?.kind === 'file_extract' && LOCATOR_SOURCES[fact.source.locator?.type] &&
    Object.prototype.hasOwnProperty.call(FACT_KEY_FIELDS, fact.key));
  const candidates = new Map();
  for (const fact of facts) {
    const field = FACT_KEY_FIELDS[fact.key];
    if (COUNT_FIELDS.has(field) && (!Number.isSafeInteger(fact.value) || fact.value < 0)) continue;
    if (field === 'metrics.windowStart' || field === 'metrics.windowEnd') continue;
    if (!candidates.has(field)) candidates.set(field, []);
    candidates.get(field).push(fact);
  }
  const windowFacts = [];
  for (const [field, list] of candidates) {
    if (leafValue(draft, field) !== null || bindings.some((binding) => binding.field === field)) continue;
    const distinct = new Map();
    for (const fact of list) {
      const key = JSON.stringify(fact.value);
      if (!distinct.has(key)) distinct.set(key, fact);
    }
    if (distinct.size !== 1) {
      notes.push('字段“' + (FIELD_LABELS[field] || field) + '”在材料中存在多个不同取值，未自动填入，请核对原件。');
      continue;
    }
    const fact = distinct.values().next().value;
    const source = LOCATOR_SOURCES[fact.source.locator.type];
    setLeaf(draft, field, clone(fact.value));
    draft.evidenceLedger.push({ field, value: clone(fact.value), status: 'confirmed_fact', source });
    bindings.push({ field, source, materialId: fact.source.materialId,
      materialVersion: fact.source.materialVersion, locator: clone(fact.source.locator) });
    ensureSource(draft, source);
    windowFacts.push(fact);
  }
  // Observation window: fill only when every materialized count fact agrees.
  if (leafValue(draft, 'metrics.windowStart') === null && leafValue(draft, 'metrics.windowEnd') === null &&
    !bindings.some((binding) => binding.field === 'metrics.windowStart' || binding.field === 'metrics.windowEnd')) {
    const windows = new Map();
    for (const fact of windowFacts) {
      if (!fact.window || !validDate(fact.window.start) || !validDate(fact.window.end)) continue;
      const key = fact.window.start + '/' + fact.window.end;
      if (!windows.has(key)) windows.set(key, fact);
    }
    if (windows.size === 1) {
      const fact = windows.values().next().value;
      const source = LOCATOR_SOURCES[fact.source.locator.type];
      for (const field of ['metrics.windowStart', 'metrics.windowEnd']) {
        const value = field === 'metrics.windowStart' ? fact.window.start : fact.window.end;
        setLeaf(draft, field, value);
        draft.evidenceLedger.push({ field, value, status: 'confirmed_fact', source });
        bindings.push({ field, source, materialId: fact.source.materialId,
          materialVersion: fact.source.materialVersion, locator: clone(fact.source.locator) });
      }
      ensureSource(draft, source);
    } else if (windows.size > 1) {
      notes.push('材料的观察窗口不一致，未自动填入起止日期；请核对原件。');
    }
  }
}

// Layer 2: ask the user-configured API to fill still-empty text fields.
async function applyAiExtraction(draft, bindings, request, fetchImpl, signal, notes) {
  const emptyFields = TEXT_FIELDS.filter((field) => leafValue(draft, field) === null &&
    !bindings.some((binding) => binding.field === field));
  if (!emptyFields.length) return { added: 0, configured: false };
  const settings = await getAiSettings({ fetchImpl, signal, timeoutMs: 8000 });
  if (!settings.ok || !settings.configured) return { added: 0, configured: false };
  const clip = (value) => value.length > AI_TEXT_LIMIT ? value.slice(0, AI_TEXT_LIMIT) + '\n…（后略，仅根据以上文字整理）' : value;
  const factLines = (request.state?.input?.facts || [])
    .filter((fact) => fact && fact.availability === 'known' && fact.value !== null)
    .slice(0, 40)
    .map((fact) => '- ' + fact.key + '=' + String(fact.value) + (fact.unit ? ' ' + fact.unit : '') +
      (fact.subject ? '（对象：' + fact.subject + '）' : ''));
  const fieldLines = emptyFields.map((field) => '- ' + field + '（' + (FIELD_LABELS[field] || field) + '）');
  const reply = await requestAiChat({
    temperature: 0, maxTokens: 4096,
    messages: [
      { role: 'system', content: '你是经营资料整理助手。只根据用户给出的文字提取信息。每个字段必须给出 value 与 quote，' +
        'quote 必须是所给文字中连续出现的原文片段；找不到依据的字段不要输出；不要编造；只输出JSON，不要输出其他文字。' },
      { role: 'user', content: '【商家描述】\n' + clip(request.description) +
        '\n\n【语音或粘贴原文】\n' + clip(request.transcript) +
        (factLines.length ? '\n\n【本机已从上传材料解析的指标（仅供参考，不要改动）】\n' + factLines.join('\n') : '') +
        '\n\n请整理以下仍未填写的字段，逐项给出 value（不超过200字）与 quote：\n' + fieldLines.join('\n') +
        '\n\n只输出JSON，格式：{"fields":{"<字段名>":{"value":"...","quote":"..."}}}' }
    ]
  }, { fetchImpl, signal, timeoutMs: 45000 });
  if (!reply.ok) {
    notes.push('已配置 AI 但整理请求未完成（' + reply.message + '）；已保留本机提取结果，未替换任何内容。');
    return { added: 0, configured: true };
  }
  let payload;
  try {
    const body = reply.content;
    const start = body.indexOf('{'), end = body.lastIndexOf('}');
    if (start < 0 || end <= start) throw new Error('no json');
    payload = JSON.parse(body.slice(start, end + 1));
  } catch {
    notes.push('AI 返回不是可用 JSON；已保留本机提取结果，未替换任何内容。');
    return { added: 0, configured: true };
  }
  const fields = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload.fields : null;
  if (!fields || typeof fields !== 'object' || Array.isArray(fields)) {
    notes.push('AI 返回缺少 fields 对象；已保留本机提取结果。');
    return { added: 0, configured: true };
  }
  let added = 0;
  for (const field of emptyFields) {
    const entry = fields[field];
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const value = typeof entry.value === 'string' ? entry.value.trim() : '';
    const quote = typeof entry.quote === 'string' ? entry.quote : '';
    if (!value || value.length > 4000 || !quote || quote.length > 4000 || value.includes('\0')) continue;
    let source = null;
    if (request.transcript.includes(quote)) {
      source = ['voice', 'paste', 'manual'].find((name) => draft.sources.includes(name)) || 'paste';
    } else if (request.description.includes(quote)) {
      source = ['manual', 'paste'].find((name) => draft.sources.includes(name)) || 'manual';
    } else {
      continue; // quote not verified against the text actually sent — drop it
    }
    setLeaf(draft, field, value);
    draft.evidenceLedger.push({ field, value, status: 'confirmed_fact', source, quote });
    bindings.push({ field, source, locator: { type: 'intake', field, source, quote } });
    ensureSource(draft, source);
    added += 1;
  }
  return { added, configured: true };
}

/**
 * Organize the round into an editable, provenance-bound merchant draft.
 * request: { state, transcript, description, sources, draft?, sourceBindings? }.
 * Never invents facts; never contacts anything but the user-configured API.
 */
export async function requestIntakeExtraction(request, { signal, fetchImpl = globalThis.fetch } = {}) {
  let fallbackDraft = null, sourceBindings = [], requestContext = null;
  const notes = [];
  const fallback = (code, message, sentToExternal = false) => ({
    ok: false, code, message, mode: 'manual_review', editable: fallbackDraft !== null,
    draft: fallbackDraft ? clone(fallbackDraft) : null, sourceBindings: clone(sourceBindings),
    requestContext, sentToExternal, notes: [...notes]
  });
  let draft;
  try {
    if (!request || !request.state?.round || !request.state?.input) throw new Error('context');
    const snapshot = clone(request.state);
    const { transcript, description, sources } = request;
    if (!ID.test(snapshot.round.id) || !Number.isSafeInteger(snapshot.round.inputVersion)
      || snapshot.round.inputVersion < 1 || !text(transcript, 20000) || !text(description, 20000)) throw new Error('context');
    requestContext = { sessionId: snapshot.sessionId, roundId: snapshot.round.id, inputVersion: snapshot.round.inputVersion };
    const base = request.draft ?? createMerchantIntakeDraft({ transcript, sources });
    const validated = validateMerchantIntakeDraft(base);
    if (!validated.ok || base.transcript !== transcript || !Array.isArray(sources)
      || sources.length !== base.sources.length || sources.some((source) => !base.sources.includes(source))) throw new Error('draft');
    draft = validated.draft;
    if (!Array.isArray(request.sourceBindings ?? [])) throw new Error('bindings');
    sourceBindings = clone(request.sourceBindings ?? []);
    fallbackDraft = draft;
    applyLocalFacts(draft, sourceBindings, snapshot, notes);
    if (signal?.aborted) return fallback('cancelled', '已取消整理，未发送任何内容。');
    const ai = await applyAiExtraction(draft, sourceBindings, { state: snapshot, transcript, description }, fetchImpl, signal, notes);
    const rechecked = validateMerchantIntakeDraft(draft);
    if (!rechecked.ok) throw new Error('draft');
    draft = rechecked.draft;
    const preflight = mapConfirmedIntakeToAnalysisInput(draft, { state: snapshot, sourceBindings });
    if (!preflight.ok) {
      return fallback(preflight.code || 'invalid_response', preflight.message || '整理结果与当前输入不一致，未替换当前编辑。');
    }
    return { ok: true, mode: ai.added > 0 ? 'api' : 'local', draft: clone(draft),
      sourceBindings: clone(sourceBindings), requestContext,
      editable: true, sentToExternal: ai.added > 0, notes: [...notes] };
  } catch (error) {
    if (error?.message === 'draft' || error?.message === 'bindings' || error?.message === 'context') {
      return fallback('invalid_intake', '原文、草稿、材料版本或来源不一致；保留当前编辑，请核对后重试。');
    }
    return fallback('extraction_failed', '整理未完成；原文和编辑草稿已保留，未发送到外部服务。');
  }
}
