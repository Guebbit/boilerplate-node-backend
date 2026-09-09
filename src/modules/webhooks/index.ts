/**
 * @module
 * Webhooks — public barrel; the only surface a sibling may import (see `modules/products/index.ts`
 * for the rule). `module.ts` wires the domain-event subscription and the queue processor itself at
 * import time — nothing outside this module reacts to a webhook event or attempts a delivery, so
 * the only thing exported here is what `ops/sweep-webhook-retries.ts` needs to run the retry sweep.
 *
 * See: docs/modules/webhooks.md
 */

export { sweepDueWebhookDeliveries } from './services';
