// Conservative, local-only extraction for explicit merchant statements.
// A value is returned only when its label and value occur together in the
// supplied text.  The caller must retain quote/line provenance and must keep
// conflicting candidates unresolved instead of choosing one.

const NUMBER = String.raw`([+-]?[\d,]+(?:\.\d+)?\s*[wW万亿]?)`;
const MULTIPLIERS = { w: 1e4, W: 1e4, 万: 1e4, 亿: 1e8 };

function exactCount(raw) {
  const compact = String(raw ?? '').replace(/[\s,]/g, '');
  const match = /^([+-]?\d+(?:\.\d+)?)([wW万亿]?)$/.exec(compact);
  if (!match) return null;
  const value = Number(match[1]) * (MULTIPLIERS[match[2]] || 1);
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function cleanText(value) {
  const result = String(value ?? '').trim().replace(/[。；;，,]+$/, '').trim();
  return result && result.length <= 200 ? result : null;
}

const TEXT_RULES = [
  ['merchantName', 'merchant_name', /(?:商家名称|店铺名称|账号名称|我的店铺|店铺|商家)\s*(?:是|为|叫|[:：])\s*([^，。；;\n]{1,200})/g],
  ['productName', 'product_name', /(?:主营商品|主推商品|具体商品|商品名称|产品名称|商品|产品)\s*(?:是|为|叫|卖的是|[:：])\s*([^，。；;\n]{1,200})/g],
  ['category', 'category', /(?:商品类目|主营类目|产品类目|类目|品类)\s*(?:是|为|属于|[:：])\s*([^，。；;\n]{1,200})/g],
  ['price', 'price', /(?:商品价格|销售价格|售价|客单价|价格)\s*(?:是|为|[:：])\s*([^，。；;\n]{1,80})/g],
  ['specifications', 'specifications', /(?:商品规格|产品规格|规格|型号)\s*(?:是|为|[:：])\s*([^，。；;\n]{1,200})/g],
  ['platform', 'platform', /(?:经营平台|销售平台|主要平台|平台)\s*(?:是|为|[:：])\s*([^，。；;\n]{1,100})/g],
  ['desiredAction', 'desired_action', /(?:希望改变|本轮目标|经营目标|目标)\s*(?:是|为|[:：])\s*([^。；;\n]{1,200})/g],
  ['currentProblem', 'current_problem', /(?:当前问题|经营问题|主要问题|痛点|问题)\s*(?:是|为|[:：])\s*([^。；;\n]{1,200})/g],
  ['targetCustomerHypothesis', 'target_customer_hypothesis', /(?:目标人群|目标客户|主要客群|用户人群)\s*(?:是|为|[:：])\s*([^，。；;\n]{1,200})/g],
  ['usageScenarioHypothesis', 'usage_scenario_hypothesis', /(?:使用场景|消费场景|适用场景)\s*(?:是|为|[:：])\s*([^，。；;\n]{1,200})/g],
  ['purchaseReasonHypothesis', 'purchase_reason_hypothesis', /(?:购买原因|购买理由|购买动机)\s*(?:是|为|[:：])\s*([^。；;\n]{1,200})/g],
  ['differentiationHypothesis', 'differentiation_hypothesis', /(?:商品差异|差异点|差异化|核心卖点)\s*(?:是|为|[:：])\s*([^。；;\n]{1,200})/g]
];

const COUNT_RULES = [
  ['metrics.videoViews', 'video_views', new RegExp('(?:视频播放量|播放量|播放数|观看次数|观看量|曝光量)\\s*(?:是|为|有|[:：])?\\s*' + NUMBER + '(?:次|人次)?', 'g')],
  ['metrics.productClicks', 'product_clicks', new RegExp('(?:商品点击人数|商品点击次数|商品点击量|商品点击|点击商品人数)\\s*(?:是|为|有|[:：])?\\s*' + NUMBER + '(?:次|人)?', 'g')],
  ['metrics.addToCarts', 'add_to_carts', new RegExp('(?:商品加购人数|商品加购件数|加购人数|加购件数|加购量|加购)\\s*(?:是|为|有|[:：])?\\s*' + NUMBER + '(?:次|人|件)?', 'g')],
  ['metrics.createdOrders', 'created_orders', new RegExp('(?:创建订单数|下单人数|下单数|(?<!支付)订单数)\\s*(?:是|为|有|[:：])?\\s*' + NUMBER + '(?:笔|单|人)?', 'g')],
  ['metrics.paidOrders', 'paid_orders', new RegExp('(?:支付订单数|支付单数|成交订单数|支付订单|成交单数)\\s*(?:是|为|有|[:：])?\\s*' + NUMBER + '(?:笔|单)?', 'g')]
];

function lineAt(text, offset) {
  return text.slice(0, offset).split('\n').length;
}

function pushMatches(output, text, field, key, expression, convert) {
  expression.lastIndex = 0;
  for (const match of text.matchAll(expression)) {
    const value = convert(match[1]);
    if (value === null) continue;
    const quote = match[0];
    const lineStart = lineAt(text, match.index);
    output.push({ field, key, value, quote, start: match.index, end: match.index + quote.length,
      lineStart, lineEnd: lineStart + quote.split('\n').length - 1 });
  }
}

export function extractLocalIntakeCandidates(rawText) {
  const text = String(rawText ?? '').replace(/^\uFEFF/, '');
  if (!text || text.includes('\0')) return [];
  const output = [];
  for (const [field, key, expression] of TEXT_RULES) {
    pushMatches(output, text, field, key, expression, cleanText);
  }
  for (const [field, key, expression] of COUNT_RULES) {
    pushMatches(output, text, field, key, expression, exactCount);
  }
  const dates = /(?:数据时间|统计时间|观察时间|时间范围)\s*(?:是|为|[:：])?\s*(\d{4}[-年/]\d{1,2}[-月/]\d{1,2}日?)\s*(?:至|到|~|～|—|-)\s*(\d{4}[-年/]\d{1,2}[-月/]\d{1,2}日?)/g;
  const normalizeDate = (value) => {
    const match = /^(\d{4})[-年/](\d{1,2})[-月/](\d{1,2})日?$/.exec(value);
    if (!match) return null;
    const iso = match[1] + '-' + match[2].padStart(2, '0') + '-' + match[3].padStart(2, '0');
    const date = new Date(iso + 'T00:00:00.000Z');
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === iso ? iso : null;
  };
  for (const match of text.matchAll(dates)) {
    const startValue = normalizeDate(match[1]), endValue = normalizeDate(match[2]);
    if (!startValue || !endValue || endValue < startValue) continue;
    const lineStart = lineAt(text, match.index);
    const base = { quote: match[0], start: match.index, end: match.index + match[0].length,
      lineStart, lineEnd: lineStart + match[0].split('\n').length - 1 };
    output.push({ ...base, field: 'metrics.windowStart', key: 'intake_window_start', value: startValue });
    output.push({ ...base, field: 'metrics.windowEnd', key: 'intake_window_end', value: endValue });
  }
  return output.sort((a, b) => a.start - b.start || a.field.localeCompare(b.field));
}
