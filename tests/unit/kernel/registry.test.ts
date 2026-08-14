import { Router } from 'express';
import { registerModules, validateModules } from '@kernel/registry';
import type { AppModule } from '@kernel/registry';

/**
 * The registry is the file that decides what "this build" means, so its failures have to be loud
 * and specific. A misconfiguration that boots and then 500s on the first request crossing the gap
 * is strictly worse than one that refuses to boot with the offending path named.
 */

const makeModule = (name: string, dependsOn: string[] = []): AppModule => ({
    name,
    basePath: `/${name}`,
    routes: Router(),
    dependsOn
});

describe('validateModules', () => {
    it('accepts a well-formed registry', () => {
        expect(() =>
            validateModules([makeModule('products'), makeModule('cart', ['products'])])
        ).not.toThrow();
    });

    it('rejects a module registered twice', () => {
        expect(() => validateModules([makeModule('products'), makeModule('products')])).toThrow(
            /registered twice/
        );
    });

    it('names the module and the dependency when a dependency is not enabled', () => {
        // The event-portal case from the plan: products is deleted, cart is not.
        expect(() => validateModules([makeModule('cart', ['products'])])).toThrow(
            /"cart" depends on "products", which is not enabled/
        );
    });

    it('reports the path of a dependency cycle rather than just its existence', () => {
        expect(() =>
            validateModules([makeModule('cart', ['products']), makeModule('products', ['cart'])])
        ).toThrow(/cycle: (cart → products → cart|products → cart → products)/);
    });

    it('catches a cycle that closes through a third module', () => {
        expect(() =>
            validateModules([
                makeModule('a', ['b']),
                makeModule('b', ['c']),
                makeModule('c', ['a'])
            ])
        ).toThrow(/cycle:/);
    });

    it('accepts a module that owns data but declares no router', () => {
        // `audit-logs` is the real one: it owns a collection, and the endpoint that reads it
        // belongs to `observability`. A headless module is a first-class registry entry, and
        // other modules may still depend on it.
        expect(() =>
            validateModules([{ name: 'audit-logs' }, makeModule('observability', ['audit-logs'])])
        ).not.toThrow();
    });

    it('accepts a diamond, which is not a cycle', () => {
        expect(() =>
            validateModules([
                makeModule('orders', ['products', 'users']),
                makeModule('products'),
                makeModule('users')
            ])
        ).not.toThrow();
    });
});

describe('registerModules', () => {
    it('subscribes every module that asks to', () => {
        const subscribe = jest.fn();
        registerModules([{ ...makeModule('products'), subscribe }]);

        expect(subscribe).toHaveBeenCalledTimes(1);
    });

    it('validates before subscribing, so a broken registry attaches no handlers', () => {
        const subscribe = jest.fn();

        expect(() =>
            registerModules([{ ...makeModule('cart', ['products']), subscribe }])
        ).toThrow();
        expect(subscribe).not.toHaveBeenCalled();
    });
});
