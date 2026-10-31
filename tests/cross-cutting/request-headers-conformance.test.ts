/**
 * The cases the PHP twin's header readers must answer identically:
 * `shared/cases/request-headers.cases.yaml`, run against `preconditionOf` and `requestIdMiddleware`.
 */

import type { Request, Response } from 'express';
import { z } from 'zod';
import { preconditionOf } from '@infrastructure/http/preconditions';
import { requestIdMiddleware } from '@app/request-context';
import { setEnvironment } from '@tests/environment';
import { asStub } from '@tests/stub';
import { caseBase, describeCases } from '@tests/cases';

/** One case; `kind` picks the reader under test. */
const headerCase = z.discriminatedUnion('kind', [
    caseBase.extend({
        kind: z.literal('if-match'),
        header: z.string().optional(),
        expect: z.enum(['unconditional', 'any', 'tags']),
        tags: z.array(z.string()).optional()
    }),
    caseBase.extend({
        kind: z.literal('request-id'),
        header: z.string().optional(),
        trustedIngress: z.boolean(),
        clientRequestId: z.enum(['kept', 'dropped']),
        requestId: z.enum(['client', 'generated'])
    })
]);

/** A request whose only readable header is `name: value`. */
const requestWith = (name: string, value: string | undefined): Request =>
    asStub<Request>({
        get: (asked: string) => (asked.toLowerCase() === name.toLowerCase() ? value : undefined)
    });

describeCases('request-headers', headerCase, (one) => {
    if (one.kind === 'if-match') {
        const precondition = preconditionOf(requestWith('If-Match', one.header), 'row-1');
        const actual =
            precondition === undefined
                ? 'unconditional'
                : precondition.etags === 'any'
                  ? 'any'
                  : 'tags';
        expect(actual).toBe(one.expect);
        if (one.expect === 'tags') expect(precondition?.etags).toEqual(one.tags);
        return;
    }

    setEnvironment({ NODE_TRUSTED_INGRESS: String(one.trustedIngress) });
    const request = requestWith('x-request-id', one.header) as Request & {
        requestId?: string;
        clientRequestId?: string;
    };
    const headers: Record<string, string> = {};
    const response = asStub<Response>({
        setHeader: (name: string, value: string) => {
            headers[name] = value;
        }
    });
    requestIdMiddleware(request, response, () => undefined);

    expect(request.clientRequestId === undefined ? 'dropped' : 'kept').toBe(one.clientRequestId);
    expect(request.requestId === one.header ? 'client' : 'generated').toBe(one.requestId);
    expect(headers['x-request-id']).toBe(request.requestId);
});
