import { dispatch, loadSession, subscribeSession } from './state.js';
import { navigateTo, resolveDrafts } from './navigation.js';
import { getMoneyAIStatus } from './moneyai.js';

export function mountShell(pageId) {
  const host = document.querySelector('#shared-shell');
  const footer = document.querySelector('#shared-footer');
  if (!host || !footer) return;
  host.replaceChildren();
  const header = document.createElement('header');
  header.className = 'shared-header';
  const brand = document.createElement('span');
  brand.className = 'shared-brand';
  brand.textContent = '路芽';
  const pageTitles = { intake: '资料确认', decisions: '找到优先问题', action: '执行并记录' };
  if (pageTitles[pageId]) document.title = pageTitles[pageId] + ' · 路芽';
  const navigation = document.createElement('nav');
  navigation.className = 'shared-steps';
  navigation.setAttribute('aria-label', '本轮工作步骤');
  [['intake', '1 资料确认'], ['decisions', '2 找到优先问题'], ['action', '3 执行并记录']].forEach(([id, text]) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'shared-step';
    button.textContent = text;
    if (id === pageId) button.setAttribute('aria-current', 'step');
    button.addEventListener('click', () => { if (id !== pageId) navigateTo(id); });
    navigation.append(button);
  });
  const controls = document.createElement('div');
  controls.className = 'shared-fixtures';
  const select = document.createElement('select');
  select.setAttribute('aria-label', '选择合成演示案例');
  [['juicer_cup_v1', '合成案例 · 榨汁杯'], ['underbed_complete_v1', '合成案例 · 床底收纳箱'], ['one_sentence_v1', '合成案例 · 仅一句话'], ['scope_conflict_v1', '合成案例 · 口径冲突']].forEach(([value, label]) => {
    const option = document.createElement('option');
    option.value = value; option.textContent = label; select.append(option);
  });
  const load = document.createElement('button');
  load.type = 'button'; load.className = 'button button--secondary'; load.textContent = '载入示例';
  controls.append(select, load);
  header.append(brand, navigation, controls);
  const notice = document.createElement('p');
  notice.className = 'shared-notice status'; notice.setAttribute('role', 'status'); notice.hidden = true;
  host.append(header, notice);
  function show(message) { notice.textContent = message; notice.hidden = false; }
  window.addEventListener('demo:navigation-blocked', (event) => show(event.detail.message));
  load.addEventListener('click', async () => {
    load.disabled = true;
    try {
      if (!window.confirm('用合成示例替换当前会话？包括当前未保存编辑、资料与历史；不影响其他应用。')) return;
      if (!(await resolveDrafts({ notify: show }))) return;
      const current = await loadSession();
      if (!current.ok) { show(current.message); return; }
      const result = await dispatch({ type: 'LOAD_FIXTURE', payload: { fixtureId: select.value }, expectedRevision: current.state.revision, commandId: crypto.randomUUID() });
      if (!result.ok) { show(result.message); return; }
      show('合成示例已载入；请到第一页确认本轮问题。没有提前载入分析、执行或反馈。');
      if (pageId !== 'intake') await navigateTo('intake');
    } finally { load.disabled = false; }
  });
  footer.replaceChildren();
  const bar = document.createElement('div'); bar.className = 'shared-footer';
  const provenance = document.createElement('p');
  provenance.textContent = '基础演示 · 视觉仍在迭代 · 当前分析与历史仅存本机，MoneyAI接入核对中';
  getMoneyAIStatus().then((result) => {
    provenance.textContent = result.ok && result.status.serviceReachable
      ? '基础演示 · MoneyAI本机服务已响应，项目分析与历史通路尚未接通'
      : '基础演示 · 本地分析/历史不等于MoneyAI分析或记忆';
    window.dispatchEvent(new CustomEvent('demo:moneyai-status', { detail: result }));
  });
  const saved = document.createElement('span'); saved.textContent = '尚未读取本地记录';
  const reset = document.createElement('button'); reset.type = 'button'; reset.className = 'button button--quiet'; reset.textContent = '清空本次演示';
  reset.addEventListener('click', async () => {
    if (!window.confirm('清空本会话的资料、原件与历史？已导出的文件不能撤回。')) return;
    if (!(await resolveDrafts({ notify: show }))) return;
    const current = await loadSession();
    if (!current.ok) { show(current.message); return; }
    const result = await dispatch({ type: 'RESET_SESSION', payload: { confirmed: true }, expectedRevision: current.state.revision, commandId: crypto.randomUUID() });
    if (!result.ok) { show(result.message); return; }
    await navigateTo('intake');
    if (pageId === 'intake') location.reload();
  });
  function renderSave(result) {
    saved.textContent = result.ok ? (result.state.savedAt ? '已读回本地记录 · 第' + result.state.round.index + '轮' : '这轮还没有保存内容') : '本地记录读取失败';
  }
  subscribeSession((result) => {
    if (result.ok) saved.textContent = result.state.savedAt ? '本机已有记录 · 第' + result.state.round.index + '轮' : '尚未保存';
    else { saved.textContent = '本地记录读取失败'; show(result.message); }
  });
  loadSession().then(renderSave);
  bar.append(provenance, saved, reset); footer.append(bar);
}
