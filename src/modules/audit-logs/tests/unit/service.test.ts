/**
 * `src/modules/audit-logs/service.ts` — the persistence sink behind `@infrastructure/observability/audit`.
 *
 * The two functions in this module are deliberately asymmetric about failure, and that asymmetry
 * is the only thing worth testing here:
 *
 *   - `record` is **fail-open**. It is called while answering requests — including failing ones —
 *     so a Mongo hiccup must not turn a rejected login into a 500. It returns `void`, swallows
 *     every rejection into a log line, and must never produce an unhandled rejection. The
 *     compliance record is the audit *logger*, which has already written the entry by the time
 *     this runs; losing the queryable copy degrades a dashboard and nothing else.
 *   - `search` is **fail-closed**. It answers an admin's explicit request for the data, so a
 *     failed read is a failed request rather than something to hide.
 *
 * Swap either behaviour and the suite stays green everywhere else in the repo: nothing observes
 * `record`'s return value, and nothing else calls `search` directly. Hence these cases.
 *
 * The repository is mocked rather than driven against the in-memory Mongo, because what is under
 * test is the error contract, and a real repository cannot be made to fail on demand.
 */
import { auditLogService } from '@modules/audit-logs';
import { auditLogRepository } from '@modules/audit-logs/repository';
import { logger } from '@infrastructure/adapters/logger';
import { type AuditEntry } from '@infrastructure/observability/audit';
import type { AuditLogDocument } from '@modules/audit-logs/model';
import { auditSinkFailuresTotal } from '@modules/audit-logs/metrics';

/**
 * The counter's current value, read back through prom-client rather than from a local tally: the
 * point of the metric is that it reaches the registry the `/observability/metrics` scrape reads.
 */
const readCounter = async (): Promise<number> => {
    const { values } = await auditSinkFailuresTotal.get();
    return values[0]?.value ?? 0;
};

jest.mock('@modules/audit-logs/repository', () => ({
    auditLogRepository: {
        create: jest.fn(),
        search: jest.fn()
    }
}));

jest.mock('@infrastructure/adapters/logger', () => ({
    logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn() }
}));

const mockedRepository = auditLogRepository as jest.Mocked<typeof auditLogRepository>;
const mockedLogger = logger as jest.Mocked<typeof logger>;

const makeEntry = (overrides: Partial<AuditEntry> = {}): AuditEntry =>
    ({
        actor_user_id: 'user-1',
        actor_role: 'user',
        action: 'auth.login.succeeded',
        outcome: 'success',
        timestamp: new Date('2026-08-01T10:00:00.000Z'),
        level: 'info',
        ...overrides
    }) as AuditEntry;

describe('auditLogService.record', () => {
    it('hands the entry to the repository unchanged', () => {
        mockedRepository.create.mockResolvedValue({} as AuditLogDocument);
        const entry = makeEntry({ target_id: 'prod-9' });

        auditLogService.record(entry);

        expect(mockedRepository.create).toHaveBeenCalledWith(entry);
    });

    it('returns void rather than the write, so no caller can await it', () => {
        // The signature is the contract: a caller that could await this would be able to make a
        // request wait on the audit trail, which is the coupling `record` exists to avoid.
        mockedRepository.create.mockResolvedValue({} as AuditLogDocument);

        // eslint-disable-next-line @typescript-eslint/no-confusing-void-expression -- the assertion IS that record() returns undefined (fire-and-forget contract)
        expect(auditLogService.record(makeEntry())).toBeUndefined();
    });

    it('swallows a failed write into a warning instead of throwing', async () => {
        mockedRepository.create.mockRejectedValue(new Error('mongo is down'));

        expect(() => auditLogService.record(makeEntry())).not.toThrow();

        // The rejection is handled on a later tick, so the assertion has to wait for one.
        await Promise.resolve();
        await Promise.resolve();

        expect(mockedLogger.warn).toHaveBeenCalledWith(
            expect.objectContaining({
                message: 'audit entry not persisted',
                action: 'auth.login.succeeded',
                error: 'mongo is down'
            })
        );
    });

    it('counts the lost row so an empty dashboard is distinguishable from a quiet one', async () => {
        /* The gap the fail-open leaves behind: `GET /observability/audit` answering `{ items: [] }`
         * looks exactly like "nothing happened". The counter is the only thing that can tell those
         * two apart, and it must be incremented on the SAME path that swallows the error. */
        const before = await readCounter();
        mockedRepository.create.mockRejectedValue(new Error('mongo is down'));

        auditLogService.record(makeEntry());
        await Promise.resolve();
        await Promise.resolve();

        expect(await readCounter()).toBe(before + 1);
    });

    it('leaves the counter alone when the write succeeds', async () => {
        const before = await readCounter();
        mockedRepository.create.mockResolvedValue({} as AuditLogDocument);

        auditLogService.record(makeEntry());
        await Promise.resolve();
        await Promise.resolve();

        expect(await readCounter()).toBe(before);
    });

    it('produces no unhandled rejection when the write fails', async () => {
        // The `.catch()` is what makes the floating promise safe. Without it this is an
        // unhandled rejection, which — unlike the lost audit row — can take the process down.
        const unhandled = jest.fn();
        process.on('unhandledRejection', unhandled);

        mockedRepository.create.mockRejectedValue(new Error('mongo is down'));
        auditLogService.record(makeEntry());

        await new Promise((resolve) => setImmediate(resolve));
        process.off('unhandledRejection', unhandled);

        expect(unhandled).not.toHaveBeenCalled();
    });

    it('names the failing action in the warning, so a lost entry is identifiable', async () => {
        mockedRepository.create.mockRejectedValue(new Error('boom'));

        auditLogService.record(makeEntry({ action: 'auth.login.failed' }));

        // The rejection is handled a couple of microtasks later, same as the case above.
        await Promise.resolve();
        await Promise.resolve();

        expect(mockedLogger.warn).toHaveBeenCalledWith(
            expect.objectContaining({ action: 'auth.login.failed' })
        );
    });
});

describe('auditLogService.search', () => {
    it('passes the filters through untouched', async () => {
        const page = { items: [] as AuditLogDocument[], total: 0 };
        mockedRepository.search.mockResolvedValue(page);
        const filters = { actor: 'user-1', outcome: 'failure' as const, limit: 25 };

        await expect(auditLogService.search(filters)).resolves.toBe(page);
        expect(mockedRepository.search).toHaveBeenCalledWith(filters);
    });

    it('propagates a failed read rather than swallowing it', async () => {
        // The opposite of `record`: this one is answering an admin, so a failure is a failure.
        mockedRepository.search.mockRejectedValue(new Error('mongo is down'));

        await expect(auditLogService.search({})).rejects.toThrow('mongo is down');
        expect(mockedLogger.warn).not.toHaveBeenCalled();
    });
});
