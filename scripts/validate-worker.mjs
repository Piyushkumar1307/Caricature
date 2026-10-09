import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const source = await readFile(resolve(root, 'dist/server/index.js'), 'utf8')
const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`
const worker = await import(moduleUrl)

assert.equal(typeof worker.default?.fetch, 'function', 'Worker must export default.fetch')
const home = await worker.default.fetch(new Request('https://sketch.local/'), {})
assert.equal(home.status, 200)
assert.match(home.headers.get('content-type') || '', /text\/html/)
const directRoute = await worker.default.fetch(new Request('https://sketch.local/reveal'), {})
assert.equal(directRoute.status, 200)
const unconfigured = await worker.default.fetch(new Request('https://sketch.local/api/caricature', {
  method: 'POST',
  headers: { origin: 'https://sketch.local' },
}), {})
assert.equal(unconfigured.status, 503)

const reveal = await import(pathToFileURL(resolve(root, 'worker/reveal.js')).href)
const displayEnv = { LOCAL_DEV: true }
const screen = 'validation-screen'
const jobId = 'validation-job'
await reveal.startRevealJob(displayEnv, { screen, jobId, guestName: 'Validation Guest' })
let status = await reveal.handleRevealStatus(new Request(`https://sketch.local/api/reveal?screen=${screen}`), displayEnv)
assert.equal((await status.json()).status, 'processing')

const expectedImage = new Uint8Array([137, 80, 78, 71])
await reveal.publishRevealJob(displayEnv, { screen, jobId, imageBytes: expectedImage })
status = await reveal.handleRevealStatus(new Request(`https://sketch.local/api/reveal?screen=${screen}`), displayEnv)
const ready = await status.json()
assert.equal(ready.status, 'ready')
assert.equal(ready.jobId, jobId)
const image = await reveal.handleRevealImage(new Request(`https://sketch.local${ready.imageUrl}`), displayEnv)
assert.equal(image.status, 200)
assert.deepEqual(new Uint8Array(await image.arrayBuffer()), expectedImage)
const acknowledged = await reveal.handleRevealAcknowledgement(new Request('https://sketch.local/api/reveal/ack', {
  method: 'POST',
  headers: { 'content-type': 'application/json', origin: 'https://sketch.local' },
  body: JSON.stringify({ screen, jobId }),
}), displayEnv)
assert.equal(acknowledged.status, 200)
status = await reveal.handleRevealStatus(new Request(`https://sketch.local/api/reveal?screen=${screen}`), displayEnv)
assert.equal((await status.json()).status, 'waiting')

const api = await import(pathToFileURL(resolve(root, 'worker/api.js')).href)
const sourcePortrait = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])
const upstreamCalls = []
const originalFetch = globalThis.fetch
globalThis.fetch = async (url) => {
  if (String(url).includes('/v1/images/edits')) {
    upstreamCalls.push('edit')
    return Response.json({ data: [{ b64_json: Buffer.from(sourcePortrait).toString('base64') }] })
  }
  if (String(url).includes('/v1/responses')) {
    upstreamCalls.push('notes')
    return Response.json({ output_text: 'Warm smile, round glasses.' })
  }
  throw new Error(`Unexpected upstream request: ${url}`)
}
try {
  const handoffForm = new FormData()
  handoffForm.append('screen', 'background-validation')
  handoffForm.append('guestName', 'Background Guest')
  handoffForm.append('selfie', new Blob([sourcePortrait], { type: 'image/png' }), 'selfie.png')
  const generated = await api.handleCaricature(new Request('https://sketch.local/api/caricature', {
    method: 'POST',
    headers: { origin: 'https://sketch.local' },
    body: handoffForm,
  }), { ...displayEnv, OPENAI_API_KEY: 'test-key' })
  assert.equal(generated.status, 201)
  assert.equal((await generated.json()).status, 'ready')
  assert.deepEqual(upstreamCalls, ['edit', 'notes', 'edit'])
  const generatedStatus = await reveal.handleRevealStatus(new Request('https://sketch.local/api/reveal?screen=background-validation'), displayEnv)
  const generatedReady = await generatedStatus.json()
  assert.equal(generatedReady.status, 'ready')
  const generatedImage = await reveal.handleRevealImage(new Request(`https://sketch.local${generatedReady.imageUrl}`), displayEnv)
  assert.deepEqual(new Uint8Array(await generatedImage.arrayBuffer()), sourcePortrait)
} finally {
  globalThis.fetch = originalFetch
}

console.log(`Worker is valid: ${pathToFileURL(resolve(root, 'dist/server/index.js')).href}`)
