import { useCallback, useEffect, useRef, useState } from 'react'
import UploadZone from './components/UploadZone'
import { comparePackagingText, PASS_THRESHOLD, type SideTextResult, type PackagingTextResult } from './lib/compare'
import { getOcrWorker, isOcrReady, resetOcrWorker } from './lib/ocr'
import { buildSplitPreview, type FrontSide, type SplitMode } from './lib/splitDesign'
import './App.css'

function TextDiffPanel({ diff }: { diff: SideTextResult['diff'] }) {
  if (diff.missingInPhoto.length === 0 && diff.extraInPhoto.length === 0) {
    return (
      <p className="diff-ok">
        ✓ 토큰 {diff.matchedCount}/{diff.designTokenCount} 전부 일치
      </p>
    )
  }
  return (
    <div className="text-diff">
      <p className="diff-summary">
        매칭 {diff.matchedCount}/{diff.designTokenCount} 토큰 · 시안 {diff.designTokenCount}개 ·
        실사 {diff.photoTokenCount}개
      </p>
      {diff.missingInPhoto.length > 0 && (
        <div className="diff-block missing">
          <strong>시안에만 있음 ({diff.missingInPhoto.length}개)</strong>
          <pre>{diff.missingInPhoto.join('\n')}</pre>
        </div>
      )}
      {diff.extraInPhoto.length > 0 && (
        <div className="diff-block extra">
          <strong>실사에만 있음 ({diff.extraInPhoto.length}개)</strong>
          <pre>{diff.extraInPhoto.join('\n')}</pre>
        </div>
      )}
    </div>
  )
}

function SideResult({ title, result }: { title: string; result: SideTextResult }) {
  return (
    <div className="side-result">
      <h3>{title}</h3>
      <div className={`side-verdict ${result.pass ? 'pass' : 'fail'}`}>
        {result.score}% {result.pass ? 'PASS' : 'FAIL'}
        {!result.exactMatch && <span className="align-tag"> · 텍스트 차이 있음</span>}
      </div>

      <div className="ocr-preview-block">
        <h4>OCR 확대 전처리 ({result.ocrScale}배)</h4>
        <p className="ocr-hint">
          실사는 그레이스케일·이진화·반전 등 여러 방식으로 확대 후 OCR합니다. (미리보기: 기본 그레이스케일)
        </p>
        <img
          className="ocr-preview-img"
          src={result.ocrPreviewUrl}
          alt={`${title} OCR 확대 미리보기`}
        />
      </div>

      <div className="text-result-grid">
        <div className="text-panel">
          <h4>시안 추출 텍스트 ({result.designTokens.length}개 토큰)</h4>
          <p className="token-list">{result.designText}</p>
        </div>
        <div className="text-panel">
          <h4>실사 추출 텍스트 ({result.photoTokens.length}개 토큰)</h4>
          <p className="token-list">{result.photoText}</p>
        </div>
      </div>

      <TextDiffPanel diff={result.diff} />
    </div>
  )
}

function App() {
  const [designFile, setDesignFile] = useState<File | null>(null)
  const [frontPhotoFile, setFrontPhotoFile] = useState<File | null>(null)
  const [backPhotoFile, setBackPhotoFile] = useState<File | null>(null)
  const [designPreview, setDesignPreview] = useState<string | null>(null)
  const [frontPreview, setFrontPreview] = useState<string | null>(null)
  const [backPreview, setBackPreview] = useState<string | null>(null)
  const [splitMode, setSplitMode] = useState<SplitMode>('horizontal')
  const [frontSide, setFrontSide] = useState<FrontSide>('first')
  const [splitRatio, setSplitRatio] = useState<number>(0.5)

  const [loading, setLoading] = useState(false)
  const [ocrLoading, setOcrLoading] = useState(false)
  const [ocrReady, setOcrReady] = useState(isOcrReady())
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<PackagingTextResult | null>(null)
  const resultRef = useRef<HTMLElement>(null)
  const isAbortedRef = useRef(false)

  const setPreview = useCallback(
    (setter: React.Dispatch<React.SetStateAction<string | null>>, file: File) => {
      setter((prev) => {
        if (prev) URL.revokeObjectURL(prev)
        return URL.createObjectURL(file)
      })
    },
    [],
  )

  const pickDesign = useCallback(
    (file: File) => {
      setPreview(setDesignPreview, file)
      setDesignFile(file)
      setResult(null)
      setError(null)
    },
    [setPreview],
  )

  const pickFrontPhoto = useCallback(
    (file: File) => {
      setPreview(setFrontPreview, file)
      setFrontPhotoFile(file)
      setResult(null)
      setError(null)
    },
    [setPreview],
  )

  const pickBackPhoto = useCallback(
    (file: File) => {
      setPreview(setBackPreview, file)
      setBackPhotoFile(file)
      setResult(null)
      setError(null)
    },
    [setPreview],
  )

  const [splitGuideUrl, setSplitGuideUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!designPreview) {
      setSplitGuideUrl(null)
      return
    }
    const img = new Image()
    img.onload = () => setSplitGuideUrl(buildSplitPreview(img, splitMode, splitRatio, frontSide))
    img.src = designPreview
  }, [designPreview, splitMode, splitRatio, frontSide])

  async function handleCompare() {
    if (!designFile || !frontPhotoFile || !backPhotoFile) return
    isAbortedRef.current = false
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      if (!ocrReady) {
        setOcrLoading(true)
        await getOcrWorker()
        setOcrReady(true)
      }
      if (isAbortedRef.current) return

      const res = await comparePackagingText(
        designFile,
        frontPhotoFile,
        backPhotoFile,
        splitMode,
        frontSide,
        splitRatio,
      )
      if (isAbortedRef.current) return
      setResult(res)
      setTimeout(() => resultRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
    } catch (e) {
      if (!isAbortedRef.current) {
        setError(e instanceof Error ? e.message : '비교 중 오류가 발생했습니다.')
      }
    } finally {
      setLoading(false)
      setOcrLoading(false)
    }
  }

  async function handleStop() {
    isAbortedRef.current = true
    setLoading(false)
    setOcrLoading(false)
    setError('사용자에 의해 분석이 중단되었습니다.')
    await resetOcrWorker()
    setOcrReady(false)
  }

  const allUploaded = Boolean(designFile && frontPhotoFile && backPhotoFile)
  const canCompare = allUploaded && !loading

  const uploadedCount = [designFile, frontPhotoFile, backPhotoFile].filter(Boolean).length

  return (
    <div className="app">
      <header className="header">
        <div className="brand-badge">🌱 Pulmuone Quality Assurance</div>
        <h1>
          Pack<span>Match</span> 검수 시스템
        </h1>
        <p>풀무원 바른먹거리 포장재 디자인 시안 vs 인쇄 실사 OCR 대조 검수</p>
        <div className="pass-rule">🎯 PASS 기준: 텍스트 일치율 {PASS_THRESHOLD}% 이상 (앞·뒷면 동시 충족)</div>
        <div className="badge-status">
          {ocrLoading && !loading && (
            <span className="badge loading">⏳ OCR 엔진 초기화 중…</span>
          )}
          {ocrReady && !ocrLoading && <span className="badge ready">✓ OCR 검수 엔진 준비 완료</span>}
        </div>
      </header>

      <section className="upload-section">
        <h2 className="section-title">
          <span className="step-num">1</span> 디자인 원본 시안 (앞·뒤 합본)
        </h2>
        <UploadZone
          label="디자인 시안 등록"
          hint="앞면/뒷면이 포함된 원본 이미지 (드래그 또는 클릭)"
          variant="design"
          preview={splitGuideUrl ?? designPreview}
          onSelect={pickDesign}
          onReject={setError}
        />

        {designPreview && (
          <div className="split-options">
            <label>
              📐 분할 방향
              <select
                value={splitMode}
                onChange={(e) => setSplitMode(e.target.value as SplitMode)}
              >
                <option value="horizontal">좌우 분할 (가로형)</option>
                <option value="vertical">상하 분할 (세로형)</option>
              </select>
            </label>
            <label>
              🏷️ 앞면(Front) 위치
              <select
                value={frontSide}
                onChange={(e) => setFrontSide(e.target.value as FrontSide)}
              >
                <option value="first">
                  {splitMode === 'horizontal' ? '왼쪽 (Left)' : '위쪽 (Top)'}
                </option>
                <option value="second">
                  {splitMode === 'horizontal' ? '오른쪽 (Right)' : '아래쪽 (Bottom)'}
                </option>
              </select>
            </label>

            <div className="split-slider-box">
              <div className="slider-header">
                <span>✂️ 분할선 위치 조정</span>
                <strong>{Math.round(splitRatio * 100)}% 지점</strong>
              </div>
              <input
                type="range"
                min="10"
                max="90"
                step="1"
                value={Math.round(splitRatio * 100)}
                onChange={(e) => setSplitRatio(Number(e.target.value) / 100)}
                className="split-slider"
              />
              <div className="slider-labels">
                <span>10%</span>
                <span>50% (중앙)</span>
                <span>90%</span>
              </div>
            </div>
          </div>
        )}
      </section>

      <section className="upload-section">
        <h2 className="section-title">
          <span className="step-num">2</span> 포장재 인쇄 실사 촬영본
        </h2>
        <div className="upload-row">
          <UploadZone
            label="앞면 실사 사진"
            hint="전면 인쇄 촬영본 등록"
            variant="photo"
            preview={frontPreview}
            useCamera
            onSelect={pickFrontPhoto}
            onReject={setError}
          />
          <UploadZone
            label="뒷면 실사 사진"
            hint="후면/표시사항 촬영본 등록"
            variant="photo"
            preview={backPreview}
            useCamera
            onSelect={pickBackPhoto}
            onReject={setError}
          />
        </div>
      </section>

      <p className="upload-status">
        {uploadedCount === 0 && '시안 1장 + 앞·뒤 실사 2장을 업로드해 주세요.'}
        {uploadedCount > 0 && uploadedCount < 3 &&
          `${uploadedCount}/3 업로드됨 — 나머지 이미지를 추가해 주세요.`}
        {allUploaded && '✓ 3장 모두 준비됨 — 텍스트 비교 실행을 눌러 주세요.'}
      </p>

      <section className="controls">
        {loading ? (
          <button
            type="button"
            className="btn-stop"
            onClick={handleStop}
          >
            ⏹ 분석 중단 (정지)
          </button>
        ) : (
          <button
            type="button"
            className="btn-compare"
            disabled={!canCompare}
            onClick={handleCompare}
          >
            {ocrLoading ? 'OCR 로딩…' : '텍스트 비교 실행'}
          </button>
        )}
      </section>

      {error && <p className="error">{error}</p>}

      {result && (
        <section className="result" ref={resultRef}>
          <div className={`verdict ${result.pass ? 'pass' : 'fail'}`}>
            <span className="score">{result.overallScore}%</span>
            <span className="label">{result.pass ? '전체 PASS ✓' : '전체 FAIL ✗'}</span>
            <span className="detail">
              앞면 {result.front.score}% · 뒷면 {result.back.score}% —{' '}
              {PASS_THRESHOLD}% 텍스트 일치 필요
            </span>
          </div>

          <SideResult title="앞면" result={result.front} />
          <SideResult title="뒷면" result={result.back} />
        </section>
      )}
    </div>
  )
}

export default App
