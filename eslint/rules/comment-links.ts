/**
 * A comment may point at a Markdown file under `docs/`, and at no other one in this repo.
 *
 * A root-level plan, audit or handover doc is written for one change and deleted when that change
 * lands, taking every comment that named it down to a dangling pointer. `docs/` is the only
 * stable target, and the only one the docs build checks.
 *
 * External URLs are exempt — a link to a library's own documentation is the thing the
 * third-party-code rule asks for, and this repo does not control whether it rots.
 *
 * Deliberately not type-aware: comments are not in the AST, so this walks the token stream.
 */

/** Anything that looks like a URL. Blanked before scanning, so their paths are never matched. */
const URL_LIKE = /\w+:\/\/\S+|\bwww\.\S+/g;

/** A Markdown filename, with whatever path it was given. */
const MARKDOWN_REFERENCE = /(?:[\w./-]*\/)?[\w.-]+\.md\b/g;

/** Stable targets: the docs tree, and the repo-root files that are permanent by convention. */
const ALLOWED = /^(?:docs\/|\.?\/?(?:README|CHANGELOG|CLAUDE)\.md$)/;

export const commentLinks = {
    meta: {
        type: 'problem',
        docs: { description: 'Comments may only reference Markdown under docs/' },
        schema: [],
        messages: {
            unstable:
                '`{{reference}}` is not under `docs/`. A root-level plan or audit doc is deleted ' +
                'when its change lands, leaving this comment pointing at nothing — link to a ' +
                'page under `docs/`, or state the reason here instead.'
        }
    },
    create(context: any) {
        return {
            Program() {
                for (const comment of context.sourceCode.getAllComments()) {
                    const text = comment.value.replaceAll(URL_LIKE, ' ');
                    for (const match of text.matchAll(MARKDOWN_REFERENCE)) {
                        if (ALLOWED.test(match[0])) continue;
                        context.report({
                            loc: comment.loc,
                            messageId: 'unstable',
                            data: { reference: match[0] }
                        });
                    }
                }
            }
        };
    }
};
