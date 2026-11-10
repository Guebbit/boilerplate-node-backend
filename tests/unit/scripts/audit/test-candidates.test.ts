/**
 * `scripts/audit/test-honesty/eslint.candidates.config.ts` — the one cut the lint gate does not
 * make: a test whose assertions are all weak. The config itself is linted against small inputs.
 */
import { Linter } from 'eslint';
import candidatesConfig from '../../../../scripts/audit/test-honesty/eslint.candidates.config';

/** ESLint's programmatic linter, flat config. https://eslint.org/docs/latest/integrate/nodejs-api#linter */
const linter = new Linter({ configType: 'flat' });

/**
 * Lints a test snippet with the audit's own config.
 *
 * @param code - the source of one test file
 * @returns how many weak-only tests it holds
 */
const weakOnlyTests = (code: string): number =>
    linter.verify(code, candidatesConfig, 'sample.test.ts').filter((m) => m.severity === 1).length;

describe('test-honesty candidates config', () => {
    it.each([
        `it('x', () => { expect(a).toBeDefined(); expect(a.id).toBe(1); });`,
        `it('x', async () => { await expect(p).rejects.toThrow('boom'); await expect(p).rejects.toEqual(e); });`,
        `it('x', async () => { await expect(p).rejects.toEqual(e); });`
    ])('leaves a test with a real assertion alone: %s', (code) => {
        expect(weakOnlyTests(code)).toBe(0);
    });

    it.each([
        `it('x', () => { expect(a).toBeDefined(); });`,
        `test('x', () => { expect(() => f()).not.toThrow(); });`,
        `it('x', async () => { await expect(p).resolves.toBeTruthy(); });`
    ])('lists a test whose only assertion is weak: %s', (code) => {
        expect(weakOnlyTests(code)).toBe(1);
    });
});
