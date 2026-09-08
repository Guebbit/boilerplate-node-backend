/**
 * @module
 * Two comment-hygiene checks, sharing one walk over every comment in a file:
 *
 * `unstable` — a comment may point at a Markdown file under `docs/`, and at no other one in this
 * repo. A root-level plan, audit or handover doc is written for one change and deleted when that
 * change lands, taking every comment that named it down to a dangling pointer. `docs/` is the
 * only stable target, and the only one the docs build checks.
 *
 * `stale` — a comment citing a `.ts`/`.tsx` file is checked against the files that actually
 * exist, the same way `scripts/docs/check-references.ts` already checks every `docs/*.md` page —
 * see `scripts/docs/repo-references.ts` for the machinery the two share. A `<placeholder>`
 * segment (`src/modules/<name>/module.ts`, `<paired-frontend>/vitest.config.ts`, a CLI example
 * like `--mutate '<path>.ts:10-40'`) is the author saying "this part varies", not naming a file,
 * and is skipped rather than flagged.
 *
 * External URLs are exempt from both — a link to a library's own documentation, or one landing on
 * a `.ts` file over there, is the thing the third-party-code rule asks for, and this repo does not
 * control whether it rots.
 *
 * Deliberately not type-aware: comments are not in the AST, so this walks the token stream.
 */

import { existsSync } from 'node:fs';
import path from 'node:path';
import {
    ROOT,
    allowed as allowedPathPrefix,
    trackedTargets,
    resolves,
    claimsAPath
} from '../../scripts/docs/repo-references';

/** Anything that looks like a URL. Blanked before scanning, so their paths are never matched. */
const URL_LIKE = /\w+:\/\/\S+|\bwww\.\S+/g;

/** A Markdown filename, with whatever path it was given. */
const MARKDOWN_REFERENCE = /(?:[\w./-]*\/)?[\w.-]+\.md\b/g;

/** Stable Markdown targets: the docs tree, and the repo-root files that are permanent by convention. */
const STABLE_MD_TARGET = /^(?:docs\/|\.?\/?(?:README|CHANGELOG|CLAUDE)\.md$)/;

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
const targets = (): { targets: Set<string>; roots: Set<string> } =>
    (targetsCache ??= trackedTargets(ROOT));

/**
 * Whether a `.ts`/`.tsx` reference resolves — a `<placeholder>` is skipped outright (the author
 * said this part varies), a `./`/`../` one is resolved against the FILE THE COMMENT LIVES IN
 * (unlike a doc page, we know exactly where that is), and everything else is checked the way
 * `check-references.ts` checks a doc's citation: by suffix, against every file git tracks, minus
 * the same `ALLOWED` gitignored-but-real exceptions (a generated client, an asyncapi type file).
 */
export const resolvesTsReference = (reference: string, filename: string): boolean => {
    if (reference.includes('<')) return true;

    if (reference.startsWith('./') || reference.startsWith('../'))
        return existsSync(path.resolve(path.dirname(filename), reference));

    const { targets: own, roots } = targets();
    return (
        !claimsAPath(roots, reference) || allowedPathPrefix(reference) || resolves(own, reference)
    );
};

export const commentLinks = {
    meta: {
        type: 'problem',
        docs: {
            description:
                'Comments may only reference Markdown under docs/, and a .ts/.tsx file that exists'
        },
        schema: [],
        messages: {
            unstable:
                '`{{reference}}` is not under `docs/`. A root-level plan or audit doc is deleted ' +
                'when its change lands, leaving this comment pointing at nothing — link to a ' +
                'page under `docs/`, or state the reason here instead.',
            stale:
                '`{{reference}}` does not exist. A renamed or removed file leaves this comment ' +
                'pointing at nothing — fix the reference, or wrap the varying part in ' +
                '`<angle-brackets>` if it names a placeholder rather than a real file.'
        }
    },
    create(context: any) {
        return {
            Program() {
                for (const comment of context.sourceCode.getAllComments()) {
                    const text = comment.value.replaceAll(URL_LIKE, ' ');

                    for (const match of text.matchAll(MARKDOWN_REFERENCE)) {
                        if (STABLE_MD_TARGET.test(match[0])) continue;
                        context.report({
                            loc: comment.loc,
                            messageId: 'unstable',
                            data: { reference: match[0] }
                        });
                    }

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
};
