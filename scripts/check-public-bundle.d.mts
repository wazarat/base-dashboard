export const FIXED_SENTINELS: string[];
export function slugOf(name: string): string;
export function findSentinels(rounds: Array<{ leadInvestors?: string[]; otherInvestors?: string[] }>, publicTexts: string[], codeTexts?: string[]): string[];
export function scan(dirs: string[], sentinels: string[], skip?: (file: string) => boolean): Array<{ file: string; sentinel: string }>;
