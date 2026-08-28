import test from 'node:test';
import assert from 'node:assert/strict';
import { createEmptyState, reduceCommand, FEEDBACK_DETAILS_VERSION } from '../shared/model.js';
import { buildDemoAnalysis, buildDemoArtifact } from '../shared/demo-data.js';
import { buildExperimentReview } from '../shared/experiment-memory.js';
import { getAcceptedExperimentRound } from '../shared/experiment-round.js';
import {
  makeFeedbackPayload, makeExperimentAcceptanceCommand, canAcceptExperimentReview,
  acceptanceReceiptMatches, reviewSnapshotMatches, candidatePlanRows,
} from '../pages/action.js';

// Every source record comes from the existing synthetic fixture and real reducer.
// No browser, file upload, network request, or private merchant material is involved.
let fixtureNumber = 0;
function experimentFixture() {
  const prefix = `merge_${++fixtureNumber}_`;
  let sequence = 0;
  const context = { newId: () => prefix + ++sequence, now: '2026-08-29T12:00:00.000Z' };
  let state = createEmptyState(context);
  const dispatch = (command) => {
    const result = reduceCommand(state, command, context);
    state = result.state;
    return result;
  };
  const send = (type, payload) => dispatch({
    type, payload, commandId: context.newId(), expectedRevision: state.revision,
  });
  send('LOAD_FIXTURE', { fixtureId: 'juicer_cup_v1' });
  send('FOCUS_CONFIRM', { inputVersion: state.round.inputVersion });
  const generatedAnalysis = buildDemoAnalysis(state);
  assert.equal(generatedAnalysis.ok, true, generatedAnalysis.message);
  send('ANALYSIS_SET', { analysis: generatedAnalysis.analysis });
  const path = state.analysis.paths.find((item) => item.optionLabel === 'A');
  assert.ok(path);
  send('PATH_SELECT', { analysisId: state.analysis.id, pathId: path.id, inputVersion: state.round.inputVersion });
  const generatedArtifacts = buildDemoArtifact(state);
  assert.equal(generatedArtifacts.ok, true, generatedArtifacts.message);
  for (const artifact of generatedArtifacts.artifacts) send('ARTIFACT_SAVE', { artifact });
  const artifact = state.artifacts.find((item) => item.kind === 'copy' && item.pathId === path.id);
  assert.ok(artifact);
  const record = (draft = {}) => {
    const payload = makeFeedbackPayload(artifact, {
      adoption: 'adopted', execution: 'done', scope: '只替换详情页首屏文字层', executedAt: '2026-08-29',
      observation: 'unchanged', rawText: '已完成首屏改动，自述无明显变化，商品标题不能修改。',
      sampleSize: String(path.experiment.minSample), guardrailStatus: 'clear',
      constraintsText: '商品标题不能修改', ...draft,
    }, { detailsVersion: FEEDBACK_DETAILS_VERSION });
    send('FEEDBACK_SAVE', payload);
    return state.feedbackRecords.at(-1).id;
  };
  const reviewOf = (feedbackId) => {
    const result = buildExperimentReview(state, feedbackId);
    assert.equal(result.ok, true, result.message);
    return result.review;
  };
  const feedbackId = record();
  const review = reviewOf(feedbackId);
  assert.equal(review.decision, 'change_variable');
  return { get state() { return state; }, send, dispatch, record, reviewOf, review, artifact, path };
}

test('acceptance command contains exactly four source references and retains the original expectedRevision', () => {
  const f = experimentFixture();
  const snapshot = structuredClone(f.state);
  const reviewBefore = structuredClone(f.review);
  const command = makeExperimentAcceptanceCommand(snapshot, f.review, 'merge_original_accept');
  assert.deepEqual(command, {
    type: 'EXPERIMENT_ACCEPT', commandId: 'merge_original_accept', expectedRevision: snapshot.revision,
    payload: { feedbackId: f.review.sourceFeedbackId, reviewFingerprint: f.review.fingerprint,
      roundId: f.review.roundId, inputVersion: f.review.inputVersion },
  });
  assert.deepEqual(Object.keys(command.payload).sort(), ['feedbackId', 'inputVersion', 'reviewFingerprint', 'roundId']);
  f.send('EVENT_APPEND', { event: { type: 'page_viewed', refs: { pageId: 'action' } } });
  assert.ok(f.state.revision > command.expectedRevision);
  assert.equal(command.expectedRevision, snapshot.revision, 'queued retries must not silently replace the original revision');
  assert.deepEqual(f.review, reviewBefore);
  assert.throws(() => makeExperimentAcceptanceCommand(snapshot, f.review, 'invalid command id'));
});

test('a newer related feedback disables acceptance of the previously displayed review before dispatch', () => {
  const f = experimentFixture();
  const oldCommand = makeExperimentAcceptanceCommand(f.state, f.review, 'merge_old_candidate');
  f.record({ observation: 'worse', rawText: '后来观察变差，先核对风险。' });
  const before = structuredClone(f.state);
  assert.throws(() => f.send('EXPERIMENT_ACCEPT', oldCommand.payload), /已有相关反馈|执行自述已更新/);
  assert.deepEqual(f.state, before, 'the shared reducer must not create a round from the old candidate');
  assert.equal(canAcceptExperimentReview(f.state, f.review), false,
    'the page acceptance predicate must also reject a candidate superseded by related feedback');
  assert.throws(() => makeExperimentAcceptanceCommand(f.state, f.review, 'merge_rebuilt_old_candidate'));
});

test('switching the selected path or invalidating the confirmed input rejects the old review', () => {
  for (const change of ['selection', 'input']) {
    const f = experimentFixture();
    assert.equal(canAcceptExperimentReview(f.state, f.review), true);
    if (change === 'selection') {
      const pathB = f.state.analysis.paths.find((item) => item.optionLabel === 'B');
      f.send('PATH_SELECT', { analysisId: f.state.analysis.id, pathId: pathB.id, inputVersion: f.state.round.inputVersion });
    } else {
      f.send('INPUT_EDIT', { description: f.state.input.description + '\n新增待核对的经营限制。' });
      assert.notEqual(f.state.input.confirmedVersion, f.state.round.inputVersion);
    }
    const before = structuredClone(f.state);
    assert.equal(canAcceptExperimentReview(f.state, f.review), false, change);
    assert.throws(() => makeExperimentAcceptanceCommand(f.state, f.review, 'merge_stale_' + change));
    assert.deepEqual(f.state, before);
  }
});

test('acceptance receipt matching rejects mismatched source artifact, version, path and other references', () => {
  const f = experimentFixture();
  const command = makeExperimentAcceptanceCommand(f.state, f.review, 'merge_real_acceptance');
  assert.equal(f.dispatch(command).changed, true);
  const receipt = getAcceptedExperimentRound(f.state, f.review.sourceFeedbackId, f.review.fingerprint);
  assert.equal(receipt.ok, true, receipt.message);
  assert.equal(acceptanceReceiptMatches(receipt, f.review), true);
  const before = structuredClone(receipt);
  for (const [key, value] of [
    ['sourceArtifactId', 'other_saved_artifact'], ['sourceArtifactVersion', f.review.artifactVersion + 1],
    ['sourcePathId', 'other_path'], ['sourceAnalysisId', 'other_analysis'],
    ['sourceRoundId', 'other_round'], ['sourceInputVersion', f.review.inputVersion + 1],
  ]) {
    assert.equal(acceptanceReceiptMatches({ ...receipt, source: { ...receipt.source, [key]: value } }, f.review), false, key);
  }
  for (const invalid of [null, { ...receipt, ok: false }, { ...receipt, accepted: false },
    { ...receipt, source: null }, { ...receipt, sourceFeedbackId: 'other_feedback' },
    { ...receipt, reviewFingerprint: 'sha256:' + '0'.repeat(64) }]) {
    assert.equal(acceptanceReceiptMatches(invalid, f.review), false);
  }
  assert.deepEqual(receipt, before);
});

test('review matching recomputes source identity and cannot use an older snapshot to endorse newer feedback', () => {
  const f = experimentFixture();
  const olderSnapshot = structuredClone(f.state);
  assert.equal(reviewSnapshotMatches(olderSnapshot, f.review), true);
  const newerId = f.record({ observation: 'worse', rawText: '新增反馈：观察变差，原因仍未知。' });
  const newerReview = f.reviewOf(newerId);
  assert.notEqual(newerReview.fingerprint, f.review.fingerprint);
  assert.equal(reviewSnapshotMatches(olderSnapshot, newerReview), false);
  assert.equal(reviewSnapshotMatches(f.state, newerReview), true);
  assert.equal(reviewSnapshotMatches(f.state, { ...newerReview, fingerprint: f.review.fingerprint }), false);
  const otherProject = experimentFixture();
  assert.equal(reviewSnapshotMatches(otherProject.state, newerReview), false);
  f.send('EVENT_APPEND', { event: { type: 'page_viewed', refs: { pageId: 'action' } } });
  assert.equal(reviewSnapshotMatches(f.state, newerReview), true, 'read-only events do not change the business fingerprint');
  assert.equal(reviewSnapshotMatches(f.state, null), false);
});

test('missing candidate fields remain unknown and never borrow the prior round window, stop or rollback plan', () => {
  const f = experimentFixture();
  assert.ok(f.path.experiment.window?.description);
  assert.ok(f.path.experiment.stopConditions?.length);
  assert.ok(f.path.experiment.restoreSteps?.length);
  const candidate = f.review.nextAction;
  const before = structuredClone(candidate);
  const rows = Object.fromEntries(candidatePlanRows(candidate));
  assert.match(rows['观察时间'], /尚未提供.*不用原轮次代填/);
  assert.match(rows['停止条件'], /尚未提供/);
  assert.match(rows['回滚方式'], /尚未提供.*不声称已经回滚/);
  assert.equal(rows['观察时间'].includes(f.path.experiment.window.description), false);
  const incomplete = structuredClone(candidate);
  for (const key of ['minSample', 'minSampleUnit', 'target', 'keepFixed']) delete incomplete[key];
  const missingRows = Object.fromEntries(candidatePlanRows(incomplete));
  assert.equal(missingRows['候选样本计划'], '未知');
  assert.equal(missingRows['主要观察'], '未知');
  assert.equal(missingRows['继续保持不变'], '候选尚未提供');
  assert.deepEqual(candidatePlanRows(null), []);
  assert.deepEqual(candidate, before);
});
