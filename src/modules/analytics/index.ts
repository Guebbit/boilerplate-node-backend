/**
 * @module
 * Analytics relay — public barrel; the only surface a sibling module may import (the rule
 * is linked below). The relay service is the published surface;
 * everything else this module owns is wiring (`module.ts`, `routes.ts`, `controllers/`), which a
 * barrel never publishes. The provider port it feeds lives in
 * `infrastructure/observability/analytics`.
 *
 * @see docs/modules/analytics.md#its-neighbourhood
 * @see docs/understand/strategic-ddd.md#_5-published-language-—-the-barrel
 */

export * from './services';
