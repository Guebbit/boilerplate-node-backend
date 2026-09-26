/**
 * @module
 * Controllers for `PUT /webhooks/subscriptions/:id` (replace) and `PATCH .../:id` (merge), built
 * on the shared `createUpdateController` factory. Neither verb touches the secret ring — that
 * lives on its own action routes, `rotate-subscription-secret.ts`/`remove-subscription-secret.ts`.
 */

import { createUpdateController } from '@infrastructure/surfaces/create-update-controller';
import { ReplaceWebhookSubscriptionBody, UpdateWebhookSubscriptionBody } from '@api/schemas.zod';
import type { WebhookSubscription } from '@types';
import { tenantCallerContextOf } from '@infrastructure/http/request';
import { webhooksService } from '../services';

/**
 * `PUT` and `PATCH /webhooks/subscriptions/:id` — one handler pair over
 * `webhooksService.updateSubscription`, tenant-scoped throughout.
 */
export const { replace: replaceWebhookSubscription, update: updateWebhookSubscription } =
    createUpdateController({
        entity: 'webhookSubscription',
        replaceSchema: ReplaceWebhookSubscriptionBody,
        patchSchema: UpdateWebhookSubscriptionBody,
        update: (id, changes, request) =>
            webhooksService.updateSubscription(id, changes, tenantCallerContextOf(request)),
        // `.toJSON()` applies the model's `_id` → `id` transform; the document is typed as stored,
        // not as the wire shape `WebhookSubscription` promises.
        present: (subscription) => subscription.toJSON() as WebhookSubscription
    });
