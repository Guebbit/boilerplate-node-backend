/**
 * @module
 * Audit logs — public barrel; the only surface a sibling may import (the rule
 * is linked below). `module.ts` registers the write path from
 * its `onRegistered` hook.
 *
 * @see docs/modules/audit-logs.md#its-neighbourhood
 * @see docs/understand/strategic-ddd.md#_5-published-language-—-the-barrel
 */

export * from './service';

export type * from './model';
