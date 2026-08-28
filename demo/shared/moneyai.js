// The browser talks only to this project's backend, never MoneyAI's management ports.
export async function getMoneyAIStatus() {
  try {
    const response = await fetch('/api/moneyai/status', { cache: 'no-store' });
    if (!response.ok) throw new Error('backend_unavailable');
    return { ok: true, status: await response.json() };
  } catch {
    return { ok: false, code: 'backend_unavailable', message: '本项目后端未连接，不能判断MoneyAI业务通路是否可用。' };
  }
}
export async function requestMoneyAIAnalysis(request) {
  try {
    const response = await fetch('/api/moneyai/analysis', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request)
    });
    return await response.json();
  } catch {
    return { ok: false, code: 'backend_unavailable', message: '未获得MoneyAI返回；不会自动换成演示答案。' };
  }
}
