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

/** The repo root — prism is spawned from here so it resolves `openapi.yaml`. */
const REPO_ROOT = path.resolve(__dirname, '..', '..');

/** Where the mock server listens. Overridable so a busy port doesn't fail the gate. */
const PORT = Number(process.env.PRISM_PORT ?? 4010);

/** The one route the smoke test asks for — any 2xx proves prism parsed the spec and served it. */
const PROBE = process.env.PRISM_PROBE ?? '/products';

/** How long prism gets to become answerable before the run is called a failure. */
const BOOT_TIMEOUT_MS = 30_000;

/**
 * The Prism mock server child process (`spawn` is Node's `child_process.spawn`). `prism mock`
 * serves `openapi.yaml` with generated answers; `--errors` makes it refuse requests that break
 * the spec instead of answering anyway; `--port` is where it listens.
 * https://github.com/stoplightio/prism
 */
const prism = spawn(
    'prism',
    ['mock', 'openapi.yaml', '--errors', '--port', String(PORT)],
    // `pipe` rather than `inherit`: the output is only interesting when something fails, and the
    // readiness check below needs somewhere to fail loudly into.
    { cwd: REPO_ROOT, stdio: ['ignore', 'pipe', 'pipe'] }
);

/** Everything prism printed, kept to show only if the run fails. */
let output = '';

// Collect both streams into {@link output}.
prism.stdout.on('data', (chunk: Buffer) => (output += chunk.toString()));
prism.stderr.on('data', (chunk: Buffer) => (output += chunk.toString()));

/** Always take the server down with us — including on ^C and on an unexpected throw. */
const stop = (): void => {
    if (prism.exitCode === null) prism.kill('SIGTERM');
};
// Stop prism however this process ends.
process.on('exit', stop);

// 130 = 128 + SIGINT: the shell convention for "killed by ^C"; the `exit` hook above still runs.
process.on('SIGINT', () => process.exit(130));

/**
 * End the run: stop prism, print the outcome (with prism's own output on failure), and exit.
 *
 * @param code - the process exit code
 * @param message - the one-line outcome
 */
const finish = (code: number, message: string): never => {
    stop();
    console[code === 0 ? 'info' : 'error'](message);
    if (code !== 0 && output.trim().length > 0)
        console.error(`\n[prism] server output:\n${output}`);
    process.exit(code);
};

// A spawn failure (the binary is missing) is a failed run.
prism.on('error', (error) =>
    finish(1, `[prism] could not start: ${error.message}\n  Is @stoplight/prism-cli installed?`)
);
// Prism exiting by itself before the probe answered is a failed run.
prism.on('exit', (code) => {
    if (code !== 0) finish(1, `[prism] server exited early with code ${code}.`);
});

/**
 * Poll until the mock answers rather than sleeping a guessed number of seconds.
 *
 * The first answer IS the smoke test's answer, so it is returned rather than discarded: probing
 * twice would ask the mock the same question again for nothing.
 */
const waitForBoot = async (): Promise<Response> => {
    const deadline = Date.now() + BOOT_TIMEOUT_MS;
    for (;;) {
        try {
            return await fetch(`http://127.0.0.1:${PORT}${PROBE}`);
        } catch {
            if (Date.now() > deadline)
                finish(1, `[prism] did not accept connections on :${PORT} within 30s.`);
            await new Promise((resolve) => setTimeout(resolve, 250));
        }
    }
};

// Wrapped rather than top-level: this package is CommonJS, where esbuild rejects a top-level await.
const main = async (): Promise<void> => {
    const response = await waitForBoot();

    if (!response.ok) finish(1, `[prism] GET ${PROBE} answered ${response.status}, expected 2xx.`);

    finish(0, `[prism] GET ${PROBE} answered ${response.status} from the spec's own examples.`);
};

// Entry point.
void main();
