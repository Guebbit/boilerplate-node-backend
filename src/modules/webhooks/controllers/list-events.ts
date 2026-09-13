/**
 * @module
 * Controller for `GET /webhooks/events` — the public event catalogue.
 */

import type { Request, Response } from 'express';
import { successResponse } from '@infrastructure/http/response';
import type { WebhookEventCatalogueEntry } from '@types';
import { listWebhookEventCatalogue } from '../services';

/**
 * GET /webhooks/events
 * Every event a subscription may filter on, served straight from `../asyncapi.yaml`.
 */
export const listWebhookEvents = (_request: Request, response: Response) =>
    successResponse<WebhookEventCatalogueEntry[]>(
        response,
        listWebhookEventCatalogue() as WebhookEventCatalogueEntry[]
    );
