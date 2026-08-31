/**
 * @module
 * Users — public barrel, the only surface a sibling module may import; lint errors on any reach
 * into internals like `@modules/users/service`. Wider than most: `account` needs `userRepository`
 * too, since it is a second service over the same record — the repo's one `shared-kernel`
 * relationship (`module-coupling-account` in `.dependency-cruiser.cjs`). `userModel` stays
 * unexported; nothing outside this module calls it.
 * See: docs/modules/users.md
 */

export { userService } from './service';
export { userRepository } from './repository';
export { TokenType, zodUserSchema } from './model';
export type { UserDocument, Token } from './model';

/** Events this module emits. Importing the barrel is also what installs the payload declaration. */
export { USER_DELETED, USER_SETUP_REQUESTED } from './events';
