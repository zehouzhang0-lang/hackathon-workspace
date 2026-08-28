// Internal shared coordinator; public pages keep registerNavigationGuard unchanged.
const guards = new Set();
export function registerGuard(guard) {
  if (!guard || typeof guard.isDirty !== 'function') throw new TypeError('导航守卫需要isDirty。');
  guards.add(guard);
  return () => guards.delete(guard);
}
export function hasDirtyDrafts() { return [...guards].some((guard) => guard.isDirty()); }
export async function resolveDrafts(options = {}) {
  const ask = options.confirm || ((message) => window.confirm(message));
  const notify = options.notify || ((message) => window.dispatchEvent(new CustomEvent('demo:navigation-blocked', { detail: { message } })));
  for (const guard of guards) {
    try {
      if (!guard.isDirty()) continue;
      if (ask('还有未保存的编辑。是否先保存？取消可继续选择放弃或留在当前页。')) {
        const saved = await guard.onSave?.();
        if (!(saved === true || saved?.ok === true)) { notify('尚未保存，保留在当前页面。'); return false; }
      } else {
        if (!ask('放弃这些未保存编辑？取消则继续编辑。')) return false;
        if (await guard.onDiscard?.() === false) { notify('页面未同意放弃草稿，操作已取消。'); return false; }
      }
    } catch {
      notify('草稿处理失败，保留在当前页面。');
      return false;
    }
  }
  return true;
}
