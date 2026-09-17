/**
 * @module
 * Users — public barrel, the only surface a sibling module may import (see
 * `docs/theory/strategic-ddd.md` §5 for the rule). Wider than most: `account` is the `users` end
 * of the one shared-kernel relationship in the repo, authenticating and co-administering the same
 * document this module owns. `userRepository` and the model's runtime stay inside even so — every
 * read or write, including `account`'s, goes through `userService`. `userModel` stays unexported;
 * nothing outside this module calls it.
 *
 * See: docs/modules/users.md
 */

export * from './service';

export * from './events';

/** A fixture user for a sibling's own tests. */
export { makeUser, PLAIN_PASSWORD } from './factories';
export type { UserOverrides, UserFixture } from './factories';

/** The schema, the token-type enum, and the pure helpers that travel with them. */
export { TokenType, zodUserSchema, hashToken, toUser, isLiveRefreshSession } from './model';

export type * from './model';
