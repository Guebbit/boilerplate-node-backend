/**
 * The catalogue is the events of the REGISTERED modules, read from their own fragments: a module
 * that is not registered contributes nothing, and the subscribe check refuses what is not listed.
 */
import { declaredWebhookEvents } from '@tests/webhook-events';
import fs from 'node:fs';
import { callerAs } from '@tests/callers';
import {
    listWebhookEventCatalog,
    registerWebhookCatalog,
    unknownEventTypes,
    unreadableEventTypes
} from '../../services/catalog';

/** The names the catalogue currently lists. */
const listedNames = (): string[] =>
    listWebhookEventCatalog(callerAs('admin'))
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

        expect(
            listWebhookEventCatalog(callerAs('admin')).find(
                (event) => event.name === 'order.created'
            )
        ).toEqual({
            name: 'order.created',
            description: 'A new order was placed.',
            actions: { subscribe: true }
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

describe('read rules', () => {
    beforeEach(() => {
        registerWebhookCatalog(['orders', 'users', 'example']);
    });
    afterEach(() => {
        registerWebhookCatalog([]);
    });

    it('flags each event by whether the caller holds its read rule', () => {
        const flags = Object.fromEntries(
            listWebhookEventCatalog(callerAs('manager')).map((e) => [e.name, e.actions.subscribe])
        );

        expect(flags).toMatchObject({
            'order.paid': true,
            'user.updated': false,
            'example.published': true
        });
    });

    it('names the unreadable events of a filter, and `*` stands for every event', () => {
        const manager = callerAs('manager');

        expect(unreadableEventTypes(['order.paid', 'user.updated'], manager)).toEqual([
            'user.updated'
        ]);
        expect(unreadableEventTypes(['*'], manager).toSorted()).toEqual([
            'user.erased',
            'user.updated'
        ]);
        expect(unreadableEventTypes(['*'], callerAs('admin'))).toEqual([]);
    });

    it('does not let an own-rows holder pass for a staff rule', () => {
        expect(unreadableEventTypes(['order.paid'], callerAs('customer'))).toEqual(['order.paid']);
    });
});

describe('registerWebhookCatalog — a channel without a usable x-read-rule', () => {
    afterEach(() => {
        jest.restoreAllMocks();
        registerWebhookCatalog([]);
    });

    it.each([
        ['missing', undefined],
        ['an undeclared rule', 'nothing:Here'],
        ['an own-rows rule', 'read:Order']
    ])('throws at boot for %s', (_label, rule) => {
        const channel = rule === undefined ? '' : `\n        x-read-rule: ${rule}`;
        jest.spyOn(fs, 'existsSync').mockReturnValue(true);
        jest.spyOn(fs, 'readFileSync').mockReturnValue(
            `channels:\n    thing.happened:\n        address: thing.happened${channel}\n`
        );

        expect(() => {
            registerWebhookCatalog(['orders']);
        }).toThrow(/thing\.happened/);
    });
});
