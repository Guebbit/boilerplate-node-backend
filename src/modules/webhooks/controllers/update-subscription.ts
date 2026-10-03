/**
 * @module
 * Controllers for `PUT /webhooks/subscriptions/:id` (replace) and `PATCH .../:id` (merge), built
 * on the shared `createUpdateController` factory. Neither verb touches the secret ring — that
 * lives on its own action routes, `rotate-subscription-secret.ts`/`remove-subscription-secret.ts`.
 */

import { createUpdateController } from '@infrastructure/surfaces/create-update-controller';
import { ReplaceWebhookSubscriptionBody, UpdateWebhookSubscriptionBody } from '@api/schemas.zod';
import { tenantCallerContextOf } from '@infrastructure/http/request';
import { webhooksService } from '../services';
import { presentWebhookSubscription } from '../presenters';

/**
 * `PUT` and `PATCH /webhooks/subscriptions/:id` — one handler pair over
 * `webhooksService.updateSubscription`, tenant-scoped throughout.
 */
export const { replace: replaceWebhookSubscription, update: updateWebhookSubscription } =
    createUpdateController({
        entity: 'webhookSubscription',
        notFoundKey: 'generic.error-not-found',
        replaceSchema: ReplaceWebhookSubscriptionBody,
        patchSchema: UpdateWebhookSubscriptionBody,
        update: (id, changes, request) =>
            webhooksService.updateSubscription(id, changes, tenantCallerContextOf(request)),
        present: (subscription) => presentWebhookSubscription(subscription)
    });
