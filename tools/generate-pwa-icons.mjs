/** Build the install icons with Expo's portable image pipeline before upload. */
import { mkdir, mkdtemp, rename, rm, rmdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { generateImageAsync, getPngInfo } = require('@expo/image-utils');
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const icons = [
  { name: 'apple-touch-icon.png', size: 180 },
  { name: 'icon-192.png', size: 192 },
  { name: 'icon-512.png', size: 512 },
];

export async function generatePwaIcons({
  source = join(projectRoot, 'apps/app/assets/icon.png'),
  outputDir = join(projectRoot, 'apps/app/dist'),
} = {}) {
  source = resolve(source);
  outputDir = resolve(outputDir);
  // Parse first: a missing or corrupt source must leave existing icons alone.
  try {
    await getPngInfo(source);
  } catch (error) {
    throw new Error(`cannot read source PNG ${source}: ${error.message}`, { cause: error });
  }

  await mkdir(outputDir, { recursive: true });
  const staging = await mkdtemp(join(outputDir, '.pwa-icons-'));
  try {
    for (const { name, size } of icons) {
      const image = await generateImageAsync({ projectRoot }, {
        src: source, name, width: size, height: size, resizeMode: 'cover',
      });
      const staged = join(staging, name);
      await writeFile(staged, image.source);
      const info = await getPngInfo(staged);
      if (info.width !== size || info.height !== size) {
        throw new Error(`${name} must be ${size}×${size}; generated ${info.width}×${info.height}`);
      }
    }
    // Publish only after every output parsed successfully at its required size.
    for (const { name } of icons) {
      await rename(join(staging, name), join(outputDir, name));
    }
    return icons.map(({ name, size }) => ({ path: join(outputDir, name), width: size, height: size }));
  } finally {
    // Remove only the known files in this helper's own temporary directory.
    for (const { name } of icons) { await rm(join(staging, name), { force: true }); }
    await rmdir(staging);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const generated = await generatePwaIcons();
    console.log(`PWA icons validated: ${generated.map((icon) => `${icon.width}×${icon.height}`).join(', ')}`);
  } catch (error) {
    console.error(`PWA icons failed: ${error.message}`);
    process.exitCode = 1;
  }
}
