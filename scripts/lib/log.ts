let verbose = false;
export function setVerbose(v: boolean) {
  verbose = v;
}
export const log = {
  info: (...a: unknown[]) => console.log(...a),
  warn: (...a: unknown[]) => console.warn("  !", ...a),
  debug: (...a: unknown[]) => {
    if (verbose) console.log("   ·", ...a);
  },
};
