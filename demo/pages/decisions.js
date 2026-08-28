// Page-local view state only. All persisted data goes through shared/state.js.
const byId = (id) => document.getElementById(id);
const list = (value) => Array.isArray(value) ? value : [];
const text = (value, fallback = '未知') => typeof value === 'string' && value.trim() ? value : fallback;
const number = (value) => typeof value === 'number' && Number.isFinite(value);
const formatNumber = (value) => new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 6 }).format(value);
const labels = {
  source: { merchant_statement: '商家自述', file_extract: '文件提取', derived: '派生计算', public_reference: '公共参考', scenario_assumption: '情景假设' },
  verification: { unreviewed: '尚未核对', user_corrected: '用户更正', checked: '已核对对应原文或算式', conflicting: '存在冲突' },
  evidence: { observation: '观察', calculation: '计算', inference: '推断' },
  branch: { not_executed: '明确反馈尚未执行', insufficient_evidence: '尚无反馈或证据不足', risk_triggered: '触发风险', comparable_positive: '可比观察出现正向变化', comparable_unchanged: '可比观察没有明显变化', comparable_negative: '可比观察出现负向变化' },
  basis: { known: '来自已提供内容', scenario: '情景假设', unknown: '尚未提供' },
  metric: { paid_orders: '支付订单', product_detail_visitors: '商品详情访客', published_videos: '发布视频', price: '售价', units_per_order: '每单件数', external_length: '外尺寸长度', external_width: '外尺寸宽度', external_height: '外尺寸高度', dimension_scope: '尺寸口径', current_title: '当前标题', current_opening: '当前说明开头', selected_inquiries: '选取的咨询摘录' },
};

let api = null;
let state = null;
let viewedPathId = null;
let renderedSignature = '';
let busy = false;
let pathInvalid = false;
let subscriptionFailed = false;
let readFailureVisible = false;
let booting = false;
let unsubscribe = null;
let commandQueue = Promise.resolve();
let pendingExport = null;
const pendingCommands = new Map();
const pendingEvents = new Map();
const seenEvents = new Set();

function element(tag, className, value) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (value !== undefined) node.textContent = String(value);
  return node;
}

function appendParagraph(parent, value, className = '') {
  parent.append(element('p', className, text(value)));
}

function appendList(parent, values, fallback = null) {
  const entries = list(values);
  if (!entries.length) {
    if (fallback) appendParagraph(parent, fallback, 'muted');
    return;
  }
  const ul = element('ul', 'decisions-notes');
  entries.forEach((value) => ul.append(element('li', '', text(value))));
  parent.append(ul);
}

function addDefinition(parent, title, value, note) {
  const group = element('div');
  group.append(element('dt', '', title));
  const dd = element('dd');
  dd.append(element('span', note !== undefined ? 'cost-value' : '', value));
  if (note) dd.append(element('span', 'cost-note', note));
  group.append(dd);
  parent.append(group);
}

function message(value, kind = 'info') {
  const node = byId('decisions-message');
  node.textContent = value || '';
  node.dataset.kind = kind;
  node.hidden = !value;
}

function currentAnalysis(snapshot) {
  return Boolean(snapshot?.analysis && snapshot.input?.confirmedVersion === snapshot.round?.inputVersion
    && snapshot.analysis.roundId === snapshot.round.id
    && snapshot.analysis.inputVersion === snapshot.round.inputVersion
    && ['ready', 'limited', 'insufficient'].includes(snapshot.analysis.status));
}

function confirmed(snapshot) {
  return Boolean(snapshot?.round && snapshot.input
    && snapshot.input.confirmedVersion === snapshot.round.inputVersion);
}

function identity(snapshot, pathId) {
  return [snapshot?.sessionId, snapshot?.round?.id, snapshot?.round?.inputVersion, snapshot?.analysis?.id, pathId].join('|');
}

function selectedPath(snapshot = state) {
  return list(snapshot?.analysis?.paths).find((path) => path.id === viewedPathId) || null;
}

function setBusy(value) {
  busy = value;
  const valid = currentAnalysis(state) && selectedPath() && !pathInvalid && !subscriptionFailed;
  byId('choose-path').disabled = busy || !valid;
  byId('download-report').disabled = busy || !valid;
  byId('refresh-analysis').disabled = busy || !confirmed(state);
  byId('retry-load').disabled = busy;
  byId('retry-event').disabled = busy;
  byId('defer-choice').disabled = busy;
  document.querySelectorAll('[data-action="return"], .path-choice').forEach((node) => { node.disabled = busy; });
  byId('path-detail').setAttribute('aria-busy', String(busy));
}

function serialize(work) {
  const promise = commandQueue.then(work, work);
  commandQueue = promise.catch(() => {});
  return promise;
}

async function operate(work) {
  if (busy) return;
  setBusy(true);
  try {
    await serialize(work);
  } catch (error) {
    // Shared errors are displayed as text, never as executable markup.
    message(text(error?.message, '操作未完成。当前资料保留，请重试。'), 'error');
  } finally {
    setBusy(false);
  }
}

function fail(result, fallback) {
  const error = new Error(text(result?.message, fallback));
  error.code = result?.code || 'operation_failed';
  throw error;
}

function showStart(title, description, { retry = true, goBack = true, backLabel = '先说说情况' } = {}) {
  byId('decisions-start').hidden = false;
  byId('decisions-content').hidden = true;
  byId('start-title').textContent = title;
  byId('start-description').textContent = description;
  byId('retry-load').hidden = !retry;
  byId('start-return').hidden = !goBack;
  byId('start-return').textContent = backLabel;
}

function stateShape(snapshot) {
  return snapshot?.contractVersion === 'demo.v1' && snapshot.round && snapshot.input
    && Number.isInteger(snapshot.round.inputVersion) && Number.isInteger(snapshot.revision);
}

function applyState(next) {
  if (!stateShape(next)) {
    showStart('暂时无法读取这份会话', '会话结构或契约版本不兼容。不会自动覆盖已有资料。');
    state = null;
    renderedSignature = '';
    setBusy(busy);
    return false;
  }
  // A late load/dispatch response must not undo a newer subscription snapshot.
  if (state?.sessionId === next.sessionId && next.revision < state.revision) return true;
  const signature = JSON.stringify([next.sessionId, next.round.id, next.round.inputVersion,
    next.input.confirmedVersion, next.analysis?.id, next.analysis?.status,
    next.selection?.analysisId, next.selection?.pathId, next.savedAt === null]);
  state = next;
  if (signature !== renderedSignature) {
    renderedSignature = signature;
    pendingExport = null;
    byId('report-consent').checked = false;
    renderState();
  }
  setBusy(busy);
  return true;
}

async function readState() {
  const result = await api.loadSession();
  if (!result?.ok) {
    readFailureVisible = true;
    fail(result, '读取共享资料失败，未将失败当作空会话。');
  }
  if (readFailureVisible) { readFailureVisible = false; message(''); }
  subscriptionFailed = false;
  if (!applyState(result.state)) fail({ code: 'incompatible_version' }, '会话结构不兼容。');
  return state;
}

function subscribe() {
  if (unsubscribe) unsubscribe();
  unsubscribe = api.subscribeSession((result) => {
    if (!result?.ok) {
      readFailureVisible = true;
      message(text(result?.message, '跨页更新未能读回，当前内容暂不能用于选择或导出。'), 'error');
      subscriptionFailed = true;
      setBusy(busy);
      return;
    }
    if (state?.sessionId === result.state?.sessionId && result.state.revision < state.revision) return;
    const previous = state;
    if (readFailureVisible) { readFailureVisible = false; message(''); }
    subscriptionFailed = false;
    applyState(result.state);
    if (previous && (previous.round.id !== state?.round.id || previous.round.inputVersion !== state?.round.inputVersion)) {
      message('资料已在其他页面更新。旧判断不能继续用于选择或下载，请先核对当前资料。');
    }
  });
}

function eventWarning() {
  byId('decisions-log-warning').hidden = pendingEvents.size === 0;
  if (pendingEvents.size) {
    byId('decisions-log-message').textContent = '查看或下载操作已发生，但操作记录尚未保存。重试只补记日志，不会重新下载、选择或执行。';
  }
}

function recordEvent(type, refs, snapshot, onceKey = null) {
  if (!snapshot || (onceKey && seenEvents.has(onceKey))) return;
  if (onceKey) seenEvents.add(onceKey);
  const commandId = crypto.randomUUID();
  const entry = { sessionId: snapshot.sessionId, command: {
    type: 'EVENT_APPEND', commandId,
    payload: { event: { type, roundId: snapshot.round.id, refs } },
  } };
  pendingEvents.set(commandId, entry);
  void serialize(() => saveEvent(entry)).catch(() => eventWarning());
}

async function saveEvent(entry) {
  try {
    const loaded = await api.loadSession();
    if (!loaded?.ok || loaded.state.sessionId !== entry.sessionId) { eventWarning(); return; }
    const result = await api.dispatch({ ...entry.command, expectedRevision: loaded.state.revision });
    if (!result?.ok) { eventWarning(); return; }
    pendingEvents.delete(entry.command.commandId);
    applyState(result.state);
  } catch {
    // Failure to log cannot undo a browser operation or erase the page.
  }
  eventWarning();
}

function recordVisiblePath(path) {
  if (!currentAnalysis(state)) return;
  recordEvent('path_viewed', { pageId: 'decisions', analysisId: state.analysis.id, pathId: path.id, inputVersion: state.round.inputVersion },
    state, `view:${identity(state, path.id)}`);
}

async function dispatchIntent(key, type, payload, snapshot) {
  let entry = pendingCommands.get(key);
  if (!entry) {
    entry = { command: { type, payload, commandId: crypto.randomUUID() }, roundId: snapshot.round.id, inputVersion: snapshot.round.inputVersion };
    pendingCommands.set(key, entry);
  }
  if (entry.roundId !== snapshot.round.id || entry.inputVersion !== snapshot.round.inputVersion) {
    fail({ code: 'stale_input', message: '资料版本已经变化，不能重试旧操作。请重新核对。' });
  }
  const result = await api.dispatch({ ...entry.command, expectedRevision: snapshot.revision });
  if (!result?.ok) {
    if (result?.state) applyState(result.state);
    fail(result, '保存没有完成，资料仍保留在当前页面，可以重试。');
  }
  pendingCommands.delete(key);
  applyState(result.state);
  return state;
}

async function generateAnalysis() {
  const snapshot = await readState();
  if (!confirmed(snapshot)) fail({ code: 'invalid_transition', message: '请先回第一页确认本轮问题与资料。' });
  const key = `analysis:${snapshot.round.id}:${snapshot.round.inputVersion}`;
  let draft = pendingCommands.get(key)?.command.payload.analysis;
  if (!draft) {
    const generated = api.buildDemoAnalysis(structuredClone(snapshot));
    if (!generated?.ok) fail(generated, '本机分析生成失败，没有替换成预编答案。');
    draft = generated.analysis;
  }
  const saved = await dispatchIntent(key, 'ANALYSIS_SET', { analysis: draft }, snapshot);
  message(saved.analysis?.mode === 'demo_fixture'
    ? '已生成当前合成资料对应的演示判断，未调用真实模型。'
    : '已根据当前资料完成本机有限分析，不能确定的部分仍保留未知。');
}

async function refreshSession(autoAnalyze = true) {
  await operate(async () => {
    let snapshot;
    try {
      snapshot = await readState();
    } catch (error) {
      if (!state) showStart('资料暂时没有读回', '共享存储读取失败，不能将其当成首次访问。已有资料不会被空会话覆盖，请重试。');
      throw error;
    }
    recordEvent('page_viewed', { pageId: 'decisions', inputVersion: snapshot.round.inputVersion }, snapshot, `page:${snapshot.sessionId}`);
    if (snapshot.savedAt) recordEvent('session_read', { pageId: 'decisions', stateRevision: snapshot.revision }, snapshot, `read:${snapshot.sessionId}`);
    if (autoAnalyze && confirmed(snapshot) && !currentAnalysis(snapshot)) await generateAnalysis();
  });
}

function renderScope() {
  byId('scope-question').textContent = text(state.input.focus, text(state.input.description, '本轮以已接收的材料为主，问题描述未提供。'));
  const facts = list(state.input.facts);
  const subjects = [...new Set(facts.map((fact) => fact.subject).filter((item) => typeof item === 'string' && item.trim()))];
  const windows = [...new Set(facts.filter((fact) => fact.window?.start || fact.window?.end)
    .map((fact) => `${text(fact.window.start, '起日未知')} 至 ${text(fact.window.end, '止日未知')}`))];
  const meta = byId('scope-meta');
  meta.replaceChildren();
  addDefinition(meta, '经营对象', subjects.length === 1 ? subjects[0] : subjects.length ? '多个对象，按各来源分别核对' : '未知');
  addDefinition(meta, '资料时间', windows.length === 1 ? windows[0] : windows.length ? '多个观察期，不拼接为同一漏斗' : '未知');
  addDefinition(meta, '输入版本', `第 ${state.round.index ?? '未知'} 轮 · v${state.round.inputVersion}`);
  const mode = state.analysis?.mode;
  addDefinition(meta, '分析来源', mode === 'demo_fixture' ? '合成演示 · 非真实模型' : mode === 'local_limited' ? '本机有限分析 · 非真实模型' : '尚未生成');
}

function renderState() {
  pathInvalid = false;
  const hasInput = Boolean(text(state.input.description, '') || list(state.input.materials).length);
  if (!confirmed(state) && !state.analysis) {
    showStart(hasInput ? '先确认这轮要看的问题' : '先说说情况，再看可选的路', hasInput
      ? '资料已保留，但本轮范围还没有确认。回到第一页核对后再继续。'
      : '这里还没有已确认的问题或材料。写一句现状，或放一份手头材料即可开始。',
    { retry: true, backLabel: hasInput ? '返回核对并确认' : '先说说情况' });
    return;
  }
  byId('decisions-start').hidden = true;
  byId('decisions-content').hidden = false;
  renderScope();
  const analysis = state.analysis;
  const valid = currentAnalysis(state);
  byId('stale-notice').hidden = !analysis || valid;
  byId('stale-description').textContent = `当前输入 v${state.round.inputVersion}，此分析基于 v${analysis?.inputVersion ?? '未知'}。旧内容只供查看，不能据此选路或下载当前报告。`;
  byId('analysis-summary').textContent = analysis ? text(analysis.summary, '现有资料暂不能支持明确判断。') : '尚未生成本轮判断。';
  const limitations = byId('analysis-limitations');
  limitations.replaceChildren();
  list(analysis?.limitations).forEach((value) => limitations.append(element('li', '', text(value))));
  if (analysis && !Array.isArray(analysis.paths)) {
    pathInvalid = true;
    message('分析的路径结构不完整，无法继续。请更新判断或返回核对。', 'error');
  }
  const paths = list(analysis?.paths);
  byId('no-paths').hidden = paths.length > 0 || !analysis;
  byId('path-workspace').hidden = paths.length === 0;
  const unknowns = byId('no-paths-unknowns');
  unknowns.replaceChildren();
  list(state.input.unknowns).forEach((entry) => unknowns.append(element('li', '', text(entry.description, '一项资料尚待核对'))));
  if (!paths.length) { viewedPathId = null; return; }
  if (!paths.some((path) => path.id === viewedPathId)) {
    const previousSelection = valid && state.selection?.analysisId === analysis.id ? state.selection.pathId : null;
    viewedPathId = paths.some((path) => path.id === previousSelection) ? previousSelection : paths[0].id;
  }
  renderPathList(paths);
  renderPath(selectedPath());
}

function costText(cost, unit) {
  if (!cost || cost.basis === 'unknown' || !number(cost.value) || cost.value < 0) return `${unit === '分钟' ? '时间' : '金额'}未知`;
  return `${formatNumber(cost.value)}${unit}${cost.basis === 'scenario' ? '（假设）' : ''}`;
}

function renderPathList(paths) {
  const container = byId('path-list');
  container.replaceChildren();
  byId('paths-count').textContent = `${paths.length} 条`;
  paths.forEach((path) => {
    const button = element('button', 'path-choice');
    button.type = 'button';
    button.dataset.pathId = path.id;
    button.setAttribute('aria-pressed', String(path.id === viewedPathId));
    button.setAttribute('aria-controls', 'path-detail');
    button.setAttribute('aria-label', `查看路径：${text(path.title, '未命名路径')}`);
    if (path.id === viewedPathId) button.append(element('span', 'path-choice-current', '正在查看'));
    button.append(element('span', 'path-choice-title', text(path.title, '未命名路径')));
    button.append(element('span', 'path-choice-action', text(path.action, '具体动作尚未提供')));
    button.append(element('span', 'path-choice-meta', `${costText(path.cost?.time, '分钟')} · ${costText(path.cost?.money, '元')}`));
    const risk = list(path.risk)[0];
    button.append(element('span', 'path-choice-meta', `主要代价：${text(risk?.description, '风险尚待核对')}`));
    button.addEventListener('click', () => {
      if (busy) return;
      viewedPathId = path.id;
      pendingExport = null;
      byId('report-consent').checked = false;
      renderPathList(paths);
      renderPath(path);
      setBusy(false);
      byId('path-title').focus({ preventScroll: true });
    });
    container.append(button);
  });
}

function renderPath(path) {
  if (!path) return;
  pathInvalid = false;
  byId('path-title').textContent = text(path.title, '路径名称未提供');
  byId('path-action').textContent = text(path.action, '具体动作尚未提供');
  const isSelected = currentAnalysis(state) && state.selection?.analysisId === state.analysis.id && state.selection?.pathId === path.id;
  byId('path-selection-note').textContent = isSelected ? '此前已明确选定这条路径；执行情况仍以实际反馈为准。' : '当前查看的路径 · 尚未通过本页操作选定';
  byId('choose-path').textContent = isSelected ? '继续准备这件事' : '就做这件事';
  byId('defer-choice').textContent = state.selection ? '暂不改选' : '暂不选';
  byId('report-consent-row').hidden = state.analysis.mode === 'demo_fixture';
  const costs = byId('path-costs');
  costs.replaceChildren();
  [['资金', path.cost?.money, '元'], ['时间', path.cost?.time, '分钟']].forEach(([label, cost, unit]) => {
    addDefinition(costs, label, costText(cost, unit), `${labels.basis[cost?.basis] || '依据未知'}。${text(cost?.note, '投入边界仍需核对。')}`);
  });
  const prerequisites = byId('path-prerequisites');
  prerequisites.replaceChildren();
  const conditions = list(path.prerequisites);
  if (!conditions.length) prerequisites.append(element('li', '', '执行条件未提供，行动前需要核对。'));
  conditions.forEach((condition) => {
    const li = element('li');
    li.append(element('span', 'condition-status', `${({ met: '条件具备', unmet: '尚不具备', unknown: '待核对' })[condition.status] || '待核对'}：`));
    li.append(document.createTextNode(text(condition.text)));
    prerequisites.append(li);
  });
  renderEstimate(path.estimate);
  renderRisks(path.risk);
  renderEvidence(path);
  renderExperiment(path.experiment);
  renderTree(path.tree);
  recordVisiblePath(path);
}

function scenarioRows(estimate) {
  if (estimate?.calculation?.method !== 'visitors_times_rate' || !list(estimate.values).length) return null;
  const assumptions = new Map(list(estimate.assumptions).map((item) => [item.id, item]));
  if (assumptions.size !== list(estimate.assumptions).length) return null;
  const rows = [];
  for (const value of estimate.values) {
    const visitors = assumptions.get(value.visitorAssumptionId);
    const rate = assumptions.get(value.rateAssumptionId);
    if (!number(visitors?.value) || visitors.value < 0 || !number(rate?.value) || rate.value < 0 || rate.value > 1
      || !number(value.value) || Math.abs(visitors.value * rate.value - value.value) > 1e-8) return null;
    rows.push({ label: text(value.label, '情景'), visitors: visitors.value, rate: rate.value, value: value.value });
  }
  return rows;
}

function renderEstimate(estimate) {
  const target = byId('path-estimate');
  target.replaceChildren();
  const rows = estimate?.kind === 'scenario' ? scenarioRows(estimate) : null;
  appendParagraph(target, rows ? '假设下的情景测算' : '暂不可估', 'estimate-type');
  if (estimate?.target) appendParagraph(target, `观察指标：${labels.metric[estimate.target.metric] || text(estimate.target.metric)}；单位：${text(estimate.target.unit)}；对象：${text(estimate.target.subject)}。`);
  appendParagraph(target, `观察范围：${text(estimate?.horizon?.description, '观察期尚未确定')}。`);
  if (rows) {
    appendParagraph(target, text(estimate.calculation.displayFormula, '期望订单 = 可比访客 × 假设支付率'), 'estimate-formula');
    const wrap = element('div', 'estimate-table-wrap');
    const table = element('table', 'estimate-table');
    const caption = element('caption', '', '合成或明确假设条件下的期望值，不是实际订单上下界');
    table.append(caption);
    const thead = element('thead');
    const header = element('tr');
    ['条件', '可比访客', '假设支付率', '期望订单'].forEach((value) => {
      const th = element('th', '', value); th.scope = 'col'; header.append(th);
    });
    thead.append(header); table.append(thead);
    const tbody = element('tbody');
    rows.forEach((row) => {
      const tr = element('tr');
      [row.label, `${formatNumber(row.visitors)} 人`, `${formatNumber(row.rate * 100)}%`, `${formatNumber(row.value)} 笔`].forEach((value) => tr.append(element('td', '', value)));
      tbody.append(tr);
    });
    table.append(tbody); wrap.append(table); target.append(wrap);
    const assumptions = list(estimate.assumptions).map((item) => `${text(item.label)}：${number(item.value) ? formatNumber(item.value) : '未知'} ${text(item.unit, '')}。${text(item.note, '假设来源未提供')}`);
    appendList(target, assumptions);
    appendParagraph(target, '这些值不是统计置信区间，不保证实际订单落在其间，也不能解释为采用这条路径带来的增量。');
  } else if (estimate?.kind === 'scenario') {
    appendParagraph(target, '情景参数或算式不完整／不一致，已停止展示数值。请更新判断后再试。');
    pathInvalid = true;
  } else if (estimate?.kind && estimate.kind !== 'unavailable') {
    appendParagraph(target, '当前版本不支持该估算方法，未展示未经核验的统计区间。');
    pathInvalid = true;
  }
  appendList(target, estimate?.limitations, '资料不足，尚无可核对的结果估计。');
  appendParagraph(target, `行动增量：${text(estimate?.incrementalEffect?.reason, '无法估计行动增量')}。`, 'muted');
}

function conditionText(condition, fallback) {
  return text(condition?.text, fallback);
}

function renderRisks(risks) {
  const parent = byId('path-risks');
  parent.replaceChildren();
  if (!list(risks).length) appendParagraph(parent, '风险资料尚未提供，不能据此视为没有风险。');
  list(risks).forEach((risk) => {
    const item = element('div', 'risk-item');
    appendParagraph(item, text(risk.description, '风险说明尚待核对'), 'risk-item-title');
    appendParagraph(item, `留意：${conditionText(risk.trigger, '触发条件未知')}。`);
    appendParagraph(item, `停止：${conditionText(risk.stop, '停止条件尚待核对')}。`);
    appendParagraph(item, `恢复：${conditionText(risk.restore, '恢复条件尚待核对')}。`);
    parent.append(item);
  });
  appendParagraph(parent, '时间或资金预算只是当前依据下的投入说明，不是保证的最大损失。', 'muted');
}

function locatorText(locator) {
  if (!locator) return '未提供原文定位';
  if (locator.type === 'input') return locator.field === 'focus' ? '本轮关注范围' : '问题描述';
  if (locator.type === 'question') return '本轮补问原话';
  if (locator.type === 'text' || locator.type === 'csv') {
    return `第 ${locator.lineStart ?? '未知'}–${locator.lineEnd ?? locator.lineStart ?? '未知'} 行${locator.type === 'csv' ? `，记录 ${locator.recordIndex ?? '未知'}，列 ${text(locator.column)}` : ''}`;
  }
  if (locator.type === 'json') return `JSON 字段 ${text(locator.pointer)}`;
  if (locator.type === 'correction') return `用户更正，输入版本 ${locator.inputVersion ?? '未知'}`;
  return '定位格式暂不支持';
}

function correctionButton(sourceId) {
  const button = element('button', 'button button--quiet source-correction', '核对／更正这条来源');
  button.type = 'button';
  button.addEventListener('click', () => goTo('intake', { sourceId }));
  return button;
}

function renderEvidence(path) {
  const parent = byId('path-evidence');
  parent.replaceChildren();
  const valid = currentAnalysis(state);
  const facts = new Map((valid ? list(state.input.facts) : []).map((fact) => [fact.id, fact]));
  [['支持这条路径的依据', path.evidenceRefs], ['反面线索与尚不能支持的部分', path.counterEvidence]].forEach(([title, entries]) => {
    const group = element('section', 'evidence-group');
    group.append(element('h4', '', title));
    if (!list(entries).length) appendParagraph(group, '未提供；没有列出不代表不存在。', 'muted');
    list(entries).forEach((entry) => {
      const item = element('div', 'evidence-entry');
      appendParagraph(item, labels.evidence[entry.kind] || '类型待核对', 'evidence-kind');
      appendParagraph(item, entry.summary);
      if (entry.calculation) appendParagraph(item, `计算：${text(entry.calculation)}`);
      if (!valid) appendParagraph(item, '此处为旧分析摘要，当前输入不能替代它原来的证据快照。请返回核对。', 'muted');
      const refs = new Set(list(entry.sourceIds));
      list(entry.factIds).forEach((factId) => {
        const fact = facts.get(factId);
        if (!fact) { appendParagraph(item, '对应事实未提供、已更新或不可核对。', 'muted'); return; }
        const value = fact.availability === 'known' && (typeof fact.value === 'string' || number(fact.value)) ? String(fact.value) : '未知';
        appendParagraph(item, `${labels.metric[fact.key] || text(fact.key, '事实条目')}：${value}${fact.unit ? ` ${fact.unit}` : ''}。${labels.source[fact.source?.kind] || '来源类型未知'} · ${labels.verification[fact.verification] || '尚未核对'}。`);
        appendParagraph(item, `来源位置：${locatorText(fact.source?.locator)}。对象：${text(fact.subject)}；渠道：${text(fact.channel)}。`, 'muted');
        if (fact.source?.materialId) {
          const material = list(state.input.materials).find((value) => value.id === fact.source.materialId);
          if (!material) appendParagraph(item, '原件未提供或已移除。', 'muted');
          else if (fact.source.materialVersion !== material.version) appendParagraph(item, '原件版本已变化，请勿用当前原件替代旧引用。', 'muted');
        }
        refs.add(`fact:${fact.id}`);
      });
      [...refs].filter((sourceId) => typeof sourceId === 'string' && /^(input:(description|focus)|(material|fact|question):[A-Za-z0-9_-]{1,80})$/.test(sourceId))
        .forEach((sourceId) => item.append(correctionButton(sourceId)));
      group.append(item);
    });
    parent.append(group);
  });
}

function renderExperiment(experiment) {
  const parent = byId('path-experiment');
  parent.replaceChildren();
  if (!experiment) { appendParagraph(parent, '尚未提供观察计划；不能据此宣称具备停止或恢复条件。'); return; }
  const grid = element('div', 'experiment-grid');
  [['只改变什么', text(experiment.change)], ['保持不变', list(experiment.keepFixed).join('；') || '尚未提供'],
    ['观察什么', `${labels.metric[experiment.target?.metric] || text(experiment.target?.metric)}；单位 ${text(experiment.target?.unit)}`],
    ['观察期', text(experiment.window?.description)], ['样本要求', number(experiment.minSample) ? `${formatNumber(experiment.minSample)}；仅为当前计划条件，不表示已满足统计要求` : '未知，不编造固定样本门槛']]
    .forEach(([title, value]) => { const part = element('div'); part.append(element('h4', '', title)); appendParagraph(part, value); grid.append(part); });
  parent.append(grid);
  parent.append(element('h4', '', '停止条件'));
  appendList(parent, list(experiment.stopConditions).map((item) => item.text), '尚待核对');
  parent.append(element('h4', '', '恢复条件'));
  appendList(parent, list(experiment.restoreConditions).map((item) => item.text), '尚待核对');
  appendList(parent, experiment.limitations);
}

function renderTree(tree) {
  const parent = byId('path-tree');
  parent.replaceChildren();
  const validation = api.validateDecisionTree(tree);
  if (!validation?.ok) {
    appendParagraph(parent, text(validation?.message, '业务树结构无效，不能展示或导出不完整的决策依据。'));
    pathInvalid = true;
    return;
  }
  appendParagraph(parent, '先判断风险与资料是否足够，再看可比变化。没有反馈不等于没执行，正向变化也不证明建议有效。', 'muted');
  const nodes = new Map(tree.nodes.map((node) => [node.id, node]));
  const children = new Map();
  tree.edges.forEach((edge) => {
    if (!children.has(edge.from)) children.set(edge.from, []);
    children.get(edge.from).push(edge);
  });
  const appendNode = (nodeId, container) => {
    const node = nodes.get(nodeId);
    appendParagraph(container, node.title, 'tree-node-title');
    if (node.detail) appendParagraph(container, node.detail, 'tree-node-detail');
    const outgoing = children.get(nodeId) || [];
    if (!outgoing.length) return;
    const ul = element('ul', 'tree-list');
    outgoing.forEach((edge) => {
      const li = element('li', 'tree-branch');
      li.append(element('span', 'tree-branch-label', labels.branch[edge.branch] || edge.branch));
      appendParagraph(li, edge.condition.text, 'tree-condition');
      appendNode(edge.to, li);
      ul.append(li);
    });
    container.append(ul);
  };
  appendNode(tree.rootId, parent);
  appendList(parent, list(tree.notApplicableBranches).map((entry) => `${labels.branch[entry.branch] || entry.branch}不适用：${text(entry.reason)}`));
}

async function goTo(pageId, options) {
  if (busy) return;
  if (!api) { message('共享导航尚未载入。请在统筹提供的本地 HTTP 服务中重试。', 'error'); return; }
  await operate(async () => {
    const result = await api.navigateTo(pageId, options);
    if (result === false || result?.ok === false) fail(result, '暂时不能离开本页，请先处理未保存的内容。');
  });
}

async function choosePath() {
  const pathId = viewedPathId;
  const viewedIdentity = identity(state, pathId);
  await operate(async () => {
    const snapshot = await readState();
    if (!currentAnalysis(snapshot) || identity(snapshot, pathId) !== viewedIdentity
      || !snapshot.analysis.paths.some((path) => path.id === pathId)) {
      fail({ code: 'stale_input', message: '查看期间资料或分析已变化，请查看当前路径后重新选择。' });
    }
    const saved = await dispatchIntent(`select:${viewedIdentity}`, 'PATH_SELECT', {
      analysisId: snapshot.analysis.id, pathId, inputVersion: snapshot.round.inputVersion,
    }, snapshot);
    if (saved.selection?.pathId !== pathId || saved.selection.analysisId !== snapshot.analysis.id) {
      fail({ message: '选择尚未在共享状态中确认，停留本页以免误跳转。' });
    }
    const result = await api.navigateTo('action');
    if (result === false || result?.ok === false) fail(result, '选择已保存，但暂时无法进入下一页；可重试继续。');
  });
}

async function downloadReport() {
  const pathId = viewedPathId;
  const requestedIdentity = identity(state, pathId);
  const allowSummaries = byId('report-consent').checked;
  await operate(async () => {
    const snapshot = await readState();
    if (!currentAnalysis(snapshot) || identity(snapshot, pathId) !== requestedIdentity) {
      fail({ code: 'stale_input', message: '资料或分析已更新，未发出旧报告下载。请重新查看。' });
    }
    if (!pendingExport || pendingExport.identity !== requestedIdentity || pendingExport.allowSummaries !== allowSummaries) {
      pendingExport = { identity: requestedIdentity, exportId: crypto.randomUUID(), generatedAt: new Date().toISOString(), allowSummaries };
    }
    const exportOptions = { ...pendingExport };
    const frozen = structuredClone(snapshot);
    const report = api.buildPathReport(frozen, pathId, exportOptions);
    if (!report?.ok) fail(report, '报告生成失败，未发出下载请求。');
    const latest = await readState();
    if (!currentAnalysis(latest) || identity(latest, pathId) !== requestedIdentity) {
      fail({ code: 'stale_input', message: '报告生成期间资料已变化，已取消下载。请查看当前结果后重试。' });
    }
    const objectUrl = URL.createObjectURL(new Blob([report.html], { type: 'text/html;charset=utf-8' }));
    const link = element('a');
    link.href = objectUrl;
    link.download = report.filename;
    link.hidden = true;
    document.body.append(link);
    try {
      link.click();
    } catch (error) {
      URL.revokeObjectURL(objectUrl);
      throw error;
    } finally {
      link.remove();
    }
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1500);
    pendingExport = null;
    byId('report-consent').checked = false;
    message('已向浏览器请求下载 HTML 报告；是否保存请查看下载列表。此操作不会选择、采用或执行路径。');
    recordEvent('download_requested', { pageId: 'decisions', analysisId: frozen.analysis.id, pathId,
      inputVersion: frozen.round.inputVersion, stateRevision: frozen.revision, exportId: exportOptions.exportId, format: 'html' }, frozen);
  });
}

async function boot() {
  if (booting) return;
  booting = true;
  try {
    if (!['http:', 'https:'].includes(window.location.protocol)) throw new Error('请使用统筹提供的同源本地 HTTP 地址，不能通过 file:// 运行共享会话。');
    const [storage, navigation, shell, data, report] = await Promise.all([
      import('../shared/state.js'), import('../shared/navigation.js'), import('../shared/shell.js'),
      import('../shared/demo-data.js'), import('./report.js'),
    ]);
    api = { ...storage, ...navigation, ...shell, ...data, ...report };
    for (const name of ['loadSession', 'dispatch', 'subscribeSession', 'navigateTo', 'mountShell', 'buildDemoAnalysis', 'buildPathReport', 'validateDecisionTree']) {
      if (typeof api[name] !== 'function') throw new Error(`共享或报告模块缺少 ${name}，未创建替代实现。`);
    }
    await api.mountShell('decisions');
    subscribe();
    await refreshSession();
  } catch (error) {
    api = null;
    showStart('第二页暂时无法启动', '共享模块或本地服务还未准备好。不会载入假案例，也没有改写已保存的资料。', { goBack: false });
    message(text(error?.message, '模块加载失败，请等待统筹完成共享接口后重新读取。'), 'error');
  } finally {
    booting = false;
  }
}

document.querySelectorAll('[data-action="return"]').forEach((button) => button.addEventListener('click', () => goTo('intake')));
byId('retry-load').addEventListener('click', () => api ? refreshSession() : window.location.reload());
byId('refresh-analysis').addEventListener('click', () => operate(generateAnalysis));
byId('choose-path').addEventListener('click', choosePath);
byId('download-report').addEventListener('click', downloadReport);
byId('defer-choice').addEventListener('click', () => message(state?.selection
  ? '没有新增或替换选择，已有选择及材料继续保留。可以继续比较，或返回补充。'
  : '本轮暂不选择，资料和当前结果继续保留。可以继续比较，或返回补充。'));
byId('retry-event').addEventListener('click', () => operate(async () => {
  for (const entry of [...pendingEvents.values()]) await saveEvent(entry);
}));
for (const id of ['evidence-disclosure', 'experiment-disclosure', 'tree-disclosure']) {
  byId(id).addEventListener('toggle', () => {
    if (byId(id).open && state && selectedPath()) {
      recordVisiblePath(selectedPath());
    }
  });
}
window.addEventListener('pagehide', () => { unsubscribe?.(); unsubscribe = null; });
window.addEventListener('pageshow', (event) => { if (event.persisted && api) { subscribe(); void refreshSession(false); } });
void boot();
