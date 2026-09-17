/**
 * `eslint/rules/barrel-allowed-sources` still fires. See `comment-links.test.ts` for why these
 * rule tests carry one known-bad input each and no case table — one per CHECK here, since the
 * star, named and model-name-heuristic paths each independently guard against a repository or a
 * wiring file leaving the barrel. The typescript-eslint parser is required, not the default
 * espree: `export type *` is TypeScript-only syntax, so a case exercising it can't parse otherwise.
 */
import { RuleTester } from 'eslint';
import * as parser from '@typescript-eslint/parser';
import { barrelAllowedSources } from '../../../eslint/rules/barrel-allowed-sources';

const tester = new RuleTester({
    languageOptions: { parser, ecmaVersion: 'latest', sourceType: 'module' }
});

tester.run('barrel-allowed-sources', barrelAllowedSources as never, {
    valid: [
        {
            // The model may leave a barrel as types — `export *` from a repository or wiring
            // file never may, in any form; this is the counterpart the invalid cases below check.
            code: `export type * from './model';`
        }
    ],
    invalid: [
        {
            // The model may only leave a barrel as types — `export *` here would also publish the
            // mongoose schema and the model object, exactly what this rule keeps out.
            code: `export * from './model';`,
            errors: [{ messageId: 'modelAsValue' }]
        },
        {
            code: `export * from './repository';`,
            errors: [{ messageId: 'repositoryExport' }]
        },
        {
            // Wiring stays out even spelled as a type-only star export.
            code: `export type * from './routes';`,
            errors: [{ messageId: 'wiringExport' }]
        },
        {
            // A named re-export says what it publishes, but that includes a repository just the
            // same — `productRepository` reached the barrel this way once, undetected.
            code: `export { productRepository } from './repository';`,
            errors: [{ messageId: 'repositoryExport' }]
        }
    ]
});
