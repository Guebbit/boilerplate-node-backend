/**
 * @module
 * The upload types a multipart body accepts, declared once at the root and stamped onto every
 * body that carries an `imageUpload` part.
 *
 * OpenAPI 3.1 names this per part: `encoding.<part>.contentType`. Nine request bodies share one
 * answer, so the root holds it as `x-image-upload-types` and this step writes it onto each,
 * instead of nine hand-copied strings that drift. Runs on the bundled document, as a step in `./openapi-bundle`.
 *
 * Why the contract owns it: the list is API surface (a client must know what to send). The byte
 * signatures that verify it are server internals and stay in `shared/rules/images.yaml`.
 *
 * See: docs/tools/image-processing.md
 */

import { stringify as stringifyYaml } from 'yaml';
import { operationsOf, parseOpenApi } from './openapi-document';

/** The multipart part that carries an uploaded image. */
const IMAGE_PART = 'imageUpload';

/** The root's list of accepted upload types, which this step spends. */
interface RootImageTypes {
    'x-image-upload-types'?: unknown;
}

/** Narrows the root's list to a non-empty array of strings. */
const isTypeList = (value: unknown): value is string[] =>
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((item) => typeof item === 'string' && item.length > 0);

/**
 * Stamp `encoding.imageUpload.contentType` onto every multipart body whose schema has an
 * `imageUpload` part, then spend the root key.
 *
 * @param bundled - the bundled OpenAPI document, as YAML
 * @returns the document with the accepted types declared on each upload body
 * @throws Error if the root declares no list, or no body carries an `imageUpload` part
 */
export const withImageUploadEncoding = (bundled: string): string => {
    const document_ = parseOpenApi<RootImageTypes>(bundled);
    const types = document_['x-image-upload-types'];
    if (!isTypeList(types))
        throw new Error('[openapi] the root declares no `x-image-upload-types` list.');

    // OAS 3.1 spells several accepted types as one comma-separated string.
    const contentType = types.join(', ');

    let stamped = 0;
    for (const { operation } of operationsOf(document_)) {
        const body = operation.requestBody;
        const media =
            body !== undefined && 'content' in body
                ? body.content['multipart/form-data']
                : undefined;
        const reference = media?.schema && '$ref' in media.schema ? media.schema.$ref : undefined;
        const schema = reference
            ? document_.components?.schemas?.[reference.replace('#/components/schemas/', '')]
            : media?.schema;
        if (
            !media ||
            !schema ||
            !('properties' in schema) ||
            !schema.properties ||
            !(IMAGE_PART in schema.properties)
        )
            continue;
        media.encoding = { ...media.encoding, [IMAGE_PART]: { contentType } };
        stamped += 1;
    }
    if (stamped === 0)
        throw new Error('[openapi] no multipart body carries an `imageUpload` part to stamp.');

    // Spent: an instruction to this script, not part of the published contract.
    delete document_['x-image-upload-types'];

    // `yaml`'s `stringify`; `lineWidth: 0` turns off line folding, so diffs stay small.
    // https://eemeli.org/yaml/#tostring-options
    return stringifyYaml(document_, { lineWidth: 0 });
};
