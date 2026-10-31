/**
 * @module
 * Where a parcel went. Each shipment keeps its own encrypted copy of the order's shipping address
 * as it stood at the cut, so correcting the address for the rest of the order never rewrites the
 * parcel that already left; the copy shows on the wire, in the account export, and goes when the
 * order's own address is scrubbed. Real Mongo (`setupTestDb`).
 */

import { setupTestDb } from '@tests/setup-test-db';
import { asAdmin, callerContextAs } from '@tests/callers';
import { createUser } from '@modules/users/tests/factories';
import { createProduct } from '@modules/products/tests/factories';
import { createOrder, seedDigitalOrder, toOrderItem } from '@modules/orders/tests/factories';
import { orderService } from '@modules/orders';
import { OrderStatus } from '@types';
import { deliveryService } from '@modules/delivery/services';
import { fulfillmentOrdersOf, shipmentsOf } from '@modules/delivery/tests/factories';
import { withEnvironmentOverrides } from '@tests/environment';
import { keyVersionOf } from '@infrastructure/security/versioned-secret';
import deliveryModule from '@modules/delivery/module';
import { presentExportShipment } from '../../presenter';
import { decryptDestination } from '../../pii';
import { shipmentModel } from '../../model';

setupTestDb();

/** The admin, as the caller of every act below. */
const admin = callerContextAs('admin');

/** Where the order was first sent. */
const FIRST = {
    fullName: 'Ada Lovelace',
    street: '12 Analytical Engine Rd',
    city: 'Milano',
    zip: '20100',
    country: 'IT',
    phone: '+39 02 555 0100'
};

/** Where the rest is redirected to. */
const SECOND = { ...FIRST, street: '14 Difference Engine Ln', zip: '20121' };

/** A `processing` order of two units that ships to {@link FIRST}. */
let buyers = 0;
const twoUnitOrder = async () => {
    buyers += 1;
    const user = await createUser({ email: `buyer-${buyers}@example.com` });
    const product = await createProduct({ price: 10 });
    const order = await createOrder(user, [toOrderItem(product, 2)], {
        status: OrderStatus.processing,
        shippingAddress: FIRST
    });
    return { order, productId: String(product._id) };
};

/** Ship `quantity` units of the order's one fulfillment order. */
const shipUnits = async (orderId: string, productId: string, quantity: number) => {
    const [fulfillmentOrder] = await fulfillmentOrdersOf(orderId);
    return deliveryService.shipFulfillmentOrder(
        String(fulfillmentOrder._id),
        { lines: [{ productId, quantity }] },
        asAdmin(),
        admin
    );
};

describe('a shipment keeps where it went', () => {
    it('copies the order address at the cut, encrypted at rest and readable on the wire', async () => {
        const { order, productId } = await twoUnitOrder();

        const shipped = await shipUnits(String(order._id), productId, 1);

        expect(shipped.success && shipped.data.destination).toMatchObject(FIRST);
        const raw = JSON.stringify(await shipmentModel.collection.findOne({ orderId: order._id }));
        expect(raw).not.toContain('Analytical');
        expect(raw).not.toContain(FIRST.phone);
        expect(raw).toContain('destination');
    });

    it('leaves the first parcel at its address when the rest is redirected', async () => {
        const { order, productId } = await twoUnitOrder();
        await shipUnits(String(order._id), productId, 1);

        const redirected = await orderService.correctShippingAddress(
            String(order._id),
            SECOND,
            admin
        );
        await shipUnits(String(order._id), productId, 1);

        expect(redirected.success).toBe(true);
        const [first, second] = await shipmentsOf(String(order._id));
        const listed = await deliveryService.listShipmentsForOrder(String(order._id), asAdmin());
        expect(listed.success && listed.data.map(({ destination }) => destination?.street)).toEqual(
            ['12 Analytical Engine Rd', '14 Difference Engine Ln']
        );
        expect([first.number, second.number]).toEqual([1, 2]);
    });

    it('stores none for a digital fulfilment, and none for an order that ships nowhere', async () => {
        const digital = await seedDigitalOrder(OrderStatus.processing, new Date());
        const [fulfillmentOrder] = await fulfillmentOrdersOf(String(digital._id));
        await deliveryService.fulfillFulfillmentOrder(
            String(fulfillmentOrder._id),
            asAdmin(),
            admin
        );
        const pickup = await createOrder(
            await createUser({ email: 'pickup@example.com' }),
            [toOrderItem(await createProduct({ price: 10 }), 1)],
            { status: OrderStatus.processing }
        );
        const [pickupFo] = await fulfillmentOrdersOf(String(pickup._id));
        await deliveryService.shipFulfillmentOrder(String(pickupFo._id), {}, asAdmin(), admin);

        const stored = await shipmentModel.find({}).lean().exec();

        expect(stored).toHaveLength(2);
        expect(stored.every((one) => one.destination === undefined)).toBe(true);
    });

    it('is part of the account export record', async () => {
        const { order, productId } = await twoUnitOrder();
        await shipUnits(String(order._id), productId, 2);
        const [shipment] = await shipmentsOf(String(order._id));

        expect(presentExportShipment(shipment).destination).toMatchObject(FIRST);
    });
});

describe('scrubbing the order scrubs the copy', () => {
    it('unsets the destination of every shipment of that order only, and a rerun changes nothing', async () => {
        const { order, productId } = await twoUnitOrder();
        const other = await twoUnitOrder();
        await shipUnits(String(order._id), productId, 1);
        await shipUnits(String(other.order._id), other.productId, 1);

        const first = await deliveryService.scrubDestinations(String(order._id));
        const again = await deliveryService.scrubDestinations(String(order._id));

        expect([first, again]).toEqual([1, 0]);
        const [scrubbed] = await shipmentsOf(String(order._id));
        const [kept] = await shipmentsOf(String(other.order._id));
        expect(scrubbed.destination).toBeUndefined();
        expect(kept.destination).toBeDefined();
    });
});

describe('rotating the PII key', () => {
    it('moves the destination to the newest key, still readable, and a rerun changes nothing', async () => {
        const { order, productId } = await twoUnitOrder();
        await shipUnits(String(order._id), productId, 2);
        const rotation = 'v2:new-pii-key-material,v1:test-pii-encryption-key';

        await withEnvironmentOverrides({ NODE_PII_ENCRYPTION_KEY: rotation }, async () => {
            const first = await deliveryModule.reencrypt?.(false);
            const second = await deliveryModule.reencrypt?.(false);

            expect(first?.rewritten).toBe(6);
            expect(second?.rewritten).toBe(0);
            const raw = await shipmentModel.findOne({ orderId: order._id }).exec();
            expect(keyVersionOf(raw!.destination!.city)).toBe('v2');
            expect(decryptDestination(raw!.destination!, String(raw!._id)).city).toBe('Milano');
        });
    });
});
