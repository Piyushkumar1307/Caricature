# Sketch Studio

Sketch Studio is a two-screen selfie-to-caricature experience:

1. A visitor enters their name.
2. They capture or choose a selfie, then submit it for an AI caricature.
3. The visitor’s device returns to the home page once generation succeeds. A dedicated big-screen browser opened at `/reveal` stays waiting, then automatically draws the completed portrait before returning to its waiting state.

The default single-display station is named `main`. For a second station, use the same name in both URLs, for example `/?screen=stage-2` and `/reveal?screen=stage-2`.

## AI models

The workflow first uses `gpt-image-2.5-flare` to isolate the person from the background as a transparent PNG. `gpt-4o-mini` then reads visual art cues from that background-free portrait, and `gpt-image-2.5-flare` creates the final caricature. Both model IDs can be overridden with server-side environment variables. This adds one image-edit request per portrait, so it also adds some generation time and API cost.

## Run locally

```sh
npm install
cp .env.example .env
# add OPENAI_API_KEY to .env
npm run dev
```

The key is consumed only by the local server middleware; it is never exposed to browser code. Without a key, the rest of the experience works and the submit action returns a clear configuration message.

## Build and verify

```sh
npm run build
npm run validate
```

The build emits a self-contained Cloudflare Worker at `dist/server/index.js`. It embeds the Vite client bundle and serves the API routes, so deploy it to a Worker-capable host and configure `OPENAI_API_KEY` as a secret there. A static-only host is not sufficient because it would expose the OpenAI key or omit the caricature endpoint. The Site manifest provisions D1 for display-job status and R2 for the temporary completed PNG.

## Deploy on Render

The repository includes `render.yaml` for a Render Web Service. Render runs `npm ci && npm run build`, then `npm start`. Add `OPENAI_API_KEY` as a secret in the Render dashboard; never add it to Git. The Render adapter uses one in-memory display queue, so keep `WEB_CONCURRENCY=1`. A service restart clears an in-progress reveal; use durable storage before scaling to multiple instances.

## Privacy notes

- The browser resizes and re-encodes each image before upload, which strips typical photo metadata.
- The Worker sends the selfie to OpenAI for background removal, then keeps the background-free intermediate only in memory while preparing the caricature. It does not persist the submitted selfie or intermediate. The completed PNG is stored only until the display finishes its reveal, then deleted; its display record is cleared of the guest name and image location.
- Requests are same-origin, image type/size checked before parsing, and lightly rate limited per Worker isolate. Keep the hosted Site private until a durable, platform-level bot/rate-limit policy is added for a public launch.
