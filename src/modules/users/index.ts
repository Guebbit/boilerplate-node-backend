/**
 * @module
 * Users — public barrel, the only surface a sibling module may import; lint errors on any reach
 * into internals like `@modules/users/service`. Wider than most: `account` needs `userRepository`
 * too, since it is a second service over the same record — the repo's one `shared-kernel`
 * relationship (`module-coupling-account` in `.dependency-cruiser.cjs`). `userModel` stays
 * unexported; nothing outside this module calls it.
 * See: docs/modules/users.md
 */

/** The record's business rules — what a sibling calls to read or change a user. */
export { userService } from './service';

/** Persistence, for `account` alone: a second service over the same record needs the queries. */
export { userRepository } from './repository';

/** The schema, the token-type enum, and the two pure helpers that travel with them. */
export { TokenType, zodUserSchema, hashToken, toUser } from './model';

/** The document shapes a sibling reads back. Types only — the model itself stays internal. */
export type { UserDocument, Token, OAuthAccount, TwoFactorMethodRecord } from './model';

/** Events this module emits. Importing the barrel is also what installs the payload declaration. */
export { USER_DELETED, USER_SETUP_REQUESTED } from './events';
