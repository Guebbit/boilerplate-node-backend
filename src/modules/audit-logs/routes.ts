/**
 * @module
 * The `/audit` router: one read, gated on `audit.read` — a shop's own action history, for the
 * roles that hold the key rather than for the platform operator.
 *
 * See: docs/modules/audit-logs.md
 */

import { Router } from 'express';
import { getAuth, isAuth, requirePermission } from '@kernel/middlewares/authorizations';
import { getAudit } from './controllers/get-audit';

/** Express router for the tenant-facing audit trail. */
export const router = Router();

// The router's only route, guarded the same way `users/routes.ts` guards its whole surface.
router.use(getAuth, isAuth, requirePermission('audit.read'));

// GET /audit
router.get('/', getAudit);
