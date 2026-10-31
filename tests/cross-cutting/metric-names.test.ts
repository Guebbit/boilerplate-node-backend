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
 * Every fact below is read from `metrics.ts` and from the controller, the way a source-text
 * sweep does: the question is what the code SAYS, and a spec that imported the modules to
 * answer it would boot Mongoose and collect `products_low_stock_total`, which aggregates the
 * products collection. A name check does not get to open a database.
 *
 * Reading text is only sound while the text is the whole story, so one case below holds it there:
 * every declaration must register on the shared registry. A counter registered somewhere else
 * would be invisible here — and is not a thing this repo does.
 *
 * ── What is deliberately NOT asserted ─────────────────────────────────────────────────────────
 * One owner per name. `prom-client` throws `A metric with the name X has already been registered`
 * when a registry sees a duplicate, so a collision cannot reach a running process. A case here
 * would assert a property the library already guarantees.
 *
 * Style: snake_case, the `_total` suffix and a useful `help` string. A reviewer sees them on the
 * line that adds the metric, and a breach is cosmetic — the series still moves.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { MODULES_ROOT } from '@tests/paths';
import { infrastructureMetricData } from '@infrastructure/observability/metrics.generated';

const OVERVIEW_CONTROLLER = path.join(
    MODULES_ROOT,
    'observability/controllers/get-observability-metrics-overview.ts'
);

/**
 * Comments out, so a note between `new Counter({` and its `name:` does not hide a declaration.
 *
 * `account/metrics.ts` carries exactly that — a line explaining the naming convention, sitting
 * where the pattern below expects the first field — and the sweep read straight past the counter
 * the overview endpoint depends on most.
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
}

/** Every metric a module declares, by name. */
const declarations = (): Declaration[] => [
    ...metricFiles().flatMap(({ module, file }) =>
        [
            ...withoutComments(readFileSync(file, 'utf8')).matchAll(
                /new (?:Counter|Gauge|Histogram|Summary)\({\s*name: '([^']+)'/g
            )
        ].map(([, name]) => ({ module, name }))
    ),
    // Infrastructure metrics are data (`shared/rules/metrics.yaml`), shared by every module's
    // queries and requests, so no single module claims them; the overview still reads them by name.
    ...Object.values(infrastructureMetricData).map(({ name }) => ({
        module: 'infrastructure',
        name
    }))
];

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

/** The names the controller treats as optional, read from its `SHOP_METRIC_NAMES` literal. */
const shopMetricNames = (): string[] => {
    const block = /SHOP_METRIC_NAMES = \[([^\]]*)]/.exec(
        withoutComments(readFileSync(OVERVIEW_CONTROLLER, 'utf8'))
    );
    return [...(block?.[1] ?? '').matchAll(/'([^']+)'/g)].map(([, name]) => name);
};

describe('metric names', () => {
    it('finds the metrics and the readers it means to check', () => {
        // A canary: a renamed file or a changed call shape would otherwise make every case below a
        // sweep over an empty list, which passes and proves nothing.
        expect(metricFiles().length).toBeGreaterThanOrEqual(3);
        expect(shopMetricNames().length).toBeGreaterThan(0);
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
        // The controller's own `SHOP_METRIC_NAMES` are optional as a group: with no shop module
        // deployed none of them is declared, and the `business` block is left out. If ANY is
        // declared, all must be.
        const shopNames = shopMetricNames();
        const shopDeployed = shopNames.some((name) => declared.has(name));
        const unresolved = namesReadByLiteral()
            .filter((name) => !declared.has(name))
            .filter((name) => shopDeployed || !shopNames.includes(name))
            .map(
                (name) =>
                    `${name} — read by get-observability-metrics-overview.ts, declared by no module`
            );

        expect(unresolved).toEqual([]);
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
});
