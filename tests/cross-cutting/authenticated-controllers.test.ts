import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

/**
 * Guard: a controller that reads `authContextOf` is mounted behind `isAuth`.
 *
 * `Request.authContext` is optional, correctly — it is absent until the auth middleware resolves
 * it. `authContextOf` asserts it is there, once, with the argument written down; this is the half
 * no type can carry, because whether the ROUTE is authenticated lives in `routes.ts`.
 *
 * Without it the assertion is just a nicer-looking version of the `!` it replaced. With it, a
 * controller that starts reading the caller and is mounted on a public route fails here rather
 * than answering `undefined.id` at runtime.
 *
 * It also catches the placement hazard a router can carry: `feedback` calls `router.use(isAuth)`
 * MID-FILE, so a route appended above that line is silently public. A controller counts as
 * authenticated only when its own mount is guarded, or when a `router.use` appears BEFORE it in
 * the file.
 */

const MODULES_ROOT = path.join(__dirname, '..', '..', 'src', 'modules');

/** Controllers that read the caller through the accessor, by exported handler name. */
const handlersReadingAuthContext = (moduleRoot: string): Set<string> => {
    const controllers = path.join(moduleRoot, 'controllers');
    if (!existsSync(controllers)) return new Set();

    const names = new Set<string>();
    for (const file of readdirSync(controllers).filter((f) => f.endsWith('.ts'))) {
        const source = readFileSync(path.join(controllers, file), 'utf8');
        if (!source.includes('authContextOf(')) continue;
        for (const [, name] of source.matchAll(/export const (\w+) = /g)) names.add(name);
    }
    return names;
};

/**
 * Every handler name the router mounts on a route that is NOT authenticated.
 *
 * Order matters, so the file is walked top to bottom: a `router.use(...isAuth...)` authenticates
 * everything BELOW it, and a route above that line is guarded only if it names `isAuth` itself.
 */
const unauthenticatedMounts = (moduleRoot: string): string[] => {
    const routes = path.join(moduleRoot, 'routes.ts');
    if (!existsSync(routes)) return [];

    let blanketFromHereDown = false;
    const mounted: string[] = [];

    for (const line of readFileSync(routes, 'utf8').split('\n')) {
        if (line.trim().startsWith('//') || line.trim().startsWith('*')) continue;

        if (/router\.use\([^)]*\bisAuth\b/.test(line)) {
            blanketFromHereDown = true;
            continue;
        }

        const mount = /router\.(?:get|post|put|patch|delete)\((.*)$/.exec(line);
        if (!mount) continue;
        if (blanketFromHereDown || mount[1].includes('isAuth')) continue;

        // The handler is the last identifier on the mount line.
        const identifiers = [...mount[1].matchAll(/([$A-Z_a-z][\w$]*)/g)].map(([, name]) => name);
        const handler = identifiers.at(-1);
        if (handler) mounted.push(handler);
    }

    return mounted;
};

const modules = (): string[] =>
    readdirSync(MODULES_ROOT).map((name) => path.join(MODULES_ROOT, name));

describe('every controller reading the caller is mounted behind isAuth', () => {
    it('finds no handler asserting an auth context its route does not guarantee', () => {
        const offenders = modules().flatMap((moduleRoot) => {
            const reading = handlersReadingAuthContext(moduleRoot);
            if (reading.size === 0) return [];
            return unauthenticatedMounts(moduleRoot)
                .filter((handler) => reading.has(handler))
                .map((handler) => `${path.basename(moduleRoot)}: ${handler}`);
        });

        expect(offenders).toEqual([]);
    });

    it('actually finds controllers to check', () => {
        // A canary: an empty result must mean "all guarded", never "nothing was read".
        const total = modules().reduce(
            (count, moduleRoot) => count + handlersReadingAuthContext(moduleRoot).size,
            0
        );
        expect(total).toBeGreaterThan(10);
    });
});
