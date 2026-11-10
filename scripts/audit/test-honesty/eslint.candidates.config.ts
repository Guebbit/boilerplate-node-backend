/**
 * @module
 * Report-only ESLint config for the `test-honesty` audit: lists every test whose assertions are
 * ALL weak. It is not part of the lint gate — about 113 hits for about 6 real findings — so it is
 * only ever run by `npm run audit:test-candidates`.
 */
import type { Linter } from 'eslint';
import * as parser from '@typescript-eslint/parser';

/** Matchers that pass for almost any value, so a test holding only these checks very little. */
const WEAK_MATCHERS = 'BeDefined|BeTruthy|BeInstanceOf|BeNull|BeUndefined|Throw';

/** A matcher call (`toXxx`) from the weak list. */
const WEAK_CALL = `CallExpression[callee.property.name=/^to(${WEAK_MATCHERS})$/]`;

/** A matcher call (`toXxx`) that is NOT in the weak list: any real assertion. */
const STRONG_CALL = `CallExpression[callee.property.name=/^to(?!(${WEAK_MATCHERS})$)/]`;

/**
 * `it(...)` / `test(...)` holding at least one weak matcher and no other matcher.
 * Known false positives, fine for a candidate list: an asserting helper (`refused(...)`) and
 * supertest's `.expect(200)` do not count as strong.
 */
export const WEAK_ONLY_SELECTOR = `CallExpression[callee.name=/^(it|test)$/]:has(${WEAK_CALL}):not(:has(${STRONG_CALL}))`;

/**
 * The config. ESLint: `no-restricted-syntax` reports any node matching an esquery selector.
 * https://eslint.org/docs/latest/rules/no-restricted-syntax
 */
const candidatesConfig: Linter.Config[] = [
    {
        files: ['**/*.ts'],
        languageOptions: { parser },
        rules: {
            'no-restricted-syntax': [
                'warn',
                { selector: WEAK_ONLY_SELECTOR, message: 'every assertion in this test is weak' }
            ]
        }
    }
];

export default candidatesConfig;
