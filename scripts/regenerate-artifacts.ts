#!/usr/bin/env tsx
/**
 * Rebuild every generated artifact this repo commits — `npm run regenerate`.
 *
 * Run it after changing anything a generator reads: a module's `openapi.yaml` or `asyncapi.yaml`,
 * `shared/contracts/asyncapi.workers.yaml`, a `demo.ts` fixture, a `probes.ts`, an `analytics.ts`.
 * Usually you will not have to remember — `.husky/pre-commit` runs it with `--no-sync` and stages
 * what it produced, so `npm run complete` only ever VERIFIES.
 *
 * A script rather than a chain of `&&` because the order is not obvious and needs somewhere to
 * live:
 *
 *   openapi.yaml ──► api/ ──► demo-data.json
 *
 * The seed export runs the real application, whose models import `@api/schemas.zod`, so `api/` has
 * to exist first. The client collections read `demo-data.json` too but are not committed, so they
 * are not a step here.
 *
 * See: docs/api/regenerating.md
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { resolveFrontendPath, DEFAULT_FRONTEND_PATH } from './paired-frontend-path';

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
        because:
            'openapi.yaml, the two asyncapi bundles and the analytics names, from the per-module sources'
    },
    {
        script: 'gen:api',
        because: 'api/ — the typed client and zod schemas the app itself imports, from openapi.yaml'
    },
    {
        script: 'gen:asyncapi',
        because: 'src/types/asyncapi.generated.ts, from the full asyncapi.yaml'
    },
    {
        script: 'docs:graph',
        because:
            "docs/modules/index.md's module graph, read off the real imports by dependency-cruiser"
    },
    {
        script: 'seed:export',
        because:
            'db/demo/demo-data.json — seeds a throwaway database and reads it back through the real serializers (needs api/)'
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
    skipSync
        ? '\n[regenerate] Done. `npm run complete` verifies the result. Nothing was handed to the ' +
              'paired frontend — run `npm run regenerate` without --no-sync when you mean to.'
        : '\n[regenerate] Done. `npm run complete` verifies the result; over in the frontend, ' +
              '`npm run regenerate` rebuilds its client from the specs this just handed over.'
);
