/**
 * Contract assertions: compares real HTTP responses to `openapi.yaml`.
 *
 * Why not Zod
 * -----------
 * `api/schemas.zod.ts` is generated from the same spec, but it does not do this job here:
 *
 *   1. This repo's schemas are generated non-strict, so they emit `zod.object`, whose default
 *      behaviour is to *strip* unknown keys. `schema.parse(body)` on a response that leaks
 *      `password` passes, having silently deleted the evidence first. (Orval *can* emit
 *      `zod.strictObject` via `override.zod.strict` — the frontend turns it on for its mock
 *      layer — so this is a configuration choice, not a limitation.)
 *   2. More decisively: nothing on this side validates a *response* with Zod at all. The schemas
 *      are used for request bodies. A response never meets them, strict or not.
 *
 * So the whole over-serialization class — the one that produced the `_id`/`__v` exposure, the
 * `password`/`tokens` leak, and the populated `product` on every cart line — is invisible here
 * without `jest-openapi`, which validates against the spec document itself.
 *
 * Zod remains the right tool for field-level checks (types, formats, enums) and for validating
 * request payloads before they are sent. It is simply not an over-serialization guard.
 *
 * Usage:
 *
 *     import '@tests/contract';
 *     expect(response).toSatisfyApiSpec();
 */
import path from 'node:path';
import jestOpenAPI from 'jest-openapi';

jestOpenAPI(path.join(__dirname, '..', '..', 'openapi.yaml'));
