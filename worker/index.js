import { handleCaricature } from './api.js'
import { handleRevealAcknowledgement, handleRevealImage, handleRevealStatus } from './reveal.js'

const assets = __SKETCH_STUDIO_ASSETS__

const mimeTypes = {
  css: 'text/css; charset=utf-8',
  html: 'text/html; charset=utf-8',
  ico: 'image/x-icon',
  js: 'text/javascript; charset=utf-8',
  json: 'application/json; charset=utf-8',
  map: 'application/json; charset=utf-8',
  png: 'image/png',
  svg: 'image/svg+xml',
  webp: 'image/webp',
  woff2: 'font/woff2',
}

function securityHeaders(headers = new Headers()) {
  headers.set('content-security-policy', "default-src 'self'; base-uri 'none'; connect-src 'self'; font-src 'self' https://fonts.gstatic.com; form-action 'self'; frame-ancestors 'none'; img-src 'self' data: blob:; media-src 'self' blob:; object-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com")
  headers.set('permissions-policy', 'camera=(self), microphone=(), geolocation=()')
  headers.set('referrer-policy', 'strict-origin-when-cross-origin')
  headers.set('x-content-type-options', 'nosniff')
  headers.set('x-frame-options', 'DENY')
  return headers
}

function decodeAsset(value) {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return bytes
}

function contentType(path, fallback) {
  const extension = path.split('.').pop()?.toLowerCase()
  return fallback || mimeTypes[extension] || 'application/octet-stream'
}

function staticResponse(path, request) {
  const asset = assets[path]
  if (!asset) return null
  const headers = securityHeaders(new Headers({ 'content-type': contentType(path, asset.type) }))
  headers.set('cache-control', path.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache')
  return new Response(request.method === 'HEAD' ? null : decodeAsset(asset.body), { headers })
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    if (url.pathname === '/api/caricature') return handleCaricature(request, env)
    if (url.pathname === '/api/reveal') return handleRevealStatus(request, env)
    if (url.pathname === '/api/reveal/image') return handleRevealImage(request, env)
    if (url.pathname === '/api/reveal/ack') return handleRevealAcknowledgement(request, env)

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method not allowed', { status: 405, headers: securityHeaders(new Headers({ allow: 'GET, HEAD' })) })
    }

    const direct = staticResponse(url.pathname === '/' ? '/index.html' : url.pathname, request)
    if (direct) return direct

    // React owns the named journey URLs (/selfie and /reveal), so serve its shell on direct visits.
    const application = staticResponse('/index.html', request)
    return application || new Response('Not found', { status: 404, headers: securityHeaders() })
  },
}
