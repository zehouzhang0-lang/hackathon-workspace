import { enhanceFoldTitle } from '../shared/title-motion.js';

const CONTRACT_VERSION = 'demo.v1';
const EXECUTION_LABELS = { unknown: '执行情况未知', not_started: '明确还没做', partial: '做了一部分', done: '自述已完成' };
const OBSERVATION_LABELS = { unknown: '观察结果未知', better: '感觉好一些', unchanged: '感觉没变化', worse: '感觉变差' };
const SOURCE_LABELS = { merchant_statement: '商家自述', file_extract: '文件提取，待核对', derived: '派生计算', public_reference: '公共参考', scenario_assumption: '情景假设' };
const INTAKE_SOURCE_LABELS = { voice: '语音转写', paste: '粘贴文字', manual: '手动填写', txt: 'TXT 材料', csv: 'CSV 材料', json: 'JSON 材料' };
const EVIDENCE_STATUS_LABELS = { confirmed_fact: '商家确认理解，未外部核验', owner_hypothesis: '商家判断，待验证', unknown: '未知，未补值' };
const INTAKE_FIELD_LABELS = { merchantName: '商家名称', productName: '具体商品', category: '商品类目', price: '价格', specifications: '规格',
  platform: '经营平台', desiredAction: '希望改变的动作', targetCustomerHypothesis: '目标人群判断', usageScenarioHypothesis: '使用场景判断',
  purchaseReasonHypothesis: '购买原因判断', differentiationHypothesis: '差异判断', currentProblem: '本轮问题',
  'metrics.windowStart': '观察开始日期', 'metrics.windowEnd': '观察结束日期', 'metrics.videoViews': '视频观看次数',
  'metrics.productClicks': '商品点击次数', 'metrics.addToCarts': '加购次数', 'metrics.createdOrders': '创建订单数', 'metrics.paidOrders': '支付订单数',
  confirmedProductFacts: '商家确认的商品信息', proofMaterials: '证明材料', previousAttempts: '已尝试的动作', constraints: '本轮限制',
  customerQuestions: '顾客问题', unknowns: '重要未知' };
const FIELD_LABELS = { paid_orders: '支付订单', product_detail_visitors: '商品详情访客', price: '价格', units_per_order: '每单件数',
  external_length: '单只外长', external_width: '单只外宽', external_height: '单只外高', dimension_scope: '尺寸口径',
  current_title: '现有标题', current_opening: '现有说明开头', selected_inquiries: '精选咨询' };

function textValue(value, fallback = '未知') {
  if (value === null || value === undefined || value === '') return fallback;
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  return fallback;
}

function sameReference(a, b) {
  return Boolean(a && b && a.roundId === b.roundId && a.analysisId === b.analysisId &&
    a.pathId === b.pathId && a.inputVersion === b.inputVersion);
}

export function activeSelection(state) {
  if (!state || state.contractVersion !== CONTRACT_VERSION) return null;
  const { round, input, analysis, selection } = state;
  if (!round || !input || !analysis || !selection || input.confirmedVersion !== round.inputVersion ||
      analysis.roundId !== round.id || analysis.inputVersion !== round.inputVersion ||
      !['ready', 'limited'].includes(analysis.status) || selection.analysisId !== analysis.id ||
      selection.inputVersion !== round.inputVersion) return null;
  const path = analysis.paths?.find((item) => item.id === selection.pathId);
  if (!path) return null;
  return { roundId: round.id, roundIndex: round.index, analysisId: analysis.id, pathId: path.id,
    inputVersion: round.inputVersion, mode: analysis.mode, path };
}

export function currentArtifacts(state, context = activeSelection(state)) {
  if (!context) return [];
  const latest = new Map();
  for (const artifact of state.artifacts ?? []) {
    if (!sameReference(artifact, context) || artifact.status !== 'current' || !artifact.id || artifact.version < 1) continue;
    if (!latest.has(artifact.id) || latest.get(artifact.id).version < artifact.version) latest.set(artifact.id, artifact);
  }
  return [...latest.values()];
}

function previewArtifactKey(artifact) {
  return artifact.id ? `${artifact.id}:${artifact.version}`
    : JSON.stringify([artifact.roundId, artifact.analysisId, artifact.pathId, artifact.inputVersion, artifact.kind, artifact.title, artifact.body]);
}

export function selectPreviewArtifact(artifacts, key) {
  return artifacts.find((artifact) => previewArtifactKey(artifact) === key) ?? artifacts[0] ?? null;
}

export function artifactPreviewText(artifact, part = 'content') {
  if (part === 'content') return textValue(artifact?.body, '');
  if (part === 'steps') return (artifact?.usage?.steps ?? []).map((step, index) => `${index + 1}. ${step}`).join('\n');
  throw new Error('未知的预览方式。');
}

function feedbackHasContent(draft) {
  return Boolean(draft.rawText?.trim() || draft.scope?.trim() || draft.executedAt ||
    draft.execution !== 'unknown' || draft.observation !== 'unknown');
}

export function makeFeedbackPayload(artifact, draft) {
  if (!artifact?.id || artifact.version < 1) throw new Error('请先保存对应的行动内容。');
  if (!(draft.execution in EXECUTION_LABELS) || !(draft.observation in OBSERVATION_LABELS)) throw new Error('反馈状态无效。');
  if (!feedbackHasContent(draft)) throw new Error('可以只记一句话或选一个状态；暂时不记录也可以直接离开。');
  if (draft.executedAt) {
    const date = new Date(`${draft.executedAt}T00:00:00.000Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.executedAt) || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== draft.executedAt) {
      throw new Error('请填写有效日期，或留空表示执行时间未知。');
    }
  }
  const refs = { roundId: artifact.roundId, analysisId: artifact.analysisId, pathId: artifact.pathId,
    inputVersion: artifact.inputVersion, artifactId: artifact.id, artifactVersion: artifact.version };
  return {
    executionRecord: { id: null, ...refs, adoption: 'unknown', execution: draft.execution,
      scope: draft.scope?.trim() || null, executedAt: draft.executedAt || null },
    feedbackRecord: { id: null, ...refs, executionRecordId: null, observation: draft.observation,
      rawText: draft.rawText?.trim() || null, metrics: [], observedWindow: { start: null, end: null } },
  };
}

function originLabel(mode) {
  return mode === 'demo_fixture' ? '合成演示／预编写参考稿' : '本机有限整理／参考稿';
}

function intakeFieldLabel(field) {
  const indexed = /^(confirmedProductFacts|proofMaterials|previousAttempts|constraints|customerQuestions|unknowns)\.(\d+)$/.exec(field ?? '');
  return indexed ? `${INTAKE_FIELD_LABELS[indexed[1]]}第 ${Number(indexed[2]) + 1} 项`
    : INTAKE_FIELD_LABELS[field] ?? textValue(field, '理解字段');
}

function factSummary(fact) {
  const value = fact.availability === 'known'
    ? textValue(fact.value, '已提供结构化内容，请回来源核对') : '未知';
  const label = fact.intakeField ? intakeFieldLabel(fact.intakeField) : FIELD_LABELS[fact.key] ?? textValue(fact.key, '资料项');
  return `${label}：${value}${fact.unit ? ` ${fact.unit}` : ''}`;
}

function sourceLocation(source) {
  const locator = source?.locator;
  if (!locator) return '无原文定位';
  if (locator.type === 'input') return locator.field === 'focus' ? '本轮问题' : '问题描述';
  if (locator.type === 'intake') return `${INTAKE_SOURCE_LABELS[locator.source] ?? '来源未明'} · ${intakeFieldLabel(locator.field)}`;
  if (locator.type === 'question') return `补问 ${locator.questionId}`;
  if (locator.type === 'text' || locator.type === 'txt') {
    const positions = [];
    if (Number.isSafeInteger(locator.lineStart) && Number.isSafeInteger(locator.lineEnd)) positions.push(`第 ${locator.lineStart}—${locator.lineEnd} 行`);
    if (Number.isSafeInteger(locator.start) && Number.isSafeInteger(locator.end)) positions.push(`位置 ${locator.start}—${locator.end}`);
    return positions.length ? `文本${positions.join('，')}` : '文本（未提供行号或位置）';
  }
  if (locator.type === 'csv') return `CSV 第 ${locator.recordIndex} 条记录，${locator.column} 列`;
  if (locator.type === 'json') return `JSON 字段 ${locator.pointer}`;
  if (locator.type === 'correction') return `更正 ${locator.factId}，输入 v${locator.inputVersion}`;
  return '来源定位未知';
}

export function describeActionSource(fact) {
  const labels = [SOURCE_LABELS[fact.source?.kind] ?? '来源未明'];
  if (EVIDENCE_STATUS_LABELS[fact.evidenceStatus]) labels.push(EVIDENCE_STATUS_LABELS[fact.evidenceStatus]);
  if (fact.verification === 'user_corrected') labels.push('商家更正');
  if (fact.verification === 'checked') labels.push('仅原文／算式已核对');
  if (fact.verification === 'conflicting') labels.push('存在冲突，待核对');
  return { summary: factSummary(fact), provenance: labels.join('；'), location: sourceLocation(fact.source) };
}

function analysisSourceFacts(snapshot) {
  return snapshot.analysis?.inputSnapshot?.facts ?? snapshot.input?.facts ?? [];
}

function packSignature(state) {
  const context = activeSelection(state);
  if (!context) return null;
  return JSON.stringify([context.roundId, context.inputVersion, context.analysisId, context.pathId,
    currentArtifacts(state, context).map((artifact) => [artifact.id, artifact.version]).sort((a, b) => a[0].localeCompare(b[0]))]);
}

export function buildActionPack(state, { exportId, generatedAt, allowSummaries = false }) {
  const context = activeSelection(state);
  const artifacts = currentArtifacts(state, context);
  if (!context || !artifacts.length) throw new Error('没有当前有效且已保存的执行包。');
  if (![exportId, context.pathId].every((id) => /^[A-Za-z0-9_-]{1,80}$/.test(id))) throw new Error('导出标识无效。');
  if (!allowSummaries) throw new Error('请先确认本次 TXT 可以包含页面所示的必要摘要。');
  const stamp = new Date(generatedAt);
  if (Number.isNaN(stamp.getTime())) throw new Error('导出时间无效。');
  const utc = stamp.toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
  const metadata = {
    exportVersion: 'demo.export.v1', contractVersion: state.contractVersion, exportId,
    generatedAt: stamp.toISOString(), sourceRevision: state.revision,
    roundId: context.roundId, roundIndex: state.round.index, inputVersion: context.inputVersion,
    analysisId: context.analysisId, pathId: context.pathId, mode: state.analysis.mode, fixtureId: state.fixtureId,
  };
  const lines = [originLabel(state.analysis.mode), '行动执行包', '', ...Object.entries(metadata).map(([key, value]) => `${key}: ${value ?? 'null'}`),
    '', `本轮问题：${textValue(state.input.focus || state.input.description).slice(0, 300)}`,
    `选定行动：${context.path.title}`, `要做什么：${context.path.action}`, '', '行动内容'];
  for (const [index, artifact] of artifacts.entries()) {
    lines.push('', `${index + 1}. ${artifact.title}`, `artifactId: ${artifact.id}`, `artifactVersion: ${artifact.version}`,
      `artifactSavedAt: ${artifact.savedAt ?? 'null'}`, `来源标签：${originLabel(artifact.mode)}`,
      `使用位置：${textValue(artifact.usage?.placement)}`, '', artifact.body, '', '使用步骤：',
      ...(artifact.usage?.steps?.length ? artifact.usage.steps.map((step, i) => `${i + 1}. ${step}`) : ['未提供额外步骤。']),
      '必要风险：', ...(artifact.usage?.risks?.length ? artifact.usage.risks.map((risk) => `- ${risk}`) : ['没有补充风险资料，不表示没有风险。']),
      '引用资料摘要：');
    const facts = (artifact.sourceFactIds ?? []).map((id) => analysisSourceFacts(state).find((fact) => fact.id === id));
    lines.push(...(facts.length ? facts.map((fact) => {
      if (!fact) return '- 来源已更新，无法核对。';
      const source = describeActionSource(fact);
      return `- ${fact.id} | ${source.provenance} | ${source.location} | ${source.summary.slice(0, 240)}`;
    }) : ['没有可核对的商品资料；只提供有限参考。']));
  }
  lines.push('', '适用前提', ...(context.path.prerequisites?.length
    ? context.path.prerequisites.map((item) => `- ${item.text}（${item.status === 'met' ? '已满足' : item.status === 'unmet' ? '尚未满足' : '待核对'}）`)
    : ['尚未给出额外前提。']));
  lines.push('', '行动边界与风险', ...(context.path.risk?.length
    ? context.path.risk.flatMap((risk) => [`- ${risk.description}`, `触发条件：${textValue(risk.trigger?.text)}`,
      `暂停条件：${textValue(risk.stop?.text)}`, `恢复条件：${textValue(risk.restore?.text)}`]) : ['尚无完整风险资料。']));
  const plan = context.path.experiment;
  if (plan) {
    lines.push('', '沿用所选路径的观察计划', `修改对象：${textValue(plan.change)}`,
      `保持不变：${plan.keepFixed?.join('；') || '未知'}`, `观察指标：${FIELD_LABELS[plan.target?.metric] ?? textValue(plan.target?.metric)}${plan.target?.unit ? `（${plan.target.unit}）` : ''}`,
      `观察对象：${textValue(plan.target?.subject)}`, `渠道：${textValue(plan.target?.channel)}；口径：${textValue(plan.target?.cohort)}`,
      `观察窗口：${textValue(plan.window?.description)}`, `样本下限：${plan.minSample ?? '未知'}`,
      ...(plan.limitations ?? []).map((item) => `限制：${item}`),
      ...(plan.stopConditions ?? []).map((item) => `暂停条件：${item.text}`),
      ...(plan.restoreConditions ?? []).map((item) => `恢复条件：${item.text}`));
  }
  lines.push('', '此文件为本机导出，不代表采用、执行、平台核验、真实模型生成或经营成效。',
    '实际执行和结果没有反馈时保持未知；本机下载不等于云同步或对外分享授权。');
  return { text: `\uFEFF${lines.join('\n').replace(/\r\n?/g, '\n').replace(/\n/g, '\r\n')}\r\n`,
    filename: `action-pack-r${state.round.index}-i${context.inputVersion}-${context.pathId}-${utc}.txt`,
    signature: packSignature(state), metadata };
}

let shared;
let state;
let shownContext;
let artifactFingerprint = '';
let previewFingerprint = '';
let previewItems = [];
let previewKey = null;
let previewPart = 'content';
let previewStale = false;
let copying = false;
let feedbackBinding;
let pendingFeedback;
let selectedFeedbackId;
let savedRecordNotice = '';
let lastSavedDraft = '';
let consentSignature = null;
let dirty = false;
let booting = false;
let generating = false;
let saving = false;
let exporting = false;
let startingRound = false;
let commandQueue = Promise.resolve();
let unsubscribe;
let unregisterGuard;
let roundCommand;
let generationFailures = [];
let generationLimitations = [];
const artifactCommands = new Map();
const pendingEvents = new Map();
const viewed = new Set();
const readFeedbackIds = new Set();
let readEventLogged = false;

const $ = (id) => document.getElementById(id);
const id = () => crypto.randomUUID();
const node = (tag, value, className) => {
  const element = document.createElement(tag);
  if (value !== undefined) element.textContent = value;
  if (className) element.className = className;
  return element;
};

function status(target, message, isError = false) {
  const element = $(target);
  if (element.textContent !== message) element.textContent = message;
  element.hidden = !message;
  element.classList.toggle('action-warning', isError);
}

function readableTime(value) {
  if (!value) return '未知';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '未知' : date.toLocaleString('zh-CN', { hour12: false });
}

function errorText(result) {
  const hints = { conflict: '其他页面已更新资料。请核对当前内容后重试，草稿仍保留。',
    stale_input: '依据或选择已变化，不能继续使用旧版本。请回第二页核对。',
    storage_unavailable: '本机浏览器存储不可用；尚未保存，草稿仍保留。',
    read_failed: '未能读取本机记录；没有将它当成空会话。',
    write_failed: '尚未确认保存结果。草稿仍保留，请重试或重新读取；重试会复用同一操作。',
    incompatible_version: '本机记录版本不兼容，请联系统筹处理；本页不会清空或迁移记录。' };
  return hints[result?.code] || result?.message || '操作未完成，请重试。';
}

function acceptState(next) {
  if (!next || next.contractVersion !== CONTRACT_VERSION) throw new Error('共享状态版本不兼容，本页没有改写记录。');
  state = next;
}

function commit(command) {
  const work = commandQueue.then(async () => {
    const result = await shared.dispatch({ ...command, expectedRevision: state.revision });
    if (result.ok) acceptState(result.state);
    else if (result.state) acceptState(result.state);
    return result;
  });
  commandQueue = work.catch(() => {});
  return work;
}

function command(type, payload) {
  return { type, payload, commandId: id() };
}

async function readState(markRead = false) {
  const result = await shared.loadSession();
  if (result.ok) {
    acceptState(result.state);
    if (markRead && state.savedAt && state.revision > 0) {
      for (const record of state.feedbackRecords ?? []) readFeedbackIds.add(record.id);
    }
  }
  return result;
}

async function logEvent(type, refs, roundId = state?.round.id, onceKey = null) {
  if (onceKey && viewed.has(onceKey)) return;
  if (onceKey) viewed.add(onceKey);
  const eventCommand = command('EVENT_APPEND', { event: { type, roundId, refs } });
  try {
    const result = await commit(eventCommand);
    if (result.ok) return;
  } catch { /* Keep the completed operation separate from its failed log. */ }
  pendingEvents.set(eventCommand.commandId, eventCommand);
  $('event-retry').hidden = false;
  status('operation-status', '操作已发生，但操作记录尚未保存。重试只补记，不会再次复制或下载。', true);
}

function contextRefs(context, artifact) {
  const refs = { pageId: 'action', analysisId: context.analysisId, pathId: context.pathId, inputVersion: context.inputVersion };
  if (artifact?.id) Object.assign(refs, { artifactId: artifact.id, artifactVersion: artifact.version });
  return refs;
}

function appendList(container, items, fallback) {
  container.replaceChildren();
  for (const item of items?.length ? items : [fallback]) container.append(node('li', item));
}

function renderSources(context) {
  const sourceIds = new Set(currentArtifacts(state, context).flatMap((artifact) => artifact.sourceFactIds ?? []));
  const container = $('source-list');
  container.replaceChildren();
  for (const factId of sourceIds) {
    const fact = analysisSourceFacts(state).find((item) => item.id === factId);
    const source = fact ? describeActionSource(fact) : null;
    const item = node('div', undefined, 'source-item');
    item.append(node('p', source?.summary ?? '来源已更新，暂时无法核对。'));
    if (fact) {
      item.append(node('p', `${source.provenance} · ${source.location}`, 'muted'));
      const button = node('button', '回到来源核对', 'button button--quiet');
      button.type = 'button';
      button.addEventListener('click', () => navigate('intake', { sourceId: `fact:${fact.id}` }));
      item.append(button);
    }
    container.append(item);
  }
  if (!sourceIds.size) container.append(node('p', '尚无可核对的商品事实；本页不补造规格、价格或承诺。', 'muted'));
}

function renderExperiment(path) {
  const container = $('experiment-content');
  container.replaceChildren();
  const plan = path.experiment;
  if (!plan) { container.append(node('p', '观察指标、时间与样本要求尚未提供。')); return; }
  const facts = node('dl', undefined, 'experiment-facts');
  for (const [label, value] of [
    ['修改对象', plan.change], ['保持不变', plan.keepFixed?.join('；')],
    ['观察指标', `${FIELD_LABELS[plan.target?.metric] ?? textValue(plan.target?.metric)}${plan.target?.unit ? `（${plan.target.unit}）` : ''}`], ['观察对象', plan.target?.subject],
    ['渠道／口径', `${textValue(plan.target?.channel)}／${textValue(plan.target?.cohort)}`],
    ['观察窗口', plan.window?.description], ['样本下限', plan.minSample],
  ]) facts.append(node('dt', label), node('dd', textValue(value)));
  container.append(facts);
  if (plan.limitations?.length) {
    const limits = node('ul', undefined, 'experiment-limits');
    appendList(limits, plan.limitations, '');
    container.append(limits);
  }
  const conditions = node('div', undefined, 'experiment-stops');
  for (const item of plan.stopConditions ?? []) conditions.append(node('p', `暂停：${item.text}`));
  for (const item of plan.restoreConditions ?? []) conditions.append(node('p', `恢复：${item.text}`));
  if (conditions.childElementCount) container.append(conditions);
}

function renderRisks(path) {
  const list = $('risk-list');
  list.replaceChildren();
  for (const risk of path.risk ?? []) {
    const item = node('li');
    item.append(node('p', risk.description, 'risk-summary'));
    const conditions = node('dl', undefined, 'risk-conditions');
    for (const [label, condition] of [['触发', risk.trigger], ['暂停', risk.stop], ['恢复', risk.restore]]) {
      conditions.append(node('dt', label), node('dd', textValue(condition?.text)));
    }
    item.append(conditions);
    list.append(item);
  }
  if (!path.risk?.length) list.append(node('li', '风险资料尚不完整，不能视为无风险。'));
}

function logPreviewView() {
  const artifact = selectPreviewArtifact(previewItems, previewKey);
  const context = activeSelection(state);
  if (!artifact?.id || artifact.version < 1 || previewStale || !sameReference(artifact, context) ||
      $('artifact-preview').hidden || document.visibilityState === 'hidden') return;
  void logEvent('artifact_viewed', contextRefs(context, artifact), context.roundId, `artifact:${artifact.id}:${artifact.version}`);
}

function renderPreview() {
  const artifact = selectPreviewArtifact(previewItems, previewKey);
  previewKey = artifact ? previewArtifactKey(artifact) : null;
  $('artifact-preview').hidden = !artifact;
  $('preview-empty').hidden = Boolean(artifact);
  for (const button of $('artifact-list').querySelectorAll('[role="tab"]')) {
    const selected = button.dataset.previewKey === previewKey;
    button.setAttribute('aria-selected', String(selected));
    button.tabIndex = selected ? 0 : -1;
    if (selected) $('artifact-preview').setAttribute('aria-labelledby', button.id);
  }
  if (!artifact) {
    $('preview-empty').textContent = generating ? '正在准备当前行动的内容…' : '当前资料不足以生成成品，请先按路径要求核对。';
    $('copy-artifact').disabled = true;
    $('select-artifact').disabled = true;
    previewFingerprint = '';
    return;
  }
  const saved = Boolean(artifact.id && artifact.version > 0);
  const hasText = Boolean(artifactPreviewText(artifact, previewPart));
  $('copy-artifact').textContent = copying ? '正在复制…' : previewPart === 'steps' ? '复制步骤' : '复制内容';
  $('copy-artifact').disabled = !saved || previewStale || copying || !hasText;
  $('select-artifact').disabled = !hasText;
  $('preview-content').hidden = previewPart !== 'content';
  $('preview-steps-panel').hidden = previewPart !== 'steps';
  for (const part of ['content', 'steps']) {
    const tab = $(`preview-${part}-tab`);
    tab.setAttribute('aria-selected', String(previewPart === part));
    tab.tabIndex = previewPart === part ? 0 : -1;
  }
  const fingerprint = JSON.stringify([previewKey, previewPart, previewStale, artifact.body, artifact.usage, artifact.mode]);
  if (fingerprint !== previewFingerprint) {
    previewFingerprint = fingerprint;
    $('preview-title').textContent = artifact.title;
    $('preview-meta').textContent = `${saved ? `稿件 v${artifact.version}` : '尚未保存'} · ${originLabel(artifact.mode)}${previewStale ? ' · 历史内容' : ''}`;
    $('preview-placement').textContent = `使用位置：${textValue(artifact.usage?.placement)}`;
    $('preview-body').value = artifactPreviewText(artifact);
    $('preview-body').setAttribute('aria-label', `${artifact.title}，只读内容预览`);
    $('preview-steps').setAttribute('aria-label', `${artifact.title}的使用步骤`);
    appendList($('preview-steps'), artifact.usage?.steps, '尚未提供额外的使用步骤，请先核对当前行动的适用条件。');
    appendList($('preview-risks'), artifact.usage?.risks, '没有补充风险资料，不表示没有风险。');
    status('preview-warning', previewStale
      ? '这是原行动的历史版本，当前复制与整包下载已停用；未保存反馈仍对应这一版。'
      : saved ? '' : '保存尚未完成。可手动选取；保存成功后才能复制、导出或关联反馈。', true);
  }
  logPreviewView();
}

function choosePreview(key) {
  if (!previewItems.some((artifact) => previewArtifactKey(artifact) === key)) return;
  previewKey = key;
  previewPart = 'content';
  renderPreview();
}

function choosePreviewPart(part) {
  if (!['content', 'steps'].includes(part)) return;
  previewPart = part;
  renderPreview();
}

function renderArtifacts(artifacts, stale) {
  const drafts = generationFailures.filter((draft) => sameReference(draft, shownContext) && !artifacts.some((artifact) => matchesDraft(artifact, draft)));
  previewItems = [...artifacts, ...drafts];
  previewStale = stale;
  $('artifact-count').textContent = `${previewItems.length} 份内容`;
  const fingerprint = JSON.stringify([stale, previewItems.map((artifact) => [previewArtifactKey(artifact), artifact.kind, artifact.title])]);
  if (fingerprint !== artifactFingerprint) {
    artifactFingerprint = fingerprint;
    const container = $('artifact-list');
    container.replaceChildren();
    for (const [index, artifact] of previewItems.entries()) {
      const key = previewArtifactKey(artifact);
      const button = node('button', undefined, 'artifact-choice');
      button.type = 'button';
      button.id = `artifact-choice-${index}`;
      button.setAttribute('role', 'tab');
      button.setAttribute('aria-controls', 'artifact-preview');
      button.dataset.previewKey = key;
      button.append(node('span', { copy: '参考内容', checklist: '核对清单', experiment_plan: '观察计划' }[artifact.kind] ?? '行动内容', 'artifact-choice-kind'),
        node('span', artifact.title, 'artifact-choice-title'),
        node('span', artifact.id && artifact.version > 0 ? `稿件 v${artifact.version}` : '尚未保存', 'artifact-choice-meta'));
      button.addEventListener('click', () => choosePreview(key));
      container.append(button);
    }
  }
  renderPreview();
}

function getFormDraft() {
  return { execution: $('execution-select').value, observation: $('observation-select').value,
    rawText: $('feedback-text').value, scope: $('execution-scope').value, executedAt: $('executed-date').value || null };
}

function formSignature() { return JSON.stringify([$('feedback-artifact').value, getFormDraft()]); }

function clearFeedbackForm() {
  $('feedback-form').reset();
  feedbackBinding = null;
  pendingFeedback = null;
  lastSavedDraft = '';
  dirty = false;
}

function formChanged() {
  if (!feedbackBinding) feedbackBinding = currentArtifacts(state).find((artifact) => artifact.id === $('feedback-artifact').value);
  dirty = feedbackHasContent(getFormDraft()) && formSignature() !== lastSavedDraft;
  if (pendingFeedback && pendingFeedback.signature !== formSignature()) pendingFeedback = null;
  $('next-round').disabled = dirty || saving || startingRound || !selectedFeedbackId;
  if (dirty) status('feedback-status', '草稿尚未保存。');
}

function feedbackRecordsFor(context) {
  return (state.feedbackRecords ?? []).filter((record) => sameReference(record, context));
}

function renderSavedFeedback(context) {
  const records = feedbackRecordsFor(context);
  $('saved-feedback').hidden = !records.length;
  const container = $('saved-feedback-content');
  container.replaceChildren();
  if (!records.some((record) => record.id === selectedFeedbackId)) selectedFeedbackId = records.length === 1 ? records[0].id : null;
  if (records.length > 1) container.append(node('p', '选择一条已保存的记录，用于下一轮分析。'));
  for (const record of records) {
    const execution = state.executionRecords?.find((item) => item.id === record.executionRecordId);
    const article = node('div', undefined, 'saved-record');
    const label = node('label');
    const radio = document.createElement('input');
    radio.type = 'radio'; radio.name = 'saved-feedback-choice'; radio.value = record.id;
    radio.checked = record.id === selectedFeedbackId;
    radio.addEventListener('change', () => {
      selectedFeedbackId = record.id;
      roundCommand = null;
      $('next-round').disabled = dirty || saving || startingRound;
    });
    label.append(radio, document.createTextNode(` ${EXECUTION_LABELS[execution?.execution ?? 'unknown']} · ${OBSERVATION_LABELS[record.observation] ?? '观察结果未知'}`));
    article.append(label);
    if (record.rawText) article.append(node('p', record.rawText));
    if (execution?.scope) article.append(node('p', `自述执行范围：${execution.scope}`));
    article.append(node('p', `稿件 v${record.artifactVersion} · 实际执行时间：${execution?.executedAt || '未知'}`, 'muted'),
      node('p', `反馈时间：${readableTime(record.reportedAt)}`, 'muted'),
      node('p', `${readFeedbackIds.has(record.id) ? '已读取本机记录' : '已保存到本机浏览器'} · 保存时间：${readableTime(record.savedAt)}`, 'muted'));
    container.append(article);
  }
  if (records.length) container.append(node('p', '以上为商家自述，未由平台核验；未明确采用的状态仍为未知。', 'muted'));
  $('next-round').disabled = dirty || saving || startingRound || !selectedFeedbackId;
}

function renderHistory() {
  const records = (state.feedbackRecords ?? []).filter((record) => !sameReference(record, activeSelection(state)));
  $('history-panel').hidden = !records.length;
  const container = $('history-list');
  container.replaceChildren();
  for (const record of records) {
    const execution = state.executionRecords?.find((item) => item.id === record.executionRecordId);
    const article = node('div', undefined, 'history-item');
    article.append(node('p', `历史稿件 v${record.artifactVersion} · ${EXECUTION_LABELS[execution?.execution ?? 'unknown']} · ${OBSERVATION_LABELS[record.observation] ?? '观察结果未知'}`),
      node('p', record.rawText || '未填写观察原话。'), node('p', `实际执行时间：${execution?.executedAt || '未知'}；保存时间：${readableTime(record.savedAt)}`, 'muted'));
    container.append(article);
  }
}

function render() {
  if (!state) return;
  const current = activeSelection(state);
  const keepOldDraft = dirty && shownContext && !sameReference(current, shownContext);
  const context = keepOldDraft ? shownContext : current;
  $('load-state').hidden = true;
  $('empty-state').hidden = Boolean(context);
  $('action-content').hidden = !context;
  renderHistory();
  if (!context) {
    const confirmed = state.input.confirmedVersion === state.round.inputVersion;
    $('empty-description').textContent = !confirmed
      ? '本轮问题还需要确认。先到第一页核对，再到第二页选择行动；本页不会替你默认选路。'
      : state.selection || state.analysis?.status === 'stale'
      ? '原来的依据或选择已更新。请回第二页重新核对并选择；已有记录不会被删除。'
      : '这里会放你在第二页选好的行动内容。先看清取舍，再选一件要做的事。';
    $('go-decisions-empty').textContent = confirmed ? '去第二页看选择' : '先到第一页确认问题';
    clearFeedbackForm();
    $('export-summary-consent').checked = false;
    consentSignature = null;
    shownContext = null;
    previewItems = [];
    previewKey = null;
    previewPart = 'content';
    previewFingerprint = '';
    artifactFingerprint = '';
    return;
  }
  if (!sameReference(shownContext, context)) {
    clearFeedbackForm();
    shownContext = context;
    artifactFingerprint = '';
    previewFingerprint = '';
    previewKey = null;
    previewPart = 'content';
    selectedFeedbackId = null;
    feedbackBinding = null;
  }
  const artifacts = keepOldDraft
    ? (state.artifacts ?? []).filter((artifact) => sameReference(artifact, context) && artifact.id && artifact.version > 0)
    : currentArtifacts(state, context);
  $('round-label').textContent = `第 ${context.roundIndex} 轮 · 输入 v${context.inputVersion}`;
  $('action-title').textContent = context.path.title;
  $('problem-summary').textContent = keepOldDraft
    ? '本轮资料或选择已更新；这里保留原行动的反馈草稿，不把新资料写入原版本。'
    : textValue(state.input.focus || state.input.description, '本轮范围尚未填写');
  $('context-meta').textContent = `${originLabel(context.mode)}${keepOldDraft ? ' · 历史行动，草稿仍对应原版本' : ''}`;
  renderArtifacts(artifacts, keepOldDraft);
  renderRisks(context.path);
  appendList($('prerequisite-list'), context.path.prerequisites?.map((item) => `${item.text}${item.status === 'unknown' ? '（待核对）' : item.status === 'unmet' ? '（尚未满足）' : ''}`), '尚未给出额外使用条件。');
  renderExperiment(context.path);
  renderSources(context);
  $('generation-limitations').hidden = !generationLimitations.length;
  appendList($('generation-limitations'), generationLimitations, '');
  $('export-consent').hidden = false;
  if (consentSignature !== packSignature(state)) {
    $('export-summary-consent').checked = false;
    consentSignature = null;
  }
  $('export-pack').disabled = exporting || generating || generationFailures.length > 0 || !artifacts.length || keepOldDraft;
  $('feedback-fields').disabled = saving || !artifacts.length;
  const select = $('feedback-artifact');
  const optionsKey = artifacts.map((artifact) => `${artifact.id}:${artifact.version}`).join('|');
  if (!dirty && select.dataset.optionsKey !== optionsKey) {
    clearFeedbackForm();
    select.replaceChildren();
    for (const artifact of artifacts) {
      const option = node('option', `${artifact.title} · v${artifact.version}`);
      option.value = artifact.id; select.append(option);
    }
    select.dataset.optionsKey = optionsKey;
  }
  $('feedback-artifact-field').hidden = artifacts.length <= 1;
  renderSavedFeedback(context);
  if (keepOldDraft) status('feedback-status', '资料或选择已更新。这份草稿仍对应原行动；保存时不会搬到新路径，也可以明确放弃草稿。', true);
}

function matchesDraft(artifact, draft) {
  return sameReference(artifact, draft) && artifact.kind === draft.kind && artifact.title === draft.title &&
    artifact.body === draft.body && JSON.stringify(artifact.usage) === JSON.stringify(draft.usage);
}

async function ensureArtifacts() {
  if (generating || dirty) return;
  const context = activeSelection(state);
  if (!context) return;
  generating = true;
  generationFailures = [];
  let drafts = [];
  $('artifact-retry').hidden = true;
  try {
    const result = shared.buildDemoArtifact(state);
    if (!result.ok) { status('artifact-status', errorText(result), true); $('artifact-retry').hidden = false; return; }
    drafts = result.artifacts;
    generationLimitations = result.limitations ?? [];
    for (const draft of result.artifacts) {
      if (!sameReference(activeSelection(state), context)) break;
      if (currentArtifacts(state, context).some((artifact) => matchesDraft(artifact, draft))) continue;
      const key = JSON.stringify(draft);
      if (!artifactCommands.has(key)) artifactCommands.set(key, command('ARTIFACT_SAVE', { artifact: draft }));
      const saved = await commit(artifactCommands.get(key));
      if (!saved.ok) {
        generationFailures = result.artifacts;
        $('artifact-retry').hidden = false;
        status('artifact-status', errorText(saved), true);
        break;
      }
      artifactCommands.delete(key);
    }
    if (!generationFailures.length) status('artifact-status', '');
  } catch (error) {
    generationFailures = drafts;
    status('artifact-status', error.message || '行动内容准备失败。', true);
    $('artifact-retry').hidden = false;
  } finally {
    generating = false;
    render();
  }
  if (!sameReference(context, activeSelection(state))) {
    if (activeSelection(state) && !dirty) void ensureArtifacts();
    return;
  }
}

function selectPreviewText(area) {
  area.focus();
  if (typeof area.select === 'function') { area.select(); return; }
  const selection = window.getSelection();
  if (!selection) throw new Error('当前浏览器未提供文字选区，可直接拖选所需文字。');
  const range = document.createRange();
  range.selectNodeContents(area);
  selection.removeAllRanges();
  selection.addRange(range);
}

function manuallySelectPreview() {
  const artifact = selectPreviewArtifact(previewItems, previewKey);
  if (!artifact || !artifactPreviewText(artifact, previewPart)) return;
  try {
    selectPreviewText($(previewPart === 'steps' ? 'preview-steps' : 'preview-body'));
    status('artifact-status', `${previewPart === 'steps' ? '步骤' : '内容'}已选中，可按 Ctrl+C 或使用系统复制菜单；尚未确认复制成功。`);
  } catch (error) { status('artifact-status', error.message, true); }
}

async function copyArtifact(artifact, area, part = 'content') {
  if (!artifact || copying) return;
  let checked = false;
  copying = true;
  renderPreview();
  try {
    const fresh = await readState();
    if (!fresh.ok) throw new Error(errorText(fresh));
    const context = activeSelection(state);
    if (!currentArtifacts(state, context).some((item) => item.id === artifact.id && item.version === artifact.version)) {
      render(); status('artifact-status', '这份内容已失效，未复制。请回第二页核对当前选择。', true); return;
    }
    checked = true;
    const text = artifactPreviewText(artifact, part);
    if (!text) throw new Error('当前预览没有可复制的文字。');
    if (!navigator.clipboard?.writeText) throw new Error('浏览器未提供剪贴板写入。');
    await navigator.clipboard.writeText(text);
    status('artifact-status', `已复制「${artifact.title}」的${part === 'steps' ? '步骤' : '内容'}；没有记录为采用或执行。`);
    await logEvent('copy_succeeded', contextRefs(context, artifact), context.roundId);
  } catch (error) {
    if (checked && previewKey === previewArtifactKey(artifact) && previewPart === part) {
      try { selectPreviewText(area); } catch { /* The visible text remains available for direct selection. */ }
    }
    status('artifact-status', checked
      ? `没有确认「${artifact.title}」复制成功。${error.message} 文字仍可手动选取，按 Ctrl+C 或使用系统复制菜单。`
      : `未复制：${error.message} 请先重试读取并核对版本。`, true);
  } finally {
    copying = false;
    renderPreview();
  }
}

async function exportPack() {
  if (exporting) return;
  exporting = true; render();
  let objectUrl;
  try {
    await commandQueue;
    const firstRead = await readState();
    if (!firstRead.ok) throw new Error(errorText(firstRead));
    const frozen = structuredClone(state);
    const pack = buildActionPack(frozen, { exportId: id(), generatedAt: new Date().toISOString(),
      allowSummaries: $('export-summary-consent').checked && consentSignature === packSignature(frozen) });
    const secondRead = await readState();
    if (!secondRead.ok) throw new Error(errorText(secondRead));
    if (pack.signature !== packSignature(state)) throw new Error('导出期间依据、选择或稿件版本变化，未发起下载。请核对后重试。');
    objectUrl = URL.createObjectURL(new Blob([pack.text], { type: 'text/plain;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = objectUrl; anchor.download = pack.filename;
    document.body.append(anchor); anchor.click(); anchor.remove();
    const usedUrl = objectUrl;
    setTimeout(() => URL.revokeObjectURL(usedUrl), 1000);
    objectUrl = null;
    status('operation-status', '已发起 TXT 下载，请在浏览器中查看；尚未确认文件落盘，也未记录为执行。');
    const context = activeSelection(frozen);
    await logEvent('download_requested', { ...contextRefs(context), exportId: pack.metadata.exportId, format: 'txt' }, context.roundId);
  } catch (error) {
    status('operation-status', error.message || '导出失败，页面文字仍可手动取用。', true);
  } finally {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    $('export-summary-consent').checked = false;
    consentSignature = null;
    exporting = false; render();
  }
}

function findSavedFeedback(pending, next) {
  const expected = pending.command.payload.feedbackRecord;
  const matching = (next.feedbackRecords ?? []).filter((record) => !pending.beforeIds.has(record.id) &&
    sameReference(record, expected) && record.artifactId === expected.artifactId && record.artifactVersion === expected.artifactVersion &&
    record.observation === expected.observation && (record.rawText || null) === expected.rawText);
  const exact = matching.filter((record) => {
    const execution = next.executionRecords?.find((item) => item.id === record.executionRecordId);
    const wanted = pending.command.payload.executionRecord;
    return execution?.execution === wanted.execution && execution.adoption === wanted.adoption &&
      (execution.scope ?? null) === wanted.scope && (execution.executedAt ?? null) === wanted.executedAt;
  });
  return exact.length === 1 ? exact[0] : null;
}

async function saveFeedback(event) {
  event?.preventDefault();
  if (saving) return false;
  const signature = formSignature();
  if (signature === lastSavedDraft && !dirty) return true;
  try {
    if (!pendingFeedback || pendingFeedback.signature !== signature) {
      const artifact = feedbackBinding || currentArtifacts(state).find((item) => item.id === $('feedback-artifact').value);
      const payload = makeFeedbackPayload(artifact, getFormDraft());
      pendingFeedback = { signature, command: command('FEEDBACK_SAVE', payload), beforeIds: new Set((state.feedbackRecords ?? []).map((item) => item.id)) };
      feedbackBinding = artifact;
    }
    saving = true; $('feedback-fields').disabled = true;
    status('feedback-status', '正在保存到本机浏览器…');
    const saved = await commit(pendingFeedback.command);
    if (!saved.ok) { status('feedback-status', errorText(saved), true); return false; }
    const record = findSavedFeedback(pendingFeedback, state);
    selectedFeedbackId = record?.id ?? null;
    lastSavedDraft = pendingFeedback.signature;
    dirty = false;
    pendingFeedback = null;
    savedRecordNotice = record
      ? `已保存到本机浏览器 · 稿件 v${record.artifactVersion} · ${readableTime(record.savedAt)}。实际执行时间仍按你的填写记录。`
      : '保存已完成。请从本机记录中明确选择用于下一轮的那条反馈；本页没有猜测最后一条记录。';
    status('feedback-status', savedRecordNotice);
    return true;
  } catch (error) {
    status('feedback-status', error.message || '保存失败，草稿仍保留。', true);
    return false;
  } finally {
    saving = false;
    render();
  }
}

function discardFeedback() {
  if (saving) return false;
  clearFeedbackForm();
  status('feedback-status', '未保存草稿已放弃；已有记录保留。');
  render();
  return true;
}

async function nextRound() {
  if (startingRound || saving) return;
  if (dirty) { status('round-status', '请先保存这份草稿，或明确放弃草稿后使用已有记录。', true); return; }
  if (!selectedFeedbackId || !state.feedbackRecords?.some((record) => record.id === selectedFeedbackId)) {
    status('round-status', '请先保存反馈，并选择用于下一轮的记录。', true); return;
  }
  if (!roundCommand || roundCommand.payload.feedbackId !== selectedFeedbackId) roundCommand = command('ROUND_START', { feedbackId: selectedFeedbackId });
  startingRound = true;
  $('next-round').disabled = true;
  try {
    status('round-status', '正在带着已保存的反馈建立下一轮…');
    const result = await commit(roundCommand);
    if (!result.ok) { status('round-status', errorText(result), true); return; }
    const navigated = await shared.navigateTo('decisions');
    if (navigated === false) status('operation-status', '新一轮已建立，但尚未进入第二页。请先按提示确认本轮资料；不会重复创建轮次。', true);
  } catch (error) {
    status('round-status', error.message || '新轮次未能继续，请重试。', true);
  } finally {
    startingRound = false;
    render();
  }
}

async function navigate(pageId, options) {
  if (!shared) return;
  if (saving || startingRound) { status('operation-status', '当前记录正在保存，请完成后再离开。'); return; }
  try { await shared.navigateTo(pageId, options); }
  catch (error) { status('operation-status', error.message || '暂时无法跳转，当前内容已保留。', true); }
}

async function refresh() {
  $('retry-load').hidden = true;
  const result = await readState(true);
  if (!result.ok) {
    $('load-state').hidden = false;
    status('load-message', errorText(result), true);
    $('retry-load').hidden = false;
    return;
  }
  render();
  if (state.savedAt && !readEventLogged) {
    readEventLogged = true;
    await logEvent('session_read', { pageId: 'action', stateRevision: state.revision });
  }
  await logEvent('page_viewed', { pageId: 'action' }, state.round.id, `page:${state.sessionId}`);
  await ensureArtifacts();
}

async function boot() {
  if (booting) return;
  booting = true;
  status('load-message', '正在读取本机的当前选择…');
  try {
    if (!shared) {
      const [store, generator, navigation, shell] = await Promise.all([
        import('../shared/state.js'), import('../shared/demo-data.js'), import('../shared/navigation.js'), import('../shared/shell.js'),
      ]);
      shared = { ...store, ...generator, ...navigation };
      shell.mountShell('action');
      unregisterGuard = shared.registerNavigationGuard({ isDirty: () => dirty || saving,
        onSave: () => saveFeedback(), onDiscard: () => discardFeedback() });
      unsubscribe = shared.subscribeSession((result) => {
        if (!result.ok) { status('operation-status', errorText(result), true); return; }
        const previous = activeSelection(state);
        acceptState(result.state);
        if (!generating && !saving && !startingRound) {
          render();
          if (!dirty && !sameReference(previous, activeSelection(state))) void ensureArtifacts();
        }
      });
    }
    await refresh();
  } catch (error) {
    status('load-message', `暂时无法接入共享模块或读取记录。${error.message || ''} 本页没有另建状态库，也没有自动载入案例。`, true);
    $('retry-load').hidden = false;
  } finally { booting = false; }
}

function handlePreviewTabKey(event, container, orientation) {
  const tabs = [...container.querySelectorAll('[role="tab"]')];
  const current = tabs.indexOf(event.target.closest('[role="tab"]'));
  if (current < 0) return;
  const previous = orientation === 'vertical' ? 'ArrowUp' : 'ArrowLeft';
  const next = orientation === 'vertical' ? 'ArrowDown' : 'ArrowRight';
  let index;
  if (event.key === previous) index = (current - 1 + tabs.length) % tabs.length;
  else if (event.key === next) index = (current + 1) % tabs.length;
  else if (event.key === 'Home') index = 0;
  else if (event.key === 'End') index = tabs.length - 1;
  else return;
  event.preventDefault();
  tabs[index].focus();
  tabs[index].click();
}

function connectPage() {
  // Enhance one fixed title before business boot; hidden-title waiting stays inside the shared controller.
  let titleMotion;
  try { titleMotion = enhanceFoldTitle($('delivery-title')); }
  catch { /* Optional presentation must leave the static title and business startup usable. */ }
  $('retry-load').addEventListener('click', boot);
  $('go-decisions-empty').addEventListener('click', () => navigate(state?.input.confirmedVersion === state?.round.inputVersion ? 'decisions' : 'intake'));
  document.querySelectorAll('[data-nav="decisions"]').forEach((button) => button.addEventListener('click', () => navigate('decisions')));
  $('artifact-retry').addEventListener('click', async () => { const result = await readState(); if (result.ok) await ensureArtifacts(); else status('artifact-status', errorText(result), true); });
  $('artifact-list').addEventListener('keydown', (event) => handlePreviewTabKey(event, $('artifact-list'), 'vertical'));
  $('preview-tabs').addEventListener('keydown', (event) => handlePreviewTabKey(event, $('preview-tabs'), 'horizontal'));
  $('preview-content-tab').addEventListener('click', () => choosePreviewPart('content'));
  $('preview-steps-tab').addEventListener('click', () => choosePreviewPart('steps'));
  $('copy-artifact').addEventListener('click', () => {
    const artifact = selectPreviewArtifact(previewItems, previewKey);
    void copyArtifact(artifact, $(previewPart === 'steps' ? 'preview-steps' : 'preview-body'), previewPart);
  });
  $('select-artifact').addEventListener('click', manuallySelectPreview);
  $('export-pack').addEventListener('click', exportPack);
  $('export-summary-consent').addEventListener('change', () => {
    consentSignature = $('export-summary-consent').checked ? packSignature(state) : null;
  });
  $('feedback-form').addEventListener('submit', saveFeedback);
  $('feedback-form').addEventListener('input', formChanged);
  $('feedback-form').addEventListener('change', formChanged);
  $('feedback-artifact').addEventListener('change', () => { feedbackBinding = currentArtifacts(state).find((artifact) => artifact.id === $('feedback-artifact').value); });
  $('discard-feedback').addEventListener('click', () => { if (!dirty || window.confirm('放弃这份尚未保存的反馈草稿？已保存的记录不会删除。')) discardFeedback(); });
  $('next-round').addEventListener('click', nextRound);
  $('source-details').addEventListener('toggle', () => {
    if (!$('source-details').open) return;
    const context = activeSelection(state);
    if (!context) return;
    const ids = new Set(currentArtifacts(state, context).flatMap((artifact) => artifact.sourceFactIds ?? []));
    for (const factId of ids) void logEvent('source_viewed', { ...contextRefs(context), sourceId: `fact:${factId}` }, context.roundId, `source:${context.inputVersion}:${factId}`);
  });
  $('event-retry').addEventListener('click', async () => {
    $('event-retry').disabled = true;
    try {
      const loaded = await readState();
      if (!loaded.ok) throw new Error(errorText(loaded));
      for (const [eventId, eventCommand] of pendingEvents) {
        const result = await commit(eventCommand);
        if (!result.ok) throw new Error(errorText(result));
        pendingEvents.delete(eventId);
      }
      $('event-retry').hidden = true;
      status('operation-status', '操作记录已补存；没有再次复制或下载。');
    } catch (error) { status('operation-status', error.message, true); }
    finally { $('event-retry').disabled = false; }
  });
  window.addEventListener('pageshow', (event) => { if (event.persisted && shared) void refresh(); });
  window.addEventListener('pagehide', (event) => {
    titleMotion?.destroy();
    if (!event.persisted) { unsubscribe?.(); unregisterGuard?.(); }
  });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') logPreviewView(); });
  void boot();
}

if (typeof document !== 'undefined') connectPage();
