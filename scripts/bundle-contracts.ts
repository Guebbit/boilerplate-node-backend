#!/usr/bin/env tsx
/**
 * Rebuild the committed documents from their fragments — `npm run contracts:bundle`.
 *
 * Every bundle stays COMMITTED: it is what spectral, orval, Prism, `jest-openapi`, the seed runner,
 * the API clients and `check-spec-identity` read, and what gets copied to the paired frontend.
 * Fragments are the source of truth; this writes the published artefacts.
 *
 * Run with `--check` in CI to assert the committed bundles are not stale instead of rewriting them
 * (`npm run check:contracts-bundle`). Name one or more bundles to narrow the run to a single phase:
 *
 *   npm run contracts:bundle -- openapi asyncapi
 *
 * ## Why a full run is three phases
 *
 * The three client collections are GENERATED from `openapi.yaml`, so their fragments cannot be
 * written until the contract is bundled, and cannot be bundled until they are written:
 *
 *   1. bundle the authored documents      fragments        -> openapi.yaml, asyncapi.yaml, …
 *   2. regenerate the collection fragments openapi.yaml     -> modules/<name>/dev/<tool>.*
 *   3. bundle everything                   those fragments  -> contract.<tool>.<ext>
 *
 * That ordering used to live in package.json as three commands joined by `&&`, which was wrong in a
 * way nothing caught: npm appends `--` arguments to the LAST command of a chain only, so
 * `npm run contracts:bundle -- openapi` ran the full first phase and then re-bundled openapi alone,
 * silently skipping the collections it had just regenerated fragments for. Owning the ordering here
 * makes the narrowing flag mean what it says.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
    assembleBundle,
    CONTRACT_BUNDLES,
    findBundle,
    readCommittedBundle,
    REPO_ROOT,
    type ContractBundle
} from './contracts';
import {
    generateCollectionFragments,
    staleCollectionFragments
} from './contracts/generateCollections';

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

/**
 * Phase 2 — rewrite the fragments the three collections are built from.
 *
 * Under `--check` this reads the COMMITTED contract rather than one this run just assembled, which
 * is the right question to ask: is the state on disk self-consistent? A stale contract shows up in
 * phase 3 regardless.
 */
const regenerateCollectionFragments = (): string[] => {
    const fragments = generateCollectionFragments();
    const stale = staleCollectionFragments(fragments);

    if (!checkOnly) {
        for (const [file, content] of fragments) {
            mkdirSync(path.dirname(file), { recursive: true });
            writeFileSync(file, content);
        }
    }
    return stale;
};

const fail = (message: string): never => {
    console.error(message);
    process.exit(1);
};

if (named.length > 0) {
    // Narrowed: one phase, exactly the bundles asked for. Deliberately does NOT regenerate the
    // collection fragments — that is what a full run is for, and a narrowed run is for iterating.
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

// Full run — the three phases above.
const authored = CONTRACT_BUNDLES.filter(({ generated }) => !generated);
bundle(authored);

const staleFragments = regenerateCollectionFragments();
if (checkOnly && staleFragments.length > 0) {
    fail(
        `[collections] STALE — these do not match what openapi.yaml generates:\n` +
            staleFragments.map((file) => `  ${relative(file)}`).join('\n') +
            `\n  Fix with: npm run contracts:bundle` +
            `\n  Never by hand: these are generated. A request the contract cannot describe —` +
            ` an invalid body, a bogus token, a soft-deleted record — belongs in that module's` +
            ` dev/probes.yml, which this reads.`
    );
}

const stale = bundle(CONTRACT_BUNDLES);

if (checkOnly) {
    if (stale.length > 0) {
        fail(
            `[contracts] STALE — these do not match the fragments they are built from:\n` +
                stale.map(({ label }) => `  ${label}`).join('\n') +
                `\n  A fragment was edited without re-bundling, or a bundle was hand-edited.\n` +
                `  Fix with: npm run contracts:bundle\n` +
                `  Every bundle is byte-identical with the paired repo — copy the result over there too.`
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
