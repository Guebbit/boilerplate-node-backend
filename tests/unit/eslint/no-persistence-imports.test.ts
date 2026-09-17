/**
 * `eslint/rules/no-persistence-imports` still fires. See `comment-links.test.ts` for why these
 * four rule tests carry one known-bad input each and no case table.
 */
import { RuleTester } from 'eslint';
import { noPersistenceImports } from '../../../eslint/rules/no-persistence-imports';

const tester = new RuleTester({
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module' }
});

/** Both halves of the rule on, so one bad input exercises the binding match. */
const STRICT = [{ bindings: ['Repository', 'Model'], paths: true }];

tester.run('no-persistence-imports', noPersistenceImports as never, {
    valid: [],
    invalid: [
        {
            // Through the barrel: the specifier says `@modules/users` and nothing else — only the
            // binding name gives the violation away.
            code: `import { userRepository } from '@modules/users';`,
            options: STRICT,
            errors: [{ messageId: 'binding' }]
        }
    ]
});
