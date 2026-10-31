/**
 * `withImageUploadEncoding` — the post-bundle step that writes the root's accepted upload types
 * onto every multipart body carrying an `imageUpload` part, then spends the root key.
 *
 * Driven with a minimal bundled document: the property under test is which bodies get stamped
 * and what the step refuses, not any real operation.
 */

import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { withImageUploadEncoding } from '../../../../scripts/contracts/image-upload-encoding';

/** The shape the assertions read back out of the stamped document. */
interface Stamped {
    'x-image-upload-types'?: unknown;
    paths: Record<
        string,
        Record<string, { requestBody: { content: Record<string, { encoding?: unknown }> } }>
    >;
}

/** The root list the happy-path cases declare. */
const TYPES = { 'x-image-upload-types': ['image/png', 'image/webp'] };

/** A bundled document with one upload body (by `$ref`), one inline upload body, and one plain multipart body. */
const bundle = (root: Record<string, unknown>) =>
    stringifyYaml({
        openapi: '3.1.0',
        ...root,
        paths: {
            '/refs': {
                post: {
                    requestBody: {
                        content: {
                            'multipart/form-data': {
                                schema: { $ref: '#/components/schemas/WithImage' }
                            }
                        }
                    }
                }
            },
            '/inline': {
                put: {
                    requestBody: {
                        content: {
                            'multipart/form-data': {
                                schema: { properties: { imageUpload: { type: 'string' } } }
                            }
                        }
                    }
                }
            },
            '/plain': {
                post: {
                    requestBody: {
                        content: {
                            'multipart/form-data': {
                                schema: { $ref: '#/components/schemas/WithoutImage' }
                            }
                        }
                    }
                }
            }
        },
        components: {
            schemas: {
                WithImage: { properties: { imageUpload: { type: 'string', format: 'binary' } } },
                WithoutImage: { properties: { name: { type: 'string' } } }
            }
        }
    });

/** The stamped result, parsed. */
const stamped = (yaml: string) => parseYaml(withImageUploadEncoding(yaml)) as Stamped;

/** The `encoding` of one operation's multipart body. */
const encodingOf = (result: Stamped, route: string, method: string) =>
    result.paths[route]?.[method]?.requestBody.content['multipart/form-data']?.encoding;

describe('withImageUploadEncoding', () => {
    it('stamps the types, comma-separated, onto a body whose schema is a $ref to an upload', () => {
        expect(encodingOf(stamped(bundle(TYPES)), '/refs', 'post')).toEqual({
            imageUpload: { contentType: 'image/png, image/webp' }
        });
    });

    it('stamps a body whose schema is declared inline', () => {
        expect(encodingOf(stamped(bundle(TYPES)), '/inline', 'put')).toEqual({
            imageUpload: { contentType: 'image/png, image/webp' }
        });
    });

    it('leaves a multipart body with no imageUpload part alone', () => {
        expect(encodingOf(stamped(bundle(TYPES)), '/plain', 'post')).toBeUndefined();
    });

    it('drops the root key once spent', () => {
        expect(stamped(bundle(TYPES))['x-image-upload-types']).toBeUndefined();
    });

    it.each([
        ['absent', {}],
        ['empty', { 'x-image-upload-types': [] }],
        ['not strings', { 'x-image-upload-types': [1] }]
    ])('refuses a root list that is %s', (_label, root) => {
        expect(() => withImageUploadEncoding(bundle(root))).toThrow('x-image-upload-types');
    });

    it('refuses a document in which no body carries an upload part', () => {
        const none = stringifyYaml({
            openapi: '3.1.0',
            'x-image-upload-types': ['image/png'],
            paths: {}
        });

        expect(() => withImageUploadEncoding(none)).toThrow('no multipart body');
    });
});
