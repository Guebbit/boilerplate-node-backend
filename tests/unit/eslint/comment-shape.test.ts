/**
 * `eslint/rules/comment-shape` — the rule that spends a comment's budget on PROSE alone.
 *
 * The cases are built around the one property that makes the rule worth having: the same content
 * passes or fails on its FORM, not its length. A ten-line labelled block is fine; a seven-line
 * paragraph is not. A rule that counted raw lines would rank those the other way round, which is
 * the behaviour this file exists to prevent.
 *
 * `tester.run` sits at the top level: RuleTester emits its own describe/it blocks, and jest
 * refuses describes nested inside a test.
 */
import { RuleTester } from 'eslint';
import tseslint from 'typescript-eslint';
import { commentShape } from '../../../eslint/rules/comment-shape';

/** The TypeScript parser, for the same reason `no-persistence-imports.test.ts` reaches for it. */
const tester = new RuleTester({
    languageOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        parser: tseslint.parser as never
    }
});

/** `n` lines of continuous prose, as a block comment body. */
const prose = (n: number): string =>
    Array.from(
        { length: n },
        (_, i) => ` * Sentence number ${String(i)} carrying ordinary prose.`
    ).join('\n');

/** `n` labelled rows — the schematic form the rule is trying to buy. */
const rows = (n: number): string =>
    Array.from({ length: n }, (_, i) => ` * Label${String(i)}:  what that one means.`).join('\n');

tester.run('comment-shape', commentShape as never, {
    valid: [
        // A header at exactly the prose limit.
        { code: `/**\n${prose(6)}\n */\nconst a = 1;` },
        // A declaration at exactly its (higher) limit.
        { code: `const a = 1;\n/**\n${prose(8)}\n */\nconst b = 2;` },
        // The point of the rule: structure is nearly free, so this is fine at 14 lines.
        { code: `/**\n * The opening line.\n${rows(13)}\n */\nconst a = 1;` },
        // Bullet lists and numbered lists count as structure too.
        {
            code: `/**\n * Why:\n * - one\n * - two\n * - three\n * - four\n * - five\n * - six\n * - seven\n */\nconst a = 1;`
        },
        // JSDoc tags are structure, so a well-documented function is not penalised.
        {
            code: `/**\n${prose(4)}\n * @param one - the first\n * @param two - the second\n * @returns something\n * @throws {Error} when it cannot\n */\nfunction f() {}`
        },
        // Line comments are out of scope — the caps are about block comments.
        { code: `${'// a line of prose\n'.repeat(12)}const a = 1;` }
    ],
    invalid: [
        // One line of prose over the header limit.
        { code: `/**\n${prose(7)}\n */\nconst a = 1;`, errors: [{ messageId: 'prose' }] },
        // A declaration comment one line over its limit.
        {
            code: `const a = 1;\n/**\n${prose(9)}\n */\nconst b = 2;`,
            errors: [{ messageId: 'prose' }]
        },
        // Past the total ceiling, form stops rescuing it: this much belongs in `docs/`.
        {
            code: `/**\n * Opening.\n${rows(30)}\n */\nconst a = 1;`,
            errors: [{ messageId: 'total' }]
        }
    ]
});
