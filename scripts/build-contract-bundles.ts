#!/usr/bin/env tsx
/**
 * Rebuild the documents this repo publishes from their fragments — `npm run contracts:bundle`.
 *
 * Fragments are the source of truth; the bundles stay COMMITTED because they are what spectral,
 * orval, Prism, the seed runner and `check:spec-identity` read. `--check` asserts they are not
 * stale instead of rewriting them. Name bundles to narrow the run:
 *
 *   npm run contracts:bundle -- openapi asyncapi
 *
 * The client collections are opt-in — ask for them by name, since they are generated from the
 * COMMITTED contract rather than from the fragments.
 *
 * The selection lives here rather than in `package.json` because npm appends `--` arguments to the
 * LAST command of a chain only, so a `&&`-joined ordering would silently drop the flag.
 *
 * See: docs/api/contract-fragmentation.md#the-eight-bundles
 */

import { writeFileSync } from 'node:fs';
import path from 'node:path';
import {
    assembleBundle,
    CONTRACT_BUNDLES,
    findBundle,
    isGenerated,
    readCommittedBundle,
    REPO_ROOT,
    type ContractBundle
} from './contracts/bundle-registry';

const arguments_ = process.argv.slice(2);
const checkOnly = arguments_.includes('--check');
const named = arguments_.filter((argument) => !argument.startsWith('--'));

const unknown = named.filter((name) => !findBundle(name));
if (unknown.length > 0) {
    console.error(
        `[contracts] unknown bundle(s): ${unknown.join(', ')}\n` +
            `  Known: ${CONTRACT_BUNDLES.map(({ name }) => name).join(', ')}`
    );
    process.exit(2);
}

const relative = (file: string): string => path.relative(REPO_ROOT, file);

/** Assemble the given bundles once each, writing only the ones that actually drifted. */
const bundle = (bundles: readonly ContractBundle[]): ContractBundle[] => {
    const assembled = bundles.map((item) => ({ item, content: assembleBundle(item) }));
    const stale = assembled.filter(({ item, content }) => content !== readCommittedBundle(item));
    if (!checkOnly) for (const { item, content } of stale) writeFileSync(item.output, content);
    return stale.map(({ item }) => item);
};

const fail = (message: string): never => {
    console.error(message);
    process.exit(1);
};

if (named.length > 0) {
    // Narrowed: exactly the bundles asked for, from what is committed. A collection named here is
    // regenerated from the COMMITTED contract rather than from one this run just assembled.
    const selected = named.map((name) => findBundle(name)!);

    /*
     * `--check` asks "is the committed file current". The collections are not committed, so the
     * honest answer is that the question does not apply — and the naive one is "stale", every time,
     * for a file that is absent by design. Refusing is what stops that from reaching CI as a
     * permanently red gate somebody then works around.
     */
    const generated = selected.filter((item) => isGenerated(item));
    if (checkOnly && generated.length > 0) {
        fail(
            `[contracts] --check does not apply to the client collections: ${generated
                .map(({ name }) => name)
                .join(', ')}.\n` +
                `  They are generated on demand and .gitignore'd, so there is no committed copy to` +
                ` be stale.\n` +
                `  Generate one with: npm run contracts:bundle -- ${generated.map(({ name }) => name).join(' ')}`
        );
    }

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

/*
 * Full run — the authored bundles and nothing else. The client collections are generated and
 * uncommitted, so producing them here would write four files nobody asked for and that no check
 * ever reads; `-- bruno` is how you get one.
 */
const authored = CONTRACT_BUNDLES.filter((item) => !isGenerated(item));
const stale = bundle(authored);

if (checkOnly) {
    if (stale.length > 0) {
        fail(
            `[contracts] STALE — these do not match what they are built from:\n` +
                stale.map(({ label }) => `  ${label}`).join('\n') +
                `\n  A fragment was edited without re-bundling, or a bundle was hand-edited.\n` +
                `  Fix with: npm run contracts:bundle\n` +
                `  Every authored bundle is byte-identical with the paired repo — copy the result` +
                ` over there too.`
        );
    }
    console.info(`[contracts] ${authored.length} bundles are up to date with their fragments.`);
    process.exit(0);
}

console.info(
    stale.length === 0
        ? `[contracts] ${authored.length} bundles already matched their fragments; nothing written.`
        : `[contracts] rebuilt ${stale.map(({ output }) => relative(output)).join(', ')}.`
);
