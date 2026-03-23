import { Router } from 'express';
import authRoutes from './auth';
import userRoutes from './users';
import productRoutes from './products';
import orderRoutes from './orders';

const router = Router();

router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/products', productRoutes);
router.use('/orders', orderRoutes);

export default router;
