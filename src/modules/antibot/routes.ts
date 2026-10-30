/**
 * @module
 * Route table for antibot: one public route — for a provider this server hosts itself, the work to
 * render its widget with. What the client renders is `antibot` on `GET /config`.
 * Bounded only by the global burst brake (`app/security.ts`): it writes nothing, so it
 * costs no more than any other request a scanner sends.
 */

import { Router } from 'express';
import { getAntibotChallenge } from './controllers/get-antibot-challenge';

/** Express router for antibot endpoints (public provider configuration). */
export const router = Router();

// GET /antibot/challenge — the challenge a self-hosted provider issues (404 when the active one issues none).
router.get('/challenge', getAntibotChallenge);
