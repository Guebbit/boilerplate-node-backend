import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';
import { ACCEPTED_UPLOAD_TYPES } from '@api/upload-types';

/**
 * The accepted upload types, as the published contract declares them.
 *
 * Every multipart body with an `imageUpload` part names the same list in
 * `encoding.imageUpload.contentType`; the generated `ACCEPTED_UPLOAD_TYPES` (which `fileFilter`
 * and the frontend read) is that list.
 */

/** As much of the published contract as this file reads. */
interface Spec {
    paths: Record<
        string,
        Record<
            string,
            {
                requestBody?: {
                    content?: Record<
                        string,
                        { encoding?: Record<string, { contentType?: string }> }
                    >;
                };
            }
        >
    >;
}

/** Every `[operation, contentType]` for a multipart body that declares an `imageUpload` encoding. */
const uploadEncodings = (): [string, string | undefined][] => {
    const spec = parse(readFileSync(path.resolve(__dirname, '../../openapi.yaml'), 'utf8')) as Spec;
    return Object.entries(spec.paths).flatMap(([route, operations]) =>
        Object.entries(operations).flatMap(([method, operation]) => {
            const encoding = operation.requestBody?.content?.['multipart/form-data']?.encoding;
            return encoding
                ? [
                      [`${method.toUpperCase()} ${route}`, encoding.imageUpload?.contentType] as [
                          string,
                          string | undefined
                      ]
                  ]
                : [];
        })
    );
};

describe('upload types in the contract', () => {
    it('is declared on the nine upload bodies', () => {
        expect(uploadEncodings()).toHaveLength(9);
    });

    it.each(uploadEncodings())(
        '%s accepts exactly the generated list',
        (_operation, contentType) => {
            expect(contentType?.split(',').map((type) => type.trim())).toEqual([
                ...ACCEPTED_UPLOAD_TYPES
            ]);
        }
    );

    it('lists canonical types only', () => {
        expect(ACCEPTED_UPLOAD_TYPES).toEqual(['image/png', 'image/jpeg', 'image/webp']);
    });
});
