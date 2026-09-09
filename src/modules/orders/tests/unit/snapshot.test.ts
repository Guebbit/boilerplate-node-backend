/**
 * `resolveSnapshotProducts` — the buyer-language resolution an order line snapshot freezes before
 * it's embedded (`../../services/snapshot.ts`). A unit test: a fake `TranslationPort` stands in
 * for `@modules/locales`, so this proves the fallback-chain wiring, the explicit-locale binding,
 * and the `_id`-preservation contract without a database.
 */

import { Types } from 'mongoose';
import { registerTranslationPort, type TranslationPort } from '@infrastructure/i18n';
import { resolveSnapshotProducts } from '../../services/snapshot';

/** A port double whose methods are jest mocks by default, overridable per test. */
const fakePort = (overrides: Partial<TranslationPort> = {}): TranslationPort => ({
    resolve: jest.fn().mockResolvedValue(new Map()),
    removeAll: jest.fn().mockResolvedValue(0),
    search: jest.fn().mockResolvedValue([]),
    plan: jest.fn().mockResolvedValue({ fallbackLocale: 'en', planned: [] }),
    write: jest.fn().mockResolvedValue(undefined),
    readAll: jest.fn().mockResolvedValue(new Map()),
    ...overrides
});

afterEach(() => registerTranslationPort(undefined));

describe('resolveSnapshotProducts', () => {
    it('overlays the resolved fields onto the product, keyed by its own id', async () => {
        const id = new Types.ObjectId();
        registerTranslationPort(
            fakePort({
                resolve: jest.fn().mockResolvedValue(new Map([[String(id), { title: 'Cuccia' }]]))
            })
        );

        const [result] = await resolveSnapshotProducts('it', [
            { _id: id, title: 'Dog Bed', price: 10 }
        ]);

        expect(result.title).toBe('Cuccia');
        expect(result.price).toBe(10);
    });

    it('asks the port for the whole fallback chain — exact tag, base language, then the deployment fallback', async () => {
        const id = new Types.ObjectId();
        const resolve = jest.fn().mockResolvedValue(new Map());
        registerTranslationPort(fakePort({ resolve }));

        await resolveSnapshotProducts('it-CH', [{ _id: id, title: 'Dog Bed', price: 10 }]);

        expect(resolve).toHaveBeenCalledWith('product', [String(id)], ['it-CH', 'it', 'en']);
    });

    it('leaves a product unchanged (but still returned) when it has no translation row', async () => {
        const id = new Types.ObjectId();
        registerTranslationPort(fakePort());

        const [result] = await resolveSnapshotProducts('it', [
            { _id: id, title: 'Dog Bed', price: 10 }
        ]);

        expect(result.title).toBe('Dog Bed');
    });

    it("binds the locale it was GIVEN, not whatever is ambient — order creation resolves the buyer's locale, which can differ from the request's own", async () => {
        const id = new Types.ObjectId();
        const resolve = jest.fn().mockResolvedValue(new Map());
        registerTranslationPort(fakePort({ resolve }));

        const { runWithLocale } = await import('@infrastructure/i18n');
        await runWithLocale('en', () =>
            resolveSnapshotProducts('it', [{ _id: id, title: 'Dog Bed', price: 10 }])
        );

        // Candidates are built from the explicit 'it' argument, never from the ambient 'en'.
        expect(resolve).toHaveBeenCalledWith('product', [String(id)], ['it', 'en']);
    });

    it("preserves the product's own ObjectId `_id` rather than minting a fresh one", async () => {
        const id = new Types.ObjectId();
        registerTranslationPort(fakePort());

        const [result] = await resolveSnapshotProducts('it', [
            { _id: id, title: 'Dog Bed', price: 10 }
        ]);

        expect(result._id).toBe(id);
        expect(result._id).toBeInstanceOf(Types.ObjectId);
    });

    it('calls `.toObject()` on a hydrated document rather than spreading its Mongoose machinery raw', async () => {
        const id = new Types.ObjectId();
        registerTranslationPort(fakePort());
        const toObject = jest.fn().mockReturnValue({ _id: id, title: 'Dog Bed', price: 10 });

        const [result] = await resolveSnapshotProducts('it', [
            { _id: id, title: 'ignored-if-toObject-is-called', price: 0, toObject }
        ]);

        expect(toObject).toHaveBeenCalled();
        expect(result.title).toBe('Dog Bed');
    });

    it('leaves an already-plain record (a lean read, with no `.toObject`) alone', async () => {
        // `productRepository.findByIdRaw` returns exactly this shape: lean, plain, no document
        // methods — the case `.toObject()` would throw on if called unconditionally.
        const id = new Types.ObjectId();
        registerTranslationPort(fakePort());

        const [result] = await resolveSnapshotProducts('it', [
            { _id: id, title: 'Dog Bed', price: 10 }
        ]);

        expect(result.title).toBe('Dog Bed');
        expect(result._id).toBe(id);
    });
});
