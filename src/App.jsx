import { useEffect, useRef, useState } from 'react'
import DisplayReveal from './DisplayReveal'

const steps = [
  ['01', 'Your name'],
  ['02', 'Your selfie'],
  ['03', 'The reveal'],
]

function pathForRoute() {
  const path = window.location.pathname.replace(/\/+$/, '')
  return path || '/'
}

function demoRevealRequested() {
  return new URLSearchParams(window.location.search).get('demo') === '1'
}

function screenForStation() {
  const value = new URLSearchParams(window.location.search).get('screen')?.trim().toLowerCase()
  return value && /^[a-z0-9][a-z0-9_-]{0,47}$/i.test(value) ? value : 'main'
}

function navigate(path, replace = false) {
  window.history[replace ? 'replaceState' : 'pushState']({}, '', path)
  window.dispatchEvent(new PopStateEvent('popstate'))
}

function Stepper({ current }) {
  return (
    <ol className="stepper" aria-label="Portrait progress">
      {steps.map(([number, label], index) => (
        <li key={number} className={index === current ? 'active' : index < current ? 'complete' : ''}>
          <span>{index < current ? '✓' : number}</span>
          <b>{label}</b>
        </li>
      ))}
    </ol>
  )
}

function Welcome({ initialName, onProceed }) {
  const [name, setName] = useState(initialName)
  const [touched, setTouched] = useState(false)
  const valid = name.trim().length >= 2

  function submit(event) {
    event.preventDefault()
    setTouched(true)
    if (valid) onProceed(name.trim())
  }

  return (
    <main className="screen intro-screen">
      <div className="intro-copy">
        <p className="eyebrow">A portrait session in pencil</p>
        <h1>Meet your<br /><i>illustrated</i> self.</h1>
        <p className="lede">We’ll turn one selfie into an original caricature, then let you watch it emerge stroke by stroke.</p>
      </div>

      <form className="name-card" onSubmit={submit} noValidate>
        <label htmlFor="guest-name">What should we call you?</label>
        <div className="name-field">
          <input
            autoComplete="name"
            autoFocus
            id="guest-name"
            maxLength="48"
            onChange={(event) => setName(event.target.value)}
            onBlur={() => setTouched(true)}
            placeholder="Your first name"
            value={name}
          />
          <button className="primary" type="submit">Proceed</button>
        </div>
        {touched && !valid && <p className="field-error" role="alert">Please enter at least two characters.</p>}
        <p className="quiet">Your name stays in this browser and is never sent with your photo.</p>
      </form>
    </main>
  )
}

function compressPortrait(file) {
  return new Promise((resolve, reject) => {
    if (!file?.type?.startsWith('image/')) {
      reject(new Error('Choose a JPG, PNG, or WebP image.'))
      return
    }

    const image = new Image()
    const source = URL.createObjectURL(file)
    image.onload = () => {
      URL.revokeObjectURL(source)
      const maxEdge = 1600
      const scale = Math.min(1, maxEdge / Math.max(image.naturalWidth, image.naturalHeight))
      const width = Math.max(1, Math.round(image.naturalWidth * scale))
      const height = Math.max(1, Math.round(image.naturalHeight * scale))
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const context = canvas.getContext('2d')
      context.fillStyle = '#ffffff'
      context.fillRect(0, 0, width, height)
      context.drawImage(image, 0, 0, width, height)
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error('We could not prepare that photo. Please try another one.'))
          return
        }
        resolve(new File([blob], 'studio-selfie.jpg', { type: 'image/jpeg' }))
      }, 'image/jpeg', 0.92)
    }
    image.onerror = () => {
      URL.revokeObjectURL(source)
      reject(new Error('We could not read that image. Please try a JPG, PNG, or WebP photo.'))
    }
    image.src = source
  })
}

function Capture({ name, onComplete, onBack, screen }) {
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const [cameraOpen, setCameraOpen] = useState(false)
  const [photo, setPhoto] = useState(null)
  const [preview, setPreview] = useState(null)
  const [consent, setConsent] = useState(false)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [progress, setProgress] = useState(0)

  useEffect(() => () => {
    streamRef.current?.getTracks().forEach((track) => track.stop())
  }, [])

  useEffect(() => {
    if (!photo) {
      setPreview(null)
      return undefined
    }
    const url = URL.createObjectURL(photo)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [photo])

  function stopCamera() {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    setCameraOpen(false)
  }

  async function openCamera() {
    setError('')
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Camera capture is not supported in this browser. You can upload a photo instead.')
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: 'user', width: { ideal: 1440 }, height: { ideal: 1440 } },
      })
      streamRef.current = stream
      setCameraOpen(true)
      requestAnimationFrame(() => {
        if (videoRef.current) videoRef.current.srcObject = stream
      })
    } catch {
      setError('We could not open your camera. Check its permission, or choose a photo from your device.')
    }
  }

  function capturePhoto() {
    const video = videoRef.current
    if (!video?.videoWidth || !video?.videoHeight) return
    const maxEdge = 1600
    const scale = Math.min(1, maxEdge / Math.max(video.videoWidth, video.videoHeight))
    const width = Math.round(video.videoWidth * scale)
    const height = Math.round(video.videoHeight * scale)
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    context.translate(width, 0)
    context.scale(-1, 1)
    context.drawImage(video, 0, 0, width, height)
    canvas.toBlob((blob) => {
      if (blob) {
        setPhoto(new File([blob], 'studio-selfie.jpg', { type: 'image/jpeg' }))
        setConsent(false)
        setError('')
      }
    }, 'image/jpeg', 0.92)
    stopCamera()
  }

  async function chooseFile(event) {
    const selected = event.target.files?.[0]
    event.target.value = ''
    if (!selected) return
    setError('')
    try {
      setPhoto(await compressPortrait(selected))
      setConsent(false)
    } catch (reason) {
      setError(reason.message)
    }
  }

  function retake() {
    setPhoto(null)
    setConsent(false)
    setError('')
  }

  async function submit() {
    if (!photo || !consent || submitting) return
    setSubmitting(true)
    setError('')
    setProgress(9)
    const timer = window.setInterval(() => {
      setProgress((value) => Math.min(90, value + (value < 42 ? 6 : value < 70 ? 3 : 1)))
    }, 700)

    try {
      const form = new FormData()
      form.append('guestName', name)
      form.append('screen', screen)
      form.append('selfie', photo)
      const response = await fetch('/api/caricature', {
        body: form,
        credentials: 'same-origin',
        method: 'POST',
      })
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        throw new Error(payload.message || 'The studio could not finish this portrait. Please try again.')
      }
      const payload = await response.json().catch(() => ({}))
      if (payload.status !== 'ready') throw new Error('The studio could not prepare the portrait display. Please try again.')
      window.clearInterval(timer)
      setProgress(100)
      await onComplete()
    } catch (reason) {
      window.clearInterval(timer)
      setError(reason.message || 'The studio could not finish this portrait. Please try again.')
      setSubmitting(false)
      setProgress(0)
    }
  }

  if (submitting) {
    return (
      <main className="screen making-screen" aria-live="polite">
        <div className="making-mark" aria-hidden="true"><span /><span /><span /></div>
        <p className="eyebrow">Portrait in progress</p>
        <h1>Our artist is finding your <i>best lines.</i></h1>
        <p className="lede">We’re first preparing {name}’s portrait, then shaping the caricature. Keep this page open for a moment.</p>
        <div className="progress-track" aria-label={`${progress}% complete`} role="progressbar" aria-valuemax="100" aria-valuemin="0" aria-valuenow={progress}>
          <i style={{ width: `${progress}%` }} />
        </div>
        <p className="progress-copy">{progress < 45 ? 'Removing the background…' : progress < 78 ? 'Preparing the caricature…' : 'Putting on the final touches…'}</p>
      </main>
    )
  }

  return (
    <main className="screen capture-screen">
      <button className="text-button back-button" onClick={onBack} type="button">Back</button>
      <p className="eyebrow">Hello, {name}</p>
      <h1>Let’s take your <i>portrait.</i></h1>
      <p className="lede">Use a bright, front-facing selfie. We’ll first isolate your portrait, then create your caricature.</p>

      <section className={`camera-card ${photo ? 'has-photo' : ''}`} aria-label="Selfie capture">
        {!photo && !cameraOpen && (
          <div className="capture-choice">
            <div className="portrait-glyph" aria-hidden="true"><span /></div>
            <h2>Ready when you are</h2>
            <p>Look toward the light and keep your face comfortably in frame.</p>
            <div className="choice-actions">
              <button className="primary" onClick={openCamera} type="button">Open camera</button>
              <label className="secondary file-picker-button">
                <span>Choose a photo</span>
                <input accept="image/*" aria-label="Choose a photo from your gallery" onChange={chooseFile} type="file" />
              </label>
            </div>
          </div>
        )}

        {!photo && cameraOpen && (
          <div className="live-camera">
            <video autoPlay muted playsInline ref={videoRef} />
            <div className="face-guide" aria-hidden="true" />
            <div className="camera-actions">
              <button className="secondary on-dark" onClick={stopCamera} type="button">Cancel</button>
              <button aria-label="Capture selfie" className="shutter" onClick={capturePhoto} type="button"><span /></button>
              <span className="camera-space" aria-hidden="true" />
            </div>
          </div>
        )}

        {photo && preview && (
          <div className="photo-review">
            <img alt="Your selected selfie" src={preview} />
            <button className="retake-button" onClick={retake} type="button">Retake</button>
          </div>
        )}
      </section>

      {error && <p className="form-message" role="alert">{error}</p>}

      {photo && (
        <div className="submit-area">
          <label className="consent-row">
            <input checked={consent} onChange={(event) => setConsent(event.target.checked)} type="checkbox" />
            <span>I have permission to use this photo to make an original caricature.</span>
          </label>
          <button className="primary wide" disabled={!consent} onClick={submit} type="button">Submit my selfie</button>
          <p className="quiet centered">Your photo is used only for this creation. The finished portrait is held briefly for the display, then removed after its reveal.</p>
        </div>
      )}
    </main>
  )
}

export default function App() {
  const [route, setRoute] = useState(pathForRoute)
  const [name, setName] = useState('')
  const [screen] = useState(screenForStation)
  const demoReveal = route === '/reveal' && demoRevealRequested()

  useEffect(() => {
    const onPopState = () => setRoute(pathForRoute())
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  useEffect(() => {
    const titles = { '/': 'Sketch Studio', '/selfie': 'Your selfie · Sketch Studio', '/reveal': 'Your portrait · Sketch Studio' }
    document.title = titles[route] || 'Sketch Studio'
  }, [route])

  useEffect(() => {
    if (route === '/selfie' && !name) navigate(`${screen === 'main' ? '/' : `/?screen=${encodeURIComponent(screen)}`}`, true)
  }, [name, route, screen])

  function go(path) {
    navigate(`${path}${screen === 'main' ? '' : `?screen=${encodeURIComponent(screen)}`}`)
  }

  function begin(nextName) {
    setName(nextName)
    go('/selfie')
  }

  function complete() {
    setName('')
    go('/')
  }

  function startAgain() {
    setName('')
    go('/')
  }

  const step = route === '/selfie' ? 1 : route === '/reveal' ? 2 : 0
  const isDisplay = route === '/reveal'

  return (
    <div className="app-shell">
      <header className="site-header">
        {isDisplay ? <span className="brand" aria-label="Sketch Studio display">
          <span className="brand-mark" aria-hidden="true">S</span>
          <span>Sketch <i>Studio</i></span>
        </span> : <button className="brand" onClick={startAgain} type="button" aria-label="Start a new Sketch Studio portrait">
          <span className="brand-mark" aria-hidden="true">S</span>
          <span>Sketch <i>Studio</i></span>
        </button>}
        <span className="header-note">{isDisplay ? 'Live portrait display' : 'Original portraits, drawn with AI'}</span>
      </header>

      {!isDisplay && <Stepper current={step} />}

      {route === '/selfie' && name && <Capture name={name} onBack={() => go('/')} onComplete={complete} screen={screen} />}
      {route === '/reveal' && <DisplayReveal demo={demoReveal} />}
      {route === '/' && <Welcome initialName={name} onProceed={begin} />}

      {!isDisplay && <footer className="site-footer"><span>Sketch Studio</span><span>Made for a little more character.</span></footer>}
    </div>
  )
}
