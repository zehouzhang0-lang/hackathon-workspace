import { loadSession, dispatch, getMaterialBlob, subscribeSession } from '../shared/state.js';
import { buildDemoAnalysis, buildDemoArtifact } from '../shared/demo-data.js';
import { armTestFault, clearTestFault } from '../shared/test-hooks.js';
import { createMerchantIntakeDraft } from '../shared/intake-draft.js';
import { normalizeSessionState, stable } from '../shared/model.js';

const button = document.querySelector('#run-tests');
const summary = document.querySelector('#test-summary');
const results = document.querySelector('#test-results');
let state;
function check(condition, message) { if (!condition) throw new Error(message); }
function equal(actual, expected, message) { check(stable(actual) === stable(expected), message); }
function scoped(payload) { return { roundId: state.round.id, inputVersion: state.round.inputVersion, ...payload }; }
function nextIntakePayload(productName, description) {
  const draft = structuredClone(state.input.intake.draft);
  draft.userCorrections.push({ field: 'productName', before: draft.productName, after: productName });
  draft.productName = productName;
  draft.sources = [...new Set([...draft.sources, 'manual'])];
  draft.evidenceLedger = draft.evidenceLedger.filter((entry) => entry.field !== 'productName');
  draft.evidenceLedger.push({ field: 'productName', value: productName, status: 'confirmed_fact', source: 'manual' });
  return scoped({ draft, description, sourceBindings: structuredClone(state.input.intake.sourceBindings) });
}
async function readBack(expected, message) {
  await read();
  equal(state, expected, message);
}
async function read() {
  const result = await loadSession();
  check(result.ok, result.message || '读取失败');
  state = result.state;
  return state;
}
function command(type, payload) { return { type, payload, commandId: crypto.randomUUID(), expectedRevision: state.revision }; }
async function send(type, payload) {
  const result = await dispatch(command(type, payload));
  check(result.ok, result.message || type + '失败');
  state = result.state;
  return state;
}

button.addEventListener('click', async () => {
  button.disabled = true;
  let completed = 0;
  let intakeMaterial, legacyQuestionSnapshot;
  const run = async (name, operation) => {
    const item = document.createElement('li');
    item.textContent = name + '：执行中';
    results.append(item);
    try { await operation(); completed += 1; item.textContent = name + '：通过'; }
    catch (error) { item.textContent = name + '：失败，' + error.message; throw error; }
  };
  try {
    check(location.origin === 'http://127.0.0.1:4188' && location.pathname === '/tests/shared.html',
      '只允许在统一4188服务的隔离测试宿主手动开始。');
    await read();
    check(state.savedAt === null && state.revision === 0 && state.fixtureId === null && state.round.index === 1 &&
      state.input.description === '' && state.input.focus === null && state.input.intake === null &&
      state.input.confirmedVersion === null && !state.analysis && !state.selection &&
      [state.input.materials, state.input.facts, state.input.constraints, state.input.unknowns,
        state.artifacts, state.executionRecords, state.feedbackRecords, state.history, state.events,
        state.round.clarification.questions].every((items) => items.length === 0),
      '已有保存记录或输入；请使用新的独立浏览器配置，不会重置或替换现有数据。');
    summary.textContent = '正在真实调用此测试浏览器的IndexedDB';
    await run('空会话、五种子与首次原样核对', async () => {
      for (const fixtureId of ['shoe_store_report_fixed_v1', 'juicer_cup_v1', 'one_sentence_v1', 'scope_conflict_v1', 'underbed_complete_v1']) {
        await send('LOAD_FIXTURE', { fixtureId });
        check(!state.analysis && !state.selection && !state.feedbackRecords.length && !state.executionRecords.length, '不应提前载入结果或反馈');
        check(state.input.confirmedVersion === null, '载入草稿不能代替用户确认');
        check(state.input.intake.roundId === state.round.id && state.input.intake.inputVersion === state.round.inputVersion, '草稿须绑定新轮次');
        const original = structuredClone(state);
        const unchanged = command('INTAKE_SET', scoped({ draft: structuredClone(state.input.intake.draft),
          description: state.input.description, sourceBindings: structuredClone(state.input.intake.sourceBindings) }));
        const first = await dispatch(unchanged);
        check(first.ok, first.message || '原样核对未保存');
        equal(first.state, original, '无修改核对不能清演示身份或生成重复指标');
        await readBack(original, '必须实际读回同一版本、口径及演示身份');
        const retried = await dispatch(unchanged);
        check(retried.ok, retried.message || '原操作重试失败');
        equal(retried.state, original, '相同命令重试不能改变资料');
      }
    });
    await run('提交前中止保持原版本', async () => {
      const previous = structuredClone(state);
      armTestFault('before_commit', 'INPUT_EDIT');
      const result = await dispatch(command('INPUT_EDIT', { description: '合成测试：此笔必须回滚' }));
      check(!result.ok, '中止不能返回成功');
      await read();
      check(state.revision === previous.revision && state.input.description === previous.input.description, '中止必须回滚正式输入');
    });
    await run('提交后响应丢失与同命令重试', async () => {
      const original = command('INPUT_EDIT', { description: '合成测试：提交后失联' });
      armTestFault('after_commit', 'INPUT_EDIT');
      check(!(await dispatch(original)).ok, '应报告结果未确认');
      await read();
      check(state.input.description === original.payload.description, '已提交内容应能读回');
      const committedRevision = state.revision;
      const retry = await dispatch(original);
      check(retry.ok && retry.state.revision === committedRevision, '同命令重试不能重复写入');
      const reused = await dispatch({ ...original, payload: { description: '不能用同ID换内容' } });
      check(!reused.ok && reused.code === 'invalid_transition', '相同命令ID不同内容必须拒绝');
    });
    await run('过期revision与读取失败不冒充新会话', async () => {
      const stale = command('INPUT_EDIT', { description: '合成测试：旧版本写入' });
      stale.expectedRevision -= 1;
      check((await dispatch(stale)).code === 'conflict', '过期写入必须冲突');
      armTestFault('read');
      const failedRead = await loadSession();
      check(!failedRead.ok && failedRead.code === 'read_failed' && !failedRead.state, '读取失败不得生成空状态');
      await read();
    });
    await run('INTAKE_SET原文、编辑文、来源与更正同事务读回', async () => {
      // These are declared synthetic inputs, never captured speech or a model response.
      const fileText = JSON.stringify({ metrics: [{ metric: 'paid_orders', value: 0 }] });
      await send('MATERIAL_ADD', { file: new File([fileText], 'synthetic-intake.json', { type: 'application/json' }) });
      const material = state.input.materials.at(-1);
      intakeMaterial = { id: material.id, text: fileText };
      const locator = { type: 'json', pointer: '/metrics/0/value' };
      await send('MATERIAL_RESULT_SET', scoped({ materialId: material.id, materialVersion: material.version,
        status: 'parsed', error: null, facts: [{ id: null, key: 'paid_orders', value: 0, availability: 'known',
          unit: '笔', subject: '合成样品杯', source: { kind: 'file_extract', materialId: material.id,
            materialVersion: material.version, locator } }] }));
      const previousFacts = structuredClone(state.input.facts);
      const previousUnknowns = structuredClone(state.input.unknowns);
      const problem = '合成测试：先核对商品说明';
      const draft = createMerchantIntakeDraft({ sources: ['voice', 'manual', 'json'],
        transcript: '合成测试原文，不是麦克风识别：合成样品杯。' + problem,
        productName: '核对后的合成样品杯', currentProblem: problem, metrics: { paidOrders: 0 },
        unknowns: ['合成测试：流量口径未知'],
        evidenceLedger: [
          { field: 'currentProblem', value: problem, status: 'confirmed_fact', source: 'voice', quote: problem },
          { field: 'productName', value: '合成样品杯', status: 'confirmed_fact', source: 'voice', quote: '合成样品杯' },
          { field: 'metrics.paidOrders', value: 0, status: 'confirmed_fact', source: 'json' },
          { field: 'productName', value: '核对后的合成样品杯', status: 'confirmed_fact', source: 'manual' }
        ], userCorrections: [{ field: 'productName', before: '合成样品杯', after: '核对后的合成样品杯' }] });
      const sourceBindings = [
        { field: 'currentProblem', source: 'voice', locator: { type: 'intake', field: 'currentProblem', source: 'voice', quote: problem } },
        { field: 'metrics.paidOrders', source: 'json', materialId: material.id, materialVersion: material.version, locator }
      ];
      const description = '合成测试编辑文：这段文字不同于原始转写。';
      const version = state.round.inputVersion, revision = state.revision;
      await send('INTAKE_SET', scoped({ draft, description, sourceBindings }));
      const committed = structuredClone(state);
      await readBack(committed, '原文、编辑文、投影与保存元信息必须整体读回');
      equal(state.input.intake.draft, draft, '完整草稿、来源顺序、账本与更正不能丢失');
      equal(state.input.intake.sourceBindings, sourceBindings, '材料ID、版本与定位必须原样保存');
      check(state.input.description === description && state.input.description !== draft.transcript, '编辑文字不能替换原始转写');
      check(state.round.inputVersion === version + 1 && state.revision === revision + 1, '一次确认只增加一次业务与存储版本');
      check(state.input.intake.inputVersion === state.round.inputVersion && state.input.intake.savedAt === state.savedAt &&
        state.input.intake.roundId === state.round.id && state.input.intake.status === 'current', '九组保存语境必须与提交一致');
      for (const fact of previousFacts) equal(state.input.facts.find((item) => item.id === fact.id), fact, '既有材料事实与口径不能被确认卡覆盖');
      for (const unknown of previousUnknowns) equal(state.input.unknowns.find((item) => item.id === unknown.id), unknown, '外部未知不能被空数组清除');
      check(state.input.intake.draft.metrics.paidOrders === 0 && state.input.intake.draft.metrics.createdOrders === null, '真实零与未知必须区分');
      check(new Set(state.input.facts.map((fact) => fact.id)).size === state.input.facts.length &&
        state.input.facts.every((fact) => !fact.id.startsWith('draft_')), '持久化事实须为唯一真实ID');
      check(await (await getMaterialBlob(material.id)).text() === fileText, '来源原件须仍可实际读回');
    });
    await run('INTAKE_SET提交前abort全回滚，原命令可重试', async () => {
      const previous = structuredClone(state);
      const original = command('INTAKE_SET', nextIntakePayload('合成更正B', '合成测试：原子保存失败后应保留原文与编辑文。'));
      const captured = structuredClone(original);
      armTestFault('before_commit', 'INTAKE_SET');
      const failed = await dispatch(original);
      check(!failed.ok && failed.code === 'write_failed', '提交前中止必须报告保存失败');
      await readBack(previous, 'abort后输入、原文、来源、更正、历史、事件及保存时间必须全部不变');
      check(await (await getMaterialBlob(intakeMaterial.id)).text() === intakeMaterial.text, '中止不能损坏既有来源Blob');
      equal(original, captured, '失败不得改写待重试的ID、版本或载荷');
      const retried = await dispatch(original);
      check(retried.ok, '已中止的命令仍应可以原ID原载荷重试');
      state = retried.state;
      check(state.revision === previous.revision + 1 && state.round.inputVersion === previous.round.inputVersion + 1, '中止后的首次成功只增加一次版本');
      equal(state.input.intake.draft, original.payload.draft, '中止不能留下重复或半份更正');
      check(state.history.filter((entry) => entry.type === 'intake_revision').length ===
        previous.history.filter((entry) => entry.type === 'intake_revision').length + 1, '回滚不能留下历史记录');
      await readBack(structuredClone(state), '重试后的完整原子结果必须真实读回');
    });
    await run('INTAKE_SET提交后失联，原ID载荷重试不重复更正', async () => {
      const previous = structuredClone(state);
      const original = command('INTAKE_SET', nextIntakePayload('合成更正C', '合成测试：提交后回执丢失，不能推断没有保存。'));
      const captured = structuredClone(original);
      armTestFault('after_commit', 'INTAKE_SET');
      const lost = await dispatch(original);
      check(!lost.ok && lost.code === 'write_failed', '丢回执应保持结果未确认');
      await read();
      check(state.revision === previous.revision + 1 && state.round.inputVersion === previous.round.inputVersion + 1, '已提交的确认应完整增加一次版本');
      equal(state.input.intake.draft, original.payload.draft, '丢回执后必须能读回全部原文和更正');
      equal(state.input.intake.sourceBindings, original.payload.sourceBindings, '丢回执不能丢来源定位');
      check(state.input.description === original.payload.description, '编辑文字应与原文在同一事务中保存');
      check(state.input.intake.draft.userCorrections.length === previous.input.intake.draft.userCorrections.length + 1, '一次操作只追加一条本次更正');
      const committed = structuredClone(state);
      const retry = await dispatch(original);
      check(retry.ok, '原命令重试应找到已提交回执');
      equal(retry.state, committed, '原ID重试不能增加版本、历史、更正、事件或保存时间');
      equal(original, captured, '重试必须保留原expectedRevision、commandId与完整载荷');
      await readBack(committed, '重试不能改变实际持久化结果');
      const reused = await dispatch({ ...original, payload: { ...original.payload, description: '同ID不能悄悄换内容' } });
      check(!reused.ok && reused.code === 'invalid_transition', '同ID不同内容必须拒绝');
      await readBack(committed, '被拒绝的重用不能改变已存确认卡');
    });
    await run('首次补问null、失败回滚与幂等额度', async () => {
      const previous = structuredClone(state);
      const sourceFactIds = [state.input.facts.find((fact) => fact.intakeField === 'productName').id];
      const first = command('QUESTION_SET', scoped({ questionId: null, status: 'asked',
        questionText: '合成测试：这轮有多少时间？', sourceFactIds }));
      armTestFault('before_commit', 'QUESTION_SET');
      check(!(await dispatch(first)).ok, '首次发问中止不能占额度');
      await readBack(previous, '首次发问abort不能留下ID、问题、事件或幂等回执');
      armTestFault('after_commit', 'QUESTION_SET');
      check(!(await dispatch(first)).ok, '首次发问丢回执不能报成功');
      await read();
      const clarification = state.round.clarification;
      check(clarification.questions.length === 1 && clarification.activeQuestionId && clarification.remaining === 2 &&
        clarification.limit === 3, '首次问题须分配一次ID且仅占一个额度');
      check(state.round.inputVersion === previous.round.inputVersion, '发问不增加输入版本');
      equal(clarification.questions[0].sourceFactIds, sourceFactIds, '问题来源必须随题保存');
      check(state.events.filter((event) => event.type === 'clarification_asked').length === 1, '首次重试不能重复发问事件');
      const committed = structuredClone(state);
      const retry = await dispatch(first);
      check(retry.ok && first.payload.questionId === null, '首次重试仍保留原null ID');
      equal(retry.state, committed, '首次问题重试不能再占额度或另分配ID');
      const blocked = await dispatch(command('QUESTION_SET', scoped({ ...first.payload, questionText: '合成测试：不能并发下一题' })));
      check(!blocked.ok && blocked.code === 'invalid_transition', '当前问题未完成时不能再问');
      await readBack(committed, '重复发问被拒绝后问题与额度仍须保持');
    });
    await run('三问顺序、旧答案、额度及loadSession读回', async () => {
      const originalIntake = structuredClone(state.input.intake);
      const originalDescription = state.input.description;
      const first = state.round.clarification.activeQuestionId;
      const firstVersion = state.round.inputVersion;
      await send('QUESTION_SET', scoped({ questionId: first, status: 'answered',
        answer: { availability: 'known', rawText: '合成测试：今天约二十分钟' } }));
      check(state.round.inputVersion === firstVersion + 1 && state.round.clarification.activeQuestionId === null, '回答应保存一次并释放当前问题');
      equal(state.input.intake, originalIntake, '回答不能自动重写九组或原始转写');
      await readBack(structuredClone(state), '第一题答案与额度应重新从IndexedDB读回');
      legacyQuestionSnapshot = structuredClone(state);
      const secondVersion = state.round.inputVersion;
      await send('QUESTION_SET', scoped({ questionId: null, status: 'asked', questionText: '合成测试：是否知道商品点击数？', sourceFactIds: [] }));
      const second = state.round.clarification.activeQuestionId;
      check(second && second !== first && state.round.clarification.remaining === 1 && state.round.inputVersion === secondVersion, '第二题顺序、独立ID与额度应正确');
      await readBack(structuredClone(state), '第二题读回不应丢失第一题');
      const beforeSkip = state.round.inputVersion;
      await send('QUESTION_SET', scoped({ questionId: second, status: 'skipped' }));
      check(state.round.inputVersion === beforeSkip && state.round.clarification.remaining === 1 &&
        state.round.clarification.activeQuestionId === null, '跳过不返还已问额度，也不增加输入版本');
      check(state.input.unknowns.some((entry) => entry.sourceId === 'question:' + second && entry.reason === 'skipped'), '跳过保留来源明确的未知');
      await readBack(structuredClone(state), '跳过后的问题和缺口必须读回');
      await send('QUESTION_SET', scoped({ questionId: null, status: 'asked', questionText: '合成测试：本次观察窗口清楚吗？', sourceFactIds: [] }));
      const third = state.round.clarification.activeQuestionId;
      check(third && ![first, second].includes(third) && state.round.clarification.remaining === 0, '第三题应使用最后一个额度');
      await send('QUESTION_SET', scoped({ questionId: first, status: 'answered',
        answer: { availability: 'known', rawText: '合成测试：更正为今天约十分钟' } }));
      check(state.round.clarification.activeQuestionId === third && state.round.clarification.questionId === third,
        '更正旧答案不能替换当前第三题或兼容别名');
      await send('QUESTION_SET', scoped({ questionId: third, status: 'answered', answer: { availability: 'unknown', rawText: null } }));
      const clarification = state.round.clarification;
      equal(clarification.questions.map((entry) => entry.questionId), [first, second, third], '历史必须按原问题顺序保留');
      check(clarification.questions[0].answer.rawText === '合成测试：更正为今天约十分钟' &&
        clarification.questions[1].status === 'skipped' && clarification.questions[2].answer.rawText === null &&
        clarification.questions[2].answer.availability === 'unknown', '回答、跳过与未知不能混为零或被后题覆盖');
      check(clarification.activeQuestionId === null && clarification.remaining === 0 &&
        clarification.questionId === third && clarification.status === 'answered', '新历史与兼容别名应一致');
      check(state.input.unknowns.some((entry) => entry.sourceId === 'question:' + third && entry.reason === 'unknown'), '未知答案应保留关联缺口');
      equal(state.input.intake, originalIntake, '三问及旧答案更正不能二次INTAKE_SET');
      check(state.input.description === originalDescription, '补问不能擅自拼接编辑文字');
      const committed = structuredClone(state);
      await readBack(committed, '三问历史、答案、来源及耗尽额度必须整体读回');
      const fourth = await dispatch(command('QUESTION_SET', scoped({ questionId: null, status: 'asked', questionText: '合成测试：不允许第四问', sourceFactIds: [] })));
      check(!fourth.ok && fourth.code === 'invalid_transition', '重新读取后也不能产生第四问');
      await readBack(committed, '额度拒绝不能改写任何已有历史');
      const savedQuestions = structuredClone(state.round.clarification);
      await send('INPUT_EDIT', { description: '合成测试：普通补充不能重发本轮三问额度。' });
      equal(state.round.clarification, savedQuestions, '普通输入更新不能重置问题或额度');
      equal(state.input.intake.draft, originalIntake.draft, '普通编辑也必须保留原始转写和更正链');
      await readBack(structuredClone(state), '输入更新后的耗尽额度仍须真实读回');
    });
    await run('旧单问兼容视图（内存，不替代旧库升级）', async () => {
      const legacy = structuredClone(legacyQuestionSnapshot);
      const { questions, activeQuestionId, remaining, ...singleton } = legacy.round.clarification;
      legacy.round.clarification = { ...singleton, limit: 1 };
      const original = structuredClone(legacy);
      const view = normalizeSessionState(legacy);
      equal(legacy, original, '兼容读取不能改写传入的旧记录');
      equal(view.round.clarification.questions, questions, '旧单问的原ID、正文、来源与答案必须保留');
      check(view.round.clarification.limit === 3 && view.round.clarification.remaining === 2 &&
        view.round.clarification.activeQuestionId === null, '旧已回答题转为一条历史，不得重发三次额度');
      check(view.revision === original.revision && view.round.inputVersion === original.round.inputVersion &&
        view.savedAt === original.savedAt, '只读兼容不能生成新版本或保存时间');
      equal(view.events, original.events, '只读兼容不能制造保存事件');
      // Never write this deliberately old-shaped fixture into a live database.
      await readBack(structuredClone(state), '兼容视图检查不能改动实际测试会话');
    });
    await run('Blob保存、坏替换拒绝与显式删除', async () => {
      const file = new File(['合成测试原件'], 'synthetic.txt', { type: 'text/plain' });
      await send('MATERIAL_ADD', { file });
      const material = state.input.materials.at(-1);
      check(await (await getMaterialBlob(material.id)).text() === '合成测试原件', '应读回相同Blob内容');
      const beforeCategory = structuredClone(state);
      await send('MATERIAL_CATEGORY_SET', { roundId: state.round.id, inputVersion: state.round.inputVersion,
        materialId: material.id, materialVersion: material.version, userCategory: 'content' });
      check(state.input.materials.at(-1).userCategory === 'content', '用户分类应保存为元数据');
      check(state.input.materials.at(-1).version === material.version, '分类不能冒充原件的新版本');
      check(state.round.inputVersion === beforeCategory.round.inputVersion + 1, '分类变更须重新核对输入');
      equal(state.input.facts, beforeCategory.input.facts, '用户分类不能生成或改写事实');
      await readBack(structuredClone(state), '用户分类和输入版本须实际读回');
      check(await (await getMaterialBlob(material.id)).text() === '合成测试原件', '分类不能改变Blob原文');
      const invalid = new File([new Uint8Array([255])], 'invalid.txt', { type: 'text/plain' });
      const replaced = await dispatch(command('MATERIAL_REPLACE', { materialId: material.id, inputVersion: state.round.inputVersion, file: invalid }));
      check(!replaced.ok, '坏UTF-8替换应拒绝');
      check(await (await getMaterialBlob(material.id)).text() === '合成测试原件', '坏替换不能覆盖旧Blob');
      await send('MATERIAL_REMOVE', { materialId: material.id });
      check(await getMaterialBlob(material.id) === null, '显式删除应无法再读取Blob');
    });
    await run('事务成功后订阅收到同一版本', async () => {
      let notification;
      const stop = subscribeSession((result) => { notification = result; });
      try {
        await send('INPUT_EDIT', { description: '合成测试：订阅只对应已提交内容' });
        check(notification?.ok && notification.state.revision === state.revision, '订阅必须对应成功事务');
        await read();
        check(notification.state.revision === state.revision, '通知版本应真实可读');
      } finally { stop(); }
    });
    await run('分析、取用成品、done/worse与新轮幂等', async () => {
      await send('LOAD_FIXTURE', { fixtureId: 'underbed_complete_v1' });
      for (let index = 1; index <= 3; index += 1) {
        await send('QUESTION_SET', scoped({ questionId: null, status: 'asked', questionText: '合成新轮测试问题' + index, sourceFactIds: [] }));
        await send('QUESTION_SET', scoped({ questionId: state.round.clarification.activeQuestionId, status: 'skipped' }));
      }
      const previousQuestions = structuredClone(state.round.clarification);
      check(previousQuestions.remaining === 0, '开新轮前必须实际用尽旧轮额度');
      await send('FOCUS_CONFIRM', { inputVersion: state.round.inputVersion });
      const generated = buildDemoAnalysis(state);
      check(generated.ok, '合成分析应生成');
      await send('ANALYSIS_SET', { analysis: generated.analysis });
      await send('PATH_SELECT', { analysisId: state.analysis.id, pathId: state.analysis.paths[0].id, inputVersion: state.round.inputVersion });
      const output = buildDemoArtifact(state);
      check(output.ok, '合成成品应生成');
      for (const artifact of output.artifacts) await send('ARTIFACT_SAVE', { artifact });
      check(!state.executionRecords.length, '成品不能自动记为执行');
      const artifact = state.artifacts[0];
      const refs = { id: null, roundId: artifact.roundId, analysisId: artifact.analysisId, pathId: artifact.pathId, inputVersion: artifact.inputVersion, artifactId: artifact.id, artifactVersion: artifact.version };
      await send('FEEDBACK_SAVE', { executionRecord: { ...refs, adoption: 'intended', execution: 'done', scope: '合成测试全部步骤', executedAt: null }, feedbackRecord: { ...refs, observation: 'worse', rawText: '合成测试记录，不是经营结果', metrics: [], observedWindow: { start: null, end: null } } });
      await read();
      check(state.executionRecords[0].execution === 'done' && state.executionRecords[0].executedAt === null && state.feedbackRecords[0].observation === 'worse', '执行与结果应独立读回');
      const feedbackId = state.feedbackRecords[0].id;
      await send('ROUND_START', { feedbackId });
      const revision = state.revision;
      await send('ROUND_START', { feedbackId });
      check(state.round.index === 2 && state.revision === revision, '同反馈不能重复开轮');
      check(state.round.clarification.remaining === 3 && state.round.clarification.questions.length === 0 &&
        state.round.clarification.activeQuestionId === null, '只有明确新轮才恢复三问额度');
      equal(state.history.find((entry) => entry.type === 'round' && entry.sourceFeedbackId === feedbackId)?.round.clarification,
        previousQuestions, '新轮必须保留旧轮已用完的完整问题历史');
      await readBack(structuredClone(state), '新轮额度及旧轮历史必须实际读回');
    });
    summary.textContent = completed + '项隔离宿主检查通过；loadSession读回不等于页面刷新，旧单问仅内存兼容。产品UI、跨标签、真实刷新、旧库升级与下载仍需另验。';
    summary.dataset.result = 'passed';
  } catch (error) {
    summary.textContent = '已通过' + completed + '项；停止：' + error.message;
    summary.dataset.result = 'failed';
  } finally { clearTestFault(); summary.dataset.complete = 'true'; }
});
