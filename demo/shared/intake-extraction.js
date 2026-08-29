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
import { extractLocalIntakeCandidates } from './local-intake-parser.js';

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
const LOCATOR_SOURCES = { csv: 'csv', json: 'json', xlsx: 'xlsx', txt: 'txt' };
const AI_TEXT_LIMIT = 6000;
const AI_STRUCTURED_LIMIT = 12000;
const AI_CONTEXT_ARRAY_LIMIT = 20;

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
const optString = (value, limit) => typeof value === 'string' && text(value, limit) ? value : null;

function buildAiStructuredContext(draft) {
  const shortText = (value) => typeof value === 'string' && value.length > 500
    ? value.slice(0, 500) + '…' : value;
  const list = (field) => (draft[field] || []).slice(0, AI_CONTEXT_ARRAY_LIMIT).map(shortText);
  const context = {
    fields: Object.fromEntries(TEXT_FIELDS.filter((field) => leafValue(draft, field) !== null)
      .map((field) => [field, shortText(leafValue(draft, field))])),
    metrics: draft.metrics,
    confirmedProductFacts: list('confirmedProductFacts'),
    proofMaterials: list('proofMaterials'),
    previousAttempts: list('previousAttempts'),
    constraints: list('constraints'),
    customerQuestions: list('customerQuestions'),
    unknowns: list('unknowns')
  };
  const serialized = JSON.stringify(context, null, 2);
  return serialized.length > AI_STRUCTURED_LIMIT
    ? serialized.slice(0, AI_STRUCTURED_LIMIT) + '\n…（结构化草稿后略，已有值仍不得改写）'
    : serialized;
}

function ensureSource(draft, source) {
  if (!draft.sources.includes(source)) draft.sources.push(source);
}

function factFileSource(fact, state) {
  const direct = LOCATOR_SOURCES[fact?.source?.locator?.type];
  if (direct) return direct;
  if (fact?.source?.locator?.type !== 'text') return null;
  const material = (state?.input?.materials || []).find((item) =>
    item.id === fact.source.materialId && item.version === fact.source.materialVersion);
  const extension = String(material?.name || '').toLowerCase().split('.').at(-1);
  return ['txt', 'csv', 'json', 'xlsx'].includes(extension) ? extension : null;
}

// Layer 1: project locally parsed file facts into empty scalar fields.
// Only fills fields that are still null and unbound; conflicts stay empty and
// are reported instead of guessed.
function applyLocalFacts(draft, bindings, state, notes) {
  const facts = (state?.input?.facts || []).filter((fact) =>
    fact && fact.availability === 'known' && fact.value !== null && fact.value !== undefined &&
    fact.source?.kind === 'file_extract' && factFileSource(fact, state) &&
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
    const source = factFileSource(fact, state);
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
      const source = factFileSource(fact, state);
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

// Project only explicit label/value pairs from the saved transcript and
// description.  Distinct values for the same field are a conflict: neither is
// selected and the field remains unknown.  Every accepted value keeps the
// exact quote that justified it.
function applyLocalNarrative(draft, bindings, transcript, description, notes) {
  const transcriptSource = draft.sources.includes('voice') ? 'voice'
    : draft.sources.includes('paste') ? 'paste' : 'manual';
  const inputs = [
    { value: transcript, source: transcriptSource },
    { value: description, source: 'manual' }
  ].filter((entry) => typeof entry.value === 'string' && entry.value.trim());
  const candidates = new Map();
  for (const input of inputs) {
    for (const candidate of extractLocalIntakeCandidates(input.value)) {
      if (!candidates.has(candidate.field)) candidates.set(candidate.field, []);
      candidates.get(candidate.field).push({ ...candidate, source: input.source });
    }
  }
  for (const [field, list] of candidates) {
    if (leafValue(draft, field) !== null || bindings.some((binding) => binding.field === field)) continue;
    const distinct = new Map();
    for (const candidate of list) {
      const key = JSON.stringify(candidate.value);
      if (!distinct.has(key)) distinct.set(key, candidate);
    }
    if (distinct.size !== 1) {
      notes.push('文字中“' + (FIELD_LABELS[field] || field) + '”存在多个不同取值，未自动填入。');
      continue;
    }
    const candidate = distinct.values().next().value;
    setLeaf(draft, field, clone(candidate.value));
    ensureSource(draft, candidate.source);
    const status = field.endsWith('Hypothesis') ? 'owner_hypothesis' : 'confirmed_fact';
    draft.evidenceLedger.push({ field, value: clone(candidate.value), status,
      source: candidate.source, quote: candidate.quote, quoteVerified: true });
    bindings.push({ field, source: candidate.source, materialId: null, materialVersion: null,
      locator: { type: 'intake', field, source: candidate.source, quote: candidate.quote } });
  }
}

// Layer 2: ask the user-configured API to fill still-empty text fields.
async function applyAiExtraction(draft, bindings, request, fetchImpl, signal, notes) {
  const emptyFields = TEXT_FIELDS.filter((field) => leafValue(draft, field) === null &&
    !bindings.some((binding) => binding.field === field));
  const settings = await getAiSettings({ fetchImpl, signal, timeoutMs: 8000 });
  if (!settings.ok || !settings.configured) {
    return { added: 0, configured: false, attempted: false, completed: false };
  }
  const clip = (value, limit = AI_TEXT_LIMIT) => value.length > limit ? value.slice(0, limit) + '\n…（后略，仅根据以上文字整理）' : value;
  const structuredContext = buildAiStructuredContext(draft);
  const materialTexts = Array.isArray(request.materialTexts) ? request.materialTexts : [];
  const materialDigest = Array.isArray(request.materialDigest) ? request.materialDigest : [];
  // 材料文本只发一遍：原文已随直连数据提取发送过时，这里只附带其已核验的提取结果，
  // 不重复发送材料原文；quote 仍逐字核验——只接受已发送文本中出现过的片段。
  const DIGEST_CHAR_LIMIT = 10000;
  const digestLines = [];
  let digestChars = 0;
  for (const entry of materialDigest) {
    const line = '- ' + entry.metric + ' = ' + String(entry.value) + (entry.unit ? ' ' + entry.unit : '')
      + (entry.subject ? '（' + entry.subject + '）' : '')
      + '｜材料《' + entry.material + '》原文行：' + entry.source_line;
    if (digestChars + line.length > DIGEST_CHAR_LIMIT) break;
    digestLines.push(line);
    digestChars += line.length;
  }
  const digestText = digestLines.join('\n');
  const digestBlock = digestText
    ? '\n\n【上传材料AI提取结果（用户已同意发送；数值与原文行已逐字核验）】\n' + digestText
      + (digestLines.length < materialDigest.length ? '\n（提取结果过长，仅附前' + digestLines.length + '条）' : '')
    : '';
  const factLines = (request.state?.input?.facts || [])
    .filter((fact) => fact && fact.availability === 'known' && fact.value !== null)
    .slice(0, 40)
    .map((fact) => '- ' + fact.key + '=' + String(fact.value) + (fact.unit ? ' ' + fact.unit : '') +
      (fact.subject ? '（对象：' + fact.subject + '）' : ''));
  const fieldLines = emptyFields.length
    ? emptyFields.map((field) => '- ' + field + '（' + (FIELD_LABELS[field] || field) + '）')
    : ['- 无空字段：只读取并核对上下文，fields 必须返回空对象，不得改写已有值'];
  let sentMaterialTexts = !digestBlock
    ? materialTexts.map((entry) => ({ name: entry.name, text: clip(entry.text, 12000) })) : [];
  const materialBlock = sentMaterialTexts.length
    ? '\n\n【上传材料文本（用户已逐次同意发送，可作为quote依据）】\n' + sentMaterialTexts
        .map((entry) => '《' + entry.name + '》\n' + entry.text).join('\n\n')
    : '';
  let descriptionText = clip(request.description);
  let transcriptText = clip(request.transcript);
  let contextText = structuredContext;
  let materialLimit = 12000;
  const composeUserContent = () => '【商家描述】\n' + descriptionText
    + '\n\n【语音或粘贴原文】\n' + transcriptText
    + '\n\n【当前结构化草稿（已填字段与指标，只读）】\n' + contextText
    + (factLines.length ? '\n\n【本机已从上传材料解析的指标（可核对；发现矛盾可用challenges质疑，但不得直接改写数值）】\n' + factLines.join('\n') : '')
    + digestBlock
    + materialBlock
    + '\n\n请整理以下仍未填写的字段，逐项给出 value（不超过200字）与 quote：\n' + fieldLines.join('\n')
    + '\n\n只输出JSON，不要输出其他文字。JSON精确字段：{"fields":{"<字段名>":{"value":"...","quote":"..."}},'
    + '"challenges":[{"metric":"指标名","issue":"不超过300字的矛盾或异常说明","quote":"来自已发送文本的原文片段"}]}'
    + '。fields与challenges都可以为空对象/空数组。';
  let userContent = composeUserContent();
  if (userContent.length > 38000) {
    materialLimit = 6000;
    sentMaterialTexts = !digestBlock
      ? materialTexts.map((entry) => ({ name: entry.name, text: clip(entry.text, 6000) })) : [];
    const shrunkMaterialBlock = sentMaterialTexts.length
      ? '\n\n【上传材料文本（用户已逐次同意发送，可作为quote依据）】\n' + sentMaterialTexts
          .map((entry) => '《' + entry.name + '》\n' + entry.text).join('\n\n')
      : '';
    descriptionText = clip(request.description, 3000);
    transcriptText = clip(request.transcript, 3000);
    contextText = structuredContext.slice(0, 8000) + '\n…（结构化草稿后略，已有值仍不得改写）';
    userContent = '【商家描述】\n' + descriptionText
      + '\n\n【语音或粘贴原文】\n' + transcriptText
      + '\n\n【当前结构化草稿（已填字段与指标，只读）】\n' + contextText
      + (factLines.length ? '\n\n【本机已从上传材料解析的指标（可核对；发现矛盾可用challenges质疑，但不得直接改写数值）】\n' + factLines.join('\n') : '')
      + digestBlock
      + shrunkMaterialBlock
      + '\n\n请整理以下仍未填写的字段，逐项给出 value（不超过200字）与 quote：\n' + fieldLines.join('\n')
      + '\n\n只输出JSON，不要输出其他文字。JSON精确字段：{"fields":{"<字段名>":{"value":"...","quote":"..."}},'
      + '"challenges":[{"metric":"指标名","issue":"不超过300字的矛盾或异常说明","quote":"来自已发送文本的原文片段"}]}'
      + '。fields与challenges都可以为空对象/空数组。';
  }
  const reply = await requestAiChat({
    maxTokens: 4096,
    messages: [
      { role: 'system', content: '你是经营资料整理助手。读取当前结构化草稿、商家描述、原文和上传材料文本（或其已核验的提取结果），但不得改写已有字段与本机指标数值。' +
        '只为仍为空的字段提取信息；每个字段必须给出 value 与 quote，quote 必须是商家描述、原文、上传材料文本或其提取结果中连续出现的原文片段；' +
        '若发现本机指标之间存在矛盾或与描述明显不符，在 challenges 中提出有依据的质疑（quote 同样须来自已发送文本），不要直接改写数值；' +
        '找不到依据的字段不要输出；不要编造；只输出JSON，不要输出其他文字。' },
      { role: 'user', content: userContent }
    ]
  }, { fetchImpl, signal, timeoutMs: 60000 });
  if (!reply.ok) {
    notes.push('已配置 AI 但整理请求未完成（' + reply.message + '）；已保留本机提取结果，未替换任何内容。');
    return { added: 0, challenges: [], configured: true, attempted: true, completed: false };
  }
  let payload;
  try {
    const body = reply.content;
    const start = body.indexOf('{'), end = body.lastIndexOf('}');
    if (start < 0 || end <= start) throw new Error('no json');
    payload = JSON.parse(body.slice(start, end + 1));
  } catch {
    notes.push('AI 返回不是可用 JSON；已保留本机提取结果，未替换任何内容。');
    return { added: 0, challenges: [], configured: true, attempted: true, completed: false };
  }
  const fields = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload.fields : null;
  if (!fields || typeof fields !== 'object' || Array.isArray(fields)) {
    notes.push('AI 返回缺少 fields 对象；已保留本机提取结果。');
    return { added: 0, challenges: [], configured: true, attempted: true, completed: false };
  }
  // 指标质疑：必须携带能在已发送文本中核验的原文quote，否则丢弃。
  const challenges = [];
  const challengeList = Array.isArray(payload.challenges) ? payload.challenges.slice(0, 10) : [];
  for (const entry of challengeList) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const metric = typeof entry.metric === 'string' ? entry.metric.trim().slice(0, 120) : '';
    const issue = typeof entry.issue === 'string' ? entry.issue.trim().slice(0, 300) : '';
    const quote = typeof entry.quote === 'string' ? entry.quote.trim() : '';
    if (!metric || !issue || !quote || quote.length > 4000) continue;
    const verifiable = transcriptText.includes(quote) || descriptionText.includes(quote)
      || Boolean(digestText && digestText.includes(quote))
      || sentMaterialTexts.some((material) => material.text.includes(quote));
    if (!verifiable) continue;
    challenges.push({ metric, issue, quote });
  }
  let added = 0;
  const materialHits = [];
  for (const field of emptyFields) {
    const entry = fields[field];
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const value = typeof entry.value === 'string' ? entry.value.trim() : '';
    const quote = typeof entry.quote === 'string' ? entry.quote : '';
    if (!value || value.length > 4000 || !quote || quote.length > 4000 || value.includes('\0')) continue;
    let source = null;
    let materialName = null;
    if (transcriptText.includes(quote)) {
      source = ['voice', 'paste', 'manual'].find((name) => draft.sources.includes(name)) || 'paste';
    } else if (descriptionText.includes(quote)) {
      source = ['manual', 'paste'].find((name) => draft.sources.includes(name)) || 'manual';
    } else {
      const hit = sentMaterialTexts.find((entry2) => entry2.text.includes(quote));
      const digestHit = hit ? null : materialDigest.find((entry2) => entry2.source_line.includes(quote)) || null;
      if (!hit && !digestHit) continue; // quote not verified against the text actually sent — drop it
      materialName = hit ? hit.name : digestHit.material;
      const matches = (request.state?.input?.materials || []).filter((item) => item.name === materialName);
      if (matches.length !== 1) continue;
      const material = matches[0];
      source = String(material.name).toLowerCase().split('.').at(-1);
      if (!['txt', 'csv', 'json', 'xlsx'].includes(source)) continue;
      let locator;
      if (digestHit) {
        if (digestHit.materialId !== material.id || digestHit.materialVersion !== material.version
          || digestHit.locator?.type !== 'text') continue;
        locator = clone(digestHit.locator);
      } else {
        const at = hit.text.indexOf(quote);
        const lineStart = hit.text.slice(0, at).split('\n').length;
        locator = { type: 'text', lineStart, lineEnd: lineStart + quote.split('\n').length - 1 };
      }
      bindings.push({ field, source, materialId: material.id,
        materialVersion: material.version, locator });
    }
    setLeaf(draft, field, value);
    // 重新整理时以最新提取为准：清掉该字段与本值不一致的旧提取记录，
    // 避免跨次整理累积出"来源冲突"；同一次运行内不同来源的真冲突仍会标记。
    draft.evidenceLedger = draft.evidenceLedger.filter((entry) =>
      !(entry.field === field && !Object.is(entry.value, value)));
    draft.evidenceLedger.push({ field, value, status: 'confirmed_fact', source, quote, quoteVerified: true });
    if (!materialName) bindings.push({ field, source, locator: { type: 'intake', field, source, quote } });
    ensureSource(draft, source);
    added += 1;
    if (materialName) materialHits.push('“' + (FIELD_LABELS[field] || field) + '”来自材料《' + materialName + '》');
  }
  if (materialHits.length) {
    notes.push('其中' + materialHits.join('、') + '；已绑定当前材料版本与本次实际发送的原文行，请在核对时展开来源。');
  }
  if (digestBlock) {
    notes.push('本次整理未重复发送材料原文，只附带其已核验的AI提取结果' + digestLines.length + '条。');
  }
  if (added === 0) {
    notes.push(emptyFields.length
      ? 'AI 已读取当前结构化草稿，但没有返回可由原文核验的新字段。'
      : 'AI 已读取当前结构化草稿；现有文字字段已完整，未覆盖用户填写内容。');
  }
  if (challenges.length) {
    notes.push('AI 对本机指标提出 ' + challenges.length + ' 条有依据的质疑（quote 已核验），请结合原件复核。');
  }
  return { added, challenges, configured: true, attempted: true, completed: true };
}

/**
 * Organize the round into an editable, provenance-bound merchant draft.
 * request: { state, transcript, description, sources, draft?, sourceBindings?,
 *   materialTexts?, materialDigest? }.
 * materialDigest is verified requestMaterialFacts output; when present it replaces raw
 * material texts in the prompt, so one organize round sends material content at most once.
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
    // 直连数据提取：仅当用户逐次勾选同意，页面才附带材料文本（每份≤12000字符、最多4份）。
    let materialTexts = [];
    if (request.materialTexts !== undefined) {
      if (!Array.isArray(request.materialTexts) || request.materialTexts.length > 6) throw new Error('context');
      for (const entry of request.materialTexts) {
        if (!entry || typeof entry.name !== 'string' || !text(entry.name, 200)
          || typeof entry.text !== 'string' || !text(entry.text, 12000)) throw new Error('context');
        materialTexts.push({ name: entry.name, text: entry.text });
      }
    }
    // 直连数据提取结果摘要：requestMaterialFacts 已核验的条目；整理请求以此替代材料
    // 原文，保证同一次整理中材料文本最多发送一遍。结构与数量同样从严校验。
    let materialDigest = [];
    if (request.materialDigest !== undefined) {
      if (!Array.isArray(request.materialDigest) || request.materialDigest.length > 400) throw new Error('context');
      for (const entry of request.materialDigest) {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new Error('context');
        const locator = entry.locator;
        const material = (snapshot.input.materials || []).find((item) => item.id === entry.materialId);
        if (typeof entry.metric !== 'string' || !text(entry.metric, 120)
          || typeof entry.value !== 'number' || !Number.isFinite(entry.value)
          || typeof entry.source_line !== 'string' || !text(entry.source_line, 400)
          || typeof entry.material !== 'string' || !text(entry.material, 200)
          || !ID.test(entry.materialId) || !Number.isSafeInteger(entry.materialVersion) || entry.materialVersion < 1
          || !material || material.version !== entry.materialVersion || material.name !== entry.material
          || !locator || locator.type !== 'text'
          || !Number.isSafeInteger(locator.lineStart) || locator.lineStart < 1
          || !Number.isSafeInteger(locator.lineEnd) || locator.lineEnd < locator.lineStart) throw new Error('context');
        materialDigest.push({
          metric: entry.metric, value: entry.value,
          unit: optString(entry.unit, 40), subject: optString(entry.subject, 300),
          window_start: optString(entry.window_start, 10), window_end: optString(entry.window_end, 10),
          source_line: entry.source_line, material: entry.material,
          materialId: entry.materialId, materialVersion: entry.materialVersion,
          locator: clone(locator),
        });
      }
    }
    requestContext = { sessionId: snapshot.sessionId, roundId: snapshot.round.id, inputVersion: snapshot.round.inputVersion };
    const base = request.draft ?? createMerchantIntakeDraft({ transcript, sources });
    const validated = validateMerchantIntakeDraft(base);
    if (!validated.ok || base.transcript !== transcript || !Array.isArray(sources)
      || sources.length !== base.sources.length || sources.some((source) => !base.sources.includes(source))) throw new Error('draft');
    draft = validated.draft;
    if (!Array.isArray(request.sourceBindings ?? [])) throw new Error('bindings');
    sourceBindings = clone(request.sourceBindings ?? []);
    fallbackDraft = draft;
    // 重新整理时以当前填写值为准：清掉台账中与本值不一致的旧提取记录。
    // 跨次整理遗留的不同取值是"来源冲突/按未知保留"的主要来源；同一次运行内
    // 不同来源的真冲突仍会照常标记，不会被这段清掉。
    const leafOf = (field) => field.startsWith('metrics.')
      ? draft.metrics?.[field.slice(8)] : draft[field];
    draft.evidenceLedger = draft.evidenceLedger.filter((entry) => {
      if (!entry || typeof entry.field !== 'string') return true;
      const current = leafOf(entry.field);
      if (current === undefined) return true;
      return Object.is(current, entry.value)
        || (entry.value === null && entry.status === 'unknown' && current === null);
    });
    applyLocalFacts(draft, sourceBindings, snapshot, notes);
    applyLocalNarrative(draft, sourceBindings, transcript, description, notes);
    if (signal?.aborted) return fallback('cancelled', '已取消整理，未发送任何内容。');
    const ai = await applyAiExtraction(draft, sourceBindings,
      { state: snapshot, transcript, description, materialTexts, materialDigest }, fetchImpl, signal, notes);
    const rechecked = validateMerchantIntakeDraft(draft);
    if (!rechecked.ok) throw new Error('draft');
    draft = rechecked.draft;
    const preflight = mapConfirmedIntakeToAnalysisInput(draft, { state: snapshot, sourceBindings });
    if (!preflight.ok) {
      return fallback(preflight.code || 'invalid_response', preflight.message || '整理结果与当前输入不一致，未替换当前编辑。');
    }
    return { ok: true, mode: ai.completed ? 'api' : ai.attempted ? 'api_failed' : 'local', draft: clone(draft),
      sourceBindings: clone(sourceBindings), requestContext,
      editable: true, sentToExternal: ai.completed ? true : ai.attempted ? null : false, notes: [...notes],
      challenges: clone(ai.challenges || []) };
  } catch (error) {
    if (error?.message === 'draft' || error?.message === 'bindings' || error?.message === 'context') {
      return fallback('invalid_intake', '原文、草稿、材料版本或来源不一致；保留当前编辑，请核对后重试。');
    }
    return fallback('extraction_failed', '整理未完成；原文和编辑草稿已保留，未发送到外部服务。');
  }
}
