import { requireValue } from './model.js';
import { createMerchantIntakeDraft } from './intake-draft.js';
import { ROADSHOW_SHOE_FIXTURE_ID, ROADSHOW_SHOE_QUESTION, ROADSHOW_SHOE_REQUIRED_FACTS,
  ROADSHOW_SHOE_SOURCE_SHA256, ROADSHOW_ACCOUNT_DIAGNOSIS_FACTS } from './roadshow-shoe-fixture.js';

export const FIXTURE_IDS = Object.freeze(['underbed_complete_v1', 'one_sentence_v1', 'scope_conflict_v1', 'juicer_cup_v1', ROADSHOW_SHOE_FIXTURE_ID]);
export function makeFixtureIntake(fixtureId) {
  requireValue(FIXTURE_IDS.includes(fixtureId), '未知演示案例，未创建经营草稿。');
  if (fixtureId === ROADSHOW_SHOE_FIXTURE_ID) {
    const draft = createMerchantIntakeDraft({
      sources: ['manual'], transcript: '',
      merchantName: '鞋店商品报告', productName: '鞋店60个商品',
      category: '鞋靴', platform: '抖音电商', currentProblem: ROADSHOW_SHOE_QUESTION,
      desiredAction: '先看清三个账号的内容问题并选择下一步行动',
      confirmedProductFacts: ['可见报告含60行商品记录、26个字段', '累计支付GMV为506.4万元、支付订单为11,246单'],
      constraints: ['只使用已静态读取的可见报告内容和用户指定的预设演示答案', '统计周期未注明，不判断趋势', '价格带图与全店GMV口径冲突，不采用该图结论'],
      unknowns: ['底层鞋店商品数据.xlsx未随样例提供', '渠道×成交、停留、退款与投流成本未提供', '商品ID字段60行仅20个唯一值，商品主键口径待核对']
    });
    const values = [
      ...['merchantName', 'productName', 'category', 'platform', 'desiredAction', 'currentProblem']
        .map((field) => [field, draft[field]]),
      ...['confirmedProductFacts', 'constraints', 'unknowns']
        .flatMap((field) => draft[field].map((value, index) => [field + '.' + index, value]))
    ];
    draft.evidenceLedger = values.map(([field, value]) => ({
      field,
      value: field.startsWith('unknowns.') ? null : value,
      status: field.startsWith('unknowns.') ? 'unknown' : 'confirmed_fact',
      source: 'manual',
      quote: '预设演示数据｜' + field + '：' + value
    }));
    return createMerchantIntakeDraft(draft);
  }
  if (fixtureId !== 'juicer_cup_v1') return createMerchantIntakeDraft({ sources: ['manual'] });
  const draft = createMerchantIntakeDraft({
    sources: ['manual'], transcript: '',
    merchantName: '轻活电器旗舰店', productName: '350ml便携榨汁杯', category: '家居小电器',
    price: '69.9元', specifications: '容量350ml；USB-C充电',
    targetCustomerHypothesis: '租房上班族、宿舍学生、轻食人群',
    platform: '抖音', desiredAction: '先验证商品点击后的加购问题',
    confirmedProductFacts: ['容量为350ml', '充电接口为USB-C', '全国包邮', '清洗方式以商品说明书为准'],
    currentProblem: '可能是商品介绍和信任说明不够清楚，想先验证点击后的加购问题。',
    constraints: ['不能降价', '不能编造性能', '不能复杂重拍'],
    unknowns: ['加购少是否真的是信任问题，尚未证实', '投流来源与投流花费未提供',
      '退款和投诉数据未提供', '能否打冰块、续航次数与具体清洗步骤未确认', '真实售后规则未提供', '真实顾客问题及出现频次未提供', '之前做过哪些经营动作未提供'],
    metrics: { windowStart: '2026-08-21', windowEnd: '2026-08-27',
      videoViews: 58000, productClicks: 1450, addToCarts: 96, createdOrders: 54, paidOrders: 42 }
  });
  const values = [
    ...['merchantName', 'productName', 'category', 'price', 'specifications', 'platform', 'desiredAction', 'targetCustomerHypothesis', 'currentProblem'].map((field) => [field, draft[field]]),
    ...Object.entries(draft.metrics).map(([field, value]) => ['metrics.' + field, value]),
    ...['confirmedProductFacts', 'constraints', 'unknowns'].flatMap((field) => draft[field].map((value, index) => [field + '.' + index, value]))
  ];
  draft.evidenceLedger = values.map(([field, value]) => ({
    field, value: field.startsWith('unknowns.') ? null : value,
    status: field.startsWith('unknowns.') ? 'unknown' : ['currentProblem', 'targetCustomerHypothesis'].includes(field) ? 'owner_hypothesis' : 'confirmed_fact',
    source: 'manual', quote: '合成演示首次资料｜' + field + '：' + value
  }));
  return createMerchantIntakeDraft(draft);
}


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
  if (fixtureId === ROADSHOW_SHOE_FIXTURE_ID) {
    input.description = '';
    const sourceSections = {
      roadshow_source_sha256: '附件文件身份', report_product_rows: '报告概览', report_field_count: '报告概览',
      report_unique_product_ids: '底表质量复核', product_exposure_people: '核心经营指标', product_click_people: '核心经营指标',
      add_to_cart_people: '核心经营指标', buyer_people: '核心经营指标', report_paid_gmv_cny: '核心经营指标',
      report_paid_order_count: '核心经营指标', mass_product_count: '货盘分层', mass_paid_gmv_cny: '货盘分层',
      mass_paid_order_count: '货盘分层', mass_exposure_to_buyer_rate: '货盘分层', mass_aov_cny: '货盘分层',
      mass_gross_margin_rate: '货盘分层', high_end_product_count: '货盘分层', high_end_paid_gmv_cny: '货盘分层',
      high_end_paid_order_count: '货盘分层', high_end_exposure_to_buyer_rate: '货盘分层', high_end_aov_cny: '货盘分层',
      high_end_gross_margin_rate: '货盘分层', report_search_share: '渠道洞察', report_search_conversion_correlation: '渠道洞察',
      report_product_card_share: '渠道洞察', report_product_card_conversion_correlation: '渠道洞察',
      price_band_chart_gmv_cny: '价格带图', report_dual_engine_conclusion: '报告结论'
    };
    const units = {
      report_product_rows: '行', report_field_count: '个字段', report_unique_product_ids: '个唯一ID',
      product_exposure_people: '人', product_click_people: '人', add_to_cart_people: '人', buyer_people: '人',
      report_paid_gmv_cny: 'CNY', report_paid_order_count: '单', mass_product_count: '个商品',
      mass_paid_gmv_cny: 'CNY', mass_paid_order_count: '单', mass_exposure_to_buyer_rate: '比例', mass_aov_cny: 'CNY',
      mass_gross_margin_rate: '比例', high_end_product_count: '个商品', high_end_paid_gmv_cny: 'CNY',
      high_end_paid_order_count: '单', high_end_exposure_to_buyer_rate: '比例', high_end_aov_cny: 'CNY',
      high_end_gross_margin_rate: '比例', report_search_share: '比例', report_search_conversion_correlation: '相关系数',
      report_product_card_share: '比例', report_product_card_conversion_correlation: '相关系数', price_band_chart_gmv_cny: 'CNY'
    };
    for (const [key, value] of Object.entries(ROADSHOW_SHOE_REQUIRED_FACTS)) {
      const reportedConclusion = key === 'report_dual_engine_conclusion' || key.startsWith('report_search_')
        || key.startsWith('report_product_card_') || key.endsWith('_exposure_to_buyer_rate')
        || key.endsWith('_aov_cny') || key.endsWith('_gross_margin_rate');
      const conflicting = key === 'price_band_chart_gmv_cny';
      fact(key, value, units[key] ?? null, sourceSections[key] || '可见报告', {
        subject: '鞋店60个商品',
        evidenceStatus: reportedConclusion ? 'reported_conclusion' : 'confirmed_fact',
        verification: conflicting ? 'conflicting' : 'checked',
        source: {
          kind: 'file_extract', materialId: null, materialVersion: null,
          locator: { type: 'html_visible_report', fileName: '鞋店商品数据分析报告.html', section: sourceSections[key] || '可见报告', sha256: ROADSHOW_SHOE_SOURCE_SHA256 },
          note: '预设演示数据／伪数据兜底；仅静态读取HTML可见报告，未执行脚本、链接或外部操作；不代表真实商家实时数据。'
        }
      });
    }
    for (const [key, value] of Object.entries(ROADSHOW_ACCOUNT_DIAGNOSIS_FACTS)) {
      fact(key, value, null, '用户指定的预设演示答案', {
        subject: '鞋店账号诊断',
        evidenceStatus: 'reported_conclusion',
        verification: 'checked',
        source: {
          kind: 'merchant_statement', materialId: null, materialVersion: null,
          locator: { type: 'fixed_demo_prompt', field: key },
          note: '该诊断文本由用户明确指定用于预设演示；不代表从鞋店HTML提取、平台实时核验或现场AI生成。'
        }
      });
    }
    input.unknowns.push(
      { id: context.newId(), description: '统计周期、开始日期和结束日期未注明，不能判断趋势或日均表现', reason: 'not_provided', sourceId: 'input:description' },
      { id: context.newId(), description: '底层鞋店商品数据.xlsx未随样例提供，无法逐行复核业务真实性', reason: 'not_provided', sourceId: 'input:description' },
      { id: context.newId(), description: '价格带图五档GMV合计291.0万元，与全店506.4万元冲突，本轮不采用价格带结论', reason: 'conflicting', sourceId: 'input:description' },
      { id: context.newId(), description: '商品ID字段60行仅20个唯一值，商品主键口径待核对', reason: 'conflicting', sourceId: 'input:description' }
    );
    return input;
  }
  if (fixtureId === 'juicer_cup_v1') {
    const draft = makeFixtureIntake(fixtureId);
    input.description = '【合成演示，不代表真实商家效果】轻活电器旗舰店的350ml便携榨汁杯，69.9元，USB-C充电，全国包邮，清洗方式以商品说明书为准。'
      + '2026-08-21至2026-08-27的合成嵌套事件链：播放58000、商品点击1450、加购96、创建订单54、支付42。'
      + '老板假设租房上班族、宿舍学生和轻食人群可能购买，尚未验证。可能是商品价值与信任说明不够清楚，尚未证实。不能降价、不能编造性能、不能复杂重拍；缺少投流来源、退款、投诉及真实顾客问题频次。';
    for (const [field, key, unit] of [
      ['videoViews', 'video_views', '次播放'], ['productClicks', 'product_clicks', '次商品点击'],
      ['addToCarts', 'add_to_carts', '次加购'], ['createdOrders', 'created_orders', '笔创建订单'],
      ['paidOrders', 'paid_orders', '笔支付订单']
    ]) {
      const intakeField = 'metrics.' + field;
      const quote = draft.evidenceLedger.find((entry) => entry.field === intakeField).quote;
      fact(key, draft.metrics[field], unit, 'REQ-30首次资料', {
        intakeField, evidenceStatus: 'confirmed_fact', subject: draft.productName,
        window: { start: draft.metrics.windowStart, end: draft.metrics.windowEnd },
        channel: '抖音短视频（合成；投流来源未拆分）',
        cohort: '合成演示的同一商品、同窗嵌套事件链；逐阶段次数，不代表独立用户数',
        source: { kind: 'merchant_statement', materialId: null, materialVersion: null,
          locator: { type: 'intake', field: intakeField, source: 'manual', quote },
          note: '合成演示首次资料，不是真实上传或平台核验。' }
      });
    }
    return input;
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
