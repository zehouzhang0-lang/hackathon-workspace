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

export function normalizeRoadshowShoeQuestion(value) {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/[？?。]$/u, '').trim();
}

export function matchesRoadshowShoeQuestion(value) {
  return normalizeRoadshowShoeQuestion(value) === ROADSHOW_SHOE_QUESTION;
}

export function hasRoadshowShoeFixtureCore(state) {
  if (state?.fixtureId !== ROADSHOW_SHOE_FIXTURE_ID || !Array.isArray(state.input?.facts)
    || !Array.isArray(state.input?.materials) || state.input.materials.length) return false;
  for (const [key, expected] of Object.entries(ROADSHOW_SHOE_REQUIRED_FACTS)) {
    const matches = state.input.facts.filter((fact) => fact?.key === key && fact.availability === 'known');
    if (matches.length !== 1 || !Object.is(matches[0].value, expected)
      || matches[0].source?.kind !== 'file_extract' || !matches[0].source?.locator) return false;
  }
  return state.input.intake?.draft?.productName === '鞋店60个商品（路演固定样例）'
    && Array.isArray(state.input.intake.sourceBindings) && state.input.intake.sourceBindings.length === 0;
}
