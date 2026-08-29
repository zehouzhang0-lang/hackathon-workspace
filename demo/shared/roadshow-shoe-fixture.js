export const ROADSHOW_SHOE_FIXTURE_ID = 'shoe_store_report_fixed_v1';
export const ROADSHOW_SHOE_QUESTION = '帮我分析一下这些商品的数据';
export const ROADSHOW_SHOE_SOURCE_SHA256 = '336C1D897698026A4B83F3064045400A88B3EC2491BE76EFD01C19293AFA59BC';

export const ROADSHOW_SHOE_REQUIRED_FACTS = Object.freeze({
  roadshow_source_sha256: ROADSHOW_SHOE_SOURCE_SHA256,
  report_product_rows: 60,
  report_field_count: 26,
  report_unique_product_ids: 20,
  product_exposure_people: 6398404,
  product_click_people: 223696,
  add_to_cart_people: 27331,
  buyer_people: 9679,
  report_paid_gmv_cny: 5064000,
  report_paid_order_count: 11246,
  mass_product_count: 40,
  mass_paid_gmv_cny: 2677000,
  mass_paid_order_count: 10104,
  mass_exposure_to_buyer_rate: 0.002,
  mass_aov_cny: 308,
  mass_gross_margin_rate: 0.513,
  high_end_product_count: 20,
  high_end_paid_gmv_cny: 2387000,
  high_end_paid_order_count: 1142,
  high_end_exposure_to_buyer_rate: 0.0005,
  high_end_aov_cny: 2438,
  high_end_gross_margin_rate: 0.367,
  report_search_share: 0.294,
  report_search_conversion_correlation: 0.70,
  report_product_card_share: 0.44,
  report_product_card_conversion_correlation: -0.75,
  price_band_chart_gmv_cny: 2910000,
  report_dual_engine_conclusion: '大众款承担销量，高端款承担高客单'
});

export const ROADSHOW_ACCOUNT_DIAGNOSIS_FACTS = Object.freeze({
  female_factory_diagnosis: '女鞋工厂直营店：平均播放 5.1 万是假象——17 条视频中位播放仅 1.07 万，靠 2 条爆款拉动。发布时段随机（10:00~21:20 乱发）、混剪占 40%、封面版式乱。对照手工皮鞋工坊：固定 20:30 发布、完播率稳定 35%~52%、播放无低位塌方——这就是「稳定出量 vs 碰运气」的差距。',
  sneaker_lab_diagnosis: '国潮球鞋实验室：测评/穿搭/品牌故事无主次，封面三种风格混用，人设「实验室」与年轻潮流人群（男75%）错位。',
  outdoor_flagship_diagnosis: '运动户外鞋旗舰店：最紧急——搬运混剪 70% 导致疑似降权（播放长期三位数、搜索偶现异常）。账号基础（头像/昵称/简介）全缺，先解决健康度再谈内容。'
});

export const ROADSHOW_SHOE_PLAN_A_STEPS = Object.freeze([
  '运动户外鞋旗舰店：立即停发搬运/混剪内容，补齐头像、昵称、简介基础设置（当前全缺），消除疑似降权风险；去创作者中心核查违规记录，确认健康度状态后再谈内容。',
  '女鞋工厂直营店：固定发布时间到粉丝活跃时段（10:00 或 21:00），一周内停止随机发布；统一封面模板，封面加大字号人群标签（如「妈妈鞋」「学生党通勤」），让算法知道推给谁。',
  '国潮球鞋实验室：测评与推荐二选一——推荐向固定「本周必入 Top3」栏目，测评向固定「实测拆解」栏目，一周内停止内容类型摇摆；昵称保留「实验室」但简介补一句价值主张（如「每周三实测 3 双国潮鞋」）。'
]);

export const ROADSHOW_SHOE_PLAN_B_STEPS = Object.freeze([
  '把「德训鞋百搭」和「AJ平替实测」两条爆款逐帧拆解，提炼成自家选题模板（标题公式 + 前3秒钩子 + 结尾引导），产出 10 个备选选题。',
  '导出全部评论按需求聚类，选出下周一期的「评论区需求回应」选题并拍出来。',
  '女鞋工厂直营店拍第一条「货源透明」内容（仓库随手拍 + 29.9指向），发布后置顶评论区「工厂实拍」旧链接。'
]);

export function normalizeRoadshowShoeQuestion(value) {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/[？?。]$/u, '').trim();
}

export function matchesRoadshowShoeQuestion(value) {
  return normalizeRoadshowShoeQuestion(value) === ROADSHOW_SHOE_QUESTION;
}

function everyMatchingFactIsExact(facts, key, expected, sourceMatches) {
  const matches = facts.filter((fact) => fact?.key === key && fact.availability === 'known');
  return matches.length > 0 && matches.every((fact) => Object.is(fact.value, expected)
    && sourceMatches(fact.source));
}

export function canUpgradeRoadshowShoeFixture(state) {
  // Older saved sessions may have lost fixtureId after the intake was edited. The complete
  // source digest + required fact set below is the fixture identity; never infer it from a
  // partial dataset or from the user's question alone.
  if (!Array.isArray(state?.input?.facts)
    || !Array.isArray(state.input?.materials) || state.input.materials.length) return false;
  for (const [key, expected] of Object.entries(ROADSHOW_SHOE_REQUIRED_FACTS)) {
    // Several historical reducers retained an identical copy when the same fixed sample was
    // confirmed again. Accept those byte-identical/source-identical copies, but fail closed if
    // even one matching fact disagrees with the fixed report.
    if (!everyMatchingFactIsExact(state.input.facts, key, expected, (source) =>
      source?.kind === 'file_extract'
      && source?.locator?.sha256 === ROADSHOW_SHOE_SOURCE_SHA256)) return false;
  }
  return Array.isArray(state.input.intake?.sourceBindings) && state.input.intake.sourceBindings.length === 0;
}

export function hasRoadshowShoeFixtureCore(state) {
  if (state?.fixtureId !== ROADSHOW_SHOE_FIXTURE_ID || !canUpgradeRoadshowShoeFixture(state)) return false;
  for (const [key, expected] of Object.entries(ROADSHOW_ACCOUNT_DIAGNOSIS_FACTS)) {
    if (!everyMatchingFactIsExact(state.input.facts, key, expected, (source) =>
      source?.kind === 'merchant_statement'
      && source?.locator?.type === 'fixed_demo_prompt')) return false;
  }
  return state.input.intake?.draft?.productName === '鞋店60个商品';
}
