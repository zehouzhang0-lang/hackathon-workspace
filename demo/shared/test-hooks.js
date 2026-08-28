let pending = null;
export function armTestFault(stage, commandType = null) {
  if (typeof location === 'undefined' || !location.pathname.startsWith('/tests/')) throw new Error('失败注入只允许在隔离测试入口使用。');
  if (!['open', 'read', 'before_commit', 'after_commit'].includes(stage)) throw new Error('未知失败阶段。');
  pending = { stage, commandType };
}
export function clearTestFault() { pending = null; }
export function takeTestFault(stage, commandType = null) {
  if (pending?.stage !== stage || (pending.commandType && pending.commandType !== commandType)) return false;
  pending = null;
  return true;
}
