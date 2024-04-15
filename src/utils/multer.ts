import { Request } from 'express';
import multer, { FileFilterCallback } from 'multer';
import { randomBytes } from "crypto";


/**
 * Get extension of filename
 *
 * @param filename
 */
export function getExtension(filename: string){
    return filename.substring(filename.lastIndexOf('.')+1, filename.length) || filename;
}

/**
 * Manage file storage
 */
export const fileStorage = multer.diskStorage({

    /**
     * Write file into destination
     * WARNING: Do not upload all files in a single directory. Create subdirectories with a maximum number of files?
     *
     * @param req
     * @param file
     * @param callback
     */
    destination: (
        req: Request,
        file: Express.Multer.File,
        callback: (error: Error | null, destination: string) => void
    ) => {
        if (file.fieldname === "imageUpload")
            callback(null, 'public/images/');
        // if (file.fieldname === "pdfUpload")
        //     callback(null, 'src/uploads/');
    },

    /**
     * Change file name
     *
     * @param req
     * @param file
     * @param callback
     */
    filename: (
        req: Request,
        file: Express.Multer.File,
        callback: (error: Error | null, filename: string) => void
    ) => {
        // randomize name for security reason
        callback(null, randomBytes(16).toString('hex') + "." + getExtension(file.originalname));
    }
})

/**
 * Whitelist for file type
 *
 * @param req
 * @param file
 * @param callback
 */
export const fileFilter = (
    req: Request,
    file: Express.Multer.File,
    callback: FileFilterCallback
): void =>
    (
        file.mimetype === 'image/png' ||
        file.mimetype === 'image/jpg' ||
        file.mimetype === 'image/jpeg'
    ) ?
        callback(null, true) :
        callback(null, false)

/**
 * Multer middleware
 */
export default multer({
    storage: fileStorage,
    fileFilter
});