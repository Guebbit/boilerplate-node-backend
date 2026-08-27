/**
 * Every module's `subscribe()` hook, held to the two things that make the event bus a graph rather
 * than a pile of listeners.
 *
 * `subscribe` is the one part of a manifest that is pure behaviour: `routes`, `seeds` and
 * `dependsOn` are values a test can read, but a subscription only exists as the side effect of
 * calling a function at boot. Nothing else in the suite calls these hooks — `app.ts` does, once —
 * so an emptied `subscribe` body is invisible: the module still registers, still serves its
 * routes, still passes every other cross-cutting check, and simply stops reacting to the rest of
 * the system. Deleting a product would stop emptying it out of carts and wishlists; a reservation
 * timing out would stop cancelling its order.
 *
 * The two invariants:
 *
 *   1. **A declared hook does something.** If a manifest carries `subscribe`, calling it must
 *      register at least one handler. An empty body is a hook that has been silently disconnected.
 *   2. **A module only listens to what it is allowed to reach.** Subscribing to a sibling's event
 *      is a dependency, and it is exactly the dependency the bus exists to make legal — see
 *      `kernel/events.ts`, where the point is that "products emit and cart listens" keeps the
 *      arrow pointing one way. But it is still an edge, and an edge that `dependsOn` does not
 *      declare is invisible to `context-map.test.ts` and to the context map it checks: the
 *      coupling is real, and the graph says it is not there.
 *
 * `@kernel/events` is REPLACED rather than driven, so this reads what each hook registers without
 * the handlers running and without leaking subscriptions into other suites.
 */

jest.mock('@kernel/events', () => ({
    ...jest.requireActual('@kernel/events'),
    __esModule: true,
    onDomainEvent: jest.fn()
}));

import { enabledModules } from '../../src/modules';
import { onDomainEvent } from '@kernel/events';
import type { AppModule } from '@kernel/registry';

/** Modules that declare a `subscribe` hook at all. */
const subscribers = (): AppModule[] =>
    enabledModules.filter((appModule: AppModule) => appModule.subscribe !== undefined);

/** Event names one module's hook registers for, read off the replaced `onDomainEvent`. */
const subscriptionsOf = (appModule: AppModule): string[] => {
    const recorded = jest.mocked(onDomainEvent);
    recorded.mockClear();
    appModule.subscribe!();
    return recorded.mock.calls.map(([name]) => name);
};

beforeEach(() => jest.mocked(onDomainEvent).mockClear());

describe('module subscriptions', () => {
    it('finds modules that subscribe at all', () => {
        // The canary. An empty sweep must mean "no module listens to anything", which would itself
        // be a finding — not "the sweep broke and every assertion below passed vacuously".
        expect(subscribers().length).toBeGreaterThan(0);
    });

    it('registers at least one handler per declared hook', () => {
        const inert = subscribers()
            .filter((appModule) => subscriptionsOf(appModule).length === 0)
            .map((appModule) => `${appModule.name} declares subscribe() but registers nothing`);

        expect(inert).toEqual([]);
    });

    it('registers a handler for every event it names', () => {
        // `onDomainEvent(name, handler)` with a missing second argument registers `undefined`,
        // which `emitDomainEvent` would then call. It fails at emit time, in production, inside a
        // try/catch that logs and continues — so the symptom is a silent no-op, not a crash.
        const malformed: string[] = [];

        for (const appModule of subscribers()) {
            const recorded = jest.mocked(onDomainEvent);
            recorded.mockClear();
            appModule.subscribe!();

            for (const [name, handler] of recorded.mock.calls)
                if (typeof handler !== 'function')
                    malformed.push(`${appModule.name} registered a non-function for ${name}`);
        }

        expect(malformed).toEqual([]);
    });

    it('names each event at most once per module', () => {
        // Two handlers for one event in one module is either a copy-paste or two things that
        // should be one handler; both run on every emit and neither knows about the other.
        const duplicated = subscribers().flatMap((appModule) => {
            const names = subscriptionsOf(appModule);
            return names
                .filter((name, index) => names.indexOf(name) !== index)
                .map((name) => `${appModule.name} subscribes to ${name} more than once`);
        });

        expect(duplicated).toEqual([]);
    });

    it('listens only to events from itself or a module it declares', () => {
        // The invariant that keeps the bus inside the context map. Event names are exported as
        // constants from the emitting module's barrel, so the module a name belongs to is
        // discoverable: `PRODUCT_DELETED` is `products`'. A subscription to a module the manifest
        // does not declare is a real coupling the graph does not show.
        const undeclared: string[] = [];

        for (const appModule of subscribers()) {
            const declared = new Set([
                appModule.name,
                ...(appModule.dependsOn ?? []).map((edge) => edge.module)
            ]);

            for (const event of subscriptionsOf(appModule)) {
                // Event names are namespaced by their owner — `product.deleted`, `user.deleted`,
                // `reservation.expired`. Take the owner as the first segment, singular or not, and
                // only complain when it maps onto a module name that is genuinely not declared.
                const owner = enabledModules.find((candidate: AppModule) =>
                    event.toLowerCase().startsWith(candidate.name.replace(/s$/, '').toLowerCase())
                );

                if (owner !== undefined && !declared.has(owner.name))
                    undeclared.push(
                        `${appModule.name} subscribes to ${event} (${owner.name}) without declaring it`
                    );
            }
        }

        expect(undeclared).toEqual([]);
    });
});
