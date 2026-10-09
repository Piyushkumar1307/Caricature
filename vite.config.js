import { Readable } from 'node:stream'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { handleCaricature } from './worker/api.js'
import { handleRevealAcknowledgement, handleRevealImage, handleRevealStatus } from './worker/reveal.js'

function studioApi(env) {
  return {
    name: 'sketch-studio-api',
    configureServer(server) {
      server.middlewares.use('/api', async (request, response) => {
        const headers = new Headers()
        for (const [name, value] of Object.entries(request.headers)) {
          if (Array.isArray(value)) headers.set(name, value.join(', '))
          else if (typeof value === 'string') headers.set(name, value)
        }
        const method = request.method || 'GET'
        const hasBody = !['GET', 'HEAD'].includes(method)
        const protocol = server.config.server.https ? 'https' : 'http'
        const host = request.headers.host || 'localhost'
        try {
          const apiRequest = new Request(`${protocol}://${host}/api${request.url || '/'}`, {
            body: hasBody ? Readable.toWeb(request) : undefined,
            duplex: hasBody ? 'half' : undefined,
            headers,
            method,
          })
          const pathname = new URL(apiRequest.url).pathname
          const apiResponse = pathname === '/api/caricature'
            ? await handleCaricature(apiRequest, env)
            : pathname === '/api/reveal/image'
              ? await handleRevealImage(apiRequest, env)
              : pathname === '/api/reveal/ack'
                ? await handleRevealAcknowledgement(apiRequest, env)
                : pathname === '/api/reveal'
                  ? await handleRevealStatus(apiRequest, env)
                  : new Response(JSON.stringify({ message: 'Not found.' }), { status: 404, headers: { 'content-type': 'application/json; charset=utf-8' } })
          response.statusCode = apiResponse.status
          apiResponse.headers.forEach((value, name) => response.setHeader(name, value))
          response.end(Buffer.from(await apiResponse.arrayBuffer()))
        } catch {
          response.statusCode = 500
          response.setHeader('content-type', 'application/json; charset=utf-8')
          response.end(JSON.stringify({ message: 'The studio could not process that request. Please try again.' }))
        }
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    base: '/',
    plugins: [react(), studioApi({ ...env, LOCAL_DEV: true })],
  }
})
