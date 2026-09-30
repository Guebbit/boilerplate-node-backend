/**
 * @module
 * `defineConfig`: one owner's slice of the environment — a name, a shape of {@link Field}s keyed by
 * variable name, and an optional cross-field check — turned into a typed, memoised accessor.
 *
 * The standard this follows (Laravel, AdonisJS, NestJS, Spring): the environment is read in ONE
 * layer, validated against a schema, and everything else reads the typed result. A slice is that
 * layer's unit; the boot gate (`assertConfigIn`) validates every slice at once and lists every
 * mistake, not the first one.
 *
 * See: docs/tools/configuration.md
 */

import type { Field, FieldDocument, Presence } from './fields';
import { currentEnvironment, type Environment } from './store';

/** The fields of one slice, keyed by the environment variable each one reads. */
export type Shape = Readonly<Record<string, Field<unknown>>>;

/** What a slice hands its readers: every field's parsed value, under the variable's own name. */
export type Parsed<TShape extends Shape> = {
    readonly [K in keyof TShape]: TShape[K] extends Field<infer T> ? T : never;
};

/** What the docs generator and the boot gate need to know about one field. */
export interface FieldInfo {
    /** The variable name. */
    name: string;
    /** Generated-page facts. */
    doc: FieldDocument;
    /** Boot-time presence rule, if any. */
    presence?: Presence;
    /** Whether the value is a credential. */
    sensitive: boolean;
    /** Whether setting it outside development/test is the mistake. */
    forbiddenOutsideRelaxed: boolean;
}

/** Everything wrong with one slice's values, grouped by kind so the message can say which. */
export interface SliceProblems {
    /** A set value the field's shape refuses. */
    invalid: string[];
    /** A variable missing, too short, or still its placeholder. */
    presence: string[];
    /** A variable set where it must never be. */
    forbidden: string[];
    /** The slice's own cross-field messages. */
    checks: string[];
}

/** Type-erased view of a slice — what a list of slices, the gate and the docs page all share. */
export interface ConfigSlice {
    /** Owner-scoped name, e.g. `products`; shown in the generated page. */
    readonly name: string;
    /** Every field, in declaration order. */
    readonly fields: readonly FieldInfo[];
    /**
     * Every problem this slice has against `environment`. Shape problems always; presence, forbidden and
     * cross-field ones only outside `NODE_ENV=test`.
     *
     * @param environment - the environment to judge
     */
    inspect(environment: Environment): SliceProblems;
}

/** A slice's reader: call it for the typed values; `.slice` is the type-erased view. */
export type ConfigAccessor<TShape extends Shape> = (() => Parsed<TShape>) & {
    readonly slice: ConfigSlice;
};

/** Thrown when a slice's values cannot be read, and by the boot gate. */
export class ConfigError extends Error {
    /** @param message - every problem found, in one string */
    constructor(message: string) {
        super(message);
        this.name = 'ConfigError';
    }
}

/**
 * Whether `environment` describes a developer machine or CI: `NODE_ENV` is exactly `development` or
 * `test`, and nothing else.
 *
 * @param environment - the environment to judge
 */
export const isRelaxedIn = (environment: Environment): boolean =>
    environment.NODE_ENV === 'development' || environment.NODE_ENV === 'test';

/**
 * One field's raw value against its rule.
 *
 * @param name - the variable
 * @param field - its rule
 * @param raw - the raw value
 * @returns the parsed value, or the issue as a sentence
 */
const parseField = (
    name: string,
    field: Field<unknown>,
    raw: string | undefined
): { ok: true; value: unknown } | { ok: false; issue: string } => {
    const result = field.schema.safeParse(raw);
    if (result.success) return { ok: true, value: result.data };
    const expected = result.error.issues[0]?.message ?? 'a valid value';
    // A credential's value never reaches an error message or a log line.
    const got = field.sensitive || raw === undefined ? '' : ` (got "${raw.slice(0, 60)}")`;
    return { ok: false, issue: `${name}: expected ${expected}${got}` };
};

/**
 * Whether a presence rule is broken: a comma-separated value is checked member by member, so a
 * placeholder or a truncated key anywhere in a ring still refuses.
 *
 * @param rule - the presence rule
 * @param raw - the raw value
 */
const presenceBroken = (rule: Presence, raw: string | undefined): boolean => {
    // Blank members dropped, the way every list reader drops them: a trailing comma is a typo.
    const members = (raw ?? '').split(',').filter((member) => member.trim() !== '');
    return (
        (members.length === 0 && rule.minLength > 0) ||
        members.some((member) => member.length < rule.minLength || member === rule.placeholder)
    );
};

/** Builds the `FieldInfo` list from a shape. */
const describeShape = (shape: Shape): FieldInfo[] =>
    Object.entries(shape).map(([name, field]) => ({
        name,
        doc: field.doc,
        ...(field.presence && { presence: field.presence }),
        sensitive: field.sensitive,
        forbiddenOutsideRelaxed: field.forbiddenOutsideRelaxed
    }));

/**
 * Parses every field of a shape.
 *
 * @param shape - the fields
 * @param environment - the environment
 * @returns the typed values, or every shape issue
 */
const parseShape = <TShape extends Shape>(
    shape: TShape,
    environment: Environment
): { ok: true; value: Parsed<TShape> } | { ok: false; issues: string[] } => {
    const values: Record<string, unknown> = {};
    const issues: string[] = [];
    for (const [name, field] of Object.entries(shape)) {
        const parsed = parseField(name, field, environment[name]);
        if (parsed.ok) values[name] = parsed.value;
        else issues.push(parsed.issue);
    }
    // `as`: each entry was parsed by its own field, which is what `Parsed<TShape>` says; the compiler
    // cannot follow a loop over `Object.entries` back to the mapped type.
    return issues.length > 0
        ? { ok: false, issues }
        : { ok: true, value: Object.freeze(values) as Parsed<TShape> };
};

/** What {@link defineConfig} takes. */
export interface ConfigDefinition<TShape extends Shape> {
    /** Owner-scoped name. */
    name: string;
    /** The fields, keyed by variable name. */
    shape: TShape;
    /**
     * Cross-field rules, run at boot with the parsed values — a companion variable missing, a
     * window ordered wrongly. Each string is one problem.
     */
    check?(config: Parsed<TShape>, environment: Environment): readonly string[];
}

/**
 * Presence and forbidden problems for one shape outside `NODE_ENV=test`.
 *
 * @param info - the fields
 * @param environment - the environment
 */
const presenceProblems = (
    info: readonly FieldInfo[],
    environment: Environment
): Pick<SliceProblems, 'presence' | 'forbidden'> => {
    const relaxed = isRelaxedIn(environment);
    return {
        presence: info
            .filter(
                ({ presence, name }) =>
                    presence !== undefined &&
                    (!presence.productionOnly || !relaxed) &&
                    presenceBroken(presence, environment[name])
            )
            .map(({ name }) => name),
        forbidden: info
            .filter(
                ({ forbiddenOutsideRelaxed, name }) =>
                    forbiddenOutsideRelaxed && !relaxed && (environment[name] ?? '') !== ''
            )
            .map(({ name }) => name)
    };
};

/**
 * Turns a definition into its accessor. The accessor parses lazily, memoises per set of raw
 * values, and throws a {@link ConfigError} when a value is refused.
 *
 * @param definition - name, shape and optional cross-field check
 * @returns the accessor, carrying its type-erased slice as `.slice`
 */
export const defineConfig = <TShape extends Shape>(
    definition: ConfigDefinition<TShape>
): ConfigAccessor<TShape> => {
    const info = describeShape(definition.shape);
    const names = info.map(({ name }) => name);

    const slice: ConfigSlice = {
        name: definition.name,
        fields: info,
        inspect: (environment) => {
            const parsed = parseShape(definition.shape, environment);
            const invalid = parsed.ok ? [] : parsed.issues;
            if (environment.NODE_ENV === 'test')
                return { invalid, presence: [], forbidden: [], checks: [] };
            return {
                invalid,
                ...presenceProblems(info, environment),
                checks: parsed.ok ? [...(definition.check?.(parsed.value, environment) ?? [])] : []
            };
        }
    };

    let memo: { raws: readonly (string | undefined)[]; value: Parsed<TShape> } | undefined;
    const read = (): Parsed<TShape> => {
        const environment = currentEnvironment();
        const raws = names.map((name) => environment[name]);
        if (memo?.raws.every((raw, index) => raw === raws[index])) return memo.value;

        const parsed = parseShape(definition.shape, environment);
        if (!parsed.ok)
            throw new ConfigError(
                `Invalid configuration (${definition.name}): ${parsed.issues.join('; ')}`
            );
        memo = { raws, value: parsed.value };
        return parsed.value;
    };

    return Object.assign(read, { slice });
};

/**
 * Every problem across every slice, grouped the way the boot error is worded.
 *
 * @param slices - the slices to judge
 * @param environment - the environment
 */
export const configProblems = (
    slices: readonly ConfigSlice[],
    environment: Environment
): { [K in keyof SliceProblems]: string[] } => {
    const all = slices.map((slice) => slice.inspect(environment));
    // A variable two slices both declare (an adapter's read, a module's presence rule) is one
    // mistake, however many slices see it.
    const merged = (pick: (problems: SliceProblems) => string[]): string[] => [
        ...new Set(all.flatMap((problems) => pick(problems)))
    ];
    return {
        invalid: merged((problems) => problems.invalid),
        presence: merged((problems) => problems.presence),
        checks: merged((problems) => problems.checks),
        forbidden: merged((problems) => problems.forbidden)
    };
};

/**
 * Refuse to boot on any problem in any slice — once, listing every one, so a misconfigured
 * deployment names all its mistakes instead of one per restart.
 *
 * @param slices - the slices to judge
 * @param environment - the environment
 * @throws {ConfigError} when anything is wrong
 */
export const assertConfigIn = (slices: readonly ConfigSlice[], environment: Environment): void => {
    const problems = configProblems(slices, environment);
    const clauses = [
        problems.invalid.length > 0 && `invalid values — ${problems.invalid.join(', ')}`,
        problems.presence.length > 0 &&
            `missing, too short, or still set to their .env-example placeholder — ${problems.presence.join(', ')}`,
        problems.checks.length > 0 &&
            `failing their own configuration check — ${problems.checks.join(', ')}`,
        problems.forbidden.length > 0 &&
            `set, which must never happen here — ${problems.forbidden.join(', ')}`
    ].filter((clause) => clause !== false);
    if (clauses.length > 0) throw new ConfigError(`Refusing to boot: ${clauses.join('; ')}`);
};

/**
 * {@link assertConfigIn} against the environment slices currently read from.
 *
 * @param slices - the slices to judge
 * @throws {ConfigError} when anything is wrong
 */
export const assertConfig = (slices: readonly ConfigSlice[]): void =>
    assertConfigIn(slices, currentEnvironment());

/**
 * Turns a resolver that throws on an unknown selector into the shape a slice check returns: call
 * it once at boot, and a throw means the variable names something this build does not have.
 * Reports the resolver's OWN message, which already names the variable and lists the allowed
 * values.
 *
 * @param resolve - the resolver to probe
 * @returns one message when `resolve` throws, `[]` when it does not
 */
export const probe = (resolve: () => unknown): string[] => {
    // eslint-disable-next-line no-restricted-syntax -- the resolver's throw IS the signal this probes for; there is no safe wrapper for "does this synchronous call throw"
    try {
        resolve();
        return [];
    } catch (error) {
        // A resolver here always throws a real Error — the fallback is for one that does not, so
        // this can never come back empty.
        return [error instanceof Error && error.message ? error.message : 'Unknown selector'];
    }
};
