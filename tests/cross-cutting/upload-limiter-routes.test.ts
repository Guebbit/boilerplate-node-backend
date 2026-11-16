/**
 * One app-wide guard: every route that reads an upload (`upload.image()`) mounts the shared
 * `uploadLimiter` budget before it, so a client cannot spend the disk and the image pipeline
 * faster than the budget allows.
 *
 * Mount order matters: the limiter must run before multer buffers the body, or a refused client
 * has already cost the work the budget exists to ration. The mounted route table is read, so a
 * new upload route anywhere is covered the moment its module is enabled.
 *
 * Why a sweep, not a check per module: the limiter is a route argument, a wiring line that
 * Stryker cannot mutate, and a copy per module reseeds with every copy of the template.
 */
import { effectiveRouteTable, guardsOn } from '@tests/routes';
import { ROUTED_MODULES } from '@tests/routed-modules';

jest.mock('@infrastructure/http/middlewares/cache', () =>
    jest.requireActual<typeof import('@tests/routes')>('@tests/routes').cacheMock()
);
jest.mock('@infrastructure/http/middlewares/route-flag', () =>
    jest.requireActual<typeof import('@tests/routes')>('@tests/routes').routeFlagMock()
);
jest.mock('@infrastructure/http/middlewares/upload', () =>
    jest.requireActual<typeof import('@tests/routes')>('@tests/routes').storageMock()
);
jest.mock('@infrastructure/http/middlewares/rate-limit', () =>
    jest.requireActual<typeof import('@tests/routes')>('@tests/routes').securityMock()
);

/** Every upload route as `[`${module} ${METHOD} ${path}`, its guards in mount order]`. */
const uploadRoutes = (): [string, string[]][] =>
    Object.entries(ROUTED_MODULES).flatMap(([moduleName, router]) =>
        effectiveRouteTable(router)
            .map(
                ({ method, path }) =>
                    [`${moduleName} ${method} ${path}`, guardsOn(router, `${method} ${path}`)] as [
                        string,
                        string[]
                    ]
            )
            .filter(([, guards]) => guards.includes('upload.image'))
    );

describe('upload routes are rate-limited before the upload is read', () => {
    /**
     * A vacuous pass would read as green: if the walker stopped seeing uploads, the sweep below
     * would check nothing.
     */
    it('finds upload routes to check', () => {
        expect(uploadRoutes().length).toBeGreaterThan(0);
    });

    it.each(uploadRoutes())('%s mounts uploads before upload.image', (_key, guards) => {
        expect(guards.indexOf('uploads')).toBeGreaterThanOrEqual(0);
        expect(guards.indexOf('uploads')).toBeLessThan(guards.indexOf('upload.image'));
    });
});
