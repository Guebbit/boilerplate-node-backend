/**
 * @module
 * Observability — public barrel; the only surface a sibling module may import (see
 * `docs/theory/strategic-ddd.md` §5 for the rule). Empty on purpose: everything this module owns
 * is wiring (`module.ts`, `routes.ts`, `controllers/`) — the dashboard reads other modules through
 * their own barrels (`audit-logs`) or the metrics registry by name, but nothing reads this module
 * back.
 *
 * See: docs/modules/observability.md
 */

// eslint-disable-next-line unicorn/require-module-specifiers -- every module gets a barrel (docs/theory/strategic-ddd.md §5); this one has nothing to publish yet
export {};
