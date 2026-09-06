/**
 * `eslint/rules/comment-links` — the rule that keeps a comment's Markdown pointer stable.
 *
 * Exercised through ESLint's own `RuleTester`, so what is asserted is exactly what a lint run
 * does. The cases split along the one distinction that makes the rule usable: a path INSIDE this
 * repo (which must be under `docs/`) versus a path inside an external URL (which this repo does
 * not control and must never flag). A rule that got the second half wrong would fire on every
 * library doc link the third-party-comment convention asks for.
 *
 * `tester.run` sits at the top level: RuleTester emits its own describe/it blocks, and jest
 * refuses describes nested inside a test.
 */
import { RuleTester } from 'eslint';
import tseslint from 'typescript-eslint';
import { commentLinks } from '../../../eslint/rules/comment-links';

/** The TypeScript parser, for the same reason `no-persistence-imports.test.ts` reaches for it. */
const tester = new RuleTester({
    languageOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        parser: tseslint.parser as never
    }
});

tester.run('comment-links', commentLinks as never, {
    valid: [
        { code: '// See: docs/tools/security.md\nconst a = 1;' },
        {
            code: '/** See docs/modules/account.md#proving-an-address for the flow. */\nconst a = 1;'
        },
        // The repo-root files that are permanent by convention.
        { code: '// The order is in CLAUDE.md\nconst a = 1;' },
        { code: '// See README.md and CHANGELOG.md\nconst a = 1;' },
        // An external URL that happens to end in .md — the library's docs, not ours.
        {
            code: '/**\n * https://github.com/altcha-org/altcha-lib/blob/main/docs/algorithms.md\n */\nconst a = 1;'
        },
        { code: '// http://example.com/PLAN.md\nconst a = 1;' },
        // No Markdown reference at all.
        { code: '// Nothing to see here.\nconst a = 1;' }
    ],
    invalid: [
        {
            code: '// See IMAGE_PIPELINE_PLAN.md for the failure-mode table.\nconst a = 1;',
            errors: [{ messageId: 'unstable' }]
        },
        {
            code: "/** The revoke is `EMAIL_VERIFICATION_PLAN.md`'s open question. */\nconst a = 1;",
            errors: [{ messageId: 'unstable' }]
        },
        // A relative path that leaves the docs tree is still a repo file, still unstable.
        {
            code: '// See ../HANDOFF.md\nconst a = 1;',
            errors: [{ messageId: 'unstable' }]
        },
        // Two dangling pointers in one comment are two problems, not one.
        {
            code: '// See PLAN_ONE.md and PLAN_TWO.md\nconst a = 1;',
            errors: [{ messageId: 'unstable' }, { messageId: 'unstable' }]
        },
        // A docs-adjacent name that is not actually under docs/.
        {
            code: '// See notdocs/thing.md\nconst a = 1;',
            errors: [{ messageId: 'unstable' }]
        }
    ]
});
