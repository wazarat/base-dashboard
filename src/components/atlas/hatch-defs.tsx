import { HATCH_ID } from "@/lib/colors";

/** SVG pattern for "Other" fills; render once inside a chart's <svg> (Recharts passes <defs> through). */
export function HatchDefs() {
  return (
    <defs>
      <pattern id={HATCH_ID} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect width="6" height="6" fill="transparent" />
        <line x1="0" y1="0" x2="0" y2="6" stroke="var(--ink-muted)" strokeWidth="1.5" />
      </pattern>
    </defs>
  );
}
