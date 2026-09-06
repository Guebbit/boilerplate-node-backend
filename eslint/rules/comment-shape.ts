/**
 * A comment's budget is spent in PROSE, and structure is nearly free.
 *
 * The point is not brevity for its own sake — a header that needs more room is allowed it. The
 * point is the FORM that room takes: a labelled row, a list or a table is scannable, and a
 * seventh sentence of continuous prose is where a reader loses the thread. Running out of budget
 * is the signal to switch form, not to delete the content.
 *
 * See: docs/reference/root.md#comment-shape
 */

/**
 * A line that reads as schema rather than sentences: a list item, a `Label:` row, a continuation
 * indented under one, a table rule, a fenced block, or a JSDoc tag.
 */
const STRUCTURED =
    /^(?:[*•-]\s|\d+[).]\s|[A-Za-z][\w '/-]{0,28}:\s|\s{2,}\S|[|│└├]|─{3,}|`{3}|@\w+)/;

/** Prose lines allowed before a comment has to become schematic. */
const LIMITS = { header: 6, declaration: 8, total: 24 };

/** The comment's own lines, stripped of the leading ` * ` and of blanks. */
const contentLines = (raw: string): string[] =>
    raw
        .split('\n')
        .map((line) => line.replace(/^\s*\*?\s?/, '').trimEnd())
        .filter((line) => line.trim() !== '');

export const commentShape = {
    meta: {
        type: 'suggestion',
        docs: { description: 'Cap continuous prose in a comment; structure is free' },
        schema: [],
        messages: {
            prose:
                '{{kind}} comment has {{count}} lines of continuous prose (limit {{limit}}). ' +
                'Say it schematically — a labelled row, a short list — or move the reasoning to ' +
                '`docs/` and link to it. Structured lines are not counted.',
            total:
                'Comment is {{count}} lines (limit {{limit}}). This much belongs in `docs/`, ' +
                'where it can carry a diagram; leave a link behind.'
        }
    },
    create(context: any) {
        return {
            Program() {
                const source = context.sourceCode;
                for (const comment of source.getAllComments()) {
                    if (comment.type !== 'Block') continue;

                    const lines = contentLines(comment.value);
                    if (lines.length === 0) continue;

                    // A header is the block that opens the file, before any code.
                    const before = source.getTokenBefore(comment, { includeComments: false });
                    const kind = before === null ? 'header' : 'declaration';
                    const limit = LIMITS[kind];

                    if (lines.length > LIMITS.total) {
                        context.report({
                            loc: comment.loc,
                            messageId: 'total',
                            data: { count: lines.length, limit: LIMITS.total }
                        });
                        continue;
                    }

                    const prose = lines.filter((line) => !STRUCTURED.test(line)).length;
                    if (prose > limit)
                        context.report({
                            loc: comment.loc,
                            messageId: 'prose',
                            data: {
                                kind: kind === 'header' ? 'Module' : 'Declaration',
                                count: prose,
                                limit
                            }
                        });
                }
            }
        };
    }
};
