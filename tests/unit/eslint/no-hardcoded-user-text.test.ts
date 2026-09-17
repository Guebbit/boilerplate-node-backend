/**
 * `eslint/rules/no-hardcoded-user-text` still fires. See `comment-links.test.ts` for why these
 * four rule tests carry one known-bad input each and no case table.
 */
import { RuleTester } from 'eslint';
import { noHardcodedUserText } from '../../../eslint/rules/no-hardcoded-user-text';

const tester = new RuleTester({
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module' }
});

tester.run('no-hardcoded-user-text', noHardcodedUserText as never, {
    valid: [],
    invalid: [
        {
            code: `rejectResponse(response, 404, ['Product not found']);`,
            errors: [{ messageId: 'literal' }]
        }
    ]
});
