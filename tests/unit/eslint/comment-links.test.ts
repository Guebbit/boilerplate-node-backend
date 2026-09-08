/**
 * `eslint/rules/comment-links` — the two comment-hygiene checks it carries.
 *
 * Exercised through ESLint's own `RuleTester`, so what is asserted is exactly what a lint run
 * does. The Markdown half splits along the one distinction that makes it usable: a path INSIDE
 * this repo (which must be under `docs/`) versus a path inside an external URL (which this repo
 * does not control and must never flag). A rule that got the second half wrong would fire on every
 * library doc link the third-party-comment convention asks for.
 *
 * The `.ts`/`.tsx` half checks against files this repo ACTUALLY TRACKS (`git ls-files`, read once
 * by `scripts/docs/repo-references.ts`), so its cases necessarily name real, stable files rather
 * than fixtures — `eslint/rules/index.ts` and this test file's own directory, both foundational
 * enough not to move. `filename` is set per case because the relative-path half resolves against
 * wherever the comment actually lives, unlike the Markdown half which does not need to know.
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

tester.run('comment-links (.ts/.tsx)', commentLinks as never, {
    valid: [
        // A real, tracked file, cited by its repo-relative path.
        { code: '// See eslint/rules/index.ts for the barrel.\nconst a = 1;' },
        // Resolved by suffix, same as check-references.ts does for a doc page.
        { code: '// See rules/index.ts.\nconst a = 1;' },
        // A `<placeholder>` segment is a deliberate wildcard, not a citation.
        { code: '// Each src/modules/<name>/module.ts declares a basePath.\nconst a = 1;' },
        { code: '// Mirrors <paired-frontend>/vitest.config.ts over there.\nconst a = 1;' },
        { code: "// stryker run --mutate '<path>.ts:10-40'\nconst a = 1;" },
        // A relative reference, resolved against the file the comment lives in.
        {
            code: '// See ./index.ts for the barrel.\nconst a = 1;',
            filename: 'eslint/rules/comment-links.ts'
        },
        // The generated-artifact and node_modules exemptions `check-references.ts` already has.
        {
            code: '// Generated into src/types/asyncapi.generated.ts by gen:asyncapi.\nconst a = 1;'
        },
        {
            code: '// See node_modules/zod/v4/core/schemas.d.ts for the introspection surface.\nconst a = 1;'
        },
        // No .ts/.tsx reference at all.
        { code: '// Nothing to see here.\nconst a = 1;' }
    ],
    invalid: [
        {
            code: '// See eslint/rules/definitely-not-a-real-rule.ts for the shape.\nconst a = 1;',
            errors: [{ messageId: 'stale' }]
        },
        // A relative reference that does not exist next to the citing file.
        {
            code: '// See ./definitely-not-a-real-rule.ts for the shape.\nconst a = 1;',
            filename: 'eslint/rules/comment-links.ts',
            errors: [{ messageId: 'stale' }]
        }
    ]
});
