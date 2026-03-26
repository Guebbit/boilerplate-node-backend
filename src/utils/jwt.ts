import { verify } from "jsonwebtoken";

/**
 * Verify and decode a JWT access token, returning its payload.
 * Returns a fallback object with a non-existent ObjectId when the token
 * is invalid or expired, so that `findById` returns null and `getAuth`
 * gracefully skips populating `req.user`.
 *
 * @param token
 */
export const getTokenData = (token: string): { id: string } => {
    try {
        return verify(token, process.env.NODE_ACCESS_TOKEN_SECRET ?? "") as { id: string };
    } catch {
        // Invalid signature or expired token — return a zero ObjectId that will
        // never match a real document, so req.user is left unset.
        return { id: '000000000000000000000000' };
    }
};
