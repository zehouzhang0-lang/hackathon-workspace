// 生成合成XLSX样例，供浏览器手工验收「上传Excel→已读取数据」使用。
// 数据全部为虚构演示值，不含任何真实商家或榜单记录；运行：node scripts/build-sample-xlsx.mjs
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const xmlEscape = (value) => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const columnRef = (index) => {
  let letters = '', value = index + 1;
  while (value > 0) { const rest = (value - 1) % 26; letters = String.fromCharCode(65 + rest) + letters; value = Math.floor((value - 1) / 26); }
  return letters;
};
const sheetXml = (rows) => '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
  rows.map((cells, rowIndex) => '<row r="' + (rowIndex + 1) + '">' + cells.map((cell, columnIndex) => {
    if (cell === null || cell === undefined) return '';
    const ref = columnRef(columnIndex) + (rowIndex + 1);
    return typeof cell === 'number'
      ? '<c r="' + ref + '"><v>' + cell + '</v></c>'
      : '<c r="' + ref + '" t="inlineStr"><is><t>' + xmlEscape(cell) + '</t></is></c>';
  }).join('') + '</row>').join('') + '</worksheet>';

function buildXlsx(sheets) {
  const encoder = new TextEncoder();
  const files = new Map();
  files.set('xl/workbook.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' +
    sheets.map((sheet, index) => '<sheet name="' + xmlEscape(sheet.name) + '" sheetId="' + (index + 1) + '" r:id="rId' + (index + 1) + '"/>').join('') +
    '</sheets></workbook>');
  files.set('xl/_rels/workbook.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    sheets.map((sheet, index) => '<Relationship Id="rId' + (index + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (index + 1) + '.xml"/>').join('') +
    '</Relationships>');
  sheets.forEach((sheet, index) => files.set('xl/worksheets/sheet' + (index + 1) + '.xml', sheetXml(sheet.rows)));
  const chunks = [], central = [];
  let offset = 0;
  for (const [name, content] of files) {
    const raw = encoder.encode(content);
    const nameBytes = encoder.encode(name);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8); local.writeUInt32LE(0, 10);
    local.writeUInt32LE(raw.length, 18); local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBytes.length, 26); local.writeUInt16LE(0, 28);
    chunks.push(local, nameBytes, raw);
    const directory = Buffer.alloc(46);
    directory.writeUInt32LE(0x02014b50, 0); directory.writeUInt16LE(20, 4); directory.writeUInt16LE(20, 6);
    directory.writeUInt16LE(0, 8); directory.writeUInt16LE(0, 10); directory.writeUInt32LE(0, 12);
    directory.writeUInt32LE(raw.length, 20); directory.writeUInt32LE(raw.length, 24);
    directory.writeUInt16LE(nameBytes.length, 28);
    directory.writeUInt32LE(offset, 42);
    central.push(directory, nameBytes);
    offset += 30 + nameBytes.length + raw.length;
  }
  const centralSize = central.reduce((total, part) => total + part.length, 0);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(files.size, 8); eocd.writeUInt16LE(files.size, 10);
  eocd.writeUInt32LE(centralSize, 12); eocd.writeUInt32LE(offset, 16);
  return new Uint8Array(Buffer.concat([...chunks, ...central, eocd]));
}

const rows = [
  ['案例类型', '主播/达人名', '抖音号', '粉丝总量', '粉丝增量(近30天)', '获赞总量', '直播场次(近30天)', '场均场观(近30天)', '场均带货数(近30天)', '场均结算金额(近30天)', '直播间标题(单场)', '单场观看人次', '单场商品数', '单场预估结算金额', '单场销量'],
  ['流量层断点', '演示账号A', 'demo_a', '80.00w', '+100', '80.00w', '60', '15.00w', 20, '100w+', '合成演示专场A', 120, 22, '100w+', '250~1000'],
  ['承接层断点', '演示账号B', '—', '45.00w', '—', '—', '—', '—', '—', '—', '合成演示专场B', 16000, 6, '100w+', '5000~2w'],
  ['中小参照', '演示账号C', '—', '10.00w', '—', '—', '—', '—', '—', '—', '合成演示专场C', 4500, 12, '100w+', '250~1000'],
  ['中小参照', '演示账号D', '—', '22.00w', '—', '—', '—', '—', '—', '—', '合成演示专场D', 3500, 100, '100w+', '5000~2w']
];
const caliber = [
  ['数据来源', '合成演示样例，仅用于验证解析功能；不对应任何真实账号'],
  ['数据性质', '全部数字为演示估值；销量/金额为区间写法，不折算单值'],
  ['口径说明', '近30天口径与单场口径不可直接相减或对比']
];

const target = join(dirname(fileURLToPath(import.meta.url)), '..', 'demo', 'samples', 'live-ranking-sample.xlsx');
writeFileSync(target, buildXlsx([{ name: '原始数据', rows }, { name: '口径说明', rows: caliber }]));
console.log('written: ' + target);
