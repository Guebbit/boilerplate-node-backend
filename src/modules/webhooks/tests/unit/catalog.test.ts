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
        registerWebhookCatalog(['users']);

        expect(listedNames()).toEqual(declaredWebhookEvents(['users']));
        expect(listedNames().length).toBeGreaterThan(0);
        expect(listedNames().every((name) => name.startsWith('user.'))).toBe(true);
    });

    it('skips a registered module that owns no fragment', () => {
        registerWebhookCatalog(['webhooks', 'example']);

        expect(listedNames()).toEqual(declaredWebhookEvents(['example']));
    });

    it('carries each channel description through', () => {
        registerWebhookCatalog(['users']);

        expect(
            listWebhookEventCatalog(callerAs('admin')).find((event) => event.name === 'user.erased')
        ).toEqual({
            name: 'user.erased',
            description: 'An account was erased.',
            actions: { subscribe: true }
        });
    });
});

describe('unknownEventTypes', () => {
    beforeEach(() => {
        registerWebhookCatalog(['users']);
    });
    afterEach(() => {
        registerWebhookCatalog([]);
    });

    it('is empty for listed names and for the wildcard', () => {
        expect(unknownEventTypes(['user.updated', '*'])).toEqual([]);
    });

    it('names each unknown event once, in request order', () => {
        expect(unknownEventTypes(['user.updatd', 'user.updated', 'user.updatd', 'x'])).toEqual([
            'user.updatd',
            'x'
        ]);
    });

    it('refuses an event of a module that is not registered', () => {
        expect(unknownEventTypes(['example.published'])).toEqual(['example.published']);
    });
});

/**
 * Whether `role` may subscribe to each listed event, by event name.
 *
 * @param role - a persona from `@tests/callers`
 */
const flagsOf = (role: string) =>
    Object.fromEntries(
        listWebhookEventCatalog(callerAs(role)).map((event) => [
            event.name,
            event.actions.subscribe
        ])
    );

describe('read rules', () => {
    beforeEach(() => {
        registerWebhookCatalog(['users']);
    });
    afterEach(() => {
        registerWebhookCatalog([]);
    });

    it('flags each event by whether the caller holds its read rule', () => {
        expect(flagsOf('manager')).toEqual({ 'user.erased': false, 'user.updated': false });
        // `support` reads accounts through `UserDisplay` without being the superuser.
        expect(flagsOf('support')).toEqual({ 'user.erased': true, 'user.updated': true });
    });

    it('names the unreadable events of a filter, and `*` stands for every event', () => {
        const manager = callerAs('manager');

        expect(unreadableEventTypes(['user.updated'], manager)).toEqual(['user.updated']);
        expect(unreadableEventTypes(['*'], manager).toSorted()).toEqual([
            'user.erased',
            'user.updated'
        ]);
        expect(unreadableEventTypes(['*'], callerAs('support'))).toEqual([]);
    });

    it('does not let a caller with no staff rule pass for one', () => {
        expect(unreadableEventTypes(['user.updated'], callerAs('customer'))).toEqual([
            'user.updated'
        ]);
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
        const fragment = `channels:\n    thing.happened:\n        address: thing.happened${channel}\n`;
        const realRead = fs.readFileSync;
        jest.spyOn(fs, 'existsSync').mockReturnValue(true);
        /**
         * Only the catalog's own fragment is faked. Jest reads its transform and source-map cache
         * through this same function, and must get the real bytes back.
         */
        jest.spyOn(fs, 'readFileSync').mockImplementation((...arguments_) =>
            String(arguments_[0]).endsWith('asyncapi.webhooks.yaml')
                ? fragment
                : realRead(...arguments_)
        );

        expect(() => {
            registerWebhookCatalog(['users']);
        }).toThrow(/thing\.happened/);
    });
});
