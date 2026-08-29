import { dispatch, loadSession, subscribeSession } from './state.js';
import { navigateTo, resolveDrafts } from './navigation.js';
import { getAiSettings, saveAiSettings, requestAiChat } from './ai.js';
import { workspaceFeedbackSource, workspaceMemory, workspaceRounds } from './workspace-view.js';
import { getMoneyAIStatus } from './moneyai.js';

const PAGES = [
  ['intake', '经营资料', 'folder'],
  ['decisions', '成交方案', 'route'],
  ['action', '操作与成品', 'document']
];
const ICONS = {
  folder: ['M3 7V5a2 2 0 0 1 2-2h4l2 3h8a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z', 'M3 9h18'],
  route: ['M6 4v12a3 3 0 0 0 3 3h3', 'M18 20V8a3 3 0 0 0-3-3h-3', 'm9 2 3 3-3 3', 'm15 16-3 3 3 3'],
  document: ['M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9Z', 'M14 3v6h6', 'M8 13h8M8 17h5'],
  memory: ['M8 3a4 4 0 0 0-4 4v1a4 4 0 0 0-1 7 4 4 0 0 0 5 5 3 3 0 0 0 4-2V6a3 3 0 0 0-4-3Z', 'M16 3a4 4 0 0 1 4 4v1a4 4 0 0 1 1 7 4 4 0 0 1-5 5 3 3 0 0 1-4-2', 'M7 9c3 0 3 4 0 4M17 9c-3 0-3 4 0 4'],
  archive: ['M3 3h18v5H3Z', 'M5 8v13h14V8', 'M10 12h4'],
  settings: ['M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z', 'M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2 3.46-.08-.03a1.7 1.7 0 0 0-1.8.25l-.5.29a1.7 1.7 0 0 0-.84 1.69V22h-4v-.09a1.7 1.7 0 0 0-.84-1.69l-.5-.29a1.7 1.7 0 0 0-1.8-.25l-.08.03-2-3.46.06-.06A1.7 1.7 0 0 0 4.6 15v-.58a1.7 1.7 0 0 0-1-1.55L3.5 12.8v-4l.09-.05a1.7 1.7 0 0 0 1-1.55v-.58a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2-3.46.08.03a1.7 1.7 0 0 0 1.8-.25l.5-.29A1.7 1.7 0 0 0 9.42 0h4v.09a1.7 1.7 0 0 0 .84 1.69l.5.29a1.7 1.7 0 0 0 1.8.25l.08-.03 2 3.46-.06.06a1.7 1.7 0 0 0-.34 1.88v.58a1.7 1.7 0 0 0 1 1.55l.09.05v4l-.09.05a1.7 1.7 0 0 0-1 1.55Z'],
  help: ['M9 9a3 3 0 1 1 5 2c-1 1-2 1-2 3', 'M12 17h.01', 'M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z'],
  close: ['m6 6 12 12M6 18 18 6']
};
function el(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}
function icon(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  for (const [key, value] of Object.entries({ viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.6', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true', class: 'shared-icon' })) svg.setAttribute(key, value);
  for (const data of ICONS[name] || []) {
    const path = document.createElementNS(svg.namespaceURI, 'path');
    path.setAttribute('d', data); svg.append(path);
  }
  return svg;
}
function button(text, className, onClick, iconName) {
  const node = el('button', undefined, className);
  node.type = 'button';
  if (iconName) node.append(icon(iconName));
  node.append(el('span', text));
  node.addEventListener('click', onClick);
  return node;
}
function emptyState(title, description) {
  const section = el('section', undefined, 'workspace-empty');
  section.append(icon('archive'), el('h3', title), el('p', description));
  return section;
}
const formatDate = (value) => value && Number.isFinite(Date.parse(value))
  ? new Date(value).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }) : '尚未保存';

export function mountShell(pageId) {
  const host = document.querySelector('#shared-shell');
  const footer = document.querySelector('#shared-footer');
  if (!host || !footer) return;
  host.replaceChildren(); footer.replaceChildren();
  const currentPage = PAGES.find(([id]) => id === pageId);
  if (currentPage) document.title = currentPage[1] + ' · 路芽';

  const sidebar = el('aside', undefined, 'shared-sidebar');
  sidebar.setAttribute('aria-label', '工作台导航');
  const brand = el('div', undefined, 'shared-brand');
  const brandText = el('div', '路芽', 'shared-brand-name');
  brandText.append(el('span', '老板的商业第二大脑', 'shared-brand-subtitle'));
  brand.append(el('span', '路', 'shared-brand-mark'), brandText);
  const navigation = el('nav', undefined, 'shared-steps');
  navigation.setAttribute('aria-label', '本轮工作步骤');
  for (const [id, title, iconName] of PAGES) {
    const item = button(title, 'shared-step', () => { if (id !== pageId) navigateTo(id); }, iconName);
    if (id === pageId) item.setAttribute('aria-current', 'step');
    navigation.append(item);
  }
  const memoryButton = button('商业记忆', 'shared-step', () => openWorkspace('memory'), 'memory');
  const archiveButton = button('活动档案', 'shared-step', () => openWorkspace('archive'), 'archive');
  const aiSettingsButton = button('大模型配置', 'shared-step', () => openAiSettings(), 'settings');
  navigation.append(memoryButton, archiveButton, aiSettingsButton);
  sidebar.append(brand, el('p', '我的工作台', 'shared-nav-label'), navigation);
  const sidebarBottom = el('div', undefined, 'shared-sidebar-bottom');
  sidebarBottom.append(button('演示指南', 'shared-step', () => openWorkspace('guide'), 'help'));
  const workspaceCard = el('div', undefined, 'shared-workspace-card');
  const workspaceLabel = el('div');
  workspaceLabel.append(el('span', '我的生意', 'shared-workspace-title'), el('span', '本机工作区 · 资料不会随 Git 同步', 'shared-workspace-note'));
  workspaceCard.append(el('span', '店', 'shared-workspace-avatar'), workspaceLabel);
  sidebarBottom.append(workspaceCard); sidebar.append(sidebarBottom);

  const header = el('header', undefined, 'shared-header');
  const breadcrumb = el('div', undefined, 'shared-breadcrumb');
  const roundLabel = el('strong', '本轮验证');
  breadcrumb.append(el('span', '我的工作台'), el('span', '/'), roundLabel);
  const headerActions = el('div', undefined, 'shared-header-actions');
  headerActions.append(el('span', '本地演示', 'shared-mode'), button('演示指南 ↗', 'button button--quiet', () => openWorkspace('guide')));
  header.append(breadcrumb, headerActions);
  const notice = el('p', undefined, 'shared-notice status');
  notice.setAttribute('role', 'status'); notice.hidden = true;
  host.append(sidebar, header, notice);

  const progress = [];
  for (const target of document.querySelectorAll('[data-workflow-steps]')) {
    const list = el('ol', undefined, 'workspace-progress');
    list.setAttribute('aria-label', '本轮进度');
    ['资料与问题', '分析与选方案', '执行与迭代'].forEach((title, index) => {
      const item = el('li');
      const id = PAGES[index][0];
      if (id === pageId) item.setAttribute('aria-current', 'step');
      const control = button(title, '', () => { if (id !== pageId) navigateTo(id); });
      control.prepend(el('span', String(index + 1).padStart(2, '0'), 'workspace-progress-number'));
      item.append(control); list.append(item); progress.push({ item, id });
    });
    target.replaceChildren(list);
  }

  const dialog = el('dialog', undefined, 'workspace-dialog');
  dialog.setAttribute('aria-labelledby', 'workspace-dialog-title');
  const dialogHeader = el('div', undefined, 'workspace-dialog-header');
  const dialogHeading = el('div');
  const dialogTitle = el('h2'); dialogTitle.id = 'workspace-dialog-title';
  const dialogSubtitle = el('p');
  dialogHeading.append(dialogTitle, dialogSubtitle);
  const close = button('', 'button button--quiet workspace-dialog-close', () => dialog.close(), 'close');
  close.setAttribute('aria-label', '关闭窗口');
  dialogHeader.append(dialogHeading, close);
  const dialogBody = el('div', undefined, 'workspace-dialog-body');
  dialog.append(dialogHeader, dialogBody); host.append(dialog);
  let workspaceView = null;
  let openingId = 0;
  function show(message) {
    notice.textContent = message; notice.hidden = false;
    if (dialog.open) {
      let status = dialogBody.querySelector('.workspace-dialog-status');
      if (!status) { status = el('p', undefined, 'workspace-dialog-status status'); status.setAttribute('role', 'status'); dialogBody.append(status); }
      status.textContent = message;
    }
  }
  window.addEventListener('demo:navigation-blocked', (event) => show(event.detail.message));
  dialog.addEventListener('close', () => { workspaceView = null; openingId += 1; });
  document.querySelectorAll('[data-demo-guide]').forEach((control) => {
    control.addEventListener('click', () => openWorkspace('guide'));
  });

  function summaryGrid(items) {
    const grid = el('div', undefined, 'workspace-summary-grid');
    for (const [value, label] of items) {
      const card = el('article'); card.append(el('strong', String(value)), el('span', label)); grid.append(card);
    }
    return grid;
  }
  function memoryContent(state) {
    const memory = workspaceMemory(state);
    dialogBody.append(summaryGrid([[memory.materialCount, '本轮原始资料'], [memory.knownFactCount, '已提供的信息项'], [memory.archivedRoundCount, '已归档的轮次']]));
    const section = el('section', undefined, 'workspace-memory-section');
    section.append(el('h3', '从已保存的信息，理解你的生意'));
    const facts = el('dl', undefined, 'workspace-memory-facts');
    for (const [label, value] of [['商家', memory.merchant], ['商品', memory.product], ['当前问题', memory.problem], ['经营限制', memory.constraints.join('；')]]) {
      facts.append(el('dt', label), el('dd', value || '尚未提供，保持未知'));
    }
    section.append(facts); dialogBody.append(section);
    if (memory.unknowns.length) {
      const unknowns = el('section', undefined, 'workspace-memory-section');
      unknowns.append(el('h3', '还需要核对'));
      const list = el('ul'); memory.unknowns.forEach((value) => list.append(el('li', value)));
      unknowns.append(list); dialogBody.append(unknowns);
    }
    if (memory.stale) dialogBody.append(el('p', '资料已有变更，当前理解需要回到资料页重新核对。', 'status'));
    dialogBody.append(el('p', (memory.synthetic ? '含合成案例资料。' : '') + '这里是本机已保存资料的只读汇总；商家自述和假设不等于平台核验，不代表任何外部服务已建立跨轮记忆。', 'workspace-dialog-note'));
    dialogBody.append(button('查看活动档案 →', 'button button--secondary', () => openWorkspace('archive')));
  }
  function archiveContent(state) {
    const rounds = workspaceRounds(state);
    const memory = workspaceMemory(state);
    if (!rounds.length) {
      dialogBody.append(emptyState('每一轮选择，都会留下来', '保存资料、选择方案并记录反馈后，就能在这里回看当时的材料、方案和交付版本。'));
      return;
    }
    dialogBody.append(summaryGrid([[rounds.length, '本机轮次'], [state.artifacts.length, '交付版本'], [state.feedbackRecords.length, '反馈记录']]));
    const list = el('div', undefined, 'workspace-archive-list');
    for (const entry of rounds) {
      const card = el('article', undefined, 'workspace-archive-card');
      const head = el('div', undefined, 'workspace-archive-head');
      const product = entry.archived ? entry.input?.intake?.draft?.productName : memory.product;
      head.append(el('h3', `第 ${String(entry.round.index).padStart(2, '0')} 轮 · ${product || '经营验证'}`), el('span', entry.status, 'tag'));
      card.append(head, el('p', entry.path ? '已选方案：' + entry.path.title : '尚未选择方案'), el('p', `${formatDate(entry.at)} · ${entry.artifacts.length} 份交付版本 · ${entry.feedbacks.length} 条反馈`, 'workspace-archive-meta'));
      const details = el('details'); details.append(el('summary', '查看当时的资料与记录'));
      const body = el('div');
      body.append(el('p', entry.input?.description || '这轮没有问题原话。'));
      if (entry.input?.materials?.length) body.append(el('p', '原始资料：' + entry.input.materials.map((item) => item.name).join('、')));
      entry.artifacts.forEach((artifact) => body.append(el('p', `交付稿 v${artifact.version}：${artifact.title}（${artifact.status === 'current' ? '当前版本' : '历史版本'}）`)));
      for (const feedback of entry.feedbacks) {
        const { artifact, execution, path } = workspaceFeedbackSource(state, feedback);
        const record = el('div', undefined, 'workspace-feedback-entry');
        const adoption = { unknown: '未说明', intended: '打算采用', adopted: '已采用', partial: '部分采用', declined: '未采用' }[execution?.adoption] || '未说明';
        const executed = { unknown: '未说明', not_started: '还未执行', partial: '部分执行', done: '已执行' }[execution?.execution] || '未说明';
        const observation = { unknown: '还不知道', better: '自述变好', unchanged: '自述无明显变化', worse: '自述变差' }[feedback.observation] || '还不知道';
        record.append(el('p', `${formatDate(feedback.savedAt)} · ${path ? path.title : '原方案待核对'} · 输入 v${feedback.inputVersion}`),
          el('p', `${artifact ? artifact.title : '原稿件待核对'} · 稿件 v${feedback.artifactVersion}`),
          el('p', `采用：${adoption} / 执行：${executed} / 观察：${observation}`));
        if (feedback.rawText) record.append(el('p', feedback.rawText));
        body.append(record);
      }
      details.append(body); card.append(details); list.append(card);
    }
    dialogBody.append(list, el('p', '原记录保留各自的资料、方案与稿件版本。选择、取用、执行与效果分别记录；本机档案只保存在当前浏览器。', 'workspace-dialog-note'));
  }
  function guideContent() {
    const steps = el('ol', undefined, 'workspace-guide-list');
    for (const [title, content] of [
      ['先把问题说清楚', '填写当前困扰、上传资料，或载入一个合成案例；核对理解后再分析。'],
      ['比较方案，由你决定', '查看本轮建议、依据和风险，明确选中方案。资料不足时不强行生成两条路径。'],
      ['拿到成品，记录真实反馈', '取用操作内容和稿件；执行后补充观察数据，再看本机规则给出的复盘。']
    ]) { const item = el('li'); item.append(el('strong', title), el('span', content)); steps.append(item); }
    dialogBody.append(steps);
    const controls = el('div', undefined, 'shared-fixtures');
    const select = el('select'); select.setAttribute('aria-label', '选择合成演示案例');
    for (const [value, label] of [['juicer_cup_v1', '合成案例 · 榨汁杯'], ['underbed_complete_v1', '合成案例 · 床底收纳箱'], ['one_sentence_v1', '合成案例 · 仅一句话'], ['scope_conflict_v1', '合成案例 · 口径冲突']]) {
      const option = el('option', label); option.value = value; select.append(option);
    }
    const load = button('载入示例', 'button', async () => {
      load.disabled = true;
      try {
        if (!window.confirm('用合成示例替换当前会话？包括当前未保存编辑、资料与历史；不影响其他应用。')) return;
        if (!(await resolveDrafts({ notify: show }))) return;
        const current = await loadSession();
        if (!current.ok) { show(current.message); return; }
        const result = await dispatch({ type: 'LOAD_FIXTURE', payload: { fixtureId: select.value }, expectedRevision: current.state.revision, commandId: crypto.randomUUID() });
        if (!result.ok) { show(result.message); return; }
        dialog.close(); show('合成示例已载入；请核对资料。没有预先生成分析、执行或反馈。');
        if (pageId !== 'intake') await navigateTo('intake');
      } finally { load.disabled = false; }
    });
    controls.append(select, load); dialogBody.append(controls);
    dialogBody.append(el('p', '示例会在你确认后替换当前会话。当前为本地规则演示；可在左侧「大模型配置」接入自己的 API，未配置且未逐次同意前不会外发任何材料。', 'workspace-dialog-note'));
    const reset = button('清空本次演示', 'button button--quiet workspace-reset', async () => {
      if (!window.confirm('清空本会话的资料、原件与历史？已导出的文件不能撤回。')) return;
      if (!(await resolveDrafts({ notify: show }))) return;
      reset.disabled = true;
      try {
        const current = await loadSession();
        if (!current.ok) { show(current.message); return; }
        const result = await dispatch({ type: 'RESET_SESSION', payload: { confirmed: true }, expectedRevision: current.state.revision, commandId: crypto.randomUUID() });
        if (!result.ok) { show(result.message); return; }
        dialog.close();
        if (pageId === 'intake') location.reload(); else await navigateTo('intake');
      } finally { reset.disabled = false; }
    });
    dialogBody.append(reset);
  }
  async function openWorkspace(view) {
    workspaceView = view;
    const request = ++openingId;
    const copy = { memory: ['商业记忆', '让下一次分析，不必从零开始。'], archive: ['活动档案', '把每次选择、交付和反馈，接起来。'], guide: ['从资料到下一轮验证', '用一个合成案例，走通完整操作。'] }[view];
    dialogTitle.textContent = copy[0]; dialogSubtitle.textContent = copy[1]; dialogBody.replaceChildren();
    if (!dialog.open) dialog.showModal();
    if (view === 'guide') { guideContent(); return; }
    dialogBody.append(el('p', '正在读取本机记录…', 'workspace-dialog-note'));
    const result = await loadSession();
    if (request !== openingId || !dialog.open) return;
    dialogBody.replaceChildren();
    if (!result.ok) { dialogBody.append(el('p', result.message || '本地记录读取失败，未使用空白记录替代。', 'status')); return; }
    if (view === 'memory') memoryContent(result.state); else archiveContent(result.state);
  }

  const bar = el('div', undefined, 'shared-footer');
  const provenanceStatus = { ai: '本地规则演示 · 可在左侧「大模型配置」接入 API', moneyai: 'MoneyAI接入核对中' };
  const provenance = el('p');
  function renderProvenance() {
    provenance.textContent = `${provenanceStatus.ai} · ${provenanceStatus.moneyai} · 资料与记录保存在当前浏览器`;
  }
  renderProvenance();
  getMoneyAIStatus().then((result) => {
    provenanceStatus.moneyai = result.ok && result.status.serviceReachable
      ? 'MoneyAI本机服务已响应，项目分析与历史通路尚未接通'
      : '本地分析/历史不等于MoneyAI分析或记忆';
    window.dispatchEvent(new CustomEvent('demo:moneyai-status', { detail: result }));
    renderProvenance();
  });
  const saved = el('span', '正在读取本机记录…');
  bar.append(provenance, saved); footer.append(bar);

  // 「大模型配置」dialog: the only external path is the API the user saves here.
  // The key stays in the local backend (server/ai-settings.json), never in the browser.
  const aiDialog = el('dialog', undefined, 'workspace-dialog');
  aiDialog.setAttribute('aria-labelledby', 'ai-settings-title');
  const aiHeader = el('div', undefined, 'workspace-dialog-header');
  const aiHeading = el('div');
  const aiTitle = el('h2', '大模型配置'); aiTitle.id = 'ai-settings-title';
  const aiSubtitle = el('p', '配置你自己的 OpenAI 兼容 API 后，「整理」会把当前结构化草稿、描述与转写原文发送到你设置的地址，由 AI 辅助补全仍为空的字段；未配置时不外发任何内容。');
  aiHeading.append(aiTitle, aiSubtitle);
  const aiClose = button('', 'button button--quiet workspace-dialog-close', () => aiDialog.close(), 'close');
  aiClose.setAttribute('aria-label', '关闭窗口');
  aiHeader.append(aiHeading, aiClose);
  const aiBody = el('div', undefined, 'workspace-dialog-body');
  aiDialog.append(aiHeader, aiBody); footer.append(aiDialog);

  function aiField(labelText, input) {
    const wrap = el('label', undefined, 'ai-settings-field');
    wrap.append(el('span', labelText), input);
    return wrap;
  }
  function aiStatus(text, isError) {
    let node = aiBody.querySelector('.workspace-dialog-status');
    if (!node) { node = el('p', undefined, 'workspace-dialog-status status'); node.setAttribute('role', 'status'); aiBody.append(node); }
    node.textContent = text;
    node.classList.toggle('status--error', !!isError);
  }
  async function openAiSettings() {
    aiBody.replaceChildren();
    const settings = await getAiSettings();
    const baseUrl = el('input'); baseUrl.type = 'url'; baseUrl.setAttribute('aria-label', 'API 地址'); baseUrl.className = 'field';
    baseUrl.placeholder = 'https://api.example.com/v1';
    const apiKey = el('input'); apiKey.type = 'password'; apiKey.setAttribute('aria-label', 'API Key'); apiKey.className = 'field';
    apiKey.autocomplete = 'off'; apiKey.placeholder = 'sk-…';
    const model = el('input'); model.type = 'text'; model.setAttribute('aria-label', '模型名'); model.className = 'field';
    model.placeholder = '例如 glm-4 / deepseek-chat';
    if (settings.ok && settings.configured) {
      baseUrl.value = settings.baseUrl || '';
      model.value = settings.model || '';
      if (settings.hasKey) apiKey.placeholder = '已保存在本机；重新输入可更换';
    }
    const actions = el('div', undefined, 'shared-fixtures');
    const save = button('保存', 'button', async () => {
      save.disabled = true;
      try {
        const payload = { baseUrl: baseUrl.value.trim(), model: model.value.trim() };
        const trimmedKey = apiKey.value.trim();
        if (trimmedKey) payload.apiKey = trimmedKey;
        const result = await saveAiSettings(payload);
        if (!result.ok) { aiStatus(result.message || '保存失败，请核对填写内容。', true); return; }
        apiKey.value = '';
        if (result.hasKey) apiKey.placeholder = '已保存在本机；重新输入可更换';
        aiStatus('已保存。第一页整理资料时，可在逐次同意后让模型补齐本机规则未读出的字段。');
        await refreshAiProvenance();
      } finally { save.disabled = false; }
    });
    const test = button('测试连接', 'button button--quiet', async () => {
      test.disabled = true;
      try {
        const result = await requestAiChat({ messages: [{ role: 'user', content: '只回复两个字：正常' }], maxTokens: 512 });
        aiStatus(result.ok ? '连接成功，模型已回复。' : (result.message || '连接失败。'), !result.ok);
      } finally { test.disabled = false; }
    });
    const clear = button('清除配置', 'button button--quiet', async () => {
      if (!window.confirm('清除已保存的 AI 配置？之后不会向任何外部服务发送内容。')) return;
      const result = await saveAiSettings({ clear: true });
      if (result.ok) {
        baseUrl.value = ''; apiKey.value = ''; model.value = '';
        apiKey.placeholder = 'sk-…';
        aiStatus('已清除。');
        await refreshAiProvenance();
      } else aiStatus(result.message || '清除失败。', true);
    });
    actions.append(save, test, clear);
    aiBody.append(aiField('API 地址（OpenAI 兼容；填到 /v1 为止，不要带 /chat/completions）', baseUrl),
      aiField('API Key（只保存在本机后端，不会进入浏览器）', apiKey),
      aiField('模型名', model), actions,
      el('p', '发送范围：第一页「整理」时的当前结构化草稿、描述、转写原文，以及你逐次同意发送的材料文本。AI 只补仍为空的字段，不覆盖已有字段；每条新增值必须带本次实际发送内容中的原文引文，引文无法核对就拒收。', 'workspace-dialog-note'));
    if (!(settings.ok && settings.configured)) aiStatus('尚未配置；当前为纯本地演示，不会外发任何内容。');
    aiDialog.showModal();
  }
  async function refreshAiProvenance() {
    const result = await getAiSettings();
    provenanceStatus.ai = result.ok && result.configured
      ? `AI 已配置（${result.model}）· 原文只发送到你设置的地址`
      : '本地规则演示 · 可在左侧「大模型配置」接入 API';
    renderProvenance();
  }
  refreshAiProvenance();
  function renderSave(result) {
    if (!result.ok) { saved.textContent = '本地记录读取失败'; show(result.message); return; }
    const state = result.state;
    roundLabel.textContent = `第 ${String(state.round.index).padStart(2, '0')} 轮验证 / ${currentPage?.[1] || '工作台'}`;
    saved.textContent = state.savedAt ? `本机记录 · ${formatDate(state.savedAt)}` : '这轮还没有保存内容';
    for (const { item, id } of progress) {
      const complete = id === 'intake' ? state.input.confirmedVersion === state.round.inputVersion
        : id === 'decisions' ? Boolean(state.selection && state.analysis?.status !== 'stale' && state.selection.inputVersion === state.round.inputVersion) : false;
      item.classList.toggle('is-complete', complete);
    }
  }
  subscribeSession((result) => {
    renderSave(result);
    if (dialog.open && workspaceView !== 'guide' && result.ok) openWorkspace(workspaceView);
  });
  loadSession().then(renderSave);
}
