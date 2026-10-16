/**
 * @module
 * The reservation sweep's bound: it drains full batches, but stops after 50 of them and says so,
 * so a pathological backlog ends a run instead of outliving the job's lease. The repository and the
 * release are replaced, since the point is the loop and not the holds.
 */

import { logger } from '@infrastructure/adapters/logger';

jest.mock('@kernel/outbox', () => ({
    __esModule: true,
    ...jest.requireActual('@kernel/outbox'),
    // No hold is ever released: the batch is read, each hold is skipped, and the loop goes on.
    announceInTransaction: jest.fn().mockResolvedValue(null)
}));

import { reservationRepository } from '../../repository';
import { runReservationSweep } from '../../services';

/** A full batch: 200 holds past their window, none of which a release finds. */
const fullBatch = Array.from({ length: 200 }, (_, index) => ({
    orderId: index.toString(16).padStart(24, 'a')
}));

afterEach(() => jest.restoreAllMocks());

describe('runReservationSweep — the cap', () => {
    it('reads 50 full batches at most, and warns once that more is waiting', async () => {
        const find = jest
            .spyOn(reservationRepository, 'findExpired')
            .mockResolvedValue(fullBatch as never);
        const warn = jest.spyOn(logger, 'warn').mockImplementation(() => logger);

        await runReservationSweep();

        expect(find).toHaveBeenCalledTimes(50);
        expect(warn).toHaveBeenCalledTimes(1);
    });

    it('stops at the first batch that comes back short, and does not warn', async () => {
        const find = jest
            .spyOn(reservationRepository, 'findExpired')
            .mockResolvedValueOnce(fullBatch as never)
            .mockResolvedValueOnce(fullBatch.slice(0, 3) as never);
        const warn = jest.spyOn(logger, 'warn').mockImplementation(() => logger);

        await runReservationSweep();

        expect(find).toHaveBeenCalledTimes(2);
        expect(warn).not.toHaveBeenCalled();
    });
});
