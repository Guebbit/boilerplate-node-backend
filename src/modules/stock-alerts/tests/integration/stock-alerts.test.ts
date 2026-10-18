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
import { createProduct } from '@modules/products/tests/factories';
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

    it('is refused while the product can be ordered now', async () => {
        const { bearer } = await shopper();
        const product = await createProduct({ onHand: 5 });

        const response = await api()
            .post(`/stock-alerts/${String(product._id)}`)
            .set('Authorization', bearer);

        expect(response.status).toBe(409);
        expect(response.body.errors[0].code).toBe('STOCK_ALERT_PRODUCT_BUYABLE');
        expect(await stockAlertModel.countDocuments()).toBe(0);
    });

    it('answers 404 for a hidden product', async () => {
        const { bearer } = await shopper();
        const product = await createProduct({ onHand: 0, active: false });

        const response = await api()
            .post(`/stock-alerts/${String(product._id)}`)
            .set('Authorization', bearer);

        expect(response.status).toBe(404);
    });

    it('needs a signed-in caller', async () => {
        const response = await api().post(`/stock-alerts/${await soldOut()}`);

        expect(response.status).toBe(401);
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

    it('lists only the caller’s own requests', async () => {
        const mine = await shopper();
        const theirs = await authenticateAsRole('support');
        const productId = await soldOut();
        await api().post(`/stock-alerts/${productId}`).set('Authorization', theirs.bearer);

        const listed = await api().get('/stock-alerts').set('Authorization', mine.bearer);

        expect(listed.body.data.items).toEqual([]);
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
