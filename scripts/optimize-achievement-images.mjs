import { mkdir, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const inputDir = path.join(root, "public/game");
const achievementDir = path.join(root, "assets/achievements");
const victoryDir = path.join(root, "assets/game");

const VICTORY_FILES = new Set(["victory-vampire.png"]);

async function optimizePng(input, output, maxSize) {
  const meta = await sharp(input).metadata();
  const result = await sharp(input)
    .resize(maxSize, maxSize, { fit: "inside", withoutEnlargement: true })
    .webp({ quality: 84, effort: 6 })
    .toFile(output);
  return { meta, result, output };
}

async function main() {
  await mkdir(achievementDir, { recursive: true });
  await mkdir(victoryDir, { recursive: true });
  const files = (await readdir(inputDir)).filter((f) => f.endsWith(".png"));

  let totalIn = 0;
  let totalOut = 0;

  for (const file of files) {
    const input = path.join(inputDir, file);
    const isVictory = VICTORY_FILES.has(file);
    const outputDir = isVictory ? victoryDir : achievementDir;
    const maxSize = isVictory ? 400 : 600;
    const output = path.join(outputDir, file.replace(/\.png$/i, ".webp"));
    const { meta, result } = await optimizePng(input, output, maxSize);

    totalIn += meta.size ?? 0;
    totalOut += result.size;
    console.log(
      `${file} → ${path.relative(root, output)} (${Math.round((meta.size ?? 0) / 1024)}KB → ${Math.round(result.size / 1024)}KB)`
    );
  }

  console.log(
    `Done: ${files.length} files, ${Math.round(totalIn / 1024)}KB → ${Math.round(totalOut / 1024)}KB`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
