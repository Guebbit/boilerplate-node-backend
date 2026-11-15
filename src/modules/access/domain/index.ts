/**
 * @module
 * Access — domain layer: pure rules only, lint-guaranteed free of Express, Mongoose and every
 * tier. The protection rules, which `users` and the money modules ask without a lookup.
 *
 * See `docs/understand/domain-layer.md`.
 */

export { isOwnThing, mayChangeAccount, ownOrderFlag } from './protection';
