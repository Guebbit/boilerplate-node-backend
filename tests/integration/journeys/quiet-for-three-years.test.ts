/**
 * @module
 * Journey: quiet for three years.
 *
 * Nobody signs in for years, and the shop must let go of what it holds about them in stages:
 * minimise first, then warn, then deactivate, then delete. Each stage has a way back until the
 * last, and the shop's own people are never swept while they keep working.
 *
 * The clock only moves forward. Every account ages with it, so each jump is followed by a fresh
 * sign-in for whoever is meant to be active, and sessions die after a day.
 *
 * Asserts the chain across modules (addresses, orders, wishlist, users, signup); each stage's own
 * rule has its own tests.
 */
import '@tests/contract';
import {
    GetWishlist200Response,
    ListAddresses200Response,
    ListOrders200Response,
    SearchUsers200Response
} from '@api/schemas.zod';
import { setupTestDb } from '@tests/setup-test-db';
import { api, authenticateAs, loginBearer } from '@tests/http';
import { advanceDate, freezeDate } from '@tests/clock';
import { bodyOf } from '@tests/body-of';
import { drain, runJob } from '@tests/drain';
import { setEnvironment } from '@tests/environment';
import { mailsTo, useOutboxMail } from '@tests/journey-mail';
import { newShopper, placeOrder } from '@tests/journey-orders';
import { PLAIN_PASSWORD } from '@modules/users/tests/factories';
import { createProduct } from '@modules/products/tests/factories';

setupTestDb();

beforeEach(() => {
    useOutboxMail();
    // The default is 0, which turns deletion off. Minimising is on from 1095 days.
    setEnvironment({ NODE_INACTIVE_ACCOUNT_DAYS: '1460' });
});

afterEach(() => {
    jest.useRealTimers();
});

/** A day, in milliseconds. */
const DAY_MS = 86_400_000;

/** What `reap:inactive-accounts` resolves with when a stage did nothing. */
const NOTHING = { minimised: 0, warned: 0, softDeleted: 0, hardDeleted: 0 };

it('lets go in stages, with a way back until the last', async () => {
    freezeDate();
    const product = await createProduct({ price: 20, onHand: 10 });
    const productId = String(product._id);
    const { user: admin } = await authenticateAs('admin');
    const minimisedThenBack = await newShopper();
    const silent = await newShopper();
    const warnedThenBack = await newShopper();
    for (const shopper of [minimisedThenBack, silent, warnedThenBack]) {
        await api().put(`/wishlist/${productId}`).set('Authorization', shopper.bearer).expect(200);
        await placeOrder(shopper.bearer, [{ productId, quantity: 1 }]);
    }
    /** The staff member signs in again, because every account ages with the clock. */
    const staffNow = () => loginBearer(admin.email);

    // Three years and a month: minimised, not deleted. No warning yet.
    advanceDate(1096 * DAY_MS);
    await staffNow();
    expect(await runJob('reap:inactive-accounts')).toEqual({ ...NOTHING, minimised: 3 });
    await drain();
    expect(mailsTo(silent.email, 'account.inactivity-warning')).toHaveLength(0);

    // The first one comes back: the address book is empty, the rest was kept, the sign-in works.
    const back = await loginBearer(minimisedThenBack.email);
    expect(
        bodyOf(
            await api().get('/account/addresses').set('Authorization', back),
            ListAddresses200Response
        ).data.addresses
    ).toEqual([]);
    expect(
        bodyOf(await api().get('/orders').set('Authorization', back), ListOrders200Response).data
            .items
    ).toHaveLength(1);
    expect(
        bodyOf(await api().get('/wishlist').set('Authorization', back), GetWishlist200Response).data
            .items
    ).toHaveLength(1);

    // A year more: the two still-quiet accounts are warned, the one that came back is not.
    advanceDate(365 * DAY_MS);
    await staffNow();
    expect(await runJob('reap:inactive-accounts')).toEqual({ ...NOTHING, warned: 2 });
    await drain();
    expect(mailsTo(silent.email, 'account.inactivity-warning')).toHaveLength(1);
    expect(mailsTo(warnedThenBack.email, 'account.inactivity-warning')).toHaveLength(1);
    expect(mailsTo(minimisedThenBack.email, 'account.inactivity-warning')).toHaveLength(0);

    // One of the warned signs in. The month's grace runs out for the other.
    await loginBearer(warnedThenBack.email);
    advanceDate(31 * DAY_MS);
    await staffNow();
    expect(await runJob('reap:inactive-accounts')).toEqual({ ...NOTHING, softDeleted: 1 });
    await api()
        .post('/account/login')
        .send({ email: silent.email, password: PLAIN_PASSWORD })
        .expect(401);
    await loginBearer(warnedThenBack.email);
    await loginBearer(minimisedThenBack.email);

    // Another month: gone. Staff find no trace, and the address can sign up again.
    advanceDate(31 * DAY_MS);
    const staff = await staffNow();
    expect(await runJob('reap:inactive-accounts')).toEqual({ ...NOTHING, hardDeleted: 1 });
    const found = bodyOf(
        await api().post('/users/search').set('Authorization', staff).send({ email: silent.email }),
        SearchUsers200Response
    ).data.items;
    expect(found).toEqual([]);
    await api()
        .post('/account/signup')
        .send({
            email: silent.email,
            username: 'returning',
            password: PLAIN_PASSWORD,
            passwordConfirm: PLAIN_PASSWORD,
            termsAccepted: true
        })
        .expect(201);
});
