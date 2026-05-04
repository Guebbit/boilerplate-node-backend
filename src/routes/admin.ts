import { Router } from 'express';
import { getAuth, isAuth, isAdmin } from '@middlewares/authorizations';
import { getAdminHealth } from '@controllers/admin/get-health';
import { getAdminMetricsSummary } from '@controllers/admin/get-metrics-summary';
import { getAdminAuditLogs } from '@controllers/admin/get-audit-logs';

export const router = Router();

router.use(getAuth, isAuth, isAdmin);

/** GET /admin/health — JSON health summary for the admin dashboard. */
router.get('/health', getAdminHealth);

/** GET /admin/metrics/summary — Key operational metrics as JSON. */
router.get('/metrics/summary', getAdminMetricsSummary);

/** GET /admin/audit — Recent audit events from the in-memory ring buffer. */
router.get('/audit', getAdminAuditLogs);
