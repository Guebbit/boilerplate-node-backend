import { Router } from 'express';
import { getAuth, isAuth, isAdmin } from '@middlewares/authorizations';
import { getAdminHealth } from '@controllers/admin/get-admin-health';
import { getAdminMetrics } from '@controllers/admin/get-admin-metrics';
import { getAdminAudit } from '@controllers/admin/get-admin-audit';

export const router = Router();

router.use(getAuth, isAuth, isAdmin);

router.get('/health', getAdminHealth);
router.get('/metrics', getAdminMetrics);
router.get('/audit', getAdminAudit);
