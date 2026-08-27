export type PreprocessKind = 'photo' | 'design'

export type PreprocessVariant = 'soft' | 'binary' | 'invert'

export interface PreprocessOptions {
  kind?: PreprocessKind
  variant?: PreprocessVariant
}

export interface PreprocessResult {
  canvas: HTMLCanvasElement
  scale: number
  variant: PreprocessVariant
}

export interface OcrVariantSet {
  variants: PreprocessResult[]
  primary: PreprocessResult
}

const TARGET_MIN_DIM: Record<PreprocessKind, number> = {
  photo: 3600,
  design: 2400,
}

const MAX_SCALE: Record<PreprocessKind, number> = {
  photo: 5,
  design: 4,
}

const MIN_SCALE: Record<PreprocessKind, number> = {
  photo: 1.5,
  design: 2,
}

const MAX_PIXELS = 24_000_000

/** OCR용 확대 배율 */
export function computeOcrScale(
  width: number,
  height: number,
  kind: PreprocessKind = 'photo',
): number {
  const minDim = Math.min(width, height)
  const autoScale = TARGET_MIN_DIM[kind] / minDim
  let scale = Math.min(MAX_SCALE[kind], Math.max(MIN_SCALE[kind], autoScale))

  const pixels = width * height * scale * scale
  if (pixels > MAX_PIXELS) {
    scale = Math.sqrt(MAX_PIXELS / (width * height))
    scale = Math.max(MIN_SCALE[kind], Math.round(scale * 10) / 10)
  }

  return Math.round(scale * 10) / 10
}

function drawScaled(source: HTMLCanvasElement, scale: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(source.width * scale)
  canvas.height = Math.round(source.height * scale)

  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas context 생성 실패')

  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height)
  return canvas
}

function toGrays(canvas: HTMLCanvasElement): {
  grays: number[]
  width: number
  height: number
  data: Uint8ClampedArray
} {
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas context 생성 실패')

  const img = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const d = img.data
  const grays: number[] = []

  for (let i = 0; i < d.length; i += 4) {
    grays.push(Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]))
  }

  return { grays, width: canvas.width, height: canvas.height, data: d }
}

function stretchContrast(grays: number[]): number[] {
  let min = 255
  let max = 0
  for (const g of grays) {
    min = Math.min(min, g)
    max = Math.max(max, g)
  }
  const range = max - min || 1
  return grays.map((g) => ((g - min) / range) * 255)
}

function sharpenGrays(grays: number[], width: number, height: number): number[] {
  const out = grays.slice()
  const kernel = [0, -1, 0, -1, 5, -1, 0, -1, 0]

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      let sum = 0
      let ki = 0
      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          sum += grays[(y + ky) * width + (x + kx)] * kernel[ki++]
        }
      }
      out[y * width + x] = Math.max(0, Math.min(255, sum))
    }
  }

  return out
}

/**
 * 비닐/은박 포장재 특유의 국소적 빛반사(Glare/Specular Reflection) 및 그림자 얼룩 제거
 * 배경의 완만한 밝기 변화(저주파 조명 성분)를 차감하여 글자(고주파 성분)만 또렷하게 부각시킵니다.
 */
function suppressGlare(grays: number[], width: number, height: number): number[] {
  const out = new Array(grays.length)
  const blockSize = Math.max(16, Math.floor(width / 30))
  const half = Math.floor(blockSize / 2)

  // 1. 빠른 국소 평균 배경 조명 맵 근사
  // 적분 이미지(Integral Image) 생성
  const integral = new Float64Array((width + 1) * (height + 1))
  for (let y = 0; y < height; y++) {
    let rowSum = 0
    for (let x = 0; x < width; x++) {
      rowSum += grays[y * width + x]
      integral[(y + 1) * (width + 1) + (x + 1)] =
        integral[y * (width + 1) + (x + 1)] + rowSum
    }
  }

  for (let y = 0; y < height; y++) {
    const y0 = Math.max(0, y - half)
    const y1 = Math.min(height, y + half + 1)
    for (let x = 0; x < width; x++) {
      const x0 = Math.max(0, x - half)
      const x1 = Math.min(width, x + half + 1)
      const count = (x1 - x0) * (y1 - y0)
      
      const sum =
        integral[y1 * (width + 1) + x1] -
        integral[y0 * (width + 1) + x1] -
        integral[y1 * (width + 1) + x0] +
        integral[y0 * (width + 1) + x0]
      
      const localMean = sum / count
      const pixel = grays[y * width + x]
      
      // 조명 편차 보정: 국소 평균 대비 글자 엣지 강화 (반사광 영역 대비 상승)
      const diff = pixel - localMean
      const enhanced = 128 + diff * 1.6
      out[y * width + x] = Math.max(0, Math.min(255, enhanced))
    }
  }

  return out
}

/** 적응형 이진화 (Adaptive Local Thresholding - 빛반사 얼룩 대응) */
function adaptiveThreshold(grays: number[], width: number, height: number, C = 7): number[] {
  const out = new Array(grays.length)
  const blockSize = Math.max(15, Math.floor(width / 40) | 1)
  const half = Math.floor(blockSize / 2)

  const integral = new Float64Array((width + 1) * (height + 1))
  for (let y = 0; y < height; y++) {
    let rowSum = 0
    for (let x = 0; x < width; x++) {
      rowSum += grays[y * width + x]
      integral[(y + 1) * (width + 1) + (x + 1)] =
        integral[y * (width + 1) + (x + 1)] + rowSum
    }
  }

  for (let y = 0; y < height; y++) {
    const y0 = Math.max(0, y - half)
    const y1 = Math.min(height, y + half + 1)
    for (let x = 0; x < width; x++) {
      const x0 = Math.max(0, x - half)
      const x1 = Math.min(width, x + half + 1)
      const count = (x1 - x0) * (y1 - y0)
      
      const sum =
        integral[y1 * (width + 1) + x1] -
        integral[y0 * (width + 1) + x1] -
        integral[y1 * (width + 1) + x0] +
        integral[y0 * (width + 1) + x0]
      
      const localMean = sum / count
      const pixel = grays[y * width + x]
      out[y * width + x] = pixel < (localMean - C) ? 0 : 255
    }
  }

  return out
}

function otsuThreshold(grays: number[]): number {
  const hist = new Array(256).fill(0)
  for (const g of grays) hist[g]++

  const total = grays.length
  let sum = 0
  for (let i = 0; i < 256; i++) sum += i * hist[i]

  let sumB = 0
  let wB = 0
  let maxVar = 0
  let threshold = 128

  for (let t = 0; t < 256; t++) {
    wB += hist[t]
    if (wB === 0) continue

    const wF = total - wB
    if (wF === 0) break

    sumB += t * hist[t]
    const mB = sumB / wB
    const mF = (sum - sumB) / wF
    const between = wB * wF * (mB - mF) ** 2

    if (between > maxVar) {
      maxVar = between
      threshold = t
    }
  }

  return threshold
}

function applyGrayToCanvas(
  canvas: HTMLCanvasElement,
  grays: number[],
  invert = false,
): HTMLCanvasElement {
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas context 생성 실패')

  const img = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const d = img.data

  for (let i = 0, gi = 0; i < d.length; i += 4, gi++) {
    const v = invert ? 255 - grays[gi] : grays[gi]
    d[i] = d[i + 1] = d[i + 2] = v
    d[i + 3] = 255
  }

  ctx.putImageData(img, 0, 0)
  return canvas
}

function applyBinaryToCanvas(canvas: HTMLCanvasElement, grays: number[]): HTMLCanvasElement {
  const threshold = otsuThreshold(grays)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas context 생성 실패')

  const img = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const d = img.data

  for (let i = 0, gi = 0; i < d.length; i += 4, gi++) {
    const bin = grays[gi] > threshold ? 255 : 0
    d[i] = d[i + 1] = d[i + 2] = bin
    d[i + 3] = 255
  }

  ctx.putImageData(img, 0, 0)
  return canvas
}

/** 단일 전처리 변형 (빛반사 제거 및 적응형 전처리 탑재) */
export function preprocessForOcr(
  source: HTMLCanvasElement,
  options: PreprocessOptions = {},
): PreprocessResult {
  const kind = options.kind ?? 'photo'
  const variant = options.variant ?? (kind === 'photo' ? 'soft' : 'binary')
  const scale = computeOcrScale(source.width, source.height, kind)
  const scaled = drawScaled(source, scale)
  const { grays, width, height } = toGrays(scaled)

  if (kind === 'photo') {
    // 실사 사진: 빛반사(Glare) 억제 및 국소 조명 정규화 1차 적용
    const deglared = suppressGlare(grays, width, height)
    const stretched = stretchContrast(deglared)

    if (variant === 'binary') {
      // 적응형 국소 이진화 (빛반사로 하얗게 뜬 영역도 글자 복원)
      const binGrays = adaptiveThreshold(stretched, width, height)
      applyGrayToCanvas(scaled, binGrays, false)
    } else if (variant === 'invert') {
      applyGrayToCanvas(scaled, stretched, true)
    } else {
      const sharpened = sharpenGrays(stretched, width, height)
      applyGrayToCanvas(scaled, sharpened, false)
    }
  } else {
    // 시안 원본: 오츠 글로벌 이진화/대비 스트레칭
    const stretched = stretchContrast(grays)
    if (variant === 'binary') {
      applyBinaryToCanvas(scaled, stretched)
    } else {
      applyGrayToCanvas(scaled, stretched, false)
    }
  }

  return { canvas: scaled, scale, variant }
}

/** 실사: 여러 전처리 + 시안: 이진화 1종 */
export function buildOcrVariants(
  source: HTMLCanvasElement,
  kind: PreprocessKind = 'photo',
): OcrVariantSet {
  if (kind === 'design') {
    const primary = preprocessForOcr(source, { kind, variant: 'binary' })
    return { variants: [primary], primary }
  }

  const variants = (['soft', 'binary', 'invert'] as PreprocessVariant[]).map((variant) =>
    preprocessForOcr(source, { kind, variant }),
  )

  return { variants, primary: variants[0] }
}

/** File → Canvas */
export async function fileToCanvas(file: File): Promise<HTMLCanvasElement> {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = reject
      el.src = url
    })
    const canvas = document.createElement('canvas')
    canvas.width = img.naturalWidth
    canvas.height = img.naturalHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas context 생성 실패')
    ctx.drawImage(img, 0, 0)
    return canvas
  } finally {
    URL.revokeObjectURL(url)
  }
}
