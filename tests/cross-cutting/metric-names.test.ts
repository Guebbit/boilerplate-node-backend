/**
 * A metric name is an identifier three places agree on, and only one is type-checked.
 *
 * Declared:   in a module's `metrics.ts`, registered on the shared registry.
 * Named by:   `observability/controllers/get-observability-metrics-overview.ts`, which reads
 *             seven by STRING (it may not import a domain), and Prometheus, Grafana and every
 *             alert, which live outside this repo and cannot be refactored with it.
 * Failure:    a rename compiles, lints and passes every unit test. `getSingleMetric` answers
 *             `undefined`, the overview reports the counter as absent (a shape it handles on
 *             purpose, for a DELETED module), and the dashboard goes flat rather than red.
 * Source text: every fact is read from `metrics.ts` and the controller; importing the modules
 *             would boot Mongoose and collect `products_low_stock_total`, which aggregates a
 *             collection. One case keeps reading text sound: every declaration must register on
 *             the shared registry.
 * Not asserted: one owner per name (`prom-client` throws on a duplicate, so a collision cannot
 *             reach a running process), and style (snake_case, `_total`, a `help` string): a
 *             reviewer sees those on the line that adds the metric, and a breach is cosmetic.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { MODULES_ROOT } from '@tests/paths';
import { infrastructureMetricData } from '@infrastructure/observability/metrics.generated';

/** The overview controller file, read as text. */
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
    source.replaceAll(/\/\*[\s\S]*?\*\//g, '').replaceAll(/^[^\S\n]*\/\/.*$/gm, '');

/** Every `src/modules/<name>/metrics.ts`, discovered rather than listed. */
const metricFiles = (): { module: string; file: string }[] =>
    readdirSync(MODULES_ROOT)
        .map((module) => ({ module, file: path.join(MODULES_ROOT, module, 'metrics.ts') }))
        .filter(({ file }) => existsSync(file));

/** A metric declaration found in the source: its name and where. */
interface Declaration {
    /** The module whose source declares the metric. */
    module: string;
    /** The metric's name. */
    name: string;
}

/** Every metric a module declares, by name. */
const declarations = (): Declaration[] => [
    ...metricFiles().flatMap(({ module, file }) =>
        [
            ...withoutComments(readFileSync(file, 'utf8')).matchAll(
                /new (?:Counter|Gauge|Histogram|Summary)\(\{\s*name: '([^']+)'/g
            )
        ].map(([, name]) => ({ module, name }))
    ),
    /**
     * Infrastructure metrics are data (`shared/rules/metrics.yaml`), shared by every module's
     * queries and requests, so no single module claims them; the overview still reads them by name.
     */
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
    const block = /SHOP_METRIC_NAMES = \[([^\]]*)\]/.exec(
        withoutComments(readFileSync(OVERVIEW_CONTROLLER, 'utf8'))
    );
    return [...(block?.[1] ?? '').matchAll(/'([^']+)'/g)].map(([, name]) => name);
};

describe('metric names', () => {
    it('finds the metrics and the readers it means to check', () => {
        /**
         * A canary: a renamed file or a changed call shape would otherwise make every case below a
         * sweep over an empty list, which passes and proves nothing.
         */
        expect(metricFiles().length).toBeGreaterThanOrEqual(3);
        expect(shopMetricNames().length).toBeGreaterThan(0);
        expect(declarations().length).toBeGreaterThanOrEqual(12);
        expect(namesReadByLiteral().length).toBeGreaterThanOrEqual(5);
    });

    it('resolves every name the overview endpoint reads by string', () => {
        /**
         * The live one. `getSingleMetric` answering `undefined` is indistinguishable from a module
         * that was removed, so the endpoint cannot tell a rename from a deletion — and neither can
         * anyone reading its output.
         */
        const declared = new Set(declarations().map(({ name }) => name));
        /**
         * The controller's own `SHOP_METRIC_NAMES` are optional as a group: with no shop module
         * deployed none of them is declared, and the `business` block is left out. If ANY is
         * declared, all must be.
         */
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
        /**
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
                const registered = [...source.matchAll(/registers: \[metricsRegistry\]/g)];
                return declared.length === registered.length
                    ? []
                    : [
                          `${module}: ${declared.length} metric(s) declared, ${registered.length} on metricsRegistry`
                      ];
            });

        expect(unregistered).toEqual([]);
    });
});
