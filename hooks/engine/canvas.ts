import { bayer, mix } from './palette'

/** An RGB pixel buffer; every drawing call clips at the edges. */
export class Canvas {
  readonly px: Uint32Array

  constructor(
    readonly w: number,
    readonly h: number,
  ) {
    this.px = new Uint32Array(w * h)
  }

  set(x: number, y: number, color: number) {
    const ix = Math.floor(x)
    const iy = Math.floor(y)
    if (ix < 0 || iy < 0 || ix >= this.w || iy >= this.h) return
    this.px[iy * this.w + ix] = color
  }

  get(x: number, y: number): number {
    const ix = x < 0 ? 0 : x >= this.w ? this.w - 1 : Math.floor(x)
    const iy = y < 0 ? 0 : y >= this.h ? this.h - 1 : Math.floor(y)
    return this.px[iy * this.w + ix]!
  }

  /** Blends `color` over the pixel by `k`, dithered to four steps. */
  glow(x: number, y: number, color: number, k: number) {
    if (k <= 0) return
    const ix = Math.floor(x)
    const iy = Math.floor(y)
    if (ix < 0 || iy < 0 || ix >= this.w || iy >= this.h) return
    const q = Math.min(1, Math.floor(k * 4 + bayer(ix, iy)) / 4)
    if (q <= 0) return
    const at = iy * this.w + ix
    this.px[at] = mix(this.px[at]!, color, q)
  }

  fill(color: number) {
    this.px.fill(color)
  }

  rect(x0: number, y0: number, w: number, h: number, color: number) {
    for (let y = Math.max(0, Math.floor(y0)); y < Math.min(this.h, y0 + h); y++)
      for (let x = Math.max(0, Math.floor(x0)); x < Math.min(this.w, x0 + w); x++) this.px[y * this.w + x] = color
  }

  /** A filled disc colored by distance from its center, `inks[0]` at the center. */
  disc(cx: number, cy: number, r: number, inks: readonly number[]) {
    if (r <= 0) return
    for (let y = Math.floor(cy - r - 1); y <= cy + r + 1; y++)
      for (let x = Math.floor(cx - r - 1); x <= cx + r + 1; x++) {
        const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) / r
        if (d >= 1) continue
        const f = d * inks.length
        const i = Math.min(inks.length - 1, Math.floor(f + (bayer(x, y) - 0.5) * 0.9))
        this.set(x, y, inks[Math.max(0, i)]!)
      }
  }

  /** A ring of `thickness` pixels at radius `r`. */
  ring(cx: number, cy: number, r: number, thickness: number, color: number, k = 1) {
    for (let y = Math.floor(cy - r - thickness - 1); y <= cy + r + thickness + 1; y++)
      for (let x = Math.floor(cx - r - thickness - 1); x <= cx + r + thickness + 1; x++) {
        const d = Math.abs(Math.hypot(x + 0.5 - cx, y + 0.5 - cy) - r)
        if (d < thickness) this.glow(x, y, color, k * (1 - d / thickness))
      }
  }

  /** A soft round glow: `k` at the center fading to nothing at `r`. */
  halo(cx: number, cy: number, r: number, color: number, k: number) {
    for (let y = Math.floor(cy - r); y <= cy + r; y++)
      for (let x = Math.floor(cx - r); x <= cx + r; x++) {
        const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) / r
        if (d < 1) this.glow(x, y, color, k * (1 - d) * (1 - d))
      }
  }

  line(x0: number, y0: number, x1: number, y1: number, color: number) {
    const n = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))))
    for (let i = 0; i <= n; i++) this.set(x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n, color)
  }
}

/** Sentinel for a see-through sprite pixel; real colors are 24-bit. */
export const CLEAR = 0xff000000
