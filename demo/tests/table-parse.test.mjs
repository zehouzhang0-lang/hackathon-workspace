// REQ-30 C2第二批（XLSX解析）与独立分析引擎的纯逻辑回归。
// 全部在本机内存中构造XLSX字节流，不访问网络、不读取真实商家原件。
// 注意：buildLocalAnalysis是独立引擎，未接入buildDemoAnalysis（PRD V1语义归已发布实现）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { deflateRawSync } from 'node:zlib';
import { createEmptyState, reduceCommand, getMaterialCapability } from '../shared/model.js';
import { parseWorkbookFacts, parseNumericCell, parseExportDateFromName } from '../shared/table-facts.js';
import { buildLocalAnalysis } from '../shared/analysis.js';
import { buildDemoArtifact } from '../shared/demo-data.js';
import { readSupportedMaterial, buildOrganization, getIntakeSummaryGroups, materialsNeedingRead } from '../pages/intake.js';
import { createMerchantIntakeDraft } from '../shared/intake-draft.js';

// ---------- XLSX builder (store + deflate) ----------

const xmlEscape = (text) => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const columnRef = (index) => {
  let letters = '', value = index + 1;
  while (value > 0) { const rest = (value - 1) % 26; letters = String.fromCharCode(65 + rest) + letters; value = Math.floor((value - 1) / 26); }
  return letters;
};

function sheetXml(rows) {
  const body = rows.map((cells, rowindex) => '<row r="' + (rowindex + 1) + '">' + cells.map((cell, columnIndex) => {
    if (cell === null || cell === undefined) return '';
    const ref = columnRef(columnIndex) + (rowindex + 1);
    return typeof cell === 'number'
      ? '<c r="' + ref + '"><v>' + cell + '</v></c>'
      : '<c r="' + ref + '" t="inlineStr"><is><t>' + xmlEscape(cell) + '</t></is></c>';
  }).join('') + '</row>').join('');
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' + body + '</worksheet>';
}

export function buildXlsx(sheets, { deflate = false } = {}) {
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
  const entries = [...files.entries()].map(([name, content]) => {
    const raw = encoder.encode(content);
    const compressed = deflate ? deflateRawSync(raw) : raw;
    return { name, method: deflate ? 8 : 0, raw, compressed };
  });
  const chunks = [], central = [];
  let offset = 0;
  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0, 6);
    local.writeUInt16LE(entry.method, 8); local.writeUInt32LE(0, 10);          // time/date
    local.writeUInt32LE(0, 14);                                                // crc（读取器不校验）
    local.writeUInt32LE(entry.compressed.length, 18); local.writeUInt32LE(entry.raw.length, 22);
    local.writeUInt16LE(nameBytes.length, 26); local.writeUInt16LE(0, 28);
    chunks.push(local, nameBytes, entry.compressed);
    const directory = Buffer.alloc(46);
    directory.writeUInt32LE(0x02014b50, 0); directory.writeUInt16LE(20, 4); directory.writeUInt16LE(20, 6);
    directory.writeUInt16LE(0, 8); directory.writeUInt16LE(entry.method, 10); directory.writeUInt32LE(0, 12);
    directory.writeUInt32LE(0, 16);                                            // crc
    directory.writeUInt32LE(entry.compressed.length, 20); directory.writeUInt32LE(entry.raw.length, 24);
    directory.writeUInt16LE(nameBytes.length, 28); directory.writeUInt16LE(0, 30); directory.writeUInt16LE(0, 32);
    directory.writeUInt16LE(0, 34); directory.writeUInt16LE(0, 36); directory.writeUInt32LE(0, 38);
    directory.writeUInt32LE(offset, 42);
    central.push(directory, nameBytes);
    offset += 30 + nameBytes.length + entry.compressed.length;
  }
  const centralSize = central.reduce((total, part) => total + part.length, 0);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(0, 4); eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8); eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralSize, 12); eocd.writeUInt32LE(offset, 16); eocd.writeUInt16LE(0, 20);
  return new Uint8Array(Buffer.concat([...chunks, ...central, eocd]));
}

const factOf = (facts, key, subject) => facts.filter((fact) => fact.key === key && (!subject || fact.subject === subject));
const RANKING_ROWS = [
  ['案例类型', '主播/达人名', '抖音号', '粉丝总量', '粉丝增量(近30天)', '获赞总量', '直播场次(近30天)', '场均场观(近30天)', '场均带货数(近30天)', '场均结算金额(近30天)', '直播间标题(单场)', '单场观看人次', '单场商品数', '单场预估结算金额', '单场销量'],
  ['流量层断点', '品栋好人手机', 'danke116', '80.96w', '+136', '86.40w', '68', '17.92w', '22', '100w+', '17Pro 24期免息', 125, 23, '100w+', '250~1000'],
  ['承接层断点', '彩彩', '—', '46.42w', '—', '—', '—', '—', '—', '—', '正在直播', 17100, 6, '100w+', '5000~2w'],
  ['中小参照', '莎莎', '—', '10.55w', '—', '—', '—', '—', '—', '—', '陈俊莎莎婚礼现场', 4856, 12, '100w+', '250~1000'],
  ['中小参照', '尊梵奢行', '—', '23.16w', '—', '—', '—', '—', '—', '—', '茫茫人海，感恩相遇', 3699, 110, '100w+', '5000~2w'],
  ['头部标杆', '与辉同行', '56697889278', '3,920.91w', '+6,307', '4.07亿', '31', '1,386.35w', 220, '100w+', '2026行稳致远', 59100, 162, '100w+', '10w+']
];
const CALIBER_ROWS = [
  ['数据来源', '达多多（daduoduo.com）公开榜单，免登录抓取'],
  ['抓取时间', '2026-08-28 21:45 CST'],
  ['数据性质', '第三方平台估算数据，非抖音官方审计数据；销量/金额为区间估值'],
  ['口径说明', '两榜统计口径不同，字段值不可直接相减或对比']
];

function harness(fixtureId = null) {
  let id = 0;
  const context = { newId: () => 'test_' + (++id), now: '2026-08-28T12:00:00.000Z' };
  let state = createEmptyState(context);
  const send = (type, payload, extra = {}) => {
    // reduceCommand throws typed errors on failure and returns {state,...} on success.
    const result = reduceCommand(state, { type, payload, commandId: 'op_' + (++id), expectedRevision: state.revision }, { ...context, ...extra });
    state = result.state;
    return result;
  };
  if (fixtureId) send('LOAD_FIXTURE', { fixtureId });
  return { get state() { return state; }, send };
}

test('numeric cells keep definite values and refuse to invent single values for estimates', () => {
  assert.equal(parseNumericCell('80.96w').value, 809600);
  assert.equal(parseNumericCell('3,920.91w').value, 39209100);
  assert.equal(parseNumericCell('4.07亿').value, 407000000);
  assert.equal(parseNumericCell('1.71w').value, 17100);
  assert.equal(parseNumericCell('+136').value, 136);
  assert.equal(parseNumericCell('125').value, 125);
  assert.equal(parseNumericCell('—').kind, 'absent');
  assert.equal(parseNumericCell('').kind, 'absent');
  for (const text of ['250~1000', '5000~2w', '10w+']) assert.match(parseNumericCell(text).kind, /range|lower_bound/);
  assert.equal(parseNumericCell('正在直播').kind, 'text');
  assert.equal(parseExportDateFromName('提取作品数据2026年08月28日21时34分10秒.xlsx'), '2026-08-28');
  assert.equal(parseExportDateFromName('报表.xlsx'), null);
});

test('ranking workbook parses known columns with provenance, keeps estimates unknown and reads caliber notes', async () => {
  const bytes = buildXlsx([
    { name: '原始数据', rows: RANKING_ROWS },
    { name: '口径说明', rows: CALIBER_ROWS }
  ]);
  const result = await parseWorkbookFacts(bytes, { id: 'm1', version: 1, name: '260828-断点诊断案例-原始数据.xlsx' });
  assert.equal(result.status, 'needs_review');
  assert.match(result.error, /口径说明·数据来源/);
  assert.match(result.error, /第三方平台估算/);
  const followers = factOf(result.facts, 'followers', '品栋好人手机');
  assert.equal(followers.length, 1);
  assert.equal(followers[0].value, 809600);
  assert.equal(followers[0].unit, '人');
  assert.equal(followers[0].availability, 'known');
  assert.equal(followers[0].source.locator.sheet, '原始数据');
  assert.equal(followers[0].source.locator.cell, 'D2');
  assert.equal(factOf(result.facts, 'live_viewers', '品栋好人手机')[0].value, 125);
  assert.equal(factOf(result.facts, 'live_viewers', '彩彩')[0].value, 17100);
  assert.equal(factOf(result.facts, 'total_likes', '与辉同行')[0].value, 407000000);
  assert.equal(factOf(result.facts, 'avg_live_viewers', '与辉同行')[0].value, 13863500);
  // 「—」未收录不产生事实；区间与下限估值保留原文、按未知。
  assert.equal(factOf(result.facts, 'total_likes', '彩彩').length, 0);
  const sales = factOf(result.facts, 'sales_estimate', '品栋好人手机');
  assert.equal(sales[0].availability, 'unknown');
  assert.match(sales[0].source.note, /250~1000/);
  const settlement = factOf(result.facts, 'estimated_settlement', '品栋好人手机');
  assert.equal(settlement[0].availability, 'unknown');
  assert.match(settlement[0].source.note, /下限/);
  // 抖音号、直播间标题等非指标列不产生事实；口径说明表不产生事实。
  assert.equal(result.facts.some((fact) => fact.source.locator.sheet === '口径说明'), false);
  assert.equal(result.facts.some((fact) => fact.subject === 'danke116'), false);
  assert.equal(result.facts.every((fact) => fact.source.kind === 'file_extract' && fact.source.materialId === 'm1'), true);
});

test('video export collapses an all-zero view column into one collection-gap unknown and binds windows', async () => {
  const rows = [
    ['序号', '作品id', '作品标题', '播放量', '点赞量', '评论量', '发布时间'],
    [1, 'video-aaa', '终于拿下了全款', 0, 203, 2, '2026-08-21 23:24:02'],
    [2, 'video-bbb', '鞋底软到能当枕头', 0, 58, 1, '2026-08-21 18:56:00'],
    [3, 'video-ccc', '神仙小白鞋', 0, 26, 2, '2026-08-22 16:57:00']
  ];
  const bytes = buildXlsx([{ name: '作品列表', rows }]);
  const result = await parseWorkbookFacts(bytes, { id: 'm2', version: 1, name: '提取作品数据2026年08月28日21时34分10秒.xlsx' });
  assert.equal(result.status, 'needs_review');
  assert.match(result.error, /疑似采集缺失/);
  const views = factOf(result.facts, 'video_views');
  assert.equal(views.length, 1);
  assert.equal(views[0].availability, 'unknown');
  assert.match(views[0].source.note, /采集缺失/);
  const likes = factOf(result.facts, 'likes', 'video-aaa');
  assert.equal(likes[0].value, 203);
  assert.deepEqual(likes[0].window, { start: '2026-08-21', end: '2026-08-28' });
  assert.equal(likes[0].cohort, '单条记录累计（至导出时点）');
  assert.equal(factOf(result.facts, 'comments', 'video-bbb')[0].value, 1);
});

test('metric-convention sheets and unknown sheets parse honestly', async () => {
  const rows = [
    ['metric', 'value', 'unit', 'subject', 'window_start', 'window_end', 'channel', 'cohort'],
    ['paid_orders', 42, '笔', '榨汁杯', '2026-08-21', '2026-08-27', '抖音短视频', '同一商品'],
    ['video_views', 'abc', '次', '榨汁杯', '2026-08-21', '2026-08-27', '抖音短视频', '同一商品']
  ];
  const bytes = buildXlsx([
    { name: 'Sheet1', rows },
    { name: '随机表', rows: [['名称', '数量'], ['甲', 3], ['乙', 4]] }
  ]);
  const result = await parseWorkbookFacts(bytes, { id: 'm3', version: 1, name: '约定表.xlsx' });
  assert.equal(result.status, 'needs_review');
  const paid = factOf(result.facts, 'paid_orders');
  assert.equal(paid[0].value, 42);
  assert.equal(paid[0].source.locator.type, 'xlsx');
  const views = factOf(result.facts, 'video_views');
  assert.equal(views[0].availability, 'unknown');
  assert.match(views[0].source.note, /abc/);
  assert.match(result.error, /未识别出足够的已知指标列/);
});

test('corrupt containers fail without touching the original; deflate entries are supported', async () => {
  const corrupt = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3, 4, 5]);
  const failed = await parseWorkbookFacts(corrupt, { id: 'm4', version: 1, name: 'bad.xlsx' });
  assert.equal(failed.status, 'failed');
  assert.deepEqual(failed.facts, []);
  const bytes = buildXlsx([{ name: '原始数据', rows: RANKING_ROWS }], { deflate: true });
  const result = await parseWorkbookFacts(bytes, { id: 'm5', version: 1, name: 'ranking.xlsx' });
  assert.equal(factOf(result.facts, 'followers', '品栋好人手机')[0].value, 809600);
});

test('XLSX parsing flows through the page reader and the shared transaction into facts', async () => {
  const bytes = buildXlsx([
    { name: '原始数据', rows: RANKING_ROWS },
    { name: '口径说明', rows: CALIBER_ROWS }
  ]);
  const h = harness();
  h.send('MATERIAL_ADD', { file: null }, { preparedMaterial: { name: '260828-断点诊断案例-原始数据.xlsx',
    mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', size: bytes.length, sha256: 'hash', file: null } });
  const material = h.state.input.materials[0];
  const parsed = await readSupportedMaterial(new Blob([bytes]), material);
  assert.equal(parsed.status, 'needs_review');
  assert(parsed.facts.length > 30);
  h.send('MATERIAL_RESULT_SET', { materialId: material.id, materialVersion: material.version,
    roundId: h.state.round.id, inputVersion: h.state.round.inputVersion, ...parsed });
  assert.equal(h.state.input.materials[0].status, 'needs_review');
  const followers = h.state.input.facts.filter((fact) => fact.key === 'followers');
  assert.equal(followers.length, 5);
  assert(!followers[0].id.startsWith('draft_'));
  // 重新解析同一版本复用事实ID，不产生重复。
  const again = await readSupportedMaterial(new Blob([bytes]), h.state.input.materials[0]);
  h.send('MATERIAL_RESULT_SET', { materialId: material.id, materialVersion: material.version,
    roundId: h.state.round.id, inputVersion: h.state.round.inputVersion, ...again });
  assert.equal(h.state.input.facts.filter((fact) => fact.key === 'followers').length, 5);
});

test('end-to-end: parsed ranking material reaches page two as a limited layer diagnosis', async () => {
  const h = harness();
  const bytes = buildXlsx([{ name: '原始数据', rows: RANKING_ROWS }]);
  h.send('MATERIAL_ADD', { file: null }, { preparedMaterial: { name: '260828-榜单.xlsx',
    mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', size: bytes.length, sha256: 'h', file: null } });
  const material = h.state.input.materials[0];
  const parsed = await readSupportedMaterial(new Blob([bytes]), material);
  h.send('MATERIAL_RESULT_SET', { materialId: material.id, materialVersion: material.version,
    roundId: h.state.round.id, inputVersion: h.state.round.inputVersion, ...parsed });
  h.send('INPUT_EDIT', { description: '看看直播为什么不出单' });
  h.send('FOCUS_CONFIRM', { inputVersion: h.state.round.inputVersion });
  const generated = buildLocalAnalysis(h.state);
  assert.equal(generated.ok, true, generated.message);
  const analysis = generated.analysis;
  assert.equal(analysis.status, 'limited');
  assert.equal(analysis.mode, 'local_limited');
  assert.match(analysis.summary, /品栋好人手机/);
  assert.match(analysis.summary, /彩彩/);
  assert(analysis.paths.length >= 2);
  assert(analysis.paths[0].evidenceRefs[0].summary.includes('粉看比') || analysis.paths[0].evidenceRefs[0].summary.includes('明显低于'));
  assert.equal(analysis.findings.funnel.comparable, false);
  const traffic = analysis.findings.traffic.find((entry) => entry.subject === '品栋好人手机');
  assert.equal(traffic.judgment, 'traffic_gap');
  assert(traffic.note.includes('场均'));
  assert.equal(analysis.findings.traffic.find((entry) => entry.subject === '与辉同行').judgment, 'head_account');
  assert.equal(analysis.findings.uptake.find((entry) => entry.subject === '彩彩').judgment, 'shallow');
  h.send('ANALYSIS_SET', { analysis });
  const selection = h.state.analysis.paths[0];
  h.send('PATH_SELECT', { analysisId: h.state.analysis.id, pathId: selection.id, inputVersion: h.state.round.inputVersion });
  const artifacts = buildDemoArtifact(h.state);
  assert.equal(artifacts.ok, true, artifacts.message);
});

test('end-to-end: comparable five-stage upload yields computed funnel with priority separated from max loss', async () => {
  const h = harness('juicer_cup_v1');
  h.send('FOCUS_CONFIRM', { inputVersion: h.state.round.inputVersion });
  const generated = buildLocalAnalysis(h.state);
  assert.equal(generated.ok, true);
  const analysis = generated.analysis;
  assert.equal(analysis.status, 'ready');
  assert.equal(analysis.findings.funnel.comparable, true);
  const steps = analysis.findings.funnel.steps;
  assert.equal(steps[0].from, '播放');
  assert.ok(Math.abs(steps[0].rate - 1450 / 58000) < 1e-12);
  assert.ok(Math.abs(steps[1].rate - 96 / 1450) < 1e-12);
  assert.equal(analysis.findings.funnel.maxLoss.from, '播放');
  assert.equal(analysis.findings.funnel.maxLoss.to, '商品点击');
  assert(analysis.findings.funnel.priorityNote.includes('入口流失'));
  assert.match(analysis.summary, /优先验证“播放→商品点击”|优先验证“商品点击→加购”/);
  const priorityPath = analysis.paths.find((path) => path.title === '先补全商品页的承接信息');
  assert(priorityPath, '优先路径应指向点击→加购承接');
  assert.match(priorityPath.evidenceRefs[0].summary, /播放→商品点击/);
  h.send('ANALYSIS_SET', { analysis });
  const savedPath = h.state.analysis.paths.find((path) => path.title === '先补全商品页的承接信息');
  h.send('PATH_SELECT', { analysisId: h.state.analysis.id, pathId: savedPath.id, inputVersion: h.state.round.inputVersion });
  assert.equal(buildDemoArtifact(h.state).ok, true);
});

test('xlsx materials saved before the parser existed are re-read on the next 整理', () => {
  const h = harness();
  h.send('MATERIAL_ADD', { file: null }, { preparedMaterial: { name: 'old-ranking.xlsx',
    mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', size: 10, sha256: 'h1', file: null } });
  h.send('MATERIAL_ADD', { file: null }, { preparedMaterial: { name: '截图.png',
    mime: 'image/png', size: 10, sha256: 'h2', file: null } });
  h.send('MATERIAL_ADD', { file: null }, { preparedMaterial: { name: '旧.csv',
    mime: 'text/csv', size: 10, sha256: 'h3', file: null } });
  h.send('MATERIAL_ADD', { file: null }, { preparedMaterial: { name: '旧表.xls',
    mime: 'application/vnd.ms-excel', size: 10, sha256: 'h4', file: null } });
  for (const material of h.state.input.materials) {
    h.send('MATERIAL_RESULT_SET', { materialId: material.id, materialVersion: material.version,
      roundId: h.state.round.id, inputVersion: h.state.round.inputVersion,
      status: 'needs_review', facts: [], error: '旧结果：Excel 原件已接收并保存在本机；解析尚未接通。' });
  }
  // 旧解析结果（无xlsx事实）会被重新读取；PNG/CSV/XLS 不受影响。
  let targets = materialsNeedingRead(h.state);
  assert.equal(targets.length, 1);
  assert.equal(targets[0].name, 'old-ranking.xlsx');
  // 重读成功（存在xlsx定位事实）后不再重复读取。
  const material = h.state.input.materials[0];
  h.send('MATERIAL_RESULT_SET', { materialId: material.id, materialVersion: material.version,
    roundId: h.state.round.id, inputVersion: h.state.round.inputVersion, status: 'needs_review',
    facts: [{ id: 'draft_f1', key: 'followers', value: 809600, availability: 'known', unit: '人',
      subject: '演示账号A', window: { start: null, end: null }, channel: null, cohort: '近30天口径',
      source: { kind: 'file_extract', materialId: material.id, materialVersion: material.version,
        locator: { type: 'xlsx', sheet: '原始数据', cell: 'D2' }, note: '' }, verification: 'unreviewed' }],
    error: '口径说明·数据来源：合成演示样例' });
  targets = materialsNeedingRead(h.state);
  assert.equal(targets.length, 0);
  // 新上传（received状态）始终会被读取。
  h.send('MATERIAL_ADD', { file: null }, { preparedMaterial: { name: 'new.xlsx',
    mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', size: 10, sha256: 'h5', file: null } });
  assert.equal(materialsNeedingRead(h.state).length, 1);
});

test('organization aggregates repeated caliber gaps and the six groups show Excel data with provenance', async () => {
  const bytes = buildXlsx([
    { name: '原始数据', rows: RANKING_ROWS },
    { name: '口径说明', rows: CALIBER_ROWS }
  ]);
  const h = harness();
  h.send('MATERIAL_ADD', { file: null }, { preparedMaterial: { name: '260828-榜单.xlsx',
    mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', size: bytes.length, sha256: 'h', file: null } });
  const material = h.state.input.materials[0];
  const parsed = await readSupportedMaterial(new Blob([bytes]), material);
  h.send('MATERIAL_RESULT_SET', { materialId: material.id, materialVersion: material.version,
    roundId: h.state.round.id, inputVersion: h.state.round.inputVersion, ...parsed });
  // 缺时间范围的同一指标按指标聚合成一条缺口，不逐行刷屏。
  const organization = buildOrganization(h.state, '看看直播为什么不出单');
  const gaps = organization.unknowns.filter((entry) => entry.description.includes('粉丝总量') && entry.description.includes('时间范围'));
  assert.equal(gaps.length, 1);
  const draft = createMerchantIntakeDraft({ sources: ['manual'] });
  const groups = getIntakeSummaryGroups(draft, h.state, null, []);
  const data = groups.find((group) => group.id === 'data');
  assert(data.items.some((item) => item.text.startsWith('粉丝总量：809600')));
  assert(data.items.some((item) => item.note.includes('260828-榜单.xlsx')));
  assert(data.items.some((item) => item.text.startsWith('销量（平台估算）：未知')));
  const unconfirmed = groups.find((group) => group.id === 'unconfirmed');
  assert(unconfirmed.items.some((item) => item.note.includes('口径说明·数据来源')));
});
