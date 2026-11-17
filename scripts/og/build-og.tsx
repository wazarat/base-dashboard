/**
 * Renders the Open Graph share card to public/og.png at build time (npm run
 * build runs it through prebuild, after the data build). A real .png file is
 * served with the right content type on any static host, which the extension-
 * less metadata route was not. Brand style: ink canvas, the CanHav mark,
 * Space Grotesk, an electric rule and the data date, from the OFL fonts in
 * this folder.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { ImageResponse } from "next/og";
import { meta } from "../../src/lib/data";

const ROOT = path.resolve(__dirname, "..", "..");
const OUT = path.join(ROOT, "public", "og.png");
export const OG_SIZE = { width: 1200, height: 630 };

const INK_950 = "#05060a";
const INK_900 = "#0a0c14";
const INK_700 = "rgba(31, 36, 51, 0.6)";
const INK_50 = "#eef0f7";
const INK_300 = "#7c8499";
const INK_500 = "#3a4255";
const ELECTRIC = "#3d7bff";

const font = (file: string) => {
  const b = readFileSync(path.join(__dirname, file));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
};

export function ogCard(asOfLabel: string, mark: string | null) {
  const footer = `Data as of ${asOfLabel}, updated daily`;
  const tagline = "Independent research by CanHav Research, not affiliated with Base or Coinbase";
  return (
    <div style={{ width: "100%", height: "100%", display: "flex", background: INK_950, padding: 48 }}>
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", width: "100%", height: "100%", background: INK_900, border: `1px solid ${INK_700}`, borderRadius: 24, padding: 56 }}>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
            {mark && <img src={mark} alt="" width={72} height={72} style={{ width: 72, height: 72 }} />}
            <div style={{ fontFamily: "Space Grotesk", fontSize: 72, fontWeight: 600, letterSpacing: "-0.025em", color: INK_50 }}>CanHav Research</div>
          </div>
          <div style={{ marginTop: 20, fontFamily: "Inter", fontSize: 40, fontWeight: 500, color: INK_300 }}>Base Ecosystem Atlas</div>
          <div style={{ marginTop: 28, width: 140, height: 4, background: ELECTRIC, borderRadius: 2 }} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 24 }}>
          <div style={{ fontFamily: "JetBrains Mono", fontSize: 24, color: INK_500 }}>{footer}</div>
          <div style={{ fontFamily: "Inter", fontSize: 20, color: INK_300, maxWidth: 520, textAlign: "right" }}>{tagline}</div>
        </div>
      </div>
    </div>
  );
}

async function main() {
  const mark = `data:image/svg+xml;base64,${readFileSync(path.join(ROOT, "public", "mark.svg")).toString("base64")}`;
  const res = new ImageResponse(ogCard(meta.asOfLabel, mark), {
    ...OG_SIZE,
    fonts: [
      { name: "Space Grotesk", data: font("space-grotesk-600.ttf"), weight: 600, style: "normal" },
      { name: "Inter", data: font("inter-500.ttf"), weight: 500, style: "normal" },
      { name: "JetBrains Mono", data: font("jetbrains-mono-400.ttf"), weight: 400, style: "normal" },
    ],
  });
  const png = Buffer.from(await res.arrayBuffer());
  mkdirSync(path.dirname(OUT), { recursive: true });
  writeFileSync(OUT, png);
  console.log(`wrote ${path.relative(ROOT, OUT)} (${png.length} bytes, ${OG_SIZE.width}x${OG_SIZE.height})`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
