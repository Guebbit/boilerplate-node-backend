/**
 * @module
 * Money at rest: a stored amount is a `Decimal128`, and everything above the persistence layer
 * still sees a plain decimal `number` (the wire format does not change).
 *
 * ```
 * write  number → cast by Mongoose → Decimal128          (`moneyPath`)
 * read   hydrated   → the path getter                    (`moneyPath`)
 *        lean       → the post-find hook                 (`moneyPlugin`)
 *        toJSON     → the serializer's transform         (`reviveDecimals`)
 * ```
 *
 * Why Decimal128: MongoDB calls `double` unsuitable for money. Stored exactly, a database `$sum`
 * needs no conversion and is exact. The arithmetic in code is unchanged: integer minor units in
 * `@domain-primitives/money`.
 * https://www.mongodb.com/docs/manual/tutorial/model-monetary-data/
 */

import { Schema, type Query } from 'mongoose';

/**
 * Whether a value is a BSON `Decimal128`. Read by its `_bsontype` tag rather than `instanceof`,
 * so it does not depend on which copy of the BSON library built the value.
 */
const isDecimal128 = (value: unknown): value is { toString: () => string } =>
    typeof value === 'object' && value !== null && Reflect.get(value, '_bsontype') === 'Decimal128';

/**
 * A plain object or an array: the two shapes a stored document nests, and the only ones worth
 * walking. An ObjectId, a Date or a Buffer is none of them.
 */
const isWalkable = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' &&
    value !== null &&
    (Array.isArray(value) || Object.prototype.toString.call(value) === '[object Object]');

/**
 * Turn a stored `Decimal128` into the decimal `number` the contract publishes.
 *
 * The `number` is the nearest double to the stored decimal. Writes refuse extra places
 * (`fitsCurrency`), so an amount that was stored is one a double holds to the minor unit.
 *
 * @param value - what the database held
 * @returns the number for a `Decimal128` or a number; `undefined` for an absent field
 */
export const decimalToNumber = (value: unknown): number | undefined => {
    if (isDecimal128(value)) return Number(value.toString());
    return typeof value === 'number' ? value : undefined;
};

/**
 * Replace every `Decimal128` in a document with a number, in place, however deep.
 *
 * @param value - a lean row, a serialized document, or any value nested in one
 * @returns `value` itself, or the number it was when it was a `Decimal128`
 */
export const reviveDecimals = (value: unknown): unknown => {
    if (isDecimal128(value)) return Number(value.toString());
    if (!isWalkable(value)) return value;
    for (const [key, nested] of Object.entries(value)) {
        const revived = reviveDecimals(nested);
        if (revived !== nested) Reflect.set(value, key, revived);
    }
    return value;
};

/**
 * `Decimal128`, typed the way Mongoose types a `number` field's `type`.
 *
 * The document interfaces say `price: number` (what every reader sees), while Mongoose's
 * definition types only accept `Number` for such a field and know nothing of the getter that
 * makes the two agree. The one cast says so, once, here.
 */
const DECIMAL128_FOR_NUMBER_FIELD = ((type: unknown) => type as NumberConstructor)(
    Schema.Types.Decimal128
);

/** What a money field may ask for beyond being a money field. */
export interface MoneyPathOptions {
    /** Refuse a missing value. */
    required?: boolean;
    /** Refuse a negative amount: Decimal128 has no `min` of its own. */
    nonNegative?: boolean;
    /** Stored when the field is absent. */
    default?: number;
}

/**
 * Whether a stored amount may be written: finite, and not negative when the field says so.
 * @param nonNegative - whether a negative amount is refused
 */
const isWritableAmount =
    (nonNegative: boolean) =>
    (stored: unknown): boolean => {
        const amount = decimalToNumber(stored);
        return amount !== undefined && Number.isFinite(amount) && (!nonNegative || amount >= 0);
    };

/**
 * The schema definition of one money field: `Decimal128` at rest, a `number` through the getter.
 * Mongoose casts a `number` written to it, so no setter is needed.
 *
 * @param options - what the field requires
 * @returns a definition to put under the field's name
 */
export const moneyPath = ({
    required = false,
    nonNegative = false,
    default: initial
}: MoneyPathOptions = {}) => ({
    type: DECIMAL128_FOR_NUMBER_FIELD,
    required,
    get: decimalToNumber,
    validate: {
        validator: isWritableAmount(nonNegative),
        message: (): string =>
            `{PATH} must be ${nonNegative ? 'a non-negative ' : 'a finite '}amount`
    },
    ...(initial === undefined ? {} : { default: initial })
});

/**
 * Mongoose plugin: a lean read of this model hands back numbers, not `Decimal128` objects.
 *
 * A hydrated document is covered by each path's getter and `toJSON` by the serializer; only
 * `.lean()` bypasses both, so the post-find hook revives the rows it returns. An aggregation is
 * not hooked: its output is whatever the pipeline shaped, and a `$sum` should stay exact until it
 * is read as minor units.
 *
 * @param schema - a schema with at least one {@link moneyPath}
 */
export const moneyPlugin = (schema: Schema): void => {
    // Mongoose query middleware: `post('find', fn)` runs after the query resolves, with its result.
    // `mongooseOptions().lean` is the flag `.lean()` set on this query.
    // https://mongoosejs.com/docs/middleware.html#types-of-middleware
    schema.post(
        ['find', 'findOne', 'findOneAndUpdate', 'findOneAndDelete', 'findOneAndReplace'],
        function reviveLean(this: Query<unknown, unknown>, result: unknown) {
            if (this.mongooseOptions().lean) reviveDecimals(result);
        }
    );
};
