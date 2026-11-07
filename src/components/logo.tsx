import { logoFont } from "@/app/fonts";
import { cn } from "./ui";

/** The needle crossing the stamp (drawn horizontally, then rotated by -45°). */
const NEEDLE = "M-47 0 L-28 -1.5 L38 -1.5 Q42 0 38 1.5 L-28 1.5 Z";

/**
 * NEEDL mark: a stamp circle with an "N", crossed by a needle. Uses currentColor; the gap
 * around the needle takes the background colour (`gap`, default: the page surface).
 */
export function LogoMark({
  className,
  gap = "var(--surface)",
  title = "NEEDL",
}: {
  className?: string;
  gap?: string;
  title?: string;
}) {
  return (
    <svg viewBox="0 0 100 100" className={className} role="img" aria-label={title}>
      <circle cx="50" cy="50" r="41" fill="none" stroke="currentColor" strokeWidth="4.2" />
      <text
        x="50"
        y="67.5"
        textAnchor="middle"
        fontSize="48"
        fill="currentColor"
        style={{ fontFamily: "var(--font-logo)" }}
      >
        N
      </text>
      <g transform="translate(50 50) rotate(-45)">
        <path d={NEEDLE} fill={gap} stroke={gap} strokeWidth="3.4" strokeLinejoin="round" />
        <path d={NEEDLE} fill="currentColor" />
        <ellipse cx="33.5" cy="0" rx="3" ry="0.6" fill={gap} />
      </g>
    </svg>
  );
}

/** Mark plus "NEEDL" wordmark in the logo typeface. */
export function Logo({
  className,
  markClassName,
  gap,
}: {
  className?: string;
  markClassName?: string;
  gap?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark className={cn("size-[1.35em] shrink-0", markClassName)} gap={gap} />
      <span className={cn(logoFont.className, "leading-none tracking-[0.12em]")}>NEEDL</span>
    </span>
  );
}
