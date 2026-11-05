/**
 * @module
 * Money at rest: a stored amount is a `Decimal128`, and everything above the persistence layer
 * still sees the amount as decimal text (`"19.9"`): exact, never a float. The serializer pads it to
 * the currency's places on the way out.
 *
 * ```
 * write  text → cast by Mongoose → Decimal128            (`moneyPath`)
 * read   hydrated   → the path getter                    (`moneyPath`)
 *        lean       → the post-find hook                 (`moneyPlugin`)
 *        toJSON     → the serializer's transform         (`stringifyDecimals`)
 * ```
 *
 * Why Decimal128: MongoDB calls `double` unsuitable for money. Stored exactly, a database `$sum`
 * needs no conversion and is exact. The arithmetic in code is unchanged: integer minor units in
 * `@domain-primitives/money`.
 * https://www.mongodb.com/docs/manual/tutorial/model-monetary-data/
 */

import { Schema, type Query } from 'mongoose';
import { padDecimal } from '@domain-primitives/money';

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
 * Turn a stored `Decimal128` into its decimal text.
 *
 * The text keeps whatever scale the database holds (`$inc`/`$sum` lose trailing zeros); the
 * serializer pads it to the currency's places, never this reader.
 *
 * @param value - what the database held
 * @returns the text for a `Decimal128`, the plain text of a number or a string; `undefined` for an absent field
 */
export const decimalToString = (value: unknown): string | undefined => {
    if (isDecimal128(value)) return value.toString();
    if (typeof value === 'string') return value;
    return typeof value === 'number' ? String(value) : undefined;
};

/**
 * Replace every `Decimal128` in a document with its decimal text, in place, however deep.
 *
 * @param value - a lean row, a serialized document, or any value nested in one
 * @returns `value` itself, or the text it was when it was a `Decimal128`
 */
export const stringifyDecimals = (value: unknown): unknown => {
    if (isDecimal128(value)) return value.toString();
    if (!isWalkable(value)) return value;
    for (const [key, nested] of Object.entries(value)) {
        const revived = stringifyDecimals(nested);
        if (revived !== nested) Reflect.set(value, key, revived);
    }
    return value;
};

/**
 * `Decimal128`, typed the way Mongoose types a `number` field's `type`.
 *
 * The document interfaces say `price: string` (what every reader sees), while Mongoose's
 * definition types only accept `String` for such a field and know nothing of the getter that
 * makes the two agree. The one cast says so, once, here.
 */
const DECIMAL128_FOR_TEXT_FIELD = ((type: unknown) => type as StringConstructor)(
    Schema.Types.Decimal128
);

/** What a money field may ask for beyond being a money field. */
export interface MoneyPathOptions {
    /** Refuse a missing value. */
    required?: boolean;
    /** Refuse a negative amount: Decimal128 has no `min` of its own. */
    nonNegative?: boolean;
    /** Stored when the field is absent. */
    default?: string;
}

/**
 * Whether a stored amount may be written: finite, and not negative when the field says so.
 * @param nonNegative - whether a negative amount is refused
 */
const isWritableAmount =
    (nonNegative: boolean) =>
    (stored: unknown): boolean => {
        const text = decimalToString(stored);
        const amount = text === undefined ? Number.NaN : Number(text);
        return Number.isFinite(amount) && (!nonNegative || amount >= 0);
    };

/**
 * The schema definition of one money field: `Decimal128` at rest, decimal text through the getter.
 * Mongoose casts a `number` or text written to it, so no setter is needed.
 *
 * @param options - what the field requires
 * @returns a definition to put under the field's name
 */
export const moneyPath = ({
    required = false,
    nonNegative = false,
    default: initial
}: MoneyPathOptions = {}) => ({
    type: DECIMAL128_FOR_TEXT_FIELD,
    // Custom option Mongoose keeps on the path: `moneyPathsOf` finds the money fields by it.
    money: true,
    required,
    get: decimalToString,
    validate: {
        validator: isWritableAmount(nonNegative),
        // Mongoose hands a function-form message `{ path }`; the `{PATH}` token only works in a string.
        message: ({ path }: { path: string }): string =>
            `${path} must be ${nonNegative ? 'a non-negative ' : 'a finite '}amount`
    },
    ...(initial === undefined ? {} : { default: initial })
});

/**
 * Mongoose plugin: a lean read of this model hands back decimal text, not `Decimal128` objects.
 *
 * A hydrated document is covered by each path's getter and `toJSON` by the serializer; only
 * `.lean()` bypasses both, so the post-find hook converts the rows it returns. An aggregation is
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
            if (this.mongooseOptions().lean) stringifyDecimals(result);
        }
    );
};

/** The two things `moneyPathsOf` reads off a schema type: its options and any embedded schema. */
interface WalkableSchemaType {
    options?: unknown;
    schema?: unknown;
}

/** The one method `moneyPathsOf` needs from a schema, named structurally (see `SerializableSchema`). */
export interface MoneyWalkableSchema {
    eachPath: (callback: (path: string, type: WalkableSchemaType) => void) => void;
}

/**
 * Whether a value can walk its own paths, i.e. is an embedded schema.
 * @param value - an embedded schema type's `schema`, or anything
 */
const isWalkableSchema = (value: unknown): value is MoneyWalkableSchema =>
    typeof value === 'object' && value !== null && typeof Reflect.get(value, 'eachPath') === 'function';

/**
 * The dotted path of every {@link moneyPath} field a schema declares, embedded schemas included
 * (`refunds.amount`). An array on the way is walked implicitly by {@link padMoneyPaths}.
 *
 * @param schema - a model's schema
 * @param prefix - the path the schema is embedded under
 * @returns the money paths, outermost first
 */
export const moneyPathsOf = (schema: MoneyWalkableSchema, prefix = ''): string[] => {
    const found: string[] = [];
    schema.eachPath((path, type) => {
        if (Reflect.get(Object(type.options), 'money') === true) found.push(prefix + path);
        if (isWalkableSchema(type.schema)) found.push(...moneyPathsOf(type.schema, `${prefix}${path}.`));
    });
    return found;
};

/**
 * Pad one amount to its currency's places. Anything that is not a number or numeric text is left
 * alone: an absent field stays absent.
 * @param value - a stored or computed amount
 * @param currency - the ISO-4217 code the amount is priced in
 */
const padAmount = (value: unknown, currency: string): unknown =>
    typeof value === 'string' || typeof value === 'number'
        ? padDecimal(value, currency)
        : value;

/**
 * Pad every amount at the given paths to the currency's own places, in place. This is the one place
 * the wire's `"19.90"` is made: a stored `Decimal128` forgets trailing zeros and a `$sum` forgets the
 * scale, so nothing upstream is trusted to have kept it. A value past the currency's places rounds.
 *
 * @param serialized - a plain object about to leave as a wire payload
 * @param paths - dotted money paths, as {@link moneyPathsOf} returns them
 * @param currency - the ISO-4217 code every amount in `serialized` is priced in
 */
export const padMoneyPaths = (
    serialized: Record<string, unknown>,
    paths: readonly string[],
    currency: string
): void => {
    for (const path of paths) padAt(serialized, path.split('.'), currency);
};

/**
 * Walk one split path through objects and arrays and pad whatever sits at its end.
 * @param node - the value reached so far
 * @param keys - what is left of the path
 * @param currency - the currency to pad to
 */
const padAt = (node: unknown, keys: readonly string[], currency: string): void => {
    if (Array.isArray(node)) {
        for (const element of node) padAt(element, keys, currency);
        return;
    }
    if (!isWalkable(node) || keys.length === 0) return;
    const [key, ...rest] = keys;
    if (rest.length === 0) {
        if (key in node) Reflect.set(node, key, padAmount(node[key], currency));
        return;
    }
    padAt(node[key], rest, currency);
};
