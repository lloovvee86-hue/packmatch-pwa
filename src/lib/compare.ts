import { extractText, extractTextFromCanvas } from './ocr'
import { fileToCanvas } from './imagePreprocess'
import { compareTexts, PASS_THRESHOLD, type TextCompareResult } from './textCompare'
import { loadImage } from './imageLoader'
import {
  buildSplitPreview,
  splitDesignCanvas,
  type FrontSide,
  type SplitMode,
} from './splitDesign'

export interface SideTextResult extends TextCompareResult {
  previewUrl: string
  ocrPreviewUrl: string
  ocrScale: number
}

export interface PackagingTextResult {
  pass: boolean
  overallScore: number
  splitPreviewUrl: string
  front: SideTextResult
  back: SideTextResult
}

async function ocrCanvas(
  canvas: HTMLCanvasElement,
  mode: 'dense' | 'sparse' = 'dense',
  kind: 'photo' | 'design' = 'design',
): Promise<{ text: string; previewUrl: string; ocrPreviewUrl: string; ocrScale: number }> {
  const ocr = await extractTextFromCanvas(canvas, mode, kind)
  return {
    text: ocr.text,
    previewUrl: canvas.toDataURL('image/jpeg', 0.85),
    ocrPreviewUrl: ocr.ocrPreviewUrl,
    ocrScale: ocr.scale,
  }
}

async function ocrFile(
  file: File,
  mode: 'dense' | 'sparse' = 'dense',
): Promise<{ text: string; previewUrl: string; ocrPreviewUrl: string; ocrScale: number }> {
  const [ocr, canvas] = await Promise.all([extractText(file, mode, 'photo'), fileToCanvas(file)])
  return {
    text: ocr.text,
    previewUrl: canvas.toDataURL('image/jpeg', 0.85),
    ocrPreviewUrl: ocr.ocrPreviewUrl,
    ocrScale: ocr.scale,
  }
}

async function compareSide(
  designCanvas: HTMLCanvasElement,
  photoFile: File,
  mode: 'dense' | 'sparse' = 'dense',
): Promise<SideTextResult> {
  const [designOcr, photoOcr] = await Promise.all([
    ocrCanvas(designCanvas, mode, 'design'),
    ocrFile(photoFile, mode),
  ])

  const result = compareTexts(designOcr.text, photoOcr.text)

  return {
    ...result,
    previewUrl: photoOcr.previewUrl,
    ocrPreviewUrl: photoOcr.ocrPreviewUrl,
    ocrScale: photoOcr.ocrScale,
  }
}

/** 합본 시안 + 앞·뒤 실사 → OCR 텍스트 비교 */
export async function comparePackagingText(
  designFile: File,
  frontPhotoFile: File,
  backPhotoFile: File,
  splitMode: SplitMode = 'horizontal',
  frontSide: FrontSide = 'first',
): Promise<PackagingTextResult> {
  const designImg = await loadImage(designFile)
  const splitPreviewUrl = buildSplitPreview(designImg, splitMode)
  const { front: frontDesign, back: backDesign } = splitDesignCanvas(
    designImg,
    splitMode,
    frontSide,
  )

  const [front, back] = await Promise.all([
    compareSide(frontDesign, frontPhotoFile, 'sparse'),
    compareSide(backDesign, backPhotoFile, 'dense'),
  ])

  const overallScore = Math.round(((front.score + back.score) / 2) * 10) / 10

  return {
    pass: front.pass && back.pass,
    overallScore,
    splitPreviewUrl,
    front: { ...front, previewUrl: front.previewUrl },
    back: { ...back, previewUrl: back.previewUrl },
  }
}

export { PASS_THRESHOLD }
