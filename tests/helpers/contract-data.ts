/**
 * Zod-schema-driven fixture generator for request bodies, used by
 * `tests/contract/request-contract.test.ts` to answer a question the hand-written factories
 * (`tests/helpers/factories/*`) don't: "does the API honour its own contract for *any* legal
 * input", not "does this specific scenario behave correctly". Deterministic tests must keep
 * using the hand-written factories; this is additive.
 *
 * Why an in-repo walker instead of a library (`zod-fixture`, `@anatine/zod-mock`): both lag zod
 * majors, and this project is on zod v4 — a dependency-version-lag risk for ~150 lines of AST
 * walking is not worth taking. `_zod.def` is zod v4's own (typed, public) introspection surface,
 * not an implementation-detail hack — see `node_modules/zod/v4/core/schemas.d.ts`.
 *
 * Why a hand-rolled PRNG instead of `@faker-js/faker`: tried it first. `@faker-js/faker@10` ships
 * ESM-only, and this project's Jest setup (ts-jest, CommonJS `module` target, no
 * `transformIgnorePatterns` override) can't load it — `SyntaxError: Cannot use import statement
 * outside a module`, thrown from inside faker's own entry point. Fixing that means teaching Jest
 * to transform an ESM dependency, a config change with a much larger blast radius than this
 * file's actual requirement, which is only "deterministic, reproducible-by-seed values" — not
 * faker's realism. Mulberry32 below is ~10 lines and has no such problem.
 *
 * Two entry points:
 *
 *   validPayload(schema)     — a payload that satisfies the schema
 *   invalidPayloads(schema)  — payloads that each violate exactly one constraint
 *
 * Both draw from a PRNG seeded once per process (`CONTRACT_DATA_SEED`, or a fresh value printed
 * on first use) — not reseeded per call, so repeated calls in one test file draw
 * different-but-reproducible values (distinct emails, ids, ...) from the same seeded stream.
 */
import type { ZodTypeAny } from 'zod';

// ─── seeded PRNG ────────────────────────────────────────────────────────────────
//
// Mulberry32: small, fast, good statistical quality for test-fixture purposes (not
// cryptographic). Returns a function yielding floats in [0, 1), deterministic for a given seed.
const createRandom = (seed: number) => {
    let state = seed >>> 0;
    return (): number => {
        state = (state + 0x6d_2b_79_f5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
    };
};

let seeded = false;
let random = createRandom(0);

/** `CONTRACT_DATA_SEED` when set to a finite number, otherwise a fresh value. */
export const resolveContractDataSeed = (): number => {
    const raw = process.env.CONTRACT_DATA_SEED;
    const parsed = raw ? Number(raw) : Number.NaN;
    return Number.isFinite(parsed) ? parsed : Math.floor(Math.random() * 1e9);
};

const ensureSeeded = (): void => {
    if (seeded) return;
    const seed = resolveContractDataSeed();
    random = createRandom(seed);
    seeded = true;
    // eslint-disable-next-line no-console
    console.log(
        `[contract-data] seed=${seed} (rerun with CONTRACT_DATA_SEED=${seed} to reproduce)`
    );
};

const randomInt = (min: number, max: number): number =>
    min + Math.floor(random() * (max - min + 1));

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz';
const HEX_ALPHABET = '0123456789abcdef';

const randomAlpha = (length: number): string =>
    Array.from({ length }, () => ALPHABET[randomInt(0, ALPHABET.length - 1)]).join('');

const randomHex = (length: number): string =>
    Array.from({ length }, () => HEX_ALPHABET[randomInt(0, HEX_ALPHABET.length - 1)]).join('');

/** A few short words joined together — long enough in practice to clear common hand-tightened
 * minimums (e.g. a username or title requiring at least a few characters) without hardcoding
 * any specific business rule the contract itself doesn't declare. */
const randomWords = (): string =>
    Array.from({ length: randomInt(3, 6) }, () => randomAlpha(randomInt(3, 8))).join(' ');

// ─── zod v4 introspection ───────────────────────────────────────────────────────

interface IZodCheckDef {
    check: string;
    minimum?: number;
    maximum?: number;
    value?: number;
}

interface IZodDef {
    type: string;
    shape?: Record<string, ZodTypeAny>;
    element?: ZodTypeAny;
    innerType?: ZodTypeAny;
    valueType?: ZodTypeAny;
    format?: string;
    checks?: { _zod: { def: IZodCheckDef } }[];
    entries?: Record<string, unknown>;
    values?: unknown[];
    options?: ZodTypeAny[];
}

const defOf = (schema: ZodTypeAny): IZodDef =>
    (schema as unknown as { _zod: { def: IZodDef } })._zod.def;

const checksOf = (def: IZodDef): IZodCheckDef[] =>
    (def.checks ?? []).map((check) => check._zod.def);

const isOptionalField = (schema: ZodTypeAny): boolean => defOf(schema).type === 'optional';

/** Unwraps optional/nullable/default wrappers to the schema whose constraints actually apply. */
const unwrapField = (schema: ZodTypeAny): ZodTypeAny => {
    const def = defOf(schema);
    if (def.type === 'optional' || def.type === 'nullable' || def.type === 'default')
        return unwrapField(def.innerType as ZodTypeAny);
    return schema;
};

const randomStringForFormat = (format?: string): string => {
    switch (format) {
        case 'email': {
            return `${randomAlpha(8)}@example.com`;
        }
        case 'url': {
            return `https://example.com/${randomAlpha(8)}`;
        }
        case 'datetime': {
            return new Date().toISOString();
        }
        case 'uuid':
        case 'guid': {
            const hex = (length: number) => randomHex(length);
            // Version 4, variant 1 — matches the shape most `.uuid()`/`.guid()` validators check.
            return `${hex(8)}-${hex(4)}-4${hex(3)}-a${hex(3)}-${hex(12)}`;
        }
        default: {
            return randomWords();
        }
    }
};

const clampStringLength = (value: string, checks: IZodCheckDef[]): string => {
    const minLength = checks.find((check) => check.check === 'min_length')?.minimum;
    const maxLength = checks.find((check) => check.check === 'max_length')?.maximum;
    let result = value;
    if (typeof minLength === 'number' && result.length < minLength)
        result = result.padEnd(minLength, 'x');
    if (typeof maxLength === 'number' && result.length > maxLength)
        result = result.slice(0, maxLength);
    return result;
};

const buildValue = (schema: ZodTypeAny): unknown => {
    const def = defOf(schema);
    switch (def.type) {
        case 'string': {
            return clampStringLength(randomStringForFormat(def.format), checksOf(def));
        }
        case 'number': {
            const checks = checksOf(def);
            const min = checks.find((check) => check.check === 'greater_than')?.value;
            const max = checks.find((check) => check.check === 'less_than')?.value;
            const low = typeof min === 'number' ? min : 0;
            const high = typeof max === 'number' ? max : low + 1000;
            // Always a whole number: a valid `number`/`format: double` either way, but also
            // satisfies fields the OpenAPI spec declares `type: integer` — a constraint that
            // doesn't always survive into the generated zod schema as an explicit `.int()`
            // (e.g. CreateOrderBody's `items[].quantity` is `zod.number().min(1)` in
            // `api/schemas.zod.ts`, but `integer` in `openapi.yaml`).
            return Math.round(low + random() * (high - low));
        }
        case 'boolean': {
            return random() < 0.5;
        }
        case 'literal': {
            return (def.values ?? [])[0];
        }
        case 'enum': {
            const values = Object.values(def.entries ?? {});
            return values[randomInt(0, values.length - 1)];
        }
        case 'array': {
            const minItems =
                checksOf(def).find((check) => check.check === 'min_length')?.minimum ?? 1;
            const count = Math.max(minItems, 1);
            return Array.from({ length: count }, () => buildValue(def.element as ZodTypeAny));
        }
        case 'object': {
            const result: Record<string, unknown> = {};
            for (const [key, fieldSchema] of Object.entries(def.shape ?? {}))
                result[key] = buildValue(fieldSchema);
            return result;
        }
        case 'optional':
        case 'nullable':
        case 'default': {
            return buildValue(def.innerType as ZodTypeAny);
        }
        case 'record': {
            return { [randomStringForFormat()]: buildValue(def.valueType as ZodTypeAny) };
        }
        case 'union': {
            return buildValue((def.options ?? [])[0] as ZodTypeAny);
        }
        case 'unknown':
        case 'any': {
            return {};
        }
        default: {
            throw new Error(`contract-data: unsupported zod type "${def.type}"`);
        }
    }
};

/**
 * Builds a payload that satisfies `schema` — every field, including optional ones, populated
 * with a contract-valid value.
 */
export const validPayload = <T = Record<string, unknown>>(schema: ZodTypeAny): T => {
    ensureSeeded();
    return buildValue(schema) as T;
};

export interface IInvalidPayloadCase {
    field: string;
    violation: string;
    payload: Record<string, unknown>;
}

const violationsForField = (fieldSchema: ZodTypeAny): { violation: string; value: unknown }[] => {
    const def = defOf(unwrapField(fieldSchema));
    const checks = checksOf(def);
    const violations: { violation: string; value: unknown }[] = [];

    switch (def.type) {
        case 'string': {
            const minLength = checks.find((check) => check.check === 'min_length')?.minimum;
            if (typeof minLength === 'number' && minLength > 0)
                violations.push({
                    violation: `shorter than the required minimum length (${minLength})`,
                    value: 'x'.repeat(Math.max(0, minLength - 1))
                });
            const maxLength = checks.find((check) => check.check === 'max_length')?.maximum;
            if (typeof maxLength === 'number')
                violations.push({
                    violation: `longer than the allowed maximum length (${maxLength})`,
                    value: 'x'.repeat(maxLength + 1)
                });
            if (def.format === 'email')
                violations.push({ violation: 'not a valid email address', value: 'not-an-email' });
            if (def.format === 'url')
                violations.push({ violation: 'not a valid URL', value: 'not a url' });

            break;
        }
        case 'number': {
            const min = checks.find((check) => check.check === 'greater_than');
            if (min && typeof min.value === 'number')
                violations.push({
                    violation: `below the minimum (${min.value})`,
                    value: min.value - 1
                });
            const max = checks.find((check) => check.check === 'less_than');
            if (max && typeof max.value === 'number')
                violations.push({
                    violation: `above the maximum (${max.value})`,
                    value: max.value + 1
                });

            break;
        }
        case 'array': {
            const minItems = checks.find((check) => check.check === 'min_length');
            if (minItems && typeof minItems.minimum === 'number' && minItems.minimum > 0)
                violations.push({
                    violation: `fewer than the minimum item count (${minItems.minimum})`,
                    value: []
                });

            break;
        }
        case 'enum': {
            violations.push({
                violation: 'not one of the declared enum values',
                value: 'not-a-declared-enum-value'
            });

            break;
        }
        case 'boolean': {
            violations.push({
                violation: 'wrong type (string instead of boolean)',
                value: 'not-a-boolean'
            });

            break;
        }
        // No default
    }

    if (violations.length === 0)
        violations.push({
            violation: 'wrong type (number instead of the declared type)',
            value: 424_242
        });

    return violations;
};

/**
 * Builds one payload per constraint violated: each is otherwise `validPayload(schema)`, with
 * exactly one field mutated — missing (for a required field) or out of bounds / wrong format
 * (for a field carrying a min/max/format constraint). Only object schemas are supported; every
 * `*Body` export in `api/schemas.zod.ts` is one.
 */
export const invalidPayloads = (schema: ZodTypeAny): IInvalidPayloadCase[] => {
    ensureSeeded();
    const def = defOf(schema);
    if (def.type !== 'object')
        throw new Error(`invalidPayloads: expected an object schema, got "${def.type}"`);

    const basePayload = buildValue(schema) as Record<string, unknown>;
    const cases: IInvalidPayloadCase[] = [];

    for (const [key, fieldSchema] of Object.entries(def.shape ?? {})) {
        if (!isOptionalField(fieldSchema)) {
            const payload = { ...basePayload };
            delete payload[key];
            cases.push({ field: key, violation: 'missing required field', payload });
        }

        for (const { violation, value } of violationsForField(fieldSchema))
            cases.push({ field: key, violation, payload: { ...basePayload, [key]: value } });
    }

    return cases;
};
