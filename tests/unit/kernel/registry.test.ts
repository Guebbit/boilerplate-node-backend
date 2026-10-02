/**
 * `registerModules` — the whole of what the registry does at boot.
 *
 * Two properties, and there is nothing else left to assert: every module's `subscribe` is called,
 * and a module that declares none is not a special case. There is no duplicate-name,
 * unknown-dependency or cycle check to assert: `AppModule` itself carries no `dependsOn` field —
 * that question is answered by each module's own `module.yaml`, enforced by
 * `.dependency-cruiser.cjs`, not by anything `registerModules` does at boot.
 */
import {
    registerModules,
    resolveTranslatables,
    resolvePersonalDataSections,
    resolvePublicEvents,
    type AppModule
} from '@kernel/registry';

it('calls subscribe on every module that declares one', () => {
    const first = jest.fn();
    const second = jest.fn();
    const modules: AppModule[] = [
        { name: 'first', subscribe: first, personalData: 'none' },
        { name: 'second', subscribe: second, personalData: 'none' }
    ];

    registerModules(modules);

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
});

it('skips a module with no subscribe, rather than treating it as a mistake', () => {
    // `audit-logs` and `feedback` both declare none: a module with nothing to react to is
    // ordinary, and the optional call is what says so.
    const subscribe = jest.fn();

    expect(() =>
        registerModules([
            { name: 'headless', personalData: 'none' },
            { name: 'listener', subscribe, personalData: 'none' }
        ])
    ).not.toThrow();
    expect(subscribe).toHaveBeenCalledTimes(1);
});

/**
 * `resolveTranslatables` — the same flattening `resolveImageTargets` does, one lookup keyed by
 * `entityType` instead of one keyed by `collection`. Nothing else validates it here: whether an
 * entry names a REAL collection and REAL fields is `tests/cross-cutting/translatable-targets.test.ts`.
 */
describe('resolveTranslatables', () => {
    it('flattens every module into one lookup keyed by entityType', () => {
        const writeProduct = jest.fn();
        const writePage = jest.fn();
        const modules: AppModule[] = [
            {
                name: 'products',
                translatables: {
                    product: {
                        collection: 'products',
                        fields: ['title'],
                        cacheTag: 'products',
                        exists: jest.fn(),
                        writeDerived: writeProduct,
                        markEdited: jest.fn()
                    }
                },
                personalData: 'none'
            },
            {
                name: 'pages',
                translatables: {
                    page: {
                        collection: 'pages',
                        fields: ['body'],
                        cacheTag: 'pages',
                        exists: jest.fn(),
                        writeDerived: writePage,
                        markEdited: jest.fn()
                    }
                },
                personalData: 'none'
            }
        ];

        expect(resolveTranslatables(modules)).toEqual({
            product: {
                collection: 'products',
                fields: ['title'],
                cacheTag: 'products',
                exists: expect.any(Function),
                writeDerived: writeProduct,
                markEdited: expect.any(Function)
            },
            page: {
                collection: 'pages',
                fields: ['body'],
                cacheTag: 'pages',
                exists: expect.any(Function),
                writeDerived: writePage,
                markEdited: expect.any(Function)
            }
        });
    });

    it('is an empty lookup when no module declares one', () => {
        expect(resolveTranslatables([{ name: 'headless', personalData: 'none' }])).toEqual({});
    });

    it('refuses to boot when two modules declare the same entityType, instead of keeping one', () => {
        const target = {
            collection: 'products',
            fields: ['title'],
            cacheTag: 'products',
            exists: jest.fn(),
            writeDerived: jest.fn(),
            markEdited: jest.fn()
        };
        const modules: AppModule[] = [
            { name: 'products', translatables: { product: target }, personalData: 'none' },
            { name: 'catalogue', translatables: { product: target }, personalData: 'none' }
        ];

        expect(() => resolveTranslatables(modules)).toThrow(/"product"/);
    });
});

/**
 * `resolvePersonalDataSections` — the same flattening as `resolveTranslatables`, into a flat
 * array rather than a lookup: several modules may each contribute one section, in declaration
 * order, and `'none'` contributes nothing.
 */
describe('resolvePersonalDataSections', () => {
    it('flattens every module into one array, in declaration order', () => {
        const usersCollect = jest.fn();
        const addressesCollect = jest.fn();
        const modules: AppModule[] = [
            { name: 'users', personalData: [{ section: 'profile', collect: usersCollect }] },
            {
                name: 'addresses',
                personalData: [{ section: 'addresses', collect: addressesCollect }]
            },
            { name: 'antibot', personalData: 'none' }
        ];

        expect(resolvePersonalDataSections(modules)).toEqual([
            { section: 'profile', collect: usersCollect },
            { section: 'addresses', collect: addressesCollect }
        ]);
    });

    it('is an empty array when every module says none', () => {
        expect(
            resolvePersonalDataSections([
                { name: 'antibot', personalData: 'none' },
                { name: 'observability', personalData: 'none' }
            ])
        ).toEqual([]);
    });

    it('collects every section a single module contributes, not just its first', () => {
        const profile = jest.fn();
        const sessions = jest.fn();
        const modules: AppModule[] = [
            {
                name: 'users',
                personalData: [
                    { section: 'profile', collect: profile },
                    { section: 'sessions', collect: sessions }
                ]
            }
        ];

        expect(resolvePersonalDataSections(modules)).toEqual([
            { section: 'profile', collect: profile },
            { section: 'sessions', collect: sessions }
        ]);
    });
});

/**
 * `resolvePublicEvents` (DDD-D4) — the same flattening `resolveTranslatables` does, one lookup
 * keyed by domain event name instead of `entityType`. Whether an entry's projection actually
 * matches a real, currently-firing domain event is
 * `tests/cross-cutting/webhook-event-producers.test.ts`'s job, not this one's.
 */
describe('resolvePublicEvents', () => {
    it('flattens every module into one lookup keyed by domain event name', () => {
        const toOrderCreated = jest.fn();
        const toPaymentSucceeded = jest.fn();
        const modules: AppModule[] = [
            {
                name: 'orders',
                publicEvents: { 'order.created': { toPublicEvent: toOrderCreated } },
                personalData: 'none'
            },
            {
                name: 'payments',
                publicEvents: { 'payment.succeeded': { toPublicEvent: toPaymentSucceeded } },
                personalData: 'none'
            }
        ];

        expect(resolvePublicEvents(modules)).toEqual({
            'order.created': { toPublicEvent: toOrderCreated },
            'payment.succeeded': { toPublicEvent: toPaymentSucceeded }
        });
    });

    it('is an empty lookup when no module declares one', () => {
        expect(resolvePublicEvents([{ name: 'headless', personalData: 'none' }])).toEqual({});
    });

    it('refuses to boot when two modules declare the same domain event, instead of keeping one', () => {
        const target = { toPublicEvent: jest.fn() };
        const modules: AppModule[] = [
            { name: 'orders', publicEvents: { 'order.created': target }, personalData: 'none' },
            { name: 'catalogue', publicEvents: { 'order.created': target }, personalData: 'none' }
        ];

        expect(() => resolvePublicEvents(modules)).toThrow(/"order\.created"/);
    });
});
