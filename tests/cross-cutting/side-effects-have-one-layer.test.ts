/**
 * A side effect is published from ONE layer, or the exception is argued for.
 *
 * The four emits below — a queued email, an audit record, an analytics event, a domain event — are
 * the things this application does besides answering. Each of them is a fact about the DOMAIN: an
 * order was created, an account was deleted, stock moved. None is a fact about HTTP. So each
 * belongs in the service that knows the fact, and a second caller of that service — a job, a queue
 * consumer, a sibling module — inherits it instead of having to remember it.
 *
 * That was not true, and the way it stopped being true is worth recording, because no per-file
 * rule could have seen it:
 *
 *   - `CallerContext` carried the caller and the request id but not the LANGUAGE of the request.
 *     A service composing an email needs `recipient.locale ?? requestLocale ?? default`, and with
 *     no channel for the middle term the only place that could reach `request.locale` was the
 *     controller. So the whole email — compose AND publish — climbed one layer, in five handlers.
 *   - `orders` ended up publishing the confirmation mail for an admin-created order from
 *     `controllers/write-orders.ts`, while the identical mail for a checkout went out from
 *     `cart/services/checkout.ts`. One fact, two layers, and nothing anywhere said which was
 *     right.
 *   - `feedback` published its support notification from a controller while its sibling `delivery`
 *     published from the service, for no stated reason at all.
 *
 * Every one of those files was individually defensible. What was wrong was the SET, and a set is
 * what a lint rule cannot see: ESLint reads one file and has no opinion about where the other
 * fourteen call the same function. Hence a test.
 *
 * ── The shape of the assertion ────────────────────────────────────────────────────────────────
 *
 * Not "no controller may emit" — that would be a wall, and two controllers have earned their way
 * through it for reasons that are about security rather than about tidiness. The assertion is that
 * the home layer is a SINGLETON and every departure from it is named here with its reason. An
 * exception that cannot be explained in a sentence is one that has not been thought about.
 *
 * `EXPECTED_LAYER` is deliberately not derived from what the tree currently does. A test that
 * measures the code and then asserts the measurement passes forever and prevents nothing; the
 * layer is written down as an intention, and the code is compared against it.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const MODULES_ROOT = path.join(__dirname, '../../src/modules');

/** The layer a module file belongs to, from its path alone. */
type Layer = 'controller' | 'service' | 'repository' | 'model' | 'routes' | 'domain' | 'other';

/**
 * Every `.ts` file under a module that ships, specs excluded.
 *
 * Specs are not a layer and emit freely — several assert an emit by making one.
 */
const moduleFiles = (): string[] => {
    const walk = (directory: string): string[] =>
        readdirSync(directory).flatMap((entry) => {
            const entryPath = path.join(directory, entry);
            if (statSync(entryPath).isDirectory()) return entry === 'tests' ? [] : walk(entryPath);
            return entryPath.endsWith('.ts') ? [entryPath] : [];
        });
    return walk(MODULES_ROOT);
};

/**
 * Classify one file.
 *
 * `services/` and a bare `service.ts` are one layer, because `docs/theory/layers.md` says the
 * split into a folder is a SIZE decision and nothing above the layer changes when a module makes
 * it. A module that grew a `services/` folder must not thereby acquire a new place to emit from.
 */
const layerOf = (file: string): Layer => {
    const relative = path.relative(MODULES_ROOT, file);
    const parts = relative.split(path.sep);
    const tail = parts.slice(1);

    if (tail[0] === 'controllers') return 'controller';
    if (tail[0] === 'domain') return 'domain';
    if (tail[0] === 'services' || tail[0] === 'service.ts') return 'service';
    if (tail[0] === 'repository.ts') return 'repository';
    if (tail[0] === 'model.ts') return 'model';
    if (tail[0] === 'routes.ts') return 'routes';
    return 'other';
};

/** `<module>/<path>` — how a file is named in a failure string and in the allowlist. */
const label = (file: string): string => path.relative(MODULES_ROOT, file).split(path.sep).join('/');

/**
 * The side effects this test governs, and the layer each belongs to.
 *
 * All four are `service` for the same reason: they report something that happened to the domain,
 * and the domain is what the service layer is about. A controller knows a request arrived; it does
 * not, on its own, know that an order now exists.
 */
const EXPECTED_LAYER: Readonly<Record<string, Layer>> = {
    enqueueEmail: 'service',
    emitAuditEvent: 'service',
    emitAnalyticsEvent: 'service',
    emitDomainEvent: 'service'
};

/**
 * The departures, each with the argument that earns it.
 *
 * Keyed `<marker> @ <module>/<path>` so one file cannot inherit another's excuse, and so an
 * exception for `emitAuditEvent` does not silently also permit `enqueueEmail`.
 *
 * Both entries are the same shape of argument, and it is one only a controller can make: the emit
 * has to happen for a request that found NO account, and a service function reachable only once a
 * user has been found cannot fire then. Moving either one would make the audit trail disclose
 * account existence that the response deliberately does not.
 */
const ALLOWED_ELSEWHERE: Readonly<Record<string, string>> = {
    'emitAuditEvent @ account/controllers/post-login.ts':
        'A failed login must be recorded, and there is no user document to hand a service when the email belongs to nobody. Emitting from the handler is what makes the record cover the attempts most worth having.',
    'emitAnalyticsEvent @ account/controllers/post-login.ts':
        'Same request as the audit record above and the same constraint: the login event is reported for outcomes that never reach a service, so the handler is the only layer that sees all of them.',
    'emitAuditEvent @ account/controllers/post-reset-request.ts':
        'Fires unconditionally, whether or not the address belongs to an account, which is exactly what keeps the 200 identical either way and prevents user enumeration. A service reached only after a user is found cannot reproduce that.'
};

/** `<marker> → the files that call it, by layer`. */
const callSites = (): Map<string, { file: string; layer: Layer }[]> => {
    const found = new Map<string, { file: string; layer: Layer }[]>(
        Object.keys(EXPECTED_LAYER).map((marker) => [marker, []])
    );

    for (const file of moduleFiles()) {
        const source = readFileSync(file, 'utf8');
        for (const marker of Object.keys(EXPECTED_LAYER)) {
            // The CALL, not the import line and not a mention in a comment: a docblock naming
            // `emitAuditEvent` is documentation, and reporting it would teach people to reword
            // their comments rather than move their code.
            const pattern = new RegExp(String.raw`(?<![\w.])${marker}\s*\(`);
            const withoutComments = source
                .replaceAll(/\/\*[\S\s]*?\*\//g, '')
                .replaceAll(/\/\/[^\n]*/g, '');
            if (pattern.test(withoutComments))
                found.get(marker)!.push({ file, layer: layerOf(file) });
        }
    }
    return found;
};

describe('every side effect is published from one layer', () => {
    it('finds the emits it means to check', () => {
        // A canary. An empty sweep must mean "nothing emits", not "the regex stopped matching" —
        // which is the failure mode that turns this whole file into a no-op nobody notices.
        const sites = callSites();

        expect(moduleFiles().length).toBeGreaterThan(0);
        for (const marker of Object.keys(EXPECTED_LAYER))
            expect(sites.get(marker)!.length).toBeGreaterThan(0);
    });

    it('publishes each one from the layer that owns it, or says why not', () => {
        const sites = callSites();
        const strays = [...sites.entries()].flatMap(([marker, files]) =>
            files
                .filter(({ layer }) => layer !== EXPECTED_LAYER[marker])
                .filter(({ file }) => !(`${marker} @ ${label(file)}` in ALLOWED_ELSEWHERE))
                .map(
                    ({ file, layer }) =>
                        `${label(file)} calls ${marker} from the ${layer} layer; ${marker} belongs to the ${EXPECTED_LAYER[marker]} layer`
                )
        );

        expect(strays).toEqual([]);
    });

    it('gives every exception a reason a reader can weigh', () => {
        const thin = Object.entries(ALLOWED_ELSEWHERE)
            .filter(([, reason]) => reason.trim().split(/\s+/).length < 12)
            .map(([key]) => `${key} is excused without an argument`);

        expect(thin).toEqual([]);
    });

    it('keeps no exception for a file that has stopped emitting', () => {
        const sites = callSites();
        const stale = Object.keys(ALLOWED_ELSEWHERE).filter((key) => {
            const [marker, file] = key.split(' @ ');
            return !sites.get(marker)?.some((site) => label(site.file) === file);
        });

        expect(stale).toEqual([]);
    });

    it('names a real marker and a real layer in every expectation', () => {
        // Guards the table itself: a typo'd marker would sweep for a function nobody calls and
        // quietly govern nothing, which the canary above catches, and a typo'd layer would make
        // every call site a stray, which is loud. This makes the first one loud too.
        const layers = new Set<Layer>([
            'controller',
            'service',
            'repository',
            'model',
            'routes',
            'domain',
            'other'
        ]);
        const bad = Object.entries(EXPECTED_LAYER)
            .filter(([, layer]) => !layers.has(layer))
            .map(([marker]) => `${marker} expects a layer that does not exist`);

        expect(bad).toEqual([]);
    });
});
