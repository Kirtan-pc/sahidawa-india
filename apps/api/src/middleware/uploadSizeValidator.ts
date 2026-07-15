import { Request, Response, NextFunction } from "express";

export const MAX_SCAN_FILE_SIZE_BYTES = 10 * 1024 * 1024;

// Configure the parser boundary so the public 10 MiB maximum remains
// inclusive: exactly 10 MiB is accepted, while the next byte is rejected.
export const MULTER_SCAN_FILE_SIZE_CUTOFF_BYTES = MAX_SCAN_FILE_SIZE_BYTES + 1;

// /scan/submit accepts two 10 MiB files. Its multipart metadata and framing must
// fit alongside those files within this separate total-request security ceiling.
export const MAX_SCAN_MULTIPART_BODY_SIZE_BYTES = 25 * 1024 * 1024;

export const validateUploadSize = (req: Request, res: Response, next: NextFunction) => {
    const contentLength = req.headers["content-length"];

    if (!contentLength) {
        res.status(411).json({
            error: "Content-Length header required",
        });
        return;
    }

    const size = parseInt(contentLength, 10);

    if (isNaN(size) || size > MAX_SCAN_MULTIPART_BODY_SIZE_BYTES) {
        res.status(413).json({
            error: `Request body exceeds maximum allowed size of ${MAX_SCAN_MULTIPART_BODY_SIZE_BYTES / 1024 / 1024}MiB`,
            maxSize: MAX_SCAN_MULTIPART_BODY_SIZE_BYTES,
            providedSize: size,
        });
        return;
    }

    next();
};
