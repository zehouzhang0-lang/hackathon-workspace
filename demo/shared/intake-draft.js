// Pure boundary for the v0.5 intake slice. No recognition, extraction, storage or I/O.
const VERSION = 'v0.5-intake-1';
const SOURCES = new Set(['voice', 'paste', 'txt', 'csv', 'json', 'xlsx', 'manual']);
const FILE_SOURCES = new Set(['txt', 'csv', 'json', 'xlsx']);
const STATUSES = new Set(['confirmed_fact', 'owner_hypothesis', 'unknown']);
export const TEXT_FIELDS = [
  'merchantName', 'productName', 'category', 'price', 'specifications', 'platform',
  'desiredAction', 'targetCustomerHypothesis', 'usageScenarioHypothesis',
  'purchaseReasonHypothesis', 'differentiationHypothesis', 'currentProblem'
];
const ARRAY_FIELDS = [
  'confirmedProductFacts', 'proofMaterials', 'previousAttempts', 'constraints',
  'customerQuestions', 'unknowns'
];
const COUNT_FIELDS = ['videoViews', 'productClicks', 'addToCarts', 'createdOrders', 'paidOrders'];
const DATE_FIELDS = ['windowStart', 'windowEnd'];
const METRIC_FIELDS = [...DATE_FIELDS, ...COUNT_FIELDS];
const TOP_FIELDS = ['version', 'sources', 'transcript', ...TEXT_FIELDS, ...ARRAY_FIELDS,
  'metrics', 'evidenceLedger', 'userCorrections'];
const LIMITS = { transcript: 20000, text: 4000, items: 100, records: 300 };
const ID = /^[A-Za-z0-9_-]{1,80}$/;
export const FIELD_LABELS = {
  merchantName: '商家名称', productName: '具体商品', category: '商品类目', price: '价格',
  specifications: '规格', platform: '经营平台', desiredAction: '希望改变的动作',
  targetCustomerHypothesis: '老板判断的目标人群', usageScenarioHypothesis: '老板判断的使用场景',
  purchaseReasonHypothesis: '老板判断的购买原因', differentiationHypothesis: '老板判断的差异',
  currentProblem: '本轮问题', 'metrics.windowStart': '观察开始日期',
  'metrics.windowEnd': '观察结束日期', 'metrics.videoViews': '视频观看次数',
  'metrics.productClicks': '商品点击次数', 'metrics.addToCarts': '加购次数',
  'metrics.createdOrders': '创建订单数', 'metrics.paidOrders': '支付订单数'
};
const KEYS = {
  merchantName: 'merchant_name', productName: 'product_name', category: 'category',
  price: 'price', specifications: 'specifications', platform: 'platform',
  desiredAction: 'desired_action', targetCustomerHypothesis: 'target_customer_hypothesis',
  usageScenarioHypothesis: 'usage_scenario_hypothesis',
  purchaseReasonHypothesis: 'purchase_reason_hypothesis',
  differentiationHypothesis: 'differentiation_hypothesis', currentProblem: 'current_problem',
  'metrics.windowStart': 'intake_window_start', 'metrics.windowEnd': 'intake_window_end',
  'metrics.videoViews': 'video_views', 'metrics.productClicks': 'product_clicks',
  'metrics.addToCarts': 'add_to_carts', 'metrics.createdOrders': 'created_orders',
  'metrics.paidOrders': 'paid_orders'
};
const ARRAY_KEYS = {
  confirmedProductFacts: 'intake_product_fact', proofMaterials: 'intake_proof_material',
  previousAttempts: 'intake_previous_attempt', constraints: 'round_constraint_intake',
  customerQuestions: 'intake_customer_question', unknowns: 'intake_unknown'
};
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const clone = (value) => structuredClone(value);
const record = (value) => value !== null && typeof value === 'object' &&
  !Array.isArray(value) && [null, Object.prototype].includes(Object.getPrototypeOf(value));
const present = (value) => value !== null && value !== undefined &&
  (typeof value !== 'string' || value.trim().length > 0);
const issue = (errors, field, message) => {
  if (errors.length < 40) errors.push({ field, message });
};
const invalid = (errors) => ({ ok: false, code: 'invalid_intake',
  message: '经营上下文校验未通过，请核对列出的字段。', errors });

// Reject non-JSON objects/accessors before reading data fields or cloning them.
function checkJSON(value, field, errors, ancestors = new Set(), budget = { nodes: 0 }, depth = 0) {
  if (++budget.nodes > 10000 || depth > 12) {
    issue(errors, field, '数据嵌套或条目数量超出范围。'); return;
  }
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return;
  if (typeof value === 'number' && Number.isFinite(value)) return;
  if (typeof value !== 'object' || (!Array.isArray(value) && !record(value))) {
    issue(errors, field, '只能使用普通JSON数据。'); return;
  }
  if (ancestors.has(value)) { issue(errors, field, '不能包含循环引用。'); return; }
  if (Object.getOwnPropertySymbols(value).length) issue(errors, field, '不能包含Symbol字段。');
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Array.isArray(value)) {
    if (value.length > 1000) { issue(errors, field, '数组过长。'); return; }
    for (let index = 0; index < value.length; index += 1) {
      if (!own(descriptors, String(index))) issue(errors, `${field}.${index}`, '数组不能有空洞。');
    }
  }
  ancestors.add(value);
  for (const [key, descriptor] of Object.entries(descriptors)) {
    if (Array.isArray(value) && key === 'length') continue;
    if (descriptor.get || descriptor.set || !descriptor.enumerable ||
      (Array.isArray(value) && !/^(0|[1-9]\d*)$/.test(key))) {
      issue(errors, `${field}.${key}`, '不能包含访问器、隐藏或额外数组字段。'); continue;
    }
    if (['__proto__', 'prototype', 'constructor'].includes(key)) {
      issue(errors, `${field}.${key}`, '字段名不被允许。'); continue;
    }
    checkJSON(descriptor.value, `${field}.${key}`, errors, ancestors, budget, depth + 1);
  }
  ancestors.delete(value);
}

function keys(value, allowed, required, field, errors) {
  if (!record(value)) { issue(errors, field, '必须是普通对象。'); return false; }
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) issue(errors, `${field}.${key}`, '不允许未知字段。');
  }
  for (const key of required) {
    if (!own(value, key)) issue(errors, `${field}.${key}`, '缺少必需字段。');
  }
  return true;
}

function text(value, field, errors, nullable = true, max = LIMITS.text) {
  if (nullable && value === null) return;
  if (typeof value !== 'string' || value.length > max || value.includes('\0')) {
    issue(errors, field, `必须是${nullable ? 'null或' : ''}不含NUL且不超过${max}字符的文字。`);
  }
}

function count(value, field, errors) {
  if (value !== null && (!Number.isSafeInteger(value) || value < 0)) {
    issue(errors, field, '必须是null或非负安全整数；未知不能写成0。');
  }
}

function validDate(value) {
  if (typeof value !== 'string' || !/^(?!0000)\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const days = [31, year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28,
    31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1];
}

function date(value, field, errors) {
  if (value !== null && !validDate(value)) issue(errors, field, '必须是null或真实的YYYY-MM-DD日期。');
}

function array(value, field, errors, maximum) {
  if (!Array.isArray(value) || value.length > maximum) {
    issue(errors, field, `必须是不超过${maximum}项的数组。`); return false;
  }
  return true;
}

function leaf(draft, path, historical = false) {
  if (typeof path !== 'string') return null;
  if (TEXT_FIELDS.includes(path)) return { value: draft[path], kind: 'text' };
  const metric = /^metrics\.([A-Za-z]+)$/.exec(path);
  if (metric && METRIC_FIELDS.includes(metric[1])) {
    return { value: draft.metrics?.[metric[1]], kind: DATE_FIELDS.includes(metric[1]) ? 'date' : 'count' };
  }
  const indexed = /^([A-Za-z]+)\.(0|[1-9]\d*)$/.exec(path);
  if (!indexed || !ARRAY_FIELDS.includes(indexed[1])) return null;
  const index = Number(indexed[2]);
  if (index >= LIMITS.items || (!historical && index >= (draft[indexed[1]]?.length ?? 0))) return null;
  return { value: draft[indexed[1]]?.[index] ?? null, kind: 'text', array: indexed[1], index };
}

function ledgerValue(value, field, errors, kind) {
  if (kind === 'count') return count(value, field, errors);
  if (kind === 'date') return date(value, field, errors);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) issue(errors, field, '数字必须是有限值。');
  } else text(value, field, errors);
}

/** Complete draft factory. Invalid overrides throw; unknown fields are never discarded. */
export function createMerchantIntakeDraft(overrides = {}) {
  const errors = [];
  checkJSON(overrides, 'overrides', errors);
  keys(overrides, TOP_FIELDS, [], 'overrides', errors);
  if (errors.length) throw Object.assign(new TypeError(invalid(errors).message), invalid(errors));
  const draft = {
    version: VERSION, sources: [], transcript: '',
    ...Object.fromEntries(TEXT_FIELDS.map((field) => [field, null])),
    ...Object.fromEntries(ARRAY_FIELDS.map((field) => [field, []])),
    metrics: Object.fromEntries(METRIC_FIELDS.map((field) => [field, null])),
    evidenceLedger: [], userCorrections: [], ...clone(overrides)
  };
  if (own(overrides, 'metrics') && record(overrides.metrics)) {
    draft.metrics = { ...Object.fromEntries(METRIC_FIELDS.map((field) => [field, null])), ...clone(overrides.metrics) };
  }
  const result = validateMerchantIntakeDraft(draft);
  if (!result.ok) throw Object.assign(new TypeError(result.message), result);
  return result.draft;
}

/** Validate without coercing strings, filling missing fields, or normalizing source text. */
export function validateMerchantIntakeDraft(draft) {
  const errors = [];
  checkJSON(draft, 'draft', errors);
  if (errors.length) return invalid(errors);
  if (!keys(draft, TOP_FIELDS, TOP_FIELDS, 'draft', errors)) return invalid(errors);
  if (draft.version !== VERSION) issue(errors, 'version', '不支持此经营上下文版本。');
  text(draft.transcript, 'transcript', errors, false, LIMITS.transcript);
  for (const field of TEXT_FIELDS) text(draft[field], field, errors);
  if (array(draft.sources, 'sources', errors, SOURCES.size)) {
    const seen = new Set();
    draft.sources.forEach((source, index) => {
      if (!SOURCES.has(source) || seen.has(source)) issue(errors, `sources.${index}`, '来源须合法且不重复。');
      seen.add(source);
    });
  }
  for (const field of ARRAY_FIELDS) {
    if (array(draft[field], field, errors, LIMITS.items)) {
      draft[field].forEach((value, index) => {
        text(value, `${field}.${index}`, errors, false);
        if (typeof value === 'string' && !value.trim()) issue(errors, `${field}.${index}`, '数组条目不能是空文字。');
      });
    }
  }
  if (keys(draft.metrics, METRIC_FIELDS, METRIC_FIELDS, 'metrics', errors)) {
    for (const field of COUNT_FIELDS) count(draft.metrics[field], `metrics.${field}`, errors);
    for (const field of DATE_FIELDS) date(draft.metrics[field], `metrics.${field}`, errors);
    if (validDate(draft.metrics.windowStart) && validDate(draft.metrics.windowEnd) &&
      draft.metrics.windowStart > draft.metrics.windowEnd) {
      issue(errors, 'metrics.windowEnd', '结束日期不能早于开始日期。');
    }
  }
  if (array(draft.evidenceLedger, 'evidenceLedger', errors, LIMITS.records)) {
    draft.evidenceLedger.forEach((entry, index) => {
      const field = `evidenceLedger.${index}`;
      if (!keys(entry, ['field', 'value', 'status', 'source', 'quote'],
        ['field', 'value', 'status', 'source'], field, errors)) return;
      const target = leaf(draft, entry.field);
      if (!target) issue(errors, `${field}.field`, '须指向当前草稿的业务叶字段或实际数组索引。');
      ledgerValue(entry.value, `${field}.value`, errors, target?.kind);
      if (!STATUSES.has(entry.status)) issue(errors, `${field}.status`, '证据状态不合法。');
      if (entry.status === 'unknown' && entry.value !== null) issue(errors, `${field}.value`, 'unknown的值必须为null。');
      if (!SOURCES.has(entry.source) || !Array.isArray(draft.sources) || !draft.sources.includes(entry.source)) {
        issue(errors, `${field}.source`, '证据来源必须已登记在sources中。');
      }
      if (own(entry, 'quote')) text(entry.quote, `${field}.quote`, errors, false);
    });
  }
  if (array(draft.userCorrections, 'userCorrections', errors, LIMITS.records)) {
    draft.userCorrections.forEach((entry, index) => {
      const field = `userCorrections.${index}`;
      if (!keys(entry, ['field', 'before', 'after'], ['field', 'before', 'after'], field, errors)) return;
      // Correction history can refer to an array item subsequently removed from the live draft.
      const target = leaf(draft, entry.field, true);
      if (!target) issue(errors, `${field}.field`, '更正路径须为业务叶字段或合法历史数组索引。');
      ledgerValue(entry.before, `${field}.before`, errors, target?.kind);
      ledgerValue(entry.after, `${field}.after`, errors, target?.kind);
    });
  }
  return errors.length ? invalid(errors) : { ok: true, draft: clone(draft) };
}

function positions(locator, field, errors, startKey, endKey, minimum) {
  if (!Number.isSafeInteger(locator[startKey]) || locator[startKey] < minimum ||
    !Number.isSafeInteger(locator[endKey]) || locator[endKey] < locator[startKey]) {
    issue(errors, field, '来源位置须使用有效且有序的整数范围。');
  }
}

function checkLocator(locator, binding, field, errors) {
  if (!record(locator)) { issue(errors, field, '须提供原解析器的定位对象。'); return; }
  if (binding.source === 'csv') {
    if (!keys(locator, ['type', 'recordIndex', 'lineStart', 'lineEnd', 'column'],
      ['type', 'recordIndex', 'lineStart', 'lineEnd', 'column'], field, errors)) return;
    if (locator.type !== 'csv' || !Number.isSafeInteger(locator.recordIndex) || locator.recordIndex < 1) {
      issue(errors, field, 'CSV定位类型或记录索引不合法。');
    }
    positions(locator, field, errors, 'lineStart', 'lineEnd', 1);
    text(locator.column, `${field}.column`, errors, false, 120);
    if (!present(locator.column)) issue(errors, `${field}.column`, 'CSV定位缺少列名。');
  } else if (binding.source === 'json') {
    keys(locator, ['type', 'pointer'], ['type', 'pointer'], field, errors);
    if (locator.type !== 'json' || typeof locator.pointer !== 'string' ||
      locator.pointer.length > 1024 || !locator.pointer.startsWith('/') ||
      /~(?![01])/.test(locator.pointer) || locator.pointer.includes('\0') ||
      locator.pointer.split('/').some((part) => ['__proto__', 'prototype', 'constructor'].includes(part))) {
      issue(errors, field, 'JSON定位须为合法且具体的JSON Pointer。');
    }
  } else if (binding.source === 'txt') {
    keys(locator, ['type', 'start', 'end', 'lineStart', 'lineEnd'], ['type'], field, errors);
    if (!['text', 'txt'].includes(locator.type)) issue(errors, field, 'TXT定位类型不合法。');
    const offset = own(locator, 'start') || own(locator, 'end');
    const lines = own(locator, 'lineStart') || own(locator, 'lineEnd');
    if (!offset && !lines) issue(errors, field, 'TXT定位须有字符范围或行范围。');
    if (offset) positions(locator, field, errors, 'start', 'end', 0);
    if (lines) positions(locator, field, errors, 'lineStart', 'lineEnd', 1);
  } else if (binding.source === 'xlsx') {
    if (!keys(locator, ['type', 'sheet', 'cell'], ['type', 'sheet', 'cell'], field, errors)) return;
    if (locator.type !== 'xlsx') issue(errors, field, 'XLSX定位类型不合法。');
    text(locator.sheet, `${field}.sheet`, errors, false, 200);
    text(locator.cell, `${field}.cell`, errors, false, 40);
    if (!present(locator.sheet) || !present(locator.cell)) {
      issue(errors, field, 'XLSX定位缺少工作表或单元格。');
    }
  } else {
    keys(locator, ['type', 'field', 'source', 'quote'], ['type', 'field', 'source'], field, errors);
    if (locator.type !== 'intake' || locator.field !== binding.field || locator.source !== binding.source) {
      issue(errors, field, '文字来源定位必须与绑定字段及来源一致。');
    }
    if (own(locator, 'quote')) text(locator.quote, `${field}.quote`, errors);
  }
}

function bindingIndex(draft, input, bindings, errors) {
  const result = new Map();
  checkJSON(bindings, 'sourceBindings', errors);
  if (errors.length || !array(bindings, 'sourceBindings', errors, LIMITS.records)) return result;
  bindings.forEach((binding, index) => {
    const field = `sourceBindings.${index}`;
    if (!keys(binding, ['field', 'source', 'materialId', 'materialVersion', 'locator'],
      ['field', 'source'], field, errors)) return;
    if (!leaf(draft, binding.field)) issue(errors, `${field}.field`, '绑定须指向当前草稿的业务叶字段。');
    if (!SOURCES.has(binding.source) || !draft.sources.includes(binding.source)) {
      issue(errors, `${field}.source`, '绑定来源必须已登记在sources中。');
    }
    const key = `${binding.field}:${binding.source}`;
    if (result.has(key)) issue(errors, field, '同一字段和来源只能有一个明确定位。');
    if (FILE_SOURCES.has(binding.source)) {
      const material = input.materials.find((item) => item.id === binding.materialId);
      if (!material || !ID.test(binding.materialId) || !Number.isSafeInteger(binding.materialVersion) ||
        binding.materialVersion < 1 || material.version !== binding.materialVersion ||
        typeof material.name !== 'string' || material.name.toLowerCase().split('.').at(-1) !== binding.source) {
        issue(errors, field, '文件来源须绑定当前真实材料、版本和匹配的扩展名。');
      }
      checkLocator(binding.locator, binding, `${field}.locator`, errors);
    } else {
      if (binding.materialId != null || binding.materialVersion != null) {
        issue(errors, field, '语音、粘贴或手动来源不能伪装成文件材料。');
      }
      if (own(binding, 'locator')) checkLocator(binding.locator, binding, `${field}.locator`, errors);
    }
    result.set(key, binding);
  });
  for (const entry of draft.evidenceLedger) {
    if (FILE_SOURCES.has(entry.source) && !result.has(`${entry.field}:${entry.source}`)) {
      issue(errors, entry.field, '文件证据缺少当前材料定位，不能降级成语音或手动来源。');
    }
  }
  return result;
}

const localId = (kind, field) => `draft_intake_${kind}_${field.replaceAll('.', '_')}`;
const owned = (entry, draft) => typeof entry.intakeField === 'string' && Boolean(leaf(draft, entry.intakeField, true));
const fieldKey = (field) => {
  if (KEYS[field]) return KEYS[field];
  const [name, index] = field.split('.');
  return `${ARRAY_KEYS[name]}_${index}`;
};
const sameFileLocation = (left, right) => left?.kind === 'file_extract' && right?.kind === 'file_extract' &&
  left.materialId === right.materialId && left.materialVersion === right.materialVersion &&
  record(left.locator) && record(right.locator) &&
  Object.keys(left.locator).length === Object.keys(right.locator).length &&
  Object.keys(left.locator).every((key) => own(right.locator, key) && Object.is(left.locator[key], right.locator[key]));

// File-backed facts keep parser ownership after a merchant correction. Resolve
// their original location from saved correction history, never from a new value.
function matchesFileFact(fact, source, state) {
  return sameFileLocation(fact.source, source) || fact.verification === 'user_corrected' &&
    (state.history || []).some((entry) => entry.type === 'fact_correction' && entry.factId === fact.id &&
      entry.before?.key === fact.key && sameFileLocation(entry.before.source, source));
}
function intakeBindingGroups(state, bindings) {
  if (bindings) return [bindings];
  return [state.input?.intake?.sourceBindings || [], ...(state.history || []).slice().reverse()
    .filter((entry) => entry.type === 'intake_revision' && entry.intake)
    .map((entry) => entry.intake.sourceBindings || [])];
}
function bindingMatchesFact(binding, fact, state) {
  return FILE_SOURCES.has(binding.source) && fact.key === fieldKey(binding.field) &&
    matchesFileFact(fact, { kind: 'file_extract', materialId: binding.materialId,
      materialVersion: binding.materialVersion, locator: binding.locator }, state);
}

// Read-only association for the confirmation UI; this never adds intakeField
// to an externally owned fact or changes its saved provenance.
export function findIntakeFieldFact(state, field, bindings = null) {
  const facts = state?.input?.facts || [];
  const matching = (group) => facts.filter((fact) => group.some((binding) =>
    binding.field === field && bindingMatchesFact(binding, fact, state)));
  const explicit = bindings?.filter((binding) => binding.field === field && FILE_SOURCES.has(binding.source));
  if (explicit?.length) {
    const matches = matching(explicit);
    return matches.length === 1 ? matches[0] : null;
  }
  const ownedFacts = facts.filter((fact) => fact.intakeField === field);
  if (ownedFacts.length) return ownedFacts.length === 1 ? ownedFacts[0] : null;
  const current = (state?.input?.intake?.sourceBindings || [])
    .filter((binding) => binding.field === field && FILE_SOURCES.has(binding.source));
  if (current.length) {
    const matches = matching(current);
    return matches.length === 1 ? matches[0] : null;
  }
  const corrected = facts.filter((fact) => !fact.intakeField && fact.verification === 'user_corrected' &&
    fact.source?.locator?.type === 'intake' && fact.source.locator.field === field);
  if (corrected.length) return corrected.length === 1 ? corrected[0] : null;
  for (const group of intakeBindingGroups(state, bindings)) {
    const matches = facts.filter((fact) => !fact.intakeField && group.some((binding) =>
      binding.field === field && bindingMatchesFact(binding, fact, state)));
    if (matches.length) return matches.length === 1 ? matches[0] : null;
  }
  return null;
}
export function intakeReferencesFact(state, fact) {
  if (!state?.input?.intake || !fact) return false;
  if (fact.intakeField || fact.source?.locator?.type === 'intake') return true;
  return intakeBindingGroups(state).some((group) => group.some((binding) => bindingMatchesFact(binding, fact, state)));
}

// Only an append-only, contiguous new correction chain can replace a saved edit.
function correctionChanges(draft, input, previous, errors) {
  const changed = new Set();
  const savedDraft = input.intake?.draft;
  const savedHistory = savedDraft == null ? [] : savedDraft.userCorrections;
  if (!Array.isArray(savedHistory) || draft.userCorrections.length < savedHistory.length ||
    savedHistory.some((entry, index) => !record(entry) ||
      !['field', 'before', 'after'].every((key) => Object.is(entry[key], draft.userCorrections[index]?.[key])))) {
    issue(errors, 'userCorrections', '须按原顺序保留已保存的完整更正记录，再追加本次修改。');
    return changed;
  }
  const chains = new Map();
  draft.userCorrections.slice(savedHistory.length).forEach((entry, offset) => {
    if (!chains.has(entry.field)) chains.set(entry.field, []);
    chains.get(entry.field).push({ entry, index: savedHistory.length + offset });
  });
  for (const [field, chain] of chains) {
    // A missing historical array leaf means an explicit deletion, not a new index.
    const target = leaf(draft, field, true);
    const saved = savedDraft == null ? null : leaf(savedDraft, field, true);
    const fact = previous.get(field);
    const unknownText = target.array === 'unknowns';
    let current;
    if (fact?.verification === 'user_corrected' && !unknownText) current = fact.value;
    else if (saved) current = saved.value;
    else if (fact && !unknownText) current = fact.value;
    else if (fact) current = input.unknowns.find((entry) => entry.intakeField === field)?.description;
    else current = chain[0].entry.before; // First unsaved local edit has no persisted baseline.
    if (current === undefined) {
      issue(errors, field, '缺少可核对的已存值，不能据此重写更正。');
      continue;
    }
    const initial = current;
    let valid = true;
    for (const { entry, index } of chain) {
      if (!Object.is(entry.before, current)) {
        issue(errors, `userCorrections.${index}.before`, '新增更正须从当前已存值连续衔接，不能跳过或重排修改。');
        valid = false; break;
      }
      current = entry.after;
    }
    if (valid && !Object.is(current, target.value)) {
      issue(errors, field, '更正链末值须与当前字段一致；删除须明确以null收尾且该索引已不存在。');
      valid = false;
    }
    if (valid && !Object.is(initial, current)) changed.add(field);
  }
  return changed;
}

/** Full merge projection only; the coordinator commits it atomically with the raw intake. */
export function mapConfirmedIntakeToAnalysisInput(rawDraft, options = {}) {
  if (!record(options)) {
    return invalid([{ field: 'options', message: '映射参数须包含当前state和可选sourceBindings。' }]);
  }
  const { state, sourceBindings = [] } = options;
  const validated = validateMerchantIntakeDraft(rawDraft);
  if (!validated.ok) return validated;
  const draft = validated.draft, errors = [];
  const input = state?.input;
  if (!record(input) || !['facts', 'constraints', 'unknowns', 'materials'].every((field) =>
    Array.isArray(input[field]) && input[field].every(record)) ||
    (input.focus !== null && typeof input.focus !== 'string')) {
    return invalid([{ field: 'state.input', message: '缺少当前统一输入及材料索引。' }]);
  }
  const bindings = bindingIndex(draft, input, sourceBindings, errors);
  if (errors.length) return invalid(errors);
  const fields = [...TEXT_FIELDS, ...METRIC_FIELDS.map((field) => `metrics.${field}`),
    ...ARRAY_FIELDS.flatMap((field) => draft[field].map((_, index) => `${field}.${index}`))];
  const previous = new Map(input.facts.filter((fact) => owned(fact, draft)).map((fact) => [fact.intakeField, fact]));
  for (const field of fields) {
    const explicitlyBound = sourceBindings.some((binding) => binding.field === field && FILE_SOURCES.has(binding.source));
    const fact = explicitlyBound ? findIntakeFieldFact(state, field, sourceBindings) : findIntakeFieldFact(state, field);
    if (fact && !previous.has(field)) previous.set(field, fact);
  }
  const changedFields = correctionChanges(draft, input, previous, errors);
  if (errors.length) return invalid(errors);
  // Prior records retain manual provenance; only the validated new tail authorizes replacement.
  const corrections = new Map(draft.userCorrections.map((entry) => [entry.field, entry]));
  const replacesCorrection = (fact) => changedFields.has(fact.intakeField);
  const protectedFacts = new Map([...previous].filter(([field, fact]) =>
    fact.verification === 'user_corrected' && !changedFields.has(field)));
  for (const [field, fact] of protectedFacts) {
    if (!owned(fact, draft) && !Object.is(leaf(draft, field, true)?.value ?? null, fact.value)) {
      issue(errors, field, '关联材料事实已有新的用户更正；请先核对当前值，不恢复旧确认卡。');
    }
  }
  if (errors.length) return invalid(errors);
  const ledger = new Map();
  for (const entry of draft.evidenceLedger) {
    if (!ledger.has(entry.field)) ledger.set(entry.field, []);
    ledger.get(entry.field).push(entry);
  }
  const resolutions = new Map();
  for (const field of fields) {
    const target = leaf(draft, field);
    const entries = ledger.get(field) || [];
    const explicitUnknown = target.array === 'unknowns';
    const rawValue = explicitUnknown ? null : (present(target.value) ? target.value : null);
    const correction = corrections.get(field);
    const corrected = correction && Object.is(correction.after, target.value) &&
      !Object.is(correction.before, correction.after);
    const fieldBindings = [...bindings.values()].filter((binding) => binding.field === field);
    let source = entries[0]?.source ?? (fieldBindings.length === 1 ? fieldBindings[0].source :
      draft.sources.length === 1 ? draft.sources[0] : null);
    let conflicting = !corrected && entries.some((entry) => !Object.is(entry.value, rawValue));
    if (!source && rawValue !== null) conflicting = true;
    let binding = source ? bindings.get(`${field}:${source}`) : null;
    if (FILE_SOURCES.has(source) && !binding) {
      if (rawValue !== null || entries.length || explicitUnknown) {
        issue(errors, field, '文件字段缺少有效定位，不能伪装为商家口述。'); continue;
      }
      // An empty, unbound field has no file evidence; do not fabricate a locator.
      source = null;
    }
    let quote = entries.find((entry) => entry.source === source)?.quote ?? null;
    if (!corrected && ['voice', 'paste'].includes(source) && quote && !draft.transcript.includes(quote)) {
      conflicting = true;
    }
    if (corrected) {
      source = draft.sources.includes('manual') ? 'manual' : null;
      binding = source ? bindings.get(`${field}:${source}`) : null;
      quote = null;
    }
    const hypothesis = field.endsWith('Hypothesis') || entries.some((entry) => entry.status === 'owner_hypothesis');
    const value = conflicting ? null : rawValue;
    const evidenceStatus = value === null ? 'unknown' : hypothesis ? 'owner_hypothesis' : 'confirmed_fact';
    const locator = binding?.locator ? clone(binding.locator) : { type: 'intake', field, source, quote };
    const sourceInfo = {
      kind: FILE_SOURCES.has(source) ? 'file_extract' : 'merchant_statement',
      materialId: FILE_SOURCES.has(source) ? binding.materialId : null,
      materialVersion: FILE_SOURCES.has(source) ? binding.materialVersion : null,
      locator,
      note: corrected ? '商家明确修改后的内容；原文与更正记录保留，不等于外部核验。' :
        conflicting ? '字段、证据或来源存在不一致，保留原始账本并待核对。' :
          hypothesis ? '老板当前判断，不是已证实事实或成功概率。' :
            FILE_SOURCES.has(source) ? '从已绑定材料整理，尚未核验业务真实性。' :
              '商家自述，尚未外部核验；确认表示理解无误，不代表已证实。'
    };
    resolutions.set(field, { value, rawValue, evidenceStatus, sourceInfo, conflicting, corrected,
      explicitUnknown, emit: rawValue !== null || entries.length > 0 || previous.has(field) || explicitUnknown });
  }
  if (errors.length) return invalid(errors);
  let facts, constraints, unknowns;
  try {
    facts = clone(input.facts.filter((fact) => !owned(fact, draft) ||
      (fact.verification === 'user_corrected' && !replacesCorrection(fact))));
    constraints = clone(input.constraints.filter((entry) => !owned(entry, draft) || entry.verification === 'user_corrected'));
    unknowns = clone(input.unknowns.filter((entry) => !owned(entry, draft) || entry.verification === 'user_corrected'));
  } catch {
    return invalid([{ field: 'state.input', message: '当前输入包含不可复制的状态。' }]);
  }
  const mapped = new Map(protectedFacts);
  const factCorrections = [];
  const contextValue = (field) => protectedFacts.has(field) ? protectedFacts.get(field).value :
    resolutions.get(field)?.value ?? null;
  const subject = contextValue('productName');
  const window = { start: contextValue('metrics.windowStart'), end: contextValue('metrics.windowEnd') };
  const oldConstraint = new Map(input.constraints.filter((item) => owned(item, draft)).map((item) => [item.intakeField, item]));
  const oldUnknown = new Map(input.unknowns.filter((item) => owned(item, draft)).map((item) => [item.intakeField, item]));
  function addUnknown(field, description, reason, sourceId) {
    if (unknowns.some((item) => item.intakeField === field)) return;
    unknowns.push({ id: oldUnknown.get(field)?.id ?? localId('u', field), intakeField: field,
      description, reason, sourceId });
  }
  for (const [field, resolution] of resolutions) {
    if (!resolution.emit || protectedFacts.has(field)) continue;
    const baseKey = fieldKey(field);
    const key = resolution.evidenceStatus === 'owner_hypothesis' && !baseKey.includes('hypothesis') ? `hypothesis_${baseKey}` : baseKey;
    const prior = previous.get(field);
    if (prior && !owned(prior, draft) && changedFields.has(field)) {
      const amended = { ...clone(prior), value: resolution.value,
        availability: resolution.value === null ? 'unknown' : 'known',
        evidenceStatus: resolution.evidenceStatus, verification: 'user_corrected', source: clone(resolution.sourceInfo) };
      facts = facts.map((fact) => fact.id === prior.id ? amended : fact);
      mapped.set(field, amended);
      factCorrections.push({ field, factId: prior.id, before: clone(prior) });
      continue;
    }
    const parsedMatches = input.facts.filter((fact) => !owned(fact, draft) && fact.key === baseKey &&
      matchesFileFact(fact, resolution.sourceInfo, state));
    if (parsedMatches.length) {
      if (parsedMatches.length !== 1 || !Object.is(parsedMatches[0].value, resolution.value)) {
        issue(errors, field, '同一文件定位的既有解析值与确认内容不一致；请明确更正，不覆盖原材料事实。');
        continue;
      }
      if (key === baseKey) {
        // This fact belongs to its material parser, not to the intake projection.
        // Reuse it as a reference without changing its ID, scope, or ownership.
        mapped.set(field, facts.find((fact) => fact.id === parsedMatches[0].id));
        continue;
      }
    }
    const priorLocator = prior?.source?.locator, nextLocator = resolution.sourceInfo.locator;
    const sameSource = prior?.source?.kind === resolution.sourceInfo.kind
      && prior.source.materialId === resolution.sourceInfo.materialId
      && prior.source.materialVersion === resolution.sourceInfo.materialVersion
      && record(priorLocator) && record(nextLocator)
      && Object.keys(priorLocator).length === Object.keys(nextLocator).length
      && Object.keys(nextLocator).every((name) => Object.is(priorLocator[name], nextLocator[name]));
    // Preserve an existing measured scope only for the unchanged immediate field.
    // Never infer a scope from a product name, a fixture template or a new value.
    const keepMeasuredScope = prior && owned(prior, draft)
      && field.startsWith('metrics.') && COUNT_FIELDS.includes(field.slice(8))
      && prior.availability === 'known' && prior.value !== null
      && Object.is(prior.value, resolution.value) && prior.key === key
      && prior.evidenceStatus === resolution.evidenceStatus && !resolution.corrected && !resolution.conflicting
      && prior.subject === subject && prior.window?.start === window.start && prior.window?.end === window.end
      && input.intake?.draft?.platform === draft.platform && sameSource;
    const fact = {
      id: previous.get(field)?.id ?? localId('f', field), intakeField: field, key,
      value: resolution.value, availability: resolution.value === null ? 'unknown' : 'known',
      unit: keepMeasuredScope ? prior.unit ?? null : null, subject: typeof subject === 'string' ? subject : null,
      window: field.startsWith('metrics.') && COUNT_FIELDS.includes(field.slice(8)) ? clone(window) : { start: null, end: null },
      channel: keepMeasuredScope ? prior.channel ?? null : null, cohort: keepMeasuredScope ? prior.cohort ?? null : null,
      source: resolution.sourceInfo, evidenceStatus: resolution.evidenceStatus,
      verification: resolution.evidenceStatus === 'owner_hypothesis' ? 'unreviewed' :
        resolution.corrected ? 'user_corrected' : resolution.conflicting ? 'conflicting' : 'unreviewed'
    };
    facts.push(fact); mapped.set(field, fact);
  }
  if (errors.length) return invalid(errors);
  // External records are preserved verbatim. Retain an unknown tombstone if one refers
  // to an old intake item which disappeared, rather than leaving a dangling fact ID.
  const retainedRefs = new Set([
    ...facts.flatMap((fact) => [...(fact.sourceFactIds || []), ...(fact.source?.sourceFactIds || [])]),
    ...constraints.flatMap((entry) => entry.sourceFactIds || []),
    ...unknowns.filter((entry) => entry.sourceId?.startsWith('fact:')).map((entry) => entry.sourceId.slice(5))
  ]);
  for (const [field, fact] of previous) {
    if (!mapped.has(field) && retainedRefs.has(fact.id)) {
      const retained = { ...clone(fact), value: null, availability: 'unknown', evidenceStatus: 'unknown', verification: 'unreviewed' };
      retained.source.note = '该项已不在当前确认草稿中；为已有引用保留未知位置，原值不再作为当前事实。';
      facts.push(retained); mapped.set(field, retained);
    }
  }
  for (const [field, fact] of mapped) {
    const resolution = resolutions.get(field);
    if (field.startsWith('constraints.') && fact.availability === 'known' && present(fact.value) &&
      !constraints.some((entry) => entry.intakeField === field)) {
      constraints.push({ id: oldConstraint.get(field)?.id ?? localId('c', field), intakeField: field,
        description: String(fact.value), value: null, unit: null, scope: 'round',
        evidenceStatus: fact.evidenceStatus, sourceFactIds: [fact.id] });
    }
    if (fact.availability === 'unknown' || fact.value === null) {
      const description = field.startsWith('unknowns.') ? leaf(draft, field, true)?.value : null;
      addUnknown(field, description || `${FIELD_LABELS[field] || '经营信息'}尚未确认。`,
        resolution?.conflicting ? 'conflicting' : 'unknown', `fact:${fact.id}`);
    } else if (field.startsWith('metrics.') && COUNT_FIELDS.includes(field.slice(8)) &&
      fact.evidenceStatus !== 'owner_hypothesis') {
      const missing = [
        !present(fact.unit) && '单位', !present(fact.subject) && '对象',
        (!present(fact.window?.start) || !present(fact.window?.end)) && '观察窗口',
        !present(fact.channel) && '流量渠道', !present(fact.cohort) && '群体口径'
      ].filter(Boolean);
      if (missing.length) addUnknown(field, `${FIELD_LABELS[field]}缺少${missing.join('、')}，不能据此拼成漏斗。`,
        'not_provided', `fact:${fact.id}`);
    }
  }
  const problem = contextValue('currentProblem');
  const oldProblem = input.intake?.draft?.currentProblem;
  const focus = typeof problem === 'string' && problem.trim() ? problem :
    oldProblem != null && input.focus === oldProblem ? null : input.focus;
  return { ok: true, projection: { focus, facts, constraints, unknowns }, factCorrections };
}
