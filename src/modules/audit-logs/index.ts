/**
 * Audit logs — public barrel.
 *
 * The only surface a sibling module may import. See `modules/products/index.ts` for the rule.
 *
 * This module owns a collection and no URL. The write path is registered by `app.ts` as the sink
 * behind `@infrastructure/observability/audit`, and the read path is served by `observability`, which owns
 * `GET /observability/audit` and reaches the service through this barrel.
 */

export { auditLogService } from './service';
export { auditLogRepository } from './repository';
export { auditLogModel } from './model';
export type { AuditLogDocument } from './model';
export type { AuditLogSearchFilters } from './repository';
