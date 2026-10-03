/**
 * `http/preconditions` — reading `If-Match`, and stamping `ETag`. The header's grammar is RFC 9110
 * §13.1.1; what matters here is that anything unparseable can never match, so a garbled header
 * is refused rather than silently ignored.
 */
import { asStub } from '@tests/stub';
import type { Request, Response } from 'express';
import { preconditionOf, setEtag } from '@infrastructure/http/preconditions';

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

/** A response that records the headers set on it, and whose request carries `headers`. */
const makeResponse = (headers: Record<string, string> = {}) => {
    const setHeader = jest.fn();
    return { setHeader, response: asStub<Response>({ setHeader, req: { headers } }) };
};

describe('setEtag', () => {
    it('stamps the quoted edit counter', () => {
        const { response, setHeader } = makeResponse();

        setEtag(response, { editRevision: 12 });

        expect(setHeader).toHaveBeenCalledWith('ETag', '"12"');
    });

    it('never answers 304 from it: If-None-Match is dropped from the request', () => {
        const { response } = makeResponse({ 'if-none-match': '"12"' });

        setEtag(response, { editRevision: 12 });

        expect(response.req.headers).not.toHaveProperty('if-none-match');
    });

    it('sends nothing for a row with no version, and leaves If-None-Match alone', () => {
        const { response, setHeader } = makeResponse({ 'if-none-match': '"x"' });

        setEtag(response, { title: 'no counter', updatedAt: new Date(1_700_000_000_000) });

        expect(setHeader).not.toHaveBeenCalled();
        expect(response.req.headers).toHaveProperty('if-none-match');
    });
});
