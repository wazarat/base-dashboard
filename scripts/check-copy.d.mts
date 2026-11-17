export interface CopyHit {
  file: string;
  line: number;
  col: number;
  tag: string;
  snippet: string;
}
export const ROOTS: string[];
export const SKIP: Map<string, string>;
export function scanSource(text: string, fileName: string): CopyHit[];
export function run(roots?: string[]): CopyHit[];
