/**
 * @module
 * The two-factor barrel: the registry the services drive, and the pure crypto helpers the unit
 * suites and the admin recovery path reach for directly.
 */

export {
    availableTwoFactorMethods,
    orderedEntries,
    twoFactorMethod,
    type MethodEligibility,
    type TwoFactorMethodHandler
} from './registry';
export { BACKUP_CODE_COUNT, generateBackupCodes, hashBackupCode } from './backup-codes';
export {
    DELIVERED_CODE_MAX_ATTEMPTS,
    DELIVERED_CODE_RESEND_SECONDS,
    DELIVERED_CODE_TTL_MS,
    armDeliveredCode,
    clearDeliveredCode,
    consumeDeliveredCode,
    deliveryCooldownRemaining,
    generateDeliveredCode,
    hashDeliveredCode
} from './delivered-codes';
export {
    buildOtpauthUri,
    decryptTotpSecret,
    encryptTotpSecret,
    generateTotpSecret,
    verifyTotpCode,
    type TotpVerification
} from './totp';
