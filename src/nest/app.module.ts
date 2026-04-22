import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { SystemController } from '@nest/controllers/system.controller';
import { AccountController } from '@nest/controllers/account.controller';
import { ProductsController } from '@nest/controllers/products.controller';
import { OrdersController } from '@nest/controllers/orders.controller';
import { CartController } from '@nest/controllers/cart.controller';
import { UsersController } from '@nest/controllers/users.controller';
import { OptionalAuthGuard } from '@nest/guards/optional-auth.guard';
import { RequestContextInterceptor } from '@nest/interceptors/request-context.interceptor';
import { RequestMetricsInterceptor } from '@nest/interceptors/request-metrics.interceptor';
import { CacheResponseInterceptor } from '@nest/interceptors/cache-response.interceptor';
import { InvalidateCacheInterceptor } from '@nest/interceptors/invalidate-cache.interceptor';

/**
 * Root Nest module.
 *
 * All API controllers are registered here and cross-cutting concerns
 * (optional auth + tracing/metrics) are wired globally via framework providers.
 */
@Module({
    controllers: [
        SystemController,
        AccountController,
        ProductsController,
        OrdersController,
        CartController,
        UsersController
    ],
    providers: [
        CacheResponseInterceptor,
        InvalidateCacheInterceptor,
        {
            provide: APP_GUARD,
            useClass: OptionalAuthGuard
        },
        {
            provide: APP_INTERCEPTOR,
            useClass: RequestContextInterceptor
        },
        {
            provide: APP_INTERCEPTOR,
            useClass: RequestMetricsInterceptor
        }
    ]
})
export class AppModule {}
