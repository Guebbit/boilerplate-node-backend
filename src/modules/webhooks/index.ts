/**
 * @module
 * Webhooks — public barrel; the only surface a sibling may import (see
 * `docs/theory/strategic-ddd.md` §5 for the rule). `module.ts` declares the domain-event
 * subscription and the queue consumer on its own manifest entry — neither runs at import time.
 * `secrets.ts` stays internal — signing/encrypting a delivery secret is this module's own
 * business, nothing a sibling calls.
 *
 * See: docs/modules/webhooks.md
 */

export * from './services';

export * from './domain';

export * from './emails';

export type * from './model';
