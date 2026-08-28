# Agent 3｜第三页实现与验收记录

更新：2026-08-28。**本批按最新 PRD V1.0 完成 P3 可独立的实验身份展示、采用/执行分离及精简反馈承载。新共享首轮策略与 `FEEDBACK_DETAILS_VERSION=1` 尚未发布到 C，新增明细仍受明确门禁；C6—C8、真实 UI 与本机持久保存/读回仍未验，不称整页完成。先交原四文件与最终hash，待共享实际发布后按统筹通知继续接线，无需重新开工批准。**

## 新 PRD V1.0：P3 独立实现批次

已完整阅读统筹指定的 PRD 原件，重点核对第9、10、11.3、15、17、19、20节；按最新下发覆盖旧草图冲突。首轮A应为“详情页首屏”，B为“真实问题验证内容”；后续是否采用购买问答区由共享依据判断，不固定 A→B。本页不写新策略模板，也不把旧 `juicer_faq` / `juicer_video_intro` 记录改名。

### 本批代码与共享边界

- `experimentIdentityRows(path)` 读取保存的 `path.experiment.experimentId` / `hypothesis`；当前卡、整包TXT与历史完整记录共用。没有拼接首轮ID，也不用标题、索引或当前 priority 补值。八项实验投影与原参数 `assumptionIds → 同路径 estimate.assumptions` 保留；旧记录缺字段明确未知。
- `describeActionPath` 新增两个明确 actionKey 的说明分支：`juicer_first_screen` 仅指首屏，`juicer_question_video` 是实际验证和拍摄安排，不是生成视频。旧路径保持旧语义，稿件正文始终读取共享已保存版本。
- 反馈采用三按钮与执行三按钮分组，采用/执行/观察/异常初始均为未知。“已采用”只改采用值，不自动记 done；“还没执行”只改执行值。可清除回未知，实际执行日期仍可为空。
- 原因与实际改动优先显示；样本、前后加购率、观察、异常、新限制放进可展开的补充区。所有字段选填，复制/TXT仍在反馈之前，不要求填表。附件仍明确禁用等待 C6，不改成 MATERIAL_ADD。
- `makeFeedbackPayload(..., { detailsVersion })` 严格检查共享版本 `=== 1`。缺标志时，采用、原因、样本、比例、异常或限制有任一新值（包括0）就拒绝提交并保留草稿；纯旧文字/执行/范围反馈可继续用原接口，且完全省略新增键。
- 百分比输入按0—100校验后只转一次0—1；空白保留null、0保留0；新增点击只能非负安全整数。原因1000字、原话500字、限制最多20项各300字，越界报错，不截断或悄悄丢值。不从样本、采用或感受推断执行、失败和因果。
- 新字段全部进入草稿签名、dirty守卫与原稿绑定。`findSavedFeedback` 对版本、原因、样本/单位、比例、异常、限制及独立执行/采用逐项核对；缺完整匹配时保留原 pending commandId 与草稿。保存匹配成功和随后读回分别提示；读回再次完整匹配后才标本条已读取，不再提前批量打读回标记。
- 新版反馈只读展示放到已保存记录、复盘补充区及完整实验记录；旧记录不补默认比例/异常。历史实验仍只用本次 `readReviewRecord` 返回原bundle里的 path/analysis，没有取当前分析替代。

统筹最新确认：六份共享新首轮代码仍只是 D 盘候选，尚未发布到 C；本批不把纯 DTO 测试说成新版真实保存，不把新 key 分支说成新首轮稿已生成。统筹正在独立验收共享首轮与C7；收到真实发布的精确hash/接口后在同一任务继续接线，无需用户再次批准开工，当前不提前猜 C7/C8 能力。独立的 `D:/路芽新项目` 不属于本任务，没有转入任何文件。

### 本批实际检查与证据范围

| 检查 | 结果与范围 |
| --- | --- |
| 下方 PRD 8组 | 暂存模块实际 **8/8通过、0失败**：旧真实reducer、严格版本门禁、v1 DTO解析、非法输入、完整回执、旧记录显示、实验身份、取用/历史/静态接线。v1 DTO不提交旧reducer。 |
| 原 C5 9组 | 暂存模块实际 **9/9通过**。此时C共享仍是旧榨汁杯方案；本结果只证明旧快照与旧生成器兼容，不代表新首轮A/B接测。下方旧脚本仍按旧契约保留。 |
| 原 REQ30 10组 | 暂存模块实际 **10/10通过**；仅允许 `A3_ACTION_HTML` 指向本批暂存HTML，断言语义不变。未扩展公共suite/旧长审计。 |
| JS语法 | 同目录暂存JS的 `node --check` 退出0。最终正式文件再次检查结果随hash交接。 |
| HTML/CSS静态 | **144唯一ID、103 JS字面挂载点**；label/ARIA有效、三采用/三执行均未选、各下拉默认unknown、风险与实验不在反馈折叠内、单固定动效标题、CSS作用域/变量/括号通过。只检查源码，没有浏览器渲染。 |
| 内容检查 | 使用既有 `python -B scripts/verify_demo_content.py`，不改公共脚本；最终退出码与统计随交接回执。Markdown正则保持不触发链接扫描，不删事件守卫。 |

源码位置：HTML实验区约136行、采用/执行约176/199行、补充反馈约231行；JS解析/载荷约100/117行、身份投影约264行、草稿约719行、保存匹配约1082/1096行、完整历史约1321行、状态接线约1412/1512行；CSS新增规则约297行。下方18-ID表随本批同步，旧批次结果仍保留为历史。

### 尚未验证或未接通

真实1920×1080页面首屏、点击/折叠、焦点、复制/剪贴板、TXT下载落盘、IDB事务/读回、刷新/多标签、真实动画与截图均未验；没有重试 Browser 或备用工具，没有可冒充实截的图像。新首轮稿/实验身份真实共享保存、新明细真实 FEEDBACK_SAVE、反馈附件C6、再判断C7、显式候选建轮C8、MoneyAI历史仍待对应共享发布与统筹运行窗口。本机记录不标 MoneyAI 记忆。

### 文件安全与交接

唯一正式写入仍为 `demo/03-action.html`、`demo/pages/action.css`、`demo/pages/action.js` 和本QA。写前 C 空闲 7075733504 字节；暂存前原四文件与 D 备份逐项 SHA-256 一致，备份目录 `D:/CodexBackups/luya/prd-agent3/20260828T145858600378Z`。同目录暂存先UTF-8/非空/无替代字符/无NUL/无尾空格及语法/定向检查，再flush/fsync、复核旧hash与备份后逐个 `os.replace`。任何原子替换失败立即停止，不重试、清理或改权限；最终四hash、替换/读回回执单独返回统筹，不把QA自身hash嵌入QA。

### PRD本批可复现脚本（8组）

在仓库根目录，将本节 JavaScript 原样经 PowerShell UTF-8 here-string 交给 `node --input-type=module`。默认读取正式本页；暂存检查可设 `A3_ACTION_MODULE` / `A3_ACTION_HTML` 指向本批同目录暂存文件。只导入无持久会话的 model/demo-data 与页面纯函数，不导入 state.js、不访问IDB。

<!-- A3_PRD_SMOKE_START -->
```javascript
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createEmptyState, reduceCommand } from './demo/shared/model.js';
import { buildDemoAnalysis, buildDemoArtifact } from './demo/shared/demo-data.js';
const modulePath = process.env.A3_ACTION_MODULE || './demo/pages/action.js';
const htmlPath = process.env.A3_ACTION_HTML || './demo/03-action.html';
const { activeSelection, currentArtifacts, buildActionCopy, buildActionPack, experimentIdentityRows,
  experimentCardRows, experimentAssumptionLines, describeActionPath, makeFeedbackPayload, parseFeedbackDetails,
  hasFeedbackDetailsInput, feedbackDetailsMatch, feedbackDetailRows, findSavedFeedback, resolveFeedbackRecord } = await import(modulePath);
const NOW = '2026-08-28T15:00:00.000Z';
function harness() {
  let serial = 0;
  const context = { now: NOW, newId: () => 'a3_prd_' + (++serial) };
  let state = createEmptyState(context);
  const send = (type, payload) => {
    const result = reduceCommand(state, { type, payload, commandId: 'a3_prd_cmd_' + (++serial),
      expectedRevision: state.revision }, context);
    state = result.state; return result;
  };
  send('LOAD_FIXTURE', { fixtureId: 'underbed_complete_v1' });
  send('FOCUS_CONFIRM', { inputVersion: state.round.inputVersion });
  const analysis = buildDemoAnalysis(state);
  assert.equal(analysis.ok, true);
  send('ANALYSIS_SET', { analysis: analysis.analysis });
  send('PATH_SELECT', { analysisId: state.analysis.id, pathId: state.analysis.paths[0].id,
    inputVersion: state.round.inputVersion });
  const generated = buildDemoArtifact(state);
  assert.equal(generated.ok, true);
  for (const artifact of generated.artifacts) send('ARTIFACT_SAVE', { artifact });
  return { get state() { return state; }, send };
}
function draft(overrides = {}) {
  return { adoption: 'unknown', execution: 'unknown', observation: 'unknown', rawText: '', scope: '', executedAt: null,
    reason: '', sampleSize: '', metricBeforePercent: '', metricAfterPercent: '', constraintsText: '',
    guardrailStatus: 'unknown', ...overrides };
}
function payload(overrides = {}, options = { detailsVersion: 1 }) {
  const h = harness();
  return makeFeedbackPayload(currentArtifacts(h.state)[0], draft(overrides), options);
}

test('PRD legacy feedback remains a real reducer transaction without extension keys', () => {
  const h = harness(), artifact = currentArtifacts(h.state)[0];
  const before = structuredClone(h.state);
  const savedPayload = makeFeedbackPayload(artifact, draft({ rawText: '合成反馈：还在观察', execution: 'done',
    observation: 'worse', scope: '仅改了原稿第一部分' }));
  assert(!Object.hasOwn(savedPayload.feedbackRecord, 'detailsVersion'));
  assert.equal(savedPayload.executionRecord.adoption, 'unknown');
  assert.equal(savedPayload.executionRecord.executedAt, null);
  h.send('FEEDBACK_SAVE', savedPayload);
  const record = h.state.feedbackRecords.at(-1), bundle = resolveFeedbackRecord(h.state, record.id);
  assert(bundle);
  assert.equal(bundle.feedback.rawText, savedPayload.feedbackRecord.rawText);
  assert.equal(bundle.execution.scope, savedPayload.executionRecord.scope);
  assert.equal(bundle.execution.execution, 'done');
  assert.equal(bundle.execution.adoption, 'unknown');
  assert.equal(bundle.execution.executedAt, null);
  for (const key of ['roundId','analysisId','pathId','inputVersion','artifactId','artifactVersion']) {
    assert.equal(bundle.feedback[key], savedPayload.feedbackRecord[key]);
  }
  assert.deepEqual(h.state.round, before.round);
  assert.deepEqual(h.state.selection, before.selection);
  assert.deepEqual(h.state.artifacts, before.artifacts);
  assert.equal(h.state.feedbackRecords.length, before.feedbackRecords.length + 1);
});

test('PRD every new filled field including zero requires the strict version 1 capability', () => {
  const additions = [
    { adoption: 'adopted' }, { adoption: 'partial' }, { adoption: 'declined' }, { adoption: 'intended' },
    { reason: '暂时无法拍摄' }, { sampleSize: '0' }, { sampleSize: 0 },
    { metricBeforePercent: '0' }, { metricAfterPercent: 0 },
    { constraintsText: '无法同时修改两个位置' }, { guardrailStatus: 'clear' }, { guardrailStatus: 'triggered' },
  ];
  for (const version of [undefined, null, 0, '1', 2]) {
    for (const addition of additions) {
      const value = draft({ rawText: '即使有旧字段也不能静默丢明细', ...addition });
      assert.equal(hasFeedbackDetailsInput(value), true);
      const copy = structuredClone(value);
      assert.throws(() => makeFeedbackPayload(currentArtifacts(harness().state)[0], value, { detailsVersion: version }),
        /新版反馈保存尚未接通/);
      assert.deepEqual(value, copy);
    }
  }
  assert.equal(hasFeedbackDetailsInput(draft()), false);
  assert.equal(hasFeedbackDetailsInput(draft({ reason: ' \n ', constraintsText: ' \n ' })), false);
});

test('PRD v1 DTO converts percentage once, keeps zero/null, and never infers execution', () => {
  const result = payload({ adoption: 'adopted', sampleSize: '0', metricBeforePercent: '6.62',
    metricAfterPercent: '100', reason: '采用正文', constraintsText: '限制一\n限制二' });
  assert.equal(result.executionRecord.adoption, 'adopted');
  assert.equal(result.executionRecord.execution, 'unknown');
  assert.equal(result.executionRecord.executedAt, null);
  assert.equal(result.feedbackRecord.observation, 'unknown');
  assert.deepEqual(result.feedbackRecord.metrics, []);
  assert.deepEqual(result.feedbackRecord.observedWindow, { start: null, end: null });
  assert.deepEqual(parseFeedbackDetails(draft()), { detailsVersion: 1, reason: null, sampleSize: null,
    sampleUnit: null, metricBefore: null, metricAfter: null, constraintsLearned: [], guardrailStatus: 'unknown' });
  assert.equal(result.feedbackRecord.sampleSize, 0);
  assert.equal(result.feedbackRecord.sampleUnit, 'product_clicks');
  assert.equal(result.feedbackRecord.metricBefore, 0.0662);
  assert.equal(result.feedbackRecord.metricAfter, 1);
  assert.equal(result.feedbackRecord.guardrailStatus, 'unknown');
  assert.deepEqual(result.feedbackRecord.constraintsLearned, ['限制一', '限制二']);
  for (const adoption of ['adopted','partial','declined','unknown','intended']) {
    for (const execution of ['unknown','not_started','partial','done']) {
      const item = payload({ adoption, execution, rawText: '合成自述', sampleSize: '100', metricAfterPercent: '0' });
      assert.equal(item.executionRecord.adoption, adoption);
      assert.equal(item.executionRecord.execution, execution);
      assert.equal(item.feedbackRecord.metricAfter, 0);
      assert.equal(item.feedbackRecord.observation, 'unknown');
    }
  }
});

test('PRD invalid new details are rejected without clipping or partial number parsing', () => {
  for (const value of ['-1','1.5','9007199254740992','1e2','100次','Infinity',{},true]) {
    assert.throws(() => parseFeedbackDetails(draft({ sampleSize: value })));
  }
  for (const key of ['metricBeforePercent','metricAfterPercent']) {
    for (const value of ['-0.1','100.01','6.62%','6.62abc','1e1','NaN',Infinity,{},true]) {
      assert.throws(() => parseFeedbackDetails(draft({ [key]: value })));
    }
    assert.equal(parseFeedbackDetails(draft({ [key]: '0' }))[key === 'metricBeforePercent' ? 'metricBefore' : 'metricAfter'], 0);
  }
  assert.throws(() => payload({ reason: '字'.repeat(1001) }));
  assert.throws(() => payload({ rawText: '字'.repeat(501) }));
  assert.throws(() => payload({ constraintsText: Array(21).fill('一项').join('\n') }));
  assert.throws(() => payload({ constraintsText: '字'.repeat(301) }));
  assert.throws(() => payload({ guardrailStatus: 'safe' }));
  assert.throws(() => payload({ adoption: 'done' }));
  assert.throws(() => payload({ execution: 'adopted' }));
  assert.throws(() => payload({ executedAt: '2026-02-30', rawText: '日期需核对' }));
  const edge = payload({ reason: '字'.repeat(1000), rawText: '字'.repeat(500),
    constraintsText: Array(20).fill('字'.repeat(300)).join('\n'), sampleSize: '9007199254740991' });
  assert.equal(edge.feedbackRecord.reason.length, 1000);
  assert.equal(edge.feedbackRecord.rawText.length, 500);
  assert.equal(edge.feedbackRecord.constraintsLearned.length, 20);
  assert.equal(edge.feedbackRecord.sampleSize, Number.MAX_SAFE_INTEGER);
});

test('PRD exact receipt matching catches dropped details, zero changes, and independent adoption/execution', () => {
  const expected = payload({ adoption: 'adopted', rawText: '合成回执', reason: '采用原因', sampleSize: '0',
    metricBeforePercent: '0', metricAfterPercent: '6.62', constraintsText: '第一项\n第二项', guardrailStatus: 'triggered' });
  const record = { ...structuredClone(expected.feedbackRecord), id: 'saved_feedback', executionRecordId: 'saved_execution' };
  const execution = { ...structuredClone(expected.executionRecord), id: 'saved_execution' };
  const pending = { beforeIds: new Set(), command: { payload: expected } };
  const next = { feedbackRecords: [record], executionRecords: [execution] };
  assert.equal(feedbackDetailsMatch(record, expected.feedbackRecord), true);
  assert.equal(findSavedFeedback(pending, next)?.id, record.id);
  for (const key of ['detailsVersion','reason','sampleSize','sampleUnit','metricBefore','metricAfter','constraintsLearned','guardrailStatus']) {
    const dropped = structuredClone(record); delete dropped[key];
    assert.equal(feedbackDetailsMatch(dropped, expected.feedbackRecord), false, key);
    assert.equal(findSavedFeedback(pending, { ...next, feedbackRecords: [dropped] }), null, key);
  }
  for (const changed of [
    { sampleSize: null }, { metricBefore: null }, { metricAfter: 6.62 },
    { constraintsLearned: ['第二项','第一项'] }, { detailsVersion: '1' }, { guardrailStatus: 'unknown' },
  ]) assert.equal(feedbackDetailsMatch({ ...record, ...changed }, expected.feedbackRecord), false);
  for (const changed of [{ adoption: 'unknown' }, { execution: 'done' }]) {
    assert.equal(findSavedFeedback(pending, { ...next, executionRecords: [{ ...execution, ...changed }] }), null);
  }
  assert.equal(findSavedFeedback(pending, { ...next, feedbackRecords: [record, { ...record, id: 'duplicate' }] }), null);
  assert.equal(findSavedFeedback({ ...pending, beforeIds: new Set([record.id]) }, next), null);
});

test('PRD read-only feedback projection preserves old unknowns and exact stored ratios', () => {
  const h = harness();
  h.send('FEEDBACK_SAVE', makeFeedbackPayload(currentArtifacts(h.state)[0], draft({ rawText: '旧记录' })));
  const bundle = resolveFeedbackRecord(h.state, h.state.feedbackRecords.at(-1).id);
  assert.match(feedbackDetailRows(bundle.feedback).flat().join(' '), /原记录未保存新版明细.*未知/);
  const details = payload({ rawText: '新DTO显示', sampleSize: '0', metricBeforePercent: '0', metricAfterPercent: '6.62' }).feedbackRecord;
  const before = structuredClone(details), rows = feedbackDetailRows(details), text = rows.flat().join(' ');
  assert.match(text, /0 次新增商品点击/);
  assert.match(text, /0%（保存比例 0）/);
  assert.match(text, /6.62%（保存比例 0.0662）/);
  assert.match(text, /异常情况未知/);
  assert.deepEqual(details, before);
});

test('PRD saved experiment identity and legacy action names are projections, never invented IDs or next paths', () => {
  // Synthetic projection DTO only while shared identity fields are unpublished.
  const path = { optionLabel: 'A', actionKey: 'juicer_first_screen', title: '标题不是身份',
    experiment: { experimentId: 'SAVED-EXPERIMENT-ID', hypothesis: '原计划待验证的假设', assumptionIds: ['p_original'] },
    estimate: { assumptions: [{ id: 'p_original', label: '原参数', value: 17, unit: '次', note: '原参数依据' }] } };
  const before = structuredClone(path);
  assert.deepEqual(experimentIdentityRows(path), [['实验编号','SAVED-EXPERIMENT-ID'],['待验证假设','原计划待验证的假设']]);
  assert.match(experimentAssumptionLines(path).join(' '), /p_original.*原参数.*17 次.*原参数依据/);
  assert.match(describeActionPath(path).note, /详情页首屏/);
  assert.match(describeActionPath({ ...path, actionKey: 'juicer_question_video', optionLabel: 'B' }).note, /实际验证和拍摄.*不是视频文件/);
  assert.match(describeActionPath({ actionKey: 'juicer_faq', optionLabel: 'A' }, true).note, /历史行动.*购买问答/);
  assert.match(describeActionPath({ actionKey: 'juicer_video_intro', optionLabel: 'B' }, true).note, /字幕稿/);
  const unknown = experimentIdentityRows({ title: 'EXP-JUICER01-click_cart-A-R1', optionLabel: 'A' }).flat().join(' ');
  assert.match(unknown, /未知/); assert.doesNotMatch(unknown, /EXP-JUICER01/);
  assert.equal(experimentCardRows(path).length, 8);
  assert.deepEqual(path, before);
});

test('PRD taking and static form boundaries keep optional feedback, version guards, original history sources', () => {
  const h = harness(), before = structuredClone(h.state);
  assert(buildActionCopy(h.state).text);
  assert.throws(() => buildActionPack(h.state, { exportId: 'a3_prd_txt', generatedAt: NOW }), /确认/);
  const pack = buildActionPack(h.state, { exportId: 'a3_prd_txt', generatedAt: NOW, allowSummaries: true });
  assert.match(pack.text, /实验编号：|待验证假设：/);
  assert.throws(() => buildActionPack(h.state, { exportId: 'a3_prd_txt_2', generatedAt: NOW }), /确认/);
  assert.deepEqual(h.state, before);
  const source = readFileSync(modulePath,'utf8'), html = readFileSync(htmlPath,'utf8');
  assert(source.includes('detailsVersion: shared?.FEEDBACK_DETAILS_VERSION'));
  const save = source.slice(source.indexOf('async function saveFeedback('), source.indexOf('\nfunction invalidateViewRead'));
  const gate = save.indexOf('if (expectedFeedback.detailsVersion === 1 && !record)');
  assert(gate > 0 && gate < save.indexOf('lastSavedDraft = pendingFeedback.signature'));
  const gateBlock = save.slice(gate, save.indexOf('selectedFeedbackId = record?.id', gate));
  assert.match(gateBlock, /dirty = true/); assert.match(gateBlock, /return false/);
  assert.doesNotMatch(gateBlock, /pendingFeedback = null|dirty = false/);
  assert(save.includes('findSavedFeedback(savedAttempt, state)?.id === record.id'));
  assert(save.includes('if (rereadConfirmed) readFeedbackIds.add(record.id)'));
  assert.doesNotMatch(save, /readState\(true\)/);
  const adoptionEvent = source.slice(source.indexOf("document.querySelectorAll('[data-adoption]').forEach"), source.indexOf("  $('clear-adoption').addEventListener"));
  assert.match(adoptionEvent, /adoption-select/); assert.doesNotMatch(adoptionEvent, /execution-select|FEEDBACK_SAVE/);
  const history = source.slice(source.indexOf('async function openRecord('), source.indexOf('\nfunction openProject('));
  assert(history.includes('const { feedback, execution, artifact, analysis, path } = bundle;'));
  assert(history.includes('experimentIdentityRows(path)'));
  assert(history.includes('experimentAssumptionLines(path)'));
  assert.doesNotMatch(history, /state\.analysis|state\.priority/);
  assert.doesNotMatch(source, /command\(\s*(?:'|")(?:ROUND_START|MATERIAL_ADD)(?:'|")/);
  for (const id of ['adoption-select','feedback-reason','feedback-sample-size','feedback-metric-before','feedback-metric-after',
    'feedback-guardrail','feedback-constraints','feedback-details-status']) assert(html.includes('id="' + id + '"'));
  assert.equal((html.match(/data-adoption="(?:adopted|partial|declined)"[^>]*aria-pressed="false"/g) || []).length, 3);
  assert.equal((html.match(/data-execution="(?:done|partial|not_started)"[^>]*aria-pressed="false"/g) || []).length, 3);
  assert.doesNotMatch(html, /\brequired(?:\s|>|=)/);
});
```
<!-- A3_PRD_SMOKE_END -->

## 以下为历次交接记录（最新范围以上节与18-ID状态为准）

下方 REQ-25／REQ-23／REQ-20 与基础版均保留为历史交接；其中旧“下一轮”按钮行为已被本批覆盖。现在查看复盘不会调用 ROUND_START，不把旧 reducer 可建空白轮次当作接受候选并开始下一轮。


## C5定点补齐：历史计划参数追溯

统筹复核确认，上一批历史完整记录只有八项实验卡，漏掉了原参数的ID、名称、值/单位和note。本批只修此处；仅改 `demo/pages/action.js` 与本QA，HTML/CSS保持原hash，不扩大C6—C8或真实UI验收范围。

- `action.js:1233` 的 `openRecord` 在“当时的实验计划”下增加“原计划参数与依据”，复用 `experimentAssumptionLines(path)` 渲染列表。path与analysis仍来自本次 `readReviewRecord` 返回的原bundle，不访问当前analysis补值，不重新生成或读取另一状态。
- `action.js:213` 只将既有纯投影函数导出供现有QA直接测试，函数逻辑/缺失提示不变；不增加共享接口。无引用明确未提供、不补默认；找不到引用明确未知；path缺失仍保留原计划快照不可用提示。
- 原C5脚本扩展第9组：真实reducer保存反馈后替换当前analysis，并将当前样本改为777；历史仍显示原参数ID、名称、值/单位和note。另测无参数、引用目标缺失、null path及投影不改状态。源码断言确认接线位于openRecord、从原bundle解构path并使用原analysis.mode。

本次实际检查：官方 `node --check demo/pages/action.js` 退出0，扩展后的C5脚本 **9/9通过、0失败**。替换前还逐字比对D备份，JS只发生函数export与历史列表插入两处预期变化。下方C5首批80/10/8及布局静态结果保留为历史，本次不重复扩展公共suite或其他审计。`python -B scripts/verify_demo_content.py` 与最终QA脚本读回复跑结果随四hash交接返回。

受影响功能：R30-R-01的“当时的实验计划”已补参数追溯，状态仍为“已实现未验”。**真实历史弹窗、IDB读回、PC布局及图像证据仍未验**；不启动浏览器或备用工具。默认执行未知、取用前无需反馈、当前选路/版本和C6—C8边界不变。

安全：写前C剩余 7255212032 字节，JS替换前 7254822912 字节（均大于1GiB）；当前JS和QA原件已在 `D:/CodexBackups/luya/c5-agent3/history-20260828T131713923746Z` 备份并SHA-256读回。两个同目录暂存文件按flush/fsync、原hash复核、os.replace流程处理，只操作本批具名文件。未碰root临时文件、公共/共享/后端/测试目录或Git。

本次JS：81091字节／`f3e8950b1259ebd352355bd8d5dc8c784071424b40b1133e5f326386a384b653`。HTML/CSS未变；QA自身与四个最终hash在交接消息返回。本定点补齐后停写，等待统筹独立接收。

## 本轮 C5 增量交接

### 本批改动与边界

按现任统筹明确下发，重新读了 [共享契约 C4/C5](SHARED_CONTRACT.md) 及当前入口。只接图3已交付的所选产物，不因 C5 可调用就启用图2候选或 C6—C8。

- 方案身份读取原分析保存的 `optionLabel` / `actionKey`。修复原数组下标推A/B的问题：明确“问答区做不了”后，即使仅B留在索引0，头区也标B。页面未新增分析感受入口；测试只消费真实共享reducer的结果。
- 修改稿仍由共享生成并逐项保存。新增取用区的“待核对清单”，渲染已保存 `kind=checklist` 的原文、标题与版本；不放进反馈折叠，不预填新商家事实。清单全文可滚动，17px文字、最大16rem；“查看该清单与修改步骤”只切换现有预览，不选路或执行。CSS新增从 `action.css:286` 开始，以实际源码C5注释定位。
- 全部复制保持 `copy` 正文限定；A的容量只称容量，未扩写成单次处理量；B是明确选B后的字幕/剪辑安排，不是生成视频或候选已接受。清单保留冰块、续航、清洗、售后未知，TXT范围明确包含已有清单与实验计划。
- `experimentCardRows` 同时供实验卡、TXT和原实验记录读取；显示实际 `minSampleUnit`、`guardrails`、`restoreSteps`，主指标译为“商品点击后的加购率”。恢复前提与恢复操作分开；删除固定“共享C5待提供”和TXT无单位重复样本行。旧记录缺字段不补值、不迁移、不声称风险未触发。
- `experimentAssumptionLines` 只追溯本路径 `experiment.assumptionIds` 对应的 `estimate.assumptions`。100次新增商品点击、24—72小时均为合成复查计划；保留实际起止时间null，不当统计保证或未来成功率。依据弹窗与TXT包含原参数ID、名称、数值/单位和说明。
- 保存文字反馈后当前 `fixtureId` 变null，稿件与历史仍按原analysis、path、artifact版本取源；没有把这次本机保存说成MoneyAI记忆。C6附件输入、C7再判断、C8开始候选仍禁用或具名等待，无MATERIAL_ADD／ROUND_START绕过。

下方18-ID表已更新P3-01—05与候选依赖口径；不把静态挂载和纯函数通过升级为整项功能实测。

### C5首批实际检查（历史结果；本次定点检查见上）

| 检查 | 首批结果与限制 |
| --- | --- |
| `node --check demo/pages/action.js` | 官方文件退出0。 |
| `node --test demo/tests/logic.test.mjs` | 官方文件复跑 **80/80通过，0失败**；未写测试目录。 |
| C5首批8组（下方现扩展为9组） | 首批官方模块 **8/8通过，0失败**：所选A/B、B单独保留、八项投影、旧字段未知、整包/逐次授权、反馈来源、失效及静态边界。 |
| 原REQ-30复现脚本 | 官方模块 **10/10通过，0失败**。第3组仅把旧“步骤待共享”文字匹配改成“原记录未提供具体回滚步骤”；保留恢复条件不等于步骤的守卫。 |
| 原REQ-25复现脚本 | 官方模块 **8/8通过，0失败**；三问/更正链/来源定位/失效继续成立。 |
| 既有三种子模块冒烟 | 通过；underbed_complete_v1、one_sentence_v1、scope_conflict_v1。它们只验证旧分支兼容性。 |
| DOM/CSS静态检查 | **129个唯一HTML ID、93个JS字面挂载点**；label/ARIA/锚点有目标，清单在当前行动内且不在details/反馈内，核心风险独立，默认执行未知、单固定标题。CSS只验作用域/变量/括号与滚动规则，未渲染。 |
| `python -B scripts/verify_demo_content.py` | 暂存QA及三实现文件扫描退出0；未改公共检查器。正式替换后再复跑，最终计数/退出码随交接返回。 |
| 文件安全 | 三实现文件UTF-8、无U+FFFD/NUL/尾空格、末尾换行；D备份读回和原子替换通过。QA同样按下述流程暂存/检查。 |

额外独立只读复核未发现新增实质问题，其30项进程内断言仅作补充，不合并冒充上述root检查或UI验收。QA暂存定界符校验曾被PowerShell双引号中的反引号转义影响；改用字面引号后校验通过，未修改产品或放宽断言。

**本批真实图像/运行证据：无，未验。** 不重试Browser或切换备用工具；原两张静态草稿不是运行截图。PC1920×1080的首屏、实际清单滚动和风险可发现性、点击切换/焦点、复制权限、TXT下载请求与落盘、IDB存储/读回/跨标签、标题动画均等待统筹许可后的统一窗口。C6/C7/C8尚未交付；不安装依赖，不开手机/Figma、不改共享/后端/Git、不外发原件。交回确切四hash后停写。

### 本批安全回执

写前C剩余 7331725312 字节（大于1GiB），当前三原件已复制至 `D:/CodexBackups/luya/c5-agent3/implementation-20260828T130215904981Z` 并逐项SHA-256读回；同目录临时文件经flush/fsync、语法和纯函数/静态验证，再逐个复核原hash未变并os.replace。原子回执为该目录 `atomic-receipt.json`，三次替换前C分别为7268229120、7268253696、7268286464字节。

QA写前C剩余 7267389440 字节，原件SHA `5a37a7f1e160b39d07ce3395e263fc5a100b44b1f3fb9c1dc6be505a294d4832`，D备份目录 `D:/CodexBackups/luya/c5-agent3/qa-20260828T130911288807Z`；同目录暂存保留原历史记录和脚本，不修改公共检查器。原子替换后不保留仓库内临时文件；最终QA自身hash在交接消息中返回，避免自引用。

C5首批历史三实现文件读回：HTML 24632字节／`ff0d095afac4ee3b8e3fadb68ef856fbe0f3949cbc9dfc5026c78441090295a9`；CSS 32160字节／`6922408c9b45522561737945521e365720c53e8fd197dbea4b8cb52e6867a288`；JS 80865字节／`e93cd3b6aa7c47bade784e71508c376700451515a524f38a188ed09dc9c1c033`。标识只定位源码，不是Git/整页验收结论。

<details>
<summary>C5的9组纯逻辑/静态复现（仓库根目录；第9组为历史参数追溯）</summary>

只使用真实共享reducer/生成器与页面纯投影；无浏览器、持久会话或商家原件。默认读取官方文件；A3_ACTION_MODULE/A3_ACTION_HTML仅供同目录暂存稿替换前检查，正式复现无需设置。

```powershell
$qaText = Get-Content -LiteralPath 'docs/development/demo/QA_AGENT_3.md' -Encoding UTF8 -Raw
$qaSmoke = [regex]::Match($qaText, '(?s)<!-- A3-C5-SMOKE -->\s*```javascript\r?\n(.*?)\r?\n```').Groups[1].Value
if (-not $qaSmoke) { throw 'C5 smoke block missing' }
$OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$qaSmoke | node --input-type=module
```

<!-- A3-C5-SMOKE -->
```javascript
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createEmptyState, reduceCommand } from './demo/shared/model.js';
import { buildDemoAnalysis, buildDemoArtifact } from './demo/shared/demo-data.js';
const modulePath = process.env.A3_ACTION_MODULE || './demo/pages/action.js';
const { activeSelection, currentArtifacts, buildActionCopy, buildActionPack, experimentCardRows,
  describeActionPath, experimentAssumptionLines, makeFeedbackPayload, resolveFeedbackRecord } = await import(modulePath);
const NOW = '2026-08-28T13:00:00.000Z';
function harness(fixtureId = 'juicer_cup_v1') {
  let n = 0;
  const context = { now: NOW, newId: () => 'a3_c5_' + (++n) };
  let state = createEmptyState(context);
  const send = (type, payload) => {
    const result = reduceCommand(state, { type, payload, commandId: 'a3_c5_cmd_' + (++n),
      expectedRevision: state.revision }, context);
    state = result.state;
    return result;
  };
  send('LOAD_FIXTURE', { fixtureId });
  return { get state() { return state; }, send };
}
function analyze(h, transform = () => {}) {
  h.send('FOCUS_CONFIRM', { inputVersion: h.state.round.inputVersion });
  const generated = buildDemoAnalysis(h.state);
  assert.equal(generated.ok, true);
  transform(generated.analysis);
  h.send('ANALYSIS_SET', { analysis: generated.analysis });
}
function selectAndSave(h, actionKey) {
  const path = h.state.analysis.paths.find((item) => item.actionKey === actionKey);
  assert(path, actionKey);
  h.send('PATH_SELECT', { analysisId: h.state.analysis.id, pathId: path.id, inputVersion: h.state.round.inputVersion });
  const generated = buildDemoArtifact(h.state);
  assert.equal(generated.ok, true);
  for (const artifact of generated.artifacts) h.send('ARTIFACT_SAVE', { artifact });
  return path;
}
function ready(actionKey = 'juicer_faq', transform) {
  const h = harness(); analyze(h, transform); selectAndSave(h, actionKey); return h;
}
function txt(h, allowSummaries = true) {
  return buildActionPack(h.state, { exportId: 'a3_c5_export', generatedAt: NOW, allowSummaries });
}
const lf = (text) => text.replace(/\r\n/g, '\n');

test('C5 selected A/B copy uses saved product sources, leaving checklist out of copy-all', () => {
  for (const [key, label] of [['juicer_faq', 'A'], ['juicer_video_intro', 'B']]) {
    const h = ready(key), before = structuredClone(h.state);
    const context = activeSelection(h.state), artifacts = currentArtifacts(h.state);
    const copy = buildActionCopy(h.state), checklist = artifacts.find((item) => item.kind === 'checklist');
    assert.deepEqual(artifacts.map((item) => item.kind), ['copy', 'checklist', 'experiment_plan']);
    assert.equal(describeActionPath(context.path).label, '已选方案 ' + label);
    assert.equal(describeActionPath(context.path, true).label, '历史方案 ' + label);
    assert(artifacts.every((item) => item.pathId === context.pathId && item.analysisId === context.analysisId &&
      item.inputVersion === context.inputVersion && item.id && item.version > 0 && item.savedAt));
    assert.equal(copy.text, artifacts.filter((item) => item.kind === 'copy').map((item) => item.body).join('\n\n'));
    const productFacts = h.state.analysis.inputSnapshot.facts.filter((fact) =>
      ['confirmedProductFacts.0', 'confirmedProductFacts.1'].includes(fact.intakeField));
    assert.deepEqual(copy.artifacts[0].sourceFactIds, productFacts.map((fact) => fact.id));
    for (const fact of productFacts) assert(copy.text.includes(String(fact.value)));
    for (const word of ['冰块', '续航', '清洗', '售后']) {
      assert(checklist.body.includes(word));
      assert(!copy.text.includes(word));
    }
    assert.doesNotMatch(copy.text, /单次|一次能榨|成功率/);
    if (key === 'juicer_faq') assert.match(copy.text, /问：容量是多少/);
    else {
      for (const segment of ['0—2秒', '2—4秒', '4—5秒']) assert(copy.text.includes(segment));
      assert.match(describeActionPath(context.path).note, /字幕稿.*不是视频文件.*不是未选择/);
    }
    assert.deepEqual(h.state, before);
    assert.deepEqual(h.state.feedbackRecords, []);
    assert.deepEqual(h.state.executionRecords, []);
  }
});

test('C5 label and output follow saved identity after reorder, renamed titles and A removal', () => {
  const reordered = ready('juicer_video_intro', (analysis) => {
    analysis.paths.reverse();
    for (const path of analysis.paths) path.title = '展示标题 ' + path.optionLabel;
  });
  assert.equal(describeActionPath(activeSelection(reordered.state).path).label, '已选方案 B');
  assert.match(buildActionCopy(reordered.state).text, /0—2秒/);
  assert.equal(describeActionPath({ title: '补全商品购买问答区' }).label, '已选行动');
  const h = ready(), oldCopy = buildActionCopy(h.state);
  h.send('ANALYSIS_REVIEW_SAVE', { roundId: h.state.round.id, inputVersion: h.state.round.inputVersion,
    analysisId: h.state.analysis.id, stance: 'not_actionable', reason: '合成自述：不能修改问答区',
    blockedPathIds: [activeSelection(h.state).pathId] });
  const generated = buildDemoAnalysis(h.state);
  assert.equal(generated.ok, true);
  h.send('ANALYSIS_SET', { analysis: generated.analysis });
  assert.equal(h.state.selection, null);
  assert.deepEqual(h.state.analysis.paths.map((path) => path.optionLabel), ['B']);
  assert.throws(() => buildActionCopy(h.state));
  selectAndSave(h, 'juicer_video_intro');
  assert.equal(describeActionPath(activeSelection(h.state).path).label, '已选方案 B');
  assert.throws(() => buildActionCopy(h.state, { expectedSignature: oldCopy.signature }));
  assert.match(buildActionCopy(h.state).text, /0—2秒/);
});

test('C5 card and TXT project the same eight real plan fields and referenced assumptions', () => {
  for (const key of ['juicer_faq', 'juicer_video_intro']) {
    const h = ready(key), path = activeSelection(h.state).path, before = structuredClone(path);
    const rows = experimentCardRows(path, h.state.analysis.mode), card = Object.fromEntries(rows), plan = path.experiment;
    const output = lf(txt(h).text);
    assert.equal(rows.length, 8);
    for (const [label, value] of rows) assert(output.includes(label + '：' + value));
    assert.equal(card['本轮只改什么'], plan.change);
    assert.equal(card['本轮保持不变'], plan.keepFixed.join('；'));
    assert.match(card['主要观察'], /商品点击后的加购率/);
    assert(!card['主要观察'].includes('click_to_cart_rate'));
    assert(card['最小样本'].includes(String(plan.minSample) + ' ' + plan.minSampleUnit));
    assert.match(card['最小样本'], /合成计划假设.*不代表统计充分/);
    assert(card['观察时间'].includes(plan.window.description));
    assert.equal(plan.window.start, null); assert.equal(plan.window.end, null);
    for (const condition of plan.guardrails) assert(card['护栏指标'].includes(condition.text));
    for (const condition of plan.stopConditions) assert(card['停止条件'].includes(condition.text));
    for (const condition of plan.restoreSteps) assert(card['回滚方式'].includes(condition.text));
    for (const condition of plan.restoreConditions) assert(card['回滚方式'].includes('恢复条件：' + condition.text));
    assert.match(card['回滚方式'], /仅为计划，未记录执行/);
    assert.doesNotMatch(card['护栏指标'] + card['回滚方式'], /待共享|尚未提供护栏/);
    for (const assumptionId of plan.assumptionIds) {
      const assumption = path.estimate.assumptions.find((item) => item.id === assumptionId);
      assert(assumption);
      assert(output.includes('计划假设 ' + assumptionId + '｜' + assumption.label));
      assert(output.includes(String(assumption.value) + ' ' + assumption.unit));
      assert(output.includes(assumption.note));
    }
    assert.equal(path.estimate.kind, 'unavailable');
    assert.deepEqual(path, before);
  }
});

test('C5 old records retain unknown units, guardrails and rollback steps without defaults', () => {
  const h = ready('juicer_faq', (analysis) => {
    const plan = analysis.paths.find((path) => path.actionKey === 'juicer_faq').experiment;
    delete plan.minSampleUnit; delete plan.guardrails; delete plan.restoreSteps;
  });
  const card = Object.fromEntries(experimentCardRows(activeSelection(h.state).path, h.state.analysis.mode));
  assert.match(card['最小样本'], /100.*计数单位未知/);
  assert(!card['最小样本'].includes('次新增商品点击'));
  assert.match(card['护栏指标'], /原记录未提供.*不代表风险未触发/);
  assert.match(card['回滚方式'], /仅有恢复条件.*原记录未提供具体回滚步骤/);
  const old = harness('underbed_complete_v1'); analyze(old);
  const oldRows = experimentCardRows(old.state.analysis.paths[0], old.state.analysis.mode);
  const oldCard = Object.fromEntries(oldRows);
  assert.match(oldCard['最小样本'], /尚未确定/);
  assert.doesNotMatch(oldCard['最小样本'] + oldCard['观察时间'], /100|24|72/);
  assert.equal(experimentCardRows(null).length, 8);
  assert.match(Object.fromEntries(experimentCardRows(null))['回滚方式'], /原记录未提供/);
  assert(lf(txt(h).text).includes('最小样本：' + card['最小样本']));
});

test('C5 every TXT needs consent, includes all saved kinds and versions, with no feedback gate', () => {
  const h = ready(), before = structuredClone(h.state);
  assert.throws(() => txt(h, false));
  const output = txt(h), body = lf(output.text);
  assert.equal(output.text.charCodeAt(0), 0xfeff);
  assert.equal(output.metadata.analysisId, h.state.analysis.id);
  assert.equal(output.metadata.inputVersion, h.state.round.inputVersion);
  assert.equal(output.metadata.pathId, h.state.selection.pathId);
  assert(body.includes('actionKey: juicer_faq'));
  for (const artifact of currentArtifacts(h.state)) {
    for (const expected of ['artifactId: ' + artifact.id, 'artifactVersion: ' + artifact.version,
      'artifactKind: ' + artifact.kind, lf(artifact.body)]) assert(body.includes(expected));
  }
  assert.throws(() => txt(h, false));
  const selected = currentArtifacts(h.state)[0];
  const refs = { pageId: 'action', analysisId: selected.analysisId, pathId: selected.pathId,
    inputVersion: selected.inputVersion, artifactId: selected.id, artifactVersion: selected.version };
  assert.deepEqual(h.state, before);
  for (const type of ['copy_succeeded', 'download_requested']) h.send('EVENT_APPEND', { event: { type, refs } });
  assert.deepEqual(h.state.feedbackRecords, []);
  assert.deepEqual(h.state.executionRecords, []);
  assert.deepEqual(h.state.selection, before.selection);
});

test('C5 saved feedback clears fixture selector without changing saved A/B sources or history links', () => {
  for (const key of ['juicer_faq', 'juicer_video_intro']) {
    const h = ready(key), copy = buildActionCopy(h.state), artifact = copy.artifacts[0];
    const plan = structuredClone(activeSelection(h.state).path.experiment);
    h.send('FEEDBACK_SAVE', makeFeedbackPayload(artifact, { rawText: '合成自述：尚无观察数据。',
      scope: '', executedAt: null, execution: 'unknown', observation: 'unknown' }));
    assert.equal(h.state.fixtureId, null);
    assert.equal(buildActionCopy(h.state).text, copy.text);
    assert.equal(buildDemoArtifact(h.state).artifacts.find((item) => item.kind === 'copy').body, copy.text);
    const record = resolveFeedbackRecord(h.state, h.state.feedbackRecords.at(-1).id);
    assert.equal(record.artifact.id, artifact.id); assert.equal(record.artifact.version, artifact.version);
    assert.equal(record.path.actionKey, key); assert.deepEqual(record.path.experiment, plan);
    assert.equal(record.execution.adoption, 'unknown'); assert.equal(record.execution.execution, 'unknown');
    assert.equal(record.execution.executedAt, null); assert.equal(record.feedback.observation, 'unknown');
    assert.equal(txt(h).metadata.mode, 'demo_fixture');
    assert.equal(txt(h).metadata.fixtureId, null);
    assert(lf(txt(h).text).includes('来源标签：合成演示／预编写参考稿'));
  }
});

test('C5 changed input or explicit path switch invalidates old copy and TXT intent', () => {
  const h = ready(), a = buildActionCopy(h.state), packA = txt(h);
  selectAndSave(h, 'juicer_video_intro');
  assert.notEqual(txt(h).signature, packA.signature);
  assert.throws(() => buildActionCopy(h.state, { expectedSignature: a.signature }));
  assert(currentArtifacts(h.state).every((item) => item.pathId === h.state.selection.pathId));
  h.send('INPUT_EDIT', { description: '合成更正：此次商品资料变化，需重新确认。' });
  assert.equal(activeSelection(h.state), null);
  assert.deepEqual(currentArtifacts(h.state), []);
  assert.throws(() => buildActionCopy(h.state));
  assert.throws(() => txt(h));
  assert.equal(buildDemoArtifact(h.state).ok, false);
  assert.deepEqual(h.state.executionRecords, []);
});

test('C5 new UI wiring keeps checklist a view operation and C6-C8 disabled', () => {
  const source = readFileSync(modulePath, 'utf8');
  const html = readFileSync(process.env.A3_ACTION_HTML || './demo/03-action.html', 'utf8');
  const checklistRenderer = source.slice(source.indexOf('function renderTakeawayChecklists('),
    source.indexOf('function renderArtifacts('));
  assert(checklistRenderer.includes("artifact.kind === 'checklist'"));
  assert(checklistRenderer.includes("node('pre', artifact.body"));
  assert(checklistRenderer.includes('choosePreview(previewArtifactKey(artifact))'));
  assert.doesNotMatch(checklistRenderer, /command\(|FEEDBACK_SAVE|PATH_SELECT|ROUND_START|MATERIAL_ADD/);
  assert(source.includes('describeActionPath(context.path, keepOldDraft)'));
  assert.doesNotMatch(source, /String\.fromCharCode\(65|新增护栏与回滚字段待共享/);
  assert.doesNotMatch(source, /command\(\s*(?:'|")(?:ROUND_START|MATERIAL_ADD)(?:'|")/);
  for (const id of ['action-path-note', 'takeaway-checklist', 'takeaway-checklist-items']) assert(html.includes('id="' + id + '"'));
  for (const id of ['feedback-image', 'feedback-table', 'generate-candidate', 'show-change-list', 'start-candidate']) {
    const tag = html.match(new RegExp('<[^>]+id="' + id + '"[^>]*>'))?.[0];
    assert(tag?.includes('disabled'), id);
  }
});

test('C5 historical plan keeps original parameter provenance after current analysis changes', () => {
  const h = ready('juicer_faq');
  const artifact = buildActionCopy(h.state).artifacts[0];
  h.send('FEEDBACK_SAVE', makeFeedbackPayload(artifact, { rawText: '合成回归：保留本轮观察记录。',
    scope: '', executedAt: null, execution: 'unknown', observation: 'unknown' }));
  const feedbackId = h.state.feedbackRecords.at(-1).id;
  const original = resolveFeedbackRecord(h.state, feedbackId);
  const oldPath = structuredClone(original.path);
  const expected = experimentAssumptionLines(oldPath);
  analyze(h, (analysis) => {
    const path = analysis.paths[0];
    const parameter = { id: 'history_current_sample', label: '回归用当前计划参数', value: 777,
      unit: '次新增商品点击', sourceFactIds: [], note: '仅用于证明当前参数不能补到历史计划。' };
    path.estimate.assumptions.push(parameter);
    path.experiment.assumptionIds = [parameter.id];
    path.experiment.minSample = parameter.value;
    path.experiment.minSampleUnit = parameter.unit;
    path.experiment.window.description = '回归用新计划窗口，与历史计划无关。';
  });
  assert.notEqual(h.state.analysis.id, original.analysis.id);
  const currentLines = experimentAssumptionLines(h.state.analysis.paths[0]);
  assert(currentLines.some((line) => line.includes('777')));
  const historical = resolveFeedbackRecord(h.state, feedbackId);
  assert.equal(historical.analysis.id, original.analysis.id);
  assert.equal(historical.path.id, oldPath.id);
  assert.equal(historical.artifact.id, artifact.id);
  assert.equal(historical.artifact.version, artifact.version);
  const beforeProjection = structuredClone(h.state);
  const lines = experimentAssumptionLines(historical.path);
  assert.deepEqual(lines, expected);
  assert.notDeepEqual(lines, currentLines);
  for (const assumptionId of oldPath.experiment.assumptionIds) {
    const assumption = oldPath.estimate.assumptions.find((item) => item.id === assumptionId);
    assert(lines.some((line) => line.includes(assumptionId) && line.includes(assumption.label) &&
      line.includes(String(assumption.value) + ' ' + assumption.unit) && line.includes(assumption.note)));
  }
  assert(!lines.some((line) => line.includes('回归用当前计划参数') || line.includes('777')));
  const noParameters = structuredClone(oldPath);
  noParameters.experiment.assumptionIds = [];
  const emptyLines = experimentAssumptionLines(noParameters);
  assert.equal(emptyLines.length, 1);
  assert.match(emptyLines[0], /没有引用.*不补默认值/);
  assert.doesNotMatch(emptyLines[0], /100|24|72|777/);
  const missingReference = structuredClone(oldPath);
  missingReference.estimate.assumptions = [];
  const missingLines = experimentAssumptionLines(missingReference);
  assert.equal(missingLines.length, oldPath.experiment.assumptionIds.length);
  for (const assumptionId of oldPath.experiment.assumptionIds) {
    assert(missingLines.includes('计划参数 ' + assumptionId + '：原分析中未找到，保持未知。'));
  }
  assert.doesNotMatch(missingLines.join('\n'), /回归用当前计划参数|777/);
  assert.match(experimentAssumptionLines(null)[0], /没有引用.*不补默认值/);
  assert.deepEqual(h.state, beforeProjection);
  const source = readFileSync(modulePath, 'utf8');
  const start = source.indexOf('async function openRecord(feedbackId)');
  const end = source.indexOf('\nfunction openProject()', start);
  assert(start >= 0 && end > start);
  const recordSource = source.slice(start, end);
  assert(recordSource.includes('const bundle = await readReviewRecord(feedbackId, token, sessionId);'));
  assert(recordSource.includes('const { feedback, execution, artifact, analysis, path } = bundle;'));
  const blockStart = recordSource.indexOf('    if (path) {');
  const blockEnd = recordSource.indexOf("    } else container.append(node('p', '原计划快照缺失", blockStart);
  assert(blockStart >= 0 && blockEnd > blockStart);
  const planBlock = recordSource.slice(blockStart, blockEnd);
  assert(planBlock.includes('experimentCardRows(path, analysis?.mode)'));
  assert(planBlock.includes("for (const line of experimentAssumptionLines(path)) assumptions.append(node('li', line));"));
  assert(planBlock.includes("container.append(plan, node('h4', '原计划参数与依据'), assumptions);"));
  assert.doesNotMatch(planBlock, /state\.analysis|state\.input|activeSelection|shownContext/);
});
```
</details>


## REQ-30 图3执行记录与图2反馈后改判（随 C5 更新状态）

### 范围、实际参考与依赖

依据现任统筹 `01a0476a-6049-70d2-9bb0-95af778428eb` 的明确下发，已完整读取 [功能锁定](WIREFRAME_FUNCTION_LOCK.md)、[本页提示词](PROMPT_AGENT_3.md) 顶部覆盖，并按 [品牌补充](../brand-ip/REQ30_WIREFRAME_BRAND.md) 与 [DF005 逐区判据](../design-feedback/DF-20260828-005-wireframe-conformance.md) 执行原 18 个编号，没有另造需求或第四页。

REQ-30首批实际查看过以下两张原图，均为 **1586×992 静态设计草稿**，不是运行截图；只读原件，没有复制进仓库、用作上传测试或外发：

- 图3：`D:/路演方案工作指导/微信图片_20260828184148_47_3165.png`。
- 图2：`D:/路演方案工作指导/微信图片_20260828184145_46_3165.png`。

目标为 PC 1920×1080，原生三页与路芽名称保持。执行页以所选行动头区、修改稿/实验卡、后置可选反馈组织；图2在同一 HTML 的明确复盘状态中，带返回当前行动。没有回到长文章铺排，也没有另建编辑器、任务看板或自动执行。

本批只写 `demo/03-action.html`、`demo/pages/action.css`、`demo/pages/action.js` 与本 QA。共享、后台、tests 目录、公共文档、其他页面和 Git 均未写入；未安装依赖、改 MCP/信任、重复资源前检、启动手机/Figma或浏览器。

| 共享依赖 | 本次实际消费与仍缺的能力 |
| --- | --- |
| C5 | 已接所选路径 buildDemoArtifact → 逐项 ARTIFACT_SAVE。juicer_faq／juicer_video_intro 按保存的 actionKey、optionLabel 与 analysis.inputSnapshot 生成 copy/checklist/experiment_plan；卡片与TXT共用 minSampleUnit、guardrails、restoreSteps 等八项计划投影。旧记录缺字段保持未知。此接口只覆盖当前明确选择的 A/B，不提供未选择的候选对象或第二轮稿。 |
| C6 | 现有 FEEDBACK_SAVE 可追加文字、执行自述、观察及指标 JSON；无反馈附件 Blob 原子接口。新截图／Excel／CSV 输入禁用并具名说明，绝不借 MATERIAL_ADD 改原输入。附件格式接收另依赖 C2。 |
| C7 | 没有版本化再判断接口，结论／原行动处理／候选建议／理由区域标等待共享结果。普通分析摘要中“读取了本地反馈”不被当成再判断。 |
| C8 | 旧 ROUND_START 会清空分析、选择并使旧稿失效，不是“接受候选及建有效下一轮”。本页已移除旧建轮调用；开始第二轮禁用，不创建正式未来记录。 |
| C9／MoneyAI | 公共壳仍负责真实服务状态；本页只显示本机保存和读回证据。未调用个人历史/管理 API，未称 MoneyAI 已写入、读回或记住。 |

### 逐项交回（沿用原功能 ID 与模块名）

“已实现未验”只指本批代码已有；下列没有任何一项标为整项“已实测”。“阻塞”项同时列出已保留的区域/接线和具体共享缺口。复现列中的页面操作仍待获准的统一浏览器窗口；纯函数证据另列，不混成真实 UI。

| 功能 ID／锁定模块 | 状态与本批实现 | 代码位置 | 复现与实际证据／依赖 |
| --- | --- | --- | --- |
| R30-P3-01 所选行动头区 | 已接页内新/旧actionKey语义；新首轮共享未发布、UI未验。只读保存的optionLabel/actionKey，不改旧记录名称，不默认选路。 | `03-action.html:42`；`action.js:247` | PRD第7组与旧C5身份/失效组通过；新首轮真实生成与保存待共享。 |
| R30-P3-02 “可以直接使用的修改稿” | 沿当前已选的共享产物/标题/版本展示，copy与checklist分开。页面不生成新模板；旧问答/字幕记录按旧快照保留。 | `03-action.html:67`、`03-action.html:120`；`action.js:247` | 旧C5第1、2、6、8组通过；新A首屏与B真实问题验证稿尚未发布。PC预览/滚动未验。 |
| R30-P3-03 “复制全部文案／下载执行清单” | 原真实操作逻辑保留，复制全部仅当前copy正文；TXT是含清单/计划/风险/来源/版本的整包且逐次授权，无反馈可取用。 | `03-action.html:103`；`action.js:344` | PRD第8组、旧C5第5/7与REQ30第1/2/9组通过。真实剪贴板/下载落盘/操作日志重试未验。 |
| R30-P3-04 “本轮实验卡”八项 | 页内增加保存的实验编号与待验证假设，八项原计划仍共享投影；新字段缺失明确未知，不构造ID或取当前priority。 | `03-action.html:136`；`action.js:264`、`action.js:271`、`action.js:344` | PRD第7/8组与旧C5第3/4组通过；身份实际共享保存待交付。100次/24—72小时仍只是计划假设。UI未验。 |
| R30-P3-05 “查看实验依据” | 原assumptionIds只关联本路径estimate.assumptions；参数ID/名称/值/单位/note及口径/限制保留，风险在取用前可发现。 | `03-action.html:425`；`action.js:302`、`action.js:551` | 旧C5第3/4/9与PRD第7/8组通过；历史不拿当前参数补值。真实弹窗、焦点与可见性未验。 |
| R30-P3-06 执行状态三按钮 | 页内新增独立采用三按钮，保留done/partial/not_started执行按钮；全部默认unknown。采用不推导执行；新采用值提交受版本门禁。 | `03-action.html:176`、`03-action.html:199`；`action.js:117`、`action.js:1412`、`action.js:1512` | PRD第2/3/4/8组与静态六按钮检查通过。实际点击/刷新与新采用值真实保存未验。 |
| R30-P3-07 新截图／新Excel或CSV／文字反馈 | 原文字反馈仍可保存；新增原因/样本/百分比/异常/限制完成可选承载与严格门禁。附件仍禁用，等待C6事务。 | `03-action.html:231`；`action.js:100`、`action.js:117` | PRD第1—4组验证空白null、0保留、转比例及不截断。没有处理真实文件，也没有把反馈用MATERIAL_ADD写入旧输入。 |
| R30-P3-08 “稍后回来补充／保存本轮记录” | 旧字段按原稿引用保存；新字段未获版本1拒绝提交。缺完整回执留草稿与原commandId，完整保存/读回分开；稍后不记执行。 | `03-action.html:304`；`action.js:719`、`action.js:1082`、`action.js:1096` | PRD第1/2/5/8组通过；新明细真实事务、响应丢失、IDB/多标签未验；C6未交付。 |
| R30-P3-09 保存后进入复盘 | 仍以明确选择已存记录并读回后进入同页复盘；读回再次核对本次新明细和采用/执行，不从查看创建新轮。 | `03-action.html:317`；`action.js:1096`、`action.js:1163` | PRD第5/8组与REQ30第5/6/10组通过；真实页面读回/切换未验，自动再判断/候选建轮仍待C7/C8。 |
| R30-R-01 记录回执与“查看完整实验记录” | 原bundle完整记录增加新版明细/采用标签与实验身份，原计划参数追溯保留；旧记录缺明细/身份仍未知。 | `03-action.html:324`；`action.js:160`、`action.js:1163`、`action.js:1321` | PRD第5—8组与旧C5第9组通过；原analysis/path不被当前覆盖。真实读回/弹窗、MoneyAI及附件均未验或未接通。 |
| R30-R-02 上轮发生了什么四块 | 动作、采用/执行、观察及补充明细读取原记录；第四块当前结论明确待C7，不从样本/感觉自动判失败。 | `03-action.html:339`；`action.js:1245` | PRD第3/6/8组保持未知、比例原值与独立执行。C7与四块真实运行截图未验。 |
| R30-R-03 不再重复／下一步建议与原因 | 继续具名等待版本化C7结果。不固定A→B；达到约定样本仍无变化后的FAQ是否合适不由页面擅自诊断。 | `03-action.html:362`；`action.js:1245` | 未有共享再判断回执；本批没有生成结论或未来反馈。 |
| R30-R-04 B执行预览（新PRD改为下一轮候选） | 候选容器改为中性的下一轮候选行动；尚无候选稿，不用当前B或另一条旧稿替代，不覆盖当前稿。 | `03-action.html:378`；`action.js:1245` | C7/C8及候选稿接口未交付；页面只保留明确待接通状态，未有候选运行证据。 |
| R30-R-05 “生成完整执行稿／查看修改清单” | 两按钮仍禁用，候选不会覆盖当前；已可取用的当前稿不充当候选稿。 | `03-action.html:378`；`action.js:1245` | REQ30第10组与PRD第8组静态边界通过；候选完整稿/修改清单未接通。 |
| R30-R-06 “第二轮实验规则” | 候选五项规则继续等待共享，不将当前合成计划复制为未来轮次，不把未知退款/投诉当护栏已通过。 | `03-action.html:390`；`action.js:1245` | C7/C8未交付，无第二轮规则实际运行证据。 |
| R30-R-07 “开始第二轮／暂时不继续” | 开始仍禁用；暂不继续只回当前行动，不改记录或执行。保持无ROUND_START捷径。 | `03-action.html:401`；`action.js:1512` | REQ30第10组与PRD第8组通过。明确接受及幂等建轮仍待C8。 |
| R30-R-08 “这个商家的实验记忆”时间线 | 当前只列已存本机反馈/原稿与独立采用/执行；没有合成正式第二轮，没有宣称MoneyAI记忆。 | `03-action.html:409`；`action.js:1245` | 原记录关联测试通过；候选/正式新轮与MoneyAI历史待共享，真实时间线未验。 |
| R30-R-09 商家中心／演示商家／导航入口 | 原当前项目弹窗与同页返回保留，仍是三页，不新增账号、多商家中心或第四页。 | `03-action.html:453`；`action.js:1321` | 静态同页区域/共享壳保留；真实打开关闭/焦点未验，独立D盘新项目不在本任务范围。 |

### 本批重要修补与事件边界

- 全文取用和 TXT 都绑定当前选路及已保存稿件版本。全文复制还绑定点击时已展示的签名；重读后出现新选择/新稿即中止，不静默把 A 的点击意图迁给 B。剪贴板 Promise 成功才记 copy_succeeded，手动选中不算复制；下载仅记 download_requested，不称文件落盘。
- 八项计划不从其他情景估算中的“100名访客”推成最低样本。C5实际引用本路径合成参数时，明确100次新增商品点击和24—72小时是计划假设；已有护栏/回滚步骤原文呈现，旧记录缺口仍明确未知。
- 精确历史关联处理了“同轮保存反馈后重新分析、随后归档轮次”的情况：历史 round.analysis 可能是较晚分析，必须按 analysisId + roundId + inputVersion 找原快照，再取原 path/材料版本；不得用当前事实兜底。完整记录同时保留已有指标0/未知、单位/对象/渠道/计数口径/窗口，但不推导结果状态。
- 记录/复盘读取使用请求代号、来源会话与 revision 检查；关闭、返回、换项目视图、换会话和离页取消旧请求。取消同时释放 busy；旧 finally 只能释放自己的读取，避免迟到结果重新弹窗、覆盖新选择或解除另一次请求状态。这里只完成代码与静态边界检查，真实取消/迟到时序仍待验。
- 新反馈附件位置没有接普通输入命令；文本保存不会主动改原 inputVersion。保存确认与后续读回分开，后者失败不能误报前者失败或制造第二条保存。查看复盘、取用、候选预览位置都不是采用/执行/开始第二轮。

### REQ-30首批历史检查、实际证据与未验项

| 检查 | 本批实际结果与边界 |
| --- | --- |
| `node --check demo/pages/action.js` | 退出0；最终官方文件复跑，不只是暂存稿。 |
| `node --test demo/tests/logic.test.mjs` | **53/53 通过，0失败**。沿用现有 suite，没有写测试目录；不是浏览器、模型或 IDB 验收。 |
| 本 QA 的 REQ-25 8组脚本 | **8/8 通过，0失败**；原 v0.5、三问、来源/更正、失效与逐次导出授权继续成立。 |
| 下方 REQ-30 脚本 | **10/10 通过，0失败**；真实 reducer/生成器和页面纯投影，最后1项为源码/HTML静态边界。没有创建另一状态库。 |
| 既有三合成种子模块冒烟 | 通过；underbed_complete_v1、one_sentence_v1、scope_conflict_v1 仍可导入纯函数。此处使用旧种子只作兼容检查，不声称榨汁杯已交付。 |
| Python DOM/样式静态检查 | 124个唯一HTML ID、89个JS字面挂载点；label/ARIA/锚点目标存在、两状态同级、三执行按钮默认未知、反馈不包住取用/核心风险、单标题标记通过。CSS只检查作用域、共享变量和括号，不是完整CSS解析或渲染。 |
| `python scripts/verify_demo_content.py` | 退出0；明确未运行 UI、模型、MoneyAI记忆、授权与经营效果检查。 |
| 文件与权限边界 | 三实现文件UTF-8、无U+FFFD/NUL/尾空格、末尾换行；D备份哈希及原子替换检查完成。未运行任何Git命令，统筹负责差异/提交检查。 |

第一次新增脚本的正文断言未先统一 LF/CRLF，因 TXT 按契约输出 CRLF 而失败；修正了比较方式并保留 BOM/逐次授权检查，没有为测试改变产品换行。CSS静态脚本也已按括号深度拆选择器，未把 :where 内的逗号误报为越界作用域。最终文档检查曾将复现代码中的正则字符组识别成Markdown链接；本QA改用等价的正则交替写法，未修改公共检查器或放宽断言。

**真实运行证据：当前无。** 首屏、主交互、模态窗口、1920×1080排版、中文输入/键盘与焦点、减少动效/实际标题动画、剪贴板权限、TXT落盘、反馈Blob/JSON原子保存、刷新/跨标签、请求迟到与失败重试均未验。没有实际截图、录像或性能结论。两张静态草稿与上述 Node/源码检查均不能替代；Browser可信路径/备用许可继续由统筹协调，本页没有另试或绕过。

C5当前所选产物与计划字段已在本批接线，真实UI仍待验。后续依赖沿锁定：C6反馈附件事务 → 实际读回 → C7版本化再判断 → 实际候选预览/修改清单 → 明确接受 → C8有效下一轮。当前C5并未提供候选对象；以上不是自动派发的新任务，交回后停写。

### REQ-30首批历史安全写入记录

每个官方替换批次均先检查 C盘剩余大于1GiB，复制当前原文件到D并读回SHA-256，再使用同目录临时文件、flush/fsync、UTF-8/非空/内容校验；再次核对源文件哈希未变后 os.replace。临时文件没有当作新功能文件保留。

| 批次 | 写前/复核情况与D备份 |
| --- | --- |
| HTML/CSS | 写前C剩余5,605,494,784字节。备份及检查回执：`D:/CodexBackups/luya/req30-agent3/markup-20260828T112902367954Z/manifest.json`、同目录 `atomic-receipt.json`。根任务另读最终文件并复核哈希/124ID。 |
| JS | 原件SHA `caa8490029cb1779d110ccb36ed6698fda972ba4f681a000ca0ccd8898779325`；备份 `D:/CodexBackups/luya/req30-agent3/js-20260828T112730922676Z/action.js`。暂存通过语法/纯函数检查后替换，替换后C剩余5487001600字节。 |
| 本QA | 写前C剩余5465944064字节；原件SHA `33ad405a72c5f94a5f8bed0b8076b805f09582f4dabc997752d56e1512feadf1`，备份 `D:/CodexBackups/luya/req30-agent3/qa-20260828T114118703996Z/QA_AGENT_3.md`。本段和复现脚本同批暂存/验证/替换，原历史记录保留。 |
| QA复现语法兼容修订 | 写前C剩余4472668160字节；备份 `D:/CodexBackups/luya/req30-agent3/qa-check-20260828T114616888244Z/QA_AGENT_3.md`，SHA `a309e0d007fd66ba1679ab9f555946735c733f86b615037ac8681d5e14d2bdf9`。只调整QA正则的等价写法和检查说明，业务代码不变。 |

REQ-30首批历史实现文件：HTML 24029字节／`964515851ddb87ea8580320a58c8b2ecb4c85e5e2ffff4623f24a409472048e3`；CSS 30694字节／`57f2acaa29f7d8173177f5b60bd53210cd108cf46eae880295948c5145fb5e56`；JS 77260字节／`84cab901dc38c94e2ccb4ba4040c872fe24924830b70845fff59454f407134c5`。这些标识只定位本批源码，不表示已完成统一Git检查点或运行验收。

<details>
<summary>REQ-30 的10组纯逻辑/静态边界复现（仓库根目录）</summary>

只运行进程内 reducer、生成器和页面纯函数；不启动浏览器，不读写演示持久会话。不设置 A3_ACTION_MODULE 时导入官方 action.js；该环境变量仅用于本批同目录暂存稿的替换前检查。

```powershell
$qaText = Get-Content -LiteralPath 'docs/development/demo/QA_AGENT_3.md' -Encoding UTF8 -Raw
$qaSmoke = [regex]::Match($qaText, '(?s)<!-- A3-REQ30-SMOKE -->\s*```javascript\r?\n(.*?)\r?\n```').Groups[1].Value
if (-not $qaSmoke) { throw 'REQ-30 smoke block missing' }
$OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$qaSmoke | node --input-type=module
```

<!-- A3-REQ30-SMOKE -->
```javascript
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createEmptyState, reduceCommand } from './demo/shared/model.js';
import { buildDemoAnalysis, buildDemoArtifact } from './demo/shared/demo-data.js';
const modulePath = process.env.A3_ACTION_MODULE || './demo/pages/action.js';
const { activeSelection, currentArtifacts, buildActionCopy, buildActionPack, experimentCardRows,
  makeFeedbackPayload, resolveFeedbackRecord, feedbackMetricRows } = await import(modulePath);
const NOW = '2026-08-28T12:00:00.000Z';
function harness(fixtureId = 'underbed_complete_v1') {
  let serial = 0;
  const context = { now: NOW, newId: () => 'r30_' + (++serial) };
  let state = createEmptyState(context);
  const send = (type, payload) => {
    const result = reduceCommand(state, { type, payload, commandId: 'r30_cmd_' + (++serial),
      expectedRevision: state.revision }, context);
    state = result.state;
    return result;
  };
  if (fixtureId) send('LOAD_FIXTURE', { fixtureId });
  return { get state() { return state; }, send };
}
function analyze(h) {
  h.send('FOCUS_CONFIRM', { inputVersion: h.state.round.inputVersion });
  const generated = buildDemoAnalysis(h.state);
  assert.equal(generated.ok, true);
  h.send('ANALYSIS_SET', { analysis: generated.analysis });
}
function choose(h, index = 0) {
  h.send('PATH_SELECT', { analysisId: h.state.analysis.id, pathId: h.state.analysis.paths[index].id,
    inputVersion: h.state.round.inputVersion });
  const generated = buildDemoArtifact(h.state);
  assert.equal(generated.ok, true);
  for (const artifact of generated.artifacts) h.send('ARTIFACT_SAVE', { artifact });
}
function ready() { const h = harness(); analyze(h); choose(h); return h; }
function draft(overrides = {}) {
  return { execution: 'unknown', observation: 'unknown', rawText: '', scope: '', executedAt: null, ...overrides };
}
function saveFeedback(h, overrides = {}) {
  h.send('FEEDBACK_SAVE', makeFeedbackPayload(currentArtifacts(h.state)[0], draft(overrides)));
  return h.state.feedbackRecords.at(-1);
}
function pack(h, allowSummaries) {
  return buildActionPack(h.state, { exportId: 'r30_export', generatedAt: NOW, allowSummaries });
}

test('R30 copy-all uses every saved copy on the selected path; no feedback or mutation', () => {
  const h = harness();
  assert.throws(() => buildActionCopy(h.state));
  analyze(h);
  assert.throws(() => buildActionCopy(h.state));
  choose(h);
  const original = currentArtifacts(h.state).find((a) => a.kind === 'copy');
  // Synthetic second draft, saved by the real reducer; not a new production generator.
  h.send('ARTIFACT_SAVE', { artifact: { ...structuredClone(original), id: null, version: 0,
    savedAt: null, title: 'Second synthetic copy', body: 'SECOND_COPY_BODY' } });
  const before = structuredClone(h.state);
  const copies = currentArtifacts(h.state).filter((a) => a.kind === 'copy');
  const actual = buildActionCopy(h.state);
  assert.deepEqual(actual.artifacts.map((a) => a.id), copies.map((a) => a.id));
  assert.equal(actual.text, copies.map((a) => a.body).join('\n\n'));
  assert.equal(actual.artifacts.some((a) => a.kind === 'experiment_plan'), false);
  assert.deepEqual(h.state, before);
  assert.deepEqual(h.state.feedbackRecords, []);
  assert.throws(() => pack(h, false));
  const txt = pack(h, true).text;
  for (const artifact of currentArtifacts(h.state)) {
    assert(txt.includes(artifact.id));
    assert(txt.replace(/\r\n/g, '\n').includes(artifact.body.replace(/\r\n/g, '\n')));
  }
  assert.equal(txt.charCodeAt(0), 0xfeff);
  assert.throws(() => pack(h, false)); // Consent is required again, even after success.
});

test('R30 displayed signature rejects silent A-to-B copy, extra drafts and invalidated input', () => {
  const h = ready();
  const clicked = buildActionCopy(h.state);
  choose(h, 1);
  assert.throws(() => buildActionCopy(h.state, { expectedSignature: clicked.signature }));
  const b = buildActionCopy(h.state);
  assert.notEqual(b.context.pathId, clicked.context.pathId);
  assert.equal(b.text, b.artifacts.map((a) => a.body).join('\n\n'));
  const next = { ...structuredClone(b.artifacts[0]), id: null, version: 0, savedAt: null,
    title: 'Additional B copy', body: 'ADDITIONAL_B' };
  h.send('ARTIFACT_SAVE', { artifact: next });
  assert.throws(() => buildActionCopy(h.state, { expectedSignature: b.signature }));
  h.send('INPUT_EDIT', { description: 'Synthetic correction: now a different input.' });
  assert.equal(activeSelection(h.state), null);
  assert.throws(() => buildActionCopy(h.state));
  assert.throws(() => pack(h, true));
});

test('R30 eight experiment rows keep sample, guardrail and rollback limits explicit', () => {
  const h = ready();
  const path = activeSelection(h.state).path;
  const before = structuredClone(path);
  const rows = experimentCardRows(path, h.state.analysis.mode);
  const byLabel = Object.fromEntries(rows);
  assert.equal(rows.length, 8);
  assert.equal(byLabel['本轮只改什么'], path.experiment.change);
  assert.equal(byLabel['本轮保持不变'], path.experiment.keepFixed.join('；'));
  assert.match(byLabel['最小样本'], /尚未确定/);
  assert.doesNotMatch(byLabel['最小样本'], /100/);
  assert.doesNotMatch(byLabel['观察时间'], /24|72/);
  assert.match(byLabel['护栏指标'], /不代表风险未触发/);
  assert.match(byLabel['回滚方式'], /仅有恢复条件/);
  assert.match(byLabel['回滚方式'], /原记录未提供具体回滚步骤/);
  assert.deepEqual(path, before);
  assert.equal(experimentCardRows(null).length, 8);
  const scenario = structuredClone(path);
  scenario.experiment.minSample = 100;
  assert.match(Object.fromEntries(experimentCardRows(scenario, 'demo_fixture'))['最小样本'], /合成计划假设.*100.*不代表统计充分/);
  assert.match(Object.fromEntries(experimentCardRows(scenario, 'local_limited'))['最小样本'], /依据待核对.*100.*不代表统计充分/);
});

test('R30 explicit execution stays separate from observation, adoption and time', () => {
  for (const execution of ['unknown', 'done', 'partial', 'not_started']) {
    const h = ready();
    const record = saveFeedback(h, { execution, observation: 'worse', rawText: 'Synthetic self-report.' });
    const bundle = resolveFeedbackRecord(h.state, record.id);
    assert.equal(bundle.execution.execution, execution);
    assert.equal(bundle.execution.adoption, 'unknown');
    assert.equal(bundle.execution.executedAt, null);
    assert.equal(bundle.feedback.observation, 'worse');
    assert.equal(h.state.events.some((event) => event.type === 'adoption_reported'), false);
    assert.equal(h.state.events.some((event) => event.type === 'round_started'), false);
    const before = structuredClone(h.state);
    buildActionCopy(h.state); // A saved optional report is not a new taking prerequisite.
    assert.deepEqual(h.state, before);
  }
  const h = ready(), artifact = currentArtifacts(h.state)[0];
  assert.throws(() => makeFeedbackPayload(artifact, draft()));
  const text = '甲'.repeat(500);
  assert.equal(makeFeedbackPayload(artifact, draft({ rawText: text })).feedbackRecord.rawText, text);
  assert.throws(() => makeFeedbackPayload(artifact, draft({ rawText: text + '乙' })));
  assert.throws(() => makeFeedbackPayload(artifact, draft({ rawText: 'x', executedAt: '2026-02-30' })));
});

test('R30 exact old record survives same-round reanalysis and a later archived round', () => {
  const h = ready();
  const oldAnalysis = structuredClone(h.state.analysis);
  const oldArtifact = structuredClone(currentArtifacts(h.state)[0]);
  const feedback = saveFeedback(h, { execution: 'done', observation: 'unchanged', rawText: 'Original report.' });
  const beforeRead = structuredClone(h.state);
  const first = resolveFeedbackRecord(h.state, feedback.id);
  assert.equal(first.analysis.id, oldAnalysis.id);
  assert.deepEqual(h.state, beforeRead);
  analyze(h); // The current round's new analysis is NOT the feedback's original analysis.
  const laterAnalysisId = h.state.analysis.id;
  assert.notEqual(laterAnalysisId, oldAnalysis.id);
  assert.equal(resolveFeedbackRecord(h.state, feedback.id).analysis.id, oldAnalysis.id);
  // Exercise a pre-existing reducer transition only; the R30 page has no such command.
  h.send('ROUND_START', { feedbackId: feedback.id });
  const archived = h.state.history.find((entry) => entry.type === 'round');
  assert.equal(archived.analysis.id, laterAnalysisId);
  const resolved = resolveFeedbackRecord(h.state, feedback.id);
  assert.equal(resolved.analysis.id, oldAnalysis.id);
  assert.equal(resolved.path.id, oldArtifact.pathId);
  assert.equal(resolved.artifact.id, oldArtifact.id);
  assert.equal(resolved.artifact.version, oldArtifact.version);
  assert.equal(resolved.artifact.body, oldArtifact.body);
  assert.deepEqual(resolved.analysis.inputSnapshot, oldAnalysis.inputSnapshot);
  assert.equal(resolved.roundIndex, 1);
  assert.equal(resolved.execution.execution, 'done');
});

test('R30 missing or mismatched record references never use another version', () => {
  const h = ready();
  const feedback = saveFeedback(h, { rawText: 'One report.' });
  assert.equal(resolveFeedbackRecord(h.state, 'missing'), null);
  for (const change of [
    (copy) => { copy.feedbackRecords[0].artifactVersion += 1; },
    (copy) => { copy.executionRecords[0].pathId = 'other_path'; },
    (copy) => { copy.feedbackRecords[0].savedAt = null; },
  ]) {
    const corrupted = structuredClone(h.state); change(corrupted);
    assert.equal(resolveFeedbackRecord(corrupted, feedback.id), null);
  }
  const withoutAnalysis = structuredClone(h.state);
  withoutAnalysis.analysis = null; withoutAnalysis.history = [];
  const partial = resolveFeedbackRecord(withoutAnalysis, feedback.id);
  assert.equal(partial.analysis, null);
  assert.equal(partial.path, null);
  assert.equal(partial.artifact.id, feedback.artifactId);
});

test('R30 original source snapshot is not replaced by corrected current input', () => {
  const h = ready();
  const original = structuredClone(h.state.analysis);
  const record = saveFeedback(h, { rawText: 'Record against the original source.' });
  const fact = structuredClone(h.state.input.facts.find((item) => item.key === 'external_height'));
  const previousValue = fact.value; fact.value = 14;
  h.send('FACT_PATCH', { fact, reason: 'Synthetic correction after reporting.' });
  const bundle = resolveFeedbackRecord(h.state, record.id);
  assert.equal(bundle.analysis.id, original.id);
  assert.equal(bundle.analysis.inputSnapshot.facts.find((item) => item.id === fact.id).value, previousValue);
  assert.equal(h.state.input.facts.find((item) => item.id === fact.id).value, 14);
  assert.equal(activeSelection(h.state), null);
});

test('R30 metrics-only feedback preserves zero, unknown and saved measurement scope', () => {
  const h = ready(), artifact = currentArtifacts(h.state)[0];
  const metric = { key: 'paid_orders', value: 0, unit: '笔', subject: 'Synthetic item',
    channel: null, cohort: 'orders', window: { start: '2026-08-27', end: null } };
  h.send('FEEDBACK_SAVE', { executionRecord: null, feedbackRecord: {
    artifactId: artifact.id, artifactVersion: artifact.version, observation: 'unknown',
    rawText: '', metrics: [metric], observedWindow: { start: null, end: null } } });
  const bundle = resolveFeedbackRecord(h.state, h.state.feedbackRecords.at(-1).id);
  assert.equal(bundle.execution, null);
  assert.equal(bundle.feedback.observation, 'unknown');
  assert.deepEqual(bundle.feedback.metrics, [metric]);
  const values = Object.fromEntries(feedbackMetricRows(bundle.feedback.metrics[0]));
  assert.equal(values['已报数值'], '0');
  assert.equal(values['单位'], '笔');
  assert.equal(values['对象'], 'Synthetic item');
  assert.equal(values['渠道'], '未知');
  assert.equal(values['观察开始'], '2026-08-27');
  assert.equal(values['观察结束'], '未知');
  assert.equal(Object.fromEntries(feedbackMetricRows({ value: null }))['已报数值'], '未知');
  assert.equal(Object.fromEntries(feedbackMetricRows({ metric: 'product_clicks', window_start: '2026-08-26' }))['观察开始'], '2026-08-26');
});

test('R30 taking events do not adopt, execute, report, read back or start a round', () => {
  const h = ready(), copy = buildActionCopy(h.state);
  const before = structuredClone(h.state);
  const refs = { pageId: 'action', analysisId: copy.context.analysisId, pathId: copy.context.pathId,
    inputVersion: copy.context.inputVersion, artifactId: copy.artifacts[0].id, artifactVersion: copy.artifacts[0].version };
  h.send('EVENT_APPEND', { event: { type: 'copy_succeeded', roundId: copy.context.roundId, refs } });
  h.send('EVENT_APPEND', { event: { type: 'download_requested', roundId: copy.context.roundId,
    refs: { pageId: 'action', exportId: 'r30_export', format: 'txt' } } });
  assert.deepEqual(h.state.events.slice(before.events.length).map((event) => event.type), ['copy_succeeded', 'download_requested']);
  for (const key of ['round', 'selection', 'artifacts', 'executionRecords', 'feedbackRecords', 'history']) {
    assert.deepEqual(h.state[key], before[key]);
  }
});

test('R30 static page boundaries: no feedback-as-input, no candidate round shortcut, one title', () => {
  const source = readFileSync(new URL(modulePath, import.meta.url), 'utf8');
  const html = readFileSync(process.env.A3_ACTION_HTML || 'demo/03-action.html', 'utf8');
  assert.doesNotMatch(source, /command\(\s*(?:'|")(?:ROUND_START|MATERIAL_ADD)(?:'|")/);
  assert.match(source, /expectedSignature:\s*renderedPackSignature/);
  assert.match(source, /expectedSignature:\s*intent\.signature/);
  assert.match(source, /token !== viewReadToken \|\| state\?\.sessionId !== sessionId/);
  assert.match(source, /addEventListener\('cancel'/);
  assert.match(source, /function invalidateViewRead\(\)[\s\S]*?readingReview = false;/);
  assert.match(source, /if \(token === viewReadToken\) readingReview = false;/);
  assert.equal((html.match(/\bdata-fold-title\b/g) || []).length, 1);
  for (const control of ['feedback-image', 'feedback-table', 'generate-candidate', 'show-change-list', 'start-candidate']) {
    assert.match(html, new RegExp('<(?:input|button)\\b[^>]*\\bid="' + control + '"[^>]*\\bdisabled\\b'));
  }
  assert.equal((html.match(/data-execution="(?:done|partial|not_started)"[^>]*aria-pressed="false"/g) || []).length, 3);
});
```

</details>

---

## REQ-25 限定纯逻辑回归（上一轮交接）


依据新统筹本次明确下发及已交付的主契约 4.1／细则 3、3.1执行。只做内存 reducer 和页面纯函数检查，不启动浏览器、同源持久会话、手机或 Figma。REQ-28 的三页渐进方向与路芽文字品牌继续有效；本轮没有重新布局、动共享样式或增加语音／提取接口。

### 最小源码修订

本轮仅修改 `demo/pages/action.js` 与本 QA；`03-action.html`、`pages/action.css` 没有本轮改动。公共源码、测试目录、其他页面与 Git 写操作仍由统筹负责。

- 实际复现：v0.5 的 `locator.type=intake` 在 TXT 中退化为“来源定位未知”；合法 `text` 字符定位会出现 `undefined` 行号，`txt` 类型未识别。已补理解字段、语音转写／粘贴文字／手动填写和行号／位置展示，不在页面换算定位。
- 新增本页纯展示函数 `describeActionSource`，页面与 TXT 共用。显示“商家确认理解，未外部核验”“商家判断，待验证”“未知，未补值”，更正和冲突另标；`checked` 仅写原文／算式核对。TXT 小标题改为“引用资料摘要”，不把判断统一称作事实。
- 当前行动的引用从对应 `analysis.inputSnapshot.facts` 读取；仅无快照的旧结构才回退当前输入。只导出现有产物 `sourceFactIds` 涉及的摘要，未把全部三问、完整转写、`locator.quote`、音频、反馈或历史追加进 TXT。原 quote、材料版本、证据性质和问答快照未被格式化函数改写。
- 保留复制当前内容／步骤、整包下载、逐次授权、显式选路和后置自愿反馈。未改变共享映射、存储、事件、版本或生成器。
- CSV 的契约差异已交统筹修复：记录／行号从 1 起，表头记录为 1、首数据记录通常为 2；本页不加 1。统筹已将共享绑定校验改为拒绝 0；本轮最终共享套件包含“2 接受、0 拒绝”。TXT 的 start/end 从 0 起，本页原样标“位置”，不擅自解释区间端点。

### 四组回归的实际结果

| 本次要求 | 内存逻辑证据 | 未被证明的部分 |
| --- | --- | --- |
| 更正／旧草稿／失效 | 真实 v0.5 `INTAKE_SET→FOCUS_CONFIRM→ANALYSIS_SET→PATH_SELECT→ARTIFACT_SAVE`；价格连续两次更正后再明确清空，保留同一事实 ID、原文与连续更正链；旧输入快照、覆盖已更正值和断裂链均拒绝且状态不变。更正或 INPUT_EDIT 后旧分析／产物 stale、当前选择为空，TXT 拒绝；重存理解、确认、重分析后仍须显式选路 | 真实页面空态、按钮禁用、跨标签和剪贴板的过期拦截 |
| 三问／原话／来源 | 同轮 known／unknown／skipped 三题及来源 ID 进入真实 analysis.clarificationSnapshot；早期答案更正不删除后两题、不重置额度。原文、编辑文、intake 来源、quote 保持；答案不自动变成事实、采用或执行。点击≠详情访客、创建订单≠支付订单，0 与未知分别保留 | ASR、真实模型提取或 AI 核验。默认有限生成器未使用全部问答，也未提供历史问答浏览／批量导出 |
| TXT 授权与范围 | 每次调用都要求本次同意，前次成功不豁免；包含当前两份保存产物及 ID／版本、轮次／输入／分析／选路、BOM／CRLF、步骤与风险。新输入后的签名改变，旧 TXT 生成被拦截；无反馈也能生成正文／步骤及完整包 | 实际浏览器确认控件、Blob 下载、文件落盘或打开；本测试输出是内存字符串 |
| 取用与反馈分离 | 实际 reducer 接收 copy_succeeded／download_requested 后仅新增两类日志，不写采用／执行／反馈／session_read，也不冒充 session_saved。随后明确 FEEDBACK_SAVE 才产生自述：done＋worse＋executedAt=null 合法，adoption 仍 unknown。未保存反馈不能 ROUND_START | 实际剪贴板 Promise、IndexedDB 事务成功、刷新读回、日志重试或落盘 |

### 已执行检查与限制

| 检查 | 本轮结果 |
| --- | --- |
| 下方可复现 REQ-25 组合脚本 | **8 组通过、0 失败**。全部调用真实共享 reducer／生成器和本页纯函数，无自造状态库 |
| `node --test demo/tests/logic.test.mjs` | **45 项通过、0 失败**；含当前共享 v0.5、三问、文件绑定和原有预览／授权／反馈／固定标题逻辑 |
| `node --check demo/pages/action.js` | 退出 0 |
| 原三合成种子模块冒烟 | 通过；原页面纯接口继续可导入 |
| Python 静态接线／文本检查 | 71 个唯一 DOM ID、54 个 JS 挂载引用、共享固定标题接线、单一标记、页面作用域、UTF-8／行尾检查通过；本轮不用 Git 差异检查代替或扩大许可 |
| `python scripts/verify_demo_content.py` | 退出 0；1500 项内容检查、15 项定义路径有效，不是 UI 或模型验收 |

来源 formatter 的判断／未知标签使用真实映射 fact 直接检验；TXT 的语音来源和文件定位另经完整流水线检验。文件绑定测试仅给 reducer 合成材料元数据（file=null），不是实际读文件或解析器验收。第一轮临时测试错误地假设未提供字段必有一条 null fact；已改为按契约给显式 unknown 账本并另验未提供字段没有被补 0，未因此修改共享行为。

本轮未独立运行后端 12 项测试、MoneyAI 管理／分析／历史接口或提取请求；不将统筹先前通报写成本页实测。没有浏览器、截图、录屏、实际 UI／剪贴板／下载落盘、IndexedDB、手机／Figma或真实标题动画结论。统一服务存在不代表上述验收通过；本机有限参考稿不标 MoneyAI 记忆。

完成本次限定检查后停写，交新统筹集成；没有自动进入 REQ-28 布局或后续功能。

<details>
<summary>REQ-25 的 8 组纯逻辑用例（可从仓库根目录复现）</summary>

四文件归属限制下将复现代码保留在本 QA，不写共享 tests。运行以下 PowerShell 命令只创建进程内状态，不打开浏览器、不读写演示数据库：

```powershell
$qaText = Get-Content -LiteralPath 'docs/development/demo/QA_AGENT_3.md' -Encoding UTF8 -Raw
$qaSmoke = [regex]::Match($qaText, '(?s)<!-- A3-REQ25-SMOKE -->\s*```javascript\r?\n(.*?)\r?\n```').Groups[1].Value
if (-not $qaSmoke) { throw 'REQ-25 smoke block missing' }
$qaSmoke | node --input-type=module
```

<!-- A3-REQ25-SMOKE -->
```javascript
import test from 'node:test';
import assert from 'node:assert/strict';
import { createEmptyState, reduceCommand } from './demo/shared/model.js';
import { createMerchantIntakeDraft } from './demo/shared/intake-draft.js';
import { buildDemoAnalysis, buildDemoArtifact } from './demo/shared/demo-data.js';
import { activeSelection, currentArtifacts, selectPreviewArtifact, artifactPreviewText,
  makeFeedbackPayload, buildActionPack, describeActionSource } from './demo/pages/action.js';

const NOW = '2026-08-28T11:30:00.000Z';
const EDITED = '合成编辑文字：先核对商品信息和订单口径。';
const Q1_RAW = 'Q1_RAW_ONLY：这是点击次数，不是详情访客。';
function harness() {
  let serial = 0;
  const context = { newId: () => 'a3_v05_' + (++serial), now: NOW };
  let state = createEmptyState(context);
  return {
    get state() { return state; },
    send(type, payload, extra = {}) {
      const result = reduceCommand(state, { type, payload, commandId: 'a3_command_' + (++serial),
        expectedRevision: state.revision }, { ...context, ...extra });
      state = result.state;
      return result;
    },
  };
}
function draftInput() {
  return createMerchantIntakeDraft({
    sources: ['voice', 'manual'],
    transcript: '合成原始记录：我卖测试杯；这周没有订单；学生可能需要；支付订单0笔；RAW_ONLY原文标记。',
    productName: '测试杯', price: '19元', currentProblem: '这周没有订单',
    targetCustomerHypothesis: '学生可能需要',
    metrics: { productClicks: 9, createdOrders: 3, paidOrders: 0 },
    evidenceLedger: [
      { field: 'productName', value: '测试杯', status: 'confirmed_fact', source: 'voice', quote: '我卖测试杯' },
      { field: 'price', value: '19元', status: 'confirmed_fact', source: 'manual' },
      { field: 'currentProblem', value: '这周没有订单', status: 'confirmed_fact', source: 'voice', quote: '这周没有订单' },
      { field: 'targetCustomerHypothesis', value: '学生可能需要', status: 'owner_hypothesis', source: 'voice', quote: '学生可能需要' },
      { field: 'metrics.videoViews', value: null, status: 'unknown', source: 'manual' },
      { field: 'metrics.productClicks', value: 9, status: 'confirmed_fact', source: 'manual' },
      { field: 'metrics.createdOrders', value: 3, status: 'confirmed_fact', source: 'manual' },
      { field: 'metrics.paidOrders', value: 0, status: 'confirmed_fact', source: 'voice', quote: '支付订单0笔' },
    ],
  });
}
function saveIntake(h, draft, description = EDITED, sourceBindings = []) {
  return h.send('INTAKE_SET', { roundId: h.state.round.id, inputVersion: h.state.round.inputVersion,
    draft, description, sourceBindings });
}
function analyze(h) {
  h.send('FOCUS_CONFIRM', { roundId: h.state.round.id, inputVersion: h.state.round.inputVersion });
  const result = buildDemoAnalysis(h.state);
  assert.equal(result.ok, true, result.message);
  h.send('ANALYSIS_SET', { analysis: result.analysis });
}
function choose(h) {
  const analysis = h.state.analysis;
  h.send('PATH_SELECT', { analysisId: analysis.id, pathId: analysis.paths[0].id,
    inputVersion: h.state.round.inputVersion });
  const result = buildDemoArtifact(h.state);
  assert.equal(result.ok, true, result.message);
  result.artifacts.forEach((artifact) => h.send('ARTIFACT_SAVE', { artifact }));
}
function askThree(h) {
  const paid = h.state.input.facts.find((fact) => fact.key === 'paid_orders');
  const ids = [];
  for (const [questionText, status, answer] of [
    ['你说的9次是什么口径？', 'answered', { availability: 'known', rawText: Q1_RAW }],
    ['订单记录的起止日期？', 'answered', { availability: 'unknown', rawText: null }],
    ['本轮能投入多少时间？', 'skipped', undefined],
  ]) {
    h.send('QUESTION_SET', { roundId: h.state.round.id, inputVersion: h.state.round.inputVersion,
      questionId: null, status: 'asked', questionText, sourceFactIds: [paid.id] });
    const questionId = h.state.round.clarification.activeQuestionId;
    ids.push(questionId);
    h.send('QUESTION_SET', { roundId: h.state.round.id, inputVersion: h.state.round.inputVersion,
      questionId, status, ...(answer ? { answer } : {}) });
  }
  return ids;
}
function flow(withQuestions = false) {
  const h = harness(), draft = draftInput();
  saveIntake(h, draft);
  const questionIds = withQuestions ? askThree(h) : [];
  analyze(h);
  choose(h);
  return { h, draft, questionIds };
}
function pack(h, exportId = 'a3_export', allowSummaries = true) {
  return buildActionPack(h.state, { exportId, generatedAt: NOW, allowSummaries });
}
function expectInvalidated(h) {
  assert.equal(activeSelection(h.state), null);
  assert.deepEqual(currentArtifacts(h.state), []);
  assert.equal(h.state.input.confirmedVersion, null);
  assert.equal(h.state.analysis.status, 'stale');
  assert(h.state.artifacts.every((artifact) => artifact.status === 'stale'));
  assert.throws(() => pack(h), /没有当前有效/);
}

test('v0.5 + three questions preserve raw/source/snapshots without auto selection or extraction', () => {
  const h = harness(), draft = draftInput();
  saveIntake(h, draft);
  const intake = structuredClone(h.state.input.intake);
  const facts = structuredClone(h.state.input.facts);
  const ids = askThree(h);
  assert.equal(new Set(ids).size, 3);
  assert.deepEqual(h.state.input.intake, intake);
  assert.deepEqual(h.state.input.facts, facts);
  assert.equal(h.state.input.description, EDITED);
  assert.equal(h.state.input.intake.draft.transcript, draft.transcript);
  assert.equal(h.state.round.clarification.remaining, 0);
  analyze(h);
  const questions = h.state.analysis.clarificationSnapshot.questions;
  assert.deepEqual(questions.map((item) => item.questionId), ids);
  assert.equal(questions[0].answer.rawText, Q1_RAW);
  assert.deepEqual(questions[1].answer, { availability: 'unknown', rawText: null });
  assert.equal(questions[2].status, 'skipped');
  assert(questions.every((item) => item.sourceFactIds.length === 1));
  assert.equal(h.state.analysis.inputSnapshot.intake.draft.transcript, draft.transcript);
  assert.equal(h.state.analysis.mode, 'local_limited');
  assert.equal(h.state.fixtureId, null);
  assert.equal(h.state.selection, null);
  assert.equal(buildDemoArtifact(h.state).ok, false);
  assert.deepEqual(h.state.artifacts, []);
  assert.deepEqual(h.state.executionRecords, []);
  assert.deepEqual(h.state.feedbackRecords, []);
  assert.equal(facts.some((fact) => fact.key === 'product_detail_visitors'), false);
  assert.equal(facts.find((fact) => fact.key === 'product_clicks').value, 9);
  assert.equal(facts.find((fact) => fact.key === 'created_orders').value, 3);
  assert.equal(facts.find((fact) => fact.key === 'paid_orders').value, 0);
  assert.equal(facts.find((fact) => fact.key === 'video_views').value, null);
  assert.equal(h.state.input.intake.draft.metrics.addToCarts, null);
  assert.equal(facts.some((fact) => fact.key === 'add_to_carts'), false);
  assert(facts.every((fact) => !fact.id.startsWith('draft_') && fact.verification !== 'checked'));
});

test('explicit choice enables full current pack without feedback; each TXT needs consent', () => {
  const { h, draft } = flow(true);
  const before = structuredClone(h.state), artifacts = currentArtifacts(h.state);
  assert.equal(artifacts.length, 2);
  assert.throws(() => pack(h, 'without_consent', false), /确认/);
  const exported = pack(h);
  assert.deepEqual([...new TextEncoder().encode(exported.text).slice(0, 3)], [239, 187, 191]);
  assert.equal(/(?<!\r)\n|\r(?!\n)/.test(exported.text), false);
  for (const artifact of artifacts) {
    assert(exported.text.includes('artifactId: ' + artifact.id + '\r\n'));
    assert(exported.text.includes('artifactVersion: ' + artifact.version + '\r\n'));
    assert(exported.text.includes(artifact.body.replace(/\r\n?/g, '\n').replace(/\n/g, '\r\n')));
  }
  assert.equal(exported.metadata.analysisId, h.state.analysis.id);
  assert.equal(exported.metadata.pathId, h.state.selection.pathId);
  assert.equal(exported.metadata.inputVersion, h.state.round.inputVersion);
  assert.equal(exported.metadata.sourceRevision, h.state.revision);
  assert.match(exported.text, /本机有限整理／参考稿/);
  assert.match(exported.text, /语音转写 · 支付订单数/);
  assert.match(exported.text, /商家确认理解，未外部核验/);
  assert.match(exported.text, /必要风险：/);
  assert.match(exported.text, /引用资料摘要：/);
  assert.doesNotMatch(exported.text, /RAW_ONLY|Q1_RAW_ONLY|来源定位未知|undefined/);
  assert.equal(exported.text.includes(draft.targetCustomerHypothesis), false);
  assert.throws(() => pack(h, 'next_export', false), /确认/);
  const selected = selectPreviewArtifact(artifacts, artifacts[1].id + ':' + artifacts[1].version);
  assert.equal(artifactPreviewText(selected), artifacts[1].body);
  assert.equal(artifactPreviewText(selected, 'steps'), artifacts[1].usage.steps.map((step, i) => (i + 1) + '. ' + step).join('\n'));
  assert.deepEqual(h.state, before);
});

test('copy/download log commands never adopt, execute, save feedback or claim a read', () => {
  const { h } = flow();
  const artifact = currentArtifacts(h.state)[0], before = structuredClone(h.state);
  const refs = { pageId: 'action', analysisId: artifact.analysisId, pathId: artifact.pathId,
    inputVersion: artifact.inputVersion, artifactId: artifact.id, artifactVersion: artifact.version };
  h.send('EVENT_APPEND', { event: { type: 'copy_succeeded', roundId: artifact.roundId, refs } });
  h.send('EVENT_APPEND', { event: { type: 'download_requested', roundId: artifact.roundId,
    refs: { ...refs, exportId: 'a3_download', format: 'txt' } } });
  assert.deepEqual(h.state.events.slice(before.events.length).map((event) => event.type), ['copy_succeeded', 'download_requested']);
  assert.deepEqual(h.state.selection, before.selection);
  assert.deepEqual(h.state.artifacts, before.artifacts);
  assert.deepEqual(h.state.executionRecords, []);
  assert.deepEqual(h.state.feedbackRecords, []);
  assert.throws(() => h.send('ROUND_START', { feedbackId: 'not_saved' }), { code: 'invalid_transition' });
  const payload = makeFeedbackPayload(artifact, { execution: 'done', observation: 'worse',
    executedAt: '', scope: '', rawText: 'FEEDBACK_ONLY：合成自述，做过但感觉变差。' });
  assert.equal(payload.executionRecord.adoption, 'unknown');
  assert.equal(payload.executionRecord.executedAt, null);
  h.send('FEEDBACK_SAVE', payload);
  assert.equal(h.state.executionRecords[0].execution, 'done');
  assert.equal(h.state.executionRecords[0].adoption, 'unknown');
  assert.equal(h.state.executionRecords[0].executedAt, null);
  assert.equal(h.state.feedbackRecords[0].observation, 'worse');
  assert.equal(h.state.feedbackRecords[0].artifactId, artifact.id);
  assert.equal(h.state.events.some((event) => event.type === 'session_read' || event.type === 'adoption_reported'), false);
  assert.doesNotMatch(pack(h).text, /FEEDBACK_ONLY/);
  const saved = structuredClone(h.state);
  assert.throws(() => h.send('EVENT_APPEND', { event: { type: 'execution_reported', refs } }), { code: 'invalid_transition' });
  assert.deepEqual(h.state, saved);
});

test('successive corrections retain IDs/raw history and reject stale or overwritten drafts', () => {
  const h = harness();
  let draft = createMerchantIntakeDraft({ sources: ['manual'], transcript: '合成原文，保留RAW_CORRECTION。',
    productName: '合成杯子', price: '19元', currentProblem: '先核对记录', metrics: { paidOrders: 0 } });
  saveIntake(h, draft); analyze(h); choose(h);
  const original = structuredClone(draft), originalVersion = h.state.round.inputVersion;
  const priceId = h.state.input.facts.find((fact) => fact.intakeField === 'price').id;
  let previousPack = pack(h), previousVersion = h.state.round.inputVersion;
  for (const after of ['21元', '23元', null]) {
    draft = { ...draft, price: after, userCorrections: [...draft.userCorrections, { field: 'price', before: draft.price, after }] };
    saveIntake(h, draft);
    assert.equal(h.state.round.inputVersion, previousVersion + 1);
    expectInvalidated(h);
    const price = h.state.input.facts.find((fact) => fact.id === priceId);
    assert.equal(price.value, after);
    assert.equal(price.verification, 'user_corrected');
    assert.match(describeActionSource(price).provenance, /商家更正/);
    assert.equal(h.state.input.intake.draft.transcript, original.transcript);
    assert.deepEqual(h.state.input.intake.draft.userCorrections, draft.userCorrections);
    analyze(h); choose(h);
    const next = pack(h);
    assert.notEqual(next.signature, previousPack.signature);
    previousPack = next; previousVersion = h.state.round.inputVersion;
  }
  const before = structuredClone(h.state);
  assert.throws(() => h.send('INTAKE_SET', { roundId: h.state.round.id, inputVersion: originalVersion,
    draft: original, description: EDITED, sourceBindings: [] }), { code: 'stale_input' });
  assert.throws(() => saveIntake(h, original), { code: 'invalid_intake' }); // Old draft omits saved corrections.
  assert.throws(() => saveIntake(h, { ...draft, price: '旧提取99元' }), { code: 'correction_conflict' });
  assert.throws(() => saveIntake(h, { ...draft, price: '25元', userCorrections: [...draft.userCorrections,
    { field: 'price', before: '错误的前值', after: '25元' }] }), (error) => ['correction_conflict', 'invalid_intake'].includes(error.code));
  assert.deepEqual(h.state, before);
  const price = h.state.input.facts.find((fact) => fact.id === priceId);
  assert.equal(price.availability, 'unknown');
  assert.match(describeActionSource(price).summary, /未知/);
  assert(h.state.history.some((entry) => entry.type === 'intake_revision' && entry.intake.draft.price === '19元'));
});

test('free text edits stale the current choice/artifacts/TXT until saved intake and explicit reselection', () => {
  const { h, draft } = flow();
  const old = structuredClone(h.state), oldPack = pack(h), artifact = currentArtifacts(h.state)[0];
  h.send('INPUT_EDIT', { description: '合成新编辑：本轮范围已变化。' });
  expectInvalidated(h);
  assert.equal(h.state.input.intake.status, 'stale');
  assert.throws(() => h.send('FOCUS_CONFIRM', { inputVersion: h.state.round.inputVersion }), { code: 'stale_input' });
  assert.throws(() => h.send('ARTIFACT_SAVE', { artifact }));
  saveIntake(h, { ...draft, currentProblem: '另一个待核对问题',
    evidenceLedger: draft.evidenceLedger.filter((entry) => entry.field !== 'currentProblem'),
    userCorrections: [{ field: 'currentProblem', before: draft.currentProblem, after: '另一个待核对问题' }] }, '合成新编辑：本轮范围已变化。');
  analyze(h);
  assert.equal(activeSelection(h.state), null);
  assert.deepEqual(currentArtifacts(h.state), []);
  assert.throws(() => pack(h), /没有当前有效/);
  choose(h);
  assert.notEqual(pack(h).signature, oldPack.signature);
  assert(h.state.artifacts.filter((item) => old.artifacts.some((prior) => prior.id === item.id)).every((item) => item.status === 'stale'));
  assert.throws(() => pack(h, 'new_requires_consent', false), /确认/);
});

test('correcting the first answer keeps later questions and old analysis provenance without inference', () => {
  const { h, questionIds } = flow(true);
  const before = structuredClone(h.state), version = h.state.round.inputVersion;
  h.send('QUESTION_SET', { roundId: h.state.round.id, inputVersion: version, questionId: questionIds[0],
    status: 'answered', answer: { availability: 'known', rawText: 'Q1_CORRECTED：应查原记录，口径仍待核对。' } });
  assert.equal(h.state.round.inputVersion, version + 1);
  expectInvalidated(h);
  assert.deepEqual(h.state.input.intake, before.input.intake);
  assert.deepEqual(h.state.input.facts, before.input.facts);
  assert.deepEqual(h.state.round.clarification.questions.slice(1), before.round.clarification.questions.slice(1));
  assert.equal(h.state.round.clarification.remaining, 0);
  assert.equal(h.state.analysis.clarificationSnapshot.questions[0].answer.rawText, Q1_RAW);
  analyze(h); choose(h);
  assert.equal(h.state.analysis.clarificationSnapshot.questions[0].answer.rawText, 'Q1_CORRECTED：应查原记录，口径仍待核对。');
  assert(h.state.history.some((entry) => entry.type === 'analysis' && entry.analysis.clarificationSnapshot.questions[0].answer.rawText === Q1_RAW));
  assert.doesNotMatch(pack(h).text, /Q1_RAW_ONLY|Q1_CORRECTED/);
  assert.deepEqual(h.state.executionRecords, []);
  assert.deepEqual(h.state.feedbackRecords, []);
});

test('actual mapped facts keep voice/manual/paste, merchant hypothesis, confirmed understanding and unknown labels', () => {
  const { h } = flow();
  const facts = h.state.analysis.inputSnapshot.facts, byField = (field) => facts.find((fact) => fact.intakeField === field);
  assert.match(describeActionSource(byField('productName')).location, /语音转写 · 具体商品/);
  assert.match(describeActionSource(byField('price')).location, /手动填写 · 价格/);
  assert.match(describeActionSource(byField('productName')).provenance, /商家确认理解，未外部核验/);
  assert.match(describeActionSource(byField('targetCustomerHypothesis')).provenance, /商家判断，待验证/);
  assert.match(describeActionSource(byField('metrics.videoViews')).provenance, /未知，未补值/);
  assert.match(describeActionSource(byField('metrics.videoViews')).summary, /未知/);
  assert.match(describeActionSource(byField('metrics.productClicks')).summary, /商品点击次数：9/);
  assert.match(describeActionSource(byField('metrics.createdOrders')).summary, /创建订单数：3/);
  assert.match(describeActionSource(byField('metrics.paidOrders')).summary, /支付订单数：0/);
  assert.equal(byField('productName').source.locator.quote, '我卖测试杯');
  assert.equal(byField('targetCustomerHypothesis').verification, 'unreviewed');
  const pasted = harness();
  saveIntake(pasted, createMerchantIntakeDraft({ sources: ['paste'], transcript: '合成粘贴原文',
    productName: '合成粘贴商品', confirmedProductFacts: ['需回原材料核对的规格'] }));
  const product = pasted.state.input.facts.find((fact) => fact.intakeField === 'productName');
  assert.match(describeActionSource(product).location, /粘贴文字 · 具体商品/);
  const item = pasted.state.input.facts.find((fact) => fact.intakeField === 'confirmedProductFacts.0');
  assert.match(describeActionSource(item).summary, /商家确认的商品信息第 1 项/);
});

test('real file-binding reducers render text/txt offsets or lines, and CSV record 2 without shifting', () => {
  for (const [source, locator, expected] of [
    ['txt', { type: 'text', start: 0, end: 8 }, '文本位置 0—8'],
    ['txt', { type: 'txt', start: 2, end: 9 }, '文本位置 2—9'],
    ['txt', { type: 'text', lineStart: 2, lineEnd: 3, start: 0, end: 9 }, '文本第 2—3 行，位置 0—9'],
    ['csv', { type: 'csv', recordIndex: 2, lineStart: 2, lineEnd: 2, column: 'value' }, 'CSV 第 2 条记录，value 列'],
  ]) {
    const h = harness();
    h.send('MATERIAL_ADD', {}, { preparedMaterial: { name: 'synthetic.' + source,
      mime: source === 'csv' ? 'text/csv' : 'text/plain', size: 48, sha256: 'synthetic_metadata_only', file: null } });
    const material = h.state.input.materials[0];
    const draft = createMerchantIntakeDraft({ sources: [source], metrics: { paidOrders: 0 } });
    saveIntake(h, draft, '只核对这份合成文字计数', [{ field: 'metrics.paidOrders', source,
      materialId: material.id, materialVersion: material.version, locator }]);
    analyze(h); choose(h);
    const fact = h.state.analysis.inputSnapshot.facts.find((item) => item.key === 'paid_orders');
    const before = structuredClone(fact);
    assert.equal(describeActionSource(fact).location, expected);
    assert.equal(fact.source.materialVersion, material.version);
    assert(pack(h).text.includes(expected));
    assert.doesNotMatch(pack(h).text, /undefined|来源定位未知/);
    assert.deepEqual(fact, before);
  }
});
```

</details>

## REQ-23：固定标题接入（上一轮交接）

按[实施队列](IMPLEMENTATION_QUEUE.md)和当前第三页下发执行，不重新要求开工批准。仅改 `03-action.html`、`pages/action.js` 与本记录，未改 `pages/action.css`、共享文件、其他页面或 Git。

- 仅固定 `h2#delivery-title`“行动内容”添加 `data-fold-title`。HTML 引用共享 `title-motion.css`，页面模块导入共享 `enhanceFoldTitle`，没有复制共享动效源码或追加逐字样式。
- `connectPage()` 开始时显式调用增强器，随后绑定原交互并 `void boot()`；不等待动画完成，也不让动效控制器状态参与读取、复制、导出或反馈。增强器异常仍继续原业务启动。
- 控制器保留共享 `status`／`reason`／`destroy()` 语义，页面 `pagehide` 调用幂等销毁；刷新读取、内容切换和 BFCache 恢复不重新增强。初始隐藏由共享观察第一次显现，超时静态，不自行显示标题或绕过空态。
- 每文档一次／一处；400ms 与 20ms 错峰、总预算不超过 800ms，以及缺 API、减少动效、迟到、多行、字体未就绪的静态兜底均沿用共享实现，没有本页覆写参数。
- 动态行动名称、成品正文、版本／保存／错误状态、风险和副标题保持静态。没有循环、动画业务事件、React／GSAP 依赖或新外部请求。

### 本轮已执行检查与限制

| 检查 | 真实结果 |
| --- | --- |
| `node --test demo/tests/logic.test.mjs` | **29 项通过、0 失败**，含 4 项共享标题纯逻辑；也覆盖现有单问契约的输入失效、预览、整包导出与反馈组合。不等于新语音／三问链路或动画实测 |
| `node --check demo/pages/action.js` | 退出 0 |
| 本记录内三种子模块冒烟 | 再次通过；共享模型与页面纯函数都可在无 DOM 环境导入 |
| Python 静态接线检查 | 仅一个标记且是固定 h2；共享 CSS／JS 引用各一处；增强调用位于业务 boot 前且未 await；销毁回调存在；未给动态文本添加标记，未新增私有存储；UTF-8／行尾通过 |
| 仓库内容与差异 | `python scripts/verify_demo_content.py` 通过 1409 项内容检查、15 项验收定义路径；`git diff --check` 退出 0。不是 UI、模型、存储、授权或经营效果检查 |
| 本机 HTTP | 第三页 HTML、页面 JS、共享 `title-motion.js/css` 均 GET 200；只读获取文件，未打开浏览器或写入演示会话 |
| 浏览器／截图／录屏 | **未执行**。可信路径和统筹备用许可仍未解决，没有另试 Browser／Playwright、改信任或使用替代截图 |

尚待统筹真实 1920×1080 验证：有效选择首次显现、空态与超过 5 秒显现的静态回退、减少动效预设及中途切换、多行／字体／缺 API／迟到兜底、pagehide 和 BFCache 恢复、原文字节点与朗读顺序、取用不受动效阻塞。不能用上述 29 项 Node 结果声称动效、DOM 恢复或帧率已通过；本轮没有新第三页图片或短录屏。

### REQ-25 最初排队记录（历史状态）

REQ-23 交接时仅已接到新输入回归任务，三问与确认映射尚未交付；当时的 29 项不证明新链路。此限制已由本轮统筹交付 INTAKE_SET 和限定纯逻辑窗口更新，实际结果以本文件顶部 REQ-25 记录为准。语音／外部提取／浏览器／存储仍未被上述逻辑测试验证。

## REQ-20：1920×1080 PC 功能区改版（上一轮交接）

来源：新统筹转达用户对第二、三页“功能布局不明确、信息散落、像单薄 Word”的反馈。已实际查看并在进度中展示用户提供的第二页截图 `codex-clipboard-57aea48a-48d4-40e2-b913-bde20e94e5aa.png`，原图 **1891×955**；这是 PNG 像素尺寸，浏览器 CSS 视口、缩放与 DPR 未知。它是第二页证据，不能当作本轮第三页截图。本任务未增改共享 assets。已阅读[首轮视觉评审 DF-20260828-001](../design-feedback/DF-20260828-001.md)，其中第三页内容仅为用户反馈和待验标准，没有当作第三页实测结论。

本轮继续沿用 round-2 临时色彩与中文排版，不生新图、不换栈、不加编辑器、任务看板或自动执行。把阅读长文的页面重组为以下操作区域：

| 操作区域 | 改动与边界 |
| --- | --- |
| 当前路径 | 标题、轮次／输入版本、来源模式紧凑排列；本轮问题可展开核对，换路按钮独立可见，不再用大标题和整段摘要占据主要空间 |
| 选择内容 | 左侧内容选择栏，只切换当前路径内的一份产物。选择键包含 ID／版本；不派发 PATH_SELECT，不改反馈引用，不持久化页内 tab |
| 内容预览 | 单一带标题、版本、使用位置的只读窗口；“内容预览／使用步骤”切换，一次只显示当前部分，不把所有产物正文及步骤纵向铺开 |
| 取用 | 复制、手动选取就在预览工具栏。复制内容与复制步骤分别使用实际展示文本；下载明确为整条行动 TXT 包，仍含全部当前产物，并保留逐次摘要同意 |
| 核对与风险 | 独立常显区域，显示适用前提、触发／暂停／恢复条件、观察指标／口径／窗口／未知样本下限；当前产物必要限制在两种预览下都显示，不以清爽为由折叠关键风险 |
| 自愿反馈 | 与取用工作区分开，继续后置且可收起；切换预览不会让原反馈草稿关联另一份产物 |

内容选择栏使用竖向 tab，预览方式使用横向 tab；代码包括方向键、Home／End、选中状态和焦点切换。**这是代码与静态语义，不是已完成的键盘／读屏器验收。**

查看事件随新结构收紧：生成结束不再为所有产物批量写 `artifact_viewed`，仅在已保存的当前产物被预览时记录；隐藏标签页、未保存稿和历史脏稿不记当前产物查看。复制仍须重读版本且剪贴板 Promise 成功后才记 `copy_succeeded`；步骤来源只用 `artifact.usage.steps`，不把完整实验对象转成字符串，不往事件 refs 填正文或新增未约定字段。

### 本轮追加检查

- 根任务实际运行 **148 项纯函数断言**，覆盖 3 个共享种子、4 条路径：有效／失效预览键、正文与步骤文本、空／未保存产物、预览不改状态、反馈原引用、unknown、done＋worse＋空日期、复制事件不记执行、整包两份产物及隐私边界、新轮保留历史，全部通过。
- QA 内精简模块冒烟再次通过；它仍是纯内存状态，不是实际页面点击或 IndexedDB。
- `node --check demo/pages/action.js` 退出 0；根任务静态复核 **71 个唯一 HTML ID、53 个 JS 字面挂载点**，label／tab／panel 关联、关键区域不被反馈或 details 包裹、CSS 本页作用域及四文件 UTF-8／行尾检查均通过。没有执行 CSS 渲染引擎或实际焦点测试。
- 收口检查 `python scripts/verify_demo_content.py` 通过 **1335 项内容检查、15 项验收定义路径**；`git diff --check` 退出 0。统筹服务的 HTML、JS、CSS 只读 HTTP GET 均为 200。没有另开服务、暂存或提交。
- 独立只读复核另运行 130 项预览／业务纯函数断言，全部通过；未发现新的阻断性逻辑问题。这不替代根任务检查或浏览器验收。
- Browser 可信路径错误及统一备用许可尚未解决。本轮没有打开浏览器、改信任路径、调用 Playwright 或写同源测试会话；无第三页运行截图、首屏高度／布局／交互实测结论。

1920×1080 的首屏、内容切换、步骤复制、整包下载、常显风险和后置反馈需由统筹安排真实浏览器窗口。上一轮登记的公共壳宽度差异已由统筹修改；本轮只读核对 `--content-width: min(calc(90% + 48px), 1776px)` 与两侧 24px 内边距，正文目标为 90%／1728px，但未做真实画面对齐验收。本页未改共享样式。手机与 Figma 仍后置，不声明视觉获选或完整验收。

## 本轮范围与交付

只修改以下四个文件，没有改共享模块、其他页面或公共文档，没有 Git 写操作：

- [03-action.html](../../../demo/03-action.html)：空态、成品、必要风险、后置折叠反馈及本机记录。
- [action.css](../../../demo/pages/action.css)：所有页级样式限定在 `body[data-page="action"]`。
- [action.js](../../../demo/pages/action.js)：共享接口接线、取用、反馈、新轮与异常处理。
- 本文件：实际检查、未验项和交接。

依赖 [SHARED_CONTRACT](SHARED_CONTRACT.md)＋[CONTRACT_DETAILS](CONTRACT_DETAILS.md)，版本 `demo.v1`；没有自建数据库、localStorage、路由或替代生成器。公共代码、样例、测试和 Git 归新统筹“黑客松 Demo 统筹接续”。未安装依赖、换栈、引入 CDN／远程字体或真实商家接口。

已实际查看临时参考 [round-2.png](../../../demo/assets/design/intake-refinements-20260828/round-2.png)，沿用浅纸色、深墨、朱红、中文排版与留白，不再生图、不把题目当品牌。参考不是已批准的第三页图稿；1920×1080 和窄屏均未做浏览器验收。

按统筹最新通知，**先完成 1920×1080 PC 与基础链路，再进入移动阶段**。已有响应样式保留，本轮不启动手机设计／验收或 Figma。进度中已实际查看并展示上述静态参考，明确原 PNG 为 1672×941；没有用它冒充第三页运行截图。后续首屏、关键布局与主要操作的真实截图须在获准浏览器窗口中补齐。

## 当前基础行为

| 区域 | 当前代码行为 |
| --- | --- |
| 打开页面 | `loadSession` 校验当前确认版本、分析和选择；无有效选择不默认选 A、不载入案例。已确认问题时引导第二页，未确认时遵循共享门槛引导第一页 |
| 成品 | 同步 `buildDemoArtifact` 后逐项 `ARTIFACT_SAVE`；引用成功 state 的真实 ID/version/savedAt。刷新对照已存内容防重复；失败保留未保存参考文本供手动取用 |
| 复制 | 先重读版本，只有剪贴板 Promise 成功才记 `copy_succeeded`；失败保留文字及手动选取，不记采用或执行 |
| TXT | 冻结当前快照，生成后再次核对 round/input/analysis/path/稿件版本；UTF-8 BOM、CRLF、系统 ID 文件名。包含成品、来源、版本、使用步骤、必要风险与原观察计划，不导出反馈／历史／原件 |
| 导出同意 | 所有导出逐次确认当前必要摘要，不凭 `demo_fixture` 豁免；绑定版本签名，版本变化或导出操作结束后撤销 |
| 反馈 | 默认折叠且自愿；动作状态／一句观察即可记录，标签、范围、日期选填。采用／执行／观察独立，未知不补零或自动分类 |
| 保存与读回 | 新自述固定关联所报告稿件。重试沿用 commandId/payload；事务成功才显示本机保存，真实重读后才标已读取。不凭最后一条数组记录猜本次反馈 |
| 换路与新轮 | 非脏表单随上下文变化清空；脏稿仍绑定旧行动，历史引用不搬家。仅已保存反馈可 `ROUND_START`，成功后走共享导航；本页守卫重复点击，共享层负责跨标签／刷新幂等 |
| 操作日志 | 查看、读取、复制和下载请求与业务事件分开；日志失败只补记，不重做下载或复制 |

复杂成品编辑、事实／承诺改写、历史稿导出、反馈修订、指标输入和平台核验未实现，当前成品为只读参考稿。这是本轮获准的基础版，不是完整第三页验收。

## 基础版已有检查（首轮交接记录）

| 命令／检查 | 结果与边界 |
| --- | --- |
| `node --check demo/pages/action.js` | 退出 0；不证明 DOM 或交互 |
| Node 纯函数集成 | 实际共享 `model.js`／`demo-data.js`＋本页函数，3 个统筹合成种子、72 项断言通过；所有状态仅在内存，不是 IndexedDB 或浏览器测试 |
| Python 静态检查 | DOM ID 唯一、JS 挂载点和 label 目标存在；六共享文件存在；没有外链、私建存储或 `innerHTML` 注入；新页面 UTF-8 和行尾检查通过 |
| `python scripts/verify_demo_content.py` | 首轮交接检查 1157 项内容检查通过，15 项旧场景路径有效；本次改版检查见上节。脚本不验证 UI、模型、记忆、授权或经营效果 |
| `git diff --check` | 退出 0；未跟踪新文件另做文本检查，没有暂存或提交 |
| 本地 HTTP GET | `03-action.html`、`pages/action.js`、`pages/action.css` 均返回 200；只证明服务可返回文件，未执行页面 JavaScript |
| Browser | 初始化报 `Trusted RPC dependency must resolve within a configured trusted code path`，涉及 `browser-service.mjs`；运行时未建立，恢复说明入口也不可用。未打开页面，没有控制台／截图／交互结论 |

当前地址：[第三页基础页](http://127.0.0.1:4188/03-action.html)。本页没有另开服务、改端口或终止进程；只读检查了统筹同源服务的响应。浏览器故障已报新统筹，未更改信任／MCP 配置、未自行换 Playwright；备用验证许可由统筹统一处理，不重复索要。

### 可复现的模块冒烟命令

下面是基础行为及本轮预览检查的精简复现，范围小于完整 148 项追加检查；从仓库根目录用 PowerShell 执行。仅使用统筹合成种子，不写浏览器存储，也不等于页面实际点击。

```powershell
@'
import assert from 'node:assert/strict';
import {createEmptyState, reduceCommand} from './demo/shared/model.js';
import {buildDemoAnalysis, buildDemoArtifact} from './demo/shared/demo-data.js';
import {activeSelection, currentArtifacts, selectPreviewArtifact, artifactPreviewText, makeFeedbackPayload, buildActionPack} from './demo/pages/action.js';
let n = 0;
const context = {newId: () => 'qa3_' + (++n), now: '2026-08-28T06:30:00.000Z'};
for (const fixtureId of ['underbed_complete_v1','one_sentence_v1','scope_conflict_v1']) {
  let state = createEmptyState(context);
  const apply = (type, payload) => {state = reduceCommand(state, {type,payload}, context).state;};
  assert.equal(activeSelection(state), null);
  apply('LOAD_FIXTURE', {fixtureId});
  apply('FOCUS_CONFIRM', {inputVersion:state.round.inputVersion});
  apply('ANALYSIS_SET', {analysis:buildDemoAnalysis(state).analysis});
  assert.equal(activeSelection(state), null);
  apply('PATH_SELECT', {analysisId:state.analysis.id,pathId:state.analysis.paths[0].id,inputVersion:state.round.inputVersion});
  for (const artifact of buildDemoArtifact(state).artifacts) apply('ARTIFACT_SAVE', {artifact});
  const artifacts = currentArtifacts(state);
  const artifact = artifacts[0];
  const alternate = artifacts[1];
  const beforePreview = JSON.stringify(state);
  assert.equal(selectPreviewArtifact(artifacts, `${alternate.id}:${alternate.version}`), alternate);
  assert.equal(selectPreviewArtifact(artifacts, 'old:1'), artifact);
  assert.equal(selectPreviewArtifact([], null), null);
  assert.equal(artifactPreviewText(alternate), alternate.body);
  assert.equal(artifactPreviewText(alternate, 'steps'), alternate.usage.steps.map((step, i) => `${i + 1}. ${step}`).join('\n'));
  assert.equal(JSON.stringify(state), beforePreview);
  apply('FEEDBACK_SAVE', makeFeedbackPayload(artifact, {execution:'done',observation:'worse',rawText:'',scope:'',executedAt:null}));
  assert.equal(state.executionRecords[0].execution, 'done');
  assert.equal(state.executionRecords[0].adoption, 'unknown');
  assert.equal(state.executionRecords[0].executedAt, null);
  assert.equal(state.feedbackRecords[0].observation, 'worse');
  assert.throws(() => buildActionPack(state, {exportId:'qa3_deny',generatedAt:context.now,allowSummaries:false}));
  const pack = buildActionPack(state, {exportId:'qa3_export',generatedAt:context.now,allowSummaries:true});
  assert.equal(pack.text.charCodeAt(0), 0xFEFF);
  assert.equal(/(?<!\r)\n/.test(pack.text), false);
  assert.ok(pack.text.includes('artifactId: ' + artifact.id));
  apply('ROUND_START', {feedbackId:state.feedbackRecords[0].id});
  assert.equal(activeSelection(state), null);
  assert.equal(state.executionRecords[0].artifactId, artifact.id);
}
console.log('PASS: A3 module and preview smoke over 3 shared seeds; no browser/IndexedDB checks.');
'@ | node --input-type=module
```

## 八项页面验收：没有整项浏览器通过

| 编号 | 已有证据 | 尚未执行 |
| --- | --- | --- |
| A3-01 | 取用事件不改变执行的纯函数断言；正文／步骤文本与预览无副作用断言；真实 API 调用与折叠反馈代码 | 从第二页进入、切换产物及步骤、剪贴板成功／拒绝、实际下载与日志补记 |
| A3-02 | 空会话、仅分析未选择时无有效行动；HTTP 200 | 直达第三页并点击安全引导 |
| A3-03 | partial／done＋worse＋executedAt=null，采用 unknown、时间独立、缺计数=[] 断言 | 浏览器表单保存及读回 |
| A3-04 | 同操作重试对象保留；响应未确认使用中性提示 | IndexedDB 保存／刷新／禁用／失败／提交后响应丢失／去重 |
| A3-05 | 纯函数新轮保留历史版本；审查修复旧反馈表单与导出同意跨版本残留 | 输入变更、换路、跨标签及脏稿离开 |
| A3-06 | 新轮索引递增、选择清空、历史保留；仅使用已保存反馈 | 实际双击、跨标签／刷新幂等与导航 |
| A3-07 | TXT BOM／CRLF／安全文件名／元数据／风险／不导出反馈历史断言 | 真正触发下载并打开落盘文件；不能把内存字符串当实际导出文件 |
| A3-08 | label、tab／panel关联、CSS 作用域、焦点／减少动效／窄屏规则静态检查 | 1920×1080工作区及1440×900／1280×720补充回归、键盘tab与方向键、实际排版、控制台及截图；390px按最新顺序后置 |

待实测主链：显式载入合成案例 → 第一页确认 → 第二页显式选路 → 第三页取用 → 自愿记录完成＋变差、日期留空 → 保存 → 刷新真实读回 → 带反馈再分析。部分执行、未知原话、空选择、换路与失败恢复另走分支；这段是复现计划，不是已点击记录。

截图位置：无。已查看的 round-2 仅是临时参考，没有实现截图可供并排比较，不声明最终视觉一致。

## 已修复问题与交接边界

- 修复了换路后旧表单值可能写入新行动的问题；脏稿保留原引用，非脏表单重置。
- 导出同意逐次且绑定版本。曾复现合成例实质修改后仍沿用 `demo_fixture` 的共享来源问题，已报统筹；当前共享文件已加入输入变更／自述反馈清除 fixtureId 的处理，本页不改共享实现，浏览器回归仍待完成。
- 空观察原话在共享层保存为 `''` 时，仅规范匹配比较，不改原重试载荷。不用最后一条数组记录猜保存结果；歧义时让用户选择已保存记录。
- 保存错误可能是提交响应丢失，提示为“尚未确认保存结果”，保留同一操作重试。
- 共享壳与导航仍由统筹集成；请重点实测保存中页头导航、清空／载入示例与脏稿守卫。
- 本轮未重复 MCP 前检，未读取付费组件源码、安装组件、改配置或新增外部调用。没有真实模型、MoneyAI 记忆、经营效果或完整视觉验收。

本页基础代码交接后停止，等待新统筹集成或通知获准的浏览器验证；不进入其他页面、共享模块或后续功能。

<details>
<summary>历史前检快照（REQ-10／REQ-16 前，仅用于追溯）</summary>

以下保留的是此前未获准基础编码时的记录；其旧状态不覆盖上面的本轮交付。

更新：2026-08-28。**前置核查已进行；页面未实现，A3-01—A3-08 均未执行。** 本文不是 UI、剪贴板、下载、存储、模型或经营效果的通过记录。

## 1. 本轮范围与文件归属

- 用户本轮明确要求阅读并推进 `PROMPT_AGENT_3.md`，本记录据此接收第三页任务；不将任务下发解释为全部 Demo 取舍、第三页历史问题或视觉方案已获批准。
- 已阅读根约定、开发入口、当前基线、资料收件区、Demo 入口、第三页 prompt、共享契约、视觉简报、MCP 约定、验收矩阵、第三页讨论稿及 V0.4 复用边界。收件区当前仅登记 V0.4 共享摘要，没有新增的范围或视觉批准记录。
- 本轮只新增本文件，不创建第三页 HTML/CSS/JS，不修改共享文件、需求基线或 READY 表；本轮下发状态由统筹统一登记。
- 依赖契约：`demo.v1` **提案**；没有已验证的共享实现版本。视觉参考：未获选，没有可对照的批准图稿。
- 启动时 Git 工作区干净；核查途中陆续出现其他并行工作的 `QA_AGENT_1.md`、`QA_AGENT_2.md`，未修改、暂存或提交这两个文件。页面 Agent 不执行 pull、切分支、commit 或 push。

## 2. 开工门槛：尚未满足

以 [Demo 入口](README.md) 的 READY 表及实际文件为依据，不以文档中的未来接口代替可运行模块。

| 门槛 | 本轮观察 | 对第三页的影响 |
| --- | --- | --- |
| Demo 范围 | `DEMO_SCOPE_APPROVED=否` | 待统筹登记用户对本轮取舍的确认；本页不自行批准 |
| 统一视觉 | `VISUAL_APPROVED=否`；没有已批准母版路径 | 不能独立选择主题、生成另一套三页风格或开始 UI 实现 |
| 共享底座 | `SHARED_READY=否`；实际 `demo/` 不存在 | 无可导入的状态、导航、公共壳、演示生成器或公共样式 |
| 第三页下发 | 本轮用户已明确下发；公共表仍为 `AGENTS_DISPATCHED=否` | 已接任务，但其余门槛仍须满足；公共表由统筹维护 |
| MCP 前检 | 21st 与 React Bits 本会话实际检索成功 | 仅证明资源检索可用，不代表组件集成或视觉通过 |

实际用 `Test-Path -LiteralPath` 检查的缺失项：

```text
demo/
demo/shared/tokens.css
demo/shared/base.css
demo/shared/shell.js
demo/shared/state.js
demo/shared/navigation.js
demo/shared/demo-data.js
demo/samples/
demo/tests/
demo/assets/design/
```

因此没有启动静态服务，也没有可打开的第三页。共享约定的未来地址为 `http://127.0.0.1:4188/03-action.html`，**本轮未运行、未访问，不是已交付预览链接**。

## 3. 设计能力与 MCP 实测

已读取当前环境可用的 Build Web Apps `frontend-app-builder`、Product Design `index` 及其约束。它们要求先有获选视觉目标；本页遵守仓库由统筹统一选型的分工，未开始图稿生成、脚手架或服务启动。

| 工具与参数 | 实际返回 | 使用边界 |
| --- | --- | --- |
| `mcp__21st__search`：`query="copy button"`、`type="component"`、`limit=2` | 2 条免费元信息：Copy Button，ID `10224`（tom_ui）、`24659`（motiondotdev） | 候选用途为复制操作反馈；未读取付费源码、未安装、未集成、未验证视觉 |
| `mcp__reactbits__get_project_registries` | 包含 `@shadcn` 与 `@react-bits` | 当前连接可发现所需注册表；未修改本机配置 |
| `mcp__reactbits__search_items_in_registries`：`registries=["@react-bits"]`、`query="FadeContent"`、`limit=2` | 16 个匹配，返回 `FadeContent-JS-CSS`、`FadeContent-TS-CSS` | 候选用途为主动展开反馈区时的轻量过渡；不做虚假保存动画 |
| 同工具：`query="Stepper"`、`limit=2` | 56 个匹配，返回 `Stepper-JS-TW`、`Stepper-JS-CSS` | 只参考必要步骤的状态表达，不引入强制分步问卷或替换共享导航 |

旧文档记录的 React Bits 注册表错误本轮没有重现；这不证明其他对话连接也已刷新。检索返回的 `Add command` 为 `[object Promise]`，没有执行该字段，也没有将检索成功写成安装成功。

仅发送通用组件关键词，未外发商家资料、私密原件或密钥。资源候选尚未选用；许可证、依赖、原生 HTML 适配与实际视觉均未验证。没有引入 React、npm、CDN、远程字体或新增付费调用。

## 4. 向统筹提出的共享交接缺项

以下是对 [共享契约](SHARED_CONTRACT.md) 的待落实细节，不修改公开接口，也不由本页定义替代状态。

| 所需交接 | 具体缺口或应提供的证据 | 关联验收 |
| --- | --- | --- |
| 获选第三页视觉与共享样式 | 公共壳、token、来源/风险提示、空态及反馈/保存状态参考；附批准图稿路径 | A3-01、02、08 |
| 生成器及命令 schema 示例 | `buildDemoArtifact(state)` 的返回结构、单项/多项产物、必要事实缺失及失败形态；`ARTIFACT_SAVE`、`FEEDBACK_SAVE`、`ROUND_START` 的可调用样例 | A3-01、03—06 |
| 编辑与保存语义 | 仅改口吻和改价格/规格/承诺/行动范围如何按共享机制区分；保存事务完成后实际保存时间从哪里读取，不能用 `reportedAt` 或 `executedAt` 冒充 | A3-03—05 |
| 事件词表与版本引用 | 除已明定的 `download_requested` 外，查看、剪贴板成功、保存及读回的确切事件名、允许字段和 `refs` 结构尚未列全；页面不能各造一套 | A3-01、04、06、07 |
| TXT 导出约定 | 契约第 7 节明确 TXT，但尚未规定 prompt 要求的编码、文件命名及来源标签格式；需统筹统一，不能另造分析报告 | A3-07 |
| 合成种子与失败注入 | 三类种子的 ID/载入方式、合法选路状态、存储禁用/写入失败/读取失败/冲突注入及恢复方法；不得拿预写反馈当历史读回 | A3-02—06 |

共享底座还须提供 [契约第 8 节](SHARED_CONTRACT.md) 要求的实际验证记录。现有 `fixtures/` 素材不等于已实现的共享种子加载器、IndexedDB 或页面集成。

## 5. 第三页验收：全部待执行

以下为 READY 后的复现要求。使用统筹提供的隔离合成会话，不清空真实商家资料，不把预写内容当实际反馈。

| 编号 | 后续复现与检查重点 | 本轮结果 |
| --- | --- | --- |
| A3-01 | 从第二页显式选路进入，只显示对应产物；不填反馈即可复制/导出。检查成功与剪贴板拒绝分支、手动取用，以及采用/执行状态没有被取用操作改变 | 未执行：无页面、选路和共享模块 |
| A3-02 | 在没有有效 selection 的合成会话直达第三页；只引导第二页，不默认选 A、不展示预载历史或虚构成品 | 未执行：无页面及空会话种子 |
| A3-03 | 主动记录部分执行与变差，不填执行时间；核对 `execution=partial`、`observation=worse`、`executedAt=null`，反馈时间独立，采用仍按实际陈述记录 | 未执行：无反馈表单和保存接口 |
| A3-04 | 保存后刷新并真实读回；分别注入禁用存储、写入/读取失败，重试相同记录。检查事务完成前不报成功、草稿保留、无重复正式记录 | 未执行：无 IndexedDB 实现及失败注入 |
| A3-05 | 保存原版本执行记录，再修改输入或回第二页换路；检查旧产物只读/失效、旧执行引用不变；有未保存编辑时提示保存或明确放弃 | 未执行：无版本机制和导航守卫 |
| A3-06 | 显式携带已保存反馈再分析，重复点击同一反馈；仅创建一个新 round，保留版本与原话，不把没变化解释为失败或已回滚 | 未执行：无 `ROUND_START` 实现 |
| A3-07 | 实际导出并打开 TXT，核对正确行动、稿件版本、来源、演示标签及必要风险；只记录 `download_requested`，不声称文件已落盘 | 未执行：无导出文件；编码/文件名待统筹明确 |
| A3-08 | 按 QA_MATRIX 检查 1440×900、1280×720、390px 窄屏，键盘、焦点、触达、文本可读性、减少动效和控制台；同尺寸对照获选母版 | 未执行：无页面、母版或浏览器截图 |

截图位置：无。浏览器操作、导出文件内容检查、网络离线检查与视觉对照均未运行；不能用下方静态检查替代。

## 6. 实际静态检查与交接

| 命令/检查 | 结果 | 能证明什么 |
| --- | --- | --- |
| `git status --short` | 已执行；启动干净，后续发现其他 Agent 的 QA 文件并保留 | 仅工作区变动快照，不证明应用可用 |
| `rg --files -g AGENTS.md -g QA_AGENT_3.md -g 'docs/development/demo/**'` | 已执行；写入前本页 QA 文件不存在 | 核对文档与文件归属 |
| `Test-Path -LiteralPath` 检查第 2 节路径 | 全部返回 `False` | 共享运行文件缺失 |
| `python scripts/verify_demo_content.py` | 退出 0；`PASS: 922 content checks; 15 acceptance definitions have valid fixture paths.` | 仅仓库素材/文档检查；脚本明确输出 UI、模型、MoneyAI 记忆、授权及经营效果检查未运行 |
| `git diff --check` | 退出 0，无输出 | 仅 Git 文本差异检查，不覆盖未跟踪文件内容 |
| Python 单独读取新增 QA 文件并检查行尾 | 退出 0；UTF-8 可读取、无行尾空白、文件以换行结束 | 补检尚未跟踪的本文件；未暂存文件 |

本轮交付仅为本前置核查记录。没有页面实现、共享模块变更、依赖安装、Git 提交/推送或真实数据接入。下一步由统筹确认范围与统一视觉，交付并验证共享底座及上述必要细节，更新 READY 后再继续第三页实现；不自动进入其他页面或后续功能。

</details>
