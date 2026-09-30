#!/usr/bin/env tsx
/**
 * `npm run measure:scaffold`: does a freshly scaffolded module pass the repo's own gate?
 *
 * Copies the checkout to a scratch directory, runs `scaffold:module` there, then runs what a
 * developer would run next and reports each result. Report-only: it takes minutes, so it is not in
 * the commit gate. Run it after changing anything under `scripts/scaffold/`, or a shared file the
 * scaffolder edits (the roles YAML, the conformance fixture, the parity canary).
 *
 * The unit tests under `tests/unit/scripts/scaffold/` cover the pure half. This covers what only a
 * whole checkout can: the generated code compiles and lints, its own tests pass, no cross-cutting
 * rule objects, and the docs build. See docs/tools/module-scaffolder.md.
 */

import os from 'node:os';
import path from 'node:path';
import { assembleScratchCopy, runIn } from './scratch-copy';

/** Repo root, two levels up from `scripts/testing/`. */
const REPO_ROOT = path.resolve(__dirname, '..', '..');

/** Under the OS temp directory: `fs.cpSync` refuses a destination inside its own source. */
const SCRATCH = path.join(os.tmpdir(), 'scaffold-measure');

/** The module scaffolded in the copy: a hyphenated plural exercises every casing. */
const PROBE = 'measure-probes';

/** A second module with the other switches, so the `--no-audit` templates compile too. */
const QUIET = 'quiet-things';

/** Both scaffolded folders, for the checks that name paths. */
const FOLDERS = [PROBE, QUIET].map((name) => `src/modules/${name}`);

/** One command run against the scratch tree. */
interface Check {
    label: string;
    command: string;
    args: readonly string[];
    /** True when a NON-zero exit is the passing answer (the idempotent refusal). */
    expectFailure?: boolean;
}

/** The scaffold itself, then the checks a developer runs next, then the refusal on a repeat. */
const CHECKS: readonly Check[] = [
    {
        label: 'scaffold:module',
        command: 'npx',
        args: ['tsx', 'scripts/scaffold/scaffold-module.ts', PROBE]
    },
    {
        label: 'scaffold:module --no-audit --group shop',
        command: 'npx',
        args: [
            'tsx',
            'scripts/scaffold/scaffold-module.ts',
            QUIET,
            '--no-audit',
            '--group',
            'shop',
            '--entity',
            'QuietThing'
        ]
    },
    { label: 'ts-check', command: 'npm', args: ['run', 'ts-check'] },
    {
        label: 'lint (module, scripts, tests)',
        command: 'npx',
        args: ['eslint', '--max-warnings', '0', ...FOLDERS, 'src/modules.ts', 'tests/cross-cutting']
    },
    {
        label: 'prettier',
        command: 'npx',
        args: [
            'prettier',
            '--check',
            ...FOLDERS,
            `docs/modules/${PROBE}.md`,
            `docs/modules/${QUIET}.md`,
            'src/modules.ts'
        ]
    },
    { label: "the modules' own tests", command: 'npx', args: ['jest', ...FOLDERS] },
    { label: 'check:docs-graph', command: 'npm', args: ['run', 'check:docs-graph'] },
    { label: 'test:cross-cutting', command: 'npm', args: ['run', 'test:cross-cutting'] },
    { label: 'docs:build', command: 'npm', args: ['run', 'docs:build'] },
    {
        label: 'a second scaffold is refused',
        command: 'npx',
        args: ['tsx', 'scripts/scaffold/scaffold-module.ts', PROBE, '--no-regenerate'],
        expectFailure: true
    }
];

/**
 * Run one check.
 * @param check - what to run
 * @returns whether it gave the answer it should
 */
const run = (check: Check): boolean => {
    console.info(`\n[scaffold-measure] ${check.label}`);
    return runIn(SCRATCH, check.command, check.args) !== (check.expectFailure ?? false);
};

assembleScratchCopy(REPO_ROOT, SCRATCH);
const results = CHECKS.map((check) => ({ check, passed: run(check) }));

console.info('\n[scaffold-measure] summary — report-only, not a merge gate:');
for (const { check, passed } of results)
    console.info(`  ${passed ? 'PASS' : 'FAIL'}  ${check.label}`);

const allPassed = results.every((result) => result.passed);
console.info(
    allPassed
        ? '\n[scaffold-measure] a scaffolded module passes the gate untouched.'
        : '\n[scaffold-measure] see the failing command(s) above.'
);
process.exitCode = allPassed ? 0 : 1;
