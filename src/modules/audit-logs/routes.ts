/**
 * @module
 * The `/audit` router: one read, gated on `audit.any.read` — a shop's own action history, for the
 * roles that hold the key rather than for the platform operator.
 *
 * See: docs/modules/audit-logs.md
 */

import { Router } from 'express';
import { getAuth, isAuthOrCredential, requirePermission } from '@kernel/middlewares/authorizations';
import { getAudit } from './controllers/get-audit';

/** Express router for the tenant-facing audit trail. */
export const router = Router();

// The router's only route, guarded the same way `users/routes.ts` guards its whole surface.
// `isAuthOrCredential`: a compliance or SIEM integration pulling the trail is a machine, and
// `audit.any.read` is a tenant key like any other. The controller reads no `authContext`.
router.use(getAuth, isAuthOrCredential, requirePermission('audit.any.read'));

// GET /audit
router.get('/', getAudit);
