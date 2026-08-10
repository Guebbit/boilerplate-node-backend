/**
 * Route mounting.
 *
 * The one place that knows which domains this API serves, and therefore the file plan 03 replaces
 * with a module registry — at which point adding a domain stops touching a shared file at all.
 */

import type { Express, Request, Response } from 'express';
import { rejectResponse } from '@core/http/response';

import { router as productRoutes } from '../routes/products';
import { router as authRoutes } from '../routes/account';
import { router as orderRoutes } from '../routes/orders';
import { router as cartRoutes } from '../routes/cart';
import { router as userRoutes } from '../routes/users';
import { router as observabilityRoutes } from '../routes/observability';
import { router as feedbackRoutes } from '../routes/feedback';
import { router as localeRoutes } from '../routes/locales';
import { router as systemRoutes } from '../routes';

/**
 * Mount every domain router, then the 404 catch-all.
 *
 * The catch-all is part of this install rather than the error handling one because it depends on
 * the mounts above: it has to be the last route registered, and separating the two would let a
 * later mount slip in behind it and never be reached.
 *
 * @param app - the express application to configure
 */
export const installRoutes = (app: Express): void => {
    /**
     * REST API routes — domain-driven routing.
     */
    app.use('/account', authRoutes);
    app.use('/products', productRoutes);
    app.use('/orders', orderRoutes);
    app.use('/cart', cartRoutes);
    app.use('/users', userRoutes);
    app.use('/observability', observabilityRoutes);
    app.use('/feedback', feedbackRoutes);
    app.use('/locales', localeRoutes);
    app.use('/', systemRoutes);

    /**
     * 404 handler — unmatched routes.
     */
    app.use((request: Request, response: Response) => {
        rejectResponse(response, 404);
    });
};
