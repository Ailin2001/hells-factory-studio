// Subtitle files of each project, kept in this computer's IndexedDB so a project reopens without dropping files again.
const DB = 'hfstudio', STORE = 'files';
let dbP = null;
function open() {
  if (dbP) return dbP;
  dbP = new Promise((res, rej) => {
    if (typeof indexedDB === 'undefined') { rej(new Error('no indexedDB')); return; }
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => { const os = r.result.createObjectStore(STORE, { keyPath: ['pid', 'name'] }); os.createIndex('pid', 'pid'); };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  }).catch(e => { dbP = null; throw e; });
  return dbP;
}
const tx = async (mode, fn) => {
  const db = await open();
  return new Promise((res, rej) => {
    const t = db.transaction(STORE, mode), os = t.objectStore(STORE);
    let out; const r = fn(os); if (r) r.onsuccess = () => { out = r.result; };
    t.oncomplete = () => res(out); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error);
  });
};
export async function putFile(pid, name, kind, bytes, extra) {
  const buf = bytes instanceof ArrayBuffer ? bytes.slice(0) : new Uint8Array(bytes).buffer.slice(0);
  return tx('readwrite', os => os.put(Object.assign({ pid, name, kind, bytes: buf, at: Date.now() }, extra || {})));
}
export async function listFiles(pid) {
  return tx('readonly', os => os.index('pid').getAll(pid)).then(a => a || []);
}
export async function delProject(pid) {
  const all = await listFiles(pid);
  return tx('readwrite', os => { for (const f of all) os.delete([pid, f.name]); return null; });
}
export async function delFile(pid, name) { return tx('readwrite', os => os.delete([pid, name])); }
export async function usage() {
  try { const e = await navigator.storage.estimate(); return e; } catch (e) { return null; }
}
export async function persist() { try { if (navigator.storage && navigator.storage.persist) return await navigator.storage.persist(); } catch (e) {} return false; }
