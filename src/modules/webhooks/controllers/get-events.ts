/**
 * @module
 * Controller for `GET /webhooks/events` — the public event catalogue.
 */

import type { Request, Response } from 'express';
import { successResponse } from '@infrastructure/http/response';
import { tenantCallerContextOf } from '@infrastructure/http/request';
import type { WebhookEventCatalogEntry } from '@types';
import { webhooksService } from '../services';

/**
 * GET /webhooks/events
 * Every event a subscription may filter on, each with whether the caller may subscribe to it
 * (`actions.subscribe`: the event is `public`, or the caller holds its read rule).
 */
export const listWebhookEvents = (request: Request, response: Response) =>
    successResponse<{ items: WebhookEventCatalogEntry[] }>(response, {
        items: webhooksService.listWebhookEventCatalog(tenantCallerContextOf(request).caller)
    });
