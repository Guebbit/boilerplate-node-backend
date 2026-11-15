/**
 * @module
 * Users — public barrel, the only surface a sibling module may import (see
 * `docs/understand/strategic-ddd.md` §5 for the rule). Wider than most: `account` is the `users` end
 * of the one domain-primitives relationship in the repo, authenticating and co-administering the same
 * document this module owns. `userRepository` and the model's runtime stay inside even so. A sibling
 * goes through `userService`; `account`'s own steps sit behind `friends/account.ts` (see §5), which
 * the barrel does not publish. `userModel` stays unexported; nothing outside this module calls it.
 *
 * @see docs/modules/users.md
 */

export * from './services';

export * from './events';

export * from './emails';

/** The schema's Zod twin. */
export type * from './model';
