/**
 * @module
 * Turns a metric's data (`shared/rules/metrics.yaml`, generated into `src/infrastructure/observability/metrics.generated.ts`) into
 * the options a prom-client constructor takes. The data is `as const`, so its arrays are
 * readonly; prom-client's `buckets` is a mutable `number[]`, hence the copy.
 *
 * Registering stays at the call site (`registers`, `collect`): this file never touches a registry.
 *
 * See: docs/theory/shared-rules.md
 */

import type { CounterConfiguration, GaugeConfiguration, HistogramConfiguration } from 'prom-client';

/** What every metric has. */
interface MetricData<TLabel extends string> {
    readonly name: string;
    readonly help: string;
    readonly labelNames?: readonly TLabel[];
}

/** Name, help and (when present) labels: the part all three kinds share. */
const base = <TLabel extends string>(data: MetricData<TLabel>) => ({
    name: data.name,
    help: data.help,
    ...(data.labelNames && { labelNames: data.labelNames })
});

/**
 * Constructor options of a counter.
 *
 * @param data - the metric's entry in `infrastructureMetricData`
 * @returns name, help and labels, ready to spread into `new Counter({ ... })`
 */
export const counterConfig = <TLabel extends string = never>(
    data: MetricData<TLabel>
): CounterConfiguration<TLabel> => base(data);

/**
 * Constructor options of a gauge.
 *
 * @param data - the metric's entry in `infrastructureMetricData`
 * @returns name, help and labels, ready to spread into `new Gauge({ ... })`
 */
export const gaugeConfig = <TLabel extends string = never>(
    data: MetricData<TLabel>
): GaugeConfiguration<TLabel> => base(data);

/**
 * Constructor options of a histogram.
 *
 * @param data - the metric's entry in `infrastructureMetricData`
 * @returns name, help, labels and a mutable copy of the buckets
 */
export const histogramConfig = <TLabel extends string = never>(
    data: MetricData<TLabel> & { readonly buckets: readonly number[] }
): HistogramConfiguration<TLabel> => ({ ...base(data), buckets: [...data.buckets] });
