/**
 * `createApp({ env })` — the environment an app is built with, handed in rather than set on
 * `process.env`. The subject: an injected value is what the config slices read, it goes through the
 * real boot gate, and `process.env` itself is never touched.
 */
import { createApp } from '../../src/app';
import { appConfig } from '@app/config';

describe('createApp({ env })', () => {
    it('makes the injected value what the app slice reads', () => {
        createApp({ env: { NODE_JSON_BODY_LIMIT: '7kb' } });

        expect(appConfig().NODE_JSON_BODY_LIMIT).toBe('7kb');
    });

    it('leaves process.env alone', () => {
        createApp({ env: { NODE_JSON_BODY_LIMIT: '8kb' } });

        expect(process.env.NODE_JSON_BODY_LIMIT).not.toBe('8kb');
    });

    it('refuses to build on an injected value the parser refuses', () => {
        expect(() => createApp({ env: { NODE_HTTP_HEADERS_TIMEOUT_MS: 'soon' } })).toThrow(
            /NODE_HTTP_HEADERS_TIMEOUT_MS/
        );
    });

    it('unsets a variable when it is injected as undefined', () => {
        createApp({ env: { NODE_JSON_BODY_LIMIT: undefined } });

        expect(appConfig().NODE_JSON_BODY_LIMIT).toBe('100kb');
    });
});
