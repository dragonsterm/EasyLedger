const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const root = path.resolve(__dirname, '..');
let timer, busy = false, pending = false;
function sync() {
  if (busy) { pending = true; return; }
  busy = true;
  const child = spawn(process.execPath, [path.join(__dirname, 'sync-docs.cjs')], { cwd: root, stdio: 'inherit' });
  child.on('error', error => console.error(error.message));
  child.on('close', code => { busy = false; if (code) console.error('Sync failed; fix the note and save again.'); if (pending) { pending = false; sync(); } });
}
function schedule() { clearTimeout(timer); timer = setTimeout(sync, 600); }
fs.watch(path.join(root, 'docs'), (_, name) => { if (name && /^\d{2}-.+\.md$/.test(name)) schedule(); });
fs.watch(root, (_, name) => { if (['AGENTS.md', 'package.json', 'package-lock.json'].includes(name)) schedule(); });
fs.watch(__dirname, (_, name) => { if (name?.endsWith('.cjs')) schedule(); });
console.log('Watching canonical notes and tooling. Ctrl+C stops; no cloud sync.');
sync();
