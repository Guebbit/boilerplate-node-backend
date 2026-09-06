/**
 * @module
 * Route table for antibot: two public routes — what the active human-challenge provider needs the
 * client to render, and, for a provider this server hosts itself, the work to render it with.
 * Bounded only by the global burst brake (`app/security.ts`): neither writes anything, so they
 * cost no more than any other request a scanner sends.
 */

import { Router } from 'express';
import { getAntibotConfig } from './controllers/get-antibot-config';
import { getAntibotChallenge } from './controllers/get-antibot-challenge';

/** Express router for antibot endpoints (public provider configuration). */
export const router = Router();

router.get('/config', getAntibotConfig);
router.get('/challenge', getAntibotChallenge);
