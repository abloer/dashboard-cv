import fs from "node:fs";
import path from "node:path";

const distAssetsDir = path.resolve("dist/assets");
const maxChunkBytes = Number(process.env.BUNDLE_MAX_CHUNK_BYTES || 500 * 1024);

if (!fs.existsSync(distAssetsDir)) {
  throw new Error("dist/assets does not exist. Run npm run build before checking bundle size.");
}

const jsAssets = fs
  .readdirSync(distAssetsDir)
  .filter((fileName) => fileName.endsWith(".js"))
  .map((fileName) => {
    const filePath = path.join(distAssetsDir, fileName);
    return {
      fileName,
      size: fs.statSync(filePath).size,
    };
  })
  .sort((left, right) => right.size - left.size);

const oversized = jsAssets.filter((asset) => asset.size > maxChunkBytes);

if (oversized.length > 0) {
  const details = oversized
    .map((asset) => `${asset.fileName}: ${(asset.size / 1024).toFixed(2)} kB`)
    .join("\n");
  throw new Error(`Bundle chunk budget exceeded (${(maxChunkBytes / 1024).toFixed(0)} kB):\n${details}`);
}

const largest = jsAssets[0];
console.log(
  `Bundle size check passed. Largest JS chunk: ${largest.fileName} (${(largest.size / 1024).toFixed(2)} kB).`
);
