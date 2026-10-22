// Сховище аудіозаписів у IndexedDB.
// Запис: { id, blob, mimeType, type, label, duration, createdAt }
// type — звідки запис: 'mic-test', 'twister', 'topic', 'poem' тощо.

const DB_NAME = 'slovo';
const DB_VERSION = 1;
const STORE = 'recordings';

let dbPromise = null;

function openDb() {
  if (!('indexedDB' in window)) return Promise.reject(new Error('IndexedDB недоступна в цьому браузері'));
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
        store.createIndex('createdAt', 'createdAt');
        store.createIndex('type', 'type');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      dbPromise = null;
      reject(req.error);
    };
  });
  return dbPromise;
}

// Виконує один запит у транзакції й повертає його результат після завершення транзакції.
async function run(mode, makeRequest) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = makeRequest(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(req.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export function saveRecording({ blob, type, label = '', duration = 0 }) {
  const record = { blob, mimeType: blob.type, type, label, duration, createdAt: Date.now() };
  return run('readwrite', (store) => store.add(record));
}

// Найновіші записи першими. Можна відфільтрувати за типом.
export async function listRecordings({ type } = {}) {
  const all = await run('readonly', (store) => (type ? store.index('type').getAll(type) : store.getAll()));
  return all.sort((a, b) => b.createdAt - a.createdAt);
}

export function getRecording(id) {
  return run('readonly', (store) => store.get(id));
}

export function deleteRecording(id) {
  return run('readwrite', (store) => store.delete(id));
}

export function countRecordings() {
  return run('readonly', (store) => store.count());
}

export function clearRecordings() {
  return run('readwrite', (store) => store.clear());
}
