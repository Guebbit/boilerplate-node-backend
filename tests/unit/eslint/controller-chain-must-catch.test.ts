/**
 * `eslint/rules/controller-chain-must-catch` still fires. See `comment-links.test.ts` for why
 * these four rule tests carry one known-bad input each and no case table.
 */
import { RuleTester } from 'eslint';
import { controllerChainMustCatch } from '../../../eslint/rules/controller-chain-must-catch';

const tester = new RuleTester({
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module' }
});

tester.run('controller-chain-must-catch', controllerChainMustCatch as never, {
    valid: [],
    invalid: [
        {
            // An exported handler with a .then and no .catch: the exact bug the rule exists for.
            code: `export const getThings = (request, response) => {
                service.list().then((data) => response.json(data));
            };`,
            errors: [{ messageId: 'missing' }]
        }
    ]
});
