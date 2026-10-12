import { build } from 'vite';
import { copyFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('.', import.meta.url));
const outDir = `${root}dist`;
for (const [index, entry] of ['content', 'background', 'panel'].entries()) {
  await build({ configFile: false, build: { outDir, emptyOutDir: index === 0, minify: true,
    lib: { entry: `${root}${entry}.ts`, name: 'ToneAuditor', formats: [entry === 'content' ? 'iife' : 'es'], fileName: () => `${entry}.js` } } });
}
await mkdir(outDir, { recursive: true });
for (const name of ['manifest.json', 'panel.html', 'panel.css']) await copyFile(`${root}${name}`, `${outDir}/${name}`);
