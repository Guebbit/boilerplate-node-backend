#!/usr/bin/env tsx
/**
 * `npm run scaffold:module -- <name> [options]`: a working module from the feedback-shaped
 * template. Writes the folder, the docs page and the registry lines, then runs
 * `regenerate --no-sync` so the generated types exist for the first compile.
 *
 * What it will not decide, and prints instead: personal data, frontend pairing, rate limits, which
 * roles hold the new permission keys. See docs/tools/module-scaffolder.md.
 */

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { applyScaffold } from './apply';
import { formatWithRepoConfig } from './format-text';
import { isRefusal, parseArguments, USAGE } from './options';

/** Repo root, two levels up from `scripts/scaffold/`. */
const REPO_ROOT = path.resolve(__dirname, '..', '..');

/** The decisions the scaffolder cannot make for the author, printed after a successful run. */
const OPEN_DECISIONS = [
    'personalData is "none": change it if a record names a person (module.ts).',
    'Roles: only admin holds the new keys; grant them in shared/authorization-roles.yaml.',
    'Rate limits: none declared; add a budget for any public or expensive route.',
    'Frontend: no counterpart is generated; declare module.yaml#frontend if the name differs.',
    'Fill in the TODOs in module.yaml, module.ts and docs/modules/<name>.md.'
];

/**
 * Run the scaffolder against this checkout.
 * @param argv - the arguments after `--`
 * @returns the process exit code
 */
const main = async (argv: readonly string[]): Promise<number> => {
    const options = parseArguments(argv);
    if (isRefusal(options)) {
        console.error(`${options.error}\n\n${USAGE}`);
        return 1;
    }

    const plan = await applyScaffold(REPO_ROOT, options, formatWithRepoConfig).catch(
        (error: unknown) => {
            console.error(`[scaffold] refused:\n${error instanceof Error ? error.message : ''}`);
            return undefined;
        }
    );
    if (!plan) return 1;

    console.info(`[scaffold] wrote ${plan.files.length} files and registered ${plan.names.kebab}.`);

    if (options.regenerate) {
        // Bundles the new fragment and generates the client and Zod schemas the module imports.
        const regenerate = spawnSync('npm', ['run', 'regenerate', '--', '--no-sync'], {
            cwd: REPO_ROOT,
            stdio: 'inherit'
        });
        if (regenerate.status !== 0) return regenerate.status ?? 1;
    }

    console.info('\n[scaffold] decisions left to you:');
    for (const line of OPEN_DECISIONS) console.info(`  - ${line}`);
    return 0;
};

main(process.argv.slice(2)).then(
    (code) => {
        process.exitCode = code;
    },
    (error: unknown) => {
        console.error(error);
        process.exitCode = 1;
    }
);
