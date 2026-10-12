/**
 * @module
 * The device label a cookie-mode sign-in stores (`../../session/device-label.ts`): a kind of
 * browser on a kind of system, and nothing finer. The cases are real User-Agent strings, because a
 * parser is only as right as the agents it has been shown.
 */

import { describeDevice } from '@modules/account/session/device-label';

describe('describeDevice', () => {
    it.each([
        [
            'Firefox on Linux',
            'Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0'
        ],
        [
            'Microsoft Edge on Windows',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 Edg/129.0.0.0'
        ],
        [
            'Safari on macOS',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15'
        ],
        [
            'Safari on iOS',
            'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
        ],
        [
            'Chrome on Android',
            'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36'
        ]
    ])('labels a browser as "%s"', (label, userAgent) => {
        expect(describeDevice(userAgent)).toBe(label);
    });

    it('names no version, model or address — a kind of device, never one device', () => {
        const label = describeDevice(
            'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36'
        );

        expect(label).not.toMatch(/\d/);
        expect(label).not.toContain('Pixel');
    });

    it.each([
        ['absent', undefined],
        ['empty', ''],
        ['blank', '   '],
        ['a command-line client', 'curl/8.5.0'],
        ['an API tester', 'PostmanRuntime/7.39.0'],
        ['noise', 'x'.repeat(2000)]
    ])('gives no label for %s: none beats a wrong one', (_name, userAgent) => {
        expect(describeDevice(userAgent)).toBeUndefined();
    });

    it('reads a bounded prefix of a header the caller controls', () => {
        const hostile = `${'a'.repeat(100_000)} Firefox/130.0 (X11; Linux x86_64)`;

        expect(() => describeDevice(hostile)).not.toThrow();
        expect(describeDevice(hostile)).toBeUndefined();
    });
});
