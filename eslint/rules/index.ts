/**
 * Project-local rules.
 *
 * `controller-chain-must-catch` and `no-hardcoded-user-text` check a syntactic property of the
 * source at the AST, not by reading the source as TEXT: grepping every controller for the string
 * `.catch(`, or hand-tokenizing quote state, escape characters and paren depth to find one
 * argument of one call, is the same mistake a cross-cutting test would make.
 *
 * A lint rule gets the parsed AST for free, reports at the offending line instead of naming a
 * file, and shows up in the editor while the code is being written rather than in CI afterwards.
 * The tokenizer's failure modes (a paren inside a template literal, a comment containing `.catch(`)
 * simply do not exist here.
 *
 * `no-persistence-imports` is here for the other reason a rule cannot be a built-in: the
 * question is "which layer is holding a repository", and answering it means reading the
 * imported NAME as well as the module specifier. `no-restricted-imports` only ever sees the
 * specifier, and a barrel import — `{ userRepository } from '@modules/users'` — hides the
 * violation there entirely.
 *
 * `barrel-allowed-sources` is the same shape of problem one level up: `eslint-plugin-boundaries`
 * answers "which module may a FILE import", but this rule is about which of a module's OWN files
 * its `index.ts` may publish — a question about the barrel's own export declarations, not about
 * an import edge between two modules.
 *
 * They live in this directory rather than in a published plugin package because they are about
 * THIS repo's conventions and have exactly one consumer. One file per rule so each can be
 * unit-tested with `RuleTester` — see `tests/unit/eslint/`.
 */
import { barrelAllowedSources } from './barrel-allowed-sources';
import { commentLinks } from './comment-links';
import { controllerChainMustCatch } from './controller-chain-must-catch';
import { noHardcodedUserText } from './no-hardcoded-user-text';
import { noPersistenceImports } from './no-persistence-imports';

export default {
    'barrel-allowed-sources': barrelAllowedSources,
    'comment-links': commentLinks,
    'controller-chain-must-catch': controllerChainMustCatch,
    'no-hardcoded-user-text': noHardcodedUserText,
    'no-persistence-imports': noPersistenceImports
};
