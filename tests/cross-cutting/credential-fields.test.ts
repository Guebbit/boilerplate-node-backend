/**
 * Nothing credential-shaped survives serialization, on any model.
 *
 * A password hash or a live refresh token is as good as the account it belongs to, and the only
 * thing standing between one and a response body is a string in an `omit` list — `users/model.ts`
 * passes `omit: ['password', 'tokens']` to `buildTransform`, and that is the entire defence.
 * Adding a field to a schema is a one-line edit; adding it to the `omit` list beside it is a
 * second line nothing asks for. The two are related only by whoever remembers.
 *
 * ── What does NOT protect these fields ────────────────────────────────────────────────────────
 * `select: false`, which both of them carry, is a query default: it keeps a field out of reads
 * that do not ask for it, and does nothing whatever to a document that HAS the value — the login
 * path selects `+password` on purpose, and anything that then serialized that document would
 * publish it. The transform is the layer that holds, which is why this file drives the transform
 * rather than a query.
 *
 * ── Why a live document rather than a source sweep ────────────────────────────────────────────
 * The twin's version reads its API resources as text and looks for credential-shaped property
 * names. That works where each resource lists its fields; here the wire shape is produced by a
 * transform at runtime, so the equivalent question — "can this field reach a client" — is only
 * answerable by asking one. Building the document and calling `toJSON` also covers the way the
 * field could come back: a renamed `omit` entry, a transform replaced, a subdocument added under
 * a parent nobody re-checked.
 *
 * No database is involved. A Mongoose document can be constructed and serialized without a
 * connection; only saving it would need one.
 */

import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import mongoose from 'mongoose';

const MODULES_ROOT = path.join(__dirname, '../../src/modules');

/**
 * Property names that must never reach a client.
 *
 * Shape rather than a list of known fields: the point is to catch the field nobody has added yet.
 * Matched case-insensitively against every key at every depth of the serialized output.
 */
const CREDENTIAL_SHAPE = /password|token|secret|salt|apikey|api_key|credential|privatekey|otp/i;

/**
 * Serialized keys that look credential-shaped and are not.
 *
 * Empty today. An entry needs a reason and a reviewer: the whole value of the rule above is that
 * it fires on things nobody thought about, and every exemption is a small hole in that.
 */
const PUBLISHABLE: { model: string; key: string; because: string }[] = [];

/**
 * Registers every module's schemas, so `mongoose.models` is the whole catalogue.
 *
 * Loaded by path rather than by a list of imports, so a module added tomorrow is swept without
 * editing this file — the same discovery every other cross-cutting sweep uses. `requireActual`
 * rather than a bare `require` because the latter is banned repo-wide, and because a schema must
 * be the real one for its transform to mean anything.
 */
const registerAllModels = (): void => {
    for (const module of readdirSync(MODULES_ROOT)) {
        const model = path.join(MODULES_ROOT, module, 'model.ts');
        if (existsSync(model)) jest.requireActual(model);
    }
};

/**
 * The schema behind a subdocument path, if this path is one.
 *
 * `SchemaType` does not publish `schema` — only the document-array and single-nested subclasses
 * carry it — so the presence check is what narrows a path to a subdocument.
 */
const subSchema = (type: mongoose.SchemaType): mongoose.Schema | undefined =>
    'schema' in type ? type.schema! : undefined;

/** Every schema path whose NAME is credential-shaped, including one level of subdocument. */
const sensitivePaths = (schema: mongoose.Schema): string[] =>
    Object.entries(schema.paths).flatMap(([name, type]) => {
        const nested = Object.keys(subSchema(type)?.paths ?? {}).map((child) => `${name}.${child}`);
        return [name, ...nested].filter((candidate) => CREDENTIAL_SHAPE.test(candidate));
    });

/**
 * Values that fill every credential-shaped path of a schema, and nothing else.
 *
 * Only those paths are set. The rest is left to its defaults, because the question is what happens
 * to a secret that IS present — a field left undefined would be absent from the output for the
 * wrong reason and read as a pass.
 */
const secretValues = (schema: mongoose.Schema): Record<string, unknown> => {
    const values: Record<string, unknown> = {};

    for (const [name, type] of Object.entries(schema.paths)) {
        const nested = subSchema(type);
        if (nested) {
            const secrets = Object.keys(nested.paths).filter((key) => CREDENTIAL_SHAPE.test(key));
            if (secrets.length > 0)
                values[name] = [Object.fromEntries(secrets.map((key) => [key, 'SENSITIVE']))];
            continue;
        }
        if (CREDENTIAL_SHAPE.test(name)) values[name] = 'SENSITIVE';
    }

    return values;
};

/** Every key at every depth of a serialized payload, as dotted paths. */
const keysWithin = (value: unknown, prefix = ''): string[] => {
    if (Array.isArray(value)) return value.flatMap((entry) => keysWithin(entry, prefix));
    if (value === null || typeof value !== 'object') return [];

    return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) => {
        const dotted = prefix ? `${prefix}.${key}` : key;
        return [dotted, ...keysWithin(child, dotted)];
    });
};

const isPublishable = (model: string, key: string): boolean =>
    PUBLISHABLE.some((entry) => entry.model === model && entry.key === key);

describe('credential-shaped fields', () => {
    beforeAll(registerAllModels);

    it('finds the models it means to check', () => {
        // A canary, and the important one here: if no model held a credential-shaped field the
        // sweep below would pass over nothing at all and report a system with no secrets in it.
        expect(Object.keys(mongoose.models).length).toBeGreaterThanOrEqual(8);

        const guarded = Object.values(mongoose.models).filter(
            (model) => sensitivePaths(model.schema).length > 0
        );
        expect(guarded.length).toBeGreaterThanOrEqual(1);
    });

    it('keeps every one of them out of the serialized document', () => {
        /*
         * The whole assertion. `toJSON` is what every controller reaches for — directly, or through
         * the response helpers — so a key surviving here is a key a client can read.
         */
        const leaked = Object.entries(mongoose.models).flatMap(([name, model]) =>
            keysWithin(new model(secretValues(model.schema)).toJSON())
                .filter((key) => CREDENTIAL_SHAPE.test(key.split('.').at(-1)!))
                .filter((key) => !isPublishable(name, key))
                .map((key) => `${name}.${key} reaches the wire`)
        );

        expect(leaked).toEqual([]);
    });

    it('exempts nothing that has since stopped existing', () => {
        // A stale exemption excuses a field name someone may reintroduce for a different reason.
        const stale = PUBLISHABLE.filter(({ model }) => !(model in mongoose.models)).map(
            ({ model, key }) => `${model}.${key}`
        );

        expect(stale).toEqual([]);
    });

    it('gives every exemption a stated reason', () => {
        const unexplained = PUBLISHABLE.filter(({ because }) => because.trim().length < 20).map(
            ({ model, key }) => `${model}.${key}`
        );

        expect(unexplained).toEqual([]);
    });
});
