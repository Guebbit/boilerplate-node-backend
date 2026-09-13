/**
 * Pins the undocumented Express internals `tests/support/routes.ts` is built on.
 *
 * `Router.stack`, `layer.route.methods` and `route.stack[].handle` are not part of Express's
 * public API — nothing in semver protects them. This test exists to fail LOUDLY, in one place
 * with one sentence's worth of context, the moment they change shape. Without it, an Express bump
 * that moves this surface (it already split its router into a separate `router` package once)
 * would show up as all twelve `routes.test.ts` suites failing with
 * `cannot read properties of undefined (reading 'methods')`, with nothing pointing at the shared
 * helper that actually broke.
 *
 * A failure here means `tests/support/routes.ts` needs updating for the new shape. It does not
 * mean the application is broken.
 */
import { Router } from 'express';
import { asStub } from '@tests/stub';

interface RouteLayer {
    route: {
        path: string;
        methods: Record<string, boolean>;
        stack: { handle: unknown }[];
    };
}

interface UseLayer {
    route?: undefined;
    name?: string;
    handle: unknown;
}

describe('Router.stack shape', () => {
    const probe = Router();
    probe.use((_request, _response, next) => next());
    probe.get('/:id', function isAuth(_request, _response, next) {
        next();
    });

    const layers = asStub<(RouteLayer | UseLayer)[]>(asStub<{ stack: unknown }>(probe).stack);
    const [useLayer, routeLayer] = layers as [UseLayer, RouteLayer];

    it('keeps a stack array on the router instance', () => {
        expect(Array.isArray(layers)).toBe(true);
        expect(layers).toHaveLength(2);
    });

    it('keeps route layers with a methods map and a handler stack', () => {
        expect(routeLayer.route).toBeDefined();
        expect(typeof routeLayer.route.methods).toBe('object');
        expect(routeLayer.route.methods.get).toBe(true);
        expect(typeof routeLayer.route.stack[0].handle).toBe('function');
    });

    it('keeps use-layers without a route, so they are distinguishable from route layers', () => {
        expect(useLayer.route).toBeUndefined();
    });
});
