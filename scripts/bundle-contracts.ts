#!/usr/bin/env tsx
/**
 * Rebuild the committed documents from their fragments — `npm run contracts:bundle`.
 *
 * Every bundle stays COMMITTED: it is what spectral, orval, Prism, `jest-openapi`, the seed runner,
 * the API clients and `check-spec-identity` read, and what gets copied to the paired frontend.
 * Fragments are the source of truth; this writes the published artefacts.
 *
 * Run with `--check` in CI to assert the committed bundles are not stale instead of rewriting them
 * (`npm run check:contracts-bundle`). Name one or more bundles to narrow the run:
 *
 *   npm run contracts:bundle -- openapi asyncapi
 */

import { writeFileSync } from 'node:fs';
import path from 'node:path';
import {
    assembleBundle,
    CONTRACT_BUNDLES,
    findBundle,
    readCommittedBundle,
    REPO_ROOT,
    type IContractBundle
} from './contracts';

const args = process.argv.slice(2);
const checkOnly = args.includes('--check');
const named = args.filter((arg) => !arg.startsWith('--'));

const unknown = named.filter((name) => !findBundle(name));
if (unknown.length > 0) {
    console.error(
        `[contracts] unknown bundle(s): ${unknown.join(', ')}\n` +
            `  Known: ${CONTRACT_BUNDLES.map(({ name }) => name).join(', ')}`
    );
    process.exit(2);
}

const selected: IContractBundle[] =
    named.length > 0
        ? named.map((name) => findBundle(name) as IContractBundle)
        : [...CONTRACT_BUNDLES];

const stale = selected.filter((bundle) => assembleBundle(bundle) !== readCommittedBundle(bundle));

if (checkOnly) {
    if (stale.length === 0) {
        console.info(`[contracts] ${selected.length} bundles are up to date with their fragments.`);
        process.exit(0);
    }
    console.error(
        `[contracts] STALE — these do not match the fragments they are built from:\n` +
            stale.map((bundle) => `  ${bundle.label}`).join('\n') +
            `\n  A fragment was edited without re-bundling, or a bundle was hand-edited.\n` +
            `  Fix with: npm run contracts:bundle\n` +
            `  Every bundle is byte-identical with the paired repo — copy the result over there too.`
    );
    process.exit(1);
}

for (const bundle of stale) writeFileSync(bundle.output, assembleBundle(bundle));

console.info(
    stale.length === 0
        ? `[contracts] ${selected.length} bundles already matched their fragments; nothing written.`
        : `[contracts] rebuilt ${stale
              .map((bundle) => path.relative(REPO_ROOT, bundle.output))
              .join(', ')}.`
);
