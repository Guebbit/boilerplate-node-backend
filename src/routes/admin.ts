import { Router } from 'express';
import { getAuth, isAuth, isAdmin } from '@middlewares/authorizations';
import { getAllOrders } from '@controllers/orders/get-all-orders';
import { getAdminHealth } from '@controllers/admin/get-admin-health';
import { getAdminMetrics } from '@controllers/admin/get-admin-metrics';
import { getAdminAuditLogs } from '@controllers/admin/get-admin-audit';

/** Express router for privileged admin endpoints (health, metrics summary, audit log, all orders). */
export const router = Router();

router.use(getAuth, isAuth, isAdmin);

router.get('/health', getAdminHealth);
router.get('/metrics', getAdminMetrics);
router.get('/audit', getAdminAuditLogs);

// GET /admin/orders — list all orders (no user scope)
router.get('/orders', getAllOrders);
