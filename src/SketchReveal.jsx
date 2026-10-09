import { useEffect, useRef, useState } from 'react'
import { buildLayers, fitSize, PAPER } from './sketch'

const sketchOptions = {
  colour: true,
  cstr: 0.82,
  ctr: 1.2,
  dark: 1.02,
  detail: 6,
  edge: 0.67,
  invert: false,
  shade: 0.67,
  speed: 11,
}

export default function SketchReveal({ artwork, name, onRevealComplete, onStartAgain, showActions = true }) {
  const canvasRef = useRef(null)
  const pencilRef = useRef(null)
  const layersRef = useRef(null)
  const sizeRef = useRef({ W: 0, H: 0 })
  const animationRef = useRef(0)
  const returnTimerRef = useRef(0)
  const [phase, setPhase] = useState('Preparing your drawing paper…')
  const [progress, setProgress] = useState(0)
  const [complete, setComplete] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let imageUrl = ''
    let cancelled = false

    function stop() {
      cancelAnimationFrame(animationRef.current)
      animationRef.current = 0
      window.clearTimeout(returnTimerRef.current)
    }

    function showFinal() {
      const layers = layersRef.current
      const canvas = canvasRef.current
      if (!layers || !canvas) return
      canvas.getContext('2d').drawImage(layers.Original, 0, 0)
    }

    function finish() {
      stop()
      showFinal()
      if (pencilRef.current) pencilRef.current.style.display = 'none'
      setProgress(100)
      setPhase('Your portrait is complete.')
      setComplete(true)
      returnTimerRef.current = window.setTimeout(() => onRevealComplete(), 5000)
    }

    function play() {
      const layers = layersRef.current
      const canvas = canvasRef.current
      if (!layers || !canvas || cancelled) return
      const { W, H } = sizeRef.current
      const context = canvas.getContext('2d')
      context.fillStyle = `rgb(${PAPER})`
      context.fillRect(0, 0, W, H)

      const radius = Math.max(W, H) / 43
      const gap = radius * 1.03
      const step = radius * 0.78
      const phases = [
        { label: 'Pencilling the first contours…', source: layers.A, swap: false },
        { label: 'Building the character and shade…', source: layers.B, swap: true },
        { label: 'Bringing back the original colour…', source: layers.Original, swap: false },
      ]
      let phaseIndex = 0
      let u = 0
      let v = radius * 0.5
      let direction = 1

      if (pencilRef.current) pencilRef.current.style.display = 'block'
      setPhase(phases[0].label)

      const frame = () => {
        if (cancelled) return
        const current = phases[phaseIndex]
        const horizontal = current.swap ? H : W
        const vertical = current.swap ? W : H
        let x = 0
        let y = 0

        for (let index = 0; index < sketchOptions.speed; index += 1) {
          u += direction * step
          if (u > horizontal + radius * 0.5 || u < -radius * 0.5) {
            direction *= -1
            u = Math.min(Math.max(u, -radius * 0.5), horizontal + radius * 0.5)
            v += gap
          }
          if (v > vertical + radius) {
            phaseIndex += 1
            if (phaseIndex >= phases.length) {
              finish()
              return
            }
            u = 0
            v = radius * 0.5
            direction = 1
            setPhase(phases[phaseIndex].label)
            break
          }
          const wavering = v + Math.sin(u * 0.045 + v) * gap * 0.42 + (Math.random() - 0.5) * gap * 0.42
          x = current.swap ? wavering : u
          y = current.swap ? u : wavering
          context.save()
          context.beginPath()
          context.arc(x, y, radius, 0, Math.PI * 2)
          context.clip()
          context.drawImage(current.source, 0, 0)
          context.restore()
        }

        if (pencilRef.current) {
          pencilRef.current.style.left = `${Math.max(0, Math.min(100, (x / W) * 100))}%`
          pencilRef.current.style.top = `${Math.max(0, Math.min(100, (y / H) * 100))}%`
        }
        setProgress(((phaseIndex + Math.min(v / vertical, 1)) / phases.length) * 100)
        animationRef.current = requestAnimationFrame(frame)
      }
      animationRef.current = requestAnimationFrame(frame)
    }

    const image = new Image()
    imageUrl = URL.createObjectURL(artwork)
    image.onload = () => {
      if (cancelled) return
      try {
        const canvas = canvasRef.current
        const size = fitSize(image, 1000)
        sizeRef.current = size
        canvas.width = size.W
        canvas.height = size.H
        const original = document.createElement('canvas')
        original.width = size.W
        original.height = size.H
        original.getContext('2d').drawImage(image, 0, 0, size.W, size.H)
        layersRef.current = { ...buildLayers(image, size.W, size.H, sketchOptions), Original: original }
        window.setTimeout(play, 380)
      } catch {
        setError('We could not sketch this portrait. Please try making another one.')
      }
    }
    image.onerror = () => setError('We could not open this portrait. Please try making another one.')
    image.src = imageUrl

    return () => {
      cancelled = true
      stop()
      URL.revokeObjectURL(imageUrl)
    }
  }, [artwork, onRevealComplete])

  function skip() {
    cancelAnimationFrame(animationRef.current)
    const layers = layersRef.current
    const canvas = canvasRef.current
    if (!layers || !canvas) return
    canvas.getContext('2d').drawImage(layers.Original, 0, 0)
    if (pencilRef.current) pencilRef.current.style.display = 'none'
    setProgress(100)
    setComplete(true)
    setPhase('Your portrait is complete.')
    window.clearTimeout(returnTimerRef.current)
    returnTimerRef.current = window.setTimeout(() => onRevealComplete(), 5000)
  }

  function download() {
    canvasRef.current?.toBlob((blob) => {
      if (!blob) return
      const link = document.createElement('a')
      link.href = URL.createObjectURL(blob)
      link.download = `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'my'}-sketch-studio-caricature.png`
      link.click()
      window.setTimeout(() => URL.revokeObjectURL(link.href), 1000)
    }, 'image/png')
  }

  return (
    <main className="screen reveal-screen">
      <div className="reveal-heading">
        <p className="eyebrow">The big reveal</p>
        <h1>{complete ? <>There you are, <i>{name}.</i></> : <>Your portrait is being <i>drawn.</i></>}</h1>
        <p className="lede">{complete ? 'An original caricature, made just for you.' : 'Every line is appearing live in the studio.'}</p>
      </div>

      <section className="reveal-card" aria-live="polite">
        <div className="reveal-art">
          <canvas ref={canvasRef} aria-label="Your caricature being drawn" />
          <span className="pencil-cursor" ref={pencilRef} aria-hidden="true">✎</span>
          {!complete && !error && <div className="paper-label"><span>SKETCH STUDIO</span><small>original portrait</small></div>}
        </div>
        <div className="reveal-status">
          <div className="thin-progress"><i style={{ width: `${progress}%` }} /></div>
          <p>{error || (complete ? 'Returning to Sketch Studio…' : phase)}</p>
          {showActions && !complete && !error && <button className="text-button" onClick={skip} type="button">Reveal now</button>}
        </div>
      </section>

      {complete && showActions && <div className="reveal-actions"><button className="primary" onClick={download} type="button">Download portrait</button>{onStartAgain && <button className="secondary" onClick={onStartAgain} type="button">Return now</button>}</div>}
      {error && onStartAgain && <button className="primary" onClick={onStartAgain} type="button">Start again</button>}
    </main>
  )
}
