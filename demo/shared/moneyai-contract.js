export const MONEYAI_CONTRACT_VERSION = 'luya.moneyai.v1';

export const MONEYAI_OPERATIONS = Object.freeze({
  intake: 'intake.extract',
  analysis: 'analysis.run',
  decisionWrite: 'decision.write',
  historyRead: 'history.read'
});

const MAX_REQUEST_BYTES = 256 * 1024;
const ID = /^[A-Za-z0-9._:-]{1,120}$/;
const FINGERPRINT = /^sha256:[a-f0-9]{64}$/;
const TOKEN = /^[A-Za-z0-9._:-]{1,80}$/;
const TEXT_MIMES = new Set(['text/plain', 'text/csv', 'application/json']);
const plain = (value) => value !== null && typeof value === 'object'
  && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

function exactKeys(value, required, optional = []) {
  if (!plain(value)) return false;
  const allowed = new Set([...required, ...optional]);
  const keys = Object.keys(value);
  return required.every((key) => own(value, key)) && keys.every((key) => allowed.has(key));
}

// This clone rejects accessors, toJSON, sparse arrays, binaries and implicit
// coercion. It is the only representation that may become transport bytes.
export function copyMoneyAIJSON(value) {
  const ancestors = new Set();
  let nodes = 0;
  const copy = (entry, depth = 0) => {
    if (++nodes > 10000 || depth > 64) throw new Error('invalid_payload');
    if (entry === null || typeof entry === 'string' || typeof entry === 'boolean') return entry;
    if (typeof entry === 'number' && Number.isFinite(entry)) return entry;
    if ((!Array.isArray(entry) && !plain(entry)) || ancestors.has(entry)) throw new Error('invalid_payload');
    ancestors.add(entry);
    const descriptors = Object.getOwnPropertyDescriptors(entry);
    const keys = Reflect.ownKeys(descriptors).filter((key) => !(Array.isArray(entry) && key === 'length'));
    if (keys.some((key) => typeof key !== 'string' || key === 'toJSON'
      || !descriptors[key].enumerable || !own(descriptors[key], 'value'))) throw new Error('invalid_payload');
    let result;
    if (Array.isArray(entry)) {
      if (entry.length > 10000 || keys.length !== entry.length
        || keys.some((key) => !/^(0|[1-9][0-9]*)$/.test(key) || Number(key) >= entry.length)) {
        throw new Error('invalid_payload');
      }
      result = Array.from({ length: entry.length }, (_, index) => copy(descriptors[index].value, depth + 1));
    } else {
      result = Object.create(null);
      for (const key of keys) result[key] = copy(descriptors[key].value, depth + 1);
    }
    ancestors.delete(entry);
    return result;
  };
  return copy(value);
}

function validScope(scope) {
  if (!exactKeys(scope, ['sessionId', 'roundId', 'inputVersion', 'analysisId', 'pathId',
    'artifact', 'feedback', 'inputFingerprint'])) return false;
  if (!ID.test(scope.sessionId) || !ID.test(scope.roundId)
    || !Number.isSafeInteger(scope.inputVersion) || scope.inputVersion < 1
    || !FINGERPRINT.test(scope.inputFingerprint)) return false;
  if (scope.analysisId !== null && !ID.test(scope.analysisId)) return false;
  if (scope.pathId !== null && !ID.test(scope.pathId)) return false;
  if (scope.artifact !== null && (!exactKeys(scope.artifact, ['id', 'version'])
    || !ID.test(scope.artifact.id) || !Number.isSafeInteger(scope.artifact.version) || scope.artifact.version < 1)) return false;
  if (scope.feedback !== null && (!exactKeys(scope.feedback, ['id', 'recordVersion', 'detailsVersion'])
    || !ID.test(scope.feedback.id) || !Number.isSafeInteger(scope.feedback.recordVersion) || scope.feedback.recordVersion < 1
    || !Number.isSafeInteger(scope.feedback.detailsVersion) || scope.feedback.detailsVersion < 0)) return false;
  return true;
}

function validConsent(consent) {
  return exactKeys(consent, ['granted', 'sendScope', 'dataClasses']) && consent.granted === true
    && Array.isArray(consent.sendScope) && consent.sendScope.length > 0 && consent.sendScope.length <= 16
    && consent.sendScope.every((entry) => typeof entry === 'string' && TOKEN.test(entry))
    && new Set(consent.sendScope).size === consent.sendScope.length
    && Array.isArray(consent.dataClasses) && consent.dataClasses.length > 0 && consent.dataClasses.length <= 16
    && consent.dataClasses.every((entry) => typeof entry === 'string' && TOKEN.test(entry))
    && new Set(consent.dataClasses).size === consent.dataClasses.length;
}

function validPayload(operation, payload) {
  if (operation === MONEYAI_OPERATIONS.intake) {
    return exactKeys(payload, ['version', 'transcript', 'description', 'sources', 'materials'])
      && payload.version === 'intake.extract.v1'
      && typeof payload.transcript === 'string' && payload.transcript.length <= 20000
      && typeof payload.description === 'string' && payload.description.length <= 20000
      && Array.isArray(payload.sources) && payload.sources.length <= 20
      && payload.sources.every((entry) => typeof entry === 'string' && TOKEN.test(entry))
      && Array.isArray(payload.materials) && payload.materials.length <= 6
      && payload.materials.every((item) => exactKeys(item, ['materialId', 'materialVersion', 'mime', 'text'])
        && ID.test(item.materialId) && Number.isSafeInteger(item.materialVersion) && item.materialVersion >= 1
        && TEXT_MIMES.has(item.mime) && typeof item.text === 'string' && item.text.length <= 50000);
  }
  if (operation === MONEYAI_OPERATIONS.analysis) {
    return exactKeys(payload, ['version', 'focus', 'facts', 'constraints', 'unknowns'])
      && payload.version === 'analysis.request.v1' && typeof payload.focus === 'string' && payload.focus.length <= 2000
      && Array.isArray(payload.facts) && payload.facts.length <= 100 && payload.facts.every(plain)
      && Array.isArray(payload.constraints) && payload.constraints.length <= 50 && payload.constraints.every(plain)
      && Array.isArray(payload.unknowns) && payload.unknowns.length <= 50 && payload.unknowns.every(plain);
  }
  if (operation === MONEYAI_OPERATIONS.decisionWrite) {
    return exactKeys(payload, ['version', 'record']) && payload.version === 'decision.record.v1' && plain(payload.record);
  }
  if (operation === MONEYAI_OPERATIONS.historyRead) {
    if (!exactKeys(payload, ['version', 'query']) || payload.version !== 'history.query.v1'
      || !exactKeys(payload.query, ['limit', 'cursor'], ['recordIds', 'operationIds', 'roundIds'])) return false;
    if (!Number.isSafeInteger(payload.query.limit) || payload.query.limit < 1 || payload.query.limit > 100
      || payload.query.cursor !== null && (typeof payload.query.cursor !== 'string' || payload.query.cursor.length > 500)) return false;
    for (const key of ['recordIds', 'operationIds', 'roundIds']) {
      if (own(payload.query, key) && (!Array.isArray(payload.query[key]) || payload.query[key].length > 100
        || !payload.query[key].every((entry) => typeof entry === 'string' && ID.test(entry)))) return false;
    }
    return true;
  }
  return false;
}

export function createMoneyAIEnvelope({ operation, operationId, attemptId, scope, consent, payload }) {
  const candidate = copyMoneyAIJSON({ contractVersion: MONEYAI_CONTRACT_VERSION,
    operation, operationId, attemptId, scope, consent, payload });
  if (!exactKeys(candidate, ['contractVersion', 'operation', 'operationId', 'attemptId', 'scope', 'consent', 'payload'])
    || candidate.contractVersion !== MONEYAI_CONTRACT_VERSION || !Object.values(MONEYAI_OPERATIONS).includes(operation)
    || !ID.test(operationId) || !ID.test(attemptId) || !validScope(candidate.scope)
    || !validConsent(candidate.consent) || !validPayload(operation, candidate.payload)) throw new Error('invalid_payload');
  return candidate;
}

export function freezeMoneyAIRequest(request) {
  const envelope = createMoneyAIEnvelope(request);
  const body = JSON.stringify(envelope);
  if (new TextEncoder().encode(body).byteLength > MAX_REQUEST_BYTES) throw new Error('invalid_payload');
  return { envelope, body };
}

function canonical(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  return '{' + Object.keys(value).sort().map((key) => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
}

export async function computeMoneyAIInputFingerprint(value, cryptoImpl = globalThis.crypto) {
  const bytes = new TextEncoder().encode(canonical(copyMoneyAIJSON(value)));
  if (!cryptoImpl?.subtle?.digest) throw new Error('fingerprint_unavailable');
  const digest = new Uint8Array(await cryptoImpl.subtle.digest('SHA-256', bytes));
  return 'sha256:' + [...digest].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function validateMoneyAIResponse(response, request) {
  let result;
  try { result = copyMoneyAIJSON(response); } catch { return { ok: false, code: 'invalid_response', sentToMoneyAI: null }; }
  const identityMatches = plain(result) && result.contractVersion === MONEYAI_CONTRACT_VERSION
    && result.operation === request.operation && result.operationId === request.operationId
    && result.attemptId === request.attemptId && validScope(result.scope)
    && canonical(result.scope) === canonical(request.scope);
  if (!identityMatches || ![true, false, null].includes(result.sentToMoneyAI) || typeof result.ok !== 'boolean') {
    return { ok: false, code: 'invalid_response', sentToMoneyAI: plain(result) && [true, false, null].includes(result.sentToMoneyAI)
      ? result.sentToMoneyAI : null };
  }
  if (result.ok !== true) return { ok: false,
    code: typeof result.code === 'string' && TOKEN.test(result.code) ? result.code : 'moneyai_failed',
    message: typeof result.message === 'string' && result.message.length <= 2000 ? result.message : null,
    sentToMoneyAI: result.sentToMoneyAI };
  if (result.sentToMoneyAI !== true || !plain(result.result)) {
    return { ok: false, code: 'invalid_response', sentToMoneyAI: result.sentToMoneyAI };
  }
  return { ok: true, result: result.result, sentToMoneyAI: true,
    receipt: { contractVersion: result.contractVersion, operation: result.operation,
      operationId: result.operationId, attemptId: result.attemptId,
      inputFingerprint: result.scope.inputFingerprint, scope: copyMoneyAIJSON(request.scope) } };
}
