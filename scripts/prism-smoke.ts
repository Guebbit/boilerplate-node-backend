#!/usr/bin/env tsx
/**
 * Boot Prism against `openapi.yaml` and prove it answers — `npm run test:prism`.
 *
 * A smoke test of the CONTRACT, not of the app: Prism serves the spec's own examples, so a green
 * run means the document is complete enough to mock. Outside the pre-commit gate because it binds
 * a real port, and it owns the process it starts so a failed curl cannot leave one running.
 *
 * See: docs/tools/contract-testing.md
 */

import { spawn } from 'node:child_process';
import path from 'node:path';

const REPO_ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.PRISM_PORT ?? 4010);
const PROBE = process.env.PRISM_PROBE ?? '/products';
const BOOT_TIMEOUT_MS = 30_000;

const prism = spawn(
    'prism',
    ['mock', 'openapi.yaml', '--errors', '--port', String(PORT)],
    // `pipe` rather than `inherit`: the output is only interesting when something fails, and the
    // readiness check below needs somewhere to fail loudly into.
    { cwd: REPO_ROOT, stdio: ['ignore', 'pipe', 'pipe'] }
);

let output = '';
prism.stdout.on('data', (chunk: Buffer) => (output += chunk.toString()));
prism.stderr.on('data', (chunk: Buffer) => (output += chunk.toString()));

/** Always take the server down with us — including on ^C and on an unexpected throw. */
const stop = (): void => {
    if (prism.exitCode === null) prism.kill('SIGTERM');
};
process.on('exit', stop);
process.on('SIGINT', () => process.exit(130));

const finish = (code: number, message: string): never => {
    stop();
    console[code === 0 ? 'info' : 'error'](message);
    if (code !== 0 && output.trim().length > 0)
        console.error(`\n[prism] server output:\n${output}`);
    process.exit(code);
};

prism.on('error', (error) =>
    finish(1, `[prism] could not start: ${error.message}\n  Is @stoplight/prism-cli installed?`)
);
prism.on('exit', (code) => {
    if (code !== 0) finish(1, `[prism] server exited early with code ${code}.`);
});

/** Poll until the mock answers rather than sleeping a guessed number of seconds. */
const waitForBoot = async (): Promise<void> => {
    const deadline = Date.now() + BOOT_TIMEOUT_MS;
    for (;;) {
        try {
            await fetch(`http://127.0.0.1:${PORT}${PROBE}`);
            return;
        } catch {
            if (Date.now() > deadline)
                finish(1, `[prism] did not accept connections on :${PORT} within 30s.`);
            await new Promise((resolve) => setTimeout(resolve, 250));
        }
    }
};

// Wrapped rather than top-level: this package is CommonJS, where esbuild rejects a top-level await.
const main = async (): Promise<void> => {
    await waitForBoot();

    const response = await fetch(`http://127.0.0.1:${PORT}${PROBE}`);

    if (!response.ok) finish(1, `[prism] GET ${PROBE} answered ${response.status}, expected 2xx.`);

    finish(0, `[prism] GET ${PROBE} answered ${response.status} from the spec's own examples.`);
};

void main();
