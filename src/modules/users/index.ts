/**
 * Users — public barrel.
 *
 * The only surface a sibling module may import. Everything not re-exported here is internal, and
 * lint enforces that: reaching `@modules/users/service` from outside is an error, not a shortcut.
 *
 * This surface is wider than most, and deliberately so. `account` is a second service over the same
 * entity — signup, login and password reset all read and write the User collection — so it needs the
 * model and the repository, not just the service. That is the cost of splitting authentication from
 * the record it authenticates; the alternative was one module serving two base paths.
 *
 * It is also the repo's one `shared-kernel` edge, declared as such in `account/module.ts`. The width
 * here and the label there are the same fact written twice, which is the point: a wide barrel should
 * be visible on the context map rather than only to whoever opens this file.
 */

export { userService } from './service';
export { userRepository } from './repository';
export { userModel, TokenType } from './model';
export { zodUserSchema } from './validation';
export type { UserDocument, Token } from './model';

/** Events this module emits. Importing the barrel is also what installs the payload declaration. */
export { USER_DELETED } from './events';
