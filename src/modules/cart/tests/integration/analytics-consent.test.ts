/**
 * @module
 * Whose analytics choice a cart event carries, through the real stack: the login, the auth
 * middleware, the route and the service. A stored answer outranks the banner header; only an
 * account that was never asked takes the header. See `docs/theory/data-protection.md`.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { api, loginBearer } from '@tests/http';
import { observePort } from '@tests/ports';
import { createUser } from '@modules/users/tests/factories';
import { createProduct } from '@modules/products/tests/factories';
import * as analyticsPort from '@infrastructure/observability/analytics';
import { cartAnalyticsEvents } from '../../analytics';

/*
 * The analytics port is replaced with a recording wrapper around the real one: `jest.spyOn`
 * cannot redefine the non-configurable property a CommonJS namespace import exposes under swc.
 */
jest.mock('@infrastructure/observability/analytics', () => {
    const actual = jest.requireActual<typeof import('@infrastructure/observability/analytics')>(
        '@infrastructure/observability/analytics'
    );
    return { __esModule: true, ...actual, emitAnalyticsEvent: jest.fn(actual.emitAnalyticsEvent) };
});

setupTestDb();

/**
 * Logs `consent`'s account in, adds a product to its cart over HTTP and answers what the analytics
 * port was handed for `cart_item_added`.
 *
 * @param consent - the stored answer (`undefined` = never asked)
 * @param header - the `X-Analytics-Consent` the browser forwards, if any
 */
const addToCart = async (consent: boolean | undefined, header?: string) => {
    const user = await createUser({
        verifiedAt: new Date(),
        ...(consent === undefined
            ? {}
            : { analyticsConsent: consent, analyticsConsentAt: new Date() })
    });
    const product = await createProduct();
    const bearer = await loginBearer(user.email);
    const emit = observePort(analyticsPort.emitAnalyticsEvent);

    const request = api().post('/cart').set('Authorization', bearer);
    const response = await (
        header === undefined ? request : request.set('X-Analytics-Consent', header)
    ).send({ productId: String(product._id), quantity: 1 });

    expect(response.status).toBe(201);
    return emit.mock.calls
        .map(([event]) => event)
        .find((event) => event.event === cartAnalyticsEvents.CART_ITEM_ADDED);
};

describe('POST /cart — the consent a cart_item_added event carries', () => {
    it('is granted for an account that opted in', async () => {
        const event = await addToCart(true);

        expect(event?.analyticsConsent).toBe(true);
    });

    it('stays granted when the header says no: a stored answer outranks it', async () => {
        const event = await addToCart(true, 'false');

        expect(event?.analyticsConsent).toBe(true);
    });

    it('stays refused when the header says yes: a withdrawal is not undone by a banner', async () => {
        const event = await addToCart(false, 'true');

        expect(event?.analyticsConsent).toBe(false);
    });

    it('takes the header when the account was never asked', async () => {
        const event = await addToCart(undefined, 'true');

        expect(event?.analyticsConsent).toBe(true);
    });

    it('is refused when the account was never asked and sent no header', async () => {
        const event = await addToCart(undefined);

        expect(event?.analyticsConsent).toBe(false);
    });
});
