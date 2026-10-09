/**
 * @module
 * Route table for the analytics relay: one public write. Open to guests, since browsing is what
 * guests do; `getAuth` only lets a signed-in visitor's events carry their id. Bounded by the global
 * burst brake (`app/security.ts`): the route writes nothing, and without consent it does no work.
 */

import { Router } from 'express';
import { getAuth } from '@kernel/middlewares/authorizations';
import { postAnalyticsEvent } from './controllers/post-analytics-event';

/** Express router for the analytics relay. */
export const router = Router();

// POST /analytics/events — one browsing event; 204 whether or not it was recorded.
router.post('/events', getAuth, postAnalyticsEvent);
