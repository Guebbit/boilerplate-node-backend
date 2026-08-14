#!/usr/bin/env tsx
/**
 * Runs Stryker — `npm run test:mutation`.
 *
 * A wrapper rather than a bare `stryker run`, for three jobs a JSON config cannot do. The frontend
 * mirrors it at `scripts/mutation.ts`; the two differ only in the scratch they clean.
 *
 * ── 1. MACHINE SETTINGS COME FROM `.env` ─────────────────────────────────────────────────────────
 * `concurrency` and the per-worker heap are properties of the MACHINE, not of the project, and
 * `stryker.config.json` is committed and shared. Both are read here from `.env` — via Node's own
 * `process.loadEnvFile()`, since npm scripts do not otherwise see it — so a laptop and a 16-core
 * desktop can disagree without either editing a tracked file.
 *
 * An explicit CLI flag always wins over the environment. That is what keeps
 * `.github/workflows/mutation.yml`'s `--concurrency 3` authoritative on a runner that has no `.env`
 * at all.
 *
 * ── 2. THE SCRATCH ROOT IS CLEARED BEFORE THE RUN, NOT ONLY AFTER ────────────────────────────────
 * `tests/support/global-setup.ts` gives each jest instance a data directory and deletes it on the
 * way out. A killed instance never reaches that, and Stryker kills instances as a matter of course.
 * A process cannot clean up after being killed, so the next start has to — which is this, and it is
 * the step `global-setup.ts` has always described.
 *
 * The root is also pinned OUTSIDE the sandbox. Left to `__dirname` it resolves inside
 * `.stryker-tmp/sandbox-XXXX/`, where neither this sweep nor the documented `rm -rf .tmp` recovery
 * would ever look.
 *
 * ── 3. THE OOM LOOP FAILS FAST ───────────────────────────────────────────────────────────────────
 * A run that thrashes does not announce itself: it looks like a slow run, and the ETA it prints
 * grows rather than shrinks. One measured 36 hours remaining after 90 minutes at 3%. Watching for
 * repeated `ran out of memory` and stopping is the difference between losing three minutes and
 * losing an afternoon.
 *
 * See docs/tools/mutation-testing.md#when-a-run-never-finishes--the-oomstrand-loop.
 */
import { spawn } from 'node:child_process';
import { rm } from 'node:fs/promises';
import path from 'node:path';

const REPO_ROOT = path.resolve(__dirname, '..');

/** Where jest's in-memory Mongo data directories live. Outside the sandbox, deliberately. */
const TEST_TMP_BASE = path.join(REPO_ROOT, '.tmp');

/**
 * How many restarts, inside how long, count as the loop rather than bad luck.
 *
 * A single restart is survivable — a genuinely heavy suite can trip the ceiling once. Six inside
 * ten minutes is not a heavy suite, it is a run that will not converge.
 */
const OOM_LIMIT = 6;
const OOM_WINDOW_MS = 10 * 60 * 1000;

try {
    process.loadEnvFile();
} catch {
    /* no .env in this checkout — CI is the normal case */
}

const passthrough = process.argv.slice(2);
const wasPassed = (flag: string) => passthrough.some((argument) => argument.startsWith(flag));

/** A positive integer from the environment, or undefined when unset, empty or nonsense. */
const positiveInteger = (value: string | undefined): number | undefined => {
    const parsed = Number(value?.trim());
    return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
};

const concurrency = positiveInteger(process.env.STRYKER_CONCURRENCY);
const heapMb = positiveInteger(process.env.STRYKER_WORKER_HEAP_MB);

const strykerArguments = [
    'run',
    ...(concurrency && !wasPassed('--concurrency') ? ['--concurrency', String(concurrency)] : []),
    ...passthrough
];

/**
 * `--max-old-space-size` is containment, not a cure: it decides how quickly a leak announces itself
 * rather than whether one exists. Left unset, Node derives its own limit from total system RAM, so
 * the same code gets a longer runway on a bigger machine — which is how a leak stays invisible on
 * the box most able to survive it.
 */
const childEnvironment = {
    ...process.env,
    NODE_TEST_TMP_BASE: TEST_TMP_BASE,
    ...(heapMb
        ? {
              NODE_OPTIONS:
                  `${process.env.NODE_OPTIONS ?? ''} --max-old-space-size=${heapMb}`.trim()
          }
        : {})
};

const main = async () => {
    await rm(TEST_TMP_BASE, { recursive: true, force: true });

    console.log(
        `[mutation] concurrency=${concurrency ?? 'stryker.config.json'} ` +
            `heap=${heapMb ? `${heapMb} MB` : 'node default (derived from total RAM)'} ` +
            `scratch=${TEST_TMP_BASE}`
    );

    const startedAt = Date.now();
    let oomRestarts = 0;
    let abortedForOom = false;

    const stryker = spawn('npx', ['stryker', ...strykerArguments], {
        cwd: REPO_ROOT,
        env: childEnvironment,
        // `pipe` on stdout so the OOM line can be counted; every chunk is forwarded unchanged, so
        // the progress bar and the report still reach the terminal as they would unwrapped.
        stdio: ['inherit', 'pipe', 'inherit']
    });

    stryker.stdout.on('data', (chunk: Buffer) => {
        process.stdout.write(chunk);
        if (abortedForOom) return;

        oomRestarts += chunk.toString().split('ran out of memory').length - 1;
        if (oomRestarts < OOM_LIMIT || Date.now() - startedAt > OOM_WINDOW_MS) return;

        abortedForOom = true;
        console.error(
            `\n[mutation] STOPPING: ${oomRestarts} worker restarts in the first ` +
                `${Math.round((Date.now() - startedAt) / 60_000)} minutes.\n\n` +
                `  This is the OOM/strand loop, not a slow run. Every restart discards that\n` +
                `  worker's in-progress mutants, so the run cannot converge — the remaining-time\n` +
                `  estimate will climb rather than fall if it is left alone.\n\n` +
                `  What to read: docs/tools/mutation-testing.md, "When a run never finishes".\n` +
                `  What it usually is: a transform that caches per-file state across mutants.\n` +
                `  What to check first: that stryker.config.json still points its jest runner at\n` +
                `  jest.config.mutation.js, which uses swc precisely so nothing is cached.\n`
        );
        stryker.kill('SIGTERM');
    });

    stryker.on('exit', (code) => {
        process.exit(abortedForOom ? 1 : (code ?? 1));
    });
};

void main();
