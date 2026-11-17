/**
 * Research notes and hand-written lines stay in the code but leave the public page
 * (docs/ATLAS-UI.md, section 6). This is a build-time switch until an admin account
 * exists, so the text is hidden from readers, not secret: it still ships in the bundle.
 * Set NEXT_PUBLIC_SHOW_NOTES=1 to build a copy that shows them.
 */
export const SHOW_NOTES = process.env.NEXT_PUBLIC_SHOW_NOTES === "1";
