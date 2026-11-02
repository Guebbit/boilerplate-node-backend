/**
 * `withCookieAuth` — the post-bundle step that gives every bearer operation its cookie
 * alternative, and the origin `403` on the unsafe ones. Takes the parsed document and edits it.
 */

import { withCookieAuth } from '../../../../scripts/contracts/cookie-auth';
import { parseOpenApi } from '../../../../scripts/contracts/openapi-document';

/** A document with one operation per case below. */
const DOCUMENT = `
paths:
  /things:
    get:
      security: [{ bearerAuth: [] }]
      responses: { '200': { description: ok } }
    post:
      security: [{ bearerAuth: [] }]
      responses: { '201': { description: made } }
    delete:
      security: [{ bearerAuth: [] }, { apiKeyAuth: [] }]
      responses: { '403': { description: own refusal } }
  /public:
    post:
      security: []
      responses: { '200': { description: ok } }
  /stream:
    get:
      security: [{ cookieAuth: [] }]
      responses: { '200': { description: ok } }
`;

/** Parses the fixture, runs the step on it and returns the edited document. */
const run = () => {
    const document = parseOpenApi(DOCUMENT);
    withCookieAuth(document);
    return document;
};

describe('withCookieAuth', () => {
    it('adds the cookie as one more alternative beside the bearer', () => {
        expect(run().paths?.['/things']?.get?.security).toEqual([
            { bearerAuth: [] },
            { cookieAuth: [] }
        ]);
    });

    it('keeps every alternative the operation already had', () => {
        expect(run().paths?.['/things']?.delete?.security).toEqual([
            { bearerAuth: [] },
            { apiKeyAuth: [] },
            { cookieAuth: [] }
        ]);
    });

    it('declares the origin 403 on an unsafe method, and on no safe one', () => {
        const { paths } = run();

        expect(paths?.['/things']?.post?.responses).toHaveProperty('403');
        expect(paths?.['/things']?.get?.responses).not.toHaveProperty('403');
    });

    it('never overwrites a 403 the operation declared itself', () => {
        expect(run().paths?.['/things']?.delete?.responses?.['403']).toEqual({
            description: 'own refusal'
        });
    });

    it('leaves a public operation and a cookie-only one as they were', () => {
        const { paths } = run();

        expect(paths?.['/public']?.post?.security).toEqual([]);
        expect(paths?.['/public']?.post?.responses).not.toHaveProperty('403');
        expect(paths?.['/stream']?.get?.security).toEqual([{ cookieAuth: [] }]);
    });
});
