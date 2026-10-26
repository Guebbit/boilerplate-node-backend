/**
 * @module
 * What a hard delete (Art. 17) takes and what it must leave: the address book goes with the
 * account, while the records the law makes the shop keep — invoices, credit notes, returns, the
 * feedback ticket — stay. `personal-data-erasure.test.ts` only checks that a hook is declared; this
 * runs the real cascade, so a future "erase everything" change that reaches a tax record fails here.
 *
 * The second block is the user's ask: after a scheduled self-deletion has run, no collection still
 * names the account except the ones the law lets the shop keep.
 */

import { refundOrderPayment } from '@modules/payments/tests/factories';
import { setupTestDb } from '@tests/setup-test-db';
import { registerCheckoutModules } from '@tests/checkout-modules';
import { resetDomainEvents } from '@kernel/events';
import { asAdmin, asCustomer, callerContextAs, testCallerContext } from '@tests/callers';
import addressesModule from '@modules/addresses/module';
import invoicingModule from '@modules/invoicing/module';
import paymentsModule from '@modules/payments/module';
import returnsModule from '@modules/returns/module';
import feedbackModule from '@modules/feedback/module';
import { paymentService } from '@modules/payments';
import { createProduct } from '@modules/products/tests/factories';
import { createUser, userRepository } from '@modules/users/tests/factories';
import { userService } from '@modules/users';
import { createOrder, toOrderItem } from '@modules/orders/tests/factories';
import { addressBookModel } from '@modules/addresses/model';
import { giveAddress } from '@modules/addresses/tests/factories';
import { invoiceModel, creditNoteModel } from '@modules/invoicing/model';
import { returnModel } from '@modules/returns/model';
import { feedbackRequestModel } from '@modules/feedback/model';
import { eventually } from '@tests/eventually';
import mongoose from 'mongoose';
import { TranslationOrigin } from '@types';
import { TEST_TENANT_ID } from '@tests/callers';
import accessModule from '@modules/access/module';
import apiKeysModule from '@modules/api-keys/module';
import webhooksModule from '@modules/webhooks/module';
import localesModule from '@modules/locales/module';
import wishlistModule from '@modules/wishlist/module';
import stockAlertsModule from '@modules/stock-alerts/module';
import notificationsModule from '@modules/notifications/module';
import exampleModule from '@modules/example/module';
import { accountService } from '@modules/account/services';
import { plantSession, plantToken } from '@modules/account/tests/factories';
import { cartService } from '@modules/cart/services';
import { wishlistService } from '@modules/wishlist/service';
import { stockAlertModel } from '@modules/stock-alerts/model';
import { createNotification } from '@modules/notifications/tests/factories';
import { createExample } from '@modules/example/tests/factories';
import { webhookSubscriptionRepository } from '@modules/webhooks/repository';
import { mintRingSecret } from '@modules/webhooks/secrets';
import { mint } from '@modules/api-keys/services/api-keys';
import { DEPLOYMENT_TENANT_ID } from '@kernel/access/tenant';
import { permissionsOfRole } from '@kernel/permissions';
import { translationRepository } from '@modules/locales/repository';
import { payByCard } from '@modules/payments/tests/factories';
import { anonymizeDueOrders } from '@modules/orders/services/retention';

/** The fake PSP's "always succeeds" reference (`scenarios/support/doubles/payments/fake.ts`). */
const FAKE_SUCCESS_METHOD = 'pm_card_visa';

setupTestDb();

beforeEach(() => {
    registerCheckoutModules([
        addressesModule,
        paymentsModule,
        invoicingModule,
        returnsModule,
        feedbackModule,
        webhooksModule,
        localesModule,
        wishlistModule,
        stockAlertsModule,
        notificationsModule,
        exampleModule,
        accessModule,
        apiKeysModule
    ]);
});

afterEach(() => resetDomainEvents());

describe('a hard delete of an account that has bought, been refunded and written in', () => {
    it('takes the address book and leaves every legal record', async () => {
        const user = await createUser({ email: 'ada@example.com', verifiedAt: new Date() });
        await giveAddress(user.id);
        const product = await createProduct({ price: 25 });
        const order = await createOrder(user, [toOrderItem(product, 1)]);
        const orderId = String(order._id);
        const intent = await paymentService.createIntent(orderId, asCustomer(user.id));
        if (!intent.success) throw new Error('intent refused');
        await paymentService.confirmPayment(
            intent.data.id,
            FAKE_SUCCESS_METHOD,
            asCustomer(user.id),
            testCallerContext
        );
        await eventually(() =>
            invoiceModel.countDocuments({ orderId }).then((count) => count >= 1)
        );
        await refundOrderPayment(orderId, asAdmin(), callerContextAs('admin'));
        await eventually(() =>
            creditNoteModel.countDocuments({ orderId }).then((count) => count >= 1)
        );
        await returnModel.create({
            orderId: order._id,
            orderNumber: order.orderNumber ?? 'N-1',
            currency: 'EUR',
            status: 'declined',
            reason: 'defective',
            lines: [{ productId: product._id, quantity: 1, title: 'Shirt', unitPrice: 25 }],
            returnPostage: 'consumer'
        });
        await feedbackRequestModel.create({
            email: 'ada@example.com',
            subject: 'Hello',
            message: 'A question'
        });
        expect(await addressBookModel.countDocuments({ userId: user.id })).toBe(1);

        const loaded = await userRepository.findById(user.id);
        const result = await userService.removeById(loaded!.id, true, callerContextAs('admin'));

        expect(result.success).toBe(true);
        expect(await userRepository.findById(user.id)).toBeNull();
        expect(await addressBookModel.countDocuments({ userId: user.id })).toBe(0);
        expect(await invoiceModel.countDocuments({ orderId })).toBe(1);
        expect(await creditNoteModel.countDocuments({ orderId })).toBe(1);
        expect(await returnModel.countDocuments({ orderId })).toBe(1);
        expect(await feedbackRequestModel.countDocuments({ email: 'ada@example.com' })).toBe(1);
    });
});

/**
 * A stored document flattened to lower-case text. An ObjectId serialises to its hex string, so a
 * deep scan finds an account whether the row holds it as a string or as an ObjectId.
 */
const textOf = (value: unknown): string => JSON.stringify(value).toLowerCase();

/**
 * The collections whose documents mention `needles`, by name. Reads every collection, so a home
 * nobody thought of is found too.
 */
const collectionsNaming = async (needles: readonly string[]): Promise<string[]> => {
    const database = mongoose.connection.db!;
    const listed = await database.listCollections().toArray();
    const names = listed.map(({ name }) => name);
    const hits: string[] = [];
    for (const name of names) {
        const documents = await database.collection(name).find({}).toArray();
        if (
            documents.some((document) =>
                needles.some((needle) => textOf(document).includes(needle))
            )
        )
            hits.push(name);
    }
    return hits.toSorted();
};

/**
 * Where the shop may still name the account after the purge, each with its reason. An entry is an
 * argument: a collection added here is a decision to keep personal data, not a way to quiet a test.
 */
const KEPT_BY_LAW = {
    // Art. 6(1)(c) and (f), recital 49: the trail of what happened keeps actor and target ids.
    auditlogs: 'audit window',
    // Published rows are kept seven days; the events carry ids only.
    outboxevents: 'outbox retention',
    // The `user.erased` delivery is the notice Art. 19 owes recipients. It carries the id only, no
    // email, and the delivery log expires on its own clock (30 days).
    webhookdeliveries: 'delivery log retention',
    // Art. 17(3)(b): the paid order is the sale; its buyer is scrubbed once the claim window closes.
    orders: 'paid order, tax law',
    // The invoice freezes the billing address (name and address) for the tax duty.
    invoices: 'tax law',
    // A contact message is matched by address, not by account; staff delete it by hand on request.
    feedbackrequests: 'not cascaded (open question E1)'
} as const;

describe('a scheduled self-deletion that has run', () => {
    it('leaves no collection naming the account, except the ones the law keeps', async () => {
        const email = 'full-life@example.com';
        const user = await createUser({ email, verifiedAt: new Date() }, 'support');
        await giveAddress(user.id);
        const product = await createProduct({ price: 25, onHand: 10 });
        await cartService.addItemById(user.id, String(product._id), 1);
        await wishlistService.add(user.id, String(product._id), testCallerContext);
        await stockAlertModel.create({ userId: user._id, productId: product._id });
        await createNotification({ userId: user.id });
        await plantSession(user.id, 'a-session');
        await plantToken(user.id, 'password', 'a-reset-link');
        await createExample({ userId: user.id });
        await mint(
            {
                name: 'ci',
                permissions: ['read:WebhookSubscription'],
                expiresAt: new Date(Date.now() + 7 * 86_400_000).toISOString()
            },
            {
                caller: {
                    id: user.id,
                    tenantId: DEPLOYMENT_TENANT_ID,
                    scope: 'tenant',
                    permissions: permissionsOfRole('admin'),
                    unrestricted: false,
                    system: false
                },
                analyticsConsent: false
            }
        );
        await webhookSubscriptionRepository.create({
            tenant: TEST_TENANT_ID,
            url: 'https://hooks.example.com/full-life',
            eventTypes: ['*'],
            ownerUserId: user.id,
            secrets: [mintRingSecret().entry]
        });
        await translationRepository.upsertEntityLocale(
            'product',
            String(product._id),
            'en',
            { title: 'Shirt' },
            TranslationOrigin.human,
            user.id,
            undefined
        );
        await createUser({
            email: 'other-buyer@example.com',
            purchaseHold: {
                until: new Date(Date.now() + 86_400_000),
                reason: 'staff',
                setBy: user.id,
                setAt: new Date()
            }
        });
        await createOrder(user, [toOrderItem(product, 1)]);
        const paid = await createOrder(user, [toOrderItem(product, 1)]);
        await payByCard(paid, user);
        await eventually(() =>
            invoiceModel.countDocuments({ orderId: paid._id }).then((count) => count >= 1)
        );
        await returnModel.create({
            orderId: paid._id,
            orderNumber: paid.orderNumber ?? 'N-1',
            currency: 'EUR',
            status: 'declined',
            reason: 'defective',
            lines: [{ productId: product._id, quantity: 1, title: 'Shirt', unitPrice: 25 }],
            returnPostage: 'consumer'
        });
        await feedbackRequestModel.create({ email, subject: 'Hello', message: 'A question' });
        // The seeds landed: every home below names the account before the purge, so an empty
        // answer afterwards means the cascade worked, not that nothing was ever written.
        expect(await collectionsNaming([user.id.toLowerCase(), email])).toEqual(
            expect.arrayContaining([
                'addressbooks',
                'apikeys',
                'carts',
                'examples',
                'memberships',
                'notifications',
                'orders',
                'payments',
                'sessions',
                'stockalerts',
                'translations',
                'verificationtokens',
                'webhooksubscriptions',
                'wishlists'
            ])
        );
        const loaded = await userRepository.findById(user.id);
        await accountService.scheduleAccountDeletion(loaded!, testCallerContext);
        // The app clock reaches the date: the grace is the only thing that decides when.
        await userRepository.updateMany(
            { _id: user.id },
            { $set: { purgeAt: new Date(Date.now() - 1000) } }
        );

        const purged = await accountService.purgeScheduledDeletions();
        await anonymizeDueOrders();

        expect(purged.purged).toBe(1);
        expect(await userRepository.findById(user.id)).toBeNull();
        const named = await collectionsNaming([user.id.toLowerCase(), email]);
        expect(named.filter((name) => !(name in KEPT_BY_LAW))).toEqual([]);
    });
});
