/**
 * `createBaseRepository(...).buildWhere` — the filter-bag-to-Mongo-query compiler every module's
 * `search()` goes through.
 *
 * Pure and DB-free by construction: `buildWhere` never touches the Mongoose model, only the
 * `SearchSpec` and the caller's filter bag, so the model passed to `createBaseRepository` here is
 * a stub that is never actually called. What is under test is the id-coercion, empty/blank
 * handling, and the per-kind compilation rules documented on `SearchSpec` and `buildWhere` in
 * `src/infrastructure/persistence/base-repository.ts`.
 */
import { Types } from 'mongoose';
import type { Model, Document } from 'mongoose';
import { createBaseRepository, type SearchSpec } from '@infrastructure/persistence/base-repository';

interface FixtureDocument extends Document {
    name: string;
}

const stubModel = {} as Model<FixtureDocument>;
const identityTransform = (item: Record<string, unknown>): Record<string, unknown> => item;

const buildWhereFor = (searchable: SearchSpec) =>
    createBaseRepository<FixtureDocument>(stubModel, {
        transform: identityTransform,
        searchable
    }).buildWhere;

/** A repository with no search spec — `toggleDeleted` reads none. */
const plainRepository = () =>
    createBaseRepository<FixtureDocument>(stubModel, { transform: identityTransform });

/** A document that records its own `save()` rather than reaching a collection. */
const documentWith = (deletedAt: Date | undefined) => {
    // Annotated rather than inferred: `save` resolves the object it lives on, and TypeScript
    // cannot infer a type that references itself (TS7024).
    const document: { deletedAt: Date | undefined; save: jest.Mock } = {
        deletedAt,
        save: jest.fn()
    };
    document.save.mockResolvedValue(document);
    return document;
};

describe('buildWhere — objectIds', () => {
    const buildWhere = buildWhereFor({ objectIds: { id: '_id', userId: 'userId' } });

    it('coerces a present value to an ObjectId at the declared path', () => {
        const id = '65de646a44f861fd83c13f13';
        const where = buildWhere({ id });

        expect(where._id).toBeInstanceOf(Types.ObjectId);
        expect((where._id as Types.ObjectId).toString()).toBe(id);
    });

    it('trims before coercing', () => {
        const where = buildWhere({ id: '  65de646a44f861fd83c13f13  ' });

        expect((where._id as Types.ObjectId).toString()).toBe('65de646a44f861fd83c13f13');
    });

    it('omits the path entirely when the filter is absent, empty, or blank', () => {
        expect(buildWhere({})).toEqual({});
        expect(buildWhere({ id: '' })).toEqual({});
        expect(buildWhere({ id: '   ' })).toEqual({});
    });

    it('throws on a malformed id — a raw string must never reach Mongo unmatched', () => {
        expect(() => buildWhere({ id: 'not-an-object-id' })).toThrow();
    });

    it('coerces every declared key independently', () => {
        const id = '65de646a44f861fd83c13f13';
        const userId = '65de646a44f861fd83c13f14';
        const where = buildWhere({ id, userId });

        expect((where._id as Types.ObjectId).toString()).toBe(id);
        expect((where.userId as Types.ObjectId).toString()).toBe(userId);
    });
});

describe('buildWhere — exact', () => {
    const buildWhere = buildWhereFor({ exact: { status: 'status' } });

    it('matches the trimmed value verbatim', () => {
        expect(buildWhere({ status: '  pending  ' })).toEqual({ status: 'pending' });
    });

    it('omits the path when absent or blank', () => {
        expect(buildWhere({})).toEqual({});
        expect(buildWhere({ status: '   ' })).toEqual({});
    });
});

describe('buildWhere — booleans', () => {
    const buildWhere = buildWhereFor({ booleans: { active: 'active' } });

    it('matches an explicit false — false is a filter, not an absent one', () => {
        expect(buildWhere({ active: false })).toEqual({ active: false });
    });

    it('matches an explicit true', () => {
        expect(buildWhere({ active: true })).toEqual({ active: true });
    });

    it('omits the path for anything that is not literally a boolean', () => {
        // The type check is deliberately stricter than `isPresent`: a pre-decoded value is
        // required, so a raw query-string 'false' must not be treated as a filter here.
        expect(buildWhere({ active: 'false' })).toEqual({});
        expect(buildWhere({})).toEqual({});
    });
});

describe('buildWhere — regex', () => {
    const buildWhere = buildWhereFor({ regex: { email: 'email' } });

    it('builds a case-insensitive, escaped pattern', () => {
        const where = buildWhere({ email: 'a.b+c@x.com' });

        expect(where.email).toEqual({
            $regex: String.raw`a\.b\+c@x\.com`,
            $options: 'i'
        });
    });

    it('omits the path when nothing searchable survives cleaning', () => {
        expect(buildWhere({ email: '   ' })).toEqual({});
        expect(buildWhere({})).toEqual({});
    });
});

describe('buildWhere — arrayRegex', () => {
    const buildWhere = buildWhereFor({ arrayRegex: { tags: 'tags' } });

    it('wraps the escaped pattern in $elemMatch', () => {
        const where = buildWhere({ tags: 'sale' });

        expect(where.tags).toEqual({
            $elemMatch: { $regex: 'sale', $options: 'i' }
        });
    });

    it('omits the path when blank', () => {
        expect(buildWhere({ tags: '' })).toEqual({});
    });
});

describe('buildWhere — text', () => {
    const buildWhere = buildWhereFor({ text: ['name', 'sku'] });

    it('builds an $or across every declared field', () => {
        const where = buildWhere({ text: 'boots' });

        expect(where.$or).toEqual([
            { name: { $regex: 'boots', $options: 'i' } },
            { sku: { $regex: 'boots', $options: 'i' } }
        ]);
    });

    it('omits $or when the text filter is blank', () => {
        expect(buildWhere({ text: '' })).toEqual({});
    });
});

describe('buildWhere — text with no declared fields', () => {
    it('never adds $or, even when the caller sends text — an empty spec searches nothing', () => {
        const buildWhere = buildWhereFor({ text: [] });

        expect(buildWhere({ text: 'boots' })).toEqual({});
    });
});

describe('buildWhere — ranges', () => {
    const buildWhere = buildWhereFor({
        ranges: { price: { min: 'minPrice', max: 'maxPrice' } }
    });

    it('applies both bounds when both are present', () => {
        expect(buildWhere({ minPrice: '10', maxPrice: '20' })).toEqual({
            price: { $gte: 10, $lte: 20 }
        });
    });

    it('applies a one-sided lower bound', () => {
        expect(buildWhere({ minPrice: '10' })).toEqual({ price: { $gte: 10 } });
    });

    it('applies a one-sided upper bound', () => {
        expect(buildWhere({ maxPrice: '20' })).toEqual({ price: { $lte: 20 } });
    });

    it('drops a non-numeric bound instead of sending NaN to Mongo', () => {
        expect(buildWhere({ minPrice: 'not-a-number' })).toEqual({});
    });

    it('omits the path entirely when neither bound is present', () => {
        expect(buildWhere({})).toEqual({});
    });
});

describe('buildWhere — composing multiple kinds at once', () => {
    it('sets every matching path independently, none clobbering another', () => {
        const buildWhere = buildWhereFor({
            exact: { status: 'status' },
            booleans: { active: 'active' },
            ranges: { price: { min: 'minPrice', max: 'maxPrice' } }
        });

        expect(buildWhere({ status: 'live', active: false, minPrice: '5' })).toEqual({
            status: 'live',
            active: false,
            price: { $gte: 5 }
        });
    });
});

/**
 * `toggleDeleted` — the soft-delete flip, and the one member of this factory whose contract is a
 * RULE rather than a query.
 *
 * DB-free like `buildWhere` above, and for a related reason: the only Mongoose call in the path is
 * `document.save()`, which the fixture below supplies. What is under test is the flip itself.
 *
 * The restore case is the one that matters. Written as `deletedAt = new Date()` this function
 * still passes every "soft-deletes a document" test in the repo while silently breaking the
 * `hardDelete: false` half of `hardDeleteSchema` — the three service-level restore tests
 * (`products`/`users`/`orders` integration) would catch it, but only at the layer above and only
 * with a database running. This is the assertion at the level the rule actually lives.
 */
describe('toggleDeleted', () => {
    it('stamps deletedAt on a live document', async () => {
        const document = documentWith(undefined);

        await plainRepository().toggleDeleted(document as never);

        expect(document.deletedAt).toBeInstanceOf(Date);
    });

    it('UNSETS deletedAt on an already soft-deleted document — the flip is the restore', async () => {
        const document = documentWith(new Date('2026-01-01T00:00:00.000Z'));

        await plainRepository().toggleDeleted(document as never);

        // `undefined`, not null: `visibleScope` tests the field with `$exists: false`.
        expect(document.deletedAt).toBeUndefined();
    });

    it('persists the flip instead of only mutating in memory', async () => {
        const document = documentWith(undefined);

        await plainRepository().toggleDeleted(document as never);

        expect(document.save).toHaveBeenCalledTimes(1);
    });

    it('resolves the saved document, so a caller can build its envelope from the result', async () => {
        const document = documentWith(undefined);

        await expect(plainRepository().toggleDeleted(document as never)).resolves.toBe(document);
    });
});
