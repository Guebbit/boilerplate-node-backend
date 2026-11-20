/**
 * Project-local rules, one file per rule so each is unit-tested with `RuleTester`
 * (`tests/unit/scripts/eslint/`). They live here, not in a published plugin: they are about THIS
 * repo's conventions and have one consumer.
 *
 * `controller-chain-must-catch`, `no-hardcoded-user-text`:
 *     a syntactic property, checked on the AST. Grepping for `.catch(` or hand-tokenizing quotes
 *     and paren depth is the mistake a cross-cutting test would make; the AST has no paren-in-a-
 *     template or comment-containing-`.catch(` failure mode, reports at the line, and shows up
 *     in the editor instead of in CI.
 * `no-persistence-imports`:
 *     "which layer holds a repository" needs the imported NAME as well as the specifier.
 *     `no-restricted-imports` sees only the specifier, and `{ userRepository } from
 *     '@modules/users'` hides the violation behind a barrel.
 * `max-depth-through-closures`:
 *     ESLint's `max-depth` restarts at zero inside every callback. This one keeps counting, so
 *     a `.then` chain cannot hide a fourth level behind a function boundary.
 * `barrel-allowed-sources`:
 *     the same problem one level up. `eslint-plugin-boundaries` says which module a FILE may
 *     import; this rule says which of a module's OWN files its `index.ts` may publish.
 */
import { barrelAllowedSources } from './barrel-allowed-sources';
import { commentLinks } from './comment-links';
import { controllerChainMustCatch } from './controller-chain-must-catch';
import { maxDepthThroughClosures } from './max-depth-through-closures';
import { noHardcodedUserText } from './no-hardcoded-user-text';
import { noPersistenceImports } from './no-persistence-imports';

/** The plugin's rule table: rule name (as used in `eslint.config.ts`) to implementation. */
export default {
    'barrel-allowed-sources': barrelAllowedSources,
    'comment-links': commentLinks,
    'controller-chain-must-catch': controllerChainMustCatch,
    'max-depth-through-closures': maxDepthThroughClosures,
    'no-hardcoded-user-text': noHardcodedUserText,
    'no-persistence-imports': noPersistenceImports
};
