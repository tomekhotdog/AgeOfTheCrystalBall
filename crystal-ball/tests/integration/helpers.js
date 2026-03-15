// tests/integration/helpers.js
// Utilities for spawning and managing server processes in integration tests.

import { spawn } from 'node:child_process';
import { once } from 'node:events';

/**
 * Start a Crystal Ball server (or relay) as a child process.
 * Resolves when the server prints its "running" message (ready to accept requests).
 *
 * @param {object} opts
 * @param {string} opts.script -- path to the server script (e.g. 'server/index.js')
 * @param {string[]} [opts.args] -- CLI args (e.g. ['--port', '4000'])
 * @param {object} [opts.env] -- extra env vars (merged with process.env)
 * @param {number} [opts.timeout=5000] -- ms to wait for ready signal
 * @returns {Promise<{ process: import('child_process').ChildProcess, port: number, url: string, kill: () => Promise<void> }>}
 */
export async function startServer({ script, args = [], env = {}, timeout = 5000 }) {
  const proc = spawn('node', [script, ...args], {
    cwd: new URL('../../', import.meta.url).pathname,
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stdout = '';
  let port = null;

  const ready = new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Server did not start within ${timeout}ms. stdout: ${stdout}`));
    }, timeout);

    proc.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
      // Match "Port  : NNNN" or "http://localhost:NNNN"
      const portMatch = stdout.match(/(?:Port\s*:\s*|localhost:)(\d+)/);
      if (portMatch) {
        port = parseInt(portMatch[1], 10);
        clearTimeout(timer);
        resolve();
      }
    });

    proc.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });

    proc.on('exit', (code) => {
      if (!port) {
        clearTimeout(timer);
        reject(new Error(`Server exited with code ${code} before ready. stdout: ${stdout}`));
      }
    });
  });

  await ready;

  const url = `http://localhost:${port}`;

  const kill = async () => {
    if (proc.exitCode !== null) return;
    proc.kill('SIGTERM');
    try {
      await Promise.race([
        once(proc, 'exit'),
        new Promise((_, reject) => setTimeout(() => reject(new Error('kill timeout')), 3000)),
      ]);
    } catch {
      proc.kill('SIGKILL');
    }
  };

  return { process: proc, port, url, kill };
}

/**
 * Fetch JSON from a URL with optional auth token.
 * @param {string} url
 * @param {string|null} [token]
 * @returns {Promise<{ status: number, data: any }>}
 */
export async function fetchJSON(url, token = null) {
  const headers = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(url, { headers });
  const data = res.ok ? await res.json() : null;
  return { status: res.status, data };
}

/**
 * POST JSON to a URL with optional auth token.
 * @param {string} url
 * @param {object} body
 * @param {string|null} [token]
 * @returns {Promise<{ status: number, data: any }>}
 */
export async function postJSON(url, body, token = null) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
  const data = res.headers.get('content-type')?.includes('json') ? await res.json() : null;
  return { status: res.status, data };
}
