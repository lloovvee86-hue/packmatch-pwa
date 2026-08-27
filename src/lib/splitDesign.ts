/** 시안 합본 분할 방향 */
export type SplitMode = 'horizontal' | 'vertical'

/** 앞면이 위치한 쪽 (first=왼쪽/위, second=오른쪽/아래) */
export type FrontSide = 'first' | 'second'

/**
 * 도련선/외곽 치수선(재단선 밖의 mm 수치, 칼선 가이드)을 제외하고
 * 실제 인쇄물 디자인 본 영역만 판독할 수 있도록 안전 마진(패딩 4%)을 적용하여 크롭합니다.
 */
function getInnerCropRect(
  fullRect: { sx: number; sy: number; sw: number; sh: number },
  marginPercent = 0.04,
) {
  const mx = Math.floor(fullRect.sw * marginPercent)
  const my = Math.floor(fullRect.sh * marginPercent)
  return {
    sx: fullRect.sx + mx,
    sy: fullRect.sy + my,
    sw: Math.max(10, fullRect.sw - mx * 2),
    sh: Math.max(10, fullRect.sh - my * 2),
  }
}

/** 합본 시안 → 앞·뒤 Canvas 분리 (외곽 치수선/도련 자동 트리밍) */
export function splitDesignCanvas(
  img: HTMLImageElement,
  mode: SplitMode,
  frontSide: FrontSide,
): { front: HTMLCanvasElement; back: HTMLCanvasElement } {
  const w = img.naturalWidth
  const h = img.naturalHeight
  const front = document.createElement('canvas')
  const back = document.createElement('canvas')

  if (mode === 'horizontal') {
    const half = Math.floor(w / 2)

    const firstRaw = { sx: 0, sy: 0, sw: half, sh: h }
    const secondRaw = { sx: half, sy: 0, sw: w - half, sh: h }

    // 외곽 치수선 배제용 이너 크롭
    const firstRect = getInnerCropRect(firstRaw)
    const secondRect = getInnerCropRect(secondRaw)

    drawCrop(front, img, frontSide === 'first' ? firstRect : secondRect)
    drawCrop(back, img, frontSide === 'first' ? secondRect : firstRect)
  } else {
    const half = Math.floor(h / 2)

    const firstRaw = { sx: 0, sy: 0, sw: w, sh: half }
    const secondRaw = { sx: 0, sy: half, sw: w, sh: h - half }

    // 외곽 치수선 배제용 이너 크롭
    const firstRect = getInnerCropRect(firstRaw)
    const secondRect = getInnerCropRect(secondRaw)

    drawCrop(front, img, frontSide === 'first' ? firstRect : secondRect)
    drawCrop(back, img, frontSide === 'first' ? secondRect : firstRect)
  }

  return { front, back }
}

function drawCrop(
  canvas: HTMLCanvasElement,
  img: HTMLImageElement,
  rect: { sx: number; sy: number; sw: number; sh: number },
) {
  canvas.width = rect.sw
  canvas.height = rect.sh
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas context 생성 실패')
  ctx.drawImage(img, rect.sx, rect.sy, rect.sw, rect.sh, 0, 0, rect.sw, rect.sh)
}

/** 분할선 미리보기 (시안 위에 가이드선) */
export function buildSplitPreview(
  img: HTMLImageElement,
  mode: SplitMode,
): string {
  const canvas = document.createElement('canvas')
  canvas.width = img.naturalWidth
  canvas.height = img.naturalHeight
  const ctx = canvas.getContext('2d')
  if (!ctx) return ''

  ctx.drawImage(img, 0, 0)
  ctx.strokeStyle = '#4f46e5'
  ctx.lineWidth = Math.max(2, Math.round(canvas.width / 400))
  ctx.setLineDash([12, 8])

  if (mode === 'horizontal') {
    const x = Math.floor(canvas.width / 2)
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x, canvas.height)
    ctx.stroke()
    ctx.font = `bold ${Math.max(14, canvas.width / 50)}px sans-serif`
    ctx.fillStyle = '#4f46e5'
    ctx.fillText('앞 | 뒤', x + 8, 28)
  } else {
    const y = Math.floor(canvas.height / 2)
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(canvas.width, y)
    ctx.stroke()
    ctx.font = `bold ${Math.max(14, canvas.width / 50)}px sans-serif`
    ctx.fillStyle = '#4f46e5'
    ctx.fillText('앞 / 뒤', 8, y - 8)
  }

  return canvas.toDataURL('image/jpeg', 0.9)
}
