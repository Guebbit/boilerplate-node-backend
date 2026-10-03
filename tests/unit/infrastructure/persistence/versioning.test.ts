/**
 * `persistence/versioning` — the version of a row, and the precondition a write is checked against.
 * Hand-built documents: what is under test is the decision (accept, refuse, fence), not Mongoose.
 */
import {
    checkedDelete,
    etagOf,
    fencedSave,
    PreconditionFailedError,
    runWithPrecondition,
    versionOf,
    type Precondition
} from '@infrastructure/persistence/versioning';

const STAMP = new Date('2026-09-30T10:00:00.000Z');

/** A document as the service loaded it. */
const loaded = (id = 'row-1', updatedAt: Date | undefined = STAMP) => ({ _id: id, updatedAt });

/** A precondition on `row-1` naming these tags. */
const on = (...etags: string[]): Precondition => ({ id: 'row-1', etags });

describe('versionOf', () => {
    it('reads a Date, and an ISO string, to the same epoch', () => {
        expect(versionOf({ updatedAt: STAMP })).toBe(STAMP.getTime());
        expect(versionOf({ updatedAt: STAMP.toISOString() })).toBe(STAMP.getTime());
    });

    it.each([undefined, null, 'x', {}, { updatedAt: 'not a date' }, { updatedAt: 5 }])(
        'answers undefined for %p',
        (row) => {
            expect(versionOf(row)).toBeUndefined();
        }
    );
});

describe('etagOf', () => {
    it('quotes the epoch, as a strong entity-tag is written', () => {
        expect(etagOf(STAMP.getTime())).toBe(`"${STAMP.getTime().toString()}"`);
    });
});

describe('fencedSave', () => {
    it('runs the write untouched when no precondition is open', async () => {
        const write = jest.fn().mockResolvedValue('saved');

        await expect(fencedSave(loaded(), write)).resolves.toBe('saved');

        expect(write).toHaveBeenCalledTimes(1);
    });

    it('runs the write untouched when the precondition names another row', async () => {
        const write = jest.fn().mockResolvedValue('saved');

        await runWithPrecondition({ id: 'other', etags: ['"nope"'] }, () =>
            fencedSave(loaded(), write)
        );

        expect(write).toHaveBeenCalledTimes(1);
    });

    it('lets a matching tag through and fences the write on the loaded updatedAt', async () => {
        const document = loaded();
        const write = jest.fn().mockResolvedValue('saved');

        await runWithPrecondition(on(etagOf(STAMP.getTime())), () => fencedSave(document, write));

        expect(write).toHaveBeenCalledTimes(1);
        expect(document).toHaveProperty('$where', { updatedAt: STAMP });
    });

    it('accepts any of several tags', async () => {
        const write = jest.fn().mockResolvedValue('saved');

        await runWithPrecondition(on('"1"', etagOf(STAMP.getTime())), () =>
            fencedSave(loaded(), write)
        );

        expect(write).toHaveBeenCalledTimes(1);
    });

    it('refuses a stale tag without writing', async () => {
        const write = jest.fn();

        await expect(
            runWithPrecondition(on('"1"'), () => fencedSave(loaded(), write))
        ).rejects.toBeInstanceOf(PreconditionFailedError);

        expect(write).not.toHaveBeenCalled();
    });

    it('refuses a weak tag: If-Match compares strongly', async () => {
        await expect(
            runWithPrecondition(on(`W/${etagOf(STAMP.getTime())}`), () =>
                fencedSave(loaded(), jest.fn())
            )
        ).rejects.toBeInstanceOf(PreconditionFailedError);
    });

    it('refuses a row that carries no version, unless the header was `*`', async () => {
        await expect(
            runWithPrecondition(on('"1"'), () => fencedSave(loaded('row-1', undefined), jest.fn()))
        ).rejects.toBeInstanceOf(PreconditionFailedError);

        const write = jest.fn().mockResolvedValue('saved');
        await runWithPrecondition({ id: 'row-1', etags: 'any' }, () =>
            fencedSave(loaded('row-1', undefined), write)
        );
        expect(write).toHaveBeenCalledTimes(1);
    });

    it.each(['DocumentNotFoundError', 'VersionError'])(
        "turns Mongoose's %s — the row moved under the write — into a precondition failure",
        async (name) => {
            const lost = Object.assign(new Error('lost the race'), { name });

            await expect(
                runWithPrecondition(on(etagOf(STAMP.getTime())), () =>
                    fencedSave(loaded(), () => Promise.reject(lost))
                )
            ).rejects.toBeInstanceOf(PreconditionFailedError);
        }
    );

    it('lets any other write error through as it was', async () => {
        const broken = new Error('disk');

        await expect(
            runWithPrecondition(on(etagOf(STAMP.getTime())), () =>
                fencedSave(loaded(), () => Promise.reject(broken))
            )
        ).rejects.toBe(broken);
    });

    it('checks only the first save of the row: a later one has a version the caller never saw', async () => {
        const write = jest.fn().mockResolvedValue('saved');

        await runWithPrecondition(on(etagOf(STAMP.getTime())), async () => {
            await fencedSave(loaded(), write);
            await fencedSave(loaded('row-1', new Date(STAMP.getTime() + 5)), write);
        });

        expect(write).toHaveBeenCalledTimes(2);
    });
});

describe('checkedDelete', () => {
    it('refuses a stale tag without deleting', async () => {
        const write = jest.fn();

        await expect(
            runWithPrecondition(on('"1"'), () => checkedDelete(loaded(), write))
        ).rejects.toBeInstanceOf(PreconditionFailedError);

        expect(write).not.toHaveBeenCalled();
    });

    it('deletes on a matching tag, and with no precondition at all', async () => {
        const write = jest.fn().mockResolvedValue({ deletedCount: 1 });

        await runWithPrecondition(on(etagOf(STAMP.getTime())), () =>
            checkedDelete(loaded(), write)
        );
        await checkedDelete(loaded(), write);

        expect(write).toHaveBeenCalledTimes(2);
    });

    it('fences the delete on the loaded version, and refuses when the fence matched nothing', async () => {
        const document = loaded();
        const write = jest.fn().mockResolvedValue({ deletedCount: 0 });

        await expect(
            runWithPrecondition(on(etagOf(STAMP.getTime())), () => checkedDelete(document, write))
        ).rejects.toBeInstanceOf(PreconditionFailedError);

        expect(document).toMatchObject({ $where: { updatedAt: STAMP } });
    });

    it('does not read a zero count as a conflict when no precondition was sent', async () => {
        const write = jest.fn().mockResolvedValue({ deletedCount: 0 });

        await expect(checkedDelete(loaded(), write)).resolves.toBeUndefined();
    });
});
