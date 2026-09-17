/**
 * @module
 * Audit logs — public barrel; the only surface a sibling may import (see
 * `docs/theory/strategic-ddd.md` §5 for the rule). `module.ts` registers the write path itself at
 * import time.
 *
 * See: docs/modules/audit-logs.md
 */

export * from './service';

export type * from './model';
