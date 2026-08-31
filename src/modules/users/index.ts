/**
 * @module
 * Users — public barrel. The only surface a sibling module may import; lint enforces it by
 * erroring on any reach into internals like `@modules/users/service`.
 *
 * Wider than most, deliberately: `account` is a second service over the same User record (signup,
 * login, password reset), so it needs `userRepository` too — the repo's one `shared-kernel`
 * relationship, held by `module-coupling-account` in `.dependency-cruiser.cjs`. `userModel` is
 * deliberately not exported: nothing outside this module calls it anymore.
 *
 * See: docs/modules/users.md
 */

export { userService } from './service';
export { userRepository } from './repository';
export { TokenType, zodUserSchema } from './model';
export type { UserDocument, Token } from './model';

/** Events this module emits. Importing the barrel is also what installs the payload declaration. */
export { USER_DELETED, USER_SETUP_REQUESTED } from './events';
