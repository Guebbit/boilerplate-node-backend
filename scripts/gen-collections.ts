#!/usr/bin/env tsx
/**
 * Regenerate the API client collections' fragments — `npm run contracts:collections`.
 *
 * The three `contract.<tool>.*` collections are derived from `openapi.yaml`, so this writes their per-module
 * fragments and `npm run contracts:bundle` assembles them. `contracts:bundle` runs this first, so
 * the usual answer to "the collections are out of date" is to re-bundle and copy the result to the
 * paired frontend, exactly as for the contract itself.
 *
 * Run with `--check` to assert the committed fragments are what a fresh run produces instead of
 * rewriting them. That check matters more here than for a hand-written file: a generator whose
 * output nobody verifies is a second source of truth that agrees with the first only by habit.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { REPO_ROOT } from './contracts/fragments';
import {
    generateCollectionFragments,
    staleCollectionFragments
} from './contracts/generateCollections';

const fragments = generateCollectionFragments();
const stale = staleCollectionFragments(fragments);
const relative = (file: string): string => path.relative(REPO_ROOT, file);

if (process.argv.includes('--check')) {
    if (stale.length === 0) {
        console.info(`[collections] ${fragments.size} fragments match the contract.`);
        process.exit(0);
    }
    console.error(
        `[collections] STALE — these do not match what openapi.yaml generates:\n` +
            stale.map((file) => `  ${relative(file)}`).join('\n') +
            `\n  Fix with: npm run contracts:bundle` +
            `\n  Never by hand: these are generated. A request the contract cannot describe —` +
            ` an invalid body, a bogus token, a soft-deleted record — belongs in that module's` +
            ` dev/probes.yml, which this reads.`
    );
    process.exit(1);
}

for (const [file, content] of fragments) {
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, content);
}

console.info(
    stale.length === 0
        ? `[collections] ${fragments.size} fragments already matched the contract.`
        : `[collections] regenerated ${stale.length} of ${fragments.size} fragments from openapi.yaml.`
);
