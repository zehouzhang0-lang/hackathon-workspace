// Resource and corrupt-container regressions use small, synthetic byte arrays.
// No real merchant files, network, disk fixtures, or large decompression bombs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { deflateRawSync } from 'node:zlib';
import { readZipEntries, readWorkbookSheets, XLSX_LIMITS } from '../shared/xlsx-reader.js';
import { parseWorkbookFacts } from '../shared/table-facts.js';

function zip(entries, { comment = '' } = {}) {
  const localChunks = [], centralChunks = [], records = [];
  let offset = 0, centralLength = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name);
    const raw = Buffer.from(entry.raw ?? 'x');
    const method = entry.method ?? 0;
    const compressed = entry.compressed ?? (method === 8 ? deflateRawSync(raw) : raw);
    const declaredSize = entry.declaredSize ?? raw.length;
    const compressedSize = entry.compressedSize ?? compressed.length;
    const flags = entry.flags ?? (entry.descriptor ? 8 : 0);
    const localExtra = entry.localExtra ?? Buffer.alloc(0);
    const centralExtra = entry.centralExtra ?? Buffer.alloc(0);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(flags, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(entry.descriptor ? 0 : compressedSize, 18);
    local.writeUInt32LE(entry.descriptor ? 0 : declaredSize, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(localExtra.length, 28);
    const descriptor = Buffer.alloc(entry.descriptor ? 16 : 0);
    if (entry.descriptor) {
      descriptor.writeUInt32LE(0x08074b50, 0);
      descriptor.writeUInt32LE(compressedSize, 8);
      descriptor.writeUInt32LE(declaredSize, 12);
    }
    localChunks.push(local, name, localExtra, compressed, descriptor);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(flags, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(compressedSize, 20);
    central.writeUInt32LE(declaredSize, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(centralExtra.length, 30);
    central.writeUInt32LE(offset, 42);
    centralChunks.push(central, name, centralExtra);
    records.push({ local: offset, central: centralLength, data: offset + 30 + name.length + localExtra.length });
    offset += local.length + name.length + localExtra.length + compressed.length + descriptor.length;
    centralLength += central.length + name.length + centralExtra.length;
  }
  const commentBytes = Buffer.from(comment);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralLength, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(commentBytes.length, 20);
  records.forEach((record) => { record.central += offset; });
  return {
    bytes: Buffer.concat([...localChunks, ...centralChunks, end, commentBytes]),
    central: offset, end: offset + centralLength, records
  };
}

function workbook(sheets, { shared = '', method = 0 } = {}) {
  const entries = [
    { name: 'xl/workbook.xml', raw: '<workbook><sheets>' + sheets.map((_, index) =>
      '<sheet name="合成表' + (index + 1) + '" r:id="rId' + index + '"/>').join('') + '</sheets></workbook>' },
    { name: 'xl/_rels/workbook.xml.rels', raw: '<Relationships>' + sheets.map((_, index) =>
      '<Relationship Id="rId' + index + '" Target="worksheets/sheet' + index + '.xml"/>').join('') + '</Relationships>' },
    ...sheets.map((xml, index) => ({ name: 'xl/worksheets/sheet' + index + '.xml', raw: '<worksheet>' + xml + '</worksheet>' }))
  ];
  if (shared) entries.push({ name: 'xl/sharedStrings.xml', raw: '<sst>' + shared + '</sst>' });
  return zip(entries.map((entry) => ({ ...entry, method }))).bytes;
}

function column(number) {
  let label = '';
  while (number) {
    const rest = (number - 1) % 26;
    label = String.fromCharCode(65 + rest) + label;
    number = Math.floor((number - 1) / 26);
  }
  return label;
}

const typed = (code, message = /./) => (error) => {
  assert.equal(error.code, code, error.message);
  assert.match(error.message, message);
  assert.notEqual(error.name, 'RangeError');
  return true;
};

test('store, deflate and data descriptors retain exact bytes in a nonzero-offset view', async () => {
  const fixture = zip([
    { name: 'stored', raw: '保留原值' },
    { name: 'deflated', raw: 'cached 42', method: 8 },
    { name: 'descriptor', raw: 'streamed 17', method: 8, descriptor: true }
  ], { comment: 'synthetic comment' });
  const backing = Buffer.concat([Buffer.alloc(7), fixture.bytes, Buffer.alloc(9)]);
  const bytes = backing.subarray(7, backing.length - 9);
  const before = Buffer.from(bytes);
  const entries = await readZipEntries(bytes);
  assert.deepEqual([...entries.keys()], ['stored', 'deflated', 'descriptor']);
  assert.equal(new TextDecoder().decode(entries.get('stored')), '保留原值');
  assert.equal(new TextDecoder().decode(entries.get('deflated')), 'cached 42');
  assert.equal(new TextDecoder().decode(entries.get('descriptor')), 'streamed 17');
  assert.deepEqual(bytes, before);
});

test('workbook values keep cached formulas, rich text, shared strings and sparse locators', async () => {
  const bytes = workbook([
    '<row r="2"><c r="B2" t="s"><v>0</v></c>' +
    '<c r="C2"><f>1+1</f><v>2</v></c>' +
    '<c r="D2" t="inlineStr"><is><r><t>原文&amp;</t></r><r><t>&#x4E2D;&#25991;</t></r></is></c></row>'
  ], { shared: '<si><t>共享文字</t></si>', method: 8 });
  const sheets = await readWorkbookSheets(bytes);
  assert.equal(sheets[0].name, '合成表1');
  assert.deepEqual(sheets[0].rows[0], []);
  assert.equal(sheets[0].rows[1][0], undefined);
  assert.deepEqual(sheets[0].rows[1].slice(1), ['共享文字', '2', '原文&中文']);
});

test('declared per-entry and total expansion bounds reject before starting decompression', async (context) => {
  let starts = 0;
  context.mock.method(globalThis, 'DecompressionStream', function () {
    starts += 1;
    throw new Error('decompression must not start');
  });
  const tooLarge = zip([{ name: 'huge', method: 8, declaredSize: XLSX_LIMITS.maxEntryBytes + 1 }]);
  await assert.rejects(readZipEntries(tooLarge.bytes), typed('xlsx_limit_exceeded', /16MiB/));
  const tooManyBytes = zip([
    { name: 'one', method: 8, declaredSize: XLSX_LIMITS.maxEntryBytes },
    { name: 'two', method: 8, declaredSize: XLSX_LIMITS.maxEntryBytes },
    { name: 'three', method: 8, declaredSize: 1 }
  ]);
  await assert.rejects(readZipEntries(tooManyBytes.bytes), typed('xlsx_limit_exceeded', /32MiB/));
  assert.equal(starts, 0);
});

test('forged small declarations stop and cancel the output stream before retaining excess chunks', async (context) => {
  let pulls = 0, cancelled = false;
  context.mock.method(globalThis, 'DecompressionStream', function () {
    return {
      readable: new ReadableStream({
        pull(controller) { pulls += 1; controller.enqueue(new Uint8Array(8)); },
        cancel() { cancelled = true; }
      }),
      writable: new WritableStream()
    };
  });
  const bytes = zip([{ name: 'forged', method: 8, raw: '12345678' }]).bytes;
  await assert.rejects(readZipEntries(bytes), typed('invalid_xlsx', /超过声明值/));
  assert.equal(cancelled, true);
  assert(pulls <= 3, 'reader must stop after the first over-budget chunk, including stream prefetch');
});

test('actual output also enforces the entry byte cap without trusting a maximum-sized declaration', async (context) => {
  let pulls = 0, cancelled = false;
  // Reuse one 64KiB allocation; retained chunk references remain tiny and the
  // reader must fail before allocating a combined output buffer.
  const chunk = new Uint8Array(64 * 1024);
  context.mock.method(globalThis, 'DecompressionStream', function () {
    return {
      readable: new ReadableStream({
        pull(controller) { pulls += 1; controller.enqueue(chunk); },
        cancel() { cancelled = true; }
      }),
      writable: new WritableStream()
    };
  });
  const bytes = zip([{ name: 'forged', method: 8, declaredSize: XLSX_LIMITS.maxEntryBytes }]).bytes;
  await assert.rejects(readZipEntries(bytes), typed('xlsx_limit_exceeded', /实际展开超过16MiB/));
  assert.equal(cancelled, true);
  assert(pulls <= XLSX_LIMITS.maxEntryBytes / chunk.length + 2);
});

test('actual deflate lengths must match both smaller and larger declarations', async () => {
  for (const declaredSize of [1, 17]) {
    const fixture = zip([{ name: 'payload', raw: '12345678', method: 8, declaredSize }]);
    await assert.rejects(readZipEntries(fixture.bytes), typed('invalid_xlsx', /长度/));
  }
  const corrupt = zip([{ name: 'payload', raw: 'cached', method: 8, compressed: Buffer.from([255, 255]) }]);
  await assert.rejects(readZipEntries(corrupt.bytes), typed('invalid_xlsx', /损坏/));
});

test('stored entries cannot use inconsistent lengths to bypass expansion accounting', async () => {
  const fixture = zip([{ name: 'stored', raw: '1234', declaredSize: 1 }]);
  await assert.rejects(readZipEntries(fixture.bytes), typed('invalid_xlsx', /长度/));
});

test('entry count and unsupported ZIP64, encrypted or split containers fail explicitly', async () => {
  const excess = zip([{ name: 'one' }]);
  excess.bytes.writeUInt16LE(XLSX_LIMITS.maxEntries + 1, excess.end + 8);
  excess.bytes.writeUInt16LE(XLSX_LIMITS.maxEntries + 1, excess.end + 10);
  await assert.rejects(readZipEntries(excess.bytes), typed('xlsx_limit_exceeded', /1024/));
  for (const change of [
    (f) => { f.bytes.writeUInt16LE(0xffff, f.end + 10); },
    (f) => { f.bytes.writeUInt32LE(0xffffffff, f.end + 16); },
    (f) => { f.bytes.writeUInt32LE(0xffffffff, f.records[0].central + 24); },
    (f) => { f.bytes.writeUInt16LE(1, f.end + 4); }
  ]) {
    const fixture = zip([{ name: 'one' }]);
    change(fixture);
    await assert.rejects(readZipEntries(fixture.bytes), typed('xlsx_unsupported'));
  }
  for (const entry of [
    { flags: 1 }, { flags: 0x40 }, { flags: 0x2000 }, { method: 99 },
    { centralExtra: Buffer.from([1, 0, 0, 0]) },
    { localExtra: Buffer.from([1, 0, 0, 0]) }
  ]) {
    await assert.rejects(readZipEntries(zip([{ name: 'one', ...entry }]).bytes), typed('xlsx_unsupported'));
  }
});

test('corrupt directory offsets, signatures, counts and lengths cannot yield partial results', async () => {
  const changes = [
    (f) => { f.bytes.writeUInt32LE(0xffffff00, f.end + 16); },
    (f) => { f.bytes.writeUInt32LE(0xffffff00, f.end + 12); },
    (f) => { f.bytes.writeUInt32LE(0, f.records[1].central); },
    (f) => { f.bytes.writeUInt16LE(1, f.end + 8); f.bytes.writeUInt16LE(1, f.end + 10); },
    (f) => { f.bytes.writeUInt16LE(3, f.end + 8); f.bytes.writeUInt16LE(3, f.end + 10); },
    (f) => { f.bytes.writeUInt16LE(65535, f.records[1].central + 28); },
    (f) => { f.bytes.writeUInt16LE(1, f.end + 20); }
  ];
  for (const change of changes) {
    const fixture = zip([{ name: 'first' }, { name: 'second' }]);
    change(fixture);
    await assert.rejects(readZipEntries(fixture.bytes), typed('invalid_xlsx'));
  }
  await assert.rejects(readZipEntries(new Uint8Array(21)), typed('invalid_xlsx'));
  await assert.rejects(readZipEntries(zip([{ name: 'same' }, { name: 'same' }]).bytes), typed('invalid_xlsx', /重复/));
});

test('local headers and data ranges are checked against directory metadata', async () => {
  const changes = [
    (f) => { f.bytes.writeUInt32LE(0xffffff00, f.records[0].central + 42); },
    (f) => { f.bytes.writeUInt32LE(0, f.records[0].local); },
    (f) => { f.bytes.writeUInt16LE(8, f.records[0].local + 8); },
    (f) => { f.bytes.writeUInt32LE(2, f.records[0].local + 22); },
    (f) => { f.bytes.writeUInt16LE(65535, f.records[0].local + 28); },
    (f) => { f.bytes[f.records[0].local + 30] = 0; },
    (f) => {
      f.bytes.writeUInt32LE(0xffffff00, f.records[0].central + 20);
      f.bytes.writeUInt32LE(0xffffff00, f.records[0].local + 18);
    }
  ];
  for (const change of changes) {
    const fixture = zip([{ name: 'one' }]);
    change(fixture);
    await assert.rejects(readZipEntries(fixture.bytes), typed('invalid_xlsx'));
  }
  for (const extraField of ['localExtra', 'centralExtra']) {
    await assert.rejects(readZipEntries(zip([{ name: 'one', [extraField]: Buffer.from([2, 0, 4, 0, 1]) }]).bytes),
      typed('invalid_xlsx', /扩展字段/));
  }
});

test('oversized explicit and implicit row or column positions fail before array growth', async () => {
  const edge = column(XLSX_LIMITS.maxColumnsPerSheet);
  const beyond = column(XLSX_LIMITS.maxColumnsPerSheet + 1);
  for (const xml of [
    '<row r="4294967294"><c r="A4294967294"><v>1</v></c></row>',
    '<row r="10001"/>',
    '<row r="10000"/><row/>',
    '<row r="1"><c r="' + beyond + '1"><v>1</v></c></row>',
    '<row r="1"><c r="' + edge + '1"/><c/></row>',
    '<row r="1"><c r="A10001"/></row>'
  ]) {
    await assert.rejects(readWorkbookSheets(workbook([xml])), typed('xlsx_limit_exceeded'));
  }
});

test('sparse cells at permitted row and column boundaries keep their original coordinates', async () => {
  const bytes = workbook(['<row r="10000"><c r="' + column(1024) + '10000"><v>7</v></c></row>']);
  const [{ rows }] = await readWorkbookSheets(bytes);
  assert.equal(rows.length, XLSX_LIMITS.maxRowsPerSheet);
  assert.equal(rows[9999].length, XLSX_LIMITS.maxColumnsPerSheet);
  assert.equal(rows[9999][1023], '7');
  assert.deepEqual(rows[0], []);
});

test('invalid, duplicate and mismatched positions do not silently overwrite source data', async () => {
  for (const xml of [
    '<row r="0"/>', '<row r="-1"/>', '<row r="1e3"/>',
    '<row r="1"/><row r="1"/>',
    '<row r="1"><c r="A0"/></row>',
    '<row r="1"><c r="A2"/></row>',
    '<row r="1"><c r="A1"/><c r="A1"/></row>'
  ]) {
    await assert.rejects(readWorkbookSheets(workbook([xml])), typed('invalid_xlsx'));
  }
});

test('total cell budget counts sparse column spans, even when very few cells are present', async () => {
  const rows = Array.from({ length: 98 }, (_, index) =>
    '<row r="' + (index + 1) + '"><c r="' + column(1024) + (index + 1) + '"><v>1</v></c></row>').join('');
  const bytes = workbook([rows]);
  assert(bytes.length < 10000, 'sparse regression fixture must remain small');
  await assert.rejects(readWorkbookSheets(bytes), typed('xlsx_limit_exceeded', /100000格/));
});

test('row budget also applies across worksheets before filling sparse empty rows', async () => {
  const bytes = workbook(Array.from({ length: 11 }, () => '<row r="10000"/>'));
  assert(bytes.length < 10000);
  await assert.rejects(readWorkbookSheets(bytes), typed('xlsx_limit_exceeded', /总行数/));
});

test('cell and rich shared text are bounded before returning the grid', async () => {
  const large = 'a'.repeat(XLSX_LIMITS.maxCellCharacters + 1);
  for (const bytes of [
    workbook(['<row><c><v>' + large + '</v></c></row>']),
    workbook(['<row><c t="inlineStr"><is><t>' + large + '</t></is></c></row>']),
    workbook(['<row><c t="s"><v>0</v></c></row>'], { shared: '<si><t>' + large + '</t></si>' }),
    workbook(['<row><c t="inlineStr"><is><t>' + large.slice(0, 32768) + '</t><t>a</t></is></c></row>'])
  ]) {
    await assert.rejects(readWorkbookSheets(bytes), typed('xlsx_limit_exceeded', /32768/));
  }
});

test('reusing one shared string cannot amplify returned text beyond the workbook budget', async () => {
  const sharedValue = 'a'.repeat(XLSX_LIMITS.maxCellCharacters);
  const cells = '<c t="s"><v>0</v></c>'.repeat(513);
  const bytes = workbook(['<row>' + cells + '</row>'], { shared: '<si><t>' + sharedValue + '</t></si>' });
  assert(bytes.length < 50000, 'references must not allocate the expanded 16MiB fixture');
  await assert.rejects(readWorkbookSheets(bytes), typed('xlsx_limit_exceeded', /展开文字/));
});

test('shared-string and repeated sheet metadata counts have independent bounds', async () => {
  const tooManyStrings = workbook(['<row/>'], { shared: '<si></si>'.repeat(XLSX_LIMITS.maxSharedStrings + 1) });
  assert(tooManyStrings.length < 1024 * 1024);
  await assert.rejects(readWorkbookSheets(tooManyStrings), typed('xlsx_limit_exceeded', /共享文字/));
  const tooManySheets = zip([
    { name: 'xl/workbook.xml', raw: '<workbook>' + '<sheet r:id="rId0"/>'.repeat(XLSX_LIMITS.maxSheets + 1) + '</workbook>' },
    { name: 'xl/_rels/workbook.xml.rels', raw: '<Relationships><Relationship Id="rId0" Target="worksheets/sheet.xml"/></Relationships>' },
    { name: 'xl/worksheets/sheet.xml', raw: '<worksheet/>' }
  ]);
  await assert.rejects(readWorkbookSheets(tooManySheets.bytes), typed('xlsx_limit_exceeded', /工作表/));
});

test('invalid numeric XML entities fail as typed errors instead of uncaught RangeError', async () => {
  for (const value of ['&#x110000;', '&#999999999999999999999999999999999;']) {
    const bytes = workbook(['<row><c t="inlineStr"><is><t>' + value + '</t></is></c></row>']);
    await assert.rejects(readWorkbookSheets(bytes), typed('invalid_xlsx', /文字编码/));
  }
});

test('unterminated or nested supported XML tags fail before repeated body scans', async () => {
  for (const xml of [
    '<row>'.repeat(1000),
    '<row '.repeat(1000),
    '<row><c>'.repeat(1000),
    '<row><c t="inlineStr"><is>' + '<t>'.repeat(1000) + '</is></c></row>',
    '<row><c/></row></row>'
  ]) {
    const bytes = workbook([xml]);
    assert(bytes.length < 15000);
    await assert.rejects(readWorkbookSheets(bytes), typed('invalid_xlsx', /XML|嵌套/));
  }
});

test('material parsing reports rejected input without partial facts or changing original bytes', async () => {
  const bytes = workbook(['<row r="10001"/>']);
  const original = Buffer.from(bytes);
  const result = await parseWorkbookFacts(bytes, { id: 'synthetic', version: 1, name: 'synthetic.xlsx' });
  assert.equal(result.status, 'failed');
  assert.deepEqual(result.facts, []);
  assert.match(result.error, /10000行解析上限/);
  assert.match(result.error, /原件/);
  assert.deepEqual(bytes, original);
});
