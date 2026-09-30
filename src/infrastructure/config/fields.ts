/**
 * @module
 * The field builders a configuration slice is written with: `int`, `decimal`, `flag`, `choice`,
 * `text`, `email`, `secret`, `csv`, `keyRing`, `versionedKeyRing`.
 *
 * One rule for all of them: a value is trimmed, and a blank one counts as unset (the same
 * "empty string is not a value" rule t3-environment calls `emptyStringAsUndefined`). A value that is set
 * and wrong is an ISSUE, never a silent fallback — that is the whole point of moving off the old
 * `environmentNumber(key, fallback)` readers.
 *
 * Presence rules (length, placeholder, production-only) are data on the field, not parse rules:
 * a developer machine legitimately leaves a secret unset, so they are checked at boot only.
 *
 * See: docs/tools/configuration.md
 */

import { z } from 'zod';
import { FALSY_WORDS, TRUTHY_WORDS } from '../runtime/environment';
import { parseVersionedKeyRing, type VersionedKey } from '../security/versioned-secret';

/**
 * A rule about a value being THERE, checked at boot outside `NODE_ENV=test`. Unlike a shape rule
 * it cannot run on every read: an unset secret is a correct state on a developer machine.
 */
export interface Presence {
    /** Shortest acceptable value; `0` means "may stay unset, but not be the placeholder". */
    minLength: number;
    /** The `.env-example` stand-in this value must never still equal. */
    placeholder?: string;
    /** Check only outside development/test — the code-side default is right for a developer. */
    productionOnly?: boolean;
}

/** What a field says about itself to the generated configuration page. */
export interface FieldDocument {
    /** The shape in words: `whole number >= 1`, `switch`, `one of a, b`. */
    type: string;
    /** The value a deployment gets when it sets nothing, rendered; absent when there is none. */
    default?: string;
    /** One line on what the variable does. */
    describe?: string;
}

/**
 * One environment variable's rules: how to read it, what to tell the docs, and whether it may
 * be absent or present.
 */
export interface Field<T> {
    /** Parses the raw string (or `undefined` when unset or blank) into the typed value. */
    readonly schema: z.ZodType<T>;
    /** What the generated page shows. */
    readonly doc: FieldDocument;
    /** Boot-time presence rule, when the variable has one. */
    readonly presence?: Presence;
    /** `true` for a credential: its value is never echoed into an error message. */
    readonly sensitive: boolean;
    /** `true` when SETTING it outside development/test is itself the mistake. */
    readonly forbiddenOutsideRelaxed: boolean;
}

/** Options every builder accepts. */
export interface CommonOptions {
    /** One line for the generated page. */
    describe?: string;
    /** Boot-time presence rule. */
    required?: Presence;
    /** Never echo the value into an error. */
    sensitive?: boolean;
    /** Setting this outside development/test refuses boot. */
    forbiddenOutsideRelaxed?: boolean;
}

/**
 * Trim, and read a blank string as unset. Runs before every field's own rule.
 *
 * @param value - the raw environment value, or `undefined`
 * @returns the trimmed string, or `undefined` when blank or not a string
 */
const blankAsUnset = (value: unknown): unknown => {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    return trimmed === '' ? undefined : trimmed;
};

/** Whole-string, base-10 integers only — no junk, no hex, no unit suffix. */
const INTEGER = /^[+-]?\d+$/;

/** Whole-string decimals only — an optional sign, digits, and an optional fraction. */
const DECIMAL = /^[+-]?\d+(\.\d+)?$/;

/** What {@link build} needs beyond {@link CommonOptions}. */
interface BuildOptions<T> extends CommonOptions {
    /** The value an unset variable takes. */
    default?: T;
    /** How the default reads on the generated page; `String` when absent. */
    renderDefault?: (value: T) => string;
    /** Skip the trim-and-blank step, for a value whose exact bytes are the point. */
    verbatim?: boolean;
}

/**
 * Wraps a value rule into a {@link Field}: blank means unset, and a `default` (when given) fills
 * in for an unset value.
 *
 * @param inner - the rule for a set value
 * @param type - the shape, in words
 * @param options - the builder's options, `default` included
 * @returns the field
 */
function build<T>(
    inner: z.ZodType<T>,
    type: string,
    options: BuildOptions<T> & { default: T }
): Field<T>;
function build<T>(
    inner: z.ZodType<T>,
    type: string,
    options: BuildOptions<T>
): Field<T | undefined>;
function build<T>(
    inner: z.ZodType<T>,
    type: string,
    options: BuildOptions<T>
): Field<T | undefined> {
    const fallback = options.default;
    // Zod: `.optional()` lets `undefined` through; the transform then puts the default in.
    // Not `.default()`: its typing refuses a generic `T`. https://zod.dev/api#optionals
    const rule = inner.optional().transform((value) => value ?? fallback);
    const render = options.renderDefault ?? String;
    return {
        // preprocess: run `blankAsUnset` first, then the rule above. https://zod.dev/api#preprocess
        schema: z.preprocess(options.verbatim ? (value: unknown) => value : blankAsUnset, rule),
        doc: {
            type,
            ...(fallback !== undefined && { default: render(fallback) }),
            ...(options.describe && { describe: options.describe })
        },
        ...(options.required && { presence: options.required }),
        sensitive: options.sensitive ?? false,
        forbiddenOutsideRelaxed: options.forbiddenOutsideRelaxed ?? false
    };
}

/** Bounds an `int` or a `decimal` may carry. */
export interface RangeOptions extends CommonOptions {
    /** Smallest accepted value. */
    min?: number;
    /** Largest accepted value. */
    max?: number;
    /** The value must be strictly below this — a rate in `[0, 1)`, say. */
    lessThan?: number;
}

/**
 * Describes a numeric range in words.
 *
 * @param noun - `whole number` or `decimal`
 * @param options - the bounds
 * @returns e.g. `whole number >= 1`
 */
const rangeLabel = (noun: string, { min, max, lessThan }: RangeOptions): string => {
    if (min !== undefined && lessThan !== undefined)
        return `${noun} ${String(min)}..<${String(lessThan)}`;
    if (min !== undefined && max !== undefined) return `${noun} ${String(min)}..${String(max)}`;
    if (min !== undefined) return `${noun} >= ${String(min)}`;
    return max === undefined ? noun : `${noun} <= ${String(max)}`;
};

/**
 * A number rule with the option's bounds applied.
 *
 * @param label - the description used as the error message
 * @param options - the bounds
 * @returns a Zod number rule
 */
const boundedNumber = (label: string, { min, max, lessThan }: RangeOptions): z.ZodNumber => {
    let rule = z.number(label);
    if (min !== undefined) rule = rule.min(min, label);
    if (max !== undefined) rule = rule.max(max, label);
    if (lessThan !== undefined) rule = rule.lt(lessThan, label);
    return rule;
};

/**
 * A whole number. `5mb`, `0x10`, `1e3` and `1.5` are refused rather than read as the default.
 *
 * @param options - `default` for an unset value; `min`/`max` bounds
 */
export function int(options: RangeOptions & { default: number }): Field<number>;
export function int(options?: RangeOptions): Field<number | undefined>;
export function int(options: RangeOptions & { default?: number } = {}): Field<number | undefined> {
    const label = rangeLabel('whole number', options);
    return build(
        z
            .string()
            .regex(INTEGER, label)
            // `parseInt(x, 10)`: base 10, so a zero-padded `0900` is 900, not octal.
            .transform((text) => Number.parseInt(text, 10))
            .pipe(boundedNumber(label, options).int(label)),
        label,
        options
    );
}

/**
 * A decimal number (a rate, a ratio). Whole-string: `.5` and `1e-1` are refused.
 *
 * @param options - `default` for an unset value; `min`/`max` bounds
 */
export function decimal(options: RangeOptions & { default: number }): Field<number>;
export function decimal(options?: RangeOptions): Field<number | undefined>;
export function decimal(
    options: RangeOptions & { default?: number } = {}
): Field<number | undefined> {
    const label = rangeLabel('decimal', options);
    return build(
        z
            .string()
            .regex(DECIMAL, label)
            .transform((text) => Number.parseFloat(text))
            .pipe(boundedNumber(label, options)),
        label,
        options
    );
}

/**
 * A switch: `1`/`true`/`yes`/`on` or `0`/`false`/`no`/`off`, either case. Anything else is refused.
 *
 * @param options - `default` for an unset value
 */
export function flag(options: CommonOptions & { default: boolean }): Field<boolean>;
export function flag(options?: CommonOptions): Field<boolean | undefined>;
export function flag(
    options: CommonOptions & { default?: boolean } = {}
): Field<boolean | undefined> {
    const label = `switch (${[...TRUTHY_WORDS, ...FALSY_WORDS].join(', ')})`;
    return build(
        // Zod: string -> boolean with configurable words. https://zod.dev/api#stringbool
        z.stringbool({
            truthy: [...TRUTHY_WORDS],
            falsy: [...FALSY_WORDS],
            case: 'insensitive',
            error: label
        }),
        'switch',
        { ...options, renderDefault: (value) => (value ? 'on' : 'off') }
    );
}

/**
 * A closed set: trimmed and lower-cased, anything outside it refused. The set may be a function,
 * for a registry whose names are only known once its providers have registered.
 *
 * @param allowed - the accepted values, lower-case, or a function returning them
 * @param options - `default` for an unset value; must itself be a member
 */
export function choice<const T extends string>(
    allowed: readonly T[] | (() => readonly T[]),
    options: CommonOptions & { default: T }
): Field<T>;
export function choice<const T extends string>(
    allowed: readonly T[] | (() => readonly T[]),
    options?: CommonOptions
): Field<T | undefined>;
export function choice<const T extends string>(
    allowed: readonly T[] | (() => readonly T[]),
    options: CommonOptions & { default?: T } = {}
): Field<T | undefined> {
    const members = (): readonly T[] => (typeof allowed === 'function' ? allowed() : allowed);
    return build(
        z
            .string()
            .transform((text) => text.toLowerCase())
            // Zod: `custom<T>` narrows the output type through the guard, no cast needed.
            // https://zod.dev/api#custom
            .pipe(
                z.custom<T>(
                    // Widened to `string` for the lookup only: `value` is not yet known to be a `T`.
                    (value) =>
                        typeof value === 'string' &&
                        (members() as readonly string[]).includes(value),
                    { error: () => `one of ${members().join(', ')}` }
                )
            ),
        `one of ${typeof allowed === 'function' ? 'the registered providers' : allowed.join(', ')}`,
        options
    );
}

/** Options for {@link text}. */
export interface TextOptions extends CommonOptions {
    /** Lower-case the value. */
    lower?: boolean;
    /** Upper-case the value. */
    upper?: boolean;
    /** Keep the value exactly as written: no trim, and a blank one stays blank. */
    verbatim?: boolean;
}

/**
 * Free text, trimmed. Blank is unset.
 *
 * @param options - `default` for an unset value; `lower`/`upper` to normalise
 */
export function text(options: TextOptions & { default: string }): Field<string>;
export function text(options?: TextOptions): Field<string | undefined>;
export function text(options: TextOptions & { default?: string } = {}): Field<string | undefined> {
    const normalise = (value: string): string => {
        if (options.lower) return value.toLowerCase();
        return options.upper ? value.toUpperCase() : value;
    };
    return build(z.string().transform(normalise), 'text', options);
}

/**
 * An email address, trimmed. Blank is unset; a set value that is not an address is refused.
 *
 * @param options - `default` for an unset value
 */
export function email(options: CommonOptions & { default: string }): Field<string>;
export function email(options?: CommonOptions): Field<string | undefined>;
export function email(
    options: CommonOptions & { default?: string } = {}
): Field<string | undefined> {
    // Zod: `z.email` is the library's own address rule, no hand-written pattern. https://zod.dev/api#emails
    return build(z.email('email address'), 'email address', options);
}

/**
 * Free text that is a credential: never echoed into an error, and (through `required`) checked for
 * length and for still being the `.env-example` placeholder at boot.
 *
 * @param options - the presence rule, and `describe`
 */
export const secret = (options: CommonOptions & Presence): Field<string | undefined> => {
    const { minLength, placeholder, productionOnly, ...rest } = options;
    return text({
        ...rest,
        sensitive: true,
        required: {
            minLength,
            ...(placeholder !== undefined && { placeholder }),
            ...(productionOnly !== undefined && { productionOnly })
        }
    });
};

/** Options for {@link csv}. */
export interface CsvOptions extends CommonOptions {
    /** Upper-case every member. */
    upper?: boolean;
    /** Lower-case every member. */
    lower?: boolean;
}

/**
 * Splits a list value on commas: members trimmed, blank ones dropped — a trailing comma is a typo,
 * not a member.
 *
 * @param normalise - applied to each member
 * @returns a Zod rule producing the members
 */
const listRule = (normalise: (member: string) => string): z.ZodType<string[]> =>
    z.string().transform((raw) =>
        raw
            .split(',')
            .map((member) => normalise(member.trim()))
            .filter((member) => member !== '')
    );

/**
 * A comma-separated list. Unset is the empty list.
 *
 * @param options - `describe`, and `upper`/`lower` to normalise each member
 */
export const csv = (options: CsvOptions = {}): Field<string[]> =>
    build(
        listRule((member) => {
            if (options.lower) return member.toLowerCase();
            return options.upper ? member.toUpperCase() : member;
        }),
        'comma-separated list',
        { ...options, default: [], renderDefault: () => 'empty' }
    );

/**
 * A key ring of plain secrets, newest first: `new,old` while a rotation is in flight, one entry
 * once it is done. Never echoed. Unset is the empty ring.
 *
 * @param options - the presence rule and `describe`
 */
export const keyRing = (options: CommonOptions = {}): Field<string[]> =>
    build(
        listRule((member) => member),
        'key ring (comma-separated, newest first)',
        { ...options, sensitive: true, default: [], renderDefault: () => 'empty' }
    );

/**
 * A key ring of versioned secrets — `v2:new,v1:old`, a bare value being `v1`. Never echoed.
 *
 * @param options - the presence rule and `describe`
 */
export const versionedKeyRing = (options: CommonOptions = {}): Field<VersionedKey[]> =>
    build(
        z.string().transform((raw) => parseVersionedKeyRing(raw)),
        'versioned key ring (`version:key`, comma-separated, newest first)',
        { ...options, sensitive: true, default: [], renderDefault: () => 'empty' }
    );

/**
 * The same field with a boot-time presence rule attached — how a module makes a variable an
 * infrastructure adapter reads a REQUIRED one for its own deployment, so deleting the module
 * deletes the requirement and the adapter's own slice stays shape-only.
 *
 * @param field - the field the adapter reads
 * @param presence - what the owning module cannot run without
 * @returns a copy carrying the rule
 */
export const withPresence = <T>(field: Field<T>, presence: Presence): Field<T> => ({
    ...field,
    presence
});
