/**
 * Reading a module's route table back out of its Express router.
 *
 * ── WHAT THIS IS FOR ────────────────────────────────────────────────────────────────────────────
 * A `routes.ts` is configuration written as code, and it fails the way configuration fails:
 * silently, and in the direction of MORE access. Dropping `isAdmin` from a delete route, writing
 * `/:id` where `/id` was meant, invalidating the `product` cache tag where every reader writes
 * `products` — none of these throw, none change a type, and each one is a live defect the moment
 * it merges. The contract suite exercises a handful of these paths end to end, but it cannot say
 * "and NOTHING else is mounted", which is the half that matters for an authorization chain.
 *
 * So this reads the router back: every method/path actually mounted, in order, with the middleware
 * chain each one carries. A test then states the whole table, and any edit that changes it has to
 * change the test in the same commit — deliberately, where a reviewer sees it.
 *
 * ── WHY THE MIDDLEWARE FACTORIES ARE MOCKED ─────────────────────────────────────────────────────
 * Express keeps the mounted FUNCTION, not the call that produced it. `isAuth` and `isAdmin` are
 * declared functions, so they arrive with their names intact and need nothing. `setCache(3600,
 * {...})`, `invalidateCache([...])`, `routeFlag('hardDelete')` and `upload.single('imageUpload')`
 * are factories: what reaches the stack is an anonymous closure, and the arguments — the cache
 * tags, the TTL, the upload's field name — are captured inside it where no assertion can see them.
 * Those arguments are most of what a route file actually says.
 *
 * {@link cacheMock} and friends replace each factory with one that records its arguments onto the
 * middleware it returns, as {@link ROUTE_LABEL}. `routeTable` reads that back. The replacements are
 * *labelling* wrappers rather than stubs wherever the real chain has names worth keeping —
 * `storageMock` calls through to the real `upload.single`, so `validateUploadedImages` and
 * `quarantineUploadedImages` still show up behind the label.
 *
 * A test file must declare these itself: `jest.mock` is hoisted per module registry and cannot be
 * applied from a helper. The one-liner form is
 *
 *     jest.mock('@infrastructure/http/middlewares/cache', () => require('@tests/routes').cacheMock());
 *
 * `require` inside the factory rather than the imported binding, because `jest.mock` factories may
 * not close over module scope.
 */
import type { Router } from 'express';
import { asStub } from '@tests/stub';

/** Where a mocked factory records the call that produced a middleware. Internal: see finding 3. */
const ROUTE_LABEL = Symbol.for('tests.routeLabel');

/** A middleware carrying the label of the factory call that produced it. */
interface LabelledMiddleware {
    [ROUTE_LABEL]?: string;
    name?: string;
}

/** One mounted endpoint. Internal: the walker's return type, not referenced outside this file. */
interface RouteRow {
    /** Uppercased HTTP method — `GET`, `POST`, … */
    method: string;
    /** The path as Express holds it, so `/:id` rather than a filled-in example. */
    path: string;
    /** Every handler on the route, in mount order, named or labelled. */
    chain: string[];
}

/**
 * The body every labelled middleware shares.
 *
 * Declared once and `bind`-ed per call rather than closed over: each labelled middleware needs its
 * own identity — `Object.assign` writes the label onto the function itself — and `bind` is what
 * produces a fresh function without a new closure per route.
 */
const passThrough = (_request: unknown, _response: unknown, next: () => void): void => {
    next();
};

/** A middleware that does nothing but carry its label, for factories with no real chain to keep. */
const labelled = (label: string) =>
    Object.assign(passThrough.bind(undefined), { [ROUTE_LABEL]: label });

/**
 * One recorded argument, rendered for an assertion.
 *
 * Narrowed rather than `String()`-ed: a factory option can be any shape, and stringifying an
 * object yields `[object Object]` — which reads identically for every object and would make two
 * different cache configurations compare equal.
 */
const text = (value: unknown): string => {
    if (value === undefined) return '·';
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean')
        return String(value);
    return JSON.stringify(value);
};

/** `['a','b']` → `a|b`, so an emptied array reads differently from a renamed one. */
const list = (values: readonly unknown[] | undefined): string =>
    values === undefined ? '·' : values.map(String).join('|');

/**
 * The inverse of {@link text} and {@link list}: one rendered value, parsed back to what produced
 * it. Used only by {@link optionsOf} — see the stopgap note there.
 */
const parseValue = (raw: string): unknown => {
    if (raw === '·') return undefined;
    if (raw.startsWith('[') && raw.endsWith(']')) {
        const inner = raw.slice(1, -1);
        return inner === '' ? [] : inner.split('|');
    }
    if (raw === 'true' || raw === 'false') return raw === 'true';
    return raw !== '' && !Number.isNaN(Number(raw)) ? Number(raw) : raw;
};

/**
 * The recorded options of one factory call on a chain, parsed back out of its rendered label.
 *
 * A stopgap over structured labels (see step 5a in `ROUTE_TABLE_TESTS.md`): it parses a string
 * this same file just built, so the coupling to the rendered format lives here and nowhere else
 * rather than in every module test's `toContain` calls. Only reliable for `key=value` pairs — a
 * factory's leading positional argument (`setCache`'s `ttl`) has no key and is skipped.
 *
 * @param chain - one route's middleware chain, as returned by {@link routeTable}
 * @param factory - the factory name the label was rendered from, e.g. `'setCache'`
 * @returns every `key=value` pair recorded on that call, `[a|b]` parsed back into an array
 * @throws {Error} when no entry on the chain starts with `factory(`
 */
export const optionsOf = (chain: readonly string[], factory: string): Record<string, unknown> => {
    const entry = chain.find((each) => each.startsWith(`${factory}(`));
    if (entry === undefined)
        throw new Error(`No ${factory}(...) call on this chain. Chain: ${chain.join(', ')}`);

    const body = entry.slice(factory.length + 1, -1);
    const options: Record<string, unknown> = {};

    for (const part of body.split(', ')) {
        const equals = part.indexOf('=');
        if (equals !== -1) options[part.slice(0, equals)] = parseValue(part.slice(equals + 1));
    }

    return options;
};

/**
 * Replacement for `@infrastructure/http/middlewares/cache`.
 *
 * The TTL, the tags, the cache-key parameters and the key alias are all recorded: each is a
 * separate way for a caching bug to be invisible — a wrong tag never invalidates, a missing key
 * parameter serves one caller's page to another.
 */
const mockSetCache = (ttl: number, options?: Record<string, unknown>) =>
    labelled(
        `setCache(${ttl}, tags=[${list(options?.tags as unknown[])}], ` +
            `keyParameters=[${list(options?.keyParameters as unknown[])}], ` +
            `keyAs=${text(options?.keyAs)}, ` +
            // `browserRevalidate` decides whether an editor sees their own save. It is a
            // separate failure from a wrong tag — Redis is cleared either way, and the stale copy
            // is the one already in the browser — so it is recorded separately.
            `browserRevalidate=${text(options?.browserRevalidate ?? false)})`
    );

/**
 * Built on {@link mockSetCache} rather than spread in from the real module: the real `searchCache`
 * closes over the real `setCache`, which would produce an unlabelled middleware `routeTable`
 * cannot see — the same reason `setCache` itself is replaced below.
 */
const mockSearchCache = (entity: string, keyParameters: readonly string[], seconds = 3600) =>
    mockSetCache(seconds, { tags: [entity], keyParameters, keyAs: `${entity}:search` });

export const cacheMock = () => ({
    // Spread the real module first: `noStore` is exported from here too and is mounted directly
    // rather than through a factory, so it has a name already and must keep working. Replacing
    // the whole module with a handful of keys would leave `account`'s `router.use(noStore)`
    // undefined.
    ...jest.requireActual<typeof import('@infrastructure/http/middlewares/cache')>(
        '@infrastructure/http/middlewares/cache'
    ),
    __esModule: true,
    setCache: mockSetCache,
    searchCache: mockSearchCache,
    invalidateCache: (tags: readonly string[]) => labelled(`invalidateCache([${list(tags)}])`)
});

/**
 * Replacement for `@infrastructure/http/middlewares/rate-limit`'s `credentialLimiters`.
 *
 * The pair of rate limiters in front of every credential route arrives as two anonymous
 * `express-rate-limit` closures, indistinguishable in a route table from any other unnamed
 * middleware — so "is login rate-limited" is not a question the stack can answer as it stands.
 *
 * The real array is mapped rather than replaced, so its LENGTH is preserved: the two budgets are
 * one identity-keyed and one address-keyed, they defend different attacks, and the module's own
 * comment says a route "cannot apply half of the pair". Labelling each by index makes dropping one
 * of them visible, which replacing the array with a single marker would not.
 */
export const securityMock = () => {
    const actual = jest.requireActual<typeof import('@infrastructure/http/middlewares/rate-limit')>(
        '@infrastructure/http/middlewares/rate-limit'
    );

    return {
        ...actual,
        __esModule: true,
        credentialLimiters: actual.credentialLimiters.map((_limiter, index) =>
            labelled(`credentialLimiters[${index}]`)
        )
    };
};

/** Replacement for `@infrastructure/http/middlewares/route-flag`. */
export const routeFlagMock = () => ({
    __esModule: true,
    routeFlag: (flag: string) => labelled(`routeFlag(${flag})`)
});

/**
 * Replacement for `@infrastructure/adapters/storage`'s `upload`.
 *
 * Calls THROUGH to the real `upload.single` and prepends the label, so the field name becomes
 * assertable without hiding `validateUploadedImages` / `quarantineUploadedImages` behind a stub — those
 * are part of what an upload route promises, and a test that could not see them would pass with
 * them removed.
 */
export const storageMock = () => {
    const actual = jest.requireActual<typeof import('@infrastructure/adapters/storage')>(
        '@infrastructure/adapters/storage'
    );
    return {
        ...actual,
        __esModule: true,
        upload: {
            ...actual.upload,
            single: (fieldName: string) => [
                labelled(`upload.single(${fieldName})`),
                ...[actual.upload.single(fieldName)].flat()
            ]
        }
    };
};

/**
 * What one mounted handler is called: its recorded factory call, its name, Express's own layer
 * name, or `(anonymous)`.
 *
 * `layerName` is only meaningful for a `router.use(...)` layer — Express gives those a `.name`
 * (`'<anonymous>'` for an inline arrow) that a route's own `route.stack` entries do not carry.
 * Passing it there is more informative than falling straight to the literal `'(anonymous)'`.
 */
const handlerName = (handle: LabelledMiddleware, layerName?: string): string =>
    // `||`, not `??`: an inline arrow handler has a `name` of `''` rather than `undefined`, and
    // `??` would keep the empty string — turning every inline handler into a blank entry that
    // reads, in a failure diff, as if the route had no handler at all.
    handle[ROUTE_LABEL] ?? (handle.name || layerName || '(anonymous)');

/** One layer of `router.stack`, route or `use`, as far as the walker below needs it. */
interface Layer {
    route?: {
        path: string;
        methods: Record<string, boolean>;
        stack: { handle: LabelledMiddleware }[];
    };
    handle: LabelledMiddleware;
    name?: string;
}

/**
 * Walks a router's stack once, in mount order, and answers every question the exports below need.
 *
 * The single place coupled to the undocumented Express internals `router.stack`,
 * `layer.route.methods` and `route.stack[].handle` — see `tests/unit/infrastructure/http/router-
 * internals.test.ts` for the pinned shape. Everything exported from this file is a projection of
 * this one pass; there used to be three separate walkers here; and `handlerName`'s two callers
 * used to disagree about the fallback below (a `router.use` layer's own Express name vs the
 * literal `'(anonymous)'`) purely because the logic had been copied rather than shared.
 *
 * @param router - the module's exported Express router
 * @returns `rows`, one per mounted endpoint with the `use` layers accumulated above it, in mount
 * order; and `middleware`, every `use` layer on the router regardless of position
 */
const walk = (
    router: Router
): { rows: (RouteRow & { applies: string[] })[]; middleware: string[] } => {
    const layers = asStub<{ stack: Layer[] }>(router).stack;
    const applies: string[] = [];
    const rows: (RouteRow & { applies: string[] })[] = [];

    for (const layer of layers) {
        if (layer.route === undefined) {
            applies.push(handlerName(layer.handle, layer.name));
            continue;
        }

        for (const method of Object.keys(layer.route.methods).filter(
            (each) => layer.route!.methods[each]
        ))
            rows.push({
                method: method.toUpperCase(),
                path: layer.route.path,
                chain: layer.route.stack.map(({ handle }) => handlerName(handle)),
                // Copied, not shared: later `use` layers must not appear to guard earlier routes.
                applies: [...applies]
            });
    }

    // `applies` by now holds every `use` layer seen, route-adjacent or not — the full sweep
    // `routerMiddleware` wants, including one mounted below the last route.
    return { rows, middleware: applies };
};

/**
 * Every endpoint mounted on a router, in mount order.
 *
 * Mount order is preserved rather than sorted because it is load-bearing: `/search` and
 * `/categories` are only reachable while they are declared BEFORE `/:id`, which would otherwise
 * match them as an id. A sorted table would pass with that ordering reversed.
 *
 * @param router - the module's exported Express router
 * @returns one row per method/path pair
 */
export const routeTable = (router: Router): RouteRow[] =>
    walk(router).rows.map(({ applies: _applies, ...row }) => row);

/**
 * The router-level middleware mounted with `router.use(...)`, in order.
 *
 * Separate from {@link routeTable} because it applies to every route rather than to one, and a
 * module that stops calling `router.use(getAuth)` loses admin visibility on all of them at once.
 */
export const routerMiddleware = (router: Router): string[] => walk(router).middleware;

/** `GET /:id` — the compact spelling used in assertions. */
export const routeSignatures = (router: Router): string[] =>
    walk(router).rows.map(({ method, path }) => `${method} ${path}`);

/**
 * The router-level middleware that actually applies to each route, by POSITION.
 *
 * `router.use(...)` guards what is mounted BELOW it and nothing above. Two modules here rely on
 * that deliberately — `feedback` mounts its one public contact route above the admin gate, and
 * `locales` declares its public reads first — and both carry a comment saying so, because it is
 * also how a route appended into the wrong half becomes public without looking wrong.
 * {@link routerMiddleware} flattens that away: it reports the same list for every route, which is
 * exactly the mistake the arrangement invites.
 *
 * @param router - the module's exported Express router
 * @returns one row per endpoint, its `applies` listing the router-level middleware above it
 */
export const effectiveRouteTable = (router: Router): (RouteRow & { applies: string[] })[] =>
    walk(router).rows;

/**
 * Every guard in force on one endpoint — router-level and per-route, in that order.
 *
 * The spelling an authorization assertion wants: "is `isAdmin` on this route" is a question about
 * both halves at once, and asking only the per-route half reports `locales`' admin writes as
 * unguarded while reporting `feedback`'s as guarded, when the difference is only where the same
 * guard is written.
 */
export const guardsOn = (router: Router, signature: string): string[] => {
    const row = effectiveRouteTable(router).find(
        ({ method, path }) => `${method} ${path}` === signature
    );

    if (row === undefined)
        throw new Error(
            `No route ${signature} is mounted. Mounted: ${routeSignatures(router).join(', ')}`
        );

    return [...row.applies, ...row.chain];
};
