import Script from "next/script";
import { logoFont } from "@/app/fonts";

const NEEDLE = "M-47 0 L-28 -1.5 L38 -1.5 Q42 0 38 1.5 L-28 1.5 Z";

/**
 * Splash screen of the installed app (home screen): the stamp draws itself, the needle
 * pierces it, the wordmark fades in, then the whole screen fades into the app. Only shown
 * in standalone mode (CSS) and once per app start (sessionStorage flag set before paint).
 * No client JavaScript needed – it is pure CSS animation.
 */
export function SplashScreen() {
  return (
    <>
      <Script id="needl-splash" strategy="beforeInteractive">
        {
          "try{if(sessionStorage.getItem('needl-splash'))document.documentElement.dataset.splashDone='1';else sessionStorage.setItem('needl-splash','1')}catch(e){}"
        }
      </Script>
      <div className="splash" aria-hidden="true">
        <svg viewBox="0 0 100 100" className="splash-mark">
          <circle
            className="splash-ring"
            cx="50"
            cy="50"
            r="41"
            fill="none"
            stroke="currentColor"
            strokeWidth="4.2"
            pathLength={1}
            transform="rotate(-90 50 50)"
          />
          <text
            className="splash-n"
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
            <g className="splash-needle">
              <path
                d={NEEDLE}
                fill="#18181b"
                stroke="#18181b"
                strokeWidth="3.4"
                strokeLinejoin="round"
              />
              <path d={NEEDLE} fill="currentColor" />
              <ellipse cx="33.5" cy="0" rx="3" ry="0.6" fill="#18181b" />
            </g>
          </g>
        </svg>
        <span className={`splash-word ${logoFont.className}`}>NEEDL</span>
      </div>
    </>
  );
}
