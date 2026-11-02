// Renders the PWA icons from an inline SVG. Run: node scripts/generate-icons.mjs
import sharp from "sharp";

const svg = (padding) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="${padding ? 0 : 112}" fill="#1c1b19"/>
  <g transform="translate(256 256) scale(${padding ? 0.72 : 1})">
    <path d="M-34 -150 h68 l-12 210 q-22 30 -44 0 z" fill="#e07a4f"/>
    <circle cx="0" cy="118" r="34" fill="#f7f6f3"/>
  </g>
</svg>`;

for (const [file, size, padding] of [
  ["icon-192.png", 192, false],
  ["icon-512.png", 512, false],
  ["icon-maskable-512.png", 512, true],
  ["apple-touch-icon.png", 180, true],
]) {
  await sharp(Buffer.from(svg(padding)))
    .resize(size, size)
    .png()
    .toFile(`public/icons/${file}`);
}
await sharp(Buffer.from(svg(false)))
  .resize(32, 32)
  .png()
  .toFile("src/app/icon.png");
console.log("Icons generated.");
