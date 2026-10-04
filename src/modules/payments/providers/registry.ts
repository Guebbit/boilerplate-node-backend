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
 * Add (or, in a test, override) one implementation without editing any module file.
 *
 * @param name - the value `NODE_PAYMENT_PROVIDER` selects it by; persisted on each payment
 * @param provider - the implementation
 */
export const registerPaymentProvider = (name: string, provider: PaymentProvider): void =>
    paymentProviderRegistry.register(name, provider);
