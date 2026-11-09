/**
 * `http/preconditions` — reading `If-Match`, and stamping `ETag`. The header's grammar is RFC 9110
 * §13.1.1; what matters here is that anything unparseable can never match, so a garbled header
 * is refused rather than silently ignored.
 */
import { asStub } from '@tests/stub';
import type { Request, Response } from 'express';
import {
    answerAsResource,
    dropUnownedValidators,
    keepEtag,
    preconditionOf,
    setEtag
} from '@infrastructure/http/preconditions';

/** A request carrying this `If-Match` (or none). */
const requestWith = (ifMatch?: string) =>
    asStub<Request>({ get: (name: string) => (name === 'If-Match' ? ifMatch : undefined) });

describe('preconditionOf', () => {
    it('is undefined without the header: the write stays unconditional', () => {
        expect(preconditionOf(requestWith(), 'a')).toBeUndefined();
    });

    it('reads one tag', () => {
        expect(preconditionOf(requestWith('"123"'), 'a')).toEqual({ id: 'a', etags: ['"123"'] });
    });

    it('reads a list, trimming the gaps and keeping the weak prefix', () => {
        expect(preconditionOf(requestWith('"1" , W/"2",  "3"'), 'a')).toEqual({
            id: 'a',
            etags: ['"1"', 'W/"2"', '"3"']
        });
    });

    it('reads `*` as any version', () => {
        expect(preconditionOf(requestWith(' * '), 'a')).toEqual({ id: 'a', etags: 'any' });
    });

    it.each(['123', '"1', '"1" "2"', '"1",', 'W/1', '*, "1"', ''])(
        'gives %p an empty tag list, which nothing matches',
        (header) => {
            expect(preconditionOf(requestWith(header), 'a')).toEqual({ id: 'a', etags: [] });
        }
    );
});

/** A response whose `json` and `setHeader` are recorded; `sent` is what the original `json` got. */
const makeResponse = (headers: Record<string, string> = {}) => {
    const setHeader = jest.fn();
    const json = jest.fn();
    const response = asStub<Response>({ setHeader, json, req: { headers } });
    return { setHeader, json, response };
};

describe('setEtag', () => {
    it('stamps "<edit counter>.<digest of the body>" when json runs', () => {
        const { response, setHeader } = makeResponse();

        setEtag(response, { editRevision: 12 });
        expect(setHeader).not.toHaveBeenCalled();
        response.json({ a: 1 });

        expect(setHeader).toHaveBeenCalledWith('ETag', expect.stringMatching(/^"12\.[\w-]{16}"$/));
    });

    it('sets the header before the body is sent, so Express keeps it', () => {
        const order: string[] = [];
        const setHeader = jest.fn(() => order.push('header'));
        const json = jest.fn(() => order.push('json'));
        const response = asStub<Response>({ setHeader, json, req: { headers: {} } });

        setEtag(response, { editRevision: 1 });
        response.json({});

        expect(order).toEqual(['header', 'json']);
    });

    it('moves the digest with the body but keeps the edit part', () => {
        const { response, setHeader } = makeResponse();
        setEtag(response, { editRevision: 3 });

        response.json({ stock: 1 });
        response.json({ stock: 2 });

        const [first, second] = setHeader.mock.calls.map((call) => String(call[1]));
        expect(first).not.toBe(second);
        expect(first?.split('.', 1)[0]).toBe(second?.split('.', 1)[0]);
    });

    it('leaves If-None-Match for Express to evaluate', () => {
        const { response } = makeResponse({ 'if-none-match': '"12.x"' });

        setEtag(response, { editRevision: 12 });
        response.json({});

        expect(response.req.headers).toHaveProperty('if-none-match');
    });

    it('sends nothing for a row with no version', () => {
        const { response, setHeader, json } = makeResponse();
        const original = response.json;

        setEtag(response, { title: 'no counter', updatedAt: new Date(1_700_000_000_000) });
        response.json({});

        expect(response.json).toBe(original);
        expect(setHeader).not.toHaveBeenCalled();
        expect(json).toHaveBeenCalledWith({});
    });
});

/** A response whose head has not been written yet, plus what the head write forwards to. */
const headOf = (method = 'POST') => {
    const written = jest.fn();
    const removeHeader = jest.fn();
    const setHeader = jest.fn();
    const response = asStub<Response>({
        writeHead: written,
        removeHeader,
        setHeader,
        json: jest.fn(),
        req: { method, headers: {} }
    });
    return { response, written, removeHeader, setHeader, request: asStub<Request>({ method }) };
};

describe('answerAsResource', () => {
    it('stamps the real tag and names the resource on a write answer', () => {
        const { response, setHeader } = headOf('POST');

        answerAsResource(response, { editRevision: 4 }, '/users/u1');
        response.json({ a: 1 });

        expect(setHeader).toHaveBeenCalledWith('Content-Location', '/users/u1');
        expect(setHeader).toHaveBeenCalledWith('ETag', expect.stringMatching(/^"4\.[\w-]{16}"$/));
    });

    it.each(['GET', 'HEAD'])('names no resource on a %s: its own URI is the resource', (method) => {
        const { response, setHeader } = headOf(method);

        answerAsResource(response, { editRevision: 4 }, '/users/u1');

        expect(setHeader).not.toHaveBeenCalledWith('Content-Location', expect.anything());
    });

    it('answers a row with no version untagged and without a Content-Location', () => {
        const { response, setHeader } = headOf('POST');

        answerAsResource(response, { title: 'no counter' }, '/things/t1');
        response.json({});

        expect(setHeader).not.toHaveBeenCalled();
    });
});

describe('dropUnownedValidators', () => {
    it('strips both validators when a PUT answer writes its head, then writes it', () => {
        const { request, response, written, removeHeader } = headOf('PUT');

        dropUnownedValidators(request, response, jest.fn());
        response.writeHead(200);

        expect(removeHeader.mock.calls).toEqual([['ETag'], ['Last-Modified']]);
        expect(written).toHaveBeenCalledTimes(1);
        expect(written).toHaveBeenCalledWith(200);
    });

    it('strips a PUT answer tag even when the API made it', () => {
        const { request, response, removeHeader } = headOf('PUT');

        dropUnownedValidators(request, response, jest.fn());
        keepEtag(response);
        response.writeHead(200);

        expect(removeHeader).toHaveBeenCalledWith('ETag');
    });

    it.each(['POST', 'PATCH', 'DELETE'])("strips Express's own tag from a %s answer", (method) => {
        const { request, response, removeHeader } = headOf(method);

        dropUnownedValidators(request, response, jest.fn());
        response.writeHead(200);

        expect(removeHeader.mock.calls).toEqual([['ETag']]);
    });

    it.each(['POST', 'PATCH', 'DELETE'])('keeps the tag the API made on a %s answer', (method) => {
        const { request, response, removeHeader } = headOf(method);

        dropUnownedValidators(request, response, jest.fn());
        setEtag(response, { editRevision: 2 });
        response.writeHead(200);

        expect(removeHeader).not.toHaveBeenCalled();
    });

    it('keeps a tag marked with keepEtag, as an idempotent replay does', () => {
        const { request, response, removeHeader } = headOf('POST');

        dropUnownedValidators(request, response, jest.fn());
        keepEtag(response);
        response.writeHead(201);

        expect(removeHeader).not.toHaveBeenCalled();
    });

    it.each(['GET', 'HEAD'])('leaves a %s answer alone', (method) => {
        const { request, response, removeHeader } = headOf(method);
        const head = response.writeHead;

        dropUnownedValidators(request, response, jest.fn());

        expect(response.writeHead).toBe(head);
        expect(removeHeader).not.toHaveBeenCalled();
    });

    it('always continues the chain', () => {
        const next = jest.fn();
        const { request, response } = headOf('PUT');

        dropUnownedValidators(request, response, next);

        expect(next).toHaveBeenCalledWith();
    });
});
