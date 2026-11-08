# Logo font

`logo.woff2` is used only for the "NEEDL" wordmark (see `src/app/fonts.ts`).

Currently: **Saira Medium** (Omnibus-Type, SIL Open Font License 1.1 – free to embed),
a free font in the style of Eurostile.

To use **Eurostile/Eurostyle Medium** instead: buy a webfont licence (e.g. Linotype/URW),
save the Medium cut as `logo.woff2` here (replacing this file) and redeploy. No code change needed.

## Website fonts

Used only on the public website (`src/app/(site)/`), both under the SIL Open Font License 1.1:

- `display.woff2`: **Saira** at expanded width (wdth 125), weights 500–700, made from the
  variable font with `fonttools varLib.instancer … wdth=125 wght=500:700`.
- `body.woff2`: **Red Hat Display** (variable, latin subset, from Fontsource).
