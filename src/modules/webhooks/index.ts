/**
 * @module
 * Webhooks — public barrel; the only surface a sibling may import (see
 * `docs/theory/strategic-ddd.md` §5 for the rule). `module.ts` wires the domain-event subscription
 * and the queue processor itself at import time. `secrets.ts` and `require-enabled.ts` stay
 * internal — signing/encrypting a delivery secret and gating a route are this module's own
 * business, nothing a sibling calls.
 *
 * See: docs/modules/webhooks.md
 */

export * from './domain';

export * from './services';

export type * from './model';
