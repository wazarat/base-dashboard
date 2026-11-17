/**
 * Unit tests run with the full data set, as a signed-in reader sees it: the public
 * set comes from the normal imports and the gated set is filled in here, the same
 * way /api/data/gated fills it in the browser.
 */
import fs from "node:fs";
import path from "node:path";
import { hydrateGated, type GatedPayload } from "@/lib/data";

const file = path.resolve(__dirname, "..", "src", "data", "gated", "gated.json");
if (fs.existsSync(file)) hydrateGated(JSON.parse(fs.readFileSync(file, "utf8")) as GatedPayload);
