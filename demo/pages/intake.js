import { enhanceFoldTitle } from "../shared/title-motion.js";
import { findIntakeFieldFact } from "../shared/intake-draft.js";

let titleMotionController = null;
export function getIntakeTitleMotionState() {
  return titleMotionController ? { status: titleMotionController.status, reason: titleMotionController.reason } : null;
}

const METRIC_FIELDS = [
  "metric", "value", "unit", "subject", "window_start", "window_end", "channel", "cohort"
];
const TEXT_FIELDS = METRIC_FIELDS.filter((field) => field !== "value");
const METRIC_LABELS = {
  paid_orders: "支付订单", detail_visitors: "商品详情访客", product_visitors: "商品访客",
  views: "观看次数", inquiries: "咨询数", price: "价格"
};
const IMAGE_TYPES = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp" };
const NO_METRICS = "暂无可核对的业务指标；本次仅按描述和材料状态整理。";
const NO_DESCRIPTION = "本轮具体问题尚未描述，可先核对手头材料。";
const DECIMAL = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/;

function labelFor(key) {
  return Object.hasOwn(METRIC_LABELS, key) ? METRIC_LABELS[key] : key;
}

function textOrNull(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function fileExtension(name) {
  return String(name).split(".").pop().toLowerCase();
}

function errorWithCode(message, code) {
  return Object.assign(new Error(message), { code });
}

function validDate(value) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + "T00:00:00.000Z");
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function summarizeWarnings(warnings) {
  const unique = [...new Set(warnings)];
  return unique.length ? unique.slice(0, 6).join("；") +
    (unique.length > 6 ? "；另有 " + (unique.length - 6) + " 项需在原件中核对。" : "") : null;
}

// A record retains physical line positions, including embedded quoted newlines.
export function parseCsvRecords(text) {
  const records = [];
  let cells = [], cell = "", line = 1, startLine = 1, quoted = false, closedQuote = false;
  const finishCell = () => { cells.push(cell); cell = ""; closedQuote = false; };
  const finishRecord = () => {
    finishCell();
    records.push({ cells, lineStart: startLine, lineEnd: line, recordIndex: records.length + 1 });
    cells = [];
  };
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') { cell += '"'; index += 1; }
        else { quoted = false; closedQuote = true; }
      } else if (char === "\r" || char === "\n") {
        cell += "\n";
        if (char === "\r" && text[index + 1] === "\n") index += 1;
        line += 1;
      } else cell += char;
      continue;
    }
    if (char === ",") { finishCell(); continue; }
    if (char === "\r" || char === "\n") {
      finishRecord();
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      line += 1;
      startLine = line;
      continue;
    }
    if (closedQuote) throw new Error("第 " + line + " 行的引号结束后仍有额外字符。");
    if (char === '"') {
      if (cell !== "") throw new Error("第 " + line + " 行的引号位置不正确。");
      quoted = true;
    } else cell += char;
  }
  if (quoted) throw new Error("第 " + startLine + " 行开始的引号没有闭合。");
  if (cell !== "" || cells.length || closedQuote) finishRecord();
  return records;
}

function metricFact(record, material, locator, id, warnings, origin) {
  const context = origin === "csv" ? "第 " + locator.lineStart + " 行" : locator.pointer;
  let value = record.value ?? null;
  if (origin === "csv") {
    const raw = typeof value === "string" ? value.trim() : "";
    if (!raw) value = null;
    else if (DECIMAL.test(raw) && Number.isFinite(Number(raw))) value = Number(raw);
    else { value = null; warnings.push(context + "的 value 不是有限十进制数，保留未知"); }
  }
  const start = textOrNull(record.window_start), end = textOrNull(record.window_end);
  const window = { start, end };
  for (const field of ["start", "end"]) {
    if (window[field] !== null && !validDate(window[field])) {
      warnings.push(context + "的日期无效，保留未知");
      window[field] = null;
    }
  }
  const reversed = window.start !== null && window.end !== null && window.start > window.end;
  if (reversed) warnings.push(context + "的起止日期颠倒，未自动调换");
  const missing = [];
  if (value === null) missing.push("数值");
  for (const [field, title] of [
    ["unit", "单位"], ["subject", "对象"], ["channel", "渠道"], ["cohort", "群体口径"]
  ]) if (textOrNull(record[field]) === null) missing.push(title);
  if (!window.start || !window.end) missing.push("时间范围");
  if (missing.length) warnings.push(context + "缺少" + missing.join("、"));
  if (typeof value === "number" && value < 0) {
    warnings.push(context + "的数值为负，请核对指标含义");
  }
  return {
    id, key: record.metric.trim(), value, availability: value === null ? "unknown" : "known",
    unit: textOrNull(record.unit), subject: textOrNull(record.subject), window,
    channel: textOrNull(record.channel), cohort: textOrNull(record.cohort),
    source: {
      kind: "file_extract", materialId: material.id, materialVersion: material.version,
      locator, note: "从上传" + origin.toUpperCase() + "原件读取；尚未核验业务真实性。"
    },
    verification: reversed ? "conflicting" : "unreviewed"
  };
}

// This is a page-local parser, not a second session or persistence layer.
export function parseMetricText(rawText, material) {
  const text = rawText.replace(/^\uFEFF/, "");
  const extension = fileExtension(material.name);
  if (text.includes("\0")) {
    return { status: "failed", facts: [], error: "文本含 NUL 字符，不能按 UTF-8 文本提取；原件已保留。" };
  }
  if (extension === "txt") {
    return { status: "needs_review", facts: [], error: "文本已读取，业务信息仍待核对。" };
  }
  const warnings = [], facts = [];
  if (extension === "csv") {
    let rows;
    try { rows = parseCsvRecords(text); }
    catch (error) { return { status: "needs_review", facts: [], error: error.message }; }
    if (!rows.length) return { status: "needs_review", facts: [], error: "CSV 为空，未提取指标。" };
    const header = rows[0].cells.map((field) => field.trim());
    if (new Set(header).size !== header.length || !header.includes("metric")) {
      return { status: "needs_review", facts: [], error: "CSV 表头须包含 metric，且不能有重复列；原件可查看。" };
    }
    if (header.some((field) => !METRIC_FIELDS.includes(field))) warnings.push("未映射不在白名单中的列");
    const absent = METRIC_FIELDS.filter((field) => !header.includes(field));
    if (absent.length) warnings.push("缺列 " + absent.join("、") + "，相应信息保持未知");
    for (const row of rows.slice(1)) {
      if (row.cells.length === 1 && row.cells[0].trim() === "") continue;
      if (row.cells.length !== header.length) {
        warnings.push("第 " + row.lineStart + " 行列数与表头不一致，该行未自动提取");
        continue;
      }
      const record = Object.fromEntries(METRIC_FIELDS.map((field) => [field, null]));
      for (let index = 0; index < header.length; index += 1) {
        if (METRIC_FIELDS.includes(header[index])) record[header[index]] = row.cells[index];
      }
      if (!textOrNull(record.metric)) {
        warnings.push("第 " + row.lineStart + " 行缺少 metric，未猜测指标");
        continue;
      }
      facts.push(metricFact(record, material, {
        type: "csv", recordIndex: row.recordIndex, lineStart: row.lineStart,
        lineEnd: row.lineEnd, column: header.includes("value") ? "value" : "metric"
      }, "draft_f" + (facts.length + 1), warnings, "csv"));
    }
  } else if (extension === "json") {
    let input;
    try { input = JSON.parse(text); }
    catch { return { status: "failed", facts: [], error: "JSON 语法有误，未提取；可查看并替换原件。" }; }
    const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
    if (!object(input) || Object.keys(input).some((key) => !["schema", "metrics"].includes(key)) ||
      input.schema !== "demo.metrics.v1" || !Array.isArray(input.metrics)) {
      return { status: "needs_review", facts: [], error: "仅支持 schema=demo.metrics.v1 的 metrics 数组，未导入其他结构。" };
    }
    const invalid = input.metrics.some((record) =>
      !object(record) || Object.keys(record).some((key) => !METRIC_FIELDS.includes(key)) ||
      !textOrNull(record.metric) ||
      (record.value !== undefined && record.value !== null &&
        (typeof record.value !== "number" || !Number.isFinite(record.value))) ||
      TEXT_FIELDS.some((key) => record[key] !== undefined && record[key] !== null && typeof record[key] !== "string")
    );
    if (invalid) {
      return { status: "needs_review", facts: [], error: "JSON 有未知字段或不符合白名单的类型，整份未自动提取；数值不能用字符串代替。" };
    }
    input.metrics.forEach((record, index) => {
      facts.push(metricFact(record, material, {
        type: "json", pointer: "/metrics/" + index + (Object.hasOwn(record, "value") ? "/value" : "/metric")
      }, "draft_f" + (index + 1), warnings, "json"));
    });
  } else return { status: "needs_review", facts: [], error: "此文件不属于约定的文本解析格式。" };
  if (!facts.length) warnings.push("没有可自动提取的指标");
  return { status: warnings.length ? "needs_review" : "parsed", facts, error: summarizeWarnings(warnings) };
}

export async function readSupportedMaterial(blob, material) {
  if (Object.hasOwn(IMAGE_TYPES, fileExtension(material.name))) {
    return { status: "needs_review", facts: [], error: "图片已接收，内容待核对；未进行文字识别。" };
  }
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(await blob.arrayBuffer());
    return parseMetricText(text, material);
  } catch {
    return { status: "failed", facts: [], error: "无法按 UTF-8 读取文本，未猜测编码；原件已保留。" };
  }
}

function unknownSignature(entry) {
  return JSON.stringify([entry.sourceId ?? null, entry.reason, entry.description]);
}

export function buildOrganization(snapshot, focusText, ownedUnknowns = new Map(), generatedUnknowns = new Set()) {
  const input = snapshot.input;
  const facts = structuredClone(input.facts);
  const materials = new Map(input.materials.map((material) => [material.id, material]));
  const existing = input.unknowns ?? [];
  const externalSignatures = new Set(existing.filter((entry) =>
    ownedUnknowns.get(entry.id) !== unknownSignature(entry)).map(unknownSignature));
  const entries = [];
  const add = (description, reason, sourceId, generated = true) => {
    const entry = { description, reason, sourceId };
    entries.push(entry);
    if (generated && !externalSignatures.has(unknownSignature(entry))) {
      generatedUnknowns.add(unknownSignature(entry));
    }
  };
  // Only recompute IDs this page actually created in this run. A material/fact source
  // or a familiar phrase does not prove ownership of a saved business uncertainty.
  for (const unknown of existing) {
    if (ownedUnknowns.get(unknown.id) === unknownSignature(unknown)) continue;
    add(unknown.description, unknown.reason, unknown.sourceId ?? null, false);
  }
  if (!input.description.trim()) add(NO_DESCRIPTION, "not_provided", "input:description");
  if (!facts.length) add(NO_METRICS, "not_provided", "input:focus");
  for (const material of materials.values()) {
    if (material.status !== "parsed") {
      add(material.error || "材料内容仍待核对。", "unparsed", "material:" + material.id);
    }
  }
  const quantitativeFacts = facts.filter((fact) => fact.availability !== "not_applicable" &&
    (typeof fact.value === "number" || ["csv", "json"].includes(fact.source?.locator?.type)));
  for (const fact of quantitativeFacts) {
    const missing = [];
    if (fact.availability === "unknown" || fact.value === null) missing.push("数值");
    if (!fact.unit) missing.push("单位");
    if (!fact.subject) missing.push("对象");
    if (!fact.window?.start || !fact.window?.end) missing.push("时间范围");
    if (!fact.channel) missing.push("渠道");
    if (!fact.cohort) missing.push("群体口径");
    if (missing.length) add("指标“" + labelFor(fact.key) + "”缺少" + missing.join("、") + "，保留未知。",
      "not_provided", "fact:" + fact.id);
    if (fact.window?.start && fact.window?.end && fact.window.start > fact.window.end) {
      add("指标“" + labelFor(fact.key) + "”的起止日期存在冲突，未调换原值。",
        "conflicting", "fact:" + fact.id);
    }
  }
  const dimensions = [
    ["对象", (fact) => fact.subject], ["渠道", (fact) => fact.channel],
    ["群体口径", (fact) => fact.cohort],
    ["时间范围", (fact) => fact.window?.start && fact.window?.end ?
      fact.window.start + "/" + fact.window.end : null]
  ];
  const applicableFacts = quantitativeFacts;
  const differences = dimensions.filter(([, value]) =>
    new Set(applicableFacts.map(value).filter(Boolean)).size > 1).map(([name]) => name);
  if (differences.length) add("材料之间存在不同的" + differences.join("、") + "；分别保留，不拼成同一漏斗。",
    "conflicting", "input:focus");
  for (const key of new Set(applicableFacts.map((fact) => fact.key))) {
    const units = new Set(applicableFacts.filter((fact) => fact.key === key).map((fact) => fact.unit).filter(Boolean));
    if (units.size > 1) add("指标“" + labelFor(key) + "”存在不同单位；分别保留，不直接合并。",
      "conflicting", "input:focus");
  }
  const oldIds = new Map(existing.map((entry) => [unknownSignature(entry), entry.id]));
  const seen = new Set();
  const unknowns = entries.filter((entry) => {
    const key = unknownSignature(entry);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).map((entry, index) => ({ id: oldIds.get(unknownSignature(entry)) || "draft_u" + (index + 1), ...entry }));
  return {
    focus: textOrNull(focusText) || textOrNull(input.description) || "先核对手头材料，明确本轮要解决的问题",
    facts, constraints: structuredClone(input.constraints), unknowns,
    roundId: snapshot.round.id, inputVersion: snapshot.round.inputVersion
  };
}

const INTAKE_FIELD_LABELS = {
  merchantName: "商家名称", productName: "商品", category: "类目", price: "价格", specifications: "规格",
  platform: "平台", desiredAction: "希望顾客做什么", targetCustomerHypothesis: "可能购买的人",
  usageScenarioHypothesis: "可能使用的场景", purchaseReasonHypothesis: "你判断的购买原因",
  differentiationHypothesis: "你判断的区别", confirmedProductFacts: "商品情况", proofMaterials: "已有证明材料",
  currentProblem: "当前问题", previousAttempts: "已经试过", constraints: "限制", customerQuestions: "顾客常问",
  unknowns: "尚不清楚", "metrics.windowStart": "观察开始日期", "metrics.windowEnd": "观察结束日期",
  "metrics.videoViews": "视频观看次数", "metrics.productClicks": "商品点击次数",
  "metrics.addToCarts": "加购次数", "metrics.createdOrders": "创建订单数", "metrics.paidOrders": "支付订单数"
};
const INTAKE_REVIEW_GROUPS = [
  { id: "product", title: "你卖的商品", fields: ["productName", "category", "merchantName", "confirmedProductFacts", "proofMaterials"] },
  { id: "offer", title: "价格与规格", fields: ["price", "specifications"] },
  { id: "platform", title: "在哪里卖", fields: ["platform", "desiredAction"] },
  { id: "audience", title: "你判断的目标人群", fields: ["targetCustomerHypothesis", "purchaseReasonHypothesis"] },
  { id: "scenario", title: "你判断的使用场景", fields: ["usageScenarioHypothesis", "differentiationHypothesis"] },
  { id: "problem", title: "现在卡在哪里", fields: ["currentProblem", "customerQuestions"] },
  { id: "attempts", title: "已经试过什么", fields: ["previousAttempts"] },
  { id: "constraints", title: "这轮的限制", fields: ["constraints"] },
  { id: "data", title: "数据与缺口", fields: ["metrics.windowStart", "metrics.windowEnd", "metrics.videoViews",
    "metrics.productClicks", "metrics.addToCarts", "metrics.createdOrders", "metrics.paidOrders", "unknowns"] }
];
const INTAKE_ARRAY_FIELDS = new Set(["confirmedProductFacts", "proofMaterials", "previousAttempts",
  "constraints", "customerQuestions", "unknowns"]);
const INTAKE_COUNT_FIELDS = new Set(["metrics.videoViews", "metrics.productClicks", "metrics.addToCarts",
  "metrics.createdOrders", "metrics.paidOrders"]);

function intakeFieldValue(draft, field) {
  return field.startsWith("metrics.") ? draft?.metrics?.[field.slice(8)] ?? null : draft?.[field] ?? null;
}

function hasIntakeValue(value) {
  return value !== null && value !== undefined && (Array.isArray(value) ? value.length > 0 :
    typeof value === "string" ? !!value.trim() : true);
}

// Presentation metadata only; shared/intake-draft.js remains the only draft schema.
export function getIntakeReviewGroups(draft, projection = null) {
  return INTAKE_REVIEW_GROUPS.map((group) => ({
    ...group,
    items: group.fields.flatMap((field) => {
      const raw = intakeFieldValue(draft, field);
      const values = Array.isArray(raw) ? raw.map((value, index) => ({ value, path: field + "." + index })) :
        [{ value: raw, path: field }];
      return values.filter((entry) => hasIntakeValue(entry.value)).map((entry) => {
        const evidence = (draft?.evidenceLedger || []).filter((item) => item.field === entry.path);
        const correction = (draft?.userCorrections || []).findLast((item) => item.field === entry.path);
        const explicitlyCorrected = correction && Object.is(correction.after, entry.value) &&
          !Object.is(correction.before, correction.after);
        const projected = projection?.facts?.find((fact) => fact.intakeField === entry.path);
        const conflicting = projected?.verification === "conflicting" || !explicitlyCorrected &&
          evidence.some((item) => !Object.is(item.value, field === "unknowns" ? null : entry.value));
        return { field, path: entry.path, label: INTAKE_FIELD_LABELS[field], value: entry.value,
          hypothesis: field.endsWith("Hypothesis") || evidence.some((item) => item.status === "owner_hypothesis"),
          conflicting, availability: projected?.availability || (conflicting ? "unknown" : "known"),
          sources: [...new Set(evidence.map((item) => item.source))] };
      });
    })
  }));
}


// Six presentation groups only; never persisted as a second intake schema.
export function getIntakeSummaryGroups(draft, state = null, projection = null, sourceBindings = null) {
  const groups = [
    { id: "data", title: "已读取数据", empty: "尚无已读取的指标；未提供的值保持未知。" },
    { id: "background", title: "商品与经营背景", empty: "商品和已做动作尚未提供，可在完整字段中补充。" },
    { id: "judgment", title: "老板的判断", empty: "尚未提供判断；不会替你猜测购买原因。" },
    { id: "unconfirmed", title: "尚未确认", empty: "仍待你核对；尚未进行外部核验。" },
    { id: "constraints", title: "经营限制", empty: "尚未提供，不默认预算、时间或可做的动作。" },
    { id: "gaps", title: "数据缺口", empty: "没有额外登记的缺口，不等于资料已全部核实。" }
  ].map((group) => ({ ...group, items: [] }));
  const byId = Object.fromEntries(groups.map((group) => [group.id, group]));
  const sourceNames = { voice: "语音自述", manual: "商家填写", paste: "粘贴文字",
    txt: "TXT提取", csv: "CSV提取", json: "JSON提取" };
  const add = (id, item) => {
    if (!byId[id].items.some((entry) => entry.text === item.text && entry.note === item.note &&
      entry.factId === item.factId && entry.materialId === item.materialId && entry.field === item.field)) byId[id].items.push(item);
  };
  const facts = state?.input?.facts || [];
  const conflicts = getIntakeCorrectionConflicts(draft, facts, state, sourceBindings);
  const representedFacts = new Set();
  const factRow = (fact) => {
    const label = INTAKE_FIELD_LABELS[fact.intakeField] || labelFor(fact.key);
    const value = fact.availability === "not_applicable" ? "不适用" :
      fact.availability !== "known" || fact.value === null ? "未知" :
        String(fact.value) + (fact.unit ? " " + fact.unit : "");
    const fileSource = fact.source?.kind === "file_extract" ? fact.source :
      (state?.history || []).find((entry) => entry.type === "fact_correction" && entry.factId === fact.id &&
        entry.before?.source?.kind === "file_extract")?.before.source;
    const material = (state?.input?.materials || []).find((entry) => entry.id === fileSource?.materialId &&
      entry.version === fileSource?.materialVersion);
    const provenance = fact.verification === "conflicting" ? "来源或口径冲突，待核对" :
      fact.verification === "user_corrected" ? (fileSource ?
      "商家更正；原文件未改写" : "商家明确更正，未外部核验") :
      fact.source?.kind === "file_extract" ? "文件提取，待核对" :
      fact.source?.kind === "merchant_statement" ? "商家陈述，未外部核验" :
      fact.source?.kind === "scenario_assumption" ? "情景假设" : "来源及口径待核对";
    const window = fact.window?.start || fact.window?.end ?
      (fact.window.start || "起日未知") + "至" + (fact.window.end || "止日未知") : null;
    const note = [provenance, material ? material.name + " v" + material.version :
      fileSource ? "原文件来源见明细" : null, fact.subject, fact.channel, fact.cohort, window].filter(Boolean).join(" · ");
    return { text: label + "：" + value, note, factId: fact.id, conflicting: fact.verification === "conflicting" };
  };
  for (const item of getIntakeReviewGroups(draft, projection).flatMap((group) => group.items)) {
    const row = { field: item.field, conflicting: item.conflicting, text: item.label + "：" +
      (item.conflicting ? "待核对（当前填写：" + String(item.value) + "）" : String(item.value)),
      note: item.hypothesis ? "商家判断，尚未证实" :
        item.conflicting ? "来源不一致，按未知保留" :
          item.sources.map((source) => sourceNames[source] || source).join(" · ") || "当前填写，来源待核对" };
    if (item.hypothesis) add("judgment", row);
    else if (item.field.startsWith("metrics.")) {
      const fact = state ? findIntakeFieldFact(state, item.path, sourceBindings) : null;
      if (fact && ((!item.conflicting && Object.is(fact.value, item.value)) ||
        conflicts.some((entry) => entry.field === item.path && entry.factId === fact.id && entry.canRecover))) {
        add("data", factRow(fact));
        representedFacts.add(fact.id);
      } else {
        add("data", row);
        if (fact) representedFacts.add(fact.id);
      }
    } else if (item.field === "constraints") add("constraints", row);
    else if (item.field === "unknowns") add("gaps", row);
    else if (item.field === "customerQuestions") add("unconfirmed", row);
    else add("background", row);
    if (item.conflicting) add("unconfirmed", { ...row, note: "来源冲突，需在完整字段中核对" });
  }
  for (const fact of facts.filter((item) => !item.intakeField && !representedFacts.has(item.id) &&
    (item.source?.kind === "file_extract" || item.verification === "user_corrected"))) {
    add("data", factRow(fact));
  }
  for (const conflict of conflicts) {
    const label = INTAKE_FIELD_LABELS[conflict.field] || INTAKE_FIELD_LABELS[conflict.field.split(".")[0]] || "这项信息";
    add("unconfirmed", { field: conflict.field, factId: conflict.factId, conflicting: true,
      text: label + "：旧卡片“" + String(conflict.oldValue ?? "未知") +
        "”／当前更正“" + String(conflict.currentValue ?? "未知") + "”",
      note: conflict.canRecover ? "点“有信息不对”核对当前更正，再明确保存" :
        "数组、类型或来源对应不明确，阻止自动恢复" });
  }
  for (const material of state?.input?.materials || []) {
    if (material.status !== "parsed") add("unconfirmed", { text: material.name + "：" +
      (material.status === "failed" ? "读取未完成" : "已接收，内容待核对"),
      note: material.error || "没有把接收成功当作内容已理解", materialId: material.id });
  }
  for (const constraint of state?.input?.constraints || []) {
    if (constraint.intakeField || constraint.source?.locator?.type === "intake") continue;
    add("constraints", { text: constraint.description + (constraint.value === null || constraint.value === undefined ? "" :
      "：" + String(constraint.value) + (constraint.unit || "")), note: "本轮已登记限制" });
  }
  for (const unknown of [...(projection?.unknowns || []), ...(state?.input?.unknowns || [])]) {
    add("gaps", { text: unknown.description, conflicting: unknown.reason === "conflicting",
      note: unknown.reason === "conflicting" ? "来源或口径冲突" : "保留未知" });
  }
  return groups;
}

// Input ownership only: no browser permission or recording is performed here.
export function createVoiceHoldController({ canStart, hasConsent, requestConsent, start, stop, cancel, getPhase }) {
  let held = null;
  return {
    begin(token) {
      if (typeof token !== "string" || !token || held !== null || !canStart()) return false;
      if (!hasConsent()) { requestConsent(); return false; }
      held = token;
      const result = start();
      if (!result?.ok) held = null;
      return !!result?.ok;
    },
    release(token, cancelled = false) {
      if (held === null || token !== held) return false;
      held = null;
      if (cancelled || !["listening", "stopping"].includes(getPhase())) cancel();
      else stop();
      return true;
    },
    clear() { held = null; },
    current() { return held; }
  };
}

export function getIntakeCorrectionConflicts(draft, facts, state = null, sourceBindings = null) {
  const corrected = facts.filter((fact) => fact.verification === "user_corrected");
  const conflictFor = (field, fact, resolved = true) => {
    const oldValue = field.split(".").reduce((value, part) => value?.[part], draft) ?? null;
    if (resolved && Object.is(oldValue, fact.value)) return [];
    const scalar = Object.hasOwn(INTAKE_FIELD_LABELS, field) && !INTAKE_ARRAY_FIELDS.has(field);
    const known = fact.availability === "known", unknown = fact.availability === "unknown" && fact.value === null;
    const validValue = unknown || known && (INTAKE_COUNT_FIELDS.has(field) ?
      Number.isSafeInteger(fact.value) && fact.value >= 0 : typeof fact.value === "string" && !!fact.value.trim() &&
      (!["metrics.windowStart", "metrics.windowEnd"].includes(field) || validDate(fact.value)));
    return [{ field, factId: fact.id, oldValue, currentValue: fact.value, canRecover: resolved && scalar && validValue }];
  };
  // Legacy callers can still inspect intake-owned facts without a session.
  if (!state) return corrected.filter((fact) => fact.intakeField)
    .flatMap((fact) => conflictFor(fact.intakeField, fact));
  const current = { ...state, input: { ...state.input, facts } };
  const savedBindings = [state.input?.intake?.sourceBindings || [], ...(state.history || [])
    .filter((entry) => entry.type === "intake_revision" && entry.intake)
    .map((entry) => entry.intake.sourceBindings || [])];
  const fields = new Set([
    ...Object.keys(INTAKE_FIELD_LABELS).filter((field) => !INTAKE_ARRAY_FIELDS.has(field)),
    ...facts.map((fact) => fact.intakeField || (fact.source?.locator?.type === "intake" ? fact.source.locator.field : null)),
    ...(sourceBindings || []).map((binding) => binding.field),
    ...savedBindings.flatMap((bindings) => bindings.map((binding) => binding.field))
  ].filter((field) => typeof field === "string" && field));
  return [...fields].flatMap((field) => {
    // Only an explicit file binding overrides current/history lookup. An empty
    // local binding list must not hide the original file after a manual review.
    const explicit = sourceBindings?.some((binding) => binding.field === field &&
      ["txt", "csv", "json"].includes(binding.source)) ? sourceBindings : null;
    const fact = findIntakeFieldFact(current, field, explicit);
    if (fact) return fact.verification === "user_corrected" ? conflictFor(field, fact) : [];
    // Keep ambiguous associations visible but unusable. Probe with the shared
    // resolver, never infer a field from the metric name or an array index.
    return corrected.filter((candidate) => findIntakeFieldFact({ ...current,
      input: { ...current.input, facts: [candidate] } }, field, explicit)?.id === candidate.id)
      .flatMap((candidate) => conflictFor(field, candidate, false));
  });
}

export function isIntakeCorrectionSnapshotCurrent(state, snapshot) {
  if (!state?.sessionId || !snapshot || snapshot.sessionId !== state.sessionId ||
    snapshot.roundId !== state.round?.id || snapshot.inputVersion !== state.round?.inputVersion) return false;
  const current = (state.input?.facts || []).filter((fact) => fact.id === snapshot.factId);
  return current.length === 1 && typeof snapshot.factSnapshot === "string" &&
    JSON.stringify(current[0]) === snapshot.factSnapshot;
}

export function editIntakeField(draft, sourceBindings, field, rawText, baselineFact = null, state = null) {
  if (!Object.hasOwn(INTAKE_FIELD_LABELS, field)) throw new Error("请选择可修改的经营字段。");
  if (baselineFact) {
    const facts = state?.input?.facts || [baselineFact];
    const current = !state || facts.some((fact) => fact.id === baselineFact.id &&
      JSON.stringify(fact) === JSON.stringify(baselineFact));
    if (!current || !getIntakeCorrectionConflicts(draft, facts, state, sourceBindings)
      .some((entry) => entry.field === field && entry.factId === baselineFact.id && entry.canRecover)) {
      throw new Error("这项历史更正已变化，或类型、数组及来源对应不明确，请重新核对；没有猜测编辑起点。");
    }
  }
  const raw = rawText.trim();
  let value = raw || null;
  if (INTAKE_ARRAY_FIELDS.has(field)) value = raw ? raw.split(/\r\n|\r|\n/).map((line) => line.trim()).filter(Boolean) : [];
  else if (INTAKE_COUNT_FIELDS.has(field) && raw) {
    if (!/^\d+$/.test(raw) || !Number.isSafeInteger(Number(raw))) throw new Error("次数须为非负整数；不知道请留空，不要填 0。");
    value = Number(raw);
  } else if (["metrics.windowStart", "metrics.windowEnd"].includes(field) && raw && !validDate(raw)) {
    throw new Error("请用真实的 YYYY-MM-DD 日期；不知道可以留空。");
  }
  const next = structuredClone(draft), storedBefore = intakeFieldValue(draft, field);
  const before = baselineFact ? baselineFact.value : storedBefore;
  if (JSON.stringify(storedBefore) === JSON.stringify(value) && Object.is(before, storedBefore)) {
    return { draft: next, sourceBindings: structuredClone(sourceBindings), changed: false };
  }
  const changed = [];
  if (Array.isArray(value)) {
    for (let index = 0; index < Math.max(before?.length || 0, value.length); index += 1) {
      const oldValue = before?.[index] ?? null, after = value[index] ?? null;
      if (oldValue !== after) changed.push({ field: field + "." + index, before: oldValue, after });
    }
    next[field] = value;
  } else {
    if (!Object.is(before, value)) changed.push({ field, before, after: value });
    if (field.startsWith("metrics.")) next.metrics[field.slice(8)] = value;
    else next[field] = value;
  }
  const changedFields = new Set(changed.map((entry) => entry.field));
  if (baselineFact) changedFields.add(field);
  next.sources = [...new Set([...next.sources, "manual"])];
  next.userCorrections.push(...changed);
  next.evidenceLedger = next.evidenceLedger.filter((entry) => !changedFields.has(entry.field));
  const ledgerChanges = changed.length ? changed : baselineFact ? [{ field, after: value }] : [];
  for (const entry of ledgerChanges) {
    // Deleted array entries survive in correction history, not as live ledger paths.
    if (Array.isArray(value) && Number(entry.field.split(".").at(-1)) >= value.length) continue;
    const unknown = entry.after === null || field === "unknowns";
    next.evidenceLedger.push({ field: entry.field, value: unknown ? null : entry.after,
      status: unknown ? "unknown" : field.endsWith("Hypothesis") ? "owner_hypothesis" : "confirmed_fact",
      source: "manual" });
  }
  // A newly chosen file can differ from the currently saved association. Keep
  // its explicit locator for identity; the revised evidence/source stays manual.
  const keepFileAssociation = state && baselineFact && !baselineFact.intakeField &&
    findIntakeFieldFact(state, field)?.id !== baselineFact.id;
  return { draft: next, sourceBindings: structuredClone(sourceBindings.filter((entry) =>
    !changedFields.has(entry.field) || keepFileAssociation && entry.field === field &&
      ["txt", "csv", "json"].includes(entry.source))), changed: true };
}

export function getNextIntakeQuestion(draft, clarification) {
  if (!draft || !Array.isArray(clarification?.questions) || clarification.activeQuestionId !== null ||
    !(clarification.remaining > 0)) return null;
  const counts = [...INTAKE_COUNT_FIELDS].some((field) => hasIntakeValue(intakeFieldValue(draft, field)));
  const candidates = [
    [!hasIntakeValue(draft.productName), "你这次最想解决的是哪一件具体商品？"],
    [!hasIntakeValue(draft.desiredAction), "这次最想让顾客多做哪一步：咨询、点商品，还是购买？"],
    [!counts || !draft.metrics?.windowStart || !draft.metrics?.windowEnd,
      "有没有一段能核对的时间和成交数据？说你手头有的即可，不知道也可以。"],
    [!draft.constraints?.length, "这轮有哪些明确不能做的事，或者时间、预算限制？"]
  ];
  const candidate = candidates.find(([needed, questionText]) => needed &&
    !clarification.questions.some((question) => question.questionText === questionText));
  return candidate ? { questionText: candidate[1], sourceFactIds: [] } : null;
}

export function isSubmitKey(event, composing, lastCompositionAt, now) {
  return event.key === "Enter" && !event.shiftKey && !event.isComposing &&
    event.keyCode !== 229 && !composing && now - lastCompositionAt > 100;
}

export function isVoiceHoldKey(event, composing = false, lastCompositionAt = -Infinity, now = Infinity) {
  return ["Enter", " "].includes(event.key) && !event.isComposing && event.keyCode !== 229 &&
    !composing && !event.repeat && !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey &&
    now - lastCompositionAt > 100;
}

export function formatVoiceTime(milliseconds) {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  return String(Math.floor(seconds / 60)).padStart(2, "0") + ":" + String(seconds % 60).padStart(2, "0");
}

// SpeechRecognition is a browser service, not a local/offline ASR promise.
// stop keeps result listeners until end; abort invalidates results first.
// https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition
export function createVoiceSession({
  Recognition = globalThis.SpeechRecognition ?? globalThis.webkitSpeechRecognition,
  now = () => globalThis.performance.now(),
  later = (fn, ms) => globalThis.setTimeout(fn, ms),
  clearLater = (id) => globalThis.clearTimeout(id),
  documentTarget = globalThis.document,
  pageTarget = globalThis.window,
  getScope = () => null,
  isScopeCurrent = () => true,
  onChange = () => {},
  startTimeoutMs = 20000,
  endTimeoutMs = 8000
} = {}) {
  const supported = typeof Recognition === "function";
  const events = ["start", "audiostart", "audioend", "result", "nomatch", "error", "end"];
  const drafts = [];
  let active = null, last = null, serial = 0, disposed = false;
  const visible = () => !documentTarget || documentTarget.visibilityState !== "hidden";
  const live = (run) => active === run;
  const elapsed = (run) => run.elapsedMs + (run.audioSince === null ? 0 : Math.max(0, now() - run.audioSince));
  const copy = (run) => run && ({
    id: run.id, phase: run.phase, issue: run.issue,
    finalText: run.finalText, interimText: run.interimText,
    hasUnfinalizedText: !!run.interimText, captureMs: elapsed(run),
    audioActive: run.audioActive, endObserved: run.endObserved, scope: structuredClone(run.scope)
  });
  const snapshot = () => ({
    supported, disposed, active: !!active, canStart: supported && !disposed && !active && visible(),
    current: copy(last)
  });
  function publish() {
    if (!disposed) {
      try { onChange(snapshot()); } catch { /* UI errors must not interrupt resource cleanup. */ }
    }
  }
  function clearTimer(run, key) {
    if (run[key] !== null) { clearLater(run[key]); run[key] = null; }
  }
  function freezeClock(run) {
    if (run.audioSince !== null) { run.elapsedMs = elapsed(run); run.audioSince = null; }
  }
  function detach(run) {
    for (const key of ["startTimer", "endTimer", "tickTimer"]) clearTimer(run, key);
    for (const name of events) run.recognition["on" + name] = null;
  }
  function nativeAbort(run) {
    try { run.recognition.abort(); } catch { /* A missing end never unlocks a second native session. */ }
  }
  function armEndTimeout(run) {
    if (run.endTimer !== null) return;
    run.endTimer = later(() => {
      run.endTimer = null;
      if (!live(run)) return;
      run.acceptResults = false;
      run.phase = "fallback";
      run.issue = "end-timeout";
      freezeClock(run);
      clearTimer(run, "tickTimer");
      nativeAbort(run);
      publish();
    }, endTimeoutMs);
  }
  function abortRun(run, reason) {
    if (!live(run)) return;
    run.acceptResults = false;
    run.issue ||= reason;
    run.phase = "fallback";
    clearTimer(run, "startTimer");
    armEndTimeout(run);
    nativeAbort(run);
    publish();
  }
  function accepts(run) {
    if (!live(run) || disposed) return false;
    if (!isScopeCurrent(run.scope)) { abortRun(run, "scope-changed"); return false; }
    return run.acceptResults;
  }
  function tick(run) {
    if (!live(run) || disposed) return;
    if (run.acceptResults && !isScopeCurrent(run.scope)) abortRun(run, "scope-changed");
    publish();
    if (live(run) && run.issue !== "end-timeout") run.tickTimer = later(() => tick(run), 200);
  }
  function finish(run) {
    if (!live(run)) return;
    freezeClock(run);
    run.endObserved = true;
    run.audioActive = false;
    run.acceptResults = false;
    if (!run.issue && !run.finalText && !run.interimText) run.issue = run.noMatch ? "no-match" : "no-result";
    run.phase = run.issue ? "fallback" : "review";
    detach(run);
    active = null;
    publish();
  }
  function nativeStop(run) {
    try { run.recognition.stop(); }
    catch (error) {
      // If permission/start is pending, keep stop intent for the later native start.
      if (error?.name !== "InvalidStateError") abortRun(run, "stop-failed");
    }
  }
  function start({ consented = false } = {}) {
    if (disposed) return { ok: false, code: "disposed" };
    if (!supported) return { ok: false, code: "unsupported" };
    if (active) return { ok: false, code: "busy" };
    if (!visible()) return { ok: false, code: "page-hidden" };
    if (!consented) return { ok: false, code: "consent-required" };
    let recognition, scope;
    try {
      recognition = new Recognition();
      recognition.lang = "zh-CN";
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;
      scope = structuredClone(getScope());
    } catch { return { ok: false, code: "setup-failed" }; }
    const run = {
      id: ++serial, recognition, scope, phase: "starting", issue: null,
      finalText: "", interimText: "", finalByIndex: new Map(),
      acceptResults: true, stopRequested: false, audioActive: false, audioSince: null,
      elapsedMs: 0, noMatch: false, endObserved: false,
      startTimer: null, endTimer: null, tickTimer: null
    };
    active = last = run;
    drafts.push(run);
    recognition.onstart = () => {
      if (!live(run)) return;
      if (!accepts(run)) nativeAbort(run);
      else if (run.stopRequested) nativeStop(run);
      publish();
    };
    recognition.onaudiostart = () => {
      if (!live(run)) return;
      run.audioActive = true;
      if (run.audioSince === null) run.audioSince = now();
      if (!accepts(run)) { nativeAbort(run); return; }
      clearTimer(run, "startTimer");
      if (run.stopRequested) nativeStop(run);
      else run.phase = "listening";
      publish();
    };
    recognition.onaudioend = () => {
      if (!live(run)) return;
      freezeClock(run);
      run.audioActive = false;
      if (run.acceptResults) { run.phase = "stopping"; armEndTimeout(run); }
      publish();
    };
    recognition.onresult = (event) => {
      if (!accepts(run)) return;
      const interim = [];
      for (let index = 0; index < event.results.length; index += 1) {
        const result = event.results[index], text = result?.[0]?.transcript;
        if (typeof text !== "string") continue;
        if (result.isFinal) {
          if (!run.finalByIndex.has(index)) run.finalByIndex.set(index, text);
        } else if (!run.finalByIndex.has(index)) interim.push(text);
      }
      run.finalText = [...run.finalByIndex.entries()].sort(([a], [b]) => a - b).map(([, text]) => text).join("");
      run.interimText = interim.join("");
      publish();
    };
    recognition.onnomatch = () => { if (accepts(run)) { run.noMatch = true; publish(); } };
    recognition.onerror = (event) => { if (accepts(run)) abortRun(run, event.error || "recognition-error"); };
    recognition.onend = () => finish(run);
    run.startTimer = later(() => { if (live(run)) abortRun(run, "start-timeout"); }, startTimeoutMs);
    run.tickTimer = later(() => tick(run), 200);
    try {
      recognition.start();
      publish();
      return { ok: true, id: run.id };
    } catch {
      abortRun(run, "start-failed");
      return { ok: false, code: "start-failed" };
    }
  }
  function stop() {
    if (!active || !active.acceptResults) return false;
    const run = active;
    if (run.stopRequested) return true;
    run.stopRequested = true;
    run.phase = "stopping";
    clearTimer(run, "startTimer");
    armEndTimeout(run);
    nativeStop(run);
    publish();
    return true;
  }
  function cancel(reason = "cancelled") {
    if (!active) return false;
    abortRun(active, reason);
    return true;
  }
  function checkScope() {
    if (active && !isScopeCurrent(active.scope)) abortRun(active, "scope-changed");
  }
  const onHidden = () => { if (!visible()) cancel("page-hidden"); };
  const onPageHide = () => cancel("page-hidden");
  documentTarget?.addEventListener("visibilitychange", onHidden);
  pageTarget?.addEventListener("pagehide", onPageHide);
  function destroy() {
    if (disposed) return;
    disposed = true;
    documentTarget?.removeEventListener("visibilitychange", onHidden);
    pageTarget?.removeEventListener("pagehide", onPageHide);
    if (active) {
      const run = active;
      run.acceptResults = false;
      freezeClock(run);
      nativeAbort(run);
      detach(run);
      active = null;
    }
  }
  return { start, stop, cancel, checkScope, destroy, snapshot, getDrafts: () => drafts.map(copy) };
}

async function validateFile(file, replacing = false) {
  const extension = fileExtension(file.name);
  if (Object.hasOwn(IMAGE_TYPES, extension)) {
    throw errorWithCode("截图接收与来源标注待共享能力接线，本次未保存新图；已有原件保留。当前可用 CSV、TXT、JSON 或文字。", "unsupported_type");
  }
  if (["xlsx", "xls"].includes(extension)) {
    throw errorWithCode("Excel 解析待共享能力接线，本次未保存该表格；可先导出 UTF-8 CSV。原有材料未替换。", "unsupported_type");
  }
  if (!["txt", "csv", "json"].includes(extension)) {
    throw errorWithCode("本轮只支持 TXT、CSV、JSON，或直接粘贴文字。", "unsupported_type");
  }
  if (file.size > 5 * 1024 * 1024) throw errorWithCode("单份材料不能超过 5 MiB。", "file_limit");
  const generic = ["", "application/octet-stream"];
  const accepted = extension === "csv" ? ["text/csv", "text/plain", "application/vnd.ms-excel"] :
    extension === "json" ? ["application/json", "text/plain"] : ["text/plain"];
  if (!generic.includes(file.type) && !accepted.includes(file.type)) {
    throw errorWithCode("文件类型与扩展名不一致，请选择原始文件。", "unsupported_type");
  }
  if (replacing) {
    try {
      const text = new TextDecoder("utf-8", { fatal: true }).decode(await file.arrayBuffer());
      if (text.includes("\0")) throw new Error("binary");
    } catch { throw errorWithCode("新文件无法按 UTF-8 解码，原有材料未替换。", "unsupported_type"); }
  }
}

if (typeof document !== "undefined" && document.body?.dataset.page === "intake") {
  titleMotionController = enhanceFoldTitle(document.getElementById("intake-title"));
  startIntakePage();
}

function startIntakePage() {
  const byId = (id) => document.getElementById(id);
  const ui = {
    form: byId("intake-form"), description: byId("description"), organize: byId("organize-button"),
    manual: byId("manual-entry"), upload: byId("upload-section"),
    imageDrop: byId("image-drop-zone"), imageMaterials: byId("image-materials-list"),
    chooseLegacy: byId("choose-legacy"), legacyFiles: byId("legacy-file-input"),
    descriptionCount: byId("description-count"), descriptionLimitNote: byId("description-limit-note"),
    demoNotice: byId("demo-notice"), fullUnderstanding: byId("full-understanding-grid"),
    voiceStart: byId("voice-start"), voiceStartLabel: byId("voice-start-label"), voiceStop: byId("voice-stop"),
    voiceStage: byId("voice-stage"), voiceTimer: byId("voice-timer"), voiceLive: byId("voice-live"),
    voiceText: byId("voice-live-text"), voiceConsent: byId("voice-consent"),
    voiceConsentStart: byId("voice-consent-start"), voiceConsentCancel: byId("voice-consent-cancel"),
    drop: byId("drop-zone"), choose: byId("choose-files"), files: byId("file-input"),
    replacement: byId("replacement-input"), materials: byId("materials-list"),
    status: byId("operation-status"), errorPanel: byId("error-panel"), error: byId("page-error"),
    retry: byId("retry-button"), stopRetry: byId("stop-retry-button"),
    organization: byId("organization"), focus: byId("focus-input"),
    facts: byId("facts-list"), constraints: byId("constraints-list"), unknowns: byId("unknowns-list"),
    back: byId("back-to-input"), confirm: byId("confirm-button"), preview: byId("preview-dialog"),
    previewTitle: byId("preview-title"), previewBody: byId("preview-body"), closePreview: byId("close-preview"),
    correction: byId("correction-dialog"), correctionForm: byId("correction-form"),
    correctionTitle: byId("correction-title"), availability: byId("correction-availability"),
    value: byId("correction-value"), unit: byId("correction-unit"), reason: byId("correction-reason"),
    correctionError: byId("correction-error"), cancelCorrection: byId("cancel-correction"),
    understanding: byId("understanding-grid"), understandingNote: byId("understanding-note"),
    editUnderstanding: byId("edit-understanding"), contextDialog: byId("context-dialog"),
    contextForm: byId("context-form"), contextField: byId("context-field"), contextValue: byId("context-value"),
    contextFieldNote: byId("context-field-note"), contextError: byId("context-error"),
    contextSave: byId("context-save"), contextCancel: byId("context-cancel"),
    questionSection: byId("clarification-section"), questionProgress: byId("clarification-progress"),
    questionText: byId("clarification-question"), questionForm: byId("clarification-form"),
    questionAnswer: byId("clarification-answer"), questionUnknown: byId("clarification-unknown"),
    questionSkip: byId("clarification-skip"), questionSubmit: byId("clarification-submit"),
    questionDiscard: byId("clarification-discard-draft"),
    questionBack: byId("clarification-back"), questionHistory: byId("question-history"),
    returnReview: byId("return-to-review"), reviewCautions: byId("review-cautions"),
    reviewCautionsList: byId("review-cautions-list"), reviewTranscript: byId("review-transcript"),
    reviewDescription: byId("review-description")
  };
  let api = null, state = null, busy = false, composing = false, lastCompositionAt = -Infinity;
  let descriptionDirty = false, focusDirty = false, organizedVersion = null, organizationVisible = false;
  let pending = null, uploadQueue = [], replaceTarget = null, correctionTarget = null;
  let previewUrl = null, previewMaterialId = null, previewMaterialVersion = null, previewRequest = 0;
  let previewTrigger = null, correctionTrigger = null, correctionContext = null, correctionDirty = false;
  let allowNavigation = false, unsubscribe = null, unregisterGuard = null, connectInProgress = false;
  let pendingRead = false, visibleFacts = 40;
  let draftContext = null;
  let voiceSession = null, voiceSnapshot = null, voiceBaseText = "", intakeStage = "idle";
  let voiceConsentGranted = false, voiceHold = null;
  let intakeApi = null, contextDraft = null, contextEdit = null, contextDirty = false, questionDirty = false;
  let contextBindings = [], contextOrigin = null, extractionController = null, reviewMessage = "";
  let readyToAnalyze = false, questionContext = null, renderedQuestionId = null;
  let lastIntakeAttempt = null;
  let questionComposing = false, lastQuestionCompositionAt = -Infinity;
  const voiceOriginals = [], appliedVoiceRuns = new Set(), inputSources = new Set();
  const ownedUnknowns = new Map();
  const retryable = new Set(["write_failed", "read_failed", "storage_unavailable", "conflict"]);
  const element = (tag, text, className) => {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
  };
  const button = (label, action, className = "source-button") => {
    const node = element("button", label, className);
    node.type = "button";
    node.dataset.action = action;
    return node;
  };
  const status = (message) => { ui.status.textContent = message; };
  const factLabel = (fact) => INTAKE_FIELD_LABELS[fact.intakeField] ||
    INTAKE_FIELD_LABELS[fact.intakeField?.split(".")[0]] || labelFor(fact.key);
  const showError = (message) => {
    ui.error.textContent = message + (pending ? " 输入暂时只读，请先重试或停止重试。" : "");
    ui.errorPanel.hidden = false;
    ui.retry.hidden = !(pending || pendingRead || !api || !state);
    ui.stopRetry.hidden = !pending && uploadQueue.length === 0;
  };
  const clearError = () => {
    if (!pending && !pendingRead) {
      ui.errorPanel.hidden = true;
      ui.error.textContent = "";
      ui.retry.hidden = true;
      ui.stopRetry.hidden = true;
    }
  };
  const voiceEditingLocked = () => !!voiceSnapshot?.active && voiceSnapshot.current?.phase !== "fallback";
  const hasUnsavedVoice = () => voiceOriginals.length > 0;
  const dirty = () => descriptionDirty || focusDirty || correctionDirty || contextDirty || contextEdit?.dirty || questionDirty ||
    hasUnsavedVoice() || !!voiceSnapshot?.active || pending !== null || uploadQueue.length > 0;
  const inputReady = () => !!ui.description.value.trim() || !!state?.input.materials.length || uploadQueue.length > 0;
  const context = () => ({ sessionId: state.sessionId, roundId: state.round.id, inputVersion: state.round.inputVersion });
  const sameContext = (origin) => origin && state &&
    origin.sessionId === state.sessionId && origin.roundId === state.round.id;

  function updateControls() {
    const blocked = busy || voiceEditingLocked() || connectInProgress || !state || !!pending || pendingRead;
    const blockedForSubmission = blocked || !!voiceSnapshot?.active;
    ui.organize.disabled = blockedForSubmission || !inputReady();
    ui.choose.disabled = blocked;
    ui.chooseLegacy.disabled = blocked;
    ui.description.readOnly = busy || voiceEditingLocked() || connectInProgress || !!pending;
    ui.focus.readOnly = busy || voiceEditingLocked() || connectInProgress || !!pending;
    ui.confirm.disabled = blockedForSubmission || correctionDirty || contextEdit?.dirty || (questionDirty && !intakeApi) || uploadQueue.length > 0 ||
      (intakeApi ? !contextDraft || !sameContext(contextOrigin) || contextOrigin.inputVersion !== state?.round.inputVersion :
        descriptionDirty || contextDirty || hasUnsavedVoice() || organizedVersion !== state?.round.inputVersion);
    ui.form.setAttribute("aria-busy", String(busy));
    ui.drop.setAttribute("aria-busy", String(busy));
    ui.drop.setAttribute("aria-disabled", String(blocked));
    ui.retry.disabled = busy || connectInProgress;
    ui.stopRetry.disabled = busy || connectInProgress;
    ui.availability.disabled = blocked;
    ui.value.disabled = blocked || ui.availability.value !== "known";
    ui.unit.readOnly = busy || !!pending;
    ui.reason.readOnly = busy || !!pending;
    ui.cancelCorrection.disabled = busy;
    ui.voiceStart.disabled = busy || connectInProgress || !state || !!pending || pendingRead ||
      (!voiceSnapshot?.active && !voiceSnapshot?.canStart);
    ui.voiceConsentStart.disabled = blocked || !voiceSnapshot?.canStart;
    ui.voiceStop.hidden = !voiceSnapshot?.active;
    ui.voiceStop.disabled = false;
    ui.voiceStart.hidden = false;
    ui.voiceStart.setAttribute("aria-pressed", String(!!voiceSnapshot?.active));
    ui.voiceStartLabel.textContent = !voiceSnapshot?.supported ? "当前浏览器不支持语音" :
      voiceSnapshot?.active ? (voiceSnapshot.current?.phase === "stopping" ? "正在结束" : "松开结束") : "按住说话";
    ui.returnReview.disabled = blocked || !contextDraft;
    updateDescriptionCount();
    ui.editUnderstanding.disabled = blocked || !intakeApi || !contextDraft;
    ui.contextSave.disabled = blocked || !!contextEdit?.recoveryBlocked;
    ui.contextField.disabled = blocked;
    ui.contextValue.readOnly = blocked;
    ui.questionAnswer.disabled = blocked;
    for (const node of [ui.questionUnknown, ui.questionSkip, ui.questionSubmit]) node.disabled = blockedForSubmission;
    ui.questionBack.disabled = busy || !!pending;
    ui.questionDiscard.disabled = blocked;
    ui.questionDiscard.hidden = !questionDirty || contextMatches(questionContext);
    ui.confirm.textContent = state?.round.clarification.activeQuestionId ? "继续这次补问" : "确认，开始分析";
    for (const list of [ui.materials, ui.imageMaterials]) {
      for (const node of list.querySelectorAll("button[data-mutates]")) node.disabled = blocked;
    }
    for (const node of ui.facts.querySelectorAll("button[data-mutates]")) node.disabled = blocked;
    for (const node of ui.correctionForm.querySelectorAll("button[type=submit]")) node.disabled = blocked;
  }

  function applyState(next) {
    const previous = state;
    if (previous && next.sessionId === previous.sessionId && next.revision < previous.revision) return;
    state = next;
    if (!descriptionDirty && !voiceEditingLocked()) ui.description.value = state.input.description;
    if (!focusDirty) ui.focus.value = state.input.focus ?? "";
    if (previous && (previous.sessionId !== state.sessionId || previous.round.id !== state.round.id ||
      previous.round.inputVersion !== state.round.inputVersion)) organizedVersion = null;
    if (previous && (previous.sessionId !== state.sessionId || previous.round.id !== state.round.id ||
      previous.round.inputVersion !== state.round.inputVersion)) {
      extractionController?.abort();
      readyToAnalyze = false;
    }
    if (previous && (previous.sessionId !== state.sessionId || previous.round.id !== state.round.id)) {
      ownedUnknowns.clear();
      if (dirty()) showError("本机已切换到另一轮，当前未保存的文字仍保留。继续前请核对，旧操作不会自动套用。");
    }
    if (previewMaterialId && !state.input.materials.some((item) =>
      item.id === previewMaterialId && item.version === previewMaterialVersion)) {
      if (ui.preview.open) ui.preview.close();
      else closePreview();
    }
    voiceSession?.checkScope();
    if (intakeApi && !dirty()) {
      if (state.input.intake) {
        contextDraft = structuredClone(state.input.intake.draft);
        contextBindings = structuredClone(state.input.intake.sourceBindings);
        contextOrigin = context();
      } else {
        contextDraft = null; contextBindings = []; contextOrigin = null; contextEdit = null;
        draftContext = null; lastIntakeAttempt = null; inputSources.clear();
        correctionTarget = null; correctionContext = null; replaceTarget = null;
        questionContext = null; renderedQuestionId = null; ui.questionAnswer.value = "";
        reviewMessage = ""; readyToAnalyze = false; organizedVersion = null; organizationVisible = false;
        if (ui.contextDialog.open) ui.contextDialog.close();
        if (ui.correction.open) ui.correction.close();
        if (ui.voiceConsent.open) ui.voiceConsent.close();
        setIntakeStage("idle");
      }
    }
    if (state.input.materials.length) showUpload(false);
    if (ui.description.value.trim()) showManual(false);
    render();
  }

  function showManual(focus = true) {
    if (focus && intakeApi && ["confirming", "questioning", "ready"].includes(intakeStage)) {
      setIntakeStage("idle"); render();
    }
    ui.manual.hidden = false;

    if (focus) {
      ui.description.scrollIntoView({ behavior: "instant", block: "center" });
      ui.description.focus({ preventScroll: true });
    }
  }

  function showUpload(focus = true) {
    if (focus && intakeApi && ["confirming", "questioning", "ready"].includes(intakeStage)) {
      setIntakeStage("idle"); render();
    }
    ui.upload.hidden = false;

    if (focus) {
      ui.upload.scrollIntoView({ behavior: "instant", block: "center" });
      ui.choose.focus({ preventScroll: true });
    }
  }

  function setIntakeStage(stage, message) {
    intakeStage = stage;
    document.body.dataset.intakeStage = stage;
    if (message && ui.voiceStage.textContent !== message) ui.voiceStage.textContent = message;
    ui.questionSection.hidden = stage !== "questioning";
  }

  function showReview(stage = "confirming", focus = true) {
    organizationVisible = true;
    setIntakeStage(stage);
    render();
    if (focus) {
      ui.organization.scrollIntoView({ behavior: "instant", block: "start" });
      ui.organization.focus({ preventScroll: true });
    }
  }

  function showQuestion(focus = true) {
    setIntakeStage("questioning");
    renderQuestions();
    updateControls();
    if (focus) {
      ui.questionSection.scrollIntoView({ behavior: "instant", block: "start" });
      ui.questionSection.focus({ preventScroll: true });
    }
  }

  function voiceIssueMessage(issue) {
    const messages = {
      "not-allowed": "还没有拿到麦克风权限，可以改用文字。",
      "service-not-allowed": "浏览器未允许这项识别服务，可以改用文字。",
      "audio-capture": "无法使用麦克风，请检查设备或改用文字。",
      "no-speech": "识别服务没有取得可用语音，可以直接输入或粘贴文字。",
      "network": "语音服务连接中断，已返回的文字仍保留。",
      "language-not-supported": "当前服务不支持中文转写，请改用文字。",
      "no-match": "本次没有获得明确的识别结果，可以改用文字。",
      "no-result": "本次未获得转写文字，可以重新开始或直接输入。",
      "start-timeout": "尚未开始采集音频，已请求取消；可以改用文字。",
      "end-timeout": "尚未收到识别服务结束确认，已再次请求停止。文字可继续编辑，暂不启动第二个语音会话。",
      "scope-changed": "本轮资料已经变化，旧语音已请求停止，返回的文字保留待核对。",
      "page-hidden": "页面已离开前台，已请求停止语音，返回的文字仍保留。",
      "cancelled": "已请求取消识别，返回的文字仍保留。",
      "start-failed": "语音服务未能启动，可以改用文字。",
      "stop-failed": "未能确认识别停止，已请求取消；可以改用文字。"
    };
    return messages[issue] || "语音识别未完成，已返回的文字仍保留，可以改用文字。";
  }

  function onVoiceChange(snapshot) {
    const focusWasOnVoice = document.activeElement === ui.voiceStop;
    voiceSnapshot = snapshot;
    if (!snapshot.active) voiceHold?.clear();
    const run = snapshot.current;
    if (!run) { updateControls(); return; }
    ui.voiceTimer.hidden = run.captureMs === 0 && !run.audioActive;
    ui.voiceTimer.textContent = formatVoiceTime(run.captureMs);
    ui.voiceTimer.dateTime = "PT" + Math.floor(run.captureMs / 1000) + "S";
    const returnedText = run.finalText + run.interimText;
    ui.voiceLive.hidden = !returnedText;
    if (ui.voiceText.textContent !== returnedText) ui.voiceText.textContent = returnedText;
    ui.voiceLive.querySelector(".voice-live-label").textContent = run.endObserved || run.phase === "fallback" ?
      "本次识别原文，修改后的文字在下方" : "正在听取，文字可能继续修正";
    ui.voiceStop.textContent = run.phase === "starting" ? "取消开始" :
      run.phase === "stopping" ? "已请求停止" : run.phase === "fallback" ? "再次请求停止" : "停止语音";
    if (run.phase === "starting") setIntakeStage("listening", "正在等待浏览器开始采集，尚未开始听取。");
    if (run.phase === "listening") setIntakeStage("listening", "正在听取，松开结束，也可以点“停止语音”。");
    if (run.phase === "stopping") setIntakeStage("transcribing", "正在等待这段话的最终转写。");
    if ((run.endObserved || run.phase === "fallback") && !appliedVoiceRuns.has(run.id)) {
      appliedVoiceRuns.add(run.id);
      if (returnedText) {
        voiceOriginals.push({ text: returnedText, finalText: run.finalText, interimText: run.interimText });
        ui.description.value = voiceBaseText ? voiceBaseText + "\n" + returnedText : returnedText;
        descriptionDirty = ui.description.value !== state?.input.description;
        draftContext = run.scope;
        inputSources.add("voice");
        organizedVersion = null;
      }
      showManual(focusWasOnVoice);
      setIntakeStage("idle", run.issue ? voiceIssueMessage(run.issue) :
        "识别文字已保留。你可以先修改，再整理核对。");
      if (run.interimText) status("有尚未定稿的识别文字，请核对后再使用。");
    } else if (run.phase === "fallback") setIntakeStage("idle", voiceIssueMessage(run.issue));
    if (snapshot.active && run.phase === "fallback") {
      setIntakeStage("idle", voiceIssueMessage(run.issue) +
        " 仍在等待识别服务确认结束；可先编辑文字，结束确认前暂不能整理或提交。");
    }
    updateControls();

  }

  function askVoiceConsent() {
    if (busy || pending || pendingRead || !state || !voiceSnapshot?.canStart) return;
    if (correctionDirty || contextEdit?.dirty || questionDirty) {
      showError("请先保存或取消当前编辑，再开始一段新语音。");
      return;
    }
    if (!ui.voiceConsent.open) ui.voiceConsent.showModal();
  }


  function startVoiceCapture() {
    if (busy || pending || pendingRead || !state || !voiceConsentGranted || !voiceSnapshot?.canStart) return { ok: false };
    if (correctionDirty || contextEdit?.dirty || questionDirty) {
      showError("请先保存或取消当前编辑，再开始一段新语音。");
      return { ok: false };
    }
    voiceBaseText = ui.description.value;
    const result = voiceSession.start({ consented: true });
    if (!result.ok) {
      showManual();
      setIntakeStage("idle", voiceIssueMessage(result.code));
    }
    return result;
  }

  function grantVoiceConsent() {
    if (busy || pending || pendingRead || !state || !voiceSnapshot?.canStart) return;
    voiceConsentGranted = true;
    ui.voiceConsent.close();
    ui.voiceStage.textContent = "已确认处理方式。请按住“按住说话”，松开结束；键盘可按住空格或回车。";
    ui.voiceStart.focus();
  }

  function updateDescriptionCount() {
    const length = Array.from(ui.description.value).length;
    ui.descriptionCount.textContent = length + "/1000";
    ui.descriptionCount.parentElement.dataset.overLimit = String(length > 1000);
    ui.descriptionLimitNote.hidden = length <= 1000;
  }

  function renderUnderstanding() {
    ui.understanding.replaceChildren();
    ui.fullUnderstanding.replaceChildren();
    ui.reviewCautionsList.replaceChildren();
    ui.reviewCautions.hidden = true;
    ui.reviewTranscript.textContent = contextDraft?.transcript || "本轮没有语音识别原文。";
    ui.reviewDescription.textContent = ui.description.value || "本轮没有补充文字。";
    if (!contextDraft) return;
    const preflight = intakeApi.mapConfirmedIntakeToAnalysisInput(contextDraft, { state, sourceBindings: contextBindings });
    const projection = preflight.ok ? preflight.projection : null;
    const corrections = getIntakeCorrectionConflicts(contextDraft, state.input.facts, state, contextBindings);
    const cautions = [...new Set([
      ...(preflight.ok ? [] : [preflight.message || "来源与当前材料不一致，请更正后再保存。"]),
      ...(projection?.unknowns || state.input.unknowns).filter((item) => ["conflicting", "unparsed"].includes(item.reason))
        .map((item) => item.description)
    ])];
    for (const message of cautions) ui.reviewCautionsList.append(element("p", message));
    ui.reviewCautions.hidden = !cautions.length;
    const sourceNames = { voice: "语音自述", manual: "手动填写", paste: "粘贴文字", txt: "TXT材料", csv: "CSV材料", json: "JSON材料" };
    for (const group of getIntakeSummaryGroups(contextDraft, state, projection, contextBindings)) {
      const card = element("section", undefined, "summary-card");
      card.dataset.summaryGroup = group.id;
      card.append(element("h3", group.title));
      const content = element("div", undefined, "summary-content");
      if (!group.items.length) content.append(element("p", group.empty, "muted"));
      let overflow = null;
      group.items.forEach((item, index) => {
        const row = element("p", item.text, item.conflicting ? "correction-conflict" : undefined);
        if (item.note) row.append(element("span", item.note, "understanding-source"));
        // Keep conflicts visible even when other rows are progressively disclosed.
        if (index < 3 || item.conflicting) content.append(row);
        else {
          if (!overflow) {
            overflow = element("details", undefined, "summary-overflow");
            overflow.append(element("summary", "查看其余内容"));
          }
          overflow.append(row);
        }
      });
      if (overflow) content.append(overflow);
      card.append(content);
      ui.understanding.append(card);
    }

    for (const group of getIntakeReviewGroups(contextDraft, projection)) {
      const card = element("section", undefined, "understanding-card");
      card.append(element("h3", group.title));
      if (!group.items.length) card.append(element("p", "尚未提供", "muted"));
      for (const item of group.items) {
        const value = element("p", item.label + "：" + (item.conflicting ?
          "待核对（当前填写：" + String(item.value) + "）" : String(item.value)));
        if (item.conflicting) value.append(element("span", "来源不一致，按未知保留", "understanding-source"));
        if (item.hypothesis) value.append(element("span", "你的判断", "understanding-source"));
        card.append(value);
      }
      for (const correction of corrections.filter((entry) => group.fields.includes(entry.field) ||
        group.fields.includes(entry.field.split(".")[0]))) {
        const label = INTAKE_FIELD_LABELS[correction.field] || INTAKE_FIELD_LABELS[correction.field.split(".")[0]] || "这项信息";
        card.append(element("p", label + "：旧理解“" + String(correction.oldValue ?? "未知") +
          "”／当前已更正“" + String(correction.currentValue ?? "未知") + "”", "correction-conflict"));
        card.append(element("p", correction.canRecover ? "打开“有信息不对”，核对当前更正后再保存。" :
          "这项的数组、类型或来源对应不明确，保留冲突，暂不自动恢复。", "muted"));
      }
      const sources = [...new Set(group.items.flatMap((item) => item.sources))];
      if (sources.length) card.append(element("p", sources.map((source) => sourceNames[source] || source).join(" · "), "card-provenance"));
      if (group.id === "data" && state.input.facts.some((fact) => fact.source?.kind === "file_extract")) {
        card.append(element("p", "材料中已读取的指标与口径，保留在下方来源区。", "muted"));
      }
      if (group.id === "problem" && !contextDraft.currentProblem && state.input.focus) {
        card.append(element("p", "上次保存的问题：" + state.input.focus));
        card.append(element("p", "这轮范围变了，可以通过“有信息不对”修改当前问题。", "muted"));
      }
      ui.fullUnderstanding.append(card);
    }
    ui.understandingNote.textContent = reviewMessage || "与你的讲述核对；“你的判断”不等于已证实。";
  }

  function renderQuestions() {
    const questions = state.round.clarification.questions || [];
    ui.questionHistory.replaceChildren();
    for (const question of questions) {
      const row = element("article", undefined, "question-history-item");
      row.dataset.questionId = question.questionId;
      row.tabIndex = -1;
      row.append(element("p", question.questionText));
      const answer = question.status === "skipped" ? "已跳过，保留未知" :
        question.status === "asked" ? "尚未回答" :
        question.answer?.availability === "unknown" ? "目前不知道" : question.answer?.rawText || "未提供原话";
      row.append(element("p", answer, "muted"));
      if (question.answer?.availability === "unknown" && question.answer.rawText) {
        row.append(element("p", question.answer.rawText));
      }
      ui.questionHistory.append(row);
    }
    if (!questions.length) ui.questionHistory.append(element("p", "本轮还没有补问记录。", "muted"));
    const active = questions.find((question) => question.questionId === state.round.clarification.activeQuestionId);
    if (active && !questionDirty) {
      if (renderedQuestionId !== active.questionId) ui.questionAnswer.value = "";
      ui.questionText.textContent = active.questionText;
      ui.questionProgress.textContent = "第 " + (questions.indexOf(active) + 1) + " 次补问 · 这一轮最多 " +
        state.round.clarification.limit + " 次，可以不知道或跳过";
      renderedQuestionId = active.questionId;
      questionContext = { ...context(), questionId: active.questionId };
    }
    ui.questionSection.hidden = intakeStage !== "questioning" || (!active && !questionDirty);
  }

  function makeLocalReviewDraft() {
    if (!intakeApi) throw new Error("经营上下文接口尚未就绪，原文仍保留在本页。");
    const previous = state.input.intake;
    const existing = contextDraft && sameContext(contextOrigin) ? contextDraft : previous?.draft;
    const original = previous?.draft.transcript || "";
    // A lost or stale receipt can leave the same local segments dirty after the
    // server-side transaction persisted them. Preserve the dirty marker without
    // appending those exact segment objects to the saved raw transcript twice.
    const included = lastIntakeAttempt && sameContext(lastIntakeAttempt.origin) && lastIntakeAttempt.transcript &&
      (original === lastIntakeAttempt.transcript || original.startsWith(lastIntakeAttempt.transcript + "\n")) ?
      new Set(lastIntakeAttempt.voiceEntries) : new Set();
    const freshVoice = voiceOriginals.filter((entry) => !included.has(entry)).map((entry) => entry.text).join("\n");
    const transcript = [original, freshVoice].filter(Boolean).join("\n");
    const sources = [...new Set([...(existing?.sources || []), ...inputSources,
      ...state.input.materials.map((material) => fileExtension(material.name)).filter((extension) => ["txt", "csv", "json"].includes(extension))])];
    if (!sources.length && ui.description.value.trim()) sources.push("manual");
    return {
      draft: intakeApi.createMerchantIntakeDraft({ ...(existing || {}), transcript, sources }),
      sourceBindings: structuredClone(contextDraft && sameContext(contextOrigin) ? contextBindings : previous?.sourceBindings || [])
    };
  }

  async function prepareUnderstanding() {
    if (descriptionDirty && draftContext && !contextMatches(draftContext) ||
      contextDirty && contextOrigin && !contextMatches(contextOrigin)) {
      if (!window.confirm("资料已经变化。要以当前保留的文字和理解草稿重新核对吗？旧操作不会重放，来源与更正仍须通过校验。")) {
        throw new Error("文字与理解草稿仍保留，未开始新的整理。");
      }
      draftContext = context();
      if (contextDraft) contextOrigin = context();
    }
    const origin = context(), local = makeLocalReviewDraft();
    const materials = [], skipped = [];
    for (const material of state.input.materials) {
      if (!["txt", "csv", "json"].includes(fileExtension(material.name))) continue;
      const blob = await api.getMaterialBlob(material.id);
      if (!blob) { skipped.push(material.name); continue; }
      try {
        const text = new TextDecoder("utf-8", { fatal: true }).decode(await blob.arrayBuffer());
        if (text.length > 50000 || !["text/plain", "text/csv", "application/json"].includes(material.mime)) {
          skipped.push(material.name); continue;
        }
        materials.push({ materialId: material.id, materialVersion: material.version, mime: material.mime, text });
      } catch { skipped.push(material.name); }
    }
    if (!sameContext(origin) || origin.inputVersion !== state.round.inputVersion) {
      throw errorWithCode("读取期间输入已变化，未采用旧整理草稿。请重新整理。", "stale_input");
    }
    contextDraft = local.draft; contextBindings = local.sourceBindings; contextOrigin = origin; contextDirty = true;
    extractionController = new AbortController();
    let result;
    try {
      result = await intakeApi.requestIntakeExtraction({
        state, transcript: local.draft.transcript, description: ui.description.value,
        sources: local.draft.sources, draft: local.draft, sourceBindings: local.sourceBindings, materials
      }, { signal: extractionController.signal, consentToExternalProcessing: false });
    } finally { extractionController = null; }
    if (!sameContext(origin) || origin.inputVersion !== state.round.inputVersion ||
      result.requestContext?.sessionId !== origin.sessionId || result.requestContext?.roundId !== origin.roundId ||
      result.requestContext?.inputVersion !== origin.inputVersion) {
      throw errorWithCode("整理返回时输入已变化，未采用旧结果；原文和草稿仍保留。", "stale_input");
    }
    if (result.draft) { contextDraft = result.draft; contextBindings = result.sourceBindings; }
    reviewMessage = result.ok ? "结构化内容已返回，请逐项核对；确认不等于外部核验。" :
      "自动整理尚不可用，原文已保留。可以修改卡片，未提供的内容继续保持未知。";
    if (skipped.length) reviewMessage += " 部分材料未进入提取请求，原件与已有解析仍保留。";
    organizationVisible = true; readyToAnalyze = false;
    setIntakeStage("confirming");
    render();
    status(result.ok ? "请先核对经营情况，再继续。" : result.message);
  }

  function contextMatches(origin) {
    return sameContext(origin) && origin.inputVersion === state.round.inputVersion;
  }

  async function saveIntake(afterSave) {
    if (!intakeApi) throw new Error("完整上下文保存接口尚未就绪；原始转写与编辑文字仍在本页。");
    if (!contextDraft) {
      const local = makeLocalReviewDraft();
      contextDraft = local.draft; contextBindings = local.sourceBindings; contextOrigin = context(); contextDirty = true;
    }
    if (!contextMatches(contextOrigin)) throw errorWithCode("输入版本已变化，请重新整理并核对，未覆盖新记录。", "stale_input");
    if (descriptionDirty && draftContext && !contextMatches(draftContext)) {
      throw errorWithCode("这段编辑基于旧输入，请先重新整理并明确核对当前内容。", "stale_input");
    }
    const latest = makeLocalReviewDraft();
    contextDraft = latest.draft; contextBindings = latest.sourceBindings;
    const validated = intakeApi.validateMerchantIntakeDraft(contextDraft);
    if (!validated.ok) throw new Error(validated.errors.map((entry) => entry.message).join(" "));
    const preflight = intakeApi.mapConfirmedIntakeToAnalysisInput(validated.draft, { state, sourceBindings: contextBindings });
    if (!preflight.ok) throw errorWithCode(preflight.message || "来源或更正与当前输入不一致，请重新核对。", preflight.code);
    const origin = context(), voiceCount = voiceOriginals.length;
    const originalMaterials = JSON.stringify(state.input.materials);
    const originalClarification = JSON.stringify(state.round.clarification);
    const inputWithoutIntake = (input) => {
      const { intake: ignored, ...rest } = input;
      return JSON.stringify(rest);
    };
    const originalInput = inputWithoutIntake(state.input);
    const payload = { roundId: origin.roundId, inputVersion: origin.inputVersion, draft: validated.draft,
      description: ui.description.value, sourceBindings: structuredClone(contextBindings) };
    const draftText = JSON.stringify(payload.draft), bindingText = JSON.stringify(payload.sourceBindings);
    const command = { type: "INTAKE_SET", payload, expectedRevision: state.revision, commandId: crypto.randomUUID() };
    lastIntakeAttempt = { origin, transcript: payload.draft.transcript, voiceEntries: voiceOriginals.slice() };
    const finish = async (committed) => {
      const stored = state.input.intake;
      if (!sameContext(origin) || !committed || committed.sessionId !== state.sessionId ||
        committed.round.id !== state.round.id || committed.round.inputVersion !== state.round.inputVersion ||
        committed.revision !== state.revision || state.revision > command.expectedRevision + 1 ||
        ![origin.inputVersion, origin.inputVersion + 1].includes(state.round.inputVersion) ||
        JSON.stringify(state.input.materials) !== originalMaterials ||
        JSON.stringify(state.round.clarification) !== originalClarification ||
        !stored || stored.status !== "current" || stored.roundId !== origin.roundId ||
        (state.round.inputVersion === origin.inputVersion + 1 && stored.inputVersion !== state.round.inputVersion) ||
        (state.round.inputVersion === origin.inputVersion && inputWithoutIntake(state.input) !== originalInput) ||
        JSON.stringify(stored.draft) !== draftText ||
        JSON.stringify(stored.sourceBindings) !== bindingText || state.input.description !== payload.description) {
        throw errorWithCode("保存回执与当前草稿不一致，未清除未保存标记。", "stale_input");
      }
      descriptionDirty = ui.description.value !== payload.description;
      contextDirty = JSON.stringify(contextDraft) !== draftText || JSON.stringify(contextBindings) !== bindingText;
      if (!descriptionDirty && !contextDirty) {
        voiceOriginals.splice(0, voiceCount); inputSources.clear(); draftContext = context(); lastIntakeAttempt = null;
      }
      if (!descriptionDirty && !contextDirty) contextOrigin = context();
      if (!focusDirty) ui.focus.value = state.input.focus || "";
      organizedVersion = state.round.inputVersion;
      render();
      status("转写原文、编辑文字、来源与更正已保存在本机。");
      if (afterSave && !descriptionDirty && !contextDirty && !hasUnsavedVoice() && !focusDirty) await afterSave();
    };
    const committed = await attempt(command, finish, origin);
    await finish(committed);
  }

  function openContextEditor() {
    if (!intakeApi || !contextDraft || busy || pending || voiceEditingLocked()) return;
    if (!contextMatches(contextOrigin)) { showError("输入已变更，请重新整理后再更正。"); return; }
    contextEdit = { origin: context(), dirty: false, applied: false,
      previousDraft: structuredClone(contextDraft), previousBindings: structuredClone(contextBindings), previousDirty: contextDirty };
    ui.contextField.replaceChildren();
    for (const [field, label] of Object.entries(INTAKE_FIELD_LABELS)) {
      const option = element("option", label); option.value = field; ui.contextField.append(option);
    }
    ui.contextField.value = getIntakeCorrectionConflicts(contextDraft, state.input.facts, state, contextBindings)
      .find((entry) => entry.canRecover)?.field || "productName";
    fillContextField();
    ui.contextDialog.showModal();
  }

  function fillContextField() {
    const field = ui.contextField.value, value = intakeFieldValue(contextDraft, field);
    const conflicts = getIntakeCorrectionConflicts(contextDraft, state.input.facts, state, contextBindings).filter((entry) =>
      entry.field === field || INTAKE_ARRAY_FIELDS.has(field) && entry.field.startsWith(field + "."));
    const conflict = conflicts[0];
    const fact = conflict ? state.input.facts.find((entry) => entry.id === conflict.factId) : null;
    const baseline = conflict?.canRecover ? conflict.currentValue : value;
    ui.contextValue.value = Array.isArray(baseline) ? baseline.join("\n") : baseline === null ? "" : String(baseline);
    ui.contextFieldNote.textContent = INTAKE_ARRAY_FIELDS.has(field) ? "每行一项；原话和更正记录会保留。" :
      field.endsWith("Hypothesis") ? "这里记录你的当前判断，不会标成已经证实。" : "不知道可以留空，真实的 0 请明确填写。";
    ui.contextError.textContent = "";
    if (contextEdit) {
      contextEdit.field = field; contextEdit.text = ui.contextValue.value; contextEdit.dirty = false;
      contextEdit.recoveryFact = fact ? structuredClone(fact) : null;
      contextEdit.factSnapshot = fact ? JSON.stringify(fact) : null;
      contextEdit.recoveryBlocked = conflicts.some((entry) => !entry.canRecover);
      if (conflict) {
        ui.contextFieldNote.textContent = "旧理解：“" + String(conflict.oldValue ?? "未知") +
          "”；当前已更正：“" + String(conflict.currentValue ?? "未知") + "”。保存前请明确核对当前更正。";
        if (contextEdit.recoveryBlocked) ui.contextError.textContent = "数组、类型或来源无法明确对应，未替换任何草稿；暂不能从这里保存该项。";
      }
    }
    updateControls();
  }

  function closeContextEditor() {
    if (busy || pending) return;
    if (contextEdit?.dirty && !window.confirm("放弃这项尚未保存的修改？其他文字仍保留。")) return;
    if (contextEdit?.applied) {
      if (!contextEdit.previousDirty && state.input.intake) {
        contextDraft = structuredClone(state.input.intake.draft);
        contextBindings = structuredClone(state.input.intake.sourceBindings);
        contextDirty = false; contextOrigin = context();
      } else {
        contextDraft = contextEdit.previousDraft; contextBindings = contextEdit.previousBindings;
        contextDirty = contextEdit.previousDirty; contextOrigin = contextEdit.origin;
      }
    }
    contextEdit = null;
    ui.contextDialog.close();
    render();
  }

  async function saveContextEdit(event) {
    event.preventDefault();
    if (busy || pending || !contextEdit || !contextMatches(contextEdit.origin)) {
      ui.contextError.textContent = "当前编辑已过期或仍在保存，请重新核对。"; return;
    }
    try {
      if (contextEdit.recoveryBlocked) { ui.contextError.textContent = "这项更正的类型、数组或来源对应仍不明确，未保存。"; return; }
      const baseline = contextEdit.recoveryFact;
      if (baseline) {
        if (!isIntakeCorrectionSnapshotCurrent(state, { ...contextEdit.origin,
          factId: baseline.id, factSnapshot: contextEdit.factSnapshot })) {
          ui.contextError.textContent = "已保存的更正又发生变化，请重新打开核对；未使用旧值保存。"; return;
        }
        if (!window.confirm("已核对当前更正为“" + String(baseline.value ?? "未知") + "”，并以它为起点保存这次输入？原始转写和更正历史都会保留。")) return;
      }
      const editingDraft = contextEdit.applied ? contextEdit.previousDraft : contextDraft;
      const editingBindings = contextEdit.applied ? contextEdit.previousBindings : contextBindings;
      const edited = editIntakeField(editingDraft, editingBindings, ui.contextField.value, ui.contextValue.value, baseline, state);
      const checked = intakeApi.validateMerchantIntakeDraft(edited.draft);
      if (!checked.ok) { ui.contextError.textContent = checked.errors.map((entry) => entry.message).join(" "); return; }
      contextDraft = checked.draft; contextBindings = edited.sourceBindings; contextDirty ||= edited.changed;
      contextEdit.applied = edited.changed || contextEdit.applied;
      await exclusive(async () => {
        await saveIntake(async () => {
          contextEdit = null; ui.contextDialog.close(); readyToAnalyze = false;
          setIntakeStage("confirming"); render();
        });
      }, "正在保存这处更正…");
    } catch (error) { ui.contextError.textContent = error.message || "修改尚未保存。"; }
  }

  async function advanceQuestion() {
    if (!intakeApi || !contextDraft || contextDirty || descriptionDirty || hasUnsavedVoice() || questionDirty) {
      throw new Error("理解内容或回答尚未保存，请先核对当前编辑。");
    }
    if (!contextMatches(contextOrigin)) throw errorWithCode("资料已变化，请重新核对后再补问。", "stale_input");
    const clarification = state.round.clarification;
    const active = clarification.questions.find((question) => question.questionId === clarification.activeQuestionId);
    if (active) { readyToAnalyze = false; showQuestion(); return; }
    const next = getNextIntakeQuestion(contextDraft, clarification);
    if (!next) {
      readyToAnalyze = true;
      organizedVersion = state.round.inputVersion;
      showReview("ready");
      status("这一轮的补充已保留。可以查看来源，再开始分析；未知仍是未知。");
      return;
    }
    const origin = context();
    const payload = { roundId: origin.roundId, inputVersion: origin.inputVersion,
      questionId: null, status: "asked", ...next };
    const finish = () => {
      const saved = state.round.clarification.questions.find((question) => question.questionText === next.questionText);
      if (!contextMatches(origin) || !saved || saved.status !== "asked" ||
        state.round.clarification.activeQuestionId !== saved.questionId) {
        throw errorWithCode("已问内容或输入版本发生变化，请回到核对区确认；未创建替代问题。", "stale_input");
      }
      readyToAnalyze = false;
      showQuestion();
      status("只补充这一件；不知道或跳过也可以继续。");
    };
    await send("QUESTION_SET", payload, finish);
    finish();
  }

  async function submitQuestion(kind = "known") {
    if (busy || voiceSnapshot?.active || pending || pendingRead || !intakeApi || !state) return;
    const active = state.round.clarification.questions.find((question) => question.questionId ===
      state.round.clarification.activeQuestionId);
    if (active?.status === "asked" && sameContext(questionContext) &&
      questionContext.questionId === active.questionId && !contextMatches(questionContext)) {
      if (!window.confirm("本轮资料已更新，但仍是同一个问题。请核对最新内容；要把保留的回答用于当前输入版本吗？")) return;
      questionContext = { ...context(), questionId: active.questionId };
    }
    if (!active || active.status !== "asked" || !contextMatches(questionContext) ||
      questionContext.questionId !== active.questionId) {
      showError("这份回答所对应的问题或输入已更新。原文字仍保留，请先回到核对区，不会自动提交给另一问。");
      return;
    }
    if (contextDirty || contextEdit?.dirty || descriptionDirty || hasUnsavedVoice() || correctionDirty) {
      showError("还有未保存的理解修改，请先回到核对区处理；这份回答仍保留。"); return;
    }
    const typed = ui.questionAnswer.value;
    if (kind === "known" && !typed.trim()) { showError("先写一句，或选择不知道、跳过。"); return; }
    if (kind === "skipped" && typed.trim() && !window.confirm("跳过不会保存这段尚未提交的回答。要放弃这段文字并跳过吗？")) return;
    const origin = { ...questionContext };
    const payload = { roundId: origin.roundId, inputVersion: origin.inputVersion, questionId: origin.questionId,
      status: kind === "skipped" ? "skipped" : "answered" };
    if (kind !== "skipped") payload.answer = { availability: kind, rawText: typed.trim() ? typed : null };
    const expectedVersion = origin.inputVersion + (kind === "skipped" ? 0 : 1);
    const finish = async () => {
      const saved = state.round.clarification.questions.find((question) => question.questionId === origin.questionId);
      if (!sameContext(origin) || !saved || saved.status !== payload.status ||
        JSON.stringify(saved.answer) !== JSON.stringify(payload.answer || null) || ui.questionAnswer.value !== typed) {
        throw errorWithCode("回答保存回执与当前编辑不一致，文字仍保留，未继续下一问。", "stale_input");
      }
      questionDirty = false; ui.questionAnswer.value = ""; renderedQuestionId = null; questionContext = null;
      // A question answer is saved only by QUESTION_SET. Never rewrite transcript,
      // description, the nine review groups, or their sources as a hidden side effect.
      if (state.round.inputVersion !== expectedVersion || contextDirty || descriptionDirty || hasUnsavedVoice()) {
        showReview();
        throw errorWithCode("回答已保存，但其他输入也已变化。请重新核对，不会自动重放或换题。", "stale_input");
      }
      contextOrigin = context(); organizedVersion = state.round.inputVersion;
      render();
      await advanceQuestion();
    };
    await exclusive(async () => {
      await send("QUESTION_SET", payload, finish);
      await finish();
    }, kind === "skipped" ? "正在记录本次跳过…" : "正在保存这句补充…");
  }

  async function confirmUnderstanding() {
    if (busy || voiceSnapshot?.active || pending || pendingRead || !intakeApi || !state) return;
    if (uploadQueue.length || correctionDirty || contextEdit?.dirty) {
      showError("仍有文件或更正尚未保存，请先处理完再确认。"); return;
    }
    if (questionDirty) { showQuestion(); showError("这句补充尚未保存，请先提交、说明不知道，或明确跳过。"); return; }
    if (!contextDraft || !contextMatches(contextOrigin)) { showError("资料已变化，请重新整理并核对。"); return; }
    await exclusive(async () => {
      if (descriptionDirty || contextDirty || hasUnsavedVoice() || !state.input.intake || state.input.intake.status === "stale") {
        await saveIntake(() => advanceQuestion());
        return;
      }
      if (!readyToAnalyze) { await advanceQuestion(); return; }
      const origin = context(), inputVersion = state.round.inputVersion;
      const finish = () => navigateAfterConfirmation(origin, inputVersion);
      await send("FOCUS_CONFIRM", { inputVersion }, finish);
      await finish();
    }, readyToAnalyze ? "正在确认本轮输入…" : "正在保存核对内容…");
  }

  function render() {
    if (!state) { updateControls(); return; }
    ui.materials.replaceChildren();
    ui.imageMaterials.replaceChildren();
    ui.materials.hidden = !state.input.materials.some((material) => !material.mime.startsWith("image/"));
    ui.imageMaterials.hidden = !state.input.materials.some((material) => material.mime.startsWith("image/"));
    ui.demoNotice.hidden = !state.fixtureId;
    for (const material of state.input.materials) {
      const card = element("article", undefined, "material-card");
      card.dataset.materialId = material.id;
      card.tabIndex = -1;
      const main = element("div");
      main.append(element("h3", material.name, "material-name"));
      const names = { received: "已接收，待整理", parsed: "已读取结构化数据", needs_review: "内容待核对", failed: "读取未完成" };
      const size = material.size < 1024 * 1024 ? Math.ceil(material.size / 1024) + " KiB" :
        (material.size / 1024 / 1024).toFixed(2) + " MiB";
      main.append(element("p", size + " · " + (names[material.status] || "内容待核对"), "material-meta"));
      if (material.error) main.append(element("p", material.error, "material-meta"));
      const actions = element("div", undefined, "material-actions");
      actions.append(button("查看原件", "preview"));
      for (const [label, action] of [["替换", "replace"], ["删除", "remove"]]) {
        const item = button(label, action);
        item.dataset.mutates = "true";
        actions.append(item);
      }
      card.append(main, actions);
      (material.mime.startsWith("image/") ? ui.imageMaterials : ui.materials).append(card);
    }
    ui.organization.hidden = !(organizationVisible || state.input.focus);
    ui.understandingNote.textContent = intakeApi ?
      "确认表示与你的讲述一致，不代表已经外部核实。" :
      "当前只做本地文字与材料整理，经营上下文确认仍待接通；下方已有信息可以更正。";
    renderFacts();
    ui.constraints.replaceChildren();
    if (!state.input.constraints.length) ui.constraints.append(element("p", "尚未提供本轮限制，不自动假定预算或时间。", "empty-state"));
    for (const constraint of state.input.constraints) {
      const value = constraint.value === null || constraint.value === undefined ? "" :
        "：" + constraint.value + (constraint.unit || "");
      ui.constraints.append(element("p", constraint.description + value, "constraint-row"));
    }
    ui.unknowns.replaceChildren();
    if (!state.input.unknowns.length) ui.unknowns.append(element("p", "未发现已登记的缺口；这不等于资料已全部核实。", "empty-state"));
    for (const unknown of state.input.unknowns) {
      const row = element("p", unknown.description, "unknown-row");
      if (unknown.reason === "conflicting") row.dataset.conflicting = "true";
      ui.unknowns.append(row);
    }
    if (intakeApi) {
      ui.organization.hidden = !["confirming", "ready"].includes(intakeStage);
      renderUnderstanding();
    }
    ui.focus.closest(".focus-editor").hidden = !!intakeApi;
    ui.returnReview.hidden = !intakeApi || !contextDraft;
    renderQuestions();
    updateControls();
  }

  function renderFacts() {
    ui.facts.replaceChildren();
    if (!state.input.facts.length) {
      ui.facts.append(element("p", "还没有可直接提取的指标。描述和原件已保留，可按未知继续。", "empty-state"));
      return;
    }
    for (const fact of state.input.facts.slice(0, visibleFacts)) {
      const row = element("article", undefined, "fact-row");
      row.dataset.factId = fact.id;
      row.dataset.availability = fact.availability;
      row.tabIndex = -1;
      const main = element("div", undefined, "fact-main");
      main.append(element("span", factLabel(fact), "fact-label"));
      const value = fact.availability === "not_applicable" ? "不适用" :
        fact.availability === "unknown" || fact.value === null ? "未知" :
          String(fact.value) + (fact.unit ? " " + fact.unit : "");
      main.append(element("p", value, "fact-value"));
      const provenance = fact.source?.kind === "merchant_statement" ? "商家自述 / 更正" :
        fact.source?.kind === "file_extract" ? "文件提取 · 待核对" :
        fact.source?.kind === "scenario_assumption" ? "情景假设" :
        fact.source?.kind === "derived" ? "派生计算" : "参考来源";
      const window = fact.window?.start || fact.window?.end ?
        (fact.window.start || "起日未知") + " 至 " + (fact.window.end || "止日未知") : "时间范围未知";
      main.append(element("p", [
        provenance, fact.subject || "对象未知", fact.channel || "渠道未知", fact.cohort || "群体口径未知", window
      ].join(" · "), "fact-meta"));
      const actions = element("div", undefined, "item-actions");
      actions.append(button("查看来源", "source"));
      const correct = button("更正", "correct");
      correct.dataset.mutates = "true";
      actions.append(correct);
      row.append(main, actions);
      ui.facts.append(row);
    }
    if (state.input.facts.length > visibleFacts) {
      ui.facts.append(button("显示更多（共 " + state.input.facts.length + " 项）", "more"));
    }
  }

  async function exclusive(work, message) {
    if (busy || voiceEditingLocked() || connectInProgress) return false;
    busy = true;
    clearError();
    if (message) status(message);
    updateControls();
    try { await work(); return true; }
    catch (error) {
      showError(error.message || "操作未完成，当前草稿仍保留。");
      status("尚未完成，请核对提示后重试。");
      if (correctionDirty && !pending && correctionTarget && !ui.correction.open) {
        ui.correctionError.textContent = ui.error.textContent;
        ui.correction.showModal();
      }
      return false;
    } finally { busy = false; updateControls(); }
  }

  async function attempt(command, afterRetry, origin = context(), guard = null) {
    guard ||= { input: JSON.stringify(state.input), clarification: JSON.stringify(state.round.clarification) };
    const retain = () => { pending = { command, afterRetry, origin, guard }; };
    if (!sameContext(origin)) {
      retain();
      throw errorWithCode("本机已切换到另一轮，旧操作不会重放。请停止重试并核对保留的草稿。", "stale_round");
    }
    let result;
    try { result = await api.dispatch(command); }
    catch {
      retain();
      throw errorWithCode("未能确认保存结果，请重试同一操作；草稿仍保留。", "write_failed");
    }
    if (result.state) applyState(result.state);
    if (!sameContext(origin)) {
      retain();
      throw errorWithCode("保存期间已切换到另一轮，不再继续旧操作；请核对当前记录。", "stale_round");
    }
    if (!result.ok) {
      if (retryable.has(result.code)) retain();
      else if (pending?.command.commandId === command.commandId) pending = null;
      throw errorWithCode(result.message || "本次操作未保存。", result.code);
    }
    if (pending?.command.commandId === command.commandId) pending = null;
    return result.state;
  }

  function send(type, payload, afterRetry) {
    const command = { type, payload, expectedRevision: state.revision, commandId: crypto.randomUUID() };
    return attempt(command, afterRetry);
  }

  async function saveDescription() {
    if ((descriptionDirty || focusDirty) && draftContext &&
      (!sameContext(draftContext) || draftContext.inputVersion !== state.round.inputVersion)) {
      if (!window.confirm("本轮或输入版本已经变化。要把当前保留的文字草稿用于最新输入吗？这会更新最新描述。")) {
        throw new Error("文字草稿仍保留，尚未写入当前轮。");
      }
      draftContext = context();
    }
    const description = ui.description.value;
    if (description === state.input.description) { descriptionDirty = false; return; }
    await send("INPUT_EDIT", { description }, () => {
      descriptionDirty = ui.description.value !== description;
      status("描述已保存在本机，可继续整理。");
    });
    descriptionDirty = ui.description.value !== description;
    draftContext = context();
  }

  async function processMaterial(material) {
    const snapshot = { roundId: state.round.id, inputVersion: state.round.inputVersion, materialVersion: material.version };
    const blob = await api.getMaterialBlob(material.id);
    if (!blob) throw new Error("未找到这份原件，请重新读取或替换材料。");
    const result = await readSupportedMaterial(blob, material);
    if (state.round.id !== snapshot.roundId || state.round.inputVersion !== snapshot.inputVersion ||
      !state.input.materials.some((item) => item.id === material.id && item.version === snapshot.materialVersion)) {
      throw errorWithCode("读取期间资料已更新，旧读取结果未保存；请重新整理。", "stale_input");
    }
    await send("MATERIAL_RESULT_SET", { materialId: material.id, ...snapshot, ...result });
  }

  async function processReceived() {
    const ids = state.input.materials.filter((item) => item.status === "received").map((item) => item.id);
    for (const id of ids) {
      const material = state.input.materials.find((item) => item.id === id);
      if (material?.status === "received") await processMaterial(material);
    }
  }

  async function drainUploads() {
    const rejected = [];
    while (uploadQueue.length) {
      const entry = uploadQueue.shift();
      try {
        if (!sameContext(entry.origin)) {
          uploadQueue.unshift(entry);
          throw errorWithCode("已切换到另一轮，旧轮待接收文件未添加。请停止重试后重新选择文件。", "stale_round");
        }
        await validateFile(entry.file, !!entry.target);
        if (!sameContext(entry.origin)) {
          uploadQueue.unshift(entry);
          throw errorWithCode("校验期间已切换到另一轮，未加入旧轮文件。请停止重试后重新选择。", "stale_round");
        }
        if (entry.target && !state.input.materials.some((item) =>
          item.id === entry.target.id && item.version === entry.target.version)) {
          throw errorWithCode("待替换材料已更新，请重新选择要替换的原件。", "stale_input");
        }
        const resume = async () => {
          await processReceived();
          await drainUploads();
          status("材料接收处理已结束；请核对文件列表中的读取状态和未接收提示，再继续整理。");
        };
        if (entry.target) {
          await send("MATERIAL_REPLACE", {
            materialId: entry.target.id, file: entry.file, inputVersion: state.round.inputVersion
          }, resume);
        } else await send("MATERIAL_ADD", { file: entry.file }, resume);
        await processReceived();
      } catch (error) {
        if (pending || error.code === "stale_round") throw error;
        rejected.push(entry.file.name + "：" + (error.message || "未接收"));
      }
    }
    if (rejected.length) showError(rejected.join("；"));
  }

  async function receiveFiles(files, target = null) {
    if (!files.length) return;
    if (busy || voiceEditingLocked() || connectInProgress || pending || pendingRead || !state) {
      showError("请先完成或重试当前操作，再添加材料。");
      return;
    }
    uploadQueue.push(...Array.from(files, (file) => ({ file, target, origin: context() })));
    await exclusive(async () => {
      if (!intakeApi) await saveDescription();
      await drainUploads();
      status(state.input.materials.length ? "材料接收处理已结束；请核对文件列表中的读取状态和未接收提示。" : "未接收材料，请核对提示。");
    }, "正在接收材料…");
  }

  async function saveOrganization(focusText) {
    const generatedUnknowns = new Set();
    const payload = buildOrganization(state, focusText, ownedUnknowns, generatedUnknowns);
    const origin = context();
    const finish = (committedVersion = payload.inputVersion) => {
      if (!sameContext(origin)) throw new Error("本机已切换到另一轮，旧整理结果不会覆盖当前草稿。");
      focusDirty = false;
      ui.focus.value = state.input.focus;
      organizedVersion = state.round.inputVersion === committedVersion ? committedVersion : null;
      ownedUnknowns.clear();
      for (const unknown of state.input.unknowns) {
        if (generatedUnknowns.has(unknownSignature(unknown))) ownedUnknowns.set(unknown.id, unknownSignature(unknown));
      }
      organizationVisible = true;
      render();
      status(hasUnsavedVoice() ?
        "描述与材料已保存，原始转写仍在本页。完整上下文保存接口尚未就绪，暂不能进入分析。" :
        organizedVersion === null ?
        "原整理操作已核对，但输入版本已变化。请重新整理后确认。" :
        "已整理并保存在本机，请核对本轮范围。");
    };
    const saved = await send("ORGANIZATION_SET", payload, () => finish());
    finish(saved.round.inputVersion);
  }

  async function organize() {
    if (busy || voiceSnapshot?.active || pending || pendingRead || !state) return;
    if (!inputReady()) { showError("先说一句，或交一份材料。"); return; }
    if (contextEdit?.dirty || correctionDirty || questionDirty) {
      showError("还有更正或补问文字未处理，请先保存或取消；整理不会覆盖这些草稿。");
      if (questionDirty) showQuestion();
      return;
    }
    const completed = await exclusive(async () => {
      const focus = focusDirty ? ui.focus.value : descriptionDirty ? ui.description.value : state.input.focus;
      if (!intakeApi) await saveDescription();
      if (uploadQueue.length) await drainUploads();
      await processReceived();
      if (!ui.description.value.trim() && !state.input.materials.length) {
        throw new Error("还没有有效描述或已接收材料，请核对接收提示。");
      }
      if (intakeApi) {
        setIntakeStage("extracting", "正在核对可用的整理能力，原文仍保留。");
        await prepareUnderstanding();
      } else await saveOrganization(focus);
      ui.organization.focus({ preventScroll: true });
      ui.organization.scrollIntoView({ behavior: "instant", block: "start" });
    }, "正在整理本轮内容…");
    if (!completed && intakeApi && intakeStage === "extracting") {
      setIntakeStage("idle", "整理尚未完成，可以继续修改原文或重试。");
      render(); showManual(false);
    }
  }

  async function navigateAfterConfirmation(origin, inputVersion) {
    if (!sameContext(origin) || state.round.inputVersion !== inputVersion ||
      state.input.confirmedVersion !== inputVersion || dirty()) {
      throw new Error("当前内容已变更，原确认结果不会自动带你进入下一页。请核对后重新确认。");
    }
    allowNavigation = true;
    try {
      const result = await api.navigateTo("decisions");
      if (result === false || result?.ok === false) throw new Error(result.message || "本轮已保存，页面跳转未完成。");
    } catch (error) { allowNavigation = false; throw error; }
  }

  async function confirmFocus() {
    if (intakeApi) return confirmUnderstanding();
    if (busy || pending || pendingRead || !state) return;
    if (hasUnsavedVoice()) {
      showError("原始转写与来源尚未保存。共享理解保存接口还未就绪，文字仍在本页，暂不能确认或离开。");
      return;
    }
    if (uploadQueue.length || correctionDirty || contextDirty || questionDirty) {
      showError("仍有文件或更正未保存，请先处理完再确认。");
      return;
    }
    if (descriptionDirty || organizedVersion !== state.round.inputVersion) {
      showError("资料已变更，请先重新整理再确认。");
      return;
    }
    await exclusive(async () => {
      if (focusDirty) await saveOrganization(ui.focus.value);
      if (organizedVersion !== state.round.inputVersion) {
        throw new Error("整理期间资料已变更，请重新整理后确认当前版本。");
      }
      const origin = context(), inputVersion = state.round.inputVersion;
      const continueToDecisions = () => navigateAfterConfirmation(origin, inputVersion);
      await send("FOCUS_CONFIRM", { inputVersion }, continueToDecisions);
      status("本轮范围已保存，正在进入下一页。");
      await continueToDecisions();
    }, "正在保存本轮范围…");
  }

  function closePreview() {
    previewRequest += 1;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = null;
    previewMaterialId = null;
    previewMaterialVersion = null;
    ui.previewBody.replaceChildren();
    if (previewTrigger?.isConnected) previewTrigger.focus();
    else ui.choose.focus();
  }

  async function previewMaterial(materialId, locator = null) {
    const material = state.input.materials.find((item) => item.id === materialId);
    if (!material) { showError("来源已更新或原件已移除。"); return; }
    const request = ++previewRequest, origin = context();
    previewTrigger = document.activeElement;
    previewMaterialId = materialId;
    previewMaterialVersion = material.version;
    const current = () => request === previewRequest && sameContext(origin) &&
      state.input.materials.some((item) => item.id === materialId && item.version === material.version);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = null;
    ui.previewTitle.textContent = material.name;
    ui.previewBody.replaceChildren(element("p", "正在读取原件…", "muted"));
    if (!ui.preview.open) ui.preview.showModal();
    try {
      const blob = await api.getMaterialBlob(materialId);
      if (!current()) return;
      if (!blob) throw new Error("原件已移除，不能用其他文件替代。");
      const fragment = document.createDocumentFragment();
      if (locator) {
        const location = locator.type === "csv" ? "原件第 " + locator.lineStart + "—" + locator.lineEnd + " 行，字段 " + locator.column :
          locator.type === "json" ? "原件字段 " + locator.pointer : "原文来源";
        fragment.append(element("p", location, "fact-meta"));
      }
      if (Object.hasOwn(IMAGE_TYPES, fileExtension(material.name))) {
        previewUrl = URL.createObjectURL(blob);
        const image = element("img");
        image.alt = "材料原件：" + material.name;
        image.src = previewUrl;
        fragment.append(image);
      } else {
        let text;
        try { text = new TextDecoder("utf-8", { fatal: true }).decode(await blob.arrayBuffer()); }
        catch { text = "无法按 UTF-8 读取此原件。材料仍保存在本机，可替换为 UTF-8 文本。"; }
        if (!current()) return;
        const pre = element("pre", text.split(/\r\n|\r|\n/).map((line, index) => (index + 1) + "  " + line).join("\n"));
        pre.tabIndex = 0;
        pre.setAttribute("aria-label", "原件全文与行号");
        fragment.append(pre);
      }
      if (current()) ui.previewBody.replaceChildren(fragment);
    } catch (error) {
      if (request !== previewRequest) return;
      ui.previewBody.replaceChildren(element("p", error.message || "原件读取失败，请关闭后重试。"));
    }
  }

  function locateFact(factId) {
    const index = state.input.facts.findIndex((fact) => fact.id === factId);
    if (index < 0) { showError("来源已更新，这条事实已不在当前资料中。"); return; }
    visibleFacts = Math.max(visibleFacts, index + 1);
    organizationVisible = true;
    if (intakeApi) setIntakeStage("confirming");
    render();
    ui.facts.closest("details").open = true;
    const row = Array.from(ui.facts.children).find((node) => node.dataset.factId === factId);
    row?.classList.add("is-highlighted");
    row?.scrollIntoView({ behavior: "instant", block: "center" });
    row?.focus({ preventScroll: true });
  }

  async function showFactSource(fact) {
    if (fact.source?.materialId) {
      const material = state.input.materials.find((item) => item.id === fact.source.materialId);
      if (!material || material.version !== fact.source.materialVersion) {
        showError("原件已移除或更新，当前文件不能冒充这条历史来源。");
        return;
      }
      await previewMaterial(material.id, fact.source.locator);
    } else if (fact.source?.locator?.type === "input") {
      showManual();
    } else if (fact.source?.locator?.questionId) {
      locateQuestion(fact.source.locator.questionId);
    } else {
      previewRequest += 1;
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      previewUrl = null; previewMaterialId = null; previewMaterialVersion = null;
      previewTrigger = document.activeElement;
      ui.previewTitle.textContent = factLabel(fact) + "的来源";
      ui.previewBody.replaceChildren(element("p", fact.source?.note || "没有可进一步定位的原件；此项来源仍需核对。"));
      if (fact.source?.locator?.type === "correction") {
        ui.previewBody.append(element("p", "这是商家主动更正，未改写原始文件。"));
      }
      if (fact.source?.locator?.type === "intake") {
        const locator = fact.source.locator, original = state.input.intake?.draft.transcript;
        if (locator.source === "voice") {
          ui.previewBody.append(element("h3", "已保存的原始转写"));
          ui.previewBody.append(element("pre", locator.quote || original || "没有可进一步定位的语音转写。"));
        } else {
          ui.previewBody.append(element("p", locator.source === "paste" ? "来源为用户粘贴文字。" : "来源为用户手动填写或更正。"));
          if (locator.quote) ui.previewBody.append(element("pre", locator.quote));
        }
        if (state.input.intake?.status === "stale") ui.previewBody.append(element("p", "关联输入已变化，这份理解仍待重新核对。"));
      }
      if (!ui.preview.open) ui.preview.showModal();
    }
  }

  function locateQuestion(questionId) {
    if (!state.round.clarification.questions.some((question) => question.questionId === questionId)) {
      showError("这条补问不在当前轮次，未定位到其他问题。"); return;
    }
    showReview("confirming", false);
    ui.questionHistory.closest("details").open = true;
    const row = Array.from(ui.questionHistory.children).find((node) => node.dataset.questionId === questionId);
    row?.scrollIntoView({ behavior: "instant", block: "center" });
    row?.focus({ preventScroll: true });
  }

  function openCorrection(fact) {
    if (busy || voiceEditingLocked() || pending || pendingRead) return;
    if (intakeApi && fact.intakeField) {
      const field = Object.hasOwn(INTAKE_FIELD_LABELS, fact.intakeField) ? fact.intakeField : fact.intakeField.split(".")[0];
      openContextEditor();
      if (ui.contextDialog.open && Object.hasOwn(INTAKE_FIELD_LABELS, field)) {
        ui.contextField.value = field; fillContextField();
      }
      return;
    }
    correctionTarget = structuredClone(fact);
    correctionContext = { ...context(), inputVersion: state.round.inputVersion, fact: JSON.stringify(fact) };
    correctionDirty = false;
    correctionTrigger = document.activeElement;
    ui.correctionTitle.textContent = "更正：" + factLabel(fact);
    ui.availability.value = fact.availability;
    ui.value.value = fact.value === null ? "" : String(fact.value);
    ui.value.disabled = ui.availability.value !== "known";
    ui.unit.value = fact.unit || "";
    ui.reason.value = "";
    ui.correctionError.textContent = "";
    ui.correction.showModal();
    updateControls();
  }

  async function saveCorrection(event) {
    event.preventDefault();
    if (busy || pending || pendingRead || !correctionTarget) return;
    const current = state.input.facts.find((fact) => fact.id === correctionTarget.id);
    if (!sameContext(correctionContext) || correctionContext.inputVersion !== state.round.inputVersion ||
      !current || JSON.stringify(current) !== correctionContext.fact) {
      ui.correctionError.textContent = "这条信息或本轮资料已变更，尚未保存当前更正。请取消后从最新信息重新打开。";
      return;
    }
    const availability = ui.availability.value;
    let value = availability === "known" ? ui.value.value.trim() : null;
    const numeric = typeof correctionTarget.value === "number" ||
      correctionTarget.source?.kind === "file_extract";
    if (availability === "known" && (!value || numeric && (!DECIMAL.test(value) || !Number.isFinite(Number(value))))) {
      ui.correctionError.textContent = numeric ? "请输入有限数值；不清楚时选择“还不清楚”。" : "请输入实际内容，或选择“还不清楚”。";
      return;
    }
    if (availability === "known" && numeric) value = Number(value);
    const unit = textOrNull(ui.unit.value);
    if (value === correctionTarget.value && availability === correctionTarget.availability && unit === correctionTarget.unit) {
      correctionDirty = false;
      ui.correction.close();
      return;
    }
    const reason = ui.reason.value.trim() || "用户在第一页主动更正";
    const fact = { ...structuredClone(correctionTarget), value, availability, unit };
    const finish = async () => {
      correctionDirty = false;
      ui.correction.close();
      if (intakeApi) {
        readyToAnalyze = false;
        showReview();
        status("这处更正已保存。其他原文和理解内容没有被覆盖，请继续核对。");
      } else await saveOrganization(ui.focus.value);
    };
    await exclusive(async () => {
      await send("FACT_PATCH", {
        fact, reason, roundId: correctionContext.roundId, inputVersion: correctionContext.inputVersion
      }, finish);
      await finish();
    }, "正在保存更正…");
    if (pending || !ui.errorPanel.hidden) {
      ui.correctionError.textContent = ui.error.textContent;
      // The shared retry button must remain reachable if the write result is uncertain.
      if (pending && ui.correction.open) ui.correction.close();
    }
  }

  async function retryPending() {
    if (busy || connectInProgress) return;
    if (!api || !state || pendingRead) { await connect(); return; }
    if (!pending) return;
    await exclusive(async () => {
      const saved = pending;
      const loaded = await api.loadSession();
      if (!loaded.ok) throw new Error(loaded.message || "重新读取失败，草稿仍保留。");
      applyState(loaded.state);
      // First let the shared layer find the original receipt. Only an actual
      // revision conflict with unchanged full input/question snapshots may rebase
      // expectedRevision; the command ID, business payload and inputVersion stay fixed.
      let committed;
      try { committed = await attempt(saved.command, saved.afterRetry, saved.origin, saved.guard); }
      catch (error) {
        if (error.code !== "conflict") throw error;
        if (!contextMatches(saved.origin) || !saved.guard ||
          JSON.stringify(state.input) !== saved.guard.input ||
          JSON.stringify(state.round.clarification) !== saved.guard.clarification) {
          throw errorWithCode("输入、材料或问题已经变化，旧操作未改版本重放。请停止重试并重新核对保留的草稿。", "stale_input");
        }
        saved.command.expectedRevision = state.revision;
        committed = await attempt(saved.command, saved.afterRetry, saved.origin, saved.guard);
      }
      clearError();
      if (saved.afterRetry) await saved.afterRetry(committed);
      else status("该操作已在本机保存，可继续整理。");
      if (uploadQueue.length) await drainUploads();
    }, "正在核对并重试原操作…");
  }

  function stopRetry() {
    if (busy || (!pending && !uploadQueue.length)) return;
    if (!window.confirm("停止重试不会撤销已保存的内容。文字草稿会保留，未保存文件需重新选择。要停止吗？")) return;
    pending = null;
    uploadQueue = [];
    descriptionDirty = ui.description.value !== state?.input.description;
    focusDirty = !intakeApi && ui.focus.value !== (state?.input.focus ?? "");
    clearError();
    status("已停止重试，请核对当前记录和保留的草稿后再操作。");
    updateControls();
    if (correctionDirty && !ui.correction.open) {
      ui.correctionError.textContent = "更正草稿仍保留，请核对最新信息后保存或取消。";
      ui.correction.showModal();
    }
  }

  function requestCloseCorrection() {
    if (busy) return;
    if (!pending) {
      if (correctionDirty && !window.confirm("放弃尚未保存的这次更正？原件和已保存的信息不会改变。")) return;
      correctionDirty = false;
      correctionTarget = null;
      correctionContext = null;
    }
    ui.correction.close();
    updateControls();
  }

  async function connect() {
    if (connectInProgress) return;
    connectInProgress = true;
    pendingRead = false;
    updateControls();
    status("正在读取本机记录…");
    try {
      if (!api) {
        const [session, navigation, shell, draftModule, extraction] = await Promise.all([
          import("../shared/state.js"), import("../shared/navigation.js"), import("../shared/shell.js"),
          import("../shared/intake-draft.js"), import("../shared/intake-extraction.js")
        ]);
        api = { ...session, ...navigation };
        intakeApi = { ...draftModule, ...extraction };
        await shell.mountShell("intake");
        unregisterGuard = api.registerNavigationGuard({
          isDirty: () => !allowNavigation && (dirty() || busy),
          onSave: async () => {
            if (voiceSnapshot?.active) {
              showError("识别服务尚未确认结束，请先停止并等待结束；暂不切换页面。");
              return false;
            }
            if (busy || pending || pendingRead || !state) return false;
            if (!intakeApi && hasUnsavedVoice()) {
              showError("共享理解保存接口还未就绪，原始转写与编辑文字仍在本页。尚未全部保存，暂不切换页面。");
              return false;
            }
            if ((!intakeApi && contextDirty) || contextEdit?.dirty || questionDirty) {
              showError("请先保存或取消当前理解编辑或补问回答，再切换页面。");
              return false;
            }
            if (correctionDirty) {
              ui.correctionError.textContent = "请先保存或取消这次更正，再切换页面。";
              if (!ui.correction.open) ui.correction.showModal();
              return false;
            }
            const saved = await exclusive(async () => {
              if (!intakeApi) await saveDescription();
              if (uploadQueue.length) await drainUploads();
              if (intakeApi && (descriptionDirty || contextDirty || hasUnsavedVoice())) await saveIntake();
              else if (!intakeApi && focusDirty) await saveOrganization(ui.focus.value);
            }, "正在保存草稿…");
            if (saved && dirty()) showError("仍有未保存的内容，页面不会把这次保存当作全部完成。");
            return saved && !dirty();
          },
          onDiscard: () => {
            if (busy) return false;
            voiceSession?.cancel("cancelled");
            if (voiceSnapshot?.active) {
              showError("已请求停止识别，尚未收到结束确认；草稿仍保留，暂不切换页面。");
              return false;
            }
            descriptionDirty = false; focusDirty = false; correctionDirty = false;
            contextDirty = false; questionDirty = false; contextEdit = null;
            contextDraft = state?.input.intake ? structuredClone(state.input.intake.draft) : null;
            contextBindings = structuredClone(state?.input.intake?.sourceBindings || []);
            contextOrigin = state ? context() : null;
            questionContext = null; renderedQuestionId = null; ui.questionAnswer.value = "";
            readyToAnalyze = false;
            voiceOriginals.length = 0; inputSources.clear();
            lastIntakeAttempt = null;
            pending = null; uploadQueue = []; draftContext = null;
            correctionTarget = null; correctionContext = null;
            if (ui.correction.open) ui.correction.close();
            if (ui.contextDialog.open) ui.contextDialog.close();
            if (ui.voiceConsent.open) ui.voiceConsent.close();
            ui.description.value = state?.input.description || "";
            ui.focus.value = state?.input.focus || "";
            if (intakeApi) setIntakeStage(contextDraft ? "confirming" : "idle");
            render();
            return true;
          }
        });
        unsubscribe = api.subscribeSession((result) => {
          if (!result.ok) {
            pendingRead = true;
            showError(result.message || "本机记录读取失败；当前草稿仍保留。");
            updateControls();
            return;
          }
          applyState(result.state);
          if (!busy && dirty()) status("本机记录已更新；尚未保存的编辑仍在当前页。");
        });
      }
      const result = await api.loadSession();
      if (!result.ok) throw new Error(result.message || "本机记录未能读取。");
      applyState(result.state);
      organizationVisible = !!state.input.focus;
      if (state.input.confirmedVersion === state.round.inputVersion) organizedVersion = state.round.inputVersion;
      if (intakeApi && state.input.intake && contextDraft && !dirty()) {
        readyToAnalyze = state.input.intake.status === "current" && state.input.confirmedVersion === state.round.inputVersion;
        setIntakeStage(state.round.clarification.activeQuestionId ? "questioning" : readyToAnalyze ? "ready" : "confirming");
        reviewMessage = state.input.intake.status === "stale" ?
          "关联输入已变化，这份理解需要重新整理和核对；旧来源仍保留供查看。" :
          "已恢复你上次保存的理解与来源，未重新提取或重置补问额度。";
      }
      pendingRead = false;
      if (!dirty()) clearError();
      render();
      status(state.savedAt ? "已读取本机记录。" : "");
      const sourceId = new URL(location.href).searchParams.get("sourceId");
      if (sourceId) {
        if (sourceId === "input:description") showManual();
        else if (sourceId === "input:focus") {
          if (intakeApi && contextDraft) showReview();
          else { organizationVisible = true; render(); ui.focus.focus(); }
        }
        else if (/^fact:[A-Za-z0-9_-]{1,80}$/.test(sourceId)) locateFact(sourceId.slice(5));
        else if (/^material:[A-Za-z0-9_-]{1,80}$/.test(sourceId)) await previewMaterial(sourceId.slice(9));
        else if (/^question:[A-Za-z0-9_-]{1,80}$/.test(sourceId)) locateQuestion(sourceId.slice(9));
        else showError("该来源暂不能定位，已有内容仍保留。");
      }
    } catch (error) {
      pendingRead = true;
      showError(api ? error.message : "共享模块暂不可用，未创建替代状态。请在共享模块就绪后刷新或重试。");
      status("本轮内容尚未就绪。");
    } finally { connectInProgress = false; updateControls(); }
  }


  voiceHold = createVoiceHoldController({
    canStart: () => !ui.voiceStart.disabled && !!voiceSnapshot?.canStart,
    hasConsent: () => voiceConsentGranted,
    requestConsent: askVoiceConsent,
    start: startVoiceCapture,
    stop: () => voiceSession?.stop(),
    cancel: () => voiceSession?.cancel("cancelled"),
    getPhase: () => voiceSnapshot?.current?.phase
  });
  ui.voiceStart.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || event.isPrimary === false || ui.voiceStart.disabled) return;
    event.preventDefault();
    ui.voiceStart.focus();
    if (voiceHold.begin("pointer:" + event.pointerId)) {
      try { ui.voiceStart.setPointerCapture(event.pointerId); } catch { /* Window release still stops the hold. */ }
    }
  });
  window.addEventListener("pointerup", (event) => voiceHold.release("pointer:" + event.pointerId));
  window.addEventListener("pointercancel", (event) => voiceHold.release("pointer:" + event.pointerId, true));
  ui.voiceStart.addEventListener("lostpointercapture", (event) => voiceHold.release("pointer:" + event.pointerId, true));
  ui.voiceStart.addEventListener("keydown", (event) => {
    if (!["Enter", " "].includes(event.key)) return;
    // Prevent the native button click even when a composing/repeated key is ignored.
    event.preventDefault();
    if (!isVoiceHoldKey(event, composing || questionComposing,
      Math.max(lastCompositionAt, lastQuestionCompositionAt), performance.now())) return;
    voiceHold.begin("key:" + event.key);
  });
  window.addEventListener("keyup", (event) => {
    if (["Enter", " "].includes(event.key) && voiceHold.current() === "key:" + event.key) {
      event.preventDefault();
      voiceHold.release("key:" + event.key);
    }
  });
  window.addEventListener("blur", () => voiceHold.release(voiceHold.current(), true));
  // Assistive activation has no physical key/pointer hold: activate once to start,
  // again (or use the explicit stop button) to stop. Physical clicks are handled above.
  ui.voiceStart.addEventListener("click", (event) => {
    if (event.detail !== 0 || ui.voiceStart.disabled) return;
    if (voiceHold.current() === "assistive") voiceHold.release("assistive");
    else if (!voiceSnapshot?.active) voiceHold.begin("assistive");
  });
  ui.voiceConsentStart.addEventListener("click", grantVoiceConsent);
  ui.voiceConsentCancel.addEventListener("click", () => { ui.voiceConsent.close(); showManual(); });
  ui.voiceConsent.addEventListener("cancel", () => { ui.voiceStart.focus(); });
  ui.voiceStop.addEventListener("click", () => {
    if (voiceHold.release(voiceHold.current())) return;
    if (["listening", "stopping"].includes(voiceSnapshot?.current?.phase)) voiceSession?.stop();
    else voiceSession?.cancel("cancelled");
  });
  for (const control of [ui.voiceStop, ui.voiceConsentStart]) {
    control.addEventListener("keydown", (event) => {
      if (event.repeat && ["Enter", " "].includes(event.key)) event.preventDefault();
    });
  }
  ui.returnReview.addEventListener("click", () => {
    if (!ui.returnReview.disabled) showReview(readyToAnalyze ? "ready" : "confirming");
  });
  ui.form.addEventListener("submit", (event) => { event.preventDefault(); organize(); });
  ui.description.addEventListener("input", (event) => {
    if (!descriptionDirty && !focusDirty) draftContext = state ? context() : null;
    descriptionDirty = ui.description.value !== state?.input.description;
    inputSources.add(event.inputType === "insertFromPaste" ? "paste" : "manual");
    organizedVersion = null; readyToAnalyze = false;
    if (["confirming", "ready"].includes(intakeStage)) { setIntakeStage("idle"); render(); }
    status("描述尚未保存，确认核对内容时会一起保存。");
    updateControls();
  });
  ui.description.addEventListener("compositionstart", () => { composing = true; });
  ui.description.addEventListener("compositionend", () => { composing = false; lastCompositionAt = performance.now(); });
  ui.description.addEventListener("keydown", (event) => {
    if (isSubmitKey(event, composing, lastCompositionAt, performance.now())) {
      event.preventDefault();
      organize();
    }
  });
  ui.focus.addEventListener("input", () => {
    if (!descriptionDirty && !focusDirty) draftContext = state ? context() : null;
    focusDirty = ui.focus.value !== state?.input.focus;
    status("本轮范围尚未保存，确认时会保存。");
    updateControls();
  });
  ui.choose.addEventListener("click", () => { if (!ui.choose.disabled) ui.files.click(); });
  ui.chooseLegacy.addEventListener("click", () => { if (!ui.chooseLegacy.disabled) ui.legacyFiles.click(); });
  ui.legacyFiles.addEventListener("change", () => {
    const files = Array.from(ui.legacyFiles.files);
    ui.legacyFiles.value = "";
    receiveFiles(files);
  });
  ui.files.addEventListener("change", () => {
    const files = Array.from(ui.files.files);
    ui.files.value = "";
    receiveFiles(files);
  });
  ui.replacement.addEventListener("change", () => {
    const files = Array.from(ui.replacement.files), target = replaceTarget;
    ui.replacement.value = ""; replaceTarget = null;
    if (files.length && target) receiveFiles(files, target);
  });
  for (const type of ["dragenter", "dragover"]) {
    ui.drop.addEventListener(type, (event) => {
      if (!Array.from(event.dataTransfer?.types || []).includes("Files")) return;
      event.preventDefault();
      if (!ui.choose.disabled) { event.dataTransfer.dropEffect = "copy"; ui.drop.classList.add("is-dragging"); }
    });
  }
  ui.drop.addEventListener("dragleave", (event) => {
    if (!ui.drop.contains(event.relatedTarget)) ui.drop.classList.remove("is-dragging");
  });
  ui.drop.addEventListener("drop", (event) => {
    if (!event.dataTransfer?.files.length) return;
    event.preventDefault();
    ui.drop.classList.remove("is-dragging");
    receiveFiles(Array.from(event.dataTransfer.files));
  });
  ui.drop.addEventListener("keydown", (event) => {
    if (event.target === ui.drop && ["Enter", " "].includes(event.key) && !ui.choose.disabled) {
      event.preventDefault(); ui.files.click();
    }
  });

  for (const type of ["dragenter", "dragover"]) {
    ui.imageDrop.addEventListener(type, (event) => {
      if (!Array.from(event.dataTransfer?.types || []).includes("Files")) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "none";
    });
  }
  ui.imageDrop.addEventListener("drop", (event) => {
    if (!event.dataTransfer?.files.length) return;
    event.preventDefault();
    showError("截图接收、缩略图及来源标注待共享能力接线，本次未保存新图；已有材料不变。");
  });

  ui.form.addEventListener("paste", (event) => {
    const images = Array.from(event.clipboardData?.items || [])
      .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
      .map((item) => item.getAsFile()).filter(Boolean);
    if (event.target === ui.description && event.clipboardData?.getData("text/plain")) inputSources.add("paste");
    if (!images.length) return;
    if (!event.clipboardData?.getData("text/plain")) event.preventDefault();
    showError("截图接收待共享能力接线，本次未保存新图。可以粘贴文字或上传 CSV、TXT、JSON；已有图片仍保留。");
  });
  for (const list of [ui.materials, ui.imageMaterials]) list.addEventListener("click", async (event) => {
    const action = event.target.closest("button[data-action]");
    const card = action?.closest("[data-material-id]");
    if (!card || !state) return;
    const material = state.input.materials.find((item) => item.id === card.dataset.materialId);
    if (!material) return;
    if (action.dataset.action === "preview") { await previewMaterial(material.id); return; }
    if (busy || voiceEditingLocked() || pending || pendingRead) return;
    if (action.dataset.action === "replace") {
      replaceTarget = { id: material.id, version: material.version };
      ui.replacement.click();
    } else if (action.dataset.action === "remove" &&
      window.confirm("删除这份材料及本机原件？依赖它的结果将需要重新整理。")) {
      await exclusive(async () => {
        await saveDescription();
        await send("MATERIAL_REMOVE", { materialId: material.id });
        status("材料已移除；请重新整理本轮内容。");
      }, "正在移除材料…");
    }
  });
  ui.facts.addEventListener("click", async (event) => {
    const action = event.target.closest("button[data-action]");
    if (!action || !state) return;
    if (action.dataset.action === "more") { visibleFacts += 40; renderFacts(); updateControls(); return; }
    const row = action.closest("[data-fact-id]");
    const fact = state.input.facts.find((item) => item.id === row?.dataset.factId);
    if (!fact) return;
    if (action.dataset.action === "source") await showFactSource(fact);
    if (action.dataset.action === "correct") openCorrection(fact);
  });
  ui.back.addEventListener("click", () => {
    showManual(false); setIntakeStage("idle"); render();
    ui.form.scrollIntoView({ behavior: "instant", block: "start" });
    ui.description.focus({ preventScroll: true });
  });
  ui.editUnderstanding.addEventListener("click", openContextEditor);
  ui.contextForm.addEventListener("submit", saveContextEdit);
  ui.contextCancel.addEventListener("click", closeContextEditor);
  ui.contextDialog.addEventListener("cancel", (event) => { event.preventDefault(); closeContextEditor(); });
  ui.contextDialog.addEventListener("close", () => {
    if (!ui.organization.hidden) ui.editUnderstanding.focus();
  });
  ui.contextValue.addEventListener("input", () => {
    if (contextEdit) contextEdit.dirty = ui.contextValue.value !== contextEdit.text;
    updateControls();
  });
  ui.contextField.addEventListener("change", () => {
    if (contextEdit?.dirty && !window.confirm("切换字段会放弃这处尚未保存的输入，继续吗？")) {
      ui.contextField.value = contextEdit.field; return;
    }
    if (contextEdit?.applied) {
      contextDraft = contextEdit.previousDraft; contextBindings = contextEdit.previousBindings;
      contextDirty = contextEdit.previousDirty; contextOrigin = contextEdit.origin; contextEdit.applied = false;
    }
    fillContextField(); updateControls();
  });
  ui.questionForm.addEventListener("submit", (event) => { event.preventDefault(); submitQuestion(); });
  ui.questionUnknown.addEventListener("click", () => submitQuestion("unknown"));
  ui.questionSkip.addEventListener("click", () => submitQuestion("skipped"));
  ui.questionDiscard.addEventListener("click", () => {
    if (ui.questionDiscard.disabled || !window.confirm("放弃这份尚未提交的回答草稿？已经保存的问题和答案不会被删除。")) return;
    questionDirty = false; questionContext = null; renderedQuestionId = null; ui.questionAnswer.value = "";
    if (state.round.clarification.activeQuestionId) showQuestion();
    else showReview();
    status("已放弃这份未提交草稿，已保存的问题和答案仍保留。");
  });
  ui.questionBack.addEventListener("click", () => {
    if (ui.questionBack.disabled) return;
    showReview();
    if (questionDirty) status("这句尚未提交的补充仍保留，可点“继续这次补问”返回。");
  });
  ui.questionAnswer.addEventListener("input", () => { questionDirty = !!ui.questionAnswer.value; updateControls(); });
  ui.questionAnswer.addEventListener("compositionstart", () => { questionComposing = true; });
  ui.questionAnswer.addEventListener("compositionend", () => {
    questionComposing = false; lastQuestionCompositionAt = performance.now();
  });
  ui.questionAnswer.addEventListener("keydown", (event) => {
    if (isSubmitKey(event, questionComposing, lastQuestionCompositionAt, performance.now())) {
      event.preventDefault();
      if (!event.repeat) submitQuestion();
    }
  });
  ui.confirm.addEventListener("click", confirmFocus);
  ui.retry.addEventListener("click", retryPending);
  ui.stopRetry.addEventListener("click", stopRetry);
  ui.closePreview.addEventListener("click", () => ui.preview.close());
  ui.preview.addEventListener("close", closePreview);
  for (const field of [ui.availability, ui.value, ui.unit, ui.reason]) {
    field.addEventListener("input", () => { correctionDirty = true; updateControls(); });
  }
  ui.availability.addEventListener("change", () => { correctionDirty = true; updateControls(); });
  ui.correctionForm.addEventListener("submit", saveCorrection);
  ui.cancelCorrection.addEventListener("click", requestCloseCorrection);
  ui.correction.addEventListener("cancel", (event) => { event.preventDefault(); requestCloseCorrection(); });
  ui.correction.addEventListener("close", () => {
    if (correctionTrigger?.isConnected) correctionTrigger.focus();
    else ui.organization.focus({ preventScroll: true });
  });
  window.addEventListener("beforeunload", (event) => {
    if (!allowNavigation && (dirty() || busy)) { event.preventDefault(); event.returnValue = ""; }
  });
  window.addEventListener("pagehide", (event) => {
    extractionController?.abort();
    voiceHold?.release(voiceHold.current(), true);
    previewRequest += 1;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = null;
    if (!event.persisted) { voiceSession?.destroy(); titleMotionController?.destroy(); unsubscribe?.(); unregisterGuard?.(); }
  });
  window.addEventListener("pageshow", (event) => {
    allowNavigation = false;
    if (event.persisted) connect();
  });
  voiceSession = createVoiceSession({
    getScope: () => state ? { ...context(), inputVersion: state.round.inputVersion } : null,
    isScopeCurrent: (origin) => sameContext(origin) && origin.inputVersion === state.round.inputVersion,
    onChange: onVoiceChange
  });
  voiceSnapshot = voiceSession.snapshot();
  if (!voiceSnapshot.supported) {
    ui.voiceStartLabel.textContent = "当前浏览器不支持语音";
    setIntakeStage("idle", "可以直接在下方输入文字或上传资料。");
    showManual(false);
  }
  connect();
}
