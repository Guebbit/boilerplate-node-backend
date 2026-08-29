/**
 * Users — public barrel.
 *
 * The only surface a sibling module may import. Everything not re-exported here is internal, and
 * lint enforces that: reaching `@modules/users/service` from outside is an error, not a shortcut.
 *
 * This surface is wider than most, and deliberately so. `account` is a second service over the same
 * entity — signup, login and password reset all read and write the User collection — so it needs the
 * repository, not just the service. That is the cost of splitting authentication from the record it
 * authenticates; the alternative was one module serving two base paths.
 *
 * `userModel` is no longer among them, and its absence is the point. `account/session/jwt.ts` and
 * `account/services/token-cleanup.ts` used to take it and run their own `findOne`, `updateOne` and
 * `updateMany` against this collection — a second door to the same rows, from files that are not
 * repositories. They ask `userRepository` now, so the model has no caller outside this module — keep
 * it that way rather than re-publishing it on speculation.
 *
 * This is also the repo's one `shared-kernel` relationship: `account` reads and writes the same User
 * record from the other side, which is why that module's docblock says so and why this barrel is the
 * widest here. `module-coupling-account` in `.dependency-cruiser.cjs` is what holds the pair.
 */

export { userService } from './service';
export { userRepository } from './repository';
export { TokenType, zodUserSchema } from './model';
export type { UserDocument, Token } from './model';

/** Events this module emits. Importing the barrel is also what installs the payload declaration. */
export { USER_DELETED, USER_SETUP_REQUESTED } from './events';
