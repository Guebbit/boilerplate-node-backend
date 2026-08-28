/**
 * Audit logs — public barrel.
 *
 * The only surface a sibling module may import. See `modules/products/index.ts` for the rule.
 *
 * This module owns a collection and no URL. The write path is registered by `module.ts` itself, at
 * import time, as the sink behind `@infrastructure/observability/audit` — deliberately not by
 * `app.ts`, which would have to name a domain to do it; the reasoning is beside the call. The read
 * path is served by `observability`, which owns `GET /observability/audit` and reaches the service
 * through this barrel.
 */

/*
 * One export, because `observability` needs one thing: a service to read the trail with. The
 * repository, the model and their types are how that reading is done, which is this module's
 * business and not the dashboard's.
 */
export { auditLogService } from './service';
