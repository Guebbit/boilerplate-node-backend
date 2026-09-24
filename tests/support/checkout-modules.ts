import { registerModules } from '@kernel/registry';
import type { AppModule } from '@kernel/registry';
import accountModule from '@modules/account/module';
import cartModule from '@modules/cart/module';
import deliveryModule from '@modules/delivery/module';
import inventoryModule from '@modules/inventory/module';
import ordersModule from '@modules/orders/module';
import productsModule from '@modules/products/module';
import usersModule from '@modules/users/module';

/**
 * Registers the module set every checkout-flow test needs: an account to buy as, a product to
 * buy, a cart to hold it, delivery and inventory to price and reserve it, and orders to place it.
 * `paymentsModule` is deliberately not part of the fixed set — only the tests that actually
 * exercise payment code pass it through `extra`, so the rest don't register subscriptions they
 * never assert on.
 * @param extra - additional modules a specific suite also needs (e.g. `paymentsModule`)
 */
export const registerCheckoutModules = (extra: AppModule[] = []): void => {
    registerModules([
        accountModule,
        deliveryModule,
        productsModule,
        usersModule,
        inventoryModule,
        ordersModule,
        cartModule,
        ...extra
    ]);
};
