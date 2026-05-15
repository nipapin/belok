import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import sharp from "sharp";

const SIZES = [72, 96, 128, 144, 152, 192, 384, 512];
const APPLE_TOUCH_SIZES = [180];
const FAVICON_SIZES = [16, 32, 48];

async function main() {
  const root = resolve(process.cwd());
  const svgPath = resolve(root, "public", "icons", "icon.svg");
  const iconsDir = resolve(root, "public", "icons");

  const svgBuffer = await readFile(svgPath);

  const allSizes = [...new Set([...SIZES, ...APPLE_TOUCH_SIZES, ...FAVICON_SIZES])];

  for (const size of allSizes) {
    const out = resolve(iconsDir, `icon-${size}x${size}.png`);
    await sharp(svgBuffer, { density: Math.max(72, size * 2) })
      .resize(size, size, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 1 } })
      .png({ compressionLevel: 9 })
      .toFile(out);
    console.log(`✓ ${out}`);
  }

  // apple-touch-icon.png is conventionally 180x180 at /apple-touch-icon.png
  const appleOut = resolve(root, "public", "apple-touch-icon.png");
  await sharp(svgBuffer, { density: 360 })
    .resize(180, 180, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 1 } })
    .png({ compressionLevel: 9 })
    .toFile(appleOut);
  console.log(`✓ ${appleOut}`);

  // favicon.ico — a small PNG renamed (modern browsers accept PNG content in .ico)
  const faviconOut = resolve(root, "public", "favicon.ico");
  await sharp(svgBuffer, { density: 192 })
    .resize(48, 48, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 1 } })
    .png({ compressionLevel: 9 })
    .toBuffer()
    .then((buf) => writeFile(faviconOut, buf));
  console.log(`✓ ${faviconOut}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
