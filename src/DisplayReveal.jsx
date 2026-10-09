import { useCallback, useEffect, useMemo, useState } from 'react'
import SketchReveal from './SketchReveal'

const POLL_INTERVAL = 1500
const SCREEN_PATTERN = /^[a-z0-9][a-z0-9_-]{0,47}$/i

function displayScreen() {
  const value = new URLSearchParams(window.location.search).get('screen')?.trim().toLowerCase()
  return value && SCREEN_PATTERN.test(value) ? value : 'main'
}

function WaitingScreen({ state, screen }) {
  const copy = {
    error: ['Display connection paused', 'We’ll keep checking for the next portrait.'],
    loading: ['Opening the sketchbook', 'Your portrait is ready. Preparing the drawing paper now.'],
    processing: ['A portrait is on its way', 'Our artist is creating it now. The reveal will begin automatically.'],
    waiting: ['Waiting for the next portrait', 'Take a selfie in Sketch Studio. This screen will begin drawing it automatically.'],
  }[state] || ['Waiting for the next portrait', 'This display is ready when the next studio guest is.']

  return (
    <main className="screen display-waiting" aria-live="polite">
      <div className="display-mark" aria-hidden="true"><span /><span /><span /></div>
      <p className="eyebrow">Sketch Studio display</p>
      <h1>{copy[0]}</h1>
      <p className="lede">{copy[1]}</p>
      <p className="display-station">Display: {screen}</p>
    </main>
  )
}

export default function DisplayReveal({ demo = false }) {
  const screen = useMemo(displayScreen, [])
  const [artwork, setArtwork] = useState(null)
  const [guestName, setGuestName] = useState('Studio Guest')
  const [jobId, setJobId] = useState('')
  const [state, setState] = useState('waiting')
  const [resetError, setResetError] = useState('')

  useEffect(() => {
    if (!demo) return undefined
    let active = true
    setState('loading')
    fetch('/demo-caricature.png', { cache: 'no-store' })
      .then((response) => {
        if (!response.ok) throw new Error('demo unavailable')
        return response.blob()
      })
      .then((image) => {
        if (!active) return
        setGuestName('Studio Guest')
        setJobId('demo')
        setArtwork(image)
      })
      .catch(() => {
        if (active) setState('error')
      })
    return () => { active = false }
  }, [demo])

  useEffect(() => {
    if (demo || artwork) return undefined
    let active = true
    let timer = 0

    async function checkDisplay() {
      try {
        const response = await fetch(`/api/reveal?screen=${encodeURIComponent(screen)}`, { cache: 'no-store' })
        const payload = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(payload.message || 'display unavailable')
        if (!active) return

        if (payload.status !== 'ready') {
          setState(payload.status === 'processing' ? 'processing' : 'waiting')
        } else {
          setState('loading')
          const imageResponse = await fetch(payload.imageUrl, { cache: 'no-store' })
          if (!imageResponse.ok) throw new Error('portrait unavailable')
          const image = await imageResponse.blob()
          if (!image.size || !image.type.startsWith('image/')) throw new Error('portrait unreadable')
          if (!active) return
          setGuestName(payload.name || 'Studio Guest')
          setJobId(payload.jobId)
          setArtwork(image)
          return
        }
      } catch {
        if (active) setState('error')
      }
      if (active) timer = window.setTimeout(checkDisplay, POLL_INTERVAL)
    }

    checkDisplay()
    return () => {
      active = false
      window.clearTimeout(timer)
    }
  }, [artwork, demo, screen])

  const resetDisplay = useCallback(async () => {
    if (demo) {
      setArtwork(null)
      setJobId('')
      setState('waiting')
      return
    }
    try {
      const response = await fetch('/api/reveal/ack', {
        body: JSON.stringify({ jobId, screen }),
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      })
      if (!response.ok) throw new Error('reset unavailable')
      setResetError('')
      setArtwork(null)
      setJobId('')
      setState('waiting')
    } catch {
      setResetError('Portrait complete. Resetting this display…')
      window.setTimeout(resetDisplay, 2500)
    }
  }, [demo, jobId, screen])

  if (artwork) {
    return (
      <>
        <SketchReveal artwork={artwork} name={guestName} onRevealComplete={resetDisplay} showActions={false} />
        {resetError && <p className="display-reset-message" role="status">{resetError}</p>}
      </>
    )
  }

  return <WaitingScreen screen={screen} state={state} />
}
