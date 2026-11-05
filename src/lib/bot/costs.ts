/**
 * Cost of bot runs from token usage at Anthropic list prices (USD per million tokens).
 * Cache writes (5-minute TTL) cost 1.25 × input. Unknown models are priced like Opus
 * so the cost brake errs on the safe side.
 */

interface Price {
  input: number;
  output: number;
  cacheRead: number;
}

const PRICES: Array<[prefix: string, price: Price]> = [
  ["claude-fable-5-1", { input: 10, output: 50, cacheRead: 0.25 }],
  ["claude-fable", { input: 10, output: 50, cacheRead: 1 }],
  ["claude-opus-5-5", { input: 4, output: 20, cacheRead: 0.2 }],
  ["claude-opus", { input: 5, output: 25, cacheRead: 0.5 }],
  ["claude-sonnet-5-5", { input: 2, output: 10, cacheRead: 0.2 }],
  ["claude-sonnet", { input: 3, output: 15, cacheRead: 0.3 }],
  ["claude-haiku-5-5", { input: 0.1, output: 0.5, cacheRead: 0.01 }],
];
const FALLBACK: Price = { input: 10, output: 50, cacheRead: 1 };

export function priceOf(model: string | null | undefined): Price {
  const m = (model ?? "").toLowerCase();
  return PRICES.find(([prefix]) => m.startsWith(prefix))?.[1] ?? FALLBACK;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

/** Cost in millionths of a dollar (tokens × $/MTok = micro-dollars). */
export function costMicros(model: string | null | undefined, u: TokenUsage): number {
  const p = priceOf(model);
  return Math.ceil(
    u.inputTokens * p.input +
      u.outputTokens * p.output +
      u.cacheReadTokens * p.cacheRead +
      u.cacheWriteTokens * p.input * 1.25,
  );
}

/** Micro-dollars → euro cents, counting 1 $ as 1 € (on the safe side). */
export const microsToCents = (micros: number) => micros / 10_000;

export const formatEuro = (cents: number) =>
  new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(cents / 100);
