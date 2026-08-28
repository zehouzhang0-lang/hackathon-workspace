/** Pure, single-path HTML export. The caller owns snapshot freshness and downloading. */
const ID = /^[A-Za-z0-9_-]{1,80}$/;
const OMITTED = '摘要未获确认';
const BRANCHES = Object.freeze({
  not_executed: '明确反馈尚未执行',
  insufficient_evidence: '信息或观察不足',
  risk_triggered: '触发风险',
  comparable_positive: '可比的正向变化',
  comparable_unchanged: '可比但未见明显变化',
  comparable_negative: '可比的负向变化',
});
const SOURCE_KINDS = Object.freeze({
  merchant_statement: '商家自述', file_extract: '文件提取', derived: '派生计算',
  public_reference: '公共参考', scenario_assumption: '情景假设',
});
const VERIFICATIONS = Object.freeze({
  unreviewed: '未核对', user_corrected: '商家更正', checked: '已核对对应原文或算式', conflicting: '存在冲突',
});
const EVIDENCE_KINDS = Object.freeze({ observation: '观察', calculation: '计算', inference: '推断' });

class ReportError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}
const fail = (message, code = 'invalid_structure') => { throw new ReportError(code, message); };
const check = (test, message, code) => { if (!test) fail(message, code); };
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const textValue = value => typeof value === 'string';
const nonempty = value => textValue(value) && value.trim().length > 0;
const validId = value => textValue(value) && ID.test(value) && !value.startsWith('draft_');
const nullableText = value => value === null || textValue(value);
const finite = value => typeof value === 'number' && Number.isFinite(value);
const positiveInt = value => Number.isSafeInteger(value) && value > 0;
const arrayOfText = value => Array.isArray(value) && value.every(textValue);
const arrayOfIds = value => Array.isArray(value) && value.every(validId);
const resultError = error => error instanceof ReportError
  ? { ok: false, code: error.code, message: error.message }
  : { ok: false, code: 'generation_failed', message: '报告生成失败，请保留当前页面并重试。' };
const escapeHTML = value => String(value).replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[char]);

function checkCondition(condition) {
  check(object(condition) && nonempty(condition.text)
    && arrayOfIds(condition.sourceFactIds) && arrayOfIds(condition.assumptionIds), '分支或执行条件的结构无效。');
}

/** Validate the complete supported tree, including all six business branch categories. */
export function validateDecisionTree(tree) {
  try {
    check(object(tree) && validId(tree.rootId) && Array.isArray(tree.nodes)
      && Array.isArray(tree.edges) && Array.isArray(tree.notApplicableBranches), '业务树缺少根节点、节点或分支列表。');
    check(tree.nodes.length > 0 && tree.nodes.length <= 300 && tree.edges.length <= 299
      && tree.notApplicableBranches.length <= 6, '业务树超出支持范围：最多300个节点、299条边。');
    const nodes = new Map();
    const incoming = new Map();
    const outgoing = new Map();
    const ids = new Set();
    for (const node of tree.nodes) {
      check(object(node) && validId(node.id) && !ids.has(node.id)
        && ['decision', 'next_step'].includes(node.kind) && nonempty(node.title)
        && nullableText(node.detail), '业务树节点重复、缺少正文或类型不受支持。');
      ids.add(node.id);
      nodes.set(node.id, node);
      incoming.set(node.id, 0);
      outgoing.set(node.id, []);
    }
    check(nodes.has(tree.rootId), '业务树没有有效根节点。');
    const covered = new Set();
    for (const edge of tree.edges) {
      check(object(edge) && validId(edge.id) && !ids.has(edge.id)
        && nodes.has(edge.from) && nodes.has(edge.to)
        && Object.hasOwn(BRANCHES, edge.branch), '业务树存在重复ID、断边或不支持的分支。');
      checkCondition(edge.condition);
      ids.add(edge.id);
      covered.add(edge.branch);
      incoming.set(edge.to, incoming.get(edge.to) + 1);
      outgoing.get(edge.from).push(edge);
    }
    const excluded = new Set();
    for (const item of tree.notApplicableBranches) {
      check(object(item) && Object.hasOwn(BRANCHES, item.branch) && nonempty(item.reason)
        && !excluded.has(item.branch) && !covered.has(item.branch), '业务树的不适用分支缺少理由、重复或与现有边冲突。');
      excluded.add(item.branch);
    }
    check(Object.keys(BRANCHES).every(branch => covered.has(branch) || excluded.has(branch)), '业务树缺少必要分支或不适用理由。');
    for (const node of nodes.values()) {
      check(incoming.get(node.id) === (node.id === tree.rootId ? 0 : 1), '业务树必须只有一个根，其他节点只能有一个父节点。');
      check(node.kind === 'decision' ? outgoing.get(node.id).length >= 2 : outgoing.get(node.id).length === 0,
        '判断节点至少需要两条条件分支，下一步动作不能再连接子节点。');
    }
    const queue = [{ id: tree.rootId, depth: 1 }];
    const visited = new Set();
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const item = queue[cursor];
      check(!visited.has(item.id), '业务树存在循环或重复到达的节点。');
      check(item.depth <= 40, '业务树超出支持范围：最多40层。');
      visited.add(item.id);
      for (const edge of outgoing.get(item.id)) queue.push({ id: edge.to, depth: item.depth + 1 });
    }
    check(visited.size === nodes.size, '业务树包含不可到达的节点或循环。');
    return { ok: true };
  } catch (error) { return resultError(error); }
}

function utcTimestamp(value) {
  if (!textValue(value) || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  const iso = date.toISOString();
  return iso === value || iso.replace('.000Z', 'Z') === value ? iso : null;
}

function calendarDate(value) {
  if (value === null) return true;
  if (!textValue(value) || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function checkTarget(target) {
  check(object(target) && ['metric', 'unit', 'subject', 'channel', 'cohort'].every(key => nullableText(target[key])), '观察指标或口径结构无效。');
}

function checkWindow(window, withDescription = true) {
  check(object(window) && calendarDate(window.start) && calendarDate(window.end)
    && (!withDescription || nullableText(window.description)), '观察窗口结构或日期无效。');
}

function checkSnapshot(state, pathId) {
  check(object(state) && state.contractVersion === 'demo.v1' && object(state.round)
    && object(state.input), '无法读取受支持的会话结构。');
  check(validId(state.round.id) && positiveInt(state.round.index) && positiveInt(state.round.inputVersion)
    && Number.isSafeInteger(state.revision) && state.revision >= 0, '会话轮次或版本无效。');
  check(state.input.confirmedVersion !== null && state.input.confirmedVersion !== undefined,
    '请先回到第一页确认本轮问题与可用材料。', 'invalid_transition');
  check(state.input.confirmedVersion === state.round.inputVersion, '输入已变更，请重新确认后生成报告。', 'stale_input');
  const analysis = state.analysis;
  check(object(analysis), '尚无可导出的分析，请先完成本轮分析。', 'invalid_transition');
  check(analysis.status !== 'stale' && analysis.roundId === state.round.id
    && analysis.inputVersion === state.round.inputVersion, '分析已过期，不能导出为当前报告。', 'stale_input');
  check(validId(analysis.id) && ['ready', 'limited', 'insufficient'].includes(analysis.status)
    && ['demo_fixture', 'local_limited'].includes(analysis.mode)
    && utcTimestamp(analysis.savedAt) !== null && Array.isArray(analysis.paths)
    && nullableText(analysis.summary) && arrayOfText(analysis.limitations), '分析结构、来源模式或保存版本无效。');
  check(state.fixtureId === null || validId(state.fixtureId), '演示来源标识无效。');
  check(analysis.mode !== 'demo_fixture' || validId(state.fixtureId), '合成分析缺少显式演示来源标识。');
  check(validId(pathId), '路径标识无效。');
  const paths = analysis.paths.filter(path => object(path) && path.id === pathId);
  check(paths.length === 1, '当前分析中没有唯一对应的路径。', 'invalid_transition');
  check(Array.isArray(state.input.facts) && Array.isArray(state.input.materials), '事实或材料索引缺失。');
  const facts = new Map();
  for (const fact of state.input.facts) {
    check(object(fact) && validId(fact.id) && !facts.has(fact.id), '事实索引包含无效或重复ID。');
    facts.set(fact.id, fact);
  }
  return { analysis, path: paths[0], facts };
}

function checkPath(path, facts) {
  check(nonempty(path.title) && nonempty(path.action) && Array.isArray(path.prerequisites)
    && object(path.cost) && Array.isArray(path.risk) && Array.isArray(path.evidenceRefs)
    && Array.isArray(path.counterEvidence) && object(path.estimate) && object(path.experiment), '路径内容不完整或结构无效。');
  const treeResult = validateDecisionTree(path.tree);
  if (!treeResult.ok) fail(treeResult.message, treeResult.code);
  const estimate = path.estimate;
  check(['scenario', 'unavailable'].includes(estimate.kind) && Array.isArray(estimate.assumptions)
    && Array.isArray(estimate.values) && arrayOfText(estimate.limitations)
    && object(estimate.incrementalEffect) && estimate.incrementalEffect.kind === 'unavailable'
    && nonempty(estimate.incrementalEffect.reason), '估算类型或行动增量声明不受支持。');
  checkTarget(estimate.target);
  checkWindow(estimate.horizon);
  const assumptions = new Map();
  const usedFacts = new Set();
  const checkFacts = refs => {
    check(arrayOfIds(refs), '事实引用的格式无效。');
    for (const id of refs) { check(facts.has(id), '路径引用了当前输入版本中不存在的事实。'); usedFacts.add(id); }
  };
  for (const assumption of estimate.assumptions) {
    check(object(assumption) && validId(assumption.id) && !assumptions.has(assumption.id)
      && nonempty(assumption.label) && nullableText(assumption.unit) && nullableText(assumption.note)
      && (assumption.value === null || textValue(assumption.value) || finite(assumption.value)), '情景假设无效或ID重复。');
    checkFacts(assumption.sourceFactIds);
    assumptions.set(assumption.id, assumption);
  }
  const checkAssumptions = refs => {
    check(arrayOfIds(refs) && refs.every(id => assumptions.has(id)), '条件引用了本路径中不存在的假设。');
  };
  const condition = value => { checkCondition(value); checkFacts(value.sourceFactIds); checkAssumptions(value.assumptionIds); };
  for (const item of path.prerequisites) {
    condition(item);
    check(['met', 'unmet', 'unknown'].includes(item.status), '前置条件状态无效。');
  }
  for (const [key, unit] of [['money', 'CNY'], ['time', 'minute']]) {
    const cost = path.cost[key];
    check(object(cost) && cost.unit === unit && ['known', 'scenario', 'unknown'].includes(cost.basis)
      && (cost.basis === 'unknown' ? cost.value === null : finite(cost.value) && cost.value >= 0)
      && nullableText(cost.note), '资金或时间投入无效；未知投入不能写成零。');
    checkFacts(cost.sourceFactIds);
  }
  for (const risk of path.risk) {
    check(object(risk) && validId(risk.id) && nonempty(risk.description), '风险结构无效。');
    checkFacts(risk.sourceFactIds);
    checkAssumptions(risk.assumptionIds);
    for (const key of ['trigger', 'stop', 'restore']) if (risk[key] !== null) condition(risk[key]);
  }
  for (const evidence of [...path.evidenceRefs, ...path.counterEvidence]) {
    check(object(evidence) && validId(evidence.id) && Object.hasOwn(EVIDENCE_KINDS, evidence.kind)
      && nonempty(evidence.summary) && nullableText(evidence.calculation) && Array.isArray(evidence.sourceIds), '证据或反证结构无效。');
    checkFacts(evidence.factIds);
    for (const sourceId of evidence.sourceIds) {
      check(textValue(sourceId), '来源定位标识无效。');
      if (sourceId === 'input:description' || sourceId === 'input:focus') continue;
      const match = /^(material|fact|question):([A-Za-z0-9_-]{1,80})$/.exec(sourceId);
      check(match && validId(match[2]), '来源定位标识不受支持。');
      if (match[1] === 'fact') checkFacts([match[2]]);
    }
  }
  if (estimate.kind === 'scenario') {
    check(object(estimate.calculation) && estimate.calculation.method === 'visitors_times_rate'
      && nonempty(estimate.calculation.displayFormula) && estimate.values.length > 0, '情景缺少受支持的算式或结果。');
    const valueIds = new Set();
    for (const value of estimate.values) {
      check(object(value) && validId(value.id) && !valueIds.has(value.id) && nonempty(value.label)
        && assumptions.has(value.visitorAssumptionId) && assumptions.has(value.rateAssumptionId)
        && finite(value.value), '情景结果或参数引用无效。');
      valueIds.add(value.id);
      const visitors = assumptions.get(value.visitorAssumptionId).value;
      const rate = assumptions.get(value.rateAssumptionId).value;
      check(finite(visitors) && visitors >= 0 && finite(rate) && rate >= 0 && rate <= 1, '情景访客或支付率参数不在合法范围。');
      const expected = visitors * rate;
      check(Number.isFinite(expected) && Math.abs(expected - value.value) <= Math.max(1, Math.abs(expected)) * 1e-10,
        '情景结果与所引用参数的乘法不一致。');
    }
  } else {
    check(estimate.calculation === null && estimate.values.length === 0 && estimate.limitations.some(nonempty), '不可估状态需保留原因，且不能夹带数值结果。');
  }
  const experiment = path.experiment;
  check(nonempty(experiment.change) && arrayOfText(experiment.keepFixed) && arrayOfText(experiment.limitations)
    && (experiment.minSample === null || finite(experiment.minSample) && experiment.minSample >= 0)
    && Array.isArray(experiment.stopConditions) && Array.isArray(experiment.restoreConditions), '实验或停止恢复计划结构无效。');
  checkTarget(experiment.target);
  checkWindow(experiment.window);
  checkFacts(experiment.sourceFactIds);
  checkAssumptions(experiment.assumptionIds);
  for (const item of [...experiment.stopConditions, ...experiment.restoreConditions]) condition(item);
  for (const edge of path.tree.edges) condition(edge.condition);
  // Include the referenced fact chain only, never all inputs or other paths.
  const queue = [...usedFacts];
  const queued = new Set(queue);
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const fact = facts.get(queue[cursor]);
    check(object(fact.source) && Object.hasOwn(SOURCE_KINDS, fact.source.kind)
      && ['known', 'unknown', 'not_applicable'].includes(fact.availability)
      && Object.hasOwn(VERIFICATIONS, fact.verification), '引用事实的来源或核对状态无效。');
    checkWindow(fact.window, false);
    check(['unit', 'subject', 'channel', 'cohort'].every(key => nullableText(fact[key])), '引用事实的口径无效。');
    check(fact.availability === 'known'
      ? fact.value !== null && fact.value !== undefined && (typeof fact.value !== 'number' || finite(fact.value))
      : fact.value === null, '事实值与已知 / 未知状态不一致。');
    const refs = fact.source.sourceFactIds ?? [];
    checkFacts(refs);
    for (const id of refs) if (!queued.has(id)) { queued.add(id); queue.push(id); }
  }
  return { assumptions, usedFacts: [...usedFacts] };
}

function makeTextRenderer(state, allow) {
  const names = state.input.materials.map(item => object(item) ? item.name : null)
    .filter(name => textValue(name) && name.length >= 4);
  return value => {
    if (value === null || value === undefined || value === '') return '未知';
    if (!allow) return OMITTED;
    if (!['string', 'number', 'boolean'].includes(typeof value)) return '结构化内容未纳入摘要，请在页面核对';
    let text = String(value);
    // These are additional omissions, not a claim of automatic privacy review.
    for (const name of names) text = text.split(name).join('[原件名已省略]');
    text = text.replace(/(?:\b[A-Za-z]:[\\/]|\\\\|file:\/\/)[^\s<>"']+/gi, '[本机路径已省略]')
      .replace(/\/(?:Users|home|tmp|var|mnt|private|Volumes)\/[^\s<>"']+/g, '[本机路径已省略]')
      .replace(/https?:\/\/[^\s<>"']+/gi, '[外部地址已省略]')
      .replace(/\b(?:Bearer\s+[A-Za-z0-9._~+\/-]+|sk-[A-Za-z0-9_-]{12,})\b/g, '[凭据已省略]')
      .replace(/\b(?:api[_-]?key|access[_-]?token|password|secret)\s*[:=]\s*[^\s,;]+/gi, '[凭据已省略]')
      .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[联系信息已省略]')
      .replace(/(?:\+?86[- ]?)?\b1[3-9]\d{9}\b/g, '[联系信息已省略]')
      .replace(/\b\d{15,19}[Xx]?\b/g, '[身份或账户号码已省略]');
    return escapeHTML(text);
  };
}

function locatorText(locator, render) {
  if (!object(locator)) return '未提供可核对定位';
  const line = number => positiveInt(number) ? String(number) : '未知';
  switch (locator.type) {
    case 'input': return locator.field === 'focus' ? '本轮关注范围字段' : locator.field === 'description' ? '问题描述字段' : '字段未知';
    case 'question': return validId(locator.questionId) ? `补问 ${escapeHTML(locator.questionId)}` : '补问定位未知';
    case 'text': return `文本第 ${line(locator.lineStart)}—${line(locator.lineEnd)} 行`;
    case 'csv': return `CSV记录 ${line(locator.recordIndex)}，第 ${line(locator.lineStart)}—${line(locator.lineEnd)} 行，列 ${render(locator.column)}`;
    case 'json': return `JSON字段 ${render(locator.pointer)}`;
    case 'correction': return validId(locator.factId) ? `事实 ${escapeHTML(locator.factId)} 的更正，输入版本 ${line(locator.inputVersion)}` : '更正定位未知';
    default: return '定位类型不受支持，请在页面核对';
  }
}

const STYLE = `
  :root { color-scheme: light; font-family: "Microsoft YaHei", "PingFang SC", system-ui, sans-serif; color: #252421; background: #fff; }
  * { box-sizing: border-box; } body { margin: 0; font-size: 15px; line-height: 1.8; }
  main { max-width: 1000px; margin: 0 auto; padding: 48px 36px 64px; }
  header { border-bottom: 2px solid #c5482d; padding-bottom: 28px; } h1 { font-size: 29px; line-height: 1.5; margin: 8px 0 16px; }
  h2 { margin: 36px 0 14px; font-size: 21px; } h3 { margin: 23px 0 8px; font-size: 17px; }
  p, ul, ol { margin: 8px 0 14px; } li + li { margin-top: 8px; } small, .muted { color: #6d6962; }
  .notice { border-left: 3px solid #c5482d; background: #faf7f2; padding: 12px 18px; }
  dl { display: grid; grid-template-columns: minmax(130px, 180px) minmax(0, 1fr); gap: 5px 18px; }
  dt { color: #6d6962; } dd { margin: 0; overflow-wrap: anywhere; }
  table { border-collapse: collapse; width: 100%; margin: 12px 0 18px; font-size: 14px; }
  th, td { border-bottom: 1px solid #ddd7cf; padding: 10px 12px; text-align: left; vertical-align: top; overflow-wrap: anywhere; }
  th { background: #faf7f2; font-weight: 600; } code { font-family: ui-monospace, monospace; overflow-wrap: anywhere; }
  .multiline { white-space: pre-wrap; overflow-wrap: anywhere; } .node { margin-bottom: 22px; }
  footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid #ddd7cf; }
  @media (max-width: 600px) { main { padding: 24px 18px 36px; } dl { grid-template-columns: 1fr; gap: 0; } dd { margin-bottom: 9px; } th, td { padding: 8px 5px; } h1 { font-size: 24px; } }
  @page { size: A4; margin: 16mm; }
  @media print { main { max-width: none; padding: 0; } body { font-size: 10pt; } h1 { font-size: 20pt; } h2 { font-size: 14pt; break-after: avoid; } h3 { break-after: avoid; } tr, .node { break-inside: avoid; } thead { display: table-header-group; } .notice { background: none; } }
`;

/** No DOM, storage, event, download, randomness, or current-clock side effects. */
export function buildPathReport(state, pathId, { exportId, generatedAt, allowSummaries = false } = {}) {
  try {
    check(validId(exportId) && utcTimestamp(generatedAt) !== null && typeof allowSummaries === 'boolean',
      '导出标识、UTC生成时间或摘要授权值无效。', 'invalid_export_metadata');
    const { analysis, path, facts } = checkSnapshot(state, pathId);
    const { assumptions, usedFacts } = checkPath(path, facts);
    const metadata = {
      exportVersion: 'demo.export.v1', contractVersion: state.contractVersion, exportId,
      generatedAt: utcTimestamp(generatedAt), sourceRevision: state.revision,
      roundId: state.round.id, roundIndex: state.round.index, inputVersion: state.round.inputVersion,
      analysisId: analysis.id, pathId: path.id, mode: analysis.mode, fixtureId: state.fixtureId,
    };
    const allowed = analysis.mode === 'demo_fixture' || allowSummaries;
    const render = makeTextRenderer(state, allowed);
    const list = (items, fallback = '未提供，保持未知') => items.length
      ? `<ul>${items.map(item => `<li class="multiline">${render(item)}</li>`).join('')}</ul>` : `<p>${escapeHTML(fallback)}</p>`;
    const refs = (factIds = [], assumptionIds = []) => {
      const parts = [];
      if (factIds.length) parts.push(`事实 ${factIds.map(escapeHTML).join('、')}`);
      if (assumptionIds.length) parts.push(`假设 ${assumptionIds.map(escapeHTML).join('、')}`);
      return parts.length ? `<small>依据：${parts.join('；')}</small>` : '<small>未提供关联事实或假设</small>';
    };
    const condition = item => item === null ? '未知，需补充核对'
      : `${render(item.text)}<br>${refs(item.sourceFactIds, item.assumptionIds)}`;
    const target = item => `<dl><dt>指标 / 单位</dt><dd>${render(item.metric)} / ${render(item.unit)}</dd><dt>对象</dt><dd>${render(item.subject)}</dd><dt>渠道 / 群体</dt><dd>${render(item.channel)} / ${render(item.cohort)}</dd></dl>`;
    const window = item => `${render(item.description)}；${render(item.start)} 至 ${render(item.end)}`;
    const sourceLabel = sourceId => {
      const [kind, id] = sourceId.split(':');
      const missing = kind === 'material' && !state.input.materials.some(item => object(item) && item.id === id)
        || kind === 'question' && state.round.clarification?.questionId !== id;
      return `${escapeHTML(sourceId)}${missing ? '（来源已更新 / 原件已移除）' : ''}`;
    };
    const evidence = items => items.length ? items.map(item => `<article><h3>${escapeHTML(EVIDENCE_KINDS[item.kind])} <code>${escapeHTML(item.id)}</code></h3><p class="multiline">${render(item.summary)}</p>${item.calculation === null ? '' : `<p class="multiline">计算：${render(item.calculation)}</p>`}<p>${refs(item.factIds)}</p><p>来源定位：${item.sourceIds.length ? item.sourceIds.map(sourceLabel).join('、') : '未提供 / 不可核对'}</p></article>`).join('') : '<p>未提供，不能据此推定不存在反面线索。</p>';
    const sourceFacts = usedFacts.map(id => {
      const fact = facts.get(id);
      const source = fact.source;
      const material = validId(source.materialId) ? state.input.materials.find(item => object(item) && item.id === source.materialId) : null;
      const materialLabel = source.materialId === null ? '' : !material ? '原件已移除或不可用'
        : material.version !== source.materialVersion ? '原件版本已更新；此处仅为对应旧版本摘要' : '仅列内部材料标识，不含原件';
      const factValue = fact.availability === 'unknown' ? '未知' : fact.availability === 'not_applicable' ? '不适用' : render(fact.value);
      return `<tr><td><code>${escapeHTML(id)}</code><br>${render(fact.key)}</td><td>${factValue} ${render(fact.unit)}<br>对象：${render(fact.subject)}<br>窗口：${render(fact.window.start)} 至 ${render(fact.window.end)}<br>渠道 / 群体：${render(fact.channel)} / ${render(fact.cohort)}</td><td>${escapeHTML(SOURCE_KINDS[source.kind])}<br>${escapeHTML(VERIFICATIONS[fact.verification])}<br>${validId(source.materialId) ? `材料 ${escapeHTML(source.materialId)} / 版本 ${positiveInt(source.materialVersion) ? source.materialVersion : '未知'}<br>` : ''}${locatorText(source.locator, render)}<br>${materialLabel ? `${escapeHTML(materialLabel)}<br>` : ''}${render(source.note)}</td></tr>`;
    }).join('');
    const costs = [['money', '资金', '元'], ['time', '时间', '分钟']].map(([key, label, unit]) => {
      const cost = path.cost[key];
      return `<tr><th scope="row">${label}</th><td>${cost.basis === 'unknown' ? '未知' : `${render(cost.value)} ${unit}`}</td><td>${escapeHTML({ known: '已提供依据', scenario: '情景假设', unknown: '未知' }[cost.basis])}<br>${render(cost.note)}<br>${refs(cost.sourceFactIds)}</td></tr>`;
    }).join('');
    const estimate = path.estimate;
    const scenario = estimate.kind === 'scenario' ? `<p class="multiline">${render(estimate.calculation.displayFormula)}</p><table><thead><tr><th>情景</th><th>可复算的条件</th><th>条件下期望结果</th></tr></thead><tbody>${estimate.values.map(item => `<tr><td>${render(item.label)}</td><td>${render(assumptions.get(item.visitorAssumptionId).value)} × ${render(assumptions.get(item.rateAssumptionId).value)}<br><small>假设 ${escapeHTML(item.visitorAssumptionId)} × ${escapeHTML(item.rateAssumptionId)}</small></td><td>${render(item.value)} ${render(estimate.target.unit)}</td></tr>`).join('')}</tbody></table>` : '<p>暂不可估；没有足够依据构造数值结果。</p>';
    const nodes = new Map(path.tree.nodes.map(node => [node.id, node]));
    const tree = path.tree.nodes.map(node => `<li class="node"><h3>${escapeHTML(node.kind === 'decision' ? '经营观察' : '下一步动作')}：${render(node.title)}</h3><p><code>${escapeHTML(node.id)}</code>${node.id === path.tree.rootId ? '（根节点）' : ''}</p><p class="multiline">${render(node.detail)}</p>${path.tree.edges.some(edge => edge.from === node.id) ? `<ul>${path.tree.edges.filter(edge => edge.from === node.id).map(edge => `<li><strong>${escapeHTML(BRANCHES[edge.branch])}</strong> <code>${escapeHTML(edge.id)}</code><p class="multiline">${condition(edge.condition)}</p><p>随后：${render(nodes.get(edge.to).title)} <code>${escapeHTML(edge.from)} → ${escapeHTML(edge.to)}</code></p></li>`).join('')}</ul>` : '<p>此分支到此结束，后续仍需按观察和风险核对。</p>'}</li>`).join('');
    const focus = nonempty(state.input.focus) ? state.input.focus : textValue(state.input.description) ? state.input.description : null;
    const excerpt = textValue(focus) && focus.length > 600 ? `${focus.slice(0, 600)}（节选；完整问题请在页面核对）` : focus;
    const metadataHTML = Object.entries(metadata).map(([key, value]) => `<dt>${escapeHTML(key)}</dt><dd><code>${value === null ? '未知 / 未使用' : escapeHTML(value)}</code></dd>`).join('');
    const provenance = analysis.mode === 'demo_fixture' ? '合成演示' : '本机有限整理 / 参考稿';
    const privacy = allowed ? '仅纳入本次允许的必要摘要。来源核对不等于商家数据已被证实真实。'
      : '本次未确认真实材料摘要的导出许可，相关业务内容显示“摘要未获确认”；树的结构和内部标识保留。';
    const html = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>单路径决策报告</title><style>${STYLE}</style></head>
<body><main><header><p>${escapeHTML(provenance)} · 单路径决策报告</p><h1>${render(path.title)}</h1><p class="notice">${escapeHTML(privacy)} 本报告不代表已选路、已采用或已执行，不承诺经营效果。</p><p>可离线阅读；请使用浏览器“打印”查看打印版。本文件是HTML，不是已生成的PDF。</p></header>
<section><h2>1. 本轮问题与版本</h2><p class="multiline">${render(excerpt)}</p>${target(estimate.target)}<p>观察期：${window(estimate.horizon)}</p><dl>${metadataHTML}</dl><p>本机生成时间不等于实际执行时间，也不是可信审计时钟。</p></section>
<section><h2>2. 路径动作与前置条件</h2><p class="multiline">${render(path.action)}</p>${path.prerequisites.length ? `<ul>${path.prerequisites.map(item => `<li>${escapeHTML({ met: '已满足', unmet: '未满足', unknown: '未知' }[item.status])}：${condition(item)}</li>`).join('')}</ul>` : '<p>未提供前置条件，执行前需核对适用范围。</p>'}<h3>资金与时间投入</h3><table><thead><tr><th>投入</th><th>数值</th><th>性质与依据</th></tr></thead><tbody>${costs}</tbody></table><p>预算或时间上限不是保证的最大损失；未知不等于零。</p></section>
<section><h2>3. 支持依据、反面线索与来源</h2><h3>支持依据</h3>${evidence(path.evidenceRefs)}<h3>反面线索 / 不支持的材料</h3>${evidence(path.counterEvidence)}<h3>当前路径所引用的事实摘要</h3>${sourceFacts ? `<table><thead><tr><th>内部事实标识</th><th>值及适用口径</th><th>来源定位与核对状态</th></tr></thead><tbody>${sourceFacts}</tbody></table>` : '<p>未提供可引用事实，不能将推断称为已核实结论。</p>'}<p>只列相关摘要与内部定位，不附原件、完整导入文本或其他路径。</p></section>
<section><h2>4. 结果类型、假设与可复算依据</h2><p><strong>${estimate.kind === 'scenario' ? '假设下的情景测算' : '暂不可估'}</strong></p>${target(estimate.target)}<p>观察期：${window(estimate.horizon)}</p>${estimate.assumptions.length ? `<ul>${estimate.assumptions.map(item => `<li><code>${escapeHTML(item.id)}</code> ${render(item.label)}：${render(item.value)} ${render(item.unit)}<p>${render(item.note)}<br>${refs(item.sourceFactIds)}</p></li>`).join('')}</ul>` : '<p>没有可用情景假设。</p>'}${scenario}<p class="notice">情景只表示给定假设下的期望值，不是统计置信区间、成功概率或实际结果必落入的上下界；不同情景之差不等于行动收益。</p>${list(estimate.limitations)}<h3>行动增量</h3><p>无法估计行动增量。</p><p>${render(estimate.incrementalEffect.reason)}</p></section>
<section><h2>5. 风险、停止与恢复</h2>${path.risk.length ? path.risk.map(item => `<article><h3>${render(item.description)}</h3><p>${refs(item.sourceFactIds, item.assumptionIds)}</p><dl><dt>触发条件</dt><dd>${condition(item.trigger)}</dd><dt>停止条件</dt><dd>${condition(item.stop)}</dd><dt>恢复 / 回滚</dt><dd>${condition(item.restore)}</dd></dl></article>`).join('') : '<p>未提供具体风险清单，不代表没有风险。</p>'}</section>
<section><h2>6. 小范围验证计划</h2><p>单一修改对象：${render(path.experiment.change)}</p><h3>保持不变</h3>${list(path.experiment.keepFixed)}${target(path.experiment.target)}<p>观察窗口：${window(path.experiment.window)}</p><p>最低样本：${render(path.experiment.minSample)}；不将该值当作效果已获证明的门槛。</p><p>${refs(path.experiment.sourceFactIds, path.experiment.assumptionIds)}</p>${list(path.experiment.limitations)}<h3>停止</h3>${path.experiment.stopConditions.length ? `<ul>${path.experiment.stopConditions.map(item => `<li>${condition(item)}</li>`).join('')}</ul>` : '<p>停止条件未知，需事先核对。</p>'}<h3>恢复 / 回滚</h3>${path.experiment.restoreConditions.length ? `<ul>${path.experiment.restoreConditions.map(item => `<li>${condition(item)}</li>`).join('')}</ul>` : '<p>恢复条件未知，不能承诺自动回滚。</p>'}</section>
<section><h2>7. 完整业务树（文字版）</h2><p>共 ${path.tree.nodes.length} 个节点、${path.tree.edges.length} 条条件分支。未反馈保持未知；正向变化不证明建议有效，恶化不自动归因于本行动。</p><ol>${tree}</ol><h3>不适用分支及原因</h3>${path.tree.notApplicableBranches.length ? `<ul>${path.tree.notApplicableBranches.map(item => `<li>${escapeHTML(BRANCHES[item.branch])}：${render(item.reason)}</li>`).join('')}</ul>` : '<p>六类分支均已在树中列出。</p>'}</section>
<section><h2>8. 本轮分析的已知限制</h2>${list(analysis.limitations)}</section><footer><p>文件只在本机生成，不代表云端同步或获准对外共享。删除应用内材料不能撤回已导出的文件。报告不包含真实模型调用、平台核验或MoneyAI记忆验证的证明。</p></footer></main></body></html>`;
    const stamp = metadata.generatedAt.replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
    return { ok: true, html, filename: `path-report-r${metadata.roundIndex}-i${metadata.inputVersion}-${metadata.pathId}-${stamp}.html`, metadata };
  } catch (error) { return resultError(error); }
}
