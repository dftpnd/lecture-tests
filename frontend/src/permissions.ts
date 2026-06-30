// Mirrors the backend allowlist (upload_allowed_users); the backend is the real gate.
export const UPLOAD_ALLOWED = ["dft", "li", "Гоша"];

/** Whether a login name may upload videos (and see upload-only content). */
export const canUploadVideos = (name: string) => UPLOAD_ALLOWED.includes(name.trim());
