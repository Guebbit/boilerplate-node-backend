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
export {
    BACKUP_CODE_COUNT,
    generateBackupCodes,
    generateBackupCodeSalt,
    hashBackupCode,
    hashBackupCodes
} from './backup-codes';
export {
    DELIVERED_CODE_MAX_ATTEMPTS,
    DELIVERED_CODE_RESEND_SECONDS,
    DELIVERED_CODE_TTL_MS,
    armDeliveredCode,
    checkDeliveredCode,
    deliveryCooldownRemaining,
    generateDeliveredCode,
    hashDeliveredCode,
    type DeliveredCodeVerdict
} from './delivered-codes';
export { verifyDeliveredCode } from './delivered-code-verify';
export { MFA_LOCK_MS, MFA_MAX_FAILURES } from './lockout';
export {
    buildOtpauthUri,
    decryptTotpSecret,
    encryptTotpSecret,
    verifyTotpCode,
    type TotpVerification
} from './totp';
