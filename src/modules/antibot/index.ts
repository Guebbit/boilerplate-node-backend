/**
 * @module
 * Antibot — public barrel; the only surface a sibling module may import (see
 * `docs/theory/strategic-ddd.md` §5 for the rule). Empty on purpose: everything this module owns
 * is wiring (`module.ts`, `routes.ts`, `controllers/`), which a barrel never publishes. The gate
 * itself is a cross-cutting middleware (`humanChallengeGate`), so `account` and `feedback` depend
 * on `infrastructure/http/middlewares/human-challenge` and `infrastructure/adapters/antibot`
 * directly rather than on this module.
 *
 * See: docs/modules/antibot.md
 */

// eslint-disable-next-line unicorn/require-module-specifiers -- every module gets a barrel (docs/theory/strategic-ddd.md §5); this one has nothing to publish yet
export {};
