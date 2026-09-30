import { outboxBackoffMs } from '@kernel/outbox';

/** The outbox's retry schedule: doubling from 5 seconds, capped at an hour. */
describe('outboxBackoffMs', () => {
    it.each([
        [1, 5000],
        [2, 10_000],
        [3, 20_000],
        [8, 640_000],
        [10, 2_560_000]
    ])('waits %i failure(s) -> %i ms', (failures, expected) => {
        expect(outboxBackoffMs(failures)).toBe(expected);
    });

    it('never waits longer than an hour', () => {
        expect(outboxBackoffMs(11)).toBe(3_600_000);
        expect(outboxBackoffMs(500)).toBe(3_600_000);
    });
});
