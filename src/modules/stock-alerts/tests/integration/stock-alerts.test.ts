/**
 * @module
 * Back-in-stock requests, over HTTP and through the real wiring: asking, the refusal while the
 * product can be ordered, cancelling, and the signal that answers a waiting request with one mail
 * and deletes it. The real modules are registered so the wiring in `module.ts` is part of what is
 * tested.
 *
 * See: docs/modules/stock-alerts.md
 */

import { setupTestDb } from '@tests/setup-test-db';
import { api, authenticateAsRole } from '@tests/http';
import { enqueueEmail } from '@infrastructure/adapters/mailer';
import { createProduct, readProduct, saveProduct } from '@modules/products/tests/factories';
import { withTransaction } from '@infrastructure/runtime/database';
import { inventoryService } from '@modules/inventory';
import { registerModules } from '@kernel/registry';
import { resetDomainEvents } from '@kernel/events';
import { outboxEventModel, settleOutboxNudges } from '@kernel/outbox';
import { stockAlertService } from '../../service';
import { stockAlertModel } from '../../model';
import { STOCK_ALERT_SENT } from '../../events';
import { enabledModules } from '../../../../modules';

jest.mock('@infrastructure/adapters/mailer', () => ({
    __esModule: true,
    enqueueEmail: jest.fn()
}));
const mockEnqueueEmail = jest.mocked(enqueueEmail);

/** One day, in milliseconds. */
const DAY_MS = 24 * 60 * 60 * 1000;

setupTestDb();

beforeEach(() => {
    resetDomainEvents();
    registerModules(enabledModules);
});

afterEach(() => jest.clearAllMocks());

/** A sold-out product. */
const soldOut = () => createProduct({ onHand: 0 }).then((product) => String(product._id));

/** The signed-in shopper of a test, with their bearer and id. */
const shopper = () => authenticateAsRole('customer');

/** The `stock_alert.sent` rows written so far. */
const sentEvents = () =>
    outboxEventModel
        .find({ name: STOCK_ALERT_SENT })
        .lean()
        .exec()
        .then((rows) => rows.map(({ payload }) => payload));

describe('POST /stock-alerts/:productId', () => {
    it('records a request for a product that cannot be ordered, and asking twice is the same request', async () => {
        const { bearer } = await shopper();
        const productId = await soldOut();

        const first = await api().post(`/stock-alerts/${productId}`).set('Authorization', bearer);
        const second = await api().post(`/stock-alerts/${productId}`).set('Authorization', bearer);

        expect(first.status).toBe(200);
        expect(second.status).toBe(200);
        expect(second.body.data.items).toHaveLength(1);
        expect(second.body.data.items[0].productId).toBe(productId);
        expect(await stockAlertModel.countDocuments()).toBe(1);
    });

    it.each([
        ['shelf units', () => createProduct({ onHand: 5 })],
        [
            'an open backorder',
            async () => {
                const product = await createProduct({ onHand: 0, allowBackorder: true });
                await inventoryService.setBackorderLimit(String(product._id), null);
                return product;
            }
        ],
        [
            'a preorder with allowance left',
            async () => {
                const product = await createProduct({
                    onHand: 0,
                    releaseDate: new Date(Date.now() + 10 * DAY_MS).toISOString()
                });
                await inventoryService.setBackorderLimit(String(product._id), 5);
                return product;
            }
        ]
    ])('is refused while the product can be ordered now: %s', async (_name, make) => {
        const { bearer } = await shopper();
        const product = await make();

        const response = await api()
            .post(`/stock-alerts/${String(product._id)}`)
            .set('Authorization', bearer);

        expect(response.status).toBe(409);
        expect(response.body.errors[0].code).toBe('STOCK_ALERT_PRODUCT_BUYABLE');
        expect(await stockAlertModel.countDocuments()).toBe(0);
    });

    it.each([
        ['hidden', { active: false }],
        ['soft-deleted', { deletedAt: new Date() }]
    ])('answers 404 for a %s product', async (_name, overrides) => {
        const { bearer } = await shopper();
        const product = await createProduct({ onHand: 0, ...overrides });

        const response = await api()
            .post(`/stock-alerts/${String(product._id)}`)
            .set('Authorization', bearer);

        expect(response.status).toBe(404);
        expect(await stockAlertModel.countDocuments()).toBe(0);
    });
});

describe('DELETE /stock-alerts/:productId and GET /stock-alerts', () => {
    it('cancels the caller’s own request, and a request they do not hold is a 404', async () => {
        const { bearer } = await shopper();
        const productId = await soldOut();
        await api().post(`/stock-alerts/${productId}`).set('Authorization', bearer);

        const cancelled = await api()
            .delete(`/stock-alerts/${productId}`)
            .set('Authorization', bearer);
        const again = await api().delete(`/stock-alerts/${productId}`).set('Authorization', bearer);
        const listed = await api().get('/stock-alerts').set('Authorization', bearer);

        expect([cancelled.status, again.status]).toEqual([200, 404]);
        expect(listed.body.data.items).toEqual([]);
    });

    it('lists only the caller’s own requests, newest first', async () => {
        const mine = await shopper();
        const theirs = await authenticateAsRole('support');
        const first = await soldOut();
        const second = await soldOut();
        const others = await soldOut();
        await api().post(`/stock-alerts/${first}`).set('Authorization', mine.bearer);
        await api().post(`/stock-alerts/${second}`).set('Authorization', mine.bearer);
        await api().post(`/stock-alerts/${others}`).set('Authorization', theirs.bearer);

        const listed = await api().get('/stock-alerts').set('Authorization', mine.bearer);

        expect(
            listed.body.data.items.map(({ productId }: { productId: string }) => productId)
        ).toEqual([second, first]);
    });
});

describe('the signal', () => {
    it('answers a waiting request with one mail, one event and no request left, once', async () => {
        const { bearer } = await shopper();
        const productId = await soldOut();
        await api().post(`/stock-alerts/${productId}`).set('Authorization', bearer);

        await inventoryService.receive(productId, 3);
        await settleOutboxNudges();
        await inventoryService.receive(productId, 3);
        await settleOutboxNudges();

        expect(mockEnqueueEmail).toHaveBeenCalledTimes(1);
        expect(mockEnqueueEmail.mock.calls[0]?.[1]).toBe('stock-alerts.back-in-stock');
        expect(await sentEvents()).toMatchObject([{ productId }]);
        expect(await stockAlertModel.countDocuments()).toBe(0);
    });

    it('gives a request cancelled before the signal nothing', async () => {
        const { bearer } = await shopper();
        const productId = await soldOut();
        await api().post(`/stock-alerts/${productId}`).set('Authorization', bearer);
        await api().delete(`/stock-alerts/${productId}`).set('Authorization', bearer);

        await inventoryService.receive(productId, 3);
        await settleOutboxNudges();

        expect(mockEnqueueEmail).not.toHaveBeenCalled();
        expect(await sentEvents()).toEqual([]);
    });

    it('does not mail a request twice when the signal is delivered twice', async () => {
        const { bearer } = await shopper();
        const productId = await soldOut();
        await api().post(`/stock-alerts/${productId}`).set('Authorization', bearer);

        await stockAlertService.onBuyableAgain(productId);
        await stockAlertService.onBuyableAgain(productId);
        await settleOutboxNudges();

        expect(mockEnqueueEmail).toHaveBeenCalledTimes(1);
    });

    it('answers a request when the backorder switch is turned on', async () => {
        const { bearer } = await shopper();
        const productId = await soldOut();
        await inventoryService.setBackorderLimit(productId, 5);
        await api().post(`/stock-alerts/${productId}`).set('Authorization', bearer);
        const editor = await authenticateAsRole('editor');

        await api()
            .patch(`/products/${productId}`)
            .set('Authorization', editor.bearer)
            .send({ allowBackorder: true });
        await settleOutboxNudges();

        expect(mockEnqueueEmail).toHaveBeenCalledTimes(1);
    });
});

/** Stock on the shelf but a release date ahead: not orderable until the date passes. */
const unreleased = () =>
    createProduct({
        onHand: 5,
        releaseDate: new Date(Date.now() + DAY_MS).toISOString()
    }).then((product) => String(product._id));

/** Moves the release date into the past without any write announcing it, as time does. */
const letTheDatePass = async (productId: string) => {
    const product = await readProduct(productId);
    product!.releaseDate = new Date(Date.now() - DAY_MS);
    await saveProduct(product!);
};

describe('the hourly sweep', () => {
    it('answers a request once a release date passes, and a second run sends nothing', async () => {
        const { bearer } = await shopper();
        const productId = await unreleased();
        await api().post(`/stock-alerts/${productId}`).set('Authorization', bearer);
        await letTheDatePass(productId);

        const first = await stockAlertService.sweepBuyable(new Date());
        const second = await stockAlertService.sweepBuyable(new Date());
        await settleOutboxNudges();

        expect([first, second]).toEqual([1, 0]);
        expect(mockEnqueueEmail).toHaveBeenCalledTimes(1);
        expect(await sentEvents()).toMatchObject([{ productId }]);
        expect(await stockAlertModel.countDocuments()).toBe(0);
    });

    it('leaves a request for a product that still cannot be ordered', async () => {
        const { bearer } = await shopper();
        const waiting = await unreleased();
        await api().post(`/stock-alerts/${waiting}`).set('Authorization', bearer);

        const answered = await stockAlertService.sweepBuyable(new Date());

        expect(answered).toBe(0);
        expect(mockEnqueueEmail).not.toHaveBeenCalled();
        expect(await stockAlertModel.countDocuments()).toBe(1);
    });
});

describe('what leaves with a product or an account', () => {
    it('removes the requests of a deleted product', async () => {
        const { bearer } = await shopper();
        const productId = await soldOut();
        await api().post(`/stock-alerts/${productId}`).set('Authorization', bearer);
        const admin = await authenticateAsRole('admin');

        await api()
            .delete(`/products/${productId}?hardDelete=true`)
            .set('Authorization', admin.bearer);
        await settleOutboxNudges();

        expect(await stockAlertModel.countDocuments()).toBe(0);
    });

    it('exports the caller’s requests and erases them with the account', async () => {
        const { user, bearer } = await shopper();
        const productId = await soldOut();
        await api().post(`/stock-alerts/${productId}`).set('Authorization', bearer);

        const exported = await stockAlertService.exportRows(user.id);
        await withTransaction((session) => stockAlertService.removeByUserId(user.id, session));

        expect(exported).toMatchObject([{ productId }]);
        expect(await stockAlertModel.countDocuments()).toBe(0);
    });
});
