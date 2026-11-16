/**
 * @module
 * Audit logs — public barrel; the only surface a sibling may import (see
 * `docs/understand/strategic-ddd.md` §5 for the rule). `module.ts` registers the write path itself at
 * import time.
 *
 * @see docs/modules/audit-logs.md#its-neighbourhood
 */

export * from './service';

export type * from './model';
