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
 *
 * ## Why a full run is two phases
 *
 * The four client collections are GENERATED from `openapi.yaml`, so they cannot be produced until
 * the contract itself has been bundled:
 *
 *   1. assemble the authored documents   fragments      -> openapi.yaml, asyncapi.yaml, …
 *   2. generate the collections          openapi.yaml   -> contract.<tool>.<ext>
 *
 * That ordering lives here rather than in package.json, where it would be three commands joined by
 * `&&` — wrong in a way nothing catches, because npm appends `--` arguments to the LAST command of
 * a chain only. Owning the ordering here makes the narrowing flag mean what it says.
 *
 * A narrowed run does exactly what it is asked and nothing else. `-- bruno` regenerates that one
 * collection from the COMMITTED contract, which is the right question while iterating: is the state
 * on disk self-consistent? A stale contract shows up on the next full run regardless.
 */

import { writeFileSync } from 'node:fs';
import path from 'node:path';
import {
    assembleBundle,
    CONTRACT_BUNDLES,
    findBundle,
    readCommittedBundle,
    REPO_ROOT,
    type ContractBundle
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

const relative = (file: string): string => path.relative(REPO_ROOT, file);
const isStale = (bundle: ContractBundle): boolean =>
    assembleBundle(bundle) !== readCommittedBundle(bundle);

/** Assemble the given bundles, writing only the ones that actually drifted. */
const bundle = (bundles: readonly ContractBundle[]): ContractBundle[] => {
    const stale = bundles.filter(isStale);
    if (!checkOnly) for (const item of stale) writeFileSync(item.output, assembleBundle(item));
    return stale;
};

const fail = (message: string): never => {
    console.error(message);
    process.exit(1);
};

if (named.length > 0) {
    // Narrowed: exactly the bundles asked for, from what is committed. A collection named here is
    // regenerated from the COMMITTED contract rather than from one this run just assembled.
    const selected = named.map((name) => findBundle(name) as ContractBundle);
    const stale = bundle(selected);

    if (checkOnly && stale.length > 0) {
        fail(
            `[contracts] STALE — these do not match the fragments they are built from:\n` +
                stale.map(({ label }) => `  ${label}`).join('\n') +
                `\n  Fix with: npm run contracts:bundle`
        );
    }
    console.info(
        checkOnly
            ? `[contracts] ${selected.length} bundles are up to date with their fragments.`
            : stale.length === 0
              ? `[contracts] ${selected.length} bundles already matched their fragments; nothing written.`
              : `[contracts] rebuilt ${stale.map(({ output }) => relative(output)).join(', ')}.`
    );
    process.exit(0);
}

// Full run — phase 1, so the collections generate from a current contract rather than a stale one.
const authored = CONTRACT_BUNDLES.filter(({ generated }) => !generated);
bundle(authored);

// Phase 2 — everything, the collections included.
const stale = bundle(CONTRACT_BUNDLES);

if (checkOnly) {
    if (stale.length > 0) {
        const collections = stale.filter(({ generated }) => generated);

        fail(
            `[contracts] STALE — these do not match what they are built from:\n` +
                stale.map(({ label }) => `  ${label}`).join('\n') +
                `\n  A fragment was edited without re-bundling, or a bundle was hand-edited.\n` +
                `  Fix with: npm run contracts:bundle\n` +
                (collections.length > 0
                    ? `  The collections are generated — never edit them by hand. A request the` +
                      ` contract cannot describe (an invalid body, a bogus token, a soft-deleted` +
                      ` record) belongs in that module's probes.ts, which the generator reads.\n`
                    : '') +
                `  Every authored bundle is byte-identical with the paired repo — copy the result` +
                ` over there too.`
        );
    }
    console.info(
        `[contracts] ${CONTRACT_BUNDLES.length} bundles are up to date with their fragments.`
    );
    process.exit(0);
}

console.info(
    stale.length === 0
        ? `[contracts] ${CONTRACT_BUNDLES.length} bundles already matched their fragments; nothing written.`
        : `[contracts] rebuilt ${stale.map(({ output }) => relative(output)).join(', ')}.`
);
