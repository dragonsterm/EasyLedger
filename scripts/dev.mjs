import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const vite = spawn(process.execPath, [
  'node_modules/vite/bin/vite.js',
  '--host', '127.0.0.1',
], { cwd: resolve(projectRoot, 'apps/web'), stdio: 'inherit', windowsHide: true });
let migration = null;
let api = null;
let stopping = false;

function children() {
  return [migration, api, vite].filter(Boolean);
}

function stop(signal = 'SIGTERM') {
  if (stopping) return;
  stopping = true;
  for (const child of children()) {
    if (child.exitCode === null && !child.killed) {
      if (process.platform === 'win32' && child.pid) {
        spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
      } else {
        child.kill(signal);
      }
    }
  }
}

function startApi() {
  if (stopping) return;
  api = spawn(process.execPath, [
    '--env-file-if-exists=.env',
    '--import', './scripts/local-development-env.mjs',
    'apps/api/server.ts',
  ], { cwd: projectRoot, stdio: 'inherit', windowsHide: true });
  api.on('error', (error) => console.error(`Could not start API: ${error.message}. Vite stays available.`));
  api.on('exit', (code) => {
    if (!stopping) console.error(`API exited${code === null ? '' : ` with status ${code}`}. Vite stays available and will show the API connection error.`);
  });
}

process.on('exit', () => {
  for (const child of children()) {
    if (child.exitCode === null && !child.killed) {
      if (process.platform === 'win32' && child.pid) spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
      else child.kill('SIGTERM');
    }
  }
});
process.on('SIGINT', () => stop('SIGINT'));
process.on('SIGTERM', () => stop('SIGTERM'));

vite.on('error', (error) => {
  console.error(`Could not start Vite: ${error.message}`);
  stop();
});
vite.on('exit', (code) => {
  if (!stopping) {
    stop();
    process.exitCode = code ?? 1;
  }
});

migration = spawn(process.execPath, [
  '--env-file-if-exists=.env',
  'scripts/migrate-db.mjs',
], { cwd: projectRoot, stdio: 'inherit', windowsHide: true });
migration.on('error', (error) => console.error(`Database migration could not start: ${error.message}. Vite stays available.`));
migration.on('exit', (code) => {
  if (stopping) return;
  if (code === 0) startApi();
  else console.error(`Database migration exited${code === null ? '' : ` with status ${code}`}. API was not started; Vite will show the database error.`);
});
