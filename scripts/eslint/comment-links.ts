/**
 * @module
 * One comment-hygiene check, over every comment in a file.
 *
 * `stale`:   a comment citing a `.ts`/`.tsx` file is checked against the files that exist, as
 *            `scripts/docs/check-references.ts` does for `docs/*.md` (shared machinery in
 *            `scripts/docs/repo-references.ts`). A `<placeholder>` segment
 *            (`src/modules/<name>/module.ts`, `--mutate '<path>.ts:10-40'`) says "this part
 *            varies" and is skipped, not flagged.
 * Exempt:    external URLs. A link to a `.ts` file elsewhere is what the third-party-code rule
 *            asks for, and this repo cannot control whether it rots.
 * Markdown:  NOT checked. A comment naming a root-level plan doc is wrong (CLAUDE.md: such a doc is
 *            written for one change and deleted when it lands), but `.gitignore` keeps those out
 *            of the repo, which is the guard that holds: a pattern matching every way a doc can
 *            be named would refuse prose, and one matching a filename missed a bare
 *            `OFFLINE_PAYMENTS_3`.
 * Untyped:   comments are not in the AST, so this walks the token stream.
 */

import { existsSync } from 'node:fs';
import path from 'node:path';
import { ESLintUtils } from '@typescript-eslint/utils';
import {
    allowed as allowedPathPrefix,
    trackedTargets,
    resolves,
    claimsAPath
} from '../../scripts/docs/repo-references';
import { REPO_ROOT as ROOT } from '../modules-on-disk';

/** Anything that looks like a URL. Blanked before scanning, so their paths are never matched. */
const URL_LIKE = /\w+:\/\/\S+|\bwww\.\S+/g;

/**
 * One path segment of a `.ts`/`.tsx` reference: an ordinary word, or a `<placeholder>` standing in
 * for whatever varies — a module name, the paired repo, an example filename. Built into the
 * reference regex itself (rather than filtered out afterwards) so `src/modules/<name>/module.ts`
 * is captured and skipped WHOLE, instead of leaving a dangling `/module.ts` behind once `<name>`
 * is thrown away.
 */
const TS_SEGMENT = String.raw`(?:[\w.-]+|<[\w-]+>)`;

/** A `.ts`/`.tsx` filename, with whatever path (real or `<placeholder>`) it was given. */
const TS_REFERENCE = new RegExp(String.raw`(?:${TS_SEGMENT}/)*${TS_SEGMENT}\.tsx?\b`, 'g');

/**
 * The repo's tracked files, read once per lint run (not per file) — `git ls-files` is cheap once,
 * wasteful asked thousands of times over.
 */
let targetsCache: { targets: Set<string>; roots: Set<string> } | undefined;

/** Reads {@link targetsCache}, populating it from `trackedTargets` on the first call. */
const targets = (): { targets: Set<string>; roots: Set<string> } =>
    (targetsCache ??= trackedTargets(ROOT));

/**
 * Whether a `.ts`/`.tsx` reference resolves — a `<placeholder>` is skipped outright (the author
 * said this part varies), a `./`/`../` one is resolved against the FILE THE COMMENT LIVES IN
 * (unlike a doc page, we know exactly where that is), and everything else is checked the way
 * `check-references.ts` checks a doc's citation: by suffix, against every file git tracks, minus
 * the same `ALLOWED` gitignored-but-real exceptions (a generated client, an asyncapi type file).
 */
const resolvesTsReference = (reference: string, filename: string): boolean => {
    if (reference.includes('<')) return true;

    if (reference.startsWith('./') || reference.startsWith('../'))
        return existsSync(path.resolve(path.dirname(filename), reference));

    const { targets: own, roots } = targets();
    return (
        !claimsAPath(roots, reference) || allowedPathPrefix(reference) || resolves(own, reference)
    );
};

/** `RuleCreator`'s two type parameters: this rule takes no options and reports one message. */
type Options = [];

/** The one message this rule reports: a comment names a file that is not tracked. */
type MessageIds = 'stale';

/** Flags a `.ts`/`.tsx` reference inside a comment that does not resolve to a tracked file. */
export const commentLinks = ESLintUtils.RuleCreator.withoutDocs<Options, MessageIds>({
    meta: {
        type: 'problem',
        docs: {
            description: 'Comments may only reference a .ts/.tsx file that exists'
        },
        schema: [],
        messages: {
            stale:
                '`{{reference}}` does not exist. A renamed or removed file leaves this comment ' +
                'pointing at nothing — fix the reference, or wrap the varying part in ' +
                '`<angle-brackets>` if it names a placeholder rather than a real file.'
        }
    },
    defaultOptions: [],
    create(context) {
        return {
            Program() {
                for (const comment of context.sourceCode.getAllComments()) {
                    const text = comment.value.replaceAll(URL_LIKE, ' ');

                    for (const match of text.matchAll(TS_REFERENCE)) {
                        if (resolvesTsReference(match[0], context.filename)) continue;
                        context.report({
                            loc: comment.loc,
                            messageId: 'stale',
                            data: { reference: match[0] }
                        });
                    }
                }
            }
        };
    }
});
