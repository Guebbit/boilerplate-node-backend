/**
 * A `CallerContext` fixture for unit tests that call a service function directly, bypassing the
 * controller that would otherwise build one from the request. Anonymous by default — most tests
 * calling a service directly don't care who the caller is, only that the emit doesn't throw for
 * lack of one.
 */
import type { CallerContext } from '@infrastructure/http/request';

export const testCallerContext: CallerContext = { caller: {}, analyticsConsent: false };
