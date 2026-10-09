import { build as buildWithVite } from 'vite'
import { build as buildWithEsbuild } from 'esbuild'
import { cp, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const dist = resolve(root, 'dist')
const client = resolve(dist, 'client')
const server = resolve(dist, 'server')

const types = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
}

function mimeType(filename) {
  const extension = filename.slice(filename.lastIndexOf('.')).toLowerCase()
  return types[extension] || 'application/octet-stream'
}

async function collect(directory, entries = {}) {
  for (const entry of await readdir(directory)) {
    const filename = resolve(directory, entry)
    const details = await stat(filename)
    if (details.isDirectory()) {
      await collect(filename, entries)
      continue
    }
    const pathname = `/${relative(client, filename).split('\\').join('/')}`
    entries[pathname] = {
      body: (await readFile(filename)).toString('base64'),
      type: mimeType(filename),
    }
  }
  return entries
}

await rm(dist, { force: true, recursive: true })
await buildWithVite({
  base: '/',
  configFile: resolve(root, 'vite.config.js'),
  root,
  build: {
    emptyOutDir: false,
    outDir: client,
    sourcemap: false,
  },
})

const assets = await collect(client)
await mkdir(server, { recursive: true })
await buildWithEsbuild({
  bundle: true,
  define: { __SKETCH_STUDIO_ASSETS__: JSON.stringify(assets) },
  entryPoints: [resolve(root, 'worker/index.js')],
  format: 'esm',
  minify: true,
  outfile: resolve(server, 'index.js'),
  platform: 'browser',
  target: 'es2022',
})
await mkdir(resolve(dist, '.openai'), { recursive: true })
await cp(resolve(root, '.openai/hosting.json'), resolve(dist, '.openai/hosting.json'))
await writeFile(resolve(dist, '.build-info.json'), JSON.stringify({ assets: Object.keys(assets).length }, null, 2))
console.log(`Built ${Object.keys(assets).length} embedded client assets and the Worker entrypoint.`)
