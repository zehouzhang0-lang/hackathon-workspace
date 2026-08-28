// Minimal, dependency-free XLSX (OOXML) reader for local material parsing.
// Reads only what is needed to show a grid: workbook sheet names, the shared
// string table and cached cell values. Styles are not resolved; formulas are
// never evaluated — only their cached result values are read. No macro,
// external link or embedded content is executed, and nothing is sent anywhere.

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;
const NO_COMPRESSION = 0;
const DEFLATE = 8;

// Limits apply before allocation and to actual streamed output, not just ZIP
// metadata. Cell count includes sparse column spans, so a distant reference
// cannot allocate an unbounded array while counting as one populated cell.
export const XLSX_LIMITS = Object.freeze({
  maxEntries: 1024,
  maxEntryBytes: 16 * 1024 * 1024,
  maxTotalBytes: 32 * 1024 * 1024,
  maxRowsPerSheet: 10000,
  maxColumnsPerSheet: 1024,
  maxTotalRows: 100000,
  maxTotalCells: 100000,
  maxCellCharacters: 32768,
  maxTotalTextCharacters: 16 * 1024 * 1024,
  maxSharedStrings: 100000,
  maxSheets: 1024,
});

function fail(code, message) {
  throw Object.assign(new Error(message), { code });
}

function limit(value, maximum, message) {
  if (!Number.isSafeInteger(value) || value < 0 || value > maximum) {
    fail("xlsx_limit_exceeded", message + "，已停止本机解析；原件仍保留。");
  }
}

function range(start, length, end, message) {
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(length) ||
      start < 0 || length < 0 || start > end || length > end - start) {
    fail("invalid_xlsx", message);
  }
}

function character(code, radix) {
  const value = Number.parseInt(code, radix);
  if (!Number.isInteger(value) || value < 0 || value > 0x10ffff) {
    fail("invalid_xlsx", "XLSX包含无效的文字编码，未返回部分解析结果。");
  }
  return String.fromCodePoint(value);
}

function decodeXmlEntities(text) {
  return text
    .replace(/&#x([0-9a-fA-F]+);/g, (_, code) => character(code, 16))
    .replace(/&#(\d+);/g, (_, code) => character(code, 10))
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'").replace(/&amp;/g, "&");
}

function attribute(tag, name) {
  const match = new RegExp("\\b" + name + '="([^"]*)"').exec(tag);
  return match ? decodeXmlEntities(match[1]) : null;
}

// Entry bytes are plain Uint8Arrays (browser compatible); Buffer#toString would
// silently join numbers, so decoding always goes through TextDecoder.
const decoder = new TextDecoder("utf8");
const text = (bytes) => (bytes ? decoder.decode(bytes) : "");

// Check the elements we consume before regex extraction. Without this pass,
// repeated open tags without a closing tag make a lazy body regex rescan the
// remaining document at every opener. This is not a general XML validator.
function checkedXml(bytes) {
  const xml = text(bytes);
  const tags = /<(\/?)(row|c|si|t|sheet|Relationship)\b/g;
  const pending = new Set();
  let match;
  while ((match = tags.exec(xml))) {
    const end = xml.indexOf(">", tags.lastIndex);
    if (end < 0 || xml.slice(tags.lastIndex, end).includes("<")) {
      fail("invalid_xlsx", "XLSX的XML标签不完整，已停止读取。");
    }
    const name = match[2];
    if (match[1]) {
      if (!pending.delete(name)) fail("invalid_xlsx", "XLSX的XML结束标签不匹配。");
    } else {
      if (pending.has(name)) fail("invalid_xlsx", "XLSX包含重复嵌套的表格标签，已停止读取。");
      if (xml[end - 1] !== "/") pending.add(name);
    }
    tags.lastIndex = end + 1;
  }
  if (pending.size) fail("invalid_xlsx", "XLSX的XML缺少结束标签，已停止读取。");
  return xml;
}

function rowNumberOf(value, fallback) {
  if (value === null) return fallback;
  if (!/^[1-9]\d*$/.test(value)) fail("invalid_xlsx", "XLSX行号无效，未改写单元格位置。");
  const number = Number(value);
  limit(number, XLSX_LIMITS.maxRowsPerSheet, "单表行号超过10000行解析上限");
  return number;
}

function columnIndexOf(ref, rowNumber) {
  if (ref === null) return null;
  const parts = /^([A-Z]+)([1-9]\d*)$/.exec(ref);
  if (!parts) fail("invalid_xlsx", "XLSX单元格位置无效，未改写来源位置。");
  if (rowNumberOf(parts[2], rowNumber) !== rowNumber) {
    fail("invalid_xlsx", "XLSX单元格与所在行的位置不一致，未返回部分结果。");
  }
  let index = 0;
  for (const letter of parts[1]) {
    index = index * 26 + (letter.charCodeAt(0) - 64);
    limit(index, XLSX_LIMITS.maxColumnsPerSheet, "单表列号超过1024列解析上限");
  }
  return index - 1;
}

function outputBudget(entrySize, chunkSize, declaredSize, budget) {
  const size = entrySize + chunkSize;
  limit(size, XLSX_LIMITS.maxEntryBytes, "ZIP单条目实际展开超过16MiB上限");
  limit(budget.bytes + chunkSize, XLSX_LIMITS.maxTotalBytes, "ZIP实际总展开超过32MiB上限");
  if (size > declaredSize) fail("invalid_xlsx", "ZIP实际展开长度超过声明值，已停止读取。");
  budget.bytes += chunkSize;
  return size;
}

async function inflateRaw(bytes, declaredSize, budget) {
  if (typeof DecompressionStream !== "function" || typeof Blob === "undefined") {
    fail("xlsx_unsupported", "当前浏览器不支持XLSX解压；可在原应用中导出UTF-8 CSV后重新上传。");
  }
  let decompressor;
  try { decompressor = new DecompressionStream("deflate-raw"); }
  catch { fail("xlsx_unsupported", "当前浏览器不支持XLSX解压；可导出UTF-8 CSV后重新上传。"); }
  const reader = new Blob([bytes]).stream().pipeThrough(decompressor).getReader();
  const chunks = [];
  let length = 0;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      if (!(chunk.value instanceof Uint8Array)) fail("invalid_xlsx", "XLSX解压返回了无效字节。");
      length = outputBudget(length, chunk.value.byteLength, declaredSize, budget);
      chunks.push(chunk.value);
    }
    if (length !== declaredSize) fail("invalid_xlsx", "ZIP展开长度与声明值不符，未返回部分结果。");
    const output = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.byteLength; }
    return output;
  } catch (error) {
    try { await reader.cancel(); } catch { /* Preserve the original typed failure. */ }
    if (["invalid_xlsx", "xlsx_limit_exceeded", "xlsx_unsupported"].includes(error?.code)) throw error;
    fail("invalid_xlsx", "XLSX压缩内容损坏，未返回部分解析结果。");
  } finally { reader.releaseLock(); }
}

function checkExtra(view, start, length) {
  const end = start + length;
  for (let pointer = start; pointer < end;) {
    range(pointer, 4, end, "ZIP扩展字段不完整。");
    const kind = view.getUint16(pointer, true);
    const size = view.getUint16(pointer + 2, true);
    range(pointer + 4, size, end, "ZIP扩展字段长度无效。");
    if (kind === 1) fail("xlsx_unsupported", "不支持ZIP64格式，请另存为普通XLSX或UTF-8 CSV。");
    pointer += 4 + size;
  }
}

function checkFlags(flags, method) {
  if (flags & 0x2041) fail("xlsx_unsupported", "不支持加密XLSX，请解密后另存或导出UTF-8 CSV。");
  if (![NO_COMPRESSION, DEFLATE].includes(method)) {
    fail("xlsx_unsupported", "这份XLSX使用了不支持的压缩方式，请用Excel/WPS另存后重试。");
  }
}

// Reads a ZIP central directory only; file data offsets come from the central
// records, so entries with data descriptors are read correctly.
export async function readZipEntries(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length < 22) fail("invalid_xlsx", "文件太小，不是有效的XLSX容器。");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 65535); i -= 1) {
    if (view.getUint32(i, true) === EOCD_SIGNATURE && i + 22 + view.getUint16(i + 20, true) === bytes.length) {
      eocd = i; break;
    }
  }
  if (eocd < 0) fail("invalid_xlsx", "没有找到ZIP目录，文件可能已损坏，原件未受影响。");
  const count = view.getUint16(eocd + 10, true);
  const directorySize = view.getUint32(eocd + 12, true);
  const directoryStart = view.getUint32(eocd + 16, true);
  if (count === 0xffff || directorySize === 0xffffffff || directoryStart === 0xffffffff ||
      (eocd >= 20 && view.getUint32(eocd - 20, true) === 0x07064b50)) {
    fail("xlsx_unsupported", "不支持ZIP64格式，请另存为普通XLSX或UTF-8 CSV。");
  }
  if (view.getUint16(eocd + 4, true) || view.getUint16(eocd + 6, true) ||
      view.getUint16(eocd + 8, true) !== count) {
    fail("xlsx_unsupported", "不支持分卷ZIP，请另存为单个XLSX文件。");
  }
  limit(count, XLSX_LIMITS.maxEntries, "ZIP条目超过1024个上限");
  range(directoryStart, directorySize, eocd, "ZIP目录偏移或长度无效。");
  const directoryEnd = directoryStart + directorySize;
  if (directoryEnd !== eocd) fail("invalid_xlsx", "ZIP目录长度与文件尾记录不一致。");
  let pointer = directoryStart;
  let declaredTotal = 0;
  const entries = new Map();
  for (let index = 0; index < count; index += 1) {
    range(pointer, 46, directoryEnd, "ZIP目录不完整，文件可能已损坏。");
    if (view.getUint32(pointer, true) !== CENTRAL_SIGNATURE) fail("invalid_xlsx", "ZIP目录条目标识损坏。");
    const flags = view.getUint16(pointer + 8, true);
    const method = view.getUint16(pointer + 10, true);
    const compressedSize = view.getUint32(pointer + 20, true);
    const declaredSize = view.getUint32(pointer + 24, true);
    const nameLength = view.getUint16(pointer + 28, true);
    const extraLength = view.getUint16(pointer + 30, true);
    const commentLength = view.getUint16(pointer + 32, true);
    const localOffset = view.getUint32(pointer + 42, true);
    if ([compressedSize, declaredSize, localOffset].includes(0xffffffff)) {
      fail("xlsx_unsupported", "不支持ZIP64格式，请另存为普通XLSX或UTF-8 CSV。");
    }
    if (view.getUint16(pointer + 34, true)) fail("xlsx_unsupported", "不支持分卷ZIP条目。");
    checkFlags(flags, method);
    limit(declaredSize, XLSX_LIMITS.maxEntryBytes, "ZIP单条目声明展开超过16MiB上限");
    declaredTotal += declaredSize;
    limit(declaredTotal, XLSX_LIMITS.maxTotalBytes, "ZIP声明总展开超过32MiB上限");
    range(pointer + 46, nameLength + extraLength + commentLength, directoryEnd, "ZIP目录条目长度无效。");
    checkExtra(view, pointer + 46 + nameLength, extraLength);
    const name = text(bytes.subarray(pointer + 46, pointer + 46 + nameLength));
    if (!name || entries.has(name)) fail("invalid_xlsx", "ZIP条目名称为空或重复，未覆盖原条目。");
    entries.set(name, { flags, method, compressedSize, declaredSize, localOffset });
    pointer += 46 + nameLength + extraLength + commentLength;
  }
  if (pointer !== directoryEnd) fail("invalid_xlsx", "ZIP目录条目数量与长度不一致。");
  const extracted = new Map();
  const budget = { bytes: 0 };
  for (const [name, entry] of entries) {
    const start = entry.localOffset;
    range(start, 30, directoryStart, "ZIP内容头偏移无效或不完整。");
    if (view.getUint32(start, true) !== LOCAL_SIGNATURE) fail("invalid_xlsx", "ZIP内容头标识损坏。");
    const flags = view.getUint16(start + 6, true);
    const method = view.getUint16(start + 8, true);
    const compressedSize = view.getUint32(start + 18, true);
    const declaredSize = view.getUint32(start + 22, true);
    checkFlags(flags, method);
    if (compressedSize === 0xffffffff || declaredSize === 0xffffffff) {
      fail("xlsx_unsupported", "不支持ZIP64格式，请另存为普通XLSX或UTF-8 CSV。");
    }
    if (flags !== entry.flags || method !== entry.method ||
        (compressedSize !== entry.compressedSize && (!(flags & 8) || compressedSize !== 0)) ||
        (declaredSize !== entry.declaredSize && (!(flags & 8) || declaredSize !== 0))) {
      fail("invalid_xlsx", "ZIP内容头与目录声明不一致。");
    }
    const nameLength = view.getUint16(start + 26, true);
    const extraLength = view.getUint16(start + 28, true);
    range(start + 30, nameLength + extraLength, directoryStart, "ZIP内容头长度无效。");
    checkExtra(view, start + 30 + nameLength, extraLength);
    if (text(bytes.subarray(start + 30, start + 30 + nameLength)) !== name) {
      fail("invalid_xlsx", "ZIP内容头名称与目录不一致。");
    }
    const dataStart = start + 30 + nameLength + extraLength;
    range(dataStart, entry.compressedSize, directoryStart, "ZIP条目数据被截断或越过目录。");
    const slice = bytes.subarray(dataStart, dataStart + entry.compressedSize);
    if (entry.method === NO_COMPRESSION) {
      if (entry.compressedSize !== entry.declaredSize) fail("invalid_xlsx", "未压缩ZIP条目的长度声明不一致。");
      outputBudget(0, slice.byteLength, entry.declaredSize, budget);
      extracted.set(name, slice);
    } else extracted.set(name, await inflateRaw(slice, entry.declaredSize, budget));
  }
  return extracted;
}

function boundedCellText(value) {
  limit(value.length, XLSX_LIMITS.maxCellCharacters, "单元格文字超过32768字符上限");
  return value;
}

function textRuns(xml) {
  const parts = [];
  let length = 0;
  for (const match of xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)) {
    const part = decodeXmlEntities(match[1]);
    length += part.length;
    limit(length, XLSX_LIMITS.maxCellCharacters, "单元格文字超过32768字符上限");
    parts.push(part);
  }
  return parts.join("");
}

function sharedStrings(xml) {
  const values = [];
  for (const match of xml.matchAll(/<si(?:\s[^>]*)?>([\s\S]*?)<\/si>/g)) {
    limit(values.length + 1, XLSX_LIMITS.maxSharedStrings, "共享文字超过100000项上限");
    values.push(textRuns(match[1]));
  }
  return values;
}

function cellText(cellXml, type, shared) {
  if (type === "inlineStr") {
    return textRuns(cellXml);
  }
  const value = /<v(?:\s[^>]*)?>([\s\S]*?)<\/v>/.exec(cellXml);
  if (!value) return "";
  if (type === "s") {
    const index = Number.parseInt(value[1], 10);
    return Number.isSafeInteger(index) && index >= 0 && index < shared.length ? shared[index] : "";
  }
  return boundedCellText(decodeXmlEntities(value[1]));
}

// Returns [{name, rows}] where rows[rowIndex][columnIndex] is the displayed
// text of that cell (numbers keep their stored text form). Empty leading rows
// and columns are preserved so that locator refs stay meaningful.
export async function readWorkbookSheets(bytes) {
  const entries = await readZipEntries(bytes);
  const workbookEntry = entries.get("xl/workbook.xml");
  const relsEntry = entries.get("xl/_rels/workbook.xml.rels");
  if (!workbookEntry || !relsEntry) fail("invalid_xlsx", "缺少工作簿定义，不是有效的XLSX文件。");
  const relTargets = new Map();
  for (const match of checkedXml(relsEntry).matchAll(/<Relationship\b[^>]*\/?>/g)) {
    const id = attribute(match[0], "Id");
    const target = attribute(match[0], "Target");
    if (id && target) relTargets.set(id, target.replace(/^\//, ""));
  }
  const shared = sharedStrings(checkedXml(entries.get("xl/sharedStrings.xml")));
  const sheets = [];
  const budget = { rows: 0, cells: 0, characters: 0 };
  for (const match of checkedXml(workbookEntry).matchAll(/<sheet\b[^>]*\/?>/g)) {
    limit(sheets.length + 1, XLSX_LIMITS.maxSheets, "工作表超过1024张上限");
    const name = attribute(match[0], "name") || "工作表";
    const relId = attribute(match[0], "r:id") || attribute(match[0], "id");
    let path = relTargets.get(relId) || "";
    if (path && !path.startsWith("xl/")) path = "xl/" + path;
    const sheetBytes = path ? entries.get(path) : null;
    if (!sheetBytes) { sheets.push({ name, rows: [], missing: true }); continue; }
    const sheetXml = checkedXml(sheetBytes);
    const rows = [];
    for (const rowMatch of sheetXml.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
      const rowNumber = rowNumberOf(attribute("<row " + rowMatch[1], "r"), rows.length + 1);
      limit(rowNumber, XLSX_LIMITS.maxRowsPerSheet, "单表行号超过10000行解析上限");
      if (rows[rowNumber - 1] !== undefined) fail("invalid_xlsx", "XLSX行号重复，未覆盖原数据。");
      const extraRows = Math.max(0, rowNumber - rows.length);
      limit(budget.rows + extraRows, XLSX_LIMITS.maxTotalRows, "工作簿总行数超过100000行上限");
      budget.rows += extraRows;
      const cells = [];
      let fallbackColumn = 0;
      for (const cellMatch of (rowMatch[2] || "").matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const ref = attribute("<c " + cellMatch[1], "r");
        const type = attribute("<c " + cellMatch[1], "t") || "n";
        const columnIndex = columnIndexOf(ref, rowNumber) ?? fallbackColumn;
        limit(columnIndex + 1, XLSX_LIMITS.maxColumnsPerSheet, "单表列号超过1024列解析上限");
        if (Object.hasOwn(cells, columnIndex)) fail("invalid_xlsx", "XLSX单元格位置重复，未覆盖原数据。");
        const extraCells = Math.max(0, columnIndex + 1 - cells.length);
        limit(budget.cells + extraCells, XLSX_LIMITS.maxTotalCells, "工作簿总单元格跨度超过100000格上限");
        const value = cellText(cellMatch[0], type, shared);
        limit(budget.characters + value.length, XLSX_LIMITS.maxTotalTextCharacters, "工作簿展开文字超过16777216字符上限");
        budget.cells += extraCells;
        budget.characters += value.length;
        cells[columnIndex] = value;
        fallbackColumn = columnIndex + 1;
      }
      rows[rowNumber - 1] = cells;
    }
    for (let index = 0; index < rows.length; index += 1) rows[index] ??= [];
    sheets.push({ name, rows });
  }
  return sheets;
}
