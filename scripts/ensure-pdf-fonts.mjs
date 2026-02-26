import { mkdir, access, copyFile } from 'node:fs/promises';
import path from 'node:path';

const cwd = process.cwd();
const fontsDir = path.resolve(cwd, 'assets/fonts');

const fonts = [
  {
    label: 'regular',
    target: path.join(fontsDir, 'NotoSans-Regular.ttf'),
    candidates: [
      path.resolve(cwd, 'node_modules/next/dist/compiled/@vercel/og/noto-sans-v27-latin-regular.ttf')
    ]
  },
  {
    label: 'bold',
    target: path.join(fontsDir, 'NotoSans-Bold.ttf'),
    candidates: [
      '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
    ]
  }
];

await mkdir(fontsDir, { recursive: true });

for (const font of fonts) {
  try {
    await access(font.target);
    continue;
  } catch {
    // fall through and create from candidates
  }

  let copied = false;
  for (const candidate of font.candidates) {
    try {
      await access(candidate);
      await copyFile(candidate, font.target);
      copied = true;
      break;
    } catch {
      // try next candidate
    }
  }

  if (!copied) {
    throw new Error(
      `Unable to prepare ${font.label} PDF font at ${font.target}. Tried: ${font.candidates.join(', ')}`
    );
  }
}
