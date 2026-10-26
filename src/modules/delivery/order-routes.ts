/**
 * @module
 * The one delivery door that sits under `/orders`: `POST /orders/{id}/process`. The verb names the
 * status it reaches (`cancel` → `cancelled`, `process` → `processing`), so the URL belongs to the
 * order; the module and its narrow `start:Shipment` key stay delivery's. Mounted at `/orders` by
 * `./module.ts`.
 */

import { Router } from 'express';
import { getAuth, isAuth, requirePermission } from '@kernel/middlewares/authorizations';
import { postProcessOrder } from './controllers/post-process-order';

/** Express router for the delivery operations that live under an order. */
export const orderRouter = Router();

// POST /orders/:id/process — begins fulfilment; moves the order paid -> processing.
// No `forced` variant, so no step-up guard: the admin override is the other reachable path here.
orderRouter.post(
    '/:id/process',
    getAuth,
    isAuth,
    requirePermission('start', 'Shipment'),
    postProcessOrder
);
