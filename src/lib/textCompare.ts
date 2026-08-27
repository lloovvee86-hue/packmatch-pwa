/** PASS 판정 기준 — 현실적인 80% 이상 일치 시 PASS */
export const PASS_THRESHOLD = 80

const ENGLISH_WHITELIST = new Set([
  'kcal', 'keal', 'www', 'com', 'pulmuone', 'cmyk', 'fair', 'foodmerce', 'haccp', 'g', 'mg', 'ml', 'l',
])

/** 자주 오인식되는 노이즈 문자 및 단자 제거 */
const NOISE_CHAR_REGEX = /^[ㄱ-ㅎㅏ-ㅣ!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?~`]+$/

/** 한글 OCR 흔한 오타 보정 */
function normalizeKorean(token: string): string {
  return token
    .normalize('NFC')
    .replace(/[^\uAC00-\uD7A3a-zA-Z0-9]/g, '')
    .replace(/룰/g, '률')
    .replace(/불/g, '률') // 탄수화물 맥락
    .replace(/시([즈혀])/g, '식$1')
    .replace(/맨보/g, '멘보')
    .replace(/에머/g, '에어')
    .replace(/뛰푸/g, '푸')
}

/** 유효 토큰인지 — 의미 있는 한글/단위숫자/영문 판별 */
function isValidToken(token: string): boolean {
  const t = token.trim()
  if (t.length < 2) return false
  if (NOISE_CHAR_REGEX.test(t)) return false

  // 순수 한글 2자 이상 (단, 단순 칼선/인쇄 표기 가이드 용어 '도련', '칼선', '재단' 등 배제)
  if (/^[\uAC00-\uD7A3]{2,}$/.test(t)) {
    if (['도련', '칼선', '재단선', '물림', '접지선'].includes(t)) return false
    return true
  }

  // 식품 유효 용량/열량/비율/연도 등 의미 있는 숫자 조합 (예: 100g, 250kcal, 2026 등)
  // 단순 외곽 치수(예: 320, 150 등 접지/폭 치수)나 mm 단위는 제외
  if (/^\d{1,4}(g|mg|kcal|%|원|개|입|ea)$/i.test(t)) return true
  if (/^(19|20)\d{2}(\.\d{2}){0,2}$/.test(t)) return true // 연도/날짜 규격

  // 바코드 규격 (8자리 또는 13자리)
  if (/^\d{8}$|^\d{13}$/.test(t)) return true

  // 화이트리스트 영문
  if (ENGLISH_WHITELIST.has(t.toLowerCase())) return true

  return false
}

/** OCR 결과에서 의미 있는 단어/토큰 추출 */
export function extractTokens(text: string): string[] {
  const tokens = new Set<string>()
  
  // 공백 및 줄바꿈 단위로 1차 분리
  const rawWords = text.split(/[\s,\n\r\t]+/)

  for (const rawWord of rawWords) {
    const cleaned = normalizeKorean(rawWord)
    if (isValidToken(cleaned)) {
      tokens.add(cleaned)
    }
  }

  // 텍스트 내에서 추출 가능한 연속 한글/숫자 서브토큰도 보조 추가
  for (const m of text.match(/[\uAC00-\uD7A3]{2,}/g) ?? []) {
    const n = normalizeKorean(m)
    if (isValidToken(n)) tokens.add(n)
  }

  return [...tokens]
}

/** Levenshtein 유사도 0~100 */
function similarity(a: string, b: string): number {
  if (a === b) return 100
  if (!a.length || !b.length) return 0

  const rows = a.length + 1
  const cols = b.length + 1
  const dp: number[][] = Array.from({ length: rows }, () => Array(cols).fill(0))
  for (let i = 0; i < rows; i++) dp[i][0] = i
  for (let j = 0; j < cols; j++) dp[0][j] = j
  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost)
    }
  }
  return Math.round((1 - dp[a.length][b.length] / Math.max(a.length, b.length)) * 100)
}

/** 부분 포함 매칭 (긴 단어 OCR 분절 대응) */
function partialMatch(a: string, b: string): boolean {
  if (a.length < 3 || b.length < 3) return false
  const short = a.length <= b.length ? a : b
  const long = a.length <= b.length ? b : a
  if (long.includes(short) && short.length >= 3) return true
  
  // 앞 3글자 이상 공통 + 유사도 65% 이상
  const prefix = short.slice(0, 3)
  return long.includes(prefix) && similarity(a, b) >= 65
}

/** 토큰 매칭 (OCR 오차 허용) */
function tokenMatches(a: string, b: string): boolean {
  if (a === b) return true
  const sim = similarity(a, b)
  const minLen = Math.min(a.length, b.length)
  if (minLen >= 5 && sim >= 75) return true
  if (minLen >= 3 && sim >= 78) return true
  if (minLen >= 2 && sim >= 85) return true
  return partialMatch(a, b)
}

function tokenFoundInList(token: string, list: string[]): boolean {
  return list.some((t) => tokenMatches(token, t))
}

export interface TextDiff {
  missingInPhoto: string[]
  extraInPhoto: string[]
  matchedCount: number
  designTokenCount: number
  photoTokenCount: number
}

export interface TextCompareResult {
  score: number
  pass: boolean
  exactMatch: boolean
  designText: string
  photoText: string
  designTokens: string[]
  photoTokens: string[]
  diff: TextDiff
}

/** 시안 vs 실사 토큰 비교 */
export function compareTexts(designRaw: string, photoRaw: string): TextCompareResult {
  const designTokens = extractTokens(designRaw)
  const photoTokens = extractTokens(photoRaw)

  const missingInPhoto: string[] = []
  let matchedCount = 0

  for (const dt of designTokens) {
    if (tokenFoundInList(dt, photoTokens)) {
      matchedCount++
    } else {
      missingInPhoto.push(dt)
    }
  }

  const extraInPhoto = photoTokens.filter((pt) => !tokenFoundInList(pt, designTokens))

  const designTokenCount = designTokens.length
  const score =
    designTokenCount === 0
      ? 0
      : Math.round((matchedCount / designTokenCount) * 1000) / 10

  const exactMatch = missingInPhoto.length === 0 && extraInPhoto.length === 0

  return {
    score,
    pass: score >= PASS_THRESHOLD && designTokenCount > 0,
    exactMatch,
    designText: designTokens.join(' · ') || '(유효 토큰 없음)',
    photoText: photoTokens.join(' · ') || '(유효 토큰 없음)',
    designTokens,
    photoTokens,
    diff: {
      missingInPhoto,
      extraInPhoto,
      matchedCount,
      designTokenCount,
      photoTokenCount: photoTokens.length,
    },
  }
}
