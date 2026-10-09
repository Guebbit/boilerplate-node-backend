/**
 * @module
 * Analytics relay — public barrel; the only surface a sibling module may import (see
 * `docs/theory/strategic-ddd.md` §5 for the rule). Empty on purpose: everything this module owns
 * is wiring (`module.ts`, `routes.ts`, `controllers/`), which a barrel never publishes. The
 * provider port it feeds lives in `infrastructure/observability/analytics`.
 *
 * See: docs/modules/analytics.md
 */

export {};
