import { Router } from 'express';
import { getAuth, isAuth, isAdmin } from '@middlewares/authorizations';
import { getAllOrders } from '@controllers/orders/get-all-orders';

export const router = Router();

router.use(getAuth, isAuth, isAdmin);

// GET /admin/orders — list all orders (no user scope)
router.get('/orders', getAllOrders);
