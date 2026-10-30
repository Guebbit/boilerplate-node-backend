/**
 * @module
 * Antibot — public barrel; the only surface a sibling module may import (see
 * `docs/theory/strategic-ddd.md` §5 for the rule). Publishes the service `GET /config` composes;
 * everything else this module owns is wiring (`module.ts`, `routes.ts`, `controllers/`), which a
 * barrel never publishes. The gate itself is a cross-cutting middleware (`humanChallengeGate`), so
 * `account` and `tickets` depend on `infrastructure/http/middlewares/human-challenge` and
 * `infrastructure/adapters/antibot` directly rather than on this module.
 *
 * See: docs/modules/antibot.md
 */

export * from './service';
