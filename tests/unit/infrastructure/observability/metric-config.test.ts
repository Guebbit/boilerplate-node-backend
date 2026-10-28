/**
 * `src/infrastructure/observability/metric-config.ts`: the data of a metric becomes prom-client constructor options without
 * sharing its readonly arrays, and without leaking fields prom-client does not know.
 */

import {
    counterConfig,
    gaugeConfig,
    histogramConfig
} from '../../../../src/infrastructure/observability/metric-config';

describe('metric configuration helpers', () => {
    it('copies name, help and labels of a counter, and only those', () => {
        const data = {
            name: 'x_total',
            kind: 'counter',
            help: 'Things.',
            labelNames: ['a']
        } as const;

        expect(counterConfig(data)).toEqual({
            name: 'x_total',
            help: 'Things.',
            labelNames: ['a']
        });
    });

    it('leaves labelNames out of an unlabelled gauge', () => {
        expect(gaugeConfig({ name: 'x', help: 'Things.' })).toEqual({ name: 'x', help: 'Things.' });
    });

    it('hands a histogram its own mutable copy of the buckets', () => {
        const buckets = [1, 2] as const;
        const config = histogramConfig({ name: 'x_seconds', help: 'Things.', buckets });

        expect(config.buckets).toEqual([1, 2]);
        expect(config.buckets).not.toBe(buckets);
    });
});
