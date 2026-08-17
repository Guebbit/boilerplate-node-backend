#!/usr/bin/env tsx
/**
 * Rebuild every generated artifact this repo commits — `npm run regenerate`.
 *
 * Run it after changing anything a generator reads: a module's `openapi.yaml` or `asyncapi.yaml`,
 * a `seeds.ts` fixture, a `probes.ts`, an `analytics.ts`. Then commit; the pre-commit gate
 * (`npm run complete`) only VERIFIES these are current, it never writes them, so a gate failure
 * saying "STALE" means this was not run.
 *
 * ── WHY THIS IS A SCRIPT AND NOT A CHAIN OF `&&` ────────────────────────────────────────────────
 * The order is not obvious and one step appears twice. Both facts need somewhere to live:
 *
 *   openapi.yaml ──► api/ ──► dataset.json ──► the four client collections
 *
 * `api/` is generated from the contract; the seed export runs the real application to produce
 * `dataset.json`, and the models import `@api/schemas.zod`, so it needs `api/` to exist first; and
 * `scripts/contracts/generateCollections.ts` imports `dataset.json` to fill in example request
 * bodies. Bundling once at the start therefore builds the collections against the PREVIOUS
 * dataset. Hence the second bundle at step 5 — a no-op when the dataset did not change, and the
 * difference between a clean gate and a confusing one when it did.
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { resolveFrontendPath, DEFAULT_FRONTEND_PATH } from './frontendPath';

const REPO_ROOT = path.resolve(__dirname, '..');

/** `--no-sync` regenerates without touching the paired repo. */
const skipSync = process.argv.includes('--no-sync');

interface Step {
    /** The npm script to run. */
    script: string;
    /** What it produces, and why it sits where it does. One line, shown as the run proceeds. */
    because: string;
}

/**
 * The chain, in the only order that works. See the header for the dependency it encodes.
 */
const STEPS: readonly Step[] = [
    {
        script: 'contracts:bundle',
        because: 'openapi.yaml, asyncapi.yaml and the analytics names, from the per-module sources'
    },
    {
        script: 'gen:api',
        because: 'api/ — the typed client and zod schemas the app itself imports, from openapi.yaml'
    },
    {
        script: 'gen:asyncapi',
        because: 'src/types/asyncapi.generated.ts, from asyncapi.yaml'
    },
    {
        script: 'seed:export',
        because:
            'db/seeds/dataset.json — seeds a throwaway database and reads it back through the real serializers (needs api/)'
    },
    {
        script: 'contracts:bundle',
        because:
            'the client collections again, now that dataset.json is current — a no-op if it did not change'
    }
];

/**
 * Run one npm script, inheriting stdio so its own output is the progress report.
 *
 * @param script - the npm script name
 */
const run = (script: string): void => {
    execFileSync('npm', ['run', script], { cwd: REPO_ROOT, stdio: 'inherit' });
};

for (const [index, step] of STEPS.entries()) {
    console.info(`\n[regenerate] ${index + 1}/${STEPS.length + 1}  ${step.script}`);
    console.info(`             ${step.because}`);
    run(step.script);
}

/*
 * The paired repo, last, because it can only be handed files this run has already rebuilt.
 *
 * Skipped rather than fatal when the sibling is not on disk — a solo clone has to be able to
 * regenerate, which is the same reason `check:spec-identity` skips instead of failing. `npm run
 * sync:frontend` on its own still fails loudly, so nothing is lost by being lenient here.
 */
console.info(`\n[regenerate] ${STEPS.length + 1}/${STEPS.length + 1}  sync:frontend`);

if (skipSync) {
    console.info('             skipped (--no-sync)');
} else if (existsSync(resolveFrontendPath())) {
    console.info('             hand the backend-owned files to the paired frontend');
    run('sync:frontend');
} else {
    console.info(
        `             skipped — no checkout at ${resolveFrontendPath()}\n` +
            `             (expected at ${DEFAULT_FRONTEND_PATH}, or set FRONTEND_PATH in .env)`
    );
}

console.info(
    '\n[regenerate] Done. `npm run complete` verifies the result; over in the frontend, ' +
        '`npm run regenerate` rebuilds its client from the specs this just handed over.'
);
