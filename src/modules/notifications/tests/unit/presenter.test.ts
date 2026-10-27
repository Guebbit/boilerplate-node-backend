/**
 * The wire shape of a notification: built, not serialized, so nothing the contract does not name
 * can leak, and `readAt` is absent (never `null`) while unread.
 */
import { Types } from 'mongoose';
import { asStub } from '@tests/stub';
import {
    NOTIFICATION_CODES,
    type NotificationBody,
    type NotificationDocument
} from '@modules/notifications/model';
import { presentNotification, presentNotifications } from '@modules/notifications/presenter';

/** A document with only the fields the presenter reads, plus one it must not leak. */
const documentOf = (overrides: Partial<NotificationDocument> = {}): NotificationDocument =>
    asStub<NotificationDocument>({
        _id: new Types.ObjectId('64b7f1a2c3d4e5f607182930'),
        userId: new Types.ObjectId('64b7f1a2c3d4e5f607182931'),
        code: 'notifications.cart-line-removed',
        audience: 'own',
        params: { productId: 'p1', titles: { en: 'Blue mug' } },
        severity: 'warning',
        createdAt: new Date('2026-10-04T09:00:00.000Z'),
        ...overrides
    });

describe('presentNotification', () => {
    it('answers exactly the contract fields, ids and dates as strings', () => {
        expect(presentNotification(documentOf())).toEqual({
            id: '64b7f1a2c3d4e5f607182930',
            audience: 'own',
            code: 'notifications.cart-line-removed',
            params: { productId: 'p1', titles: { en: 'Blue mug' } },
            severity: 'warning',
            createdAt: '2026-10-04T09:00:00.000Z'
        });
    });

    it('leaves readAt out while unread', () => {
        expect(presentNotification(documentOf())).not.toHaveProperty('readAt');
    });

    it('carries readAt as an ISO string once read', () => {
        const view = presentNotification(
            documentOf({ readAt: new Date('2026-10-04T10:30:00.000Z') })
        );

        expect(view.readAt).toBe('2026-10-04T10:30:00.000Z');
    });
});

describe('presentNotification, per code', () => {
    const bodies: NotificationBody[] = [
        {
            code: 'notifications.cart-line-removed',
            params: { productId: 'p1', titles: { en: 'Blue mug' } }
        },
        {
            code: 'notifications.wishlist-item-removed',
            params: { productId: 'p2', titles: { en: 'Red mug', it: 'Tazza rossa' } }
        },
        {
            code: 'notifications.stock-alert',
            params: { productId: 'p5', titles: { en: 'Red lamp' } }
        },
        {
            code: 'notifications.cart-merge-refused',
            params: {
                lines: [
                    { productId: 'p3', requested: 4, titles: { en: 'Green mug' } },
                    { productId: 'p4', requested: 1, titles: {} }
                ]
            }
        },
        {
            code: 'notifications.fulfillment-delayed',
            params: {
                orderId: 'o1',
                fulfillmentOrderId: 'f1',
                titles: ['Coming soon'],
                agreedAt: '2026-12-01T00:00:00.000Z',
                expectedAt: '2026-12-20T00:00:00.000Z'
            }
        },
        {
            code: 'notifications.fulfillment-held',
            params: {
                orderId: 'o3',
                fulfillmentOrderId: 'f3',
                notice: 'check_address',
                message: 'Is the flat number right?'
            }
        },
        {
            code: 'notifications.shipment-lost',
            params: {
                orderId: 'o4',
                shipmentId: 's4',
                reason: 'lost',
                message: 'A new one is on its way.',
                owed: ['Vinyl'],
                expectedAt: '2026-12-20T00:00:00.000Z'
            }
        },
        {
            code: 'notifications.staff.purchase-hold-placed',
            params: { userId: 'u1', until: '2026-10-30T09:00:00.000Z' }
        },
        { code: 'notifications.staff.webhook-disabled', params: { subscriptionId: 's1' } },
        {
            code: 'notifications.staff.ticket-opened',
            params: { ticketId: 't1', kind: 'contact', category: 'privacy' }
        },
        {
            code: 'notifications.staff.ticket-assigned',
            params: { ticketId: 't1', kind: 'dispute' }
        },
        {
            code: 'notifications.staff.return-requested',
            params: { returnId: 'r1', orderId: 'o1' }
        },
        {
            code: 'notifications.staff.outbox-dead',
            params: { eventName: 'order.paid', aggregateId: 'o1' }
        },
        { code: 'notifications.staff.transfers-due', params: { count: 3 } },
        { code: 'notifications.staff.preorders-late', params: { count: 3 } },
        { code: 'notifications.staff.delivery-holds-open', params: { count: 3 } },
        { code: 'notifications.staff.withdrawals-awaiting-goods', params: { count: 3 } },
        { code: 'notifications.staff.returns-undecided', params: { count: 3 } },
        { code: 'notifications.staff.low-stock', params: { count: 3 } },
        { code: 'notifications.staff.unshipped', params: { count: 3 } },
        { code: 'notifications.staff.awaiting-tracking', params: { count: 3 } },
        { code: 'notifications.staff.undelivered', params: { count: 3 } },
        { code: 'notifications.staff.stale-refunds', params: { count: 3 } }
    ];

    it.each(bodies)('answers $code with its own params, untouched', (body) => {
        const view = presentNotification(documentOf(body));

        expect(view.code).toBe(body.code);
        expect(view.params).toEqual(body.params);
    });

    it('covers every code the model declares', () => {
        // A new code with no row above would reach the wire without a test naming its params.
        expect(bodies.map(({ code }) => code).toSorted()).toEqual(NOTIFICATION_CODES.toSorted());
    });
});

describe('presentNotifications', () => {
    it('wraps the list in `items`, keeping the order it was given', () => {
        const first = documentOf({ _id: new Types.ObjectId('64b7f1a2c3d4e5f607182932') });
        const second = documentOf();

        expect(presentNotifications([first, second]).items.map(({ id }) => id)).toEqual([
            '64b7f1a2c3d4e5f607182932',
            '64b7f1a2c3d4e5f607182930'
        ]);
    });

    it('answers an empty list for an empty inbox', () => {
        expect(presentNotifications([])).toEqual({ items: [] });
    });
});
