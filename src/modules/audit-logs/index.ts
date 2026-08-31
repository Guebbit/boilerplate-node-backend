/**
 * @module
 * Audit logs — public barrel; the only surface a sibling may import (see
 * `modules/products/index.ts` for the rule). Owns a collection and no URL: `module.ts` registers
 * the write path itself at import time, and `observability` reads through this barrel to serve
 * `GET /observability/audit`.
 *
 * See: docs/modules/audit-logs.md
 */

// One export — the repository, model and their types are how `observability` reads the trail,
// which is this module's business, not the dashboard's.
export { auditLogService } from './service';
