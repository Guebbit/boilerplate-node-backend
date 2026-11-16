/**
 * Every module's `subscribe()` hook, held to the two things that make the event bus a graph rather
 * than a pile of listeners.
 *
 * Why:      `subscribe` is the one manifest part that is pure behaviour: `routes`, `locales` and
 *           `seeds` are values a test can read, but a subscription exists only as the side effect
 *           of calling a function at boot (`app.ts` does, once). An emptied body is invisible: the
 *           module still registers, serves its routes and passes every other check, and just
 *           stops reacting. Deleting a product would stop emptying it out of carts and wishlists;
 *           a reservation timing out would stop cancelling its order.
 * Rule 1:   a declared hook does something: calling it registers at least one handler. An empty
 *           body is a silently disconnected hook.
 * Rule 2:   a module registers each event once. Two handlers for one event both run on every emit
 *           and neither knows the other: a copy-paste, or two things that should be one.
 * Method:   `@kernel/events` is REPLACED, so this reads what each hook registers without running
 *           the handlers or leaking subscriptions into other suites.
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
        /**
         * The canary. An empty sweep must mean "no module listens to anything", which would itself
         * be a finding — not "the sweep broke and every assertion below passed vacuously".
         */
        expect(subscribers().length).toBeGreaterThan(0);
    });

    it('registers at least one handler per declared hook', () => {
        const inert = subscribers()
            .filter((appModule) => subscriptionsOf(appModule).length === 0)
            .map((appModule) => `${appModule.name} declares subscribe() but registers nothing`);

        expect(inert).toEqual([]);
    });

    it('registers a handler for every event it names', () => {
        /**
         * `onDomainEvent(name, handler)` with a missing second argument registers `undefined`,
         * which `emitDomainEvent` would then call. It fails at emit time, in production, inside a
         * try/catch that logs and continues — so the symptom is a silent no-op, not a crash.
         */
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
        /**
         * Two handlers for one event in one module is either a copy-paste or two things that
         * should be one handler; both run on every emit and neither knows about the other.
         */
        const duplicated = subscribers().flatMap((appModule) => {
            const names = subscriptionsOf(appModule);
            return names
                .filter((name, index) => names.indexOf(name) !== index)
                .map((name) => `${appModule.name} subscribes to ${name} more than once`);
        });

        expect(duplicated).toEqual([]);
    });
});
