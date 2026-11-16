/**
 * @module
 * Observability — public barrel; the only surface a sibling module may import (the rule
 * is linked below). Publishes this module's readiness/telemetry
 * services (`./services`) — nothing imports them from outside today, but the barrel is where a
 * future caller would reach them, not a deep import into this module.
 *
 * @see docs/modules/observability.md#its-neighbourhood
 * @see docs/understand/strategic-ddd.md#_5-published-language-—-the-barrel
 */

export * from './services';
