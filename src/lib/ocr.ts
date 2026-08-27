import { createWorker, OEM, PSM, type Worker } from 'tesseract.js'
import {
  buildOcrVariants,
  fileToCanvas,
  type PreprocessKind,
} from './imagePreprocess'

let worker: Worker | null = null
let workerReady: Promise<Worker> | null = null

export type OcrMode = 'dense' | 'sparse'

// 쓰레기 노이즈 글자 차단용 최소 신뢰도
const MIN_CONFIDENCE = 45

async function initWorker(): Promise<Worker> {
  const w = await createWorker('kor+eng', OEM.LSTM_ONLY, { logger: () => {} })
  await w.setParameters({
    tessedit_pageseg_mode: PSM.AUTO,
    preserve_interword_spaces: '1',
  })
  worker = w
  return w
}

/** OCR Worker 싱글톤 */
export async function getOcrWorker(): Promise<Worker> {
  if (worker) return worker
  if (!workerReady) {
    workerReady = initWorker().catch((err) => {
      workerReady = null
      throw err
    })
  }
  return workerReady
}

export function isOcrReady(): boolean {
  return worker !== null
}

/** OCR 강제 중단 및 워커 리셋 */
export async function resetOcrWorker(): Promise<void> {
  if (worker) {
    try {
      await worker.terminate()
    } catch {
      // 무시
    }
    worker = null
  }
  workerReady = null
}

/** 단어 + 신뢰도 기반 텍스트 추출 */
function collectText(data: {
  text: string
  words?: Array<{ text: string; confidence: number }>
}): string {
  if (data.words && data.words.length > 0) {
    const validWords = data.words
      .filter((w) => {
        const t = w.text.trim()
        return t.length > 0 && w.confidence >= MIN_CONFIDENCE
      })
      .map((w) => w.text.trim())
    return validWords.join(' ')
  }
  return data.text || ''
}

/** 선별된 캔버스에 대해 OCR 실행 */
async function recognizeCanvases(
  w: Worker,
  canvases: HTMLCanvasElement[],
  mode: OcrMode,
): Promise<string> {
  const psm = mode === 'sparse' ? PSM.SPARSE_TEXT : PSM.AUTO
  await w.setParameters({ tessedit_pageseg_mode: psm })

  const collected: string[] = []
  for (const canvas of canvases) {
    const { data } = await w.recognize(canvas)
    const text = collectText(data)
    if (text) collected.push(text)
  }

  return collected.join('\n')
}

export interface OcrResult {
  text: string
  ocrPreviewUrl: string
  scale: number
}

/** Canvas → OCR */
export async function extractTextFromCanvas(
  canvas: HTMLCanvasElement,
  mode: OcrMode = 'dense',
  kind: PreprocessKind = 'photo',
): Promise<OcrResult> {
  const w = await getOcrWorker()
  const { variants, primary } = buildOcrVariants(canvas, kind)
  
  // 실사는 soft + binary 최대 2종만 테스트하여 노이즈 및 중복 폭주 억제
  const targetCanvases = kind === 'design' 
    ? [primary.canvas] 
    : variants.slice(0, 2).map((v) => v.canvas)

  const text = await recognizeCanvases(w, targetCanvases, mode)

  return {
    text,
    ocrPreviewUrl: primary.canvas.toDataURL('image/jpeg', 0.85),
    scale: primary.scale,
  }
}

/** File → OCR */
export async function extractText(
  file: File,
  mode: OcrMode = 'dense',
  kind: PreprocessKind = 'photo',
): Promise<OcrResult> {
  const canvas = await fileToCanvas(file)
  return extractTextFromCanvas(canvas, mode, kind)
}
