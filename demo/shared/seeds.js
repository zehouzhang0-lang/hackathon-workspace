import { requireValue } from './model.js';

export const FIXTURE_IDS = ['underbed_complete_v1', 'one_sentence_v1', 'scope_conflict_v1'];
export function makeFixtureInput(fixtureId, context, roundId) {
  requireValue(FIXTURE_IDS.includes(fixtureId), '未知演示案例，未加载任何预写结果。');
  const input = { description: '', focus: null, confirmedVersion: null, materials: [], facts: [], constraints: [], unknowns: [], intake: null };
  function fact(key, value, unit, source, extra = {}) {
    const entry = {
      id: context.newId(), key, value, availability: value === null ? 'unknown' : 'known',
      unit, subject: '虚构床底收纳箱', window: { start: null, end: null }, channel: null, cohort: null,
      source: { kind: 'merchant_statement', materialId: null, materialVersion: null, locator: null, note: '合成演示 ' + source + '；不是真实商家记录' },
      verification: 'unreviewed', ...extra
    };
    input.facts.push(entry);
    return entry;
  }
  if (fixtureId === 'one_sentence_v1') {
    input.description = '做了一段时间抖音，说不清卡在哪里，想先看看该检查什么。';
    input.unknowns.push({ id: context.newId(), description: '商品、数据、投入与观察期尚未提供', reason: 'not_provided', sourceId: 'input:description' });
    return input;
  }
  if (fixtureId === 'scope_conflict_v1') {
    input.description = '这两组记录时间和渠道不同，想先知道能不能放在一起判断。';
    fact('product_detail_visitors', 186, '人', 'S5的独立冲突变体', { window: { start: '2026-08-18', end: '2026-08-24' }, channel: '短视频' });
    fact('paid_orders', 0, '笔', '独立冲突变体', { window: { start: '2026-08-01', end: '2026-08-17' }, channel: '直播' });
    input.unknowns.push({ id: context.newId(), description: '日期与渠道不一致，不能拼成转化漏斗', reason: 'conflicting', sourceId: 'input:description' });
    return input;
  }
  // Explicit first-round whitelist. No source S6/S7, future feedback or reference outputs.
  input.description = '最近发了3条视频，商品详情有186名访客、0笔支付。手头5条选取的咨询经常问尺寸和套装，想先检查该改哪段说明。';
  const specs = [
    ['price', 69.9, 'CNY/order', 'S4'],
    ['units_per_order', 2, '只/单', 'S1、S4'],
    ['external_length', 60, 'cm', 'S1'],
    ['external_width', 40, 'cm', 'S1'],
    ['external_height', 16, 'cm', 'S1'],
    ['dimension_scope', '单只使用状态外尺寸，包含盖、无脚轮；不是内尺寸、包装尺寸或入门尺寸。', null, 'S1'],
    ['target_customer', '有床底收纳需求的租房人群', null, 'S4'],
    ['purchase_path', '查看商品页，核对2只装、尺寸与另计运费后下单', null, 'S4'],
    ['shipping_fee', null, 'CNY/order', '未提供'],
    ['dispatch_time', null, '小时', '未提供'],
    ['dimension_tolerance', null, 'cm', '未提供'],
    ['current_title', '家用床底收纳箱 换季衣物整理 大容量2只装', null, 'S2'],
    ['current_opening', '把换季衣服装起来，床底空间也能整整齐齐。2只装69.90元。', null, 'S2'],
    ['selected_inquiries', [
      '我家床底大概17厘米高，能放吗？',
      '60×40是能装东西的尺寸，还是箱子外尺寸？',
      '床底中间有横梁，只看高度够不够？',
      '69.9是一只还是两只？',
      '运费怎么算？'
    ].join('\n'), null, 'S3，5条选取摘录，不代表总体频率']
  ];
  specs.forEach((entry) => fact(...entry));
  for (const [key, value, unit] of [['product_detail_visitors', 186, '人'], ['paid_orders', 0, '笔'], ['published_videos', 3, '条']]) {
    fact(key, value, unit, 'S5', { window: { start: '2026-08-18', end: '2026-08-24' }, channel: key === 'published_videos' ? '商家自述' : '未拆分' });
  }
  for (const [key, description, value, unit, scope] of [
    ['time_budget_minutes', '本轮可用时间', 20, '分钟', 'round'],
    ['allow_discount', '本轮不降价', false, null, 'product'],
    ['allow_new_ad_spend', '不新增投流', false, null, 'merchant'],
    ['can_edit_listing_text', '可以编辑商品文字', true, null, 'round'],
    ['can_reply_to_inquiries', '可以回复咨询', true, null, 'round'],
    ['allow_new_photography', '本轮不重拍', false, null, 'round']
  ]) {
    const evidence = fact((scope === 'round' ? 'round_constraint_' : 'constraint_') + key, value, unit, 'S4，本轮限制');
    input.constraints.push({ id: context.newId(), description, value, unit, scope, sourceFactIds: [evidence.id] });
  }
  for (const key of ['shipping_fee', 'dispatch_time', 'dimension_tolerance']) {
    const item = input.facts.find((entry) => entry.key === key);
    input.unknowns.push({ id: context.newId(), description: ({ shipping_fee: '运费规则未知', dispatch_time: '发货时长未知', dimension_tolerance: '尺寸公差未知' })[key], reason: 'not_provided', sourceId: 'fact:' + item.id });
  }
  return input;
}
