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

/** 합본 시안 → 앞·뒤 Canvas 분리 (사용자 지정 splitRatio 0.1~0.9 반영 및 외곽 치수선 트리밍) */
export function splitDesignCanvas(
  img: HTMLImageElement,
  mode: SplitMode,
  frontSide: FrontSide,
  splitRatio = 0.5,
): { front: HTMLCanvasElement; back: HTMLCanvasElement } {
  const w = img.naturalWidth
  const h = img.naturalHeight
  const front = document.createElement('canvas')
  const back = document.createElement('canvas')

  // splitRatio는 10% ~ 90% 사이로 안전 제한
  const ratio = Math.max(0.1, Math.min(0.9, splitRatio))

  if (mode === 'horizontal') {
    const splitX = Math.floor(w * ratio)

    const firstRaw = { sx: 0, sy: 0, sw: splitX, sh: h }
    const secondRaw = { sx: splitX, sy: 0, sw: w - splitX, sh: h }

    // 외곽 치수선 배제용 이너 크롭
    const firstRect = getInnerCropRect(firstRaw)
    const secondRect = getInnerCropRect(secondRaw)

    drawCrop(front, img, frontSide === 'first' ? firstRect : secondRect)
    drawCrop(back, img, frontSide === 'first' ? secondRect : firstRect)
  } else {
    const splitY = Math.floor(h * ratio)

    const firstRaw = { sx: 0, sy: 0, sw: w, sh: splitY }
    const secondRaw = { sx: 0, sy: splitY, sw: w, sh: h - splitY }

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

/** 분할선 미리보기 (시안 위에 사용자 지정 가이드선 렌더링) */
export function buildSplitPreview(
  img: HTMLImageElement,
  mode: SplitMode,
  splitRatio = 0.5,
  frontSide: FrontSide = 'first',
): string {
  const canvas = document.createElement('canvas')
  canvas.width = img.naturalWidth
  canvas.height = img.naturalHeight
  const ctx = canvas.getContext('2d')
  if (!ctx) return ''

  ctx.drawImage(img, 0, 0)
  
  const ratio = Math.max(0.1, Math.min(0.9, splitRatio))

  ctx.strokeStyle = '#5cb85c'
  ctx.lineWidth = Math.max(4, Math.round(canvas.width / 250))
  ctx.setLineDash([14, 10])

  const fontSize = Math.max(18, Math.round(canvas.width / 35))
  ctx.font = `bold ${fontSize}px sans-serif`

  if (mode === 'horizontal') {
    const x = Math.floor(canvas.width * ratio)
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x, canvas.height)
    ctx.stroke()

    // 뱃지 라벨
    ctx.fillStyle = '#5cb85c'
    const leftLabel = frontSide === 'first' ? ' [ 앞면 (Front) ] ' : ' [ 뒷면 (Back) ] '
    const rightLabel = frontSide === 'first' ? ' [ 뒷면 (Back) ] ' : ' [ 앞면 (Front) ] '
    
    ctx.fillText(leftLabel, Math.max(20, x - 200), 40)
    ctx.fillText(rightLabel, Math.min(canvas.width - 200, x + 20), 40)
  } else {
    const y = Math.floor(canvas.height * ratio)
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(canvas.width, y)
    ctx.stroke()

    ctx.fillStyle = '#5cb85c'
    const topLabel = frontSide === 'first' ? ' [ 앞면 (Front) ] ' : ' [ 뒷면 (Back) ] '
    const bottomLabel = frontSide === 'first' ? ' [ 뒷면 (Back) ] ' : ' [ 앞면 (Front) ] '

    ctx.fillText(topLabel, 20, Math.max(40, y - 20))
    ctx.fillText(bottomLabel, 20, Math.min(canvas.height - 20, y + 40))
  }

  return canvas.toDataURL('image/jpeg', 0.9)
}
