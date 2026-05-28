/**
 * Transport-safe auth context DTO.
 * Decouples HTTP/auth flow from Mongoose document internals.
 * Controllers and middleware should depend on this interface rather than IUserDocument.
 */
export interface IAuthContext {
    id: string;
    email: string;
    username: string;
    admin: boolean;
    imageUrl?: string;
}
