/**
 * @module
 * Access — domain layer: pure rules only, lint-guaranteed free of Express, Mongoose and every
 * tier. The protection rules, which `users` and the money modules ask without a lookup.
 *
 * @see docs/understand/domain-layer.md#the-rule-enforced-by-lint
 */

export { isOwnThing, mayChangeAccount, ownOrderFlag } from './protection';
