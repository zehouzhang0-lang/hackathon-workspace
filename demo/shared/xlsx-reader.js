// Bounded, dependency-free XLSX (OOXML) reader used by the intake page.
// It reads saved cell text only. Formulas, macros, links and embedded content
// are never executed, and malformed input is rejected without partial output.

export const XLSX_LIMITS = Object.freeze({
  maxEntries: 1024,
  maxEntryBytes: 16 * 1024 * 1024,
  maxTotalBytes: 32 * 1024 * 1024,
  maxSheets: 64,
  maxRowsPerSheet: 10000,
  maxTotalRows: 100000,
  maxColumnsPerSheet: 1024,
  maxTotalCells: 100000,
  maxCellCharacters: 32768,
  maxSharedStrings: 10000,
  maxExpandedTextCharacters: 16 * 1024 * 1024,
});

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;
const NO_COMPRESSION = 0;
const DEFLATE = 8;
const decoder = new TextDecoder('utf-8', { fatal: true });

function fail(code, message) {
  throw Object.assign(new Error(message), { code });
}

function bytesView(bytes) {
  if (!(bytes instanceof Uint8Array)) fail('invalid_xlsx', 'XLSX内容必须是字节数据。');
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

function u16(view, offset) {
  if (offset < 0 || offset + 2 > view.byteLength) fail('invalid_xlsx', 'ZIP字段超出文件边界。');
  return view.getUint16(offset, true);
}

function u32(view, offset) {
  if (offset < 0 || offset + 4 > view.byteLength) fail('invalid_xlsx', 'ZIP字段超出文件边界。');
  return view.getUint32(offset, true);
}

function decodeBytes(bytes, description = 'ZIP文件名') {
  try { return decoder.decode(bytes); }
  catch { fail('invalid_xlsx', description + '不是有效UTF-8文字。'); }
}

function validateExtra(view, start, length) {
  if (!length) return;
  const end = start + length;
  if (start < 0 || end > view.byteLength) fail('invalid_xlsx', 'ZIP扩展字段超出文件边界。');
  let pointer = start;
  while (pointer < end) {
    if (pointer + 4 > end) fail('invalid_xlsx', 'ZIP扩展字段长度损坏。');
    const size = u16(view, pointer + 2);
    pointer += 4;
    if (pointer + size > end) fail('invalid_xlsx', 'ZIP扩展字段声明长度损坏。');
    pointer += size;
  }
  fail('xlsx_unsupported', '这份XLSX包含当前不读取的ZIP扩展字段；请另存为标准XLSX后重试。');
}

async function inflateRawBounded(compressed, declaredSize) {
  if (typeof DecompressionStream !== 'function' || typeof Blob === 'undefined') {
    fail('xlsx_unsupported', '当前浏览器不支持XLSX解压；可导出UTF-8 CSV后重新上传。');
  }
  let reader;
  try {
    const transform = new DecompressionStream('deflate-raw');
    reader = new Blob([compressed]).stream().pipeThrough(transform).getReader();
  } catch {
    fail('xlsx_unsupported', '当前浏览器不能建立安全的XLSX解压流；可导出UTF-8 CSV后重试。');
  }
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      const chunk = value instanceof Uint8Array ? value : new Uint8Array(value);
      total += chunk.byteLength;
      if (total > XLSX_LIMITS.maxEntryBytes) {
        await reader.cancel().catch(() => {});
        fail('xlsx_limit_exceeded', 'XLSX单项实际展开超过16MiB安全上限，原件未解析。');
      }
      if (total > declaredSize) {
        await reader.cancel().catch(() => {});
        fail('invalid_xlsx', 'ZIP内容实际展开长度超过声明值，文件可能已损坏。');
      }
      chunks.push(chunk);
    }
  } catch (error) {
    if (['invalid_xlsx', 'xlsx_limit_exceeded', 'xlsx_unsupported'].includes(error?.code)) throw error;
    await reader?.cancel().catch(() => {});
    fail('invalid_xlsx', 'ZIP压缩内容损坏或长度不正确。');
  }
  if (total !== declaredSize) fail('invalid_xlsx', 'ZIP内容实际展开长度与目录声明长度不一致。');
  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.byteLength; }
  return output;
}

function findEnd(bytes, view) {
  if (bytes.byteLength < 22) fail('invalid_xlsx', '文件太小，不是有效的XLSX容器。');
  const floor = Math.max(0, bytes.byteLength - 22 - 0xffff);
  for (let offset = bytes.byteLength - 22; offset >= floor; offset -= 1) {
    if (u32(view, offset) !== EOCD_SIGNATURE) continue;
    const commentLength = u16(view, offset + 20);
    if (offset + 22 + commentLength === bytes.byteLength) return offset;
  }
  fail('invalid_xlsx', '没有找到完整ZIP目录，文件可能已损坏。');
}

// Reads a validated ZIP central directory and returns exact uncompressed bytes.
export async function readZipEntries(bytes) {
  const view = bytesView(bytes);
  const endOffset = findEnd(bytes, view);
  const disk = u16(view, endOffset + 4);
  const centralDisk = u16(view, endOffset + 6);
  const diskEntries = u16(view, endOffset + 8);
  const count = u16(view, endOffset + 10);
  const centralSize = u32(view, endOffset + 12);
  const centralOffset = u32(view, endOffset + 16);
  if (disk || centralDisk) fail('xlsx_unsupported', '不支持分卷ZIP格式的XLSX。');
  if (count === 0xffff || diskEntries === 0xffff || centralSize === 0xffffffff || centralOffset === 0xffffffff) {
    fail('xlsx_unsupported', '不支持ZIP64格式的XLSX。');
  }
  if (count > XLSX_LIMITS.maxEntries) fail('xlsx_limit_exceeded', 'XLSX内文件项超过1024项安全上限。');
  if (diskEntries !== count) fail('invalid_xlsx', 'ZIP目录项计数不一致。');
  if (centralOffset + centralSize !== endOffset || centralOffset > endOffset) {
    fail('invalid_xlsx', 'ZIP目录偏移或长度不一致。');
  }

  const directory = [];
  const names = new Set();
  let pointer = centralOffset;
  let declaredTotal = 0;
  for (let index = 0; index < count; index += 1) {
    if (pointer + 46 > endOffset || u32(view, pointer) !== CENTRAL_SIGNATURE) {
      fail('invalid_xlsx', 'ZIP中央目录不完整或签名损坏。');
    }
    const flags = u16(view, pointer + 8);
    const method = u16(view, pointer + 10);
    const compressedSize = u32(view, pointer + 20);
    const uncompressedSize = u32(view, pointer + 24);
    const nameLength = u16(view, pointer + 28);
    const extraLength = u16(view, pointer + 30);
    const commentLength = u16(view, pointer + 32);
    const diskStart = u16(view, pointer + 34);
    const localOffset = u32(view, pointer + 42);
    if ([compressedSize, uncompressedSize, localOffset].includes(0xffffffff)) {
      fail('xlsx_unsupported', '不支持ZIP64格式的XLSX。');
    }
    if (diskStart) fail('xlsx_unsupported', '不支持分卷ZIP格式的XLSX。');
    if (flags & (0x0001 | 0x0040 | 0x2000)) fail('xlsx_unsupported', '不读取加密的XLSX内容。');
    if (![NO_COMPRESSION, DEFLATE].includes(method)) fail('xlsx_unsupported', 'XLSX使用了不支持的压缩方式。');
    if (uncompressedSize > XLSX_LIMITS.maxEntryBytes) {
      fail('xlsx_limit_exceeded', 'XLSX单项声明展开超过16MiB安全上限。');
    }
    declaredTotal += uncompressedSize;
    if (declaredTotal > XLSX_LIMITS.maxTotalBytes) {
      fail('xlsx_limit_exceeded', 'XLSX总声明展开超过32MiB安全上限。');
    }
    const recordEnd = pointer + 46 + nameLength + extraLength + commentLength;
    if (recordEnd > endOffset) fail('invalid_xlsx', 'ZIP目录字段超出目录边界。');
    const nameStart = pointer + 46;
    const name = decodeBytes(bytes.subarray(nameStart, nameStart + nameLength));
    if (!name || names.has(name)) fail('invalid_xlsx', name ? 'ZIP目录含重复文件名。' : 'ZIP目录含空文件名。');
    names.add(name);
    validateExtra(view, nameStart + nameLength, extraLength);
    directory.push({ name, flags, method, compressedSize, uncompressedSize, localOffset });
    pointer = recordEnd;
  }
  if (pointer !== endOffset) fail('invalid_xlsx', 'ZIP目录项数量与目录长度不一致。');

  const spans = [];
  const extracted = new Map();
  for (const entry of directory) {
    const start = entry.localOffset;
    if (start + 30 > centralOffset || u32(view, start) !== LOCAL_SIGNATURE) {
      fail('invalid_xlsx', 'ZIP本地内容头不完整或偏移损坏。');
    }
    const localFlags = u16(view, start + 6);
    const localMethod = u16(view, start + 8);
    const localCompressed = u32(view, start + 18);
    const localUncompressed = u32(view, start + 22);
    const nameLength = u16(view, start + 26);
    const extraLength = u16(view, start + 28);
    if (localFlags !== entry.flags || localMethod !== entry.method) fail('invalid_xlsx', 'ZIP本地头与目录元数据不一致。');
    if (!(entry.flags & 0x0008) && (localCompressed !== entry.compressedSize || localUncompressed !== entry.uncompressedSize)) {
      fail('invalid_xlsx', 'ZIP本地头长度与目录声明长度不一致。');
    }
    if ([localCompressed, localUncompressed].includes(0xffffffff)) fail('xlsx_unsupported', '不支持ZIP64格式的XLSX。');
    const nameStart = start + 30;
    const dataStart = nameStart + nameLength + extraLength;
    const dataEnd = dataStart + entry.compressedSize;
    if (dataStart < nameStart || dataEnd < dataStart || dataEnd > centralOffset) {
      fail('invalid_xlsx', 'ZIP本地内容范围超出文件边界。');
    }
    const localName = decodeBytes(bytes.subarray(nameStart, nameStart + nameLength));
    if (localName !== entry.name) fail('invalid_xlsx', 'ZIP本地文件名与目录不一致。');
    validateExtra(view, nameStart + nameLength, extraLength);
    spans.push([start, dataEnd]);
    const compressed = bytes.subarray(dataStart, dataEnd);
    if (entry.method === NO_COMPRESSION) {
      if (entry.compressedSize !== entry.uncompressedSize) fail('invalid_xlsx', 'ZIP存储项长度与声明长度不一致。');
      extracted.set(entry.name, compressed.slice());
    } else {
      extracted.set(entry.name, await inflateRawBounded(compressed, entry.uncompressedSize));
    }
  }
  spans.sort((a, b) => a[0] - b[0]);
  for (let index = 1; index < spans.length; index += 1) {
    if (spans[index][0] < spans[index - 1][1]) fail('invalid_xlsx', 'ZIP本地内容范围互相重叠。');
  }
  return extracted;
}

function decodeXmlEntities(value) {
  try {
    return value
      .replace(/&#x([0-9a-fA-F]+);/g, (_, raw) => {
        const code = Number.parseInt(raw, 16);
        if (!Number.isSafeInteger(code) || code <= 0 || code > 0x10ffff || code >= 0xd800 && code <= 0xdfff) throw new Error();
        return String.fromCodePoint(code);
      })
      .replace(/&#(\d+);/g, (_, raw) => {
        const code = Number(raw);
        if (!Number.isSafeInteger(code) || code <= 0 || code > 0x10ffff || code >= 0xd800 && code <= 0xdfff) throw new Error();
        return String.fromCodePoint(code);
      })
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'").replace(/&amp;/g, '&');
  } catch { fail('invalid_xlsx', 'XLSX文字编码含无效XML字符。'); }
}

function attribute(tag, name) {
  const match = new RegExp('\\b' + name.replace(':', '\\:') + '="([^"]*)"').exec(tag);
  return match ? decodeXmlEntities(match[1]) : null;
}

function elements(xml, tag) {
  const rawOpen = [...xml.matchAll(new RegExp('<' + tag + '(?=[\\s/>])', 'g'))].length;
  const rawClose = [...xml.matchAll(new RegExp('</' + tag + '(?=[\\s>])', 'g'))].length;
  const tokenPattern = new RegExp('</?' + tag + '(?=[\\s/>])[^>]*>', 'g');
  const tokens = [...xml.matchAll(tokenPattern)];
  let parsedOpen = 0, parsedClose = 0, current = null;
  const result = [];
  for (const token of tokens) {
    const source = token[0];
    const closing = source.startsWith('</');
    const selfClosing = !closing && /\/\s*>$/.test(source);
    if (closing) {
      parsedClose += 1;
      if (!current) fail('invalid_xlsx', 'XLSX XML结构损坏或闭合标签多余。');
      result.push({ tag: current.tag, body: xml.slice(current.bodyStart, token.index), selfClosing: false });
      current = null;
    } else {
      parsedOpen += 1;
      if (current) fail('invalid_xlsx', 'XLSX XML出现不支持的同类标签嵌套。');
      if (selfClosing) result.push({ tag: source, body: '', selfClosing: true });
      else current = { tag: source, bodyStart: token.index + source.length };
    }
  }
  if (current || parsedOpen !== rawOpen || parsedClose !== rawClose) {
    fail('invalid_xlsx', 'XLSX XML结构损坏或标签未完整闭合。');
  }
  return result;
}

function xmlText(bytes, description) {
  try { return decoder.decode(bytes ?? new Uint8Array()); }
  catch { fail('invalid_xlsx', description + '不是有效UTF-8 XML。'); }
}

function limitedText(parts) {
  const value = parts.map((part) => decodeXmlEntities(part)).join('');
  if (value.length > XLSX_LIMITS.maxCellCharacters) {
    fail('xlsx_limit_exceeded', '单元格文字超过32768字符安全上限。');
  }
  return value;
}

function textRuns(xml) {
  return elements(xml, 't').map((entry) => entry.body);
}

function sharedStrings(xml) {
  const items = elements(xml, 'si');
  if (items.length > XLSX_LIMITS.maxSharedStrings) {
    fail('xlsx_limit_exceeded', 'XLSX共享文字数量超过安全上限。');
  }
  return items.map((item) => limitedText(textRuns(item.body)));
}

function positiveInteger(raw, description) {
  if (!/^[1-9]\d*$/.test(raw ?? '')) fail('invalid_xlsx', description + '不是正整数。');
  const value = Number(raw);
  if (!Number.isSafeInteger(value)) fail('xlsx_limit_exceeded', description + '超过安全整数范围。');
  return value;
}

function parseCellReference(raw) {
  const match = /^([A-Z]+)([1-9]\d*)$/.exec(raw ?? '');
  if (!match) fail('invalid_xlsx', '单元格坐标格式不正确。');
  let column = 0;
  for (const letter of match[1]) {
    column = column * 26 + letter.charCodeAt(0) - 64;
    if (column > XLSX_LIMITS.maxColumnsPerSheet) fail('xlsx_limit_exceeded', '工作表超过1024列解析上限。');
  }
  const row = positiveInteger(match[2], '单元格行号');
  if (row > XLSX_LIMITS.maxRowsPerSheet) fail('xlsx_limit_exceeded', '工作表超过10000行解析上限。');
  return { column: column - 1, row };
}

function oneValue(xml) {
  const values = elements(xml, 'v');
  if (values.length > 1) fail('invalid_xlsx', '单元格包含重复的保存值。');
  return values[0]?.body ?? null;
}

function cellText(cellXml, type, shared) {
  if (type === 'inlineStr') return limitedText(textRuns(cellXml));
  const raw = oneValue(cellXml);
  if (raw === null) return '';
  const decoded = limitedText([raw]);
  if (type === 's') {
    if (!/^(?:0|[1-9]\d*)$/.test(decoded)) fail('invalid_xlsx', '共享文字索引不正确。');
    const index = Number(decoded);
    if (!Number.isSafeInteger(index) || index >= shared.length) fail('invalid_xlsx', '共享文字索引超出范围。');
    return shared[index];
  }
  return decoded;
}

function relationshipPath(target) {
  if (typeof target !== 'string' || !target || target.includes('\\') || target.split('/').includes('..') || /^[a-z]+:/i.test(target)) {
    fail('invalid_xlsx', '工作表关系路径不安全。');
  }
  const clean = target.replace(/^\/+/, '');
  return clean.startsWith('xl/') ? clean : 'xl/' + clean.replace(/^\.\//, '');
}

// Returns [{name, rows}] while preserving sparse source coordinates.
export async function readWorkbookSheets(bytes) {
  const entries = await readZipEntries(bytes);
  const workbookEntry = entries.get('xl/workbook.xml');
  const relsEntry = entries.get('xl/_rels/workbook.xml.rels');
  if (!workbookEntry || !relsEntry) fail('invalid_xlsx', '缺少工作簿定义，不是有效的XLSX文件。');
  const workbookXml = xmlText(workbookEntry, '工作簿定义');
  const relsXml = xmlText(relsEntry, '工作表关系');
  const sheetTags = elements(workbookXml, 'sheet');
  if (sheetTags.length > XLSX_LIMITS.maxSheets) fail('xlsx_limit_exceeded', 'XLSX工作表数量超过安全上限。');

  const relTargets = new Map();
  for (const relation of elements(relsXml, 'Relationship')) {
    const id = attribute(relation.tag, 'Id');
    const target = attribute(relation.tag, 'Target');
    if (!id || !target || relTargets.has(id)) fail('invalid_xlsx', '工作表关系标识缺失或重复。');
    relTargets.set(id, relationshipPath(target));
  }
  const shared = sharedStrings(xmlText(entries.get('xl/sharedStrings.xml'), '共享文字表'));
  const sheets = [];
  let totalRows = 0, totalCells = 0, expandedText = 0;
  for (const sheetTag of sheetTags) {
    const name = attribute(sheetTag.tag, 'name') || '工作表';
    const relId = attribute(sheetTag.tag, 'r:id') || attribute(sheetTag.tag, 'id');
    const path = relTargets.get(relId);
    const sheetBytes = path ? entries.get(path) : null;
    if (!sheetBytes) { sheets.push({ name, rows: [], missing: true }); continue; }
    const sheetXml = xmlText(sheetBytes, '工作表');
    const rowTags = elements(sheetXml, 'row');
    const savedRows = new Map();
    let previousRow = 0, maximumRow = 0;
    for (const rowTag of rowTags) {
      const rawRow = attribute(rowTag.tag, 'r');
      const rowNumber = rawRow === null ? previousRow + 1 : positiveInteger(rawRow, '工作表行号');
      if (rowNumber <= previousRow) fail('invalid_xlsx', '工作表行号重复或顺序不正确。');
      if (rowNumber > XLSX_LIMITS.maxRowsPerSheet) fail('xlsx_limit_exceeded', '工作表超过10000行解析上限。');
      previousRow = rowNumber;
      maximumRow = rowNumber;
      const cells = [];
      let fallbackColumn = 0;
      for (const cell of elements(rowTag.body, 'c')) {
        const ref = attribute(cell.tag, 'r');
        let column = fallbackColumn;
        if (ref !== null) {
          const parsed = parseCellReference(ref);
          if (parsed.row !== rowNumber) fail('invalid_xlsx', '单元格坐标与所在行号不一致。');
          column = parsed.column;
        }
        if (column < fallbackColumn) fail('invalid_xlsx', '单元格坐标重复或顺序不正确。');
        if (column >= XLSX_LIMITS.maxColumnsPerSheet) fail('xlsx_limit_exceeded', '工作表超过1024列解析上限。');
        const type = attribute(cell.tag, 't') || 'n';
        const value = cellText(cell.body, type, shared);
        expandedText += value.length;
        if (expandedText > XLSX_LIMITS.maxExpandedTextCharacters) {
          fail('xlsx_limit_exceeded', '工作簿展开文字超过16MiB字符预算。');
        }
        cells[column] = value;
        fallbackColumn = column + 1;
      }
      totalCells += cells.length;
      if (totalCells > XLSX_LIMITS.maxTotalCells) fail('xlsx_limit_exceeded', '工作簿展开网格超过100000格安全上限。');
      savedRows.set(rowNumber - 1, cells);
    }
    totalRows += maximumRow;
    if (totalRows > XLSX_LIMITS.maxTotalRows) fail('xlsx_limit_exceeded', '工作簿总行数超过100000行安全上限。');
    const rows = Array.from({ length: maximumRow }, () => []);
    for (const [index, cells] of savedRows) rows[index] = cells;
    sheets.push({ name, rows });
  }
  return sheets;
}
