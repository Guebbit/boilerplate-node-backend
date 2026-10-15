#!/usr/bin/env tsx
/**
 * Rebuild the documents this repo publishes from their fragments — `npm run contracts:bundle`.
 *
 * Fragments are the source of truth; the bundles are what spectral, orval, Prism and
 * `check:spec-identity` read — `openapi.yaml` is `.gitignore`d and rebuilt on every install,
 * `asyncapi.yaml`/`asyncapi.public.yaml` stay COMMITTED. `--check` asserts none of the three are
 * stale instead of rewriting them. Name bundles to narrow the run:
 *
 *   npm run contracts:bundle -- openapi asyncapi
 *
 * The client collections are opt-in — ask for them by name, since they are generated from
 * `openapi.yaml` on disk rather than from the fragments.
 *
 * The selection lives here rather than in `package.json` because npm appends `--` arguments to the
 * LAST command of a chain only, so a `&&`-joined ordering would silently drop the flag.
 *
 * See: docs/api/contract-fragmentation.md#the-seven-bundles
 */

import { writeFileSync } from 'node:fs';
import path from 'node:path';
import {
    assembleBundle,
    CONTRACT_BUNDLES,
    findBundle,
    isGenerated,
    readCommittedBundle,
    type ContractBundle
} from './bundle-registry';
import { REPO_ROOT } from '../modules-on-disk';

/** CLI arguments after the script's own path. The trailing underscore avoids shadowing `arguments`. */
const arguments_ = process.argv.slice(2);

/** `--check`: verify the bundles on disk instead of writing them. */
const checkOnly = arguments_.includes('--check');
/** Bundle names the caller asked for; none means every bundle. */
const named = arguments_.filter((argument) => !argument.startsWith('--'));

/** Requested names no bundle answers to. */
const unknown = named.filter((name) => !findBundle(name));

// Exit 2 (usage error) on a misspelt bundle name, listing the known ones.
if (unknown.length > 0) {
    console.error(
        `[contracts] unknown bundle(s): ${unknown.join(', ')}\n` +
            `  Known: ${CONTRACT_BUNDLES.map(({ name }) => name).join(', ')}`
    );
    process.exit(2);
}

/** A path relative to the repo root, for readable messages. */
const relative = (file: string): string => path.relative(REPO_ROOT, file);

/** Assemble the given bundles once each, writing only the ones that actually drifted. */
const bundle = (bundles: readonly ContractBundle[]): Promise<ContractBundle[]> =>
    Promise.all(
        bundles.map((item) => assembleBundle(item).then((content) => ({ item, content })))
    ).then((assembled) => {
        const stale = assembled.filter(
            ({ item, content }) => content !== readCommittedBundle(item)
        );
        if (!checkOnly) for (const { item, content } of stale) writeFileSync(item.output, content);
        return stale.map(({ item }) => item);
    });

/** Print `message` and exit 1. Typed `never`, so callers need no `return` after it. */
const fail = (message: string): never => {
    console.error(message);
    process.exit(1);
};

/**
 * Say how a build went: under `--check`, fail on any stale bundle and name the fix; otherwise
 * report what was written.
 *
 * @param total - how many bundles were asked for
 * @param stale - those that did not match what they are built from
 * @param problem - what "stale" means for this run, completing `STALE — …`
 * @param advice - how to fix it
 */
const report = (
    total: number,
    stale: readonly ContractBundle[],
    problem: string,
    advice: string
): void => {
    if (checkOnly && stale.length > 0)
        fail(
            `[contracts] STALE — ${problem}:\n` +
                stale.map(({ label }) => `  ${label}`).join('\n') +
                `\n  ${advice}`
        );
    console.info(
        checkOnly
            ? `[contracts] ${total} bundles are up to date with their fragments.`
            : stale.length === 0
              ? `[contracts] ${total} bundles already matched their fragments; nothing written.`
              : `[contracts] rebuilt ${stale.map(({ output }) => relative(output)).join(', ')}.`
    );
};

/** The whole run — async because a generated bundle (the client collections) loads modules by scan. */
const run = async (): Promise<void> => {
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

        report(
            selected.length,
            await bundle(selected),
            `these do not match the fragments they are built from`,
            `Fix with: npm run contracts:bundle`
        );
        process.exit(0);
    }

    /*
     * Full run — the authored bundles and nothing else. The client collections are generated and
     * uncommitted, so producing them here would write four files nobody asked for and that no check
     * ever reads; `-- bruno` is how you get one.
     */
    const authored = CONTRACT_BUNDLES.filter((item) => !isGenerated(item));
    report(
        authored.length,
        await bundle(authored),
        `these do not match what they are built from`,
        `A fragment was edited without re-bundling, or a bundle was hand-edited.\n` +
            `  Fix with: npm run contracts:bundle\n` +
            `  Every authored bundle is byte-identical with the paired repo — copy the result` +
            ` over there too.`
    );
};

// Entry point: any rejection prints the error and exits 1.
run().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
});
