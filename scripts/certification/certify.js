/**
 * certify.js — self-orchestrating certification (spec loop step 4/8).
 *
 * The plain `npm run certification` runner is an INDEPENDENT OBSERVER: it assumes a
 * FLOW server is already running and only makes real HTTP calls (never starts a fake
 * server, never injects answers). That's correct for CI where the server is managed
 * separately — but locally it's easy to run it against a dead server and get five
 * "fetch failed" transport errors.
 *
 * This wrapper closes that gap WITHOUT touching the observer: it boots the REAL FLOW
 * server (its normal `node src/server.js`), waits for /health/live, runs the real
 * runner against it, then shuts the server down. It changes nothing about how the
 * runner observes FLOW — it only guarantees FLOW is up first.
 *
 *   FLOW_ENV=certification npm run certification:full
 */

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const PORT = process.env.PORT || '5001';
const BASE = `http://127.0.0.1:${PORT}`;

function log(...a) { console.log('[certify]', ...a); }

async function waitForHealth(timeoutMs = 45000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await fetch(`${BASE}/health/live`, { signal: AbortSignal.timeout(2000) });
      if (r.ok) return true;
    } catch { /* not up yet */ }
    await new Promise((res) => setTimeout(res, 1000));
  }
  return false;
}

async function main() {
  log(`booting real FLOW server on :${PORT} (FLOW_ENV=${process.env.FLOW_ENV || 'certification'})`);
  const server = spawn('node', ['src/server.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT, FLOW_ENV: process.env.FLOW_ENV || 'certification' },
    stdio: ['ignore', 'ignore', 'inherit'], // surface server errors only
  });

  let serverExited = false;
  server.on('exit', (code) => { serverExited = true; if (code) log(`server exited early (code ${code})`); });

  const healthy = await waitForHealth();
  if (!healthy || serverExited) {
    log('❌ server did not become healthy — aborting');
    try { server.kill('SIGKILL'); } catch {}
    process.exit(3);
  }
  log('✓ server healthy — running the real certification runner\n');

  const runner = spawn('node', ['scripts/certification/runner.js'], {
    cwd: ROOT,
    env: { ...process.env, FLOW_API_URL: BASE },
    stdio: 'inherit',
  });

  const code = await new Promise((res) => runner.on('exit', res));
  log(`\nrunner exited with code ${code} — stopping server`);
  try { server.kill('SIGTERM'); } catch {}
  // give it a beat to drain, then hard-kill if needed
  await new Promise((r) => setTimeout(r, 1500));
  try { server.kill('SIGKILL'); } catch {}
  process.exit(code ?? 0);
}

main().catch((e) => { console.error('[certify] fatal:', e.message); process.exit(1); });
