#!/usr/bin/env tsx
/**
 * Fails when `asyncapi.public.yaml` — the partner-facing webhook event catalogue — drops or
 * narrows something a subscriber already depends on. `npm run check:asyncapi-breaking`.
 *
 * Diffs the working tree's bundle against `origin/main`'s, at their merge-base: the same "what
 * would this change actually ship" comparison `scripts/mutation/run-diff.ts` uses, not the tip of
 * a possibly-stale local `main`.
 *
 * `/info/version` is ignored (see `scripts/contracts/asyncapi-breaking.ts`).
 *
 * @asyncapi/diff refuses anything that is not already dereferenced, so both documents go through
 * @asyncapi/parser first. https://github.com/asyncapi/diff#readme
 *
 * Usage:
 *   npm run check:asyncapi-breaking
 *   npm run check:asyncapi-breaking -- --base=HEAD~3
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { DiffOutputItem } from '@asyncapi/diff';
import { Parser } from '@asyncapi/parser';
import { REPO_ROOT, mergeBase } from '../git-base';
import { breakingChanges } from './asyncapi-breaking';

/** The only bundle this gate cares about: the one a webhook subscriber actually reads. */
const BUNDLE = 'asyncapi.public.yaml';

/** The raw `--base=<ref>` argument, if given. */
const baseArgument = process.argv.find((argument) => argument.startsWith('--base='));
/** The git ref to compare against; `origin/main` unless `--base` says otherwise. */
const base = baseArgument ? baseArgument.slice('--base='.length) : 'origin/main';

/** `BUNDLE` as it stood at `ref`, or undefined when the ref predates the file. */
const bundleAt = (ref: string): string | undefined => {
    try {
        return execFileSync('git', ['show', `${ref}:${BUNDLE}`], {
            cwd: REPO_ROOT,
            encoding: 'utf8'
        });
    } catch {
        return undefined;
    }
};

/** One breaking change, printed as `path: before -> after` — enough to act on without the JSON. */
const describe = (change: DiffOutputItem): string =>
    `  ${change.path}  (${change.action}): ${JSON.stringify(change.before)} -> ${JSON.stringify(change.after)}`;

/** The leading `MAJOR` segment of an AsyncAPI version string. */
const majorVersion = (version: string): string => version.split('.', 1)[0] ?? version;

/** The commit where this branch left `base`; `undefined` (so: pass) when git cannot tell. */
const baseCommit = mergeBase(base, 'asyncapi-breaking');

// Nothing to compare against: exit 0 rather than block the commit.
if (baseCommit === undefined) process.exit(0);

/** The public bundle as it stood on the base. */
const before = bundleAt(baseCommit);

/** The public bundle as it is now on disk. */
const after = readFileSync(path.join(REPO_ROOT, BUNDLE), 'utf8');

// The file is new on this branch: nothing to break yet.
if (before === undefined) {
    console.log(`[asyncapi-breaking] ${BUNDLE} did not exist at ${base}; nothing to compare.`);
    process.exit(0);
}

// Byte-identical: skip the parse.
if (before === after) {
    console.log(`[asyncapi-breaking] ${BUNDLE} is unchanged since ${base}.`);
    process.exit(0);
}

/**
 * AsyncAPI's own parser: resolves `$ref`s and gives a version-aware document model.
 * https://github.com/asyncapi/parser-js
 */
const parser = new Parser();

// Parse both bundles, then diff them; `source` names each in parser errors.
Promise.all([
    parser.parse(before, { source: `${base}:${BUNDLE}` }),
    parser.parse(after, { source: BUNDLE })
])
    .then(([beforeResult, afterResult]) => {
        if (!beforeResult.document || !afterResult.document) {
            console.error(
                `[asyncapi-breaking] one of the two documents failed to parse. Run \`npm run lint:asyncapi\` first.`
            );
            process.exit(2);
        }

        /*
         * @asyncapi/diff refuses to compare across a major version (a `TypeError`, not a result) —
         * and a major bump IS the deliberate, reviewed break this gate exists to catch everything
         * ELSE from being. Nothing to diff structurally; say so and pass.
         */
        if (
            majorVersion(beforeResult.document.version()) !==
            majorVersion(afterResult.document.version())
        ) {
            console.log(
                `[asyncapi-breaking] ${BUNDLE} crossed a major AsyncAPI version (` +
                    `${beforeResult.document.version()} -> ${afterResult.document.version()}) since ${base} — ` +
                    'that is the deliberate break, not one this gate can classify further.'
            );
            return;
        }

        const changes = breakingChanges(beforeResult.document.json(), afterResult.document.json());

        if (changes.length === 0) {
            console.log(`[asyncapi-breaking] no breaking changes to ${BUNDLE} since ${base}.`);
            return;
        }

        console.error(
            `[asyncapi-breaking] ${changes.length} breaking change(s) to ${BUNDLE} since ${base}:\n`
        );
        for (const change of changes) console.error(describe(change));
        console.error(
            '\nA subscriber built against the removed/narrowed shape breaks silently. If this is ' +
                'intentional (a deliberate version bump), say so in the commit message.'
        );
        process.exit(1);
    })
    .catch((error: unknown) => {
        console.error(error);
        process.exit(2);
    });
