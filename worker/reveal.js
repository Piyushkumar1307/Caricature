const SCREEN_PATTERN = /^[a-z0-9][a-z0-9_-]{0,47}$/i
const localStations = new Map()

function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'cache-control': 'no-store',
      'content-type': 'application/json; charset=utf-8',
      ...headers,
    },
  })
}

function sameOrigin(request) {
  const origin = request.headers.get('origin')
  if (!origin) return false
  try {
    return origin === new URL(request.url).origin
  } catch {
    return false
  }
}

function stationKeys(screen) {
  const prefix = `portrait-reveals/${screen}`
  return {
    imagePrefix: `${prefix}/images/`,
    image: (jobId) => `${prefix}/images/${jobId}.png`,
  }
}

export function screenFrom(value) {
  if (typeof value !== 'string' || !value.trim()) return 'main'
  const screen = value.trim().toLowerCase()
  return SCREEN_PATTERN.test(screen) ? screen : null
}

export function guestNameFrom(value) {
  return typeof value === 'string'
    ? value.trim().replace(/\s+/g, ' ').slice(0, 48)
    : ''
}

function useLocalStore(env) {
  return env?.LOCAL_DEV === true || env?.LOCAL_DEV === 'true'
}

export function displayStorageReady(env = {}) {
  return Boolean(env.DB && env.PORTRAITS) || useLocalStore(env)
}

async function readJob(env, screen) {
  if (env.DB && env.PORTRAITS) {
    return env.DB.prepare(
      'SELECT screen, job_id AS jobId, guest_name AS guestName, image_key AS imageKey, status, revision, created_at AS createdAt FROM reveal_jobs WHERE screen = ?1',
    ).bind(screen).first()
  }
  return localStations.get(screen)?.job || null
}

async function deleteImage(env, imageKey) {
  if (!imageKey) return
  if (env.DB && env.PORTRAITS) {
    await env.PORTRAITS.delete(imageKey)
    return
  }
}

export async function startRevealJob(env, { screen, jobId, guestName }) {
  if (!displayStorageReady(env)) throw new Error('storage-unavailable')
  const prior = await readJob(env, screen)
  const createdAt = Date.now()

  if (env.DB && env.PORTRAITS) {
    await env.DB.prepare(
      `INSERT INTO reveal_jobs (screen, job_id, guest_name, image_key, status, revision, created_at, acknowledged_at)
       VALUES (?1, ?2, ?3, NULL, 'processing', 1, ?4, NULL)
       ON CONFLICT(screen) DO UPDATE SET
         job_id = excluded.job_id,
         guest_name = excluded.guest_name,
         image_key = NULL,
         status = 'processing',
         revision = reveal_jobs.revision + 1,
         created_at = excluded.created_at,
         acknowledged_at = NULL`,
    ).bind(screen, jobId, guestName, createdAt).run()
  } else {
    localStations.set(screen, {
      job: { screen, jobId, guestName, imageKey: null, status: 'processing', revision: (prior?.revision || 0) + 1, createdAt },
      image: null,
    })
  }

  await deleteImage(env, prior?.imageKey)
}

export async function publishRevealJob(env, { screen, jobId, imageBytes }) {
  const imageKey = stationKeys(screen).image(jobId)
  const createdAt = Date.now()

  if (env.DB && env.PORTRAITS) {
    await env.PORTRAITS.put(imageKey, imageBytes, {
      httpMetadata: {
        cacheControl: 'private, no-store',
        contentType: 'image/png',
      },
    })
    await env.DB.prepare(
      `UPDATE reveal_jobs
       SET image_key = ?1, status = 'ready', created_at = ?2
       WHERE screen = ?3 AND job_id = ?4`,
    ).bind(imageKey, createdAt, screen, jobId).run()
    return
  }

  const station = localStations.get(screen)
  if (!station || station.job.jobId !== jobId) throw new Error('job-unavailable')
  station.job.imageKey = imageKey
  station.job.status = 'ready'
  station.job.createdAt = createdAt
  station.image = imageBytes
}

export async function abandonRevealJob(env, { screen, jobId }) {
  if (env.DB && env.PORTRAITS) {
    const job = await readJob(env, screen)
    await env.DB.prepare('DELETE FROM reveal_jobs WHERE screen = ?1 AND job_id = ?2').bind(screen, jobId).run()
    await deleteImage(env, job?.jobId === jobId ? job.imageKey : null)
    return
  }
  const station = localStations.get(screen)
  if (station?.job?.jobId === jobId) localStations.delete(screen)
}

export async function handleRevealStatus(request, env = {}) {
  if (request.method !== 'GET') return json({ message: 'Use GET to check the display.' }, 405, { allow: 'GET' })
  if (!displayStorageReady(env)) return json({ message: 'The display storage is not configured yet.' }, 503)

  const screen = screenFrom(new URL(request.url).searchParams.get('screen'))
  if (!screen) return json({ message: 'That display name is not valid.' }, 400)

  try {
    const job = await readJob(env, screen)
    if (!job || job.status === 'shown') return json({ status: 'waiting', screen })
    if (job.status === 'processing') return json({ status: 'processing', screen, revision: job.revision })
    if (job.status !== 'ready' || !job.imageKey) return json({ status: 'waiting', screen })
    return json({
      status: 'ready',
      screen,
      jobId: job.jobId,
      name: job.guestName || 'Studio Guest',
      revision: job.revision,
      imageUrl: `/api/reveal/image?screen=${encodeURIComponent(screen)}&job=${encodeURIComponent(job.jobId)}`,
    })
  } catch {
    return json({ message: 'The display could not check for a portrait.' }, 503)
  }
}

export async function handleRevealImage(request, env = {}) {
  if (request.method !== 'GET') return json({ message: 'Use GET to load a portrait.' }, 405, { allow: 'GET' })
  if (!displayStorageReady(env)) return json({ message: 'The display storage is not configured yet.' }, 503)

  const url = new URL(request.url)
  const screen = screenFrom(url.searchParams.get('screen'))
  const jobId = url.searchParams.get('job') || ''
  if (!screen || !jobId) return json({ message: 'That portrait is not available.' }, 404)

  try {
    const job = await readJob(env, screen)
    if (!job || job.status !== 'ready' || job.jobId !== jobId || !job.imageKey) {
      return json({ message: 'That portrait is no longer available.' }, 404)
    }
    if (env.DB && env.PORTRAITS) {
      const object = await env.PORTRAITS.get(job.imageKey)
      if (!object) return json({ message: 'That portrait is no longer available.' }, 404)
      return new Response(object.body, {
        headers: {
          'cache-control': 'private, no-store',
          'content-type': object.httpMetadata?.contentType || 'image/png',
          'cross-origin-resource-policy': 'same-origin',
          'x-content-type-options': 'nosniff',
        },
      })
    }
    const image = localStations.get(screen)?.image
    if (!image) return json({ message: 'That portrait is no longer available.' }, 404)
    return new Response(image, {
      headers: {
        'cache-control': 'private, no-store',
        'content-type': 'image/png',
        'cross-origin-resource-policy': 'same-origin',
        'x-content-type-options': 'nosniff',
      },
    })
  } catch {
    return json({ message: 'That portrait is no longer available.' }, 404)
  }
}

export async function handleRevealAcknowledgement(request, env = {}) {
  if (request.method !== 'POST') return json({ message: 'Use POST to reset the display.' }, 405, { allow: 'POST' })
  if (!sameOrigin(request)) return json({ message: 'This request was not accepted.' }, 403)
  if (!displayStorageReady(env)) return json({ message: 'The display storage is not configured yet.' }, 503)

  let body
  try {
    body = await request.json()
  } catch {
    return json({ message: 'The display reset could not be read.' }, 400)
  }
  const screen = screenFrom(body?.screen)
  const jobId = typeof body?.jobId === 'string' ? body.jobId : ''
  if (!screen || !jobId) return json({ message: 'The display reset is not valid.' }, 400)

  try {
    const job = await readJob(env, screen)
    if (!job || job.jobId !== jobId) return json({ status: 'waiting', screen })

    if (env.DB && env.PORTRAITS) {
      await env.DB.prepare(
        `UPDATE reveal_jobs
         SET status = 'shown', guest_name = '', image_key = NULL, acknowledged_at = ?1
         WHERE screen = ?2 AND job_id = ?3`,
      ).bind(Date.now(), screen, jobId).run()
      await deleteImage(env, job.imageKey)
    } else {
      localStations.set(screen, {
        job: { ...job, guestName: '', imageKey: null, status: 'shown' },
        image: null,
      })
    }
    return json({ status: 'waiting', screen })
  } catch {
    return json({ message: 'The display could not reset yet.' }, 503)
  }
}
