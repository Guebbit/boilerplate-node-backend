#!/usr/bin/env tsx
/**
 * Rebuild every generated artifact — `npm run regenerate`. Most of what it writes is gitignored
 * (`api/`, `src/types/asyncapi.generated.ts`, `openapi.yaml`); the two AsyncAPI bundles and the
 * docs pages the doc steps rewrite are the committed exceptions. `--check` verifies instead of
 * writing — the first half of `npm run check`.
 *
 * Run it after changing anything a generator reads: a module's `openapi.yaml` or `asyncapi.yaml`,
 * `shared/contracts/asyncapi.workers.yaml`, a `probes.ts`.
 * Usually you will not have to remember — `.husky/pre-commit` runs it with `--no-sync` and stages
 * what it produced, so `npm run check` only ever VERIFIES.
 *
 * A script rather than a chain of `&&` because the order is not obvious and needs somewhere to
 * live:
 *
 *   openapi.yaml ──► api/
 *
 * `api/` has to exist before anything importing a module's code can run — the app's own models
 * import `@api/schemas.zod`. The client collections read `scenarios/subjects.ts` instead of a
 * generated dataset, are not committed, and so are not a step here either.
 *
 * See: docs/api/regenerating.md
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolveFrontendPath, DEFAULT_FRONTEND_PATH } from './pairing/paired-frontend-path';
import { REPO_ROOT } from './modules-on-disk';
import { hasFlag } from './cli';

/** `--no-sync` regenerates without touching the paired repo. */
const skipSync = hasFlag('no-sync');

/** `--check` verifies instead: every step that can, run with `--check`; nothing written. */
const checkOnly = process.argv.includes('--check');

/** One entry in the {@link STEPS} chain. */
interface Step {
    /** The step's name in the progress report. */
    name: string;
    /** The command and its arguments; `tsx` and the npm scripts resolve from `node_modules/.bin`. */
    command: readonly [string, ...string[]];
    /** Whether the command takes `--check`, and so runs under {@link checkOnly}. */
    checks: boolean;
    /** What it produces, and why it sits where it does. One line, shown as the run proceeds. */
    because: string;
}

/**
 * The chain, in the only order that works. See the header for the dependency it encodes.
 */
const STEPS: readonly Step[] = [
    {
        name: 'scenario registries',
        command: ['tsx', 'scripts/docs/generate-scenario-registries.ts'],
        checks: true,
        because:
            'the scenario, fixture and doubles registries (scenarios/*.generated.ts), from the scenario files on disk — first, since a strip leaves them naming deleted files and everything below that boots the app imports them'
    },
    {
        name: 'authorization bundle',
        command: ['tsx', 'scripts/contracts/authorization-bundle.ts'],
        checks: true,
        because:
            'shared/authorization-keys.yaml, from one fragment per module — read by kernel/permissions.ts at boot, so this runs before anything below that boots the app to read docs off it'
    },
    {
        name: 'gen:permission-actions',
        command: ['npm', 'run', 'gen:permission-actions'],
        checks: false,
        because:
            'api/permission-actions.ts, from shared/authorization-keys.yaml — kernel/permissions.ts imports it, and the bundler below loads the kernel, so it must exist before the first bundle on a clean checkout'
    },
    {
        name: 'contracts:bundle',
        command: ['tsx', 'scripts/contracts/build-bundles.ts'],
        checks: true,
        because: 'openapi.yaml and the two asyncapi bundles, from the per-module sources'
    },
    {
        name: 'gen:api',
        command: ['npm', 'run', 'gen:api'],
        checks: false,
        because:
            'api/ — the typed client, zod schemas and error codes from openapi.yaml, and the permission actions from shared/authorization-keys.yaml; the app itself imports them'
    },
    {
        name: 'gen:asyncapi',
        command: ['npm', 'run', 'gen:asyncapi'],
        checks: false,
        because: 'src/types/asyncapi.generated.ts, from the full asyncapi.yaml'
    },
    {
        name: 'module graph',
        command: ['tsx', 'scripts/docs/generate-module-graph.ts'],
        checks: true,
        because:
            "docs/modules/index.md's module graph, read off the real imports by dependency-cruiser"
    },
    {
        name: 'role matrix',
        command: ['tsx', 'scripts/docs/generate-role-matrix.ts'],
        checks: true,
        because:
            "docs/demo-ecommerce/index.md's role tables, asked of the permission evaluator rather than restated"
    },
    {
        name: 'dependency map',
        command: ['tsx', 'scripts/docs/generate-dependency-map.ts'],
        checks: true,
        because:
            "docs/tools/package-dependencies.md's tables, read off package.json and who actually imports each package"
    },
    {
        name: 'rate-limit budgets',
        command: ['tsx', 'scripts/docs/generate-rate-limit-budgets.ts'],
        checks: true,
        because:
            "docs/tools/security.md's rate-limit budget table, read off every module's own manifest"
    },
    {
        name: 'scheduled jobs',
        command: ['tsx', 'scripts/docs/generate-jobs.ts'],
        checks: true,
        because:
            "docker/crontab and the jobs table in docs/reference/ops.md, from every module's declared jobs"
    },
    {
        name: 'audit actions',
        command: ['tsx', 'scripts/docs/generate-audit-actions.ts'],
        checks: true,
        because:
            "docs/tools/winston.md's audit action table, read off every module's audit.ts and its call sites' target types"
    },
    {
        name: 'Dockerfile dockerignore',
        command: ['tsx', 'scripts/docker/generate-dockerfile-dockerignore.ts'],
        checks: true,
        because: 'docker/Dockerfile.dockerignore, from the root .dockerignore (.git kept IN)'
    }
];

/**
 * Run one command, inheriting stdio so its own output is the progress report.
 *
 * @param command - the executable and its arguments
 */
const run = ([file, ...arguments_]: readonly [string, ...string[]]): void => {
    execFileSync(file, arguments_, { cwd: REPO_ROOT, stdio: 'inherit' });
};

/** The steps this run takes: all of them, or under `--check` the ones that can verify. */
const steps = checkOnly ? STEPS.filter((step) => step.checks) : STEPS;

// Run every step in order, announcing each with the reason it exists.
for (const [index, step] of steps.entries()) {
    console.info(`\n[regenerate] ${index + 1}/${steps.length + 1}  ${step.name}`);
    console.info(`             ${step.because}`);
    run(checkOnly ? [...step.command, '--check'] : step.command);
}

/**
 * The paired repo, last, because it can only be handed files this run has already rebuilt.
 *
 * Skipped rather than fatal when the sibling is not on disk — a solo clone has to be able to
 * regenerate, which is the same reason the spec-identity check skips instead of failing. `npm run
 * sync:frontend` on its own still fails loudly, so nothing is lost by being lenient here.
 */
const handOver = (): void => {
    console.info(`\n[regenerate] ${steps.length + 1}/${steps.length + 1}  sync:frontend`);
    if (skipSync) {
        console.info('             skipped (--no-sync)');
    } else if (existsSync(resolveFrontendPath())) {
        console.info('             hand the backend-owned files to the paired frontend');
        run(['npm', 'run', 'sync:frontend']);
    } else {
        console.info(
            `             skipped — no checkout at ${resolveFrontendPath()}\n` +
                `             (expected at ${DEFAULT_FRONTEND_PATH}, or set FRONTEND_PATH in .env)`
        );
    }
    // The closing line, worded for whether the frontend was touched.
    console.info(
        skipSync
            ? '\n[regenerate] Done. `npm run check` verifies the result. Nothing was handed to the ' +
                  'paired frontend — run `npm run regenerate` without --no-sync when you mean to.'
            : '\n[regenerate] Done. `npm run check` verifies the result; over in the frontend, ' +
                  '`npm run regenerate` rebuilds its client from the specs this just handed over.'
    );
};

// A verification run writes nothing, so it has nothing to hand over.
if (checkOnly) console.info('\n[regenerate] Done. Every checked artifact matches its sources.');
else handOver();
