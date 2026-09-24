/**
 * @module
 * The observability route table: what is mounted, in what order, and which guard chain protects
 * each endpoint. `/events` and `/metrics` are guarded differently from the other three — see the
 * comment in `routes.ts` for why — but every handler here is a named controller like everywhere
 * else in this codebase; see `get-observability-events.test.ts` and
 * `get-observability-metrics.test.ts` for what each one does.
 */

import { routeSignatures, guardsOn, routeTable } from '@tests/routes';
import { router } from '@modules/observability/routes';

describe('observability routes — what is mounted', () => {
    it('mounts exactly the documented endpoints, in the documented order', () => {
        expect(routeSignatures(router)).toEqual([
            'GET /events',
            'GET /metrics',
            'GET /health',
            'GET /metrics/overview',
            'GET /audit'
        ]);
    });

    it('declares /metrics before /metrics/overview without shadowing it', () => {
        // Two segments against one: they cannot collide, but the ordering is the file's stated
        // convention and the pair is the one place a future `/metrics/:name` would break.
        const paths = routeTable(router).map(({ path }) => path);

        expect(paths.indexOf('/metrics')).toBeLessThan(paths.indexOf('/metrics/overview'));
    });
});

describe('observability routes — the two guard styles', () => {
    it('guards the SSE stream by cookie, because EventSource cannot send a header', () => {
        const guards = guardsOn(router, 'GET /events');

        expect(guards).toEqual(['requirePermissionViaCookieGuard', 'getObservabilityEvents']);
        // The ordinary chain here would lock out the only client this route exists for.
        expect(guards).not.toContain('isAuth');
    });

    it('guards the scrape by static credential, because Prometheus cannot log in', () => {
        expect(guardsOn(router, 'GET /metrics')).toEqual([
            'isMetricsScraper',
            'getObservabilityMetrics'
        ]);
    });

    it.each(['GET /health', 'GET /metrics/overview', 'GET /audit'])(
        '%s takes the ordinary admin chain',
        (signature) => {
            const guards = guardsOn(router, signature);

            expect(guards).toContain('getAuth');
            expect(guards).toContain('isAuth');
            expect(guards).toContain('requirePermissionGuard');
        }
    );

    it('leaves no observability endpoint unguarded', () => {
        // Every route here is a map of the service. The sweep covers all three guard styles at
        // once, so a route added with any of them passes and one added with none fails.
        const unguarded = routeSignatures(router).filter(
            (signature) =>
                !guardsOn(router, signature).some((guard) =>
                    [
                        'requirePermissionGuard',
                        'requirePermissionViaCookieGuard',
                        'isMetricsScraper'
                    ].includes(guard)
                )
        );

        expect(unguarded).toEqual([]);
    });
});
