/**
 * @module
 * Antibot — public barrel; the only surface a sibling module may import (the rule
 * is linked below). Publishes the service `GET /config` composes;
 * everything else this module owns is wiring (`module.ts`, `routes.ts`, `controllers/`), which a
 * barrel never publishes. The gate itself is a cross-cutting middleware (`humanChallengeGate`), so
 * `account` and `tasks` depend on `infrastructure/http/middlewares/human-challenge` and
 * `infrastructure/adapters/antibot` directly rather than on this module.
 *
 * @see docs/modules/antibot.md#its-neighbourhood
 * @see docs/understand/strategic-ddd.md#_5-published-language-—-the-barrel
 */

export * from './service';
