/**
 * @module
 * Route table for shop-tasks: one read, the counts behind the staff navigation badges. A session,
 * not an API key: every count is read as the caller, and a key resolves to no `AuthContext`, so it
 * would silently widen the orders scope.
 *
 * See: docs/modules/shop-tasks.md#the-nav-badge-summary
 */

import { Router } from 'express';
import { getAuth, isAuth } from '@kernel/middlewares/authorizations';
import { noStore } from '@infrastructure/http/middlewares/cache';
import { getShopWorkSummary } from './controllers/get-shop-work-summary';

/** Express router for the shop's work summary. */
export const router = Router();

// Signed in is the only gate: which counts come back is decided per key, by the caller's rules.
router.use(getAuth, isAuth);

// `noStore`: one person's view, which a shared cache must never hold — RFC 9111 §3.5.
router.get('/summary', noStore, getShopWorkSummary);
