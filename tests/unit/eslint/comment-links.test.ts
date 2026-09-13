/**
 * `eslint/rules/comment-links` still fires — a LIVENESS check, not a case table.
 *
 * The exhaustive cases are gone on purpose. Each local rule runs against this repo's own ~1,000
 * files on every `npm run lint`, so a FALSE POSITIVE surfaces in seconds and needs no test. What
 * `lint` cannot show is the other direction: a rule that has quietly stopped matching anything
 * looks exactly like a clean run. One known-bad input per rule is what tells the two apart.
 */
import { RuleTester } from 'eslint';
import { commentLinks } from '../../../eslint/rules/comment-links';

const tester = new RuleTester({
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module' }
});

tester.run('comment-links', commentLinks as never, {
    valid: [],
    invalid: [
        {
            code: '// See IMAGE_PIPELINE_PLAN.md for the failure-mode table.\nconst a = 1;',
            errors: [{ messageId: 'unstable' }]
        }
    ]
});
