// Minimal, dependency-free XLSX (OOXML) reader for local material parsing.
// Reads only what is needed to show a grid: workbook sheet names, the shared
// string table and cached cell values. Styles are not resolved; formulas are
// never evaluated — only their cached result values are read. No macro,
// external link or embedded content is executed, and nothing is sent anywhere.

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const NO_COMPRESSION = 0;
const DEFLATE = 8;

function fail(code, message) {
  throw Object.assign(new Error(message), { code });
}

function decodeXmlEntities(text) {
  return text
    .replace(/&#x([0-9a-fA-F]+);/g, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(parseInt(code, 10)))
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

function columnIndexOf(ref) {
  const letters = /^([A-Z]+)/.exec(ref || "");
  if (!letters) return null;
  let index = 0;
  for (const letter of letters[1]) index = index * 26 + (letter.charCodeAt(0) - 64);
  return index - 1;
}

async function inflateRaw(bytes) {
  if (typeof DecompressionStream !== "function" || typeof Blob === "undefined" || typeof Response === "undefined") {
    fail("xlsx_unsupported", "当前浏览器不支持XLSX解压；可在原应用中导出UTF-8 CSV后重新上传。");
  }
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

// Reads a ZIP central directory only; file data offsets come from the central
// records, so entries with data descriptors are read correctly.
export async function readZipEntries(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length < 22) fail("invalid_xlsx", "文件太小，不是有效的XLSX容器。");
  let eocd = -1;
  for (let i = bytes.length - 22; i >= 0; i -= 1) {
    if (bytes[i] === 0x50 && bytes[i + 1] === 0x4b && bytes[i + 2] === 0x05 && bytes[i + 3] === 0x06) { eocd = i; break; }
  }
  if (eocd < 0) fail("invalid_xlsx", "没有找到ZIP目录，文件可能已损坏，原件未受影响。");
  const count = bytes[eocd + 10] | (bytes[eocd + 11] << 8);
  let pointer = bytes[eocd + 16] | (bytes[eocd + 17] << 8) | (bytes[eocd + 18] << 16) | (bytes[eocd + 19] << 24);
  const entries = new Map();
  for (let index = 0; index < count; index += 1) {
    if (pointer + 46 > bytes.length) fail("invalid_xlsx", "ZIP目录不完整，文件可能已损坏。");
    if (bytes[pointer] !== 0x50 || bytes[pointer + 1] !== 0x4b || bytes[pointer + 2] !== 0x01 || bytes[pointer + 3] !== 0x02) break;
    const method = bytes[pointer + 10] | (bytes[pointer + 11] << 8);
    const compressedSize = bytes[pointer + 20] | (bytes[pointer + 21] << 8) | (bytes[pointer + 22] << 16) | (bytes[pointer + 23] << 24);
    const nameLength = bytes[pointer + 28] | (bytes[pointer + 29] << 8);
    const extraLength = bytes[pointer + 30] | (bytes[pointer + 31] << 8);
    const commentLength = bytes[pointer + 32] | (bytes[pointer + 33] << 8);
    const localOffset = bytes[pointer + 42] | (bytes[pointer + 43] << 8) | (bytes[pointer + 44] << 16) | (bytes[pointer + 45] << 24);
    const name = new TextDecoder().decode(bytes.subarray(pointer + 46, pointer + 46 + nameLength));
    entries.set(name, { method, compressedSize, localOffset });
    pointer += 46 + nameLength + extraLength + commentLength;
  }
  const extracted = new Map();
  for (const [name, entry] of entries) {
    const start = entry.localOffset;
    if (start + 30 > bytes.length || bytes[start] !== 0x50 || bytes[start + 1] !== 0x4b || bytes[start + 2] !== 0x03 || bytes[start + 3] !== 0x04) {
      fail("invalid_xlsx", "ZIP内容头不完整，文件可能已损坏。");
    }
    const nameLength = bytes[start + 26] | (bytes[start + 27] << 8);
    const extraLength = bytes[start + 28] | (bytes[start + 29] << 8);
    const dataStart = start + 30 + nameLength + extraLength;
    const slice = bytes.subarray(dataStart, dataStart + entry.compressedSize);
    if (entry.method === NO_COMPRESSION) extracted.set(name, slice);
    else if (entry.method === DEFLATE) extracted.set(name, await inflateRaw(slice));
    else fail("invalid_xlsx", "这份XLSX使用了不支持的压缩方式，请用Excel/WPS另存后重试。");
  }
  return extracted;
}

function sharedStrings(xml) {
  const values = [];
  for (const match of xml.matchAll(/<si(?:\s[^>]*)?>([\s\S]*?)<\/si>/g)) {
    values.push([...match[1].matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)]
      .map((part) => decodeXmlEntities(part[1])).join(""));
  }
  return values;
}

function cellText(cellXml, type, shared) {
  if (type === "inlineStr") {
    return [...cellXml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)]
      .map((part) => decodeXmlEntities(part[1])).join("");
  }
  const value = /<v(?:\s[^>]*)?>([\s\S]*?)<\/v>/.exec(cellXml);
  if (!value) return "";
  if (type === "s") {
    const index = Number.parseInt(value[1], 10);
    return Number.isSafeInteger(index) && index >= 0 && index < shared.length ? shared[index] : "";
  }
  return decodeXmlEntities(value[1]);
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
  for (const match of text(relsEntry).matchAll(/<Relationship\b[^>]*\/?>/g)) {
    const id = attribute(match[0], "Id");
    const target = attribute(match[0], "Target");
    if (id && target) relTargets.set(id, target.replace(/^\//, ""));
  }
  const shared = sharedStrings(text(entries.get("xl/sharedStrings.xml")));
  const sheets = [];
  for (const match of text(workbookEntry).matchAll(/<sheet\b[^>]*\/?>/g)) {
    const name = attribute(match[0], "name") || "工作表";
    const relId = attribute(match[0], "r:id") || attribute(match[0], "id");
    let path = relTargets.get(relId) || "";
    if (path && !path.startsWith("xl/")) path = "xl/" + path;
    const sheetBytes = path ? entries.get(path) : null;
    if (!sheetBytes) { sheets.push({ name, rows: [], missing: true }); continue; }
    const sheetXml = text(sheetBytes);
    const rows = [];
    for (const rowMatch of sheetXml.matchAll(/<row\b[^>]*?>([\s\S]*?)<\/row>/g)) {
      const rowNumber = Number.parseInt(attribute(rowMatch[0].slice(0, 200), "r") || "", 10);
      const cells = [];
      let fallbackColumn = 0;
      for (const cellMatch of rowMatch[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const ref = attribute("<c " + cellMatch[1], "r");
        const type = attribute("<c " + cellMatch[1], "t") || "n";
        const columnIndex = columnIndexOf(ref) ?? fallbackColumn;
        cells[columnIndex] = cellText(cellMatch[0], type, shared);
        fallbackColumn = columnIndex + 1;
      }
      rows[(Number.isSafeInteger(rowNumber) && rowNumber > 0 ? rowNumber : rows.length + 1) - 1] = cells;
    }
    for (let index = 0; index < rows.length; index += 1) rows[index] ??= [];
    sheets.push({ name, rows });
  }
  return sheets;
}
