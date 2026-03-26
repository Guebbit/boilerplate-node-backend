import type { IUserDocument } from "@models/users";

/**
 * Extend the Express Request interface to carry the authenticated user.
 * For REST API: populated by JWT middleware (middlewares/authorizations.ts getAuth).
 */
declare module "express" {
    interface Request  {
        user?: IUserDocument
    }
}
