import { Router } from 'express';
import { getAuth, isAuth, isAdmin } from '@middlewares/authorizations';

export const router = Router();

router.use(getAuth, isAuth, isAdmin);

// Admin observability endpoints were removed in favor of Grafana + /healthz + /readyz.
// Add domain-specific admin routes here.
