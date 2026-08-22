/**
 * `eslint/rules/no-hardcoded-user-text` — user-facing copy must come from a dictionary.
 *
 * The rule reads only the `errors` argument of the two reject carriers, and within it only what
 * a user sees: bare string elements and `message:` values. The valid cases pin down what the
 * rule must NOT flag — `code:` identifiers, `t(…)` calls, templates with expressions — because
 * over-reporting is how a rule teaches people to silence it.
 *
 * `tester.run` sits at the top level: RuleTester emits its own describe/it blocks, and jest
 * refuses describes nested inside a test.
 */
import { RuleTester } from 'eslint';
import { noHardcodedUserText } from '../../../eslint/rules/no-hardcoded-user-text';

const tester = new RuleTester({
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module' }
});

tester.run('no-hardcoded-user-text', noHardcodedUserText as never, {
    valid: [
        // Dictionary copy is the required spelling.
        `rejectResponse(response, 404, [t('products.not-found')]);`,
        `generateReject(422, [{ code: 'invalid-body', message: t('common.invalid') }]);`,
        // `code:` is technician-facing and may be a literal.
        `rejectResponse(response, 422, [{ code: 'invalid-body', message: t('x') }]);`,
        // A template WITH expressions is not hardcoded copy.
        'rejectResponse(response, 404, [t(`products.${kind}`)]);',
        // Other calls with string arrays are none of this rule's business.
        `logger.warn(['literal text']);`,
        // No array argument → nothing to inspect.
        `rejectResponse(response, 500);`
    ],
    invalid: [
        {
            code: `rejectResponse(response, 404, ['Product not found']);`,
            errors: [{ messageId: 'literal' }]
        },
        {
            code: `generateReject(422, [{ message: 'Invalid body' }]);`,
            errors: [{ messageId: 'literal' }]
        },
        {
            // A no-expression template literal is still hardcoded copy.
            code: 'rejectResponse(response, 404, [`Not found`]);',
            errors: [{ messageId: 'literal' }]
        },
        {
            // One literal among dictionary entries is still one literal too many.
            code: `rejectResponse(response, 422, [t('a'), 'literal', { message: t('b') }]);`,
            errors: [{ messageId: 'literal' }]
        }
    ]
});
