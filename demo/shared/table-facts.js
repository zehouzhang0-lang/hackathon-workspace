// Local XLSX table → metric-fact parser for the intake page.
// Known business headers (Douyin video exports, third-party live rankings and
// the metric,value convention) are mapped to facts with per-cell provenance.
// Everything stays on this machine; ranges and lower bounds are never turned
// into fabricated single values, and an all-zero column next to positive
// sibling columns is treated as a collection gap, not as real zeros.

import { readWorkbookSheets } from "./xlsx-reader.js";

const MAX_ROWS = 500;
const CALIBER_SHEET_NAMES = new Set(["口径说明", "数据说明", "说明", "备注"]);
const WINDOW_SOURCE_HEADERS = new Set(["发布时间", "发布日期"]);
const SUBJECT_HEADERS = ["主播/达人名", "达人名", "主播", "账号名称", "账号", "商家名称", "店铺名", "作品id", "视频id", "名称"];
const IGNORED_HEADERS = new Set(["序号", "抖音号", "作品标题", "作品类型", "作品作者", "作品网址", "作者主页", "是否全屏",
  "是否购物车", "有无本地生活", "主页备注", "合集备注", "关键词备注", "作品备注", "作者uid", "作者secuid", "封面网址",
  "视频源网址", "话题内容", "作品时长", "作品质量", "直播间标题", "案例类型"]);

const COLUMN_ALIASES = [
  { headers: ["播放量", "播放数", "视频播放量"], key: "video_views", unit: "次" },
  { headers: ["商品点击数", "商品点击量", "商品点击"], key: "product_clicks", unit: "次" },
  { headers: ["加购数", "加购量", "加购人数"], key: "add_to_carts", unit: "次" },
  { headers: ["创建订单数", "下单数", "订单数"], key: "created_orders", unit: "笔" },
  { headers: ["支付订单数", "支付单数", "成交订单数", "支付订单"], key: "paid_orders", unit: "笔" },
  { headers: ["粉丝总量", "粉丝数"], key: "followers", unit: "人" },
  { headers: ["粉丝增量(近30天)", "粉丝增量"], key: "followers_growth", unit: "人" },
  { headers: ["获赞总量"], key: "total_likes", unit: "次" },
  { headers: ["直播场次(近30天)", "直播场次"], key: "live_sessions", unit: "场" },
  { headers: ["场均场观(近30天)", "场均场观", "场均观看人次"], key: "avg_live_viewers", unit: "人次" },
  { headers: ["场均带货数(近30天)", "场均带货数"], key: "avg_products_per_session", unit: "件" },
  { headers: ["场均结算金额(近30天)", "场均结算金额", "单场预估结算金额", "预估结算金额"], key: "estimated_settlement", unit: "元" },
  { headers: ["单场观看人次", "观看人次"], key: "live_viewers", unit: "人次" },
  { headers: ["单场商品数", "商品数", "货盘商品数"], key: "live_product_count", unit: "个" },
  { headers: ["单场销量", "销量"], key: "sales_estimate", unit: "单" },
  { headers: ["点赞量", "获赞量"], key: "likes", unit: "次" },
  { headers: ["评论量"], key: "comments", unit: "条" },
  { headers: ["收藏量"], key: "collects", unit: "次" },
  { headers: ["分享量"], key: "shares", unit: "次" }
];

const normalizeHeader = (header) => String(header ?? "").replace(/\s+/g, "").replace(/[（）]/g, "()").trim();

const MULTIPLIERS = { w: 1e4, W: 1e4, 万: 1e4, 亿: 1e8 };
const NUMBER = String.raw`[+-]?[\d,]+(?:\.\d+)?`;

// Returns {kind:'absent'} for empty/未收录 cells, {kind:'value',value} for a
// definite number, {kind:'range'|'lower_bound',text} for estimates that must
// stay unresolved, and {kind:'text',text} for anything else.
export function parseNumericCell(raw) {
  const text = String(raw ?? "").trim();
  if (!text || text === "—" || text === "─" || text === "-" || text === "–") return { kind: "absent" };
  const plain = new RegExp("^(" + NUMBER + ")$").exec(text.replace(/,/g, ""));
  if (plain) {
    const value = Number(plain[1]);
    return Number.isFinite(value) ? { kind: "value", value } : { kind: "text", text };
  }
  const scaled = new RegExp("^(" + NUMBER + ")([wW万亿])$").exec(text.replace(/,/g, ""));
  if (scaled) {
    const value = Math.round(Number(scaled[1]) * MULTIPLIERS[scaled[2]] * 1000) / 1000;
    return Number.isFinite(value) ? { kind: "value", value } : { kind: "text", text };
  }
  const lower = new RegExp("^(" + NUMBER + ")([wW万亿]?)\\+$").exec(text.replace(/,/g, ""));
  if (lower) return { kind: "lower_bound", text };
  const range = new RegExp("^(" + NUMBER + ")([wW万亿]?)[~～](" + NUMBER + ")([wW万亿]?)$").exec(text.replace(/,/g, ""));
  if (range) return { kind: "range", text };
  return { kind: "text", text };
}

export function parseExportDateFromName(fileName) {
  const match = /(\d{4})年(\d{1,2})月(\d{1,2})日/.exec(String(fileName ?? ""));
  if (!match) return null;
  const iso = match[1] + "-" + match[2].padStart(2, "0") + "-" + match[3].padStart(2, "0");
  return validDate(iso) ? iso : null;
}

function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return false;
  const date = new Date(value + "T00:00:00.000Z");
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function parseCellDate(raw) {
  const match = /^(\d{4})[-/年](\d{1,2})[-/月](\d{1,2})日?(?:[ T](\d{1,2}):(\d{2}))?/.exec(String(raw ?? "").trim());
  if (!match) return null;
  const iso = match[1] + "-" + match[2].padStart(2, "0") + "-" + match[3].padStart(2, "0");
  return validDate(iso) ? iso : null;
}

function headerCaliber(header) {
  if (header.includes("近30天")) return "近30天口径";
  if (header.includes("单场")) return "单场口径";
  if (header.includes("场均")) return "场均口径";
  return null;
}

function summarizeWarnings(warnings) {
  const unique = [...new Set(warnings)];
  if (!unique.length) return null;
  return unique.slice(0, 6).join("；") + (unique.length > 6 ? "；另有 " + (unique.length - 6) + " 项见原件核对。" : "");
}

// Parses one workbook into the same result shape as the page's text parsers:
// {status, facts, error}. facts use draft ids; the shared transaction maps and
// binds them to this material version.
export async function parseWorkbookFacts(bytes, material) {
  const warnings = [];
  const facts = [];
  let factCounter = 0;
  const nextFactId = () => "draft_f" + (++factCounter);
  const exportDate = parseExportDateFromName(material?.name);
  const fact = ({ key, value, unit, subject, cohort, windowStart, windowEnd, channel, sheet, cell, note }) => {
    const known = typeof value === "number" && Number.isFinite(value);
    facts.push({
      id: nextFactId(), key, value: known ? value : null, availability: known ? "known" : "unknown",
      unit: unit ?? null, subject: subject ?? null,
      window: { start: windowStart ?? null, end: windowEnd ?? null },
      channel: channel ?? null, cohort: cohort ?? null,
      source: { kind: "file_extract", materialId: material.id, materialVersion: material.version,
        locator: { type: "xlsx", sheet, cell }, note: note ?? "" },
      verification: "unreviewed"
    });
  };

  let sheets;
  try {
    sheets = await readWorkbookSheets(bytes);
  } catch (error) {
    if (error?.code === "xlsx_unsupported") return { status: "needs_review", facts: [], error: error.message };
    return { status: "failed", facts: [], error: "无法按XLSX读取这份原件：" + (error?.message || "容器损坏") + "；原件已保留，可另存为XLSX或导出UTF-8 CSV后重试。" };
  }
  const dataSheets = sheets.filter((sheet) => !sheet.missing && sheet.rows.length);
  if (!dataSheets.length) return { status: "needs_review", facts: [], error: "这份XLSX没有可读取的工作表内容；原件已保留。" };

  for (const sheet of sheets) {
    if (sheet.missing || !sheet.rows.length) continue;
    const headerIndex = sheet.rows.findIndex((cells) => cells.filter((cell) => String(cell ?? "").trim()).length >= 2);
    if (headerIndex < 0) continue;
    const header = sheet.rows[headerIndex].map(normalizeHeader);
    if (CALIBER_SHEET_NAMES.has(sheet.name) || header[0] === "数据来源" || header[0] === "口径") {
      let noted = 0;
      for (const cells of sheet.rows.slice(headerIndex)) {
        const [key, value] = cells.map((cell) => String(cell ?? "").trim()).filter(Boolean);
        if (key && noted < 8) { warnings.push("口径说明·" + key + "：" + value); noted += 1; }
      }
      continue;
    }
    const aliasByColumn = new Map();
    let subjectColumn = -1;
    const windowColumns = new Set();
    for (let index = 0; index < header.length; index += 1) {
      if (WINDOW_SOURCE_HEADERS.has(header[index])) windowColumns.add(index);
      const alias = COLUMN_ALIASES.find((entry) => entry.headers.some((name) => normalizeHeader(name) === header[index]));
      if (alias && !aliasByColumn.has(index)) aliasByColumn.set(index, alias);
      if (subjectColumn < 0 && SUBJECT_HEADERS.some((name) => normalizeHeader(name) === header[index])) subjectColumn = index;
    }
    if (aliasByColumn.size < 2 || subjectColumn < 0) {
      const isConvention = header.includes("metric") && header.includes("value");
      if (!isConvention) { warnings.push("工作表“" + sheet.name + "”未识别出足够的已知指标列，未自动提取；可在原件中核对。"); continue; }
      parseConventionSheet(sheet, headerIndex, header, material, exportDate, fact, warnings);
      continue;
    }
    parseAliasSheet(sheet, headerIndex, header, aliasByColumn, subjectColumn, windowColumns,
      facts, material, exportDate, fact, warnings);
  }
  if (!facts.length) warnings.push("没有从已知列中提取到指标；原件内容仍可人工核对。");
  return { status: warnings.length ? "needs_review" : "parsed", facts, error: summarizeWarnings(warnings) };
}

function parseConventionSheet(sheet, headerIndex, header, material, exportDate, fact, warnings) {
  const columns = Object.fromEntries(header.map((name, index) => [name, index]));
  for (const cells of sheet.rows.slice(headerIndex + 1)) {
    const record = (name) => (columns[name] === undefined ? null : String(cells[columns[name]] ?? "").trim());
    const metric = record("metric");
    if (!metric) continue;
    const rawValue = record("value");
    const parsed = rawValue ? parseNumericCell(rawValue) : { kind: "absent" };
    const start = parseCellDate(record("window_start")), end = parseCellDate(record("window_end"));
    const windowEnd = end ?? exportDate;
    if (parsed.kind === "value") {
      fact({ key: metric, value: parsed.value, unit: record("unit") || null, subject: record("subject") || null,
        cohort: record("cohort") || null, channel: record("channel") || null,
        windowStart: start, windowEnd, sheet: sheet.name,
        cell: cellRef(columns.value + 1, sheet.rows.indexOf(cells) + 1),
        note: "从上传XLSX原件按metric约定读取；尚未核验业务真实性。" });
    } else if (parsed.kind !== "absent") {
      warnings.push("工作表“" + sheet.name + "”中指标“" + metric + "”的值“" + rawValue + "”不是确定数值，按未知保留。");
      fact({ key: metric, value: null, unit: record("unit") || null, subject: record("subject") || null,
        cohort: record("cohort") || null, channel: record("channel") || null, windowStart: start, windowEnd,
        sheet: sheet.name, cell: cellRef(columns.value + 1, sheet.rows.indexOf(cells) + 1),
        note: "原文“" + rawValue + "”：不是确定数值，不折算。" });
    }
  }
}

function parseAliasSheet(sheet, headerIndex, header, aliasByColumn, subjectColumn, windowColumns,
  facts, material, exportDate, fact, warnings) {
  const dataRows = sheet.rows.slice(headerIndex + 1).filter((cells) => cells.some((cell) => String(cell ?? "").trim()));
  if (dataRows.length > MAX_ROWS) warnings.push("工作表“" + sheet.name + "”数据超过 " + MAX_ROWS + " 行，仅解析前 " + MAX_ROWS + " 行，其余可在原件核对。");
  const tracked = [...aliasByColumn.entries()].map(([index, alias]) => ({
    index, alias, values: [], zeros: 0, positives: 0, unresolved: []
  }));
  for (const cells of dataRows.slice(0, MAX_ROWS)) {
    const rowNumber = sheet.rows.indexOf(cells) + 1;
    const subject = String(cells[subjectColumn] ?? "").trim() || "第" + rowNumber + "行";
    let windowStart = null;
    for (const index of windowColumns) {
      windowStart = parseCellDate(cells[index]);
      if (windowStart) break;
    }
    const windowEnd = exportDate;
    for (const column of tracked) {
      const raw = cells[column.index];
      if (raw === undefined || String(raw).trim() === "") continue;
      const parsed = parseNumericCell(raw);
      const cohort = headerCaliber(header[column.index]) ?? (exportDate || windowStart ? "单条记录累计（至导出时点）" : null);
      const note = "从上传XLSX原件读取；尚未核验业务真实性。";
      const cell = cellRef(column.index + 1, rowNumber);
      if (parsed.kind === "value") {
        column.values.push(parsed.value);
        if (parsed.value === 0) column.zeros += 1;
        if (parsed.value > 0) column.positives += 1;
        fact({ key: column.alias.key, value: parsed.value, unit: column.alias.unit, subject,
          cohort, windowStart, windowEnd, sheet: sheet.name, cell, note });
      } else if (parsed.kind === "range" || parsed.kind === "lower_bound" || parsed.kind === "text") {
        column.unresolved.push({ subject, text: parsed.text ?? String(raw).trim() });
        fact({ key: column.alias.key, value: null, unit: column.alias.unit, subject,
          cohort, windowStart, windowEnd, sheet: sheet.name, cell,
          note: "原文“" + (parsed.text ?? String(raw).trim()) + "”：" +
            (parsed.kind === "range" ? "区间估值，不折算单值。" :
              parsed.kind === "lower_bound" ? "仅显示下限，不作确定值。" : "不是数值，未折算。") });
      }
    }
  }
  const anyPositive = tracked.some((column) => column.positives > 0);
  for (const column of tracked) {
    if (column.values.length && column.positives === 0 && column.zeros > 0 && anyPositive) {
      warnings.push("“" + header[column.index] + "”整列读取均为0，而同表其他指标存在大于0的值，疑似采集缺失；按未知保留，不当真实0。");
      for (let index = facts.length - 1; index >= 0; index -= 1) {
        const entry = facts[index];
        if (entry.key === column.alias.key && entry.source?.locator?.sheet === sheet.name) facts.splice(index, 1);
      }
      fact({ key: column.alias.key, value: null, unit: column.alias.unit, subject: null,
        cohort: headerCaliber(header[column.index]), windowStart: null, windowEnd: exportDate,
        sheet: sheet.name, cell: cellRef(column.index + 1, headerIndex + 2),
        note: "整列读取值均为0（" + column.zeros + "条），而同表其他指标存在大于0的值；疑似采集缺失，按未知保留，不当真实0。" });
    }
  }
}

function cellRef(column, row) {
  let letters = "";
  let value = column;
  while (value > 0) {
    const remainder = (value - 1) % 26;
    letters = String.fromCharCode(65 + remainder) + letters;
    value = Math.floor((value - 1) / 26);
  }
  return letters + row;
}
