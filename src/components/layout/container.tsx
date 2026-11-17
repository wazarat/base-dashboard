import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/** Centred to the 1320px container with 20, 24 and 32px gutters. */
export function Container({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("mx-auto w-full max-w-atlas px-5 sm:px-6 lg:px-8", className)} {...props} />;
}
