/**
 * The catalogue is the events of the REGISTERED modules, read from their own fragments: a module
 * that is not registered contributes nothing, and the subscribe check refuses what is not listed.
 */
import { declaredWebhookEvents } from '@tests/webhook-events';
import {
    listWebhookEventCatalog,
    registerWebhookCatalog,
    unknownEventTypes
} from '../../services/catalog';

/** The names the catalogue currently lists. */
const listedNames = (): string[] =>
    listWebhookEventCatalog()
        .map((event) => event.name)
        .toSorted();

describe('registerWebhookCatalog', () => {
    afterEach(() => {
        registerWebhookCatalog([]);
    });

    it('lists nothing before any module is registered', () => {
        registerWebhookCatalog([]);

        expect(listedNames()).toEqual([]);
    });

    it('lists only the events of the modules it is given', () => {
        registerWebhookCatalog(['payments']);

        expect(listedNames()).toEqual(declaredWebhookEvents(['payments']));
        expect(listedNames().length).toBeGreaterThan(0);
        expect(listedNames().every((name) => name.startsWith('payment.'))).toBe(true);
    });

    it('skips a registered module that owns no fragment', () => {
        registerWebhookCatalog(['webhooks', 'orders']);

        expect(listedNames()).toEqual(declaredWebhookEvents(['orders']));
    });

    it('carries each channel description through', () => {
        registerWebhookCatalog(['orders']);

        expect(listWebhookEventCatalog().find((event) => event.name === 'order.created')).toEqual({
            name: 'order.created',
            description: 'A new order was placed.'
        });
    });
});

describe('unknownEventTypes', () => {
    beforeEach(() => {
        registerWebhookCatalog(['orders']);
    });
    afterEach(() => {
        registerWebhookCatalog([]);
    });

    it('is empty for listed names and for the wildcard', () => {
        expect(unknownEventTypes(['order.paid', '*'])).toEqual([]);
    });

    it('names each unknown event once, in request order', () => {
        expect(unknownEventTypes(['order.payd', 'order.paid', 'order.payd', 'x'])).toEqual([
            'order.payd',
            'x'
        ]);
    });

    it('refuses an event of a module that is not registered', () => {
        expect(unknownEventTypes(['payment.succeeded'])).toEqual(['payment.succeeded']);
    });
});
