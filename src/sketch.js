// Image -> pencil sketch processing. Pure functions, no React.
export const PAPER = [250, 247, 240]

export function fitSize(img, max = 1000) {
  const s = Math.min(1, max / Math.max(img.width, img.height))
  return { W: Math.round(img.width * s), H: Math.round(img.height * s) }
}

function box(s, d, n, lineStep, el, lines, r) {
  const k = 2 * r + 1
  for (let l = 0; l < lines; l++) {
    const b = l * lineStep
    let sum = 0
    for (let i = -r; i <= r; i++) sum += s[b + Math.min(Math.max(i, 0), n - 1) * el]
    for (let i = 0; i < n; i++) {
      d[b + i * el] = sum / k
      sum += s[b + Math.min(i + r + 1, n - 1) * el] - s[b + Math.max(i - r, 0) * el]
    }
  }
}

function blur(src, W, H, r) {
  r = Math.round(r)
  const a = Float32Array.from(src)
  if (r < 1) return a
  const b = new Float32Array(a.length)
  for (let p = 0; p < 3; p++) {
    box(a, b, W, W, 1, H, r)
    box(b, a, H, 1, W, W, r)
  }
  return a
}

function toCanvas(arr, W, H, inv) {
  const out = document.createElement('canvas')
  out.width = W
  out.height = H
  const c = out.getContext('2d')
  const id = c.createImageData(W, H)
  const p = inv ? [235, 232, 225] : PAPER
  for (let i = 0; i < W * H; i++) {
    const v = Math.min(255, Math.max(0, arr[i])) / 255
    const o = inv ? 1 - v : v
    for (let j = 0; j < 3; j++) id.data[i * 4 + j] = inv ? Math.max(18, o * p[j]) : o * p[j]
    id.data[i * 4 + 3] = 255
  }
  c.putImageData(id, 0, 0)
  return out
}

function colourCanvas(arr, d, W, H, k) {
  const out = document.createElement('canvas')
  out.width = W
  out.height = H
  const c = out.getContext('2d')
  const id = c.createImageData(W, H)
  for (let i = 0; i < W * H; i++) {
    const v = Math.min(255, Math.max(0, arr[i])) / 255
    const ch = [d[i * 4], d[i * 4 + 1], d[i * 4 + 2]]
    const l = 0.299 * ch[0] + 0.587 * ch[1] + 0.114 * ch[2]
    for (let j = 0; j < 3; j++) {
      const s = Math.min(255, Math.max(0, l + (ch[j] - l) * 1.3)) // boost saturation
      id.data[i * 4 + j] = Math.min(255, (PAPER[j] * (1 - k) + s * k) * 1.06) * v
    }
    id.data[i * 4 + 3] = 255
  }
  c.putImageData(id, 0, 0)
  return out
}

// Returns { A: outlines, B: outlines + shading, C: coloured (or null) }
export function buildLayers(img, W, H, o) {
  const t = document.createElement('canvas')
  t.width = W
  t.height = H
  const c = t.getContext('2d', { willReadFrequently: true })
  c.drawImage(img, 0, 0, W, H)
  const d = c.getImageData(0, 0, W, H).data
  const n = W * H
  const g = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const l = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2]
    g[i] = Math.min(255, Math.max(0, (l - 128) * o.ctr + 128))
  }
  const scale = Math.max(W, H) / 1000
  const bl = blur(g, W, H, (34 - o.detail * 3) * scale) // more detail = smaller blur
  const sm = blur(g, W, H, 1.2)
  const eK = o.edge * 1.4
  const la = new Float32Array(n)
  const lb = new Float32Array(n)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x
      const s = Math.min(255, (g[i] * 255) / Math.max(bl[i], 1)) // colour-dodge pencil effect
      const line = 255 - (255 - s) * o.dark
      let mag = 0
      if (x > 0 && y > 0 && x < W - 1 && y < H - 1) {
        const gx = -sm[i - W - 1] - 2 * sm[i - 1] - sm[i + W - 1] + sm[i - W + 1] + 2 * sm[i + 1] + sm[i + W + 1]
        const gy = -sm[i - W - 1] - 2 * sm[i - W] - sm[i - W + 1] + sm[i + W - 1] + 2 * sm[i + W] + sm[i + W + 1]
        mag = Math.sqrt(gx * gx + gy * gy) // Sobel edges
      }
      const a = Math.max(0, Math.min(line, 255 - Math.min(255, mag * eK)))
      la[i] = a
      lb[i] = (a * (255 - (255 - g[i]) * o.shade * 0.75)) / 255
    }
  }
  const colour = o.colour && !o.invert
  return {
    A: toCanvas(la, W, H, o.invert),
    B: toCanvas(lb, W, H, o.invert),
    C: colour ? colourCanvas(lb, d, W, H, o.cstr) : null,
  }
}
