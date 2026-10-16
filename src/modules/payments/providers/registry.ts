/**
 * @module
 * The payment provider registry, on its own so a double can register itself without loading the
 * module: this file imports nothing at runtime but the registry helper, where `./index` pulls in
 * the config, `orders` and everything under them.
 *
 * Production registers nothing here — a real PSP adds its own file and one `registerPaymentProvider`
 * call. The `fake` provider is a test double and lives in `scenarios/support/doubles/`.
 */

import { createSharedProviderRegistry } from '@infrastructure/runtime/provider-registry';
import type { PaymentProvider } from './index';

/**
 * Every implementation this process knows, shared across module instances (see
 * `createSharedProviderRegistry`) so a double registered at preload survives a module reset.
 */
export const paymentProviderRegistry = createSharedProviderRegistry<PaymentProvider>('payments');

/**
 * Add (or, in a test, override) one implementation without editing any module file. It is
 * registered under its own `name`, the value `NODE_PAYMENT_PROVIDER` selects it by and the one
 * persisted on each payment, so the two can never disagree.
 *
 * @param provider - the implementation
 */
export const registerPaymentProvider = (provider: PaymentProvider): void =>
    paymentProviderRegistry.register(provider.name, provider);
