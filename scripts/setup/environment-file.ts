/**
 * @module
 * Pure text-level operations on a dotenv file: filling only lines that still read exactly
 * `KEY=<placeholder>`, and reading one key's current value back out. No filesystem access here —
 * `scripts/setup/index.ts` owns reading, writing (temp file + rename, mode 0600) and copying
 * `.env-example` on first run.
 */

import { randomBytes } from 'node:crypto';
import type { FillableKey } from './required-keys';

/** A fresh secret with no `,` or `:` — the key-ring separators a filled value must never contain. */
export const generateSecret = (): string => randomBytes(32).toString('hex');

/** What one fill pass did to a dotenv file's text. */
export interface FillResult {
    /** The content, with every matched placeholder line replaced. */
    content: string;
    /** Keys whose line actually changed, in the order `keys` were given. */
    filled: string[];
}

/**
 * Replaces every `KEY=placeholder` line — an EXACT match, not a substring — with a freshly
 * generated secret. A key whose current value differs (already filled, or set to something else
 * entirely) is left untouched: this only ever moves a placeholder OUT, never a real value in. That
 * also makes a second run a no-op on its own — nothing still reads a placeholder to replace.
 *
 * @param secretOf - overridden in tests for a deterministic value; `generateSecret` otherwise
 */
export const fillPlaceholders = (
    content: string,
    keys: readonly FillableKey[],
    secretOf: (key: string) => string = generateSecret
): FillResult => {
    const filled: string[] = [];
    let lines = content.split('\n');

    for (const { key, placeholder } of keys) {
        const target = `${key}=${placeholder}`;
        if (!lines.includes(target)) continue;

        lines = lines.map((line) => (line === target ? `${key}=${secretOf(key)}` : line));
        filled.push(key);
    }

    return { content: lines.join('\n'), filled };
};

/** `KEY`'s current value in a dotenv file's text, or `undefined` when the line is absent/commented. */
export const readEnvironmentValue = (content: string, key: string): string | undefined =>
    content
        .split('\n')
        .find((line) => line.startsWith(`${key}=`))
        ?.slice(key.length + 1);
