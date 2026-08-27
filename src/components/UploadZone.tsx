import { useId, useRef } from 'react'

interface Props {
  label: string
  hint: string
  preview: string | null
  variant?: 'design' | 'photo'
  useCamera?: boolean
  onSelect: (file: File) => void
  onReject?: (reason: string) => void
}

function isImageFile(file: File): boolean {
  if (file.type.startsWith('image/')) return true
  return /\.(jpe?g|png|webp|gif|bmp|heic|heif)$/i.test(file.name)
}

export default function UploadZone({
  label,
  hint,
  preview,
  variant = 'photo',
  useCamera = false,
  onSelect,
  onReject,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const inputId = useId()

  function handleFile(file: File | undefined) {
    if (!file) return
    if (!isImageFile(file)) {
      onReject?.('이미지 파일만 업로드할 수 있습니다. (jpg, png 등)')
      return
    }
    onSelect(file)
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    handleFile(e.dataTransfer.files[0])
  }

  function openPicker(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    inputRef.current?.click()
  }

  return (
    <div
      className={`upload-zone upload-zone--${variant}`}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
    >
      <input
        id={inputId}
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/*,.jpg,.jpeg,.png"
        capture={useCamera ? 'environment' : undefined}
        className="upload-input"
        onChange={(e) => {
          handleFile(e.target.files?.[0])
          e.target.value = ''
        }}
      />
      <label htmlFor={inputId} className="upload-label">
        {preview ? (
          <img src={preview} alt={label} className="upload-preview" />
        ) : (
          <div className="upload-placeholder">
            <span className="upload-icon">{variant === 'design' ? '📐' : '📷'}</span>
            <strong>{label}</strong>
            <span>{hint}</span>
          </div>
        )}
      </label>
      {preview && (
        <button type="button" className="upload-change-btn" onClick={openPicker}>
          🔄 이미지 변경
        </button>
      )}
    </div>
  )
}
