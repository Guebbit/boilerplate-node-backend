/**
 * @module
 * The command line: defaults, every flag, and each refusal, so the CLI shell can stay untested.
 */

import { isRefusal, parseArguments } from '../../../../scripts/scaffold/options';

describe('parseArguments', () => {
    it('defaults to a foundation module that audits and regenerates', () => {
        expect(parseArguments(['field-notes'])).toEqual({
            name: 'field-notes',
            group: 'foundation',
            summary: 'TODO: one sentence on what field-notes is for.',
            audit: true,
            regenerate: true
        });
    });

    it('reads every flag, values included, without mistaking a value for the name', () => {
        expect(
            parseArguments([
                '--group',
                'shop',
                'boxes',
                '--entity',
                'Box',
                '--summary',
                'Things in boxes.',
                '--no-audit',
                '--no-regenerate'
            ])
        ).toEqual({
            name: 'boxes',
            entity: 'Box',
            group: 'shop',
            summary: 'Things in boxes.',
            audit: false,
            regenerate: false
        });
    });

    it.each([
        [[], /name is required/],
        [['a', 'b'], /Unexpected argument "b"/],
        [['Bad_Name'], /not a usable module name/],
        [['notes', '--entity', 'lower'], /not a PascalCase/],
        [['notes', '--group', 'other'], /"foundation" or "shop"/]
    ])('refuses %j', (argv, message) => {
        const result = parseArguments(argv);

        expect(isRefusal(result)).toBe(true);
        expect(isRefusal(result) && result.error).toMatch(message);
    });
});
