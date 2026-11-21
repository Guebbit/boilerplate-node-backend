#!/usr/bin/env tsx
/**
 * @module
 * Rebuild the bundled breached-password list — `npm run refresh:breached-passwords`.
 *
 * Fetches SecLists' `Pwdb_top-10000000` (10M real breached passwords, most common first) and
 * keeps the first `LIST_LIMIT` distinct lines whose length fits `PasswordNew`'s `minLength` and
 * `maxLength`, read straight out of the bundled root `openapi.yaml` rather than duplicated
 * here. There is no composition filter: the rule is length only, so the list is every common
 * password the rule would accept, and the limit is what bounds its size.
 *
 * Run BY HAND, never scheduled: a top-N breach list changes on the order of years, not days.
 * Re-run it whenever `PasswordNew`'s length bounds change.
 *
 * Twin: the PHP backend's `RefreshBreachedPasswords` command reads the corpus the same way
 * (split on `\n`, strip a trailing `\r`, count code points) and must produce the same bytes.
 *
 * @see docs/understand/defences/authentication.md#guessing-the-credential
 */
import '@infrastructure/config/dotenv';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';
import { logger } from '@infrastructure/adapters/logger';
import { runScript } from '../run-script';
import { assertCorpusDigest } from './corpus-digest';

/**
 * The SecLists commit the corpus is read from. A commit SHA, not `master`: the bytes behind this
 * URL can never change, so a moved or poisoned branch cannot reach the committed list.
 */
const SOURCE_COMMIT = '12274c98fdebe98c7a7284914436a472ed469aed';

/** Source corpus: real breached passwords, largest list SecLists publishes, at `SOURCE_COMMIT`. */
const SOURCE_URL = `https://raw.githubusercontent.com/danielmiessler/SecLists/${SOURCE_COMMIT}/Passwords/Common-Credentials/Pwdb_top-10000000.txt`;

/**
 * SHA-256 of the corpus at `SOURCE_COMMIT`, checked before anything is filtered.
 * Bumping the commit means re-computing this: `curl -sL <url> | sha256sum`.
 */
const SOURCE_SHA256 = '18dc49ca32b62455a61e3398f4ab9f93eb700ff142fa0d4b9fd11a727f3b80e4';

/** Where the filtered, committable list lives — loaded once at boot into a `Set`. */
const OUTPUT_PATH = path.resolve(__dirname, '../../shared/rules/breached-passwords.txt');

/** The bundled root contract (generated, gitignored), read for its resolved `PasswordNew` schema rather than a fragment. */
const ROOT_CONTRACT_PATH = path.resolve(__dirname, '../../openapi.yaml');

/** How many distinct passwords the list keeps — the corpus is frequency-ordered, so this is the top N. */
const LIST_LIMIT = 20_000;

/**
 * `PasswordNew`'s length bounds, straight from the contract.
 *
 * @throws {TypeError} if the schema is missing or carries no numeric `minLength` and `maxLength` — the
 *   contract shape changed in a way this script no longer understands, and guessing a fallback
 *   would silently under- or over-filter the list it produces.
 */
const passwordBoundsFromContract = (): { min: number; max: number } => {
    // Narrowing a parsed YAML `unknown`: the `typeof` checks below prove both bounds are numbers.
    const document = parse(readFileSync(ROOT_CONTRACT_PATH, 'utf8')) as {
        components?: { schemas?: { PasswordNew?: { minLength?: unknown; maxLength?: unknown } } };
    };
    const schema = document.components?.schemas?.PasswordNew;
    if (typeof schema?.minLength !== 'number' || typeof schema.maxLength !== 'number')
        throw new TypeError(`PasswordNew.minLength/maxLength not found in ${ROOT_CONTRACT_PATH}`);
    return { min: schema.minLength, max: schema.maxLength };
};

/**
 * Downloads the source corpus and returns it as a list of lines.
 *
 * @throws {Error} on a non-200 response or a digest mismatch — a partial, missing or altered corpus
 *   must fail loudly, never silently ship a truncated or poisoned list
 */
const downloadCorpus = async (): Promise<string[]> => {
    const response = await fetch(SOURCE_URL);
    if (!response.ok) throw new Error(`${SOURCE_URL} -> HTTP ${String(response.status)}`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    assertCorpusDigest(bytes, SOURCE_SHA256, SOURCE_URL);
    // `fatal`: a byte sequence that is not UTF-8 throws instead of becoming U+FFFD in the list.
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    // Only a trailing carriage return goes — other trailing whitespace is part of a password.
    return text.split('\n').map((line) => line.replace(/\r$/, ''));
};

/** Downloads the corpus, keeps the first `LIST_LIMIT` distinct in-bounds lines, and writes them sorted. */
const main = async (): Promise<void> => {
    const { min, max } = passwordBoundsFromContract();
    logger.info({ message: 'Downloading breach corpus.', url: SOURCE_URL });
    const lines = await downloadCorpus();

    const survivors = new Set<string>();
    let linesRead = 0;
    for (const line of lines) {
        linesRead++;
        // Code points, not UTF-16 units: the contract's `maxLength` counts characters, and the
        // PHP twin's `mb_strlen` does the same. Grapheme clusters would not match it.
        // eslint-disable-next-line @typescript-eslint/no-misused-spread -- code points are the point
        const { length } = [...line];
        if (length >= min && length <= max) survivors.add(line);
        if (survivors.size >= LIST_LIMIT) break;
    }
    const sorted = [...survivors].toSorted();
    writeFileSync(OUTPUT_PATH, sorted.join('\n') + '\n', 'utf8');

    logger.info({
        message: 'Breached-password list refreshed.',
        linesRead,
        kept: sorted.length,
        output: OUTPUT_PATH
    });
};

/**
 * `undefined`: run by hand, no scheduler (see this file's own docblock) — not a
 * `docker/crontab` job, so it takes no part in the job-health/metric tracking.
 */
// eslint-disable-next-line @typescript-eslint/no-floating-promises -- runScript never rejects (failure is reported via process.exitCode)
void runScript(undefined, main, () => Promise.resolve());
