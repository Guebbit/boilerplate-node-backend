/**
 * @module
 * The fake PSP's registration: a lazy stand-in in the payments registry, so registering loads
 * nothing and the payments module is read only when something opens an intent.
 *
 * Its own folder, with `./fake`, because `payments` is a `group: shop` module and `demo:remove`
 * deletes the folder with it — the one edit left in `../register.ts` is the import and the call.
 */

import { registerPaymentProvider } from '@modules/payments/providers/registry';
import type { PaymentProvider } from '@modules/payments/providers';

/**
 * Loads the real fake PSP on first use. A dynamic import, so registering costs nothing and the
 * payments module is read only once something actually opens an intent.
 */
const loadFakePaymentProvider = (): Promise<PaymentProvider> =>
    import('./fake').then((loaded) => loaded.fakePaymentProvider);

/**
 * The fake PSP as the registry holds it: every call forwards to the real one, loaded lazily.
 *
 * Forwarding reads the method off the loaded object at call time, so a test's
 * `jest.spyOn(fakePaymentProvider, 'refund')` on the real object still intercepts the call.
 */
export const lazyFakePaymentProvider: PaymentProvider = {
    name: 'fake',
    prepare: (charge, metadata, existingProviderRef) =>
        loadFakePaymentProvider().then((provider) =>
            provider.prepare(charge, metadata, existingProviderRef)
        ),
    confirm: (providerRef, paymentMethodRef) =>
        loadFakePaymentProvider().then((provider) =>
            provider.confirm(providerRef, paymentMethodRef)
        ),
    retrieve: (providerRef) =>
        loadFakePaymentProvider().then((provider) => provider.retrieve(providerRef)),
    refund: (providerRef, charge, idempotency) =>
        loadFakePaymentProvider().then((provider) =>
            provider.refund(providerRef, charge, idempotency)
        ),
    cancel: (providerRef, options) =>
        loadFakePaymentProvider().then((provider) => provider.cancel(providerRef, options)),
    parseWebhook: (rawBody, signature) =>
        loadFakePaymentProvider().then((provider) => provider.parseWebhook(rawBody, signature))
};

/** Puts the fake PSP into the payments registry, under `fake`. */
export const registerPaymentDouble = (): void => {
    registerPaymentProvider('fake', lazyFakePaymentProvider);
};
