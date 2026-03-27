import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { ProductsModule } from './modules/products/products.module';
import { OrdersModule } from './modules/orders/orders.module';
import { CartModule } from './modules/cart/cart.module';
import { SystemModule } from './modules/system/system.module';
import { getAuthMiddleware } from './middlewares/get-auth.middleware';

/**
 * Root application module.
 * Replaces src/app.ts – global middleware and route registration.
 *
 * Global middleware (helmet, body-parser, cookie-parser, rate-limiter, logger)
 * are applied in src/main.ts via app.use() before the NestJS pipeline.
 *
 * GetAuthMiddleware (optional JWT population) is applied here for all routes
 * so that request.user is populated before any guard or controller runs.
 */
@Module({
    imports: [
        AuthModule,
        UsersModule,
        ProductsModule,
        OrdersModule,
        CartModule,
        SystemModule,
    ],
})
export class AppModule implements NestModule {
    configure(consumer: MiddlewareConsumer): void {
        consumer
            .apply(getAuthMiddleware)
            .forRoutes('*');
    }
}
