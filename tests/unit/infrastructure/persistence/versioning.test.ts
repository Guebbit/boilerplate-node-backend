/**
 * `persistence/versioning` — the version of a row, and the precondition a write is checked against.
 * Hand-built documents: what is under test is the decision (accept, refuse, fence), not Mongoose.
 */
import {
    carryVersion,
    checkedDelete,
    etagOf,
    fencedSave,
    PreconditionFailedError,
    runWithPrecondition,
    versionOf,
    type Precondition
} from '@infrastructure/persistence/versioning';

const REVISION = 7;

/** A document as the service loaded it. */
const loaded = (id = 'row-1', editRevision = REVISION) => ({ _id: id, editRevision });

/** A document that has no counter — a row that predates it, or not a versioned resource. */
const unversioned = (id = 'row-1') => ({ _id: id });

/** A precondition on `row-1` naming these tags. */
const on = (...etags: string[]): Precondition => ({ id: 'row-1', etags });

describe('versionOf', () => {
    it('reads the edit counter off a row', () => {
        expect(versionOf({ editRevision: REVISION })).toBe(REVISION);
        expect(versionOf({ editRevision: 0 })).toBe(0);
    });

    it('ignores updatedAt: a timestamp is not a version', () => {
        expect(versionOf({ updatedAt: new Date('2026-09-30T10:00:00.000Z') })).toBeUndefined();
    });

    it.each([
        undefined,
        null,
        'x',
        {},
        { editRevision: '7' },
        { editRevision: 1.5 },
        { editRevision: NaN }
    ])('answers undefined for %p', (row) => {
        expect(versionOf(row)).toBeUndefined();
    });
});

describe('carryVersion', () => {
    it('lets a reshaped object answer the version of the row it was built from', () => {
        const shaped = carryVersion({ editRevision: REVISION }, { title: 'x' });

        expect(versionOf(shaped)).toBe(REVISION);
        // Beside the object, not in it: the wire shape is untouched.
        expect(shaped).toEqual({ title: 'x' });
    });

    it('carries through a second reshaping', () => {
        const first = carryVersion({ editRevision: REVISION }, { title: 'x' });

        expect(versionOf(carryVersion(first, { ...first, extra: true }))).toBe(REVISION);
    });

    it('leaves an object alone when the source has no version', () => {
        expect(versionOf(carryVersion({ title: 'unversioned' }, { title: 'x' }))).toBeUndefined();
    });
});

describe('etagOf', () => {
    it('quotes the counter, as a strong entity-tag is written', () => {
        expect(etagOf(REVISION)).toBe('"7"');
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

    it('lets a matching tag through and fences the write on the loaded counter', async () => {
        const document = loaded();
        // The fence is read while the write runs: it is gone once the write has settled.
        const write = jest.fn(() => Promise.resolve(Reflect.get(document, '$where')));

        const fence = await runWithPrecondition(on(etagOf(REVISION)), () =>
            fencedSave(document, write)
        );

        expect(write).toHaveBeenCalledTimes(1);
        expect(fence).toEqual({ editRevision: REVISION });
    });

    it('fences a row with no counter on null, which Mongo matches against a missing field', async () => {
        const document = unversioned();

        const fence = await runWithPrecondition({ id: 'row-1', etags: 'any' }, () =>
            fencedSave(document, () => Promise.resolve(Reflect.get(document, '$where')))
        );

        expect(fence).toEqual({ editRevision: null });
    });

    it.each([
        ['succeeded', () => Promise.resolve('saved')],
        ['failed', () => Promise.reject(new Error('disk'))]
    ])('takes the fence off the document once the write has %s', async (_outcome, write) => {
        const document = loaded();

        await runWithPrecondition(on(etagOf(REVISION)), () => fencedSave(document, write)).catch(
            () => undefined
        );

        expect(document).not.toHaveProperty('$where');
    });

    it('accepts any of several tags', async () => {
        const write = jest.fn().mockResolvedValue('saved');

        await runWithPrecondition(on('"1"', etagOf(REVISION)), () => fencedSave(loaded(), write));

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
            runWithPrecondition(on(`W/${etagOf(REVISION)}`), () => fencedSave(loaded(), jest.fn()))
        ).rejects.toBeInstanceOf(PreconditionFailedError);
    });

    it('refuses a row that carries no version, unless the header was `*`', async () => {
        await expect(
            runWithPrecondition(on('"1"'), () => fencedSave(unversioned(), jest.fn()))
        ).rejects.toBeInstanceOf(PreconditionFailedError);

        const write = jest.fn().mockResolvedValue('saved');
        await runWithPrecondition({ id: 'row-1', etags: 'any' }, () =>
            fencedSave(unversioned(), write)
        );
        expect(write).toHaveBeenCalledTimes(1);
    });

    it.each(['DocumentNotFoundError', 'VersionError'])(
        "turns Mongoose's %s — the row moved under the write — into a precondition failure",
        async (name) => {
            const lost = Object.assign(new Error('lost the race'), { name });

            await expect(
                runWithPrecondition(on(etagOf(REVISION)), () =>
                    fencedSave(loaded(), () => Promise.reject(lost))
                )
            ).rejects.toBeInstanceOf(PreconditionFailedError);
        }
    );

    it('lets any other write error through as it was', async () => {
        const broken = new Error('disk');

        await expect(
            runWithPrecondition(on(etagOf(REVISION)), () =>
                fencedSave(loaded(), () => Promise.reject(broken))
            )
        ).rejects.toBe(broken);
    });

    it('checks only the first save of the row: a later one has a version the caller never saw', async () => {
        const write = jest.fn().mockResolvedValue('saved');

        await runWithPrecondition(on(etagOf(REVISION)), async () => {
            await fencedSave(loaded(), write);
            await fencedSave(loaded('row-1', REVISION + 1), write);
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

        await runWithPrecondition(on(etagOf(REVISION)), () => checkedDelete(loaded(), write));
        await checkedDelete(loaded(), write);

        expect(write).toHaveBeenCalledTimes(2);
    });

    it('fences the delete on the loaded counter, and refuses when the fence matched nothing', async () => {
        const document = loaded();
        let fence: unknown;
        const write = jest.fn(() => {
            fence = Reflect.get(document, '$where');
            return Promise.resolve({ deletedCount: 0 });
        });

        await expect(
            runWithPrecondition(on(etagOf(REVISION)), () => checkedDelete(document, write))
        ).rejects.toBeInstanceOf(PreconditionFailedError);

        expect(fence).toEqual({ editRevision: REVISION });
        expect(document).not.toHaveProperty('$where');
    });

    it('does not read a zero count as a conflict when no precondition was sent', async () => {
        const write = jest.fn().mockResolvedValue({ deletedCount: 0 });

        await expect(checkedDelete(loaded(), write)).resolves.toBeUndefined();
    });
});
