import type { ReactNode } from "react";
import { SHOW_NOTES } from "@/lib/notes";

/** A research note or hand-written line. Renders nothing on the public build (see src/lib/notes.ts). */
export function AdminNote({ children, className, as: Tag = "div" }: { children: ReactNode; className?: string; as?: "div" | "span" | "p" }) {
  if (!SHOW_NOTES) return null;
  return (
    <Tag data-admin-note="" className={className}>
      {children}
    </Tag>
  );
}
