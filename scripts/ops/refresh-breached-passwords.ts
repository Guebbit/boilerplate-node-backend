#!/usr/bin/env tsx
/**
 * @module
 * Rebuild the bundled breached-password list — `npm run refresh:breached-passwords`.
 *
 * Fetches SecLists' `Pwdb_top-10000000` (10M real breached passwords) and filters it through
 * `PasswordNew`'s own pattern, read straight out of the committed root `openapi.yaml` rather than
 * duplicated here — the two must never drift, and the contract is the one place the rule is
 * spelled out. Measured 2026-09-13: the composition rule already rejects 99.8% of the corpus, so
 * the filtered output is small enough to commit (~226 KB, ~20k entries) even though the source is
 * not (94 MB).
 *
 * Run BY HAND, no scheduler: the repo has none, and a top-N breach list changes on the order of
 * years, not days. Re-run it whenever `PasswordNew`'s pattern changes — nothing else notices that
 * the list has silently under-blocked in the meantime.
 *
 * See: docs/theory/defences/authentication.md
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
const OUTPUT_PATH = path.resolve(
    __dirname,
    '../../src/infrastructure/security/breached-passwords/list.txt'
);

/** The committed root bundle, read for its resolved `PasswordNew` schema rather than a fragment. */
const ROOT_CONTRACT_PATH = path.resolve(__dirname, '../../openapi.yaml');

/**
 * The `PasswordNew` composition pattern, straight from the contract.
 *
 * @throws {Error} if the schema is missing or carries no `pattern` — the contract shape changed
 *   in a way this script no longer understands, and guessing a fallback would silently under- or
 *   over-filter the list it produces.
 */
const passwordPatternFromContract = (): RegExp => {
    const document = parse(readFileSync(ROOT_CONTRACT_PATH, 'utf8')) as {
        components?: { schemas?: { PasswordNew?: { pattern?: string } } };
    };
    const pattern = document.components?.schemas?.PasswordNew?.pattern;
    if (!pattern) throw new Error(`PasswordNew.pattern not found in ${ROOT_CONTRACT_PATH}`);
    return new RegExp(pattern);
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
    const text = new TextDecoder().decode(bytes);
    return text.split('\n').map((line) => line.trimEnd());
};

/** Downloads the corpus, filters it to the contract's password shape, and writes the sorted survivors. */
const main = async (): Promise<void> => {
    const pattern = passwordPatternFromContract();
    logger.info({ message: 'Downloading breach corpus.', url: SOURCE_URL });
    const lines = await downloadCorpus();

    const survivors = new Set(lines.filter((line) => line.length > 0 && pattern.test(line)));
    const sorted = [...survivors].toSorted();
    writeFileSync(OUTPUT_PATH, sorted.join('\n') + '\n', 'utf8');

    logger.info({
        message: 'Breached-password list refreshed.',
        source: lines.length,
        survivors: sorted.length,
        output: OUTPUT_PATH
    });
};

// `undefined`: run by hand, no scheduler (see this file's own docblock) — not a
// `docker/crontab` job, so it takes no part in D9's job-health/metric tracking.
void runScript(undefined, main, () => Promise.resolve());
