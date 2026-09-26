/**
 * `fillPlaceholders`/`readEnvironmentValue` — the pure text-level half of `npm run setup`. No
 * filesystem here; `first-run.test.ts` covers the real `.env-example` end to end.
 */
import {
    fillPlaceholders,
    generateSecret,
    readEnvironmentValue
} from '../../../../scripts/setup/environment-file';

describe('fillPlaceholders', () => {
    it('replaces an exact KEY=placeholder line with a generated secret', () => {
        const before = 'NODE_URL=http://localhost:3000\nSECRET=change-me\n';

        const { content, filled } = fillPlaceholders(
            before,
            [{ key: 'SECRET', placeholder: 'change-me' }],
            () => 'a-generated-value'
        );

        expect(content).toBe('NODE_URL=http://localhost:3000\nSECRET=a-generated-value\n');
        expect(filled).toEqual(['SECRET']);
    });

    it('leaves a key already set to a real value untouched', () => {
        const before = 'SECRET=already-a-real-value\n';

        const { content, filled } = fillPlaceholders(
            before,
            [{ key: 'SECRET', placeholder: 'change-me' }],
            () => 'a-generated-value'
        );

        expect(content).toBe(before);
        expect(filled).toEqual([]);
    });

    it('is idempotent — a second pass over its own output changes nothing', () => {
        const before = 'SECRET=change-me\n';
        const keys = [{ key: 'SECRET', placeholder: 'change-me' }];

        const first = fillPlaceholders(before, keys, () => 'a-generated-value');
        const second = fillPlaceholders(first.content, keys, () => 'a-different-value');

        expect(second.content).toBe(first.content);
        expect(second.filled).toEqual([]);
    });

    it('never touches a line that only contains the placeholder as a substring', () => {
        const before = 'SECRET=change-me-but-longer\n';

        const { content, filled } = fillPlaceholders(
            before,
            [{ key: 'SECRET', placeholder: 'change-me' }],
            () => 'a-generated-value'
        );

        expect(content).toBe(before);
        expect(filled).toEqual([]);
    });

    it('fills several keys independently in one pass', () => {
        const before = 'A=change-me\nB=untouched\nC=change-me-too\n';

        const { content, filled } = fillPlaceholders(
            before,
            [
                { key: 'A', placeholder: 'change-me' },
                { key: 'C', placeholder: 'change-me-too' }
            ],
            (key) => `generated-for-${key}`
        );

        expect(content).toBe('A=generated-for-A\nB=untouched\nC=generated-for-C\n');
        expect(filled).toEqual(['A', 'C']);
    });
});

describe('generateSecret', () => {
    it('contains neither the key-ring separator nor the placeholder-list separator', () => {
        const secret = generateSecret();

        expect(secret).not.toContain(',');
        expect(secret).not.toContain(':');
        expect(secret.length).toBeGreaterThanOrEqual(32);
    });

    it('is different every call', () => {
        expect(generateSecret()).not.toBe(generateSecret());
    });
});

describe('readEnvironmentValue', () => {
    it("reads a key's current value", () => {
        expect(readEnvironmentValue('NODE_URL=http://localhost:3000\nSECRET=x\n', 'SECRET')).toBe(
            'x'
        );
    });

    it('returns undefined for a key the file never sets', () => {
        expect(readEnvironmentValue('NODE_URL=http://localhost:3000\n', 'SECRET')).toBeUndefined();
    });

    it('returns undefined for a commented-out key, not the comment line itself', () => {
        expect(readEnvironmentValue('#SECRET=x\n', 'SECRET')).toBeUndefined();
    });
});
