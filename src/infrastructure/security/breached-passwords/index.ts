/**
 * @module
 * Breached-password checks. Two independent rungs, both refusing a password being SET — never
 * one being proved, so never on login, where refusing would just confirm a guess to an attacker
 * and lock out the very user this is meant to help:
 *
 *   1. a bundled list of already-composition-valid, previously-breached passwords, built by
 *      `ops/refresh-breached-passwords.ts`
 *   2. the HIBP k-anonymity range API, for the tail the bundled list misses
 *
 * Both fail OPEN — any failure accepts the password. Rung 3 (a strength meter) lives in the
 * paired frontend only, as advice rather than a gate; nothing here enforces it.
 *
 * See: docs/theory/defences/authentication.md
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { t } from '@infrastructure/i18n';
import { logger } from '@infrastructure/adapters/logger';
import { environmentFlag, environmentNumber } from '@infrastructure/runtime/environment';
import type { ResponseErrorItem } from '@infrastructure/http/response';

/**
 * The bundled list, loaded once at import time. Exact match, case-sensitive — breach corpora are,
 * and `password1!` is a different candidate from `Password1!` to an attacker's tooling too. A few
 * MB of heap for ~20k short strings is not a concern.
 *
 * `__dirname`, not `import.meta.url`: this file is the same whether the entry point is `tsx` or a
 * Jest worker, and `import.meta` is not valid syntax under ts-jest's CommonJS target — same
 * reasoning as `i18n/catalog.ts`'s `LOCALES_DIRECTORY`.
 */
const bundledList = new Set(
    readFileSync(path.join(__dirname, 'list.txt'), 'utf8')
        .split('\n')
        .filter((line) => line.length > 0)
);

/** Rung 1 — the bundled list. No network, no async. */
export const isInBundledBreachList = (password: string): boolean => bundledList.has(password);

/** One line of an HIBP range response, `<35-char-suffix>:<count>`. */
const parseRangeLine = (line: string): { suffix: string; count: number } | undefined => {
    const [suffix, countText] = line.split(':');
    const count = Number(countText);
    return suffix && Number.isFinite(count) ? { suffix, count } : undefined;
};

/**
 * Rung 2 — the HIBP k-anonymity range API. Only the password's SHA-1 prefix (5 hex characters)
 * ever leaves the process; HIBP returns every suffix sharing that prefix and the match happens
 * locally, so HIBP never learns the password or even whether this call matched.
 * `Add-Padding: true` asks HIBP to pad the response so its size can't leak the prefix.
 * https://haveibeenpwned.com/API/v3#PwnedPasswordsPadding
 *
 * Fails OPEN on anything — unreachable, timed out, non-200, malformed — logging instead of
 * throwing: a password service outage must never become a signup outage.
 */
export const checkHibpRange = (
    password: string
): Promise<{ breached: boolean; count?: number }> => {
    const hash = createHash('sha1').update(password).digest('hex').toUpperCase();
    const prefix = hash.slice(0, 5);
    const suffix = hash.slice(5);
    const timeoutMs = environmentNumber('NODE_PASSWORD_BREACH_HIBP_TIMEOUT_MS', 1500, 1);

    return fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
        headers: { 'Add-Padding': 'true' },
        // Bounds the call so a slow HIBP never becomes a slow signup.
        // https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal/timeout_static
        signal: AbortSignal.timeout(timeoutMs)
    })
        .then((response) => {
            if (!response.ok)
                throw new Error(`HIBP range lookup -> HTTP ${String(response.status)}`);
            return response.text();
        })
        .then((body) => {
            const match = body
                .split(/\r?\n/)
                .map((line) => parseRangeLine(line))
                .find((entry) => entry?.suffix === suffix);
            return match ? { breached: true, count: match.count } : { breached: false };
        })
        .catch((error: unknown) => {
            logger.warn({
                message: 'HIBP breach lookup failed; accepting the password (fail open).',
                error: error instanceof Error ? error.message : String(error)
            });
            return { breached: false };
        });
};

/**
 * Both rungs, combined — rung 1 first (fast, no network, short-circuits rung 2 entirely on a
 * hit), rung 2 only when rung 1 misses and the deployment has it enabled. The shared primitive
 * behind both {@link assertPasswordNotBreached} (the enforcing paths) and the advisory endpoint,
 * which is the only caller that reads `count`.
 */
export const checkPasswordBreach = (
    password: string
): Promise<{ breached: boolean; count?: number }> => {
    if (environmentFlag('NODE_PASSWORD_BREACH_LIST', true) && isInBundledBreachList(password))
        return Promise.resolve({ breached: true });

    if (!environmentFlag('NODE_PASSWORD_BREACH_HIBP', false))
        return Promise.resolve({ breached: false });

    return checkHibpRange(password);
};

/**
 * The check every password-SET path calls.
 *
 * Never called on login: refusing a login because the password is breached would lock out the
 * exact user this is meant to help, and confirm the guess to an attacker.
 *
 * @returns the same `ResponseErrorItem[]` shape {@link validatePasswordChange} does — empty when
 *   the password is acceptable. Never says WHICH breach, on either rung.
 */
export const assertPasswordNotBreached = (password: string): Promise<ResponseErrorItem[]> =>
    checkPasswordBreach(password).then(({ breached }) =>
        breached
            ? [
                  {
                      code: 'VALIDATION_ERROR',
                      message: t('account.signup.password-breached'),
                      details: { field: 'password' }
                  }
              ]
            : []
    );
