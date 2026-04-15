import sharp from 'sharp';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const sizes = [72, 96, 128, 144, 152, 192, 384, 512];

for (const size of sizes) {
  const svg = `
    <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${size}" height="${size}" fill="#1A1A1A" rx="${size * 0.15}"/>
      <text x="50%" y="52%" dominant-baseline="middle" text-anchor="middle"
            font-family="Arial, sans-serif" font-weight="bold"
            font-size="${size * 0.35}" fill="#FFFFFF">Б</text>
    </svg>
  `;
  await sharp(Buffer.from(svg))
    .png()
    .toFile(path.join(__dirname, '..', 'public', 'icons', `icon-${size}x${size}.png`));
  console.log(`Generated icon-${size}x${size}.png`);
}
