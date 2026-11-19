// Desktop (Tauri) vs browser differences live here.
const desktop = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

async function saveFile(name, data) {
  const { save } = await import('@tauri-apps/plugin-dialog');
  const { writeFile } = await import('@tauri-apps/plugin-fs');
  const ext = (name.match(/\.([^.]+)$/) || [])[1];
  // automated tests set this to skip the native dialog; the write itself goes through the same permission checks
  const testDir = window.__HF_E2E_SAVE_DIR;
  const path = testDir ? testDir.replace(/[\\/]+$/, '') + (testDir.includes('\\') ? '\\' : '/') + name
    : await save({ defaultPath: name, filters: ext ? [{ name: ext.toUpperCase(), extensions: [ext] }] : [] });
  if (!path) return false;
  const bytes = data instanceof Uint8Array ? data : data instanceof Blob ? new Uint8Array(await data.arrayBuffer())
    : typeof data === 'string' ? new TextEncoder().encode(data) : new Uint8Array(data);
  await writeFile(path, bytes);
  return true;
}

window.HF_PLATFORM = { desktop, saveFile };
export default window.HF_PLATFORM;
