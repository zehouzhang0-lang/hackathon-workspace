import { assertState, createEmptyState, fail, ID_PATTERN, normalizeSessionState, reduceCommand, stable } from './model.js';
import { takeTestFault } from './test-hooks.js';

const DB_NAME = 'douyin-experiment-demo';
const STORES = ['sessions', 'blobs', 'commands', 'rounds'];
let databasePromise;
let emptyState;
let knownSessionId;
let operationQueue = Promise.resolve();
const listeners = new Set();
const context = () => ({ newId: () => crypto.randomUUID(), now: new Date().toISOString() });
const copy = (value) => structuredClone(value);
const errorResult = (error, state) => ({ ok: false, code: error?.code || 'write_failed', message: error?.code ? error.message : '本地存储操作失败，请重试；未确认结果不会显示为成功。', ...(state ? { state: copy(state) } : {}) });
const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('demo.v1-session-updated') : null;

function openDatabase() {
  if (takeTestFault('open')) return Promise.reject(Object.assign(new Error('测试：本地存储暂不可用。'), { code: 'storage_unavailable' }));
  if (typeof indexedDB === 'undefined') return Promise.reject(Object.assign(new Error('当前浏览器没有可用的IndexedDB。'), { code: 'storage_unavailable' }));
  if (!databasePromise) {
    databasePromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        for (const name of STORES) if (!request.result.objectStoreNames.contains(name)) request.result.createObjectStore(name, { keyPath: 'key' });
      };
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => { db.close(); databasePromise = null; };
        resolve(db);
      };
      request.onerror = () => { databasePromise = null; reject(Object.assign(new Error('无法打开本地存储，原记录未被覆盖。'), { code: 'storage_unavailable' })); };
      request.onblocked = () => { databasePromise = null; reject(Object.assign(new Error('另一个页面正在使用旧存储，请关闭旧页面后重试。'), { code: 'storage_unavailable' })); };
    });
  }
  return databasePromise;
}

async function readState() {
  const db = await openDatabase();
  if (takeTestFault('read')) fail('read_failed', '测试：读取失败；没有创建假空会话。');
  return new Promise((resolve, reject) => {
    let record;
    const transaction = db.transaction('sessions', 'readonly');
    const request = transaction.objectStore('sessions').get('active');
    request.onsuccess = () => { record = request.result; };
    transaction.oncomplete = () => {
      try {
        if (record) {
          assertState(record.state);
          knownSessionId = record.state.sessionId;
          emptyState = null;
          resolve(normalizeSessionState(record.state));
        } else {
          emptyState ||= createEmptyState(context());
          knownSessionId = emptyState.sessionId;
          resolve(copy(emptyState));
        }
      } catch (error) { reject(error); }
    };
    transaction.onerror = transaction.onabort = () => reject(Object.assign(new Error('无法读回本地记录，请重试。'), { code: 'read_failed' }));
  });
}

export async function loadSession() {
  try { return { ok: true, state: await readState() }; }
  catch (error) { return errorResult(error); }
}
function notify(result) {
  for (const listener of listeners) {
    try { listener(copy(result)); }
    catch { console.warn('一个页面订阅回调失败；本地保存结果未改变。'); }
  }
}
export function subscribeSession(listener) {
  if (typeof listener !== 'function') throw new TypeError('订阅需要回调函数。');
  listeners.add(listener);
  return () => listeners.delete(listener);
}
if (channel) channel.onmessage = async () => notify(await loadSession());
if (typeof window !== 'undefined') {
  window.addEventListener('pageshow', async (event) => { if (event.persisted) notify(await loadSession()); });
  document.addEventListener('visibilitychange', async () => { if (document.visibilityState === 'visible' && listeners.size) notify(await loadSession()); });
}

async function digest(bytes) {
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
async function prepareMaterial(file, replacement = false) {
  if (!(file instanceof Blob) || typeof file.name !== 'string') fail('invalid_payload', '请通过文件选择、拖放或粘贴提交文件。');
  if (!file.size || file.size > 5 * 1024 * 1024) fail('file_limit', '单份文件需大于0且不超过5MiB。');
  const ext = file.name.toLowerCase().split('.').at(-1);
  const mime = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', txt: 'text/plain', csv: 'text/csv', json: 'application/json' }[ext];
  if (!mime) fail('unsupported_type', '本轮支持PNG/JPEG/WebP、TXT、CSV和约定JSON。');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const ascii = (start, length) => String.fromCharCode(...bytes.slice(start, start + length));
  if (ext === 'png' && !(bytes[0] === 137 && ascii(1, 3) === 'PNG')) fail('unsupported_type', '文件内容不是有效PNG。');
  if (['jpg', 'jpeg'].includes(ext) && !(bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255)) fail('unsupported_type', '文件内容不是JPEG。');
  if (ext === 'webp' && !(ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WEBP')) fail('unsupported_type', '文件内容不是WebP。');
  if (file.type && file.type !== 'application/octet-stream') {
    const compatible = file.type === mime || (ext === 'csv' && ['text/plain', 'application/vnd.ms-excel'].includes(file.type)) || (ext === 'json' && file.type === 'text/plain');
    if (!compatible) fail('unsupported_type', '文件扩展名与类型不匹配。');
  }
  if (mime.startsWith('image/')) {
    try {
      if (typeof createImageBitmap === 'function') {
        const bitmap = await createImageBitmap(file);
        bitmap.close();
      } else {
        const preview = new Image();
        const url = URL.createObjectURL(file);
        try { preview.src = url; await preview.decode(); }
        finally { URL.revokeObjectURL(url); }
      }
    } catch { fail('unsupported_type', '图片无法解码，原材料未被替换。'); }
  } else if (replacement) {
    try {
      const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      if (text.includes('\0')) throw new Error('binary');
    } catch { fail('unsupported_type', '替换文件不是有效UTF-8文本，原材料已保留。'); }
  }
  return { file, name: file.name, mime, size: file.size, sha256: await digest(bytes) };
}
function clearPrefix(store, prefix, exceptKey) {
  const request = store.openCursor();
  request.onsuccess = () => {
    const cursor = request.result;
    if (!cursor) return;
    if (String(cursor.key).startsWith(prefix) && cursor.key !== exceptKey) cursor.delete();
    cursor.continue();
  };
}
async function execute(command) {
  let stateForError;
  try {
    if (!command || !ID_PATTERN.test(command.commandId || '') || typeof command.type !== 'string' || !Number.isInteger(command.expectedRevision)) fail('invalid_payload', '命令标识或版本不正确。');
    const preparedMaterial = ['MATERIAL_ADD', 'MATERIAL_REPLACE'].includes(command.type) ? await prepareMaterial(command.payload?.file, command.type === 'MATERIAL_REPLACE') : null;
    const normalized = copy(command.payload || {});
    if (preparedMaterial) normalized.file = { name: preparedMaterial.name, mime: preparedMaterial.mime, size: preparedMaterial.size, sha256: preparedMaterial.sha256 };
    const fingerprint = await digest(new TextEncoder().encode(stable({ type: command.type, payload: normalized })));
    const db = await openDatabase();
    const result = await new Promise((resolve) => {
      const transaction = db.transaction(STORES, 'readwrite');
      let outcome, failure, didChange = false;
      const active = transaction.objectStore('sessions').get('active');
      const abort = (error) => { failure = error; try { transaction.abort(); } catch {} };
      active.onsuccess = () => {
        try {
          const state = normalizeSessionState(active.result?.state || (emptyState ||= createEmptyState(context())));
          assertState(state);
          stateForError = state;
          if (knownSessionId && knownSessionId !== state.sessionId) fail('conflict', '会话已被另一页面更新，请先重读。');
          const key = state.sessionId + ':' + command.commandId;
          const receipt = transaction.objectStore('commands').get(key);
          receipt.onsuccess = () => {
            try {
              if (receipt.result) {
                if (receipt.result.fingerprint !== fingerprint) fail('invalid_transition', '同一操作标识不能换成另一份内容。');
                outcome = { ok: true, state: copy(state) };
                return;
              }
              const apply = (existingRound) => {
                try {
                  if (existingRound) { outcome = { ok: true, state: copy(state) }; return; }
                  if (command.expectedRevision !== state.revision) fail('conflict', '其他操作已更新资料，请重读后保留并核对你的草稿。');
                  const next = reduceCommand(state, command, { ...context(), preparedMaterial });
                  const prefix = state.sessionId + ':';
                  if (next.effects.clearSession) {
                    clearPrefix(transaction.objectStore('blobs'), prefix);
                    clearPrefix(transaction.objectStore('rounds'), prefix);
                    clearPrefix(transaction.objectStore('commands'), prefix, key);
                  }
                  for (const materialId of next.effects.deleteBlobs) transaction.objectStore('blobs').delete(prefix + materialId);
                  for (const entry of next.effects.putBlobs) transaction.objectStore('blobs').put({ key: prefix + entry.materialId, blob: entry.file });
                  if (next.changed) transaction.objectStore('sessions').put({ key: 'active', state: next.state });
                  if (next.roundLink) transaction.objectStore('rounds').put({ key: prefix + next.roundLink.feedbackId, roundId: next.roundLink.roundId });
                  const savedReceipt = transaction.objectStore('commands').put({ key, fingerprint });
                  savedReceipt.onsuccess = () => { if (takeTestFault('before_commit', command.type)) abort(Object.assign(new Error('测试：事务在提交前中止，正式记录未保存。'), { code: 'write_failed' })); };
                  didChange = next.changed;
                  outcome = { ok: true, state: copy(next.state) };
                } catch (error) { abort(error); }
              };
              if (command.type === 'ROUND_START') {
                const round = transaction.objectStore('rounds').get(state.sessionId + ':' + command.payload?.feedbackId);
                round.onsuccess = () => apply(round.result);
              } else apply(null);
            } catch (error) { abort(error); }
          };
        } catch (error) { abort(error); }
      };
      transaction.oncomplete = () => {
        if (takeTestFault('after_commit', command.type)) {
          resolve(errorResult(Object.assign(new Error('提交响应未确认：请重读或用同一操作重试，不能据此认定未保存。'), { code: 'write_failed' })));
          return;
        }
        if (outcome?.ok) {
          knownSessionId = outcome.state.sessionId;
          emptyState = null;
          if (didChange) { notify(outcome); channel?.postMessage({ revision: outcome.state.revision }); }
          resolve(outcome);
        } else resolve(errorResult(Object.assign(new Error('事务未返回有效结果。'), { code: 'write_failed' }), stateForError));
      };
      transaction.onerror = transaction.onabort = () => resolve(errorResult(failure || Object.assign(new Error('本地写入失败，事务已回滚。'), { code: 'write_failed' }), stateForError));
    });
    return result;
  } catch (error) { return errorResult(error, stateForError); }
}

export function dispatch(command) {
  const captured = copy(command);
  const next = operationQueue.then(() => execute(captured));
  operationQueue = next.catch(() => {});
  return next;
}
export async function getMaterialBlob(materialId) {
  if (!ID_PATTERN.test(materialId || '')) fail('invalid_payload', '材料标识不正确。');
  const state = await readState();
  if (!state.input.materials.some((material) => material.id === materialId)) return null;
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    let blob = null;
    const transaction = db.transaction('blobs', 'readonly');
    const request = transaction.objectStore('blobs').get(state.sessionId + ':' + materialId);
    request.onsuccess = () => { blob = request.result?.blob || null; };
    transaction.oncomplete = () => resolve(blob);
    transaction.onerror = transaction.onabort = () => reject(Object.assign(new Error('原件读取失败，请重试。'), { code: 'read_failed' }));
  });
}
