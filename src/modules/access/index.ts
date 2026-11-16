/**
 * @module
 * Access — public barrel; the only surface a sibling module may import (the rule
 * is linked below). It publishes `services/` and the pure rules in
 * `domain/`. `repository.ts` and `model.ts`'s runtime
 * schemas stay unpublished, same as every module — `TenantDocument`/`MembershipDocument` are
 * exported as types only.
 *
 * @see docs/understand/authorization.md#where-it-lives
 * @see docs/understand/strategic-ddd.md#_5-published-language-—-the-barrel
 */

export * from './services';

export * from './domain';

export type * from './model';
