/**
 * @module
 * Observability — public barrel; the only surface a sibling module may import (see
 * `docs/theory/strategic-ddd.md` §5 for the rule). Publishes this module's readiness/telemetry
 * services (`./services`) — nothing imports them from outside today, but the barrel is where a
 * future caller would reach them, not a deep import into this module.
 *
 * See: docs/modules/observability.md
 */

export * from './services';
