/**
 * `eslint/rules/barrel-allowed-sources` still fires. See `comment-links.test.ts` for why these
 * rule tests carry one known-bad input each and no case table.
 */
import { RuleTester } from 'eslint';
import { barrelAllowedSources } from '../../../eslint/rules/barrel-allowed-sources';

const tester = new RuleTester({
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module' }
});

tester.run('barrel-allowed-sources', barrelAllowedSources as never, {
    valid: [],
    invalid: [
        {
            // The model may only leave a barrel as types — `export *` here would also publish the
            // mongoose schema and the model object, exactly what B1 keeps out.
            code: `export * from './model';`,
            errors: [{ messageId: 'modelAsValue' }]
        }
    ]
});
