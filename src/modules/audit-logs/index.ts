/**
 * @module
 * Audit logs — public barrel; the only surface a sibling may import (see
 * `modules/products/index.ts` for the rule). `module.ts` registers the write path itself at
 * import time, and `observability` reads through this barrel to serve its own
 * `GET /observability/audit` — this module's own `GET /audit` reads the service directly instead,
 * since nothing outside the module needs to reach it.
 *
 * See: docs/modules/audit-logs.md
 */

// One export — the repository, model and their types are how `observability` reads the trail,
// which is this module's business, not the dashboard's.
export { auditLogService } from './service';
