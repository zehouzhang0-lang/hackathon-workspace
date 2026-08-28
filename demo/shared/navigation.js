import { loadSession } from './state.js';
import { registerGuard, resolveDrafts, hasDirtyDrafts } from './draft-guards.js';

// Reuse the same guard registry for explicit fixture/session replacement.
export { resolveDrafts };

const paths = { intake: '01-intake.html', decisions: '02-decisions.html', action: '03-action.html' };
export function registerNavigationGuard(guard) {
  return registerGuard(guard);
}
function notice(message) {
  window.dispatchEvent(new CustomEvent('demo:navigation-blocked', { detail: { message } }));
}
export async function navigateTo(pageId, { sourceId } = {}) {
  if (!Object.hasOwn(paths, pageId)) { notice('无法前往未知页面。'); return false; }
  if (sourceId !== undefined && !/^(input:(description|focus)|(material|fact|question):[A-Za-z0-9_-]{1,80})$/.test(sourceId)) {
    notice('来源定位格式不正确。'); return false;
  }
  if (!(await resolveDrafts({ notify: notice }))) return false;
  const result = await loadSession();
  if (!result.ok) { notice(result.message); return false; }
  const state = result.state;
  if (pageId === 'decisions' && state.input.confirmedVersion !== state.round.inputVersion) {
    notice('请先在第一页确认这轮问题。'); return false;
  }
  if (pageId === 'action' && (!state.selection || state.analysis?.status === 'stale' || state.selection.inputVersion !== state.round.inputVersion)) {
    notice('请先在第二页选择当前有效路径。'); return false;
  }
  const target = new URL(paths[pageId], window.location.href);
  target.search = '';
  target.hash = '';
  if (sourceId) target.searchParams.set('sourceId', sourceId);
  window.location.assign(target.href);
  return true;
}
if (typeof window !== 'undefined') window.addEventListener('beforeunload', (event) => {
  if (hasDirtyDrafts()) { event.preventDefault(); event.returnValue = ''; }
});
