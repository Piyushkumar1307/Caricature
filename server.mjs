import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { dirname, extname, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Readable } from 'node:stream'
import { handleCaricature } from './worker/api.js'
import { handleRevealAcknowledgement, handleRevealImage, handleRevealStatus } from './worker/reveal.js'

const root = dirname(fileURLToPath(import.meta.url))
const clientDirectory = resolve(root, 'dist', 'client')
const port = Number(process.env.PORT || 10000)
const runtimeEnv = { ...process.env, MEMORY_REVEAL: true }

const mimeTypes = {
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

function setSecurityHeaders(response) {
  response.setHeader('content-security-policy', "default-src 'self'; base-uri 'none'; connect-src 'self'; font-src 'self' https://fonts.gstatic.com; form-action 'self'; frame-ancestors 'none'; img-src 'self' data: blob:; media-src 'self' blob:; object-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com")
  response.setHeader('permissions-policy', 'camera=(self), microphone=(), geolocation=()')
  response.setHeader('referrer-policy', 'strict-origin-when-cross-origin')
  response.setHeader('x-content-type-options', 'nosniff')
  response.setHeader('x-frame-options', 'DENY')
}

function requestUrl(request) {
  const forwarded = request.headers['x-forwarded-proto']
  const protocol = (Array.isArray(forwarded) ? forwarded[0] : forwarded || 'http').split(',')[0].trim()
  const host = request.headers.host || 'localhost'
  return `${protocol}://${host}${request.url || '/'}`
}

function requestHeaders(request) {
  const headers = new Headers()
  for (const [name, value] of Object.entries(request.headers)) {
    if (Array.isArray(value)) headers.set(name, value.join(', '))
    else if (typeof value === 'string') headers.set(name, value)
  }
  return headers
}

async function writeWebResponse(response, webResponse) {
  response.statusCode = webResponse.status
  webResponse.headers.forEach((value, name) => response.setHeader(name, value))
  response.end(Buffer.from(await webResponse.arrayBuffer()))
}

async function handleApi(request, response) {
  const method = request.method || 'GET'
  const hasBody = !['GET', 'HEAD'].includes(method)
  const options = {
    headers: requestHeaders(request),
    method,
  }
  if (hasBody) {
    options.body = Readable.toWeb(request)
    options.duplex = 'half'
  }
  const webRequest = new Request(requestUrl(request), options)
  const pathname = new URL(webRequest.url).pathname
  const webResponse = pathname === '/api/caricature'
    ? await handleCaricature(webRequest, runtimeEnv)
    : pathname === '/api/reveal/image'
      ? await handleRevealImage(webRequest, runtimeEnv)
      : pathname === '/api/reveal/ack'
        ? await handleRevealAcknowledgement(webRequest, runtimeEnv)
        : pathname === '/api/reveal'
          ? await handleRevealStatus(webRequest, runtimeEnv)
          : new Response(JSON.stringify({ message: 'Not found.' }), { status: 404, headers: { 'content-type': 'application/json; charset=utf-8' } })
  await writeWebResponse(response, webResponse)
}

function fileForPath(pathname) {
  let relativePath
  try {
    relativePath = decodeURIComponent(pathname).replace(/^\/+/, '') || 'index.html'
  } catch {
    return null
  }
  const file = resolve(clientDirectory, relativePath)
  return file === clientDirectory || file.startsWith(`${clientDirectory}${sep}`) ? file : null
}

async function sendFile(request, response, file, cacheControl) {
  const body = await readFile(file)
  response.statusCode = 200
  response.setHeader('content-type', mimeTypes[extname(file).toLowerCase()] || 'application/octet-stream')
  response.setHeader('cache-control', cacheControl)
  setSecurityHeaders(response)
  response.end(request.method === 'HEAD' ? undefined : body)
}

async function handleStatic(request, response) {
  const url = new URL(requestUrl(request))
  const directFile = fileForPath(url.pathname)
  if (directFile) {
    try {
      if ((await stat(directFile)).isFile()) {
        const cacheControl = url.pathname.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache'
        await sendFile(request, response, directFile, cacheControl)
        return
      }
    } catch {
      // Named SPA routes intentionally fall through to index.html.
    }
  }
  await sendFile(request, response, resolve(clientDirectory, 'index.html'), 'no-cache')
}

const server = createServer(async (request, response) => {
  try {
    const pathname = new URL(requestUrl(request)).pathname
    if (pathname === '/health') {
      response.statusCode = 200
      response.setHeader('content-type', 'application/json; charset=utf-8')
      response.setHeader('cache-control', 'no-store')
      response.end('{"status":"ok"}')
      return
    }
    if (pathname.startsWith('/api/')) {
      await handleApi(request, response)
      return
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.statusCode = 405
      response.setHeader('allow', 'GET, HEAD')
      response.end('Method not allowed')
      return
    }
    await handleStatic(request, response)
  } catch (error) {
    console.error('Request failed', error)
    if (!response.headersSent) {
      response.statusCode = 500
      response.setHeader('content-type', 'application/json; charset=utf-8')
    }
    response.end(JSON.stringify({ message: 'The studio could not process that request. Please try again.' }))
  }
})

server.listen(port, '0.0.0.0', () => {
  console.log(`Sketch Studio is listening on port ${port}`)
})
