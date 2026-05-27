import { Router } from 'express';
import { getAuth, isAuth, isAdmin } from '@middlewares/authorizations';
import { getAdminHealth } from '@controllers/admin/get-admin-health';
import { getAdminMetricsSummary } from '@controllers/admin/get-admin-metrics-summary';
import { getAdminAuditLogs } from '@controllers/admin/get-admin-audit';

export const router = Router();

router.use(getAuth, isAuth, isAdmin);

router.get('/health', getAdminHealth);
router.get('/metrics/summary', getAdminMetricsSummary);
router.get('/audit', getAdminAuditLogs);
