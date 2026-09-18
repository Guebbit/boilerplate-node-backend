import { percentileFromHistogramBuckets } from '../../metrics';

describe('percentileFromHistogramBuckets', () => {
    it('returns 0 for empty histograms', () => {
        expect(percentileFromHistogramBuckets([], 0, 0.95)).toBe(0);
    });

    it('picks first bucket whose cumulative count reaches percentile threshold', () => {
        const buckets = [
            { upperBound: 10, cumulativeCount: 2 },
            { upperBound: 25, cumulativeCount: 5 },
            { upperBound: 50, cumulativeCount: 9 }
        ];

        expect(percentileFromHistogramBuckets(buckets, 10, 0.5)).toBe(25);
        expect(percentileFromHistogramBuckets(buckets, 10, 0.95)).toBe(50);
    });
});
