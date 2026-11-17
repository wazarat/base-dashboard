import path from "node:path";

export const ROOT = path.resolve(__dirname, "..", "..");
export const DATA = path.join(ROOT, "data");
export const HISTORY = path.join(DATA, "history");
export const OUT = path.join(ROOT, "src", "data", "generated");
/** Gated data, read only by server route handlers (src/app/api/data). Never imported by client code. */
export const GATED = path.join(ROOT, "src", "data", "gated");
export const SUBMISSIONS = path.join(DATA, "submissions");
