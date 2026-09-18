/**
 * @module
 * Access — public barrel; the only surface a sibling module may import (see
 * `docs/theory/strategic-ddd.md` §5 for the rule). `repository.ts` and `model.ts`'s runtime
 * schemas stay unpublished, same as every module — `TenantDocument`/`MembershipDocument` are
 * exported as types only.
 *
 * See: docs/theory/authorization.md
 */

export * from './service';

export type * from './model';
