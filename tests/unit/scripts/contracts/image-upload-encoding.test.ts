/**
 * `withImageUploadEncoding` — the post-bundle step that writes the root's accepted upload types
 * onto every multipart body carrying an `imageUpload` part, then spends the root key.
 *
 * Driven with a minimal bundled document: the property under test is which bodies get stamped
 * and what the step refuses, not any real operation.
 */

import { withImageUploadEncoding } from '../../../../scripts/contracts/image-upload-encoding';
import type { OpenApiDocument } from '../../../../scripts/contracts/openapi-document';
import { asStub } from '@tests/stub';

/** The root list the happy-path cases declare. */
const TYPES = { 'x-image-upload-types': ['image/png', 'image/webp'] };

/** A bundled document with one upload body (by `$ref`), one inline upload body, and one plain multipart body. */
const bundle = (root: Record<string, unknown>) =>
    asStub<OpenApiDocument>({
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

/** Runs the step on a document and returns the document. */
const stamped = (document: OpenApiDocument) => {
    withImageUploadEncoding(document);
    return document;
};

/** The `encoding` of one operation's multipart body. */
const encodingOf = (result: OpenApiDocument, route: string, method: 'post' | 'put') => {
    const body = result.paths?.[route]?.[method]?.requestBody;
    return body && 'content' in body ? body.content['multipart/form-data']?.encoding : undefined;
};

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
        expect(stamped(bundle(TYPES))).not.toHaveProperty('x-image-upload-types');
    });

    it.each([
        ['absent', {}],
        ['empty', { 'x-image-upload-types': [] }],
        ['not strings', { 'x-image-upload-types': [1] }]
    ])('refuses a root list that is %s', (_label, root) => {
        expect(() => withImageUploadEncoding(bundle(root))).toThrow('x-image-upload-types');
    });

    it('refuses a document in which no body carries an upload part', () => {
        const none = asStub<OpenApiDocument>({
            openapi: '3.1.0',
            'x-image-upload-types': ['image/png'],
            paths: {}
        });

        expect(() => withImageUploadEncoding(none)).toThrow('no multipart body');
    });
});
