#!/usr/bin/env tsx
/**
 * Fails when `asyncapi.public.yaml` — the partner-facing webhook event catalogue — drops or
 * narrows something a subscriber already depends on. `npm run check:asyncapi-breaking`.
 *
 * Diffs the working tree's bundle against `origin/main`'s, at their merge-base: the same "what
 * would this change actually ship" comparison `scripts/mutation/run-diff.ts` uses, not the tip of
 * a possibly-stale local `main`.
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
import { diff, type DiffOutputItem } from '@asyncapi/diff';
import { Parser } from '@asyncapi/parser';

/** The repo root — every git call below runs from here, not from the caller's cwd. */
const REPO_ROOT = path.join(__dirname, '..', '..');

/** The only bundle this gate cares about: the one a webhook subscriber actually reads. */
const BUNDLE = 'asyncapi.public.yaml';

const baseArgument = process.argv.find((argument) => argument.startsWith('--base='));
const base = baseArgument ? baseArgument.slice('--base='.length) : 'origin/main';

/** The merge-base, so a stale local `main` does not compare against history this branch never shipped. */
const mergeBase = (): string => {
    try {
        return execFileSync('git', ['merge-base', 'HEAD', base], {
            cwd: REPO_ROOT,
            encoding: 'utf8'
        }).trim();
    } catch {
        console.error(
            `[asyncapi-breaking] cannot resolve '${base}'. In CI, fetch it first ` +
                `(actions/checkout with fetch-depth: 0), or pass --base=<ref>.`
        );
        process.exit(2);
    }
};

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
const majorVersion = (version: string): string => version.split('.')[0] ?? version;

const before = bundleAt(mergeBase());
const after = readFileSync(path.join(REPO_ROOT, BUNDLE), 'utf8');

if (before === undefined) {
    console.log(`[asyncapi-breaking] ${BUNDLE} did not exist at ${base}; nothing to compare.`);
    process.exit(0);
}

if (before === after) {
    console.log(`[asyncapi-breaking] ${BUNDLE} is unchanged since ${base}.`);
    process.exit(0);
}

const parser = new Parser();

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

        const breaking = diff(beforeResult.document.json(), afterResult.document.json()).breaking();
        const changes = Array.isArray(breaking) ? breaking : [];

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
