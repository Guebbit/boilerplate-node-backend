/**
 * @module
 * The ISO 11649 "RF" creditor reference `placeOrder` mints for a `bank_transfer` order, and the
 * matching admin-side parse — the code a customer writes into their transfer, read back off the
 * bank's own website. Mod-97 (ISO 7064 MOD 97-10, the same scheme IBAN itself uses) check digits
 * mean a mistyped code is rejected outright rather than silently matching the wrong order.
 *
 * Owned by `orders`, not `payments`: the reference names a row on THIS module's own collection,
 * minted atomically as part of writing it, so a retried write can never mint two different
 * references for the one order it belongs to. `payments`' lookup endpoint imports
 * {@link parseReference} from here to read one back.
 *
 * Hand-rolled rather than a dependency: `ibantools` (`payments`' own IBAN/BIC library) has no
 * ISO 11649 support, and the arithmetic below has no edge case a library would need to absorb —
 * see `docs/modules/payments.md#libraries`.
 *
 * No persistence import on purpose, like every other `domain/` file in this repo: the ObjectId
 * fallback below is recognised by shape (24 hex characters), not by asking Mongoose.
 */

/**
 * Base-36 digits needed to hold any 96-bit value (a MongoDB ObjectId) without truncation —
 * `36**19 > 2**96 > 36**18`. Fixed rather than left to `toString(36)`'s natural length, so every
 * reference is the same size and so the payload can never collide in SHAPE with the 24-character
 * hex fallback `parseReference` also accepts.
 */
const PAYLOAD_LENGTH = 19;

/** `98 - remainder` is always in `[2, 98]` for a mod-97 remainder, so this never needs 3 digits. */
const CHECK_DIGIT_BASE = 98;

/**
 * ISO 7064's letter-to-digit map: `A` = 10 ... `Z` = 35, each contributing exactly two digits —
 * required so the numeric string this produces means the same thing regardless of how many
 * letters preceded a given digit. A single `replaceAll` over the letters, digits untouched, rather
 * than splitting the string apart: this only ever sees the ASCII payload/"RF"/check-digit
 * alphabet, but a per-character split is still how a string mishandles a multi-code-point
 * character, so a regex-only approach avoids the question rather than answering it.
 */
const numericStringFor = (value: string): string =>
    value.replaceAll(/[A-Z]/g, (letter) => String(letter.codePointAt(0)! - 55));

/**
 * ISO 7064 MOD 97-10: the reference's check digits are computed (and later verified) over the
 * payload with "RF" and the check digits themselves appended at the end — never the "RF" + check
 * digits + payload order the reference is actually written in.
 *
 * `BigInt(97)`, not the `97n` literal `unicorn/prefer-bigint-literals` asks for: this repo's
 * `tsconfig.json` targets ES6, and a bigint literal needs ES2020 — see this file's own `ts-check`
 * failure without the call form.
 */
// eslint-disable-next-line unicorn/prefer-bigint-literals -- a literal needs ES2020; tsconfig targets ES6
const MOD97_DIVISOR = BigInt(97);

const remainder97 = (payload: string, checkDigits: string): bigint =>
    BigInt(numericStringFor(`${payload}RF${checkDigits}`)) % MOD97_DIVISOR;

/** The two check digits for a payload — `buildReference`'s own arithmetic, kept for reuse below. */
const computeCheckDigits = (payload: string): string =>
    String(CHECK_DIGIT_BASE - Number(remainder97(payload, '00'))).padStart(2, '0');

/**
 * Mints the RF reference a `bank_transfer` checkout stamps onto its order — deterministic, so it
 * never needs a second write to record, and collision-free by construction: base-36 covers every
 * bit of the id, so two different orders can never mint the same code the way a hash could.
 *
 * @param seed - the order's own id, as 24 hex characters (`Types.ObjectId#toHexString`)
 * @returns the full reference, e.g. `RF132EY8H44VJAVZKX80JRL` — ungrouped; grouping into 4s for
 *   display is the frontend's job, same as `bankTransferIbanFriendly` does for the IBAN
 */
export const buildReference = (seed: string): string => {
    const payload = BigInt(`0x${seed}`).toString(36).toUpperCase().padStart(PAYLOAD_LENGTH, '0');
    return `RF${computeCheckDigits(payload)}${payload}`;
};

/**
 * Whether a normalized string is shaped like a raw ObjectId — never true for a reference
 * `buildReference` minted, since its payload is fixed at {@link PAYLOAD_LENGTH} characters, not
 * 24. What lets `parseReference`'s two branches, and `getOrderByReference`'s two lookups, tell
 * their inputs apart without a second signal.
 */
const looksLikeObjectId = (value: string): boolean => /^[\dA-F]{24}$/.test(value);

/**
 * Reads back what an admin pastes off the bank's own website — an RF reference, or (the
 * pre-existing-order fallback) a raw order id, spaces and case tolerated either way.
 *
 * @param input - the pasted text
 * @returns the normalized reference `getOrderByReference` looks up by, or a lowercase 24-character
 *   ObjectId string for the fallback; `null` when neither shape checks out
 */
export const parseReference = (input: string): string | null => {
    const normalized = input.replaceAll(/\s+/g, '').toUpperCase();

    const structured = /^RF(\d{2})([\dA-Z]{1,21})$/.exec(normalized);
    if (structured) {
        const [, checkDigits, payload] = structured;
        // eslint-disable-next-line unicorn/prefer-bigint-literals -- a literal needs ES2020; tsconfig targets ES6
        return remainder97(payload, checkDigits) === BigInt(1) ? normalized : null;
    }

    return looksLikeObjectId(normalized) ? normalized.toLowerCase() : null;
};
