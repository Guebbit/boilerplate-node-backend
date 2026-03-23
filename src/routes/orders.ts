import { Router } from 'express';
import {
  getAllOrders,
  getOrderById,
  createOrder,
  updateOrderStatus,
  deleteOrder,
} from '../controllers/orders';
import { isAuth, isAdmin } from '../middleware/auth';

const router = Router();

router.use(isAuth);

router.get('/', getAllOrders);
router.get('/:id', getOrderById);
router.post('/', createOrder);
router.put('/:id/status', isAdmin, updateOrderStatus);
router.delete('/:id', deleteOrder);

export default router;
