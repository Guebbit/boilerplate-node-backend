/**
 * @module
 * `bodyOf(res, Schema)`: a journey step's response, read through the schema the spec gives its
 * status. The status is asserted, the body is parsed, and what comes back is typed from the
 * schema, so a field a journey reads that the contract does not declare fails to compile.
 */
import * as zod from 'zod';
import * as responseSchemas from '@api/schemas.zod';

/**
 * Every per-status response schema, with the status its own name ends in.
 *
 * `Login200Response` stands for 200. The generator names each schema after its status, so the
 * name is the one place the status is written down.
 */
const STATUS_BY_SCHEMA: ReadonlyMap<unknown, number> = new Map(
    Object.entries({ ...responseSchemas }).flatMap(([name, schema]) => {
        const status = /(\d{3})Response$/.exec(name)?.[1];
        return status === undefined ? [] : [[schema, Number(status)] as const];
    })
);

/**
 * Asserts a response has the status `schema` stands for, and returns its body parsed by it.
 *
 * @param response - a supertest response: its status and parsed body
 * @param schema - a per-status response schema from `@api/schemas.zod` (`Login200Response`)
 * @returns the body, typed from the schema
 * @throws {Error} when the schema is not a per-status response schema, the status differs, or the
 *   body does not fit
 */
export const bodyOf = <TSchema extends zod.ZodType>(
    response: { status: number; body: unknown },
    schema: TSchema
): zod.infer<TSchema> => {
    const expected = STATUS_BY_SCHEMA.get(schema);
    if (expected === undefined)
        throw new Error('bodyOf takes a per-status response schema, such as Login200Response');
    if (response.status !== expected)
        throw new Error(
            `expected ${String(expected)}, got ${String(response.status)}: ${JSON.stringify(response.body)}`
        );

    return schema.parse(response.body);
};
