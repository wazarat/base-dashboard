import fs from "node:fs";
import path from "node:path";

/** Daily history exists only once the refresh pipeline (Milestone 2) has run. Tests on live figures wait for it. */
export const HAS_HISTORY = fs.existsSync(path.join(process.cwd(), "data", "history", "_meta.json"));

/** The events file is written at the end of Milestone 1, after owner review. */
export const HAS_EVENTS = fs.readdirSync(path.join(process.cwd(), "data")).some((f) => f.startsWith("base-events") && f.endsWith(".csv"));
