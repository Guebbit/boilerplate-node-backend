import { Router } from 'express';
import { getAuth, isAuth, isAdmin } from '@middlewares/authorizations';
import {
    getAdminActivity,
    getLoginHistory,
    getFailedLogins,
    getSuspiciousAlerts
} from '@controllers/admin/get-admin-activity';
import { putSuspiciousAlert } from '@controllers/admin/put-suspicious-alert';

export const router = Router();

router.use(getAuth, isAuth, isAdmin);

router.get('/activity', getAdminActivity);
router.get('/login-history', getLoginHistory);
router.get('/failed-logins', getFailedLogins);
router.get('/suspicious-alerts', getSuspiciousAlerts);
router.put('/suspicious-alerts/:id', putSuspiciousAlert);
