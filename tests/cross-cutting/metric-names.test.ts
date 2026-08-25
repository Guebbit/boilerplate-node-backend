/**
 * A metric name is an identifier three places agree on, and only one of them is type-checked.
 *
 * A module declares its counters in `metrics.ts` and registers them on the shared registry. Two
 * other places then name them:
 *
 *   - `observability/controllers/get-observability-metrics-overview.ts` reads seven of them by
 *     STRING, deliberately — the overview endpoint may not import a domain, so the name is the
 *     only handle it has;
 *   - Prometheus, Grafana and every alert written against them, which live outside this repo
 *     entirely and cannot be refactored with it.
 *
 * So renaming a counter compiles, lints, and passes every unit test. `getSingleMetric` answers
 * `undefined`, the overview reports the counter as absent — a shape the endpoint handles on
 * purpose, because a DELETED module has to leave exactly that behind — and the dashboard that
 * asked for it goes flat rather than red. The failure is a number that stops moving, noticed weeks
 * later by whoever trusted it.
 *
 * ── Why source text, and what makes that sound ────────────────────────────────────────────────
 * Every fact below is read from `metrics.ts` and from the controller, the way `outbox-names.test.ts`
 * reads the outbox: the question is what the code SAYS, and a spec that imported the modules to
 * answer it would boot Mongoose and collect `products_low_stock_total`, which aggregates the
 * products collection. A name check does not get to open a database.
 *
 * Reading text is only sound while the text is the whole story, so two cases below hold it there:
 * every name must be a literal, and every declaration must register on the shared registry. A name
 * assembled at runtime, or a counter registered somewhere else, would be invisible here — and
 * neither is a thing this repo does.
 *
 * ── What is deliberately NOT asserted ─────────────────────────────────────────────────────────
 * One owner per name. `prom-client` throws `A metric with the name X has already been registered`
 * when a registry sees a duplicate, so a collision cannot reach a running process. A case here
 * would assert a property the library already guarantees.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const MODULES_ROOT = path.join(__dirname, '../../src/modules');
const OVERVIEW_CONTROLLER = path.join(
    MODULES_ROOT,
    'observability/controllers/get-observability-metrics-overview.ts'
);

/**
 * Comments out, so a note between `new Counter({` and its `name:` does not hide a declaration.
 *
 * `account/metrics.ts` carries exactly that — a line explaining the naming convention, sitting
 * where the pattern below expects the first field — and the sweep read straight past the counter
 * the overview endpoint depends on most. `scripts/check-environment-keys.ts` strips the same way
 * and for the same reason.
 */
const withoutComments = (source: string): string =>
    source.replaceAll(/\/\*[\S\s]*?\*\//g, '').replaceAll(/^[^\S\n]*\/\/.*$/gm, '');

/** Every `src/modules/<name>/metrics.ts`, discovered rather than listed. */
const metricFiles = (): { module: string; file: string }[] =>
    readdirSync(MODULES_ROOT)
        .map((module) => ({ module, file: path.join(MODULES_ROOT, module, 'metrics.ts') }))
        .filter(({ file }) => existsSync(file));

interface Declaration {
    module: string;
    name: string;
    /** `Counter`, `Gauge`, `Histogram` or `Summary` — the constructor this name was declared with. */
    kind: string;
    help: string;
}

/**
 * Every metric a module declares, with the constructor and help text beside it.
 *
 * One match per `new <Kind>({ … })` block, so the three facts stay attached to each other: a
 * separate sweep per field would happily pair one metric's name with another's help.
 */
const declarations = (): Declaration[] =>
    metricFiles().flatMap(({ module, file }) =>
        [
            ...withoutComments(readFileSync(file, 'utf8')).matchAll(
                /new (Counter|Gauge|Histogram|Summary)\({\s*name: '([^']+)',\s*help: '([^']*)'/g
            )
        ].map(([, kind, name, help]) => ({ module, name, kind, help }))
    );

/** Every `name:` assignment in a metrics file, literal or not. */
const nameAssignments = (): { module: string; line: string }[] =>
    metricFiles().flatMap(({ module, file }) =>
        withoutComments(readFileSync(file, 'utf8'))
            .split('\n')
            .filter((line) => /^\s*name:/.test(line))
            .map((line) => ({ module, line: line.trim() }))
    );

/**
 * The names the overview endpoint reads by string.
 *
 * Read from source text rather than from an export, because there is no export to read: the
 * literals are the point. A constant listing them would be one more thing to keep in step, and the
 * controller would still be free to spell a name inline.
 */
const namesReadByLiteral = (): string[] =>
    [
        ...withoutComments(readFileSync(OVERVIEW_CONTROLLER, 'utf8')).matchAll(
            /readCounter\('([^']+)'\)/g
        )
    ].map(([, name]) => name);

describe('metric names', () => {
    it('finds the metrics and the readers it means to check', () => {
        // A canary: a renamed file or a changed call shape would otherwise make every case below a
        // sweep over an empty list, which passes and proves nothing.
        expect(metricFiles().length).toBeGreaterThanOrEqual(5);
        expect(declarations().length).toBeGreaterThanOrEqual(12);
        expect(namesReadByLiteral().length).toBeGreaterThanOrEqual(5);
    });

    it('resolves every name the overview endpoint reads by string', () => {
        /*
         * The live one. `getSingleMetric` answering `undefined` is indistinguishable from a module
         * that was removed, so the endpoint cannot tell a rename from a deletion — and neither can
         * anyone reading its output.
         */
        const declared = new Set(declarations().map(({ name }) => name));
        const unresolved = namesReadByLiteral()
            .filter((name) => !declared.has(name))
            .map(
                (name) =>
                    `${name} — read by get-observability-metrics-overview.ts, declared by no module`
            );

        expect(unresolved).toEqual([]);
    });

    it('states every name as a literal, so the sweep above can see all of them', () => {
        /*
         * A name assembled from a variable or a template string would be published without any case
         * here noticing. It is also not a thing a metric name can usefully be: an identifier shared
         * with Prometheus and with dashboards nobody in this repo can edit cannot be computed from
         * anything local.
         */
        const computed = nameAssignments()
            .filter(({ line }) => !/^name: '[^']+',?$/.test(line))
            .map(({ module, line }) => `${module}: ${line}`);

        expect(computed).toEqual([]);
    });

    it('registers every metric on the shared registry', () => {
        /*
         * What makes reading text sound. A metric registered on a registry of its own is real, is
         * never exposed by `/metrics`, and is never found by the overview — and every case here
         * would still call it declared.
         */
        const unregistered = metricFiles()
            .map(({ module, file }) => ({
                module,
                source: withoutComments(readFileSync(file, 'utf8'))
            }))
            .flatMap(({ module, source }) => {
                const declared = [...source.matchAll(/new (?:Counter|Gauge|Histogram|Summary)\(/g)];
                const registered = [...source.matchAll(/registers: \[metricsRegistry]/g)];
                return declared.length === registered.length
                    ? []
                    : [
                          `${module}: ${declared.length} metric(s) declared, ${registered.length} on metricsRegistry`
                      ];
            });

        expect(unregistered).toEqual([]);
    });

    it('names every metric the way Prometheus expects', () => {
        /*
         * `snake_case`, lower case, no leading digit — the exposition format's own rule, and the
         * one thing a client library will let you break until a scrape rejects the series.
         */
        const malformed = declarations()
            .filter(({ name }) => !/^[a-z][\da-z]*(?:_[\da-z]+)*$/.test(name))
            .map(({ module, name }) => `${module}: ${name} is not snake_case`);

        expect(malformed).toEqual([]);
    });

    it('suffixes every counter with _total', () => {
        /*
         * Not decoration: `_total` is how OpenMetrics marks a monotonic series, and a `rate()` over
         * a name without it is a query someone has to remember is still correct. Counters only — a
         * gauge goes down, and the suffix on one would be a lie.
         */
        const unsuffixed = declarations()
            .filter(({ kind }) => kind === 'Counter')
            .filter(({ name }) => !name.endsWith('_total'))
            .map(({ module, name }) => `${module}: ${name}`);

        expect(unsuffixed).toEqual([]);
    });

    it('gives every metric help text a stranger could act on', () => {
        /*
         * `help` is what Prometheus shows beside the series, and the only description someone
         * paging at 3am gets. An empty or one-word string is a metric nobody outside this repo can
         * interpret.
         */
        const unhelpful = declarations()
            .filter(({ help }) => help.trim().length < 15)
            .map(({ module, name, help }) => `${module}: ${name} — "${help}"`);

        expect(unhelpful).toEqual([]);
    });
});
