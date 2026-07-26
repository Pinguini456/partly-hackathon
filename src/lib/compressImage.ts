// Phone cameras produce 3-8MB photos and the host caps a request body at
// 4.5MB, so an untouched walkaround photo fails to upload in production
// while working perfectly on a dev machine with no such limit.
//
// Downscaling in the browser fixes both the storage upload and the analysis
// request in one place. 1920px on the long edge is well above what the plate
// reader and the damage model need, and takes a typical phone photo from
// ~4MB to ~400KB.

const MAX_EDGE = 1920;
const QUALITY = 0.82;
/** Anything under this is already fine — don't spend time or lose quality. */
const SKIP_BELOW_BYTES = 1_000_000;

export async function compressImage(file: File): Promise<File> {
    if (!file.type.startsWith("image/") || file.size < SKIP_BELOW_BYTES) return file;

    try {
        const bitmap = await createImageBitmap(file);
        const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));

        // Already small enough in dimensions but heavy in bytes — still worth
        // re-encoding, so don't bail out on scale === 1.
        const width = Math.round(bitmap.width * scale);
        const height = Math.round(bitmap.height * scale);

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) return file;
        ctx.drawImage(bitmap, 0, 0, width, height);
        bitmap.close();

        const blob = await new Promise<Blob | null>((resolve) =>
            canvas.toBlob(resolve, "image/jpeg", QUALITY),
        );
        if (!blob || blob.size >= file.size) return file;

        return new File([blob], file.name.replace(/\.(png|heic|heif|webp)$/i, ".jpg"), {
            type: "image/jpeg",
            lastModified: file.lastModified,
        });
    } catch {
        // Compression is an optimisation, not a gate — if the browser can't
        // decode it, send the original and let the server decide.
        return file;
    }
}

export async function compressImages(files: File[]): Promise<File[]> {
    return Promise.all(files.map(compressImage));
}
