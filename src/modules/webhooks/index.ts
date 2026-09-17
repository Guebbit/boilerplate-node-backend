/**
 * @module
 * Webhooks — public barrel; the only surface a sibling may import (see
 * `docs/theory/strategic-ddd.md` §5 for the rule). `module.ts` wires the domain-event subscription
 * and the queue processor itself at import time. `secrets.ts` stays internal — signing/encrypting
 * a delivery secret is this module's own business, nothing a sibling calls.
 *
 * See: docs/modules/webhooks.md
 */

export * from './domain';

export * from './services';

export type * from './model';
