# 📦 PackMatch PWA 프로젝트 리서치 보고서 (Research.md)

---

## 1. 📌 프로젝트 개요 (Overview)
- **프로젝트명:** PackMatch PWA (`packmatch-pwa`)
- **목적:** **디자인 시안 vs 포장재 실사 텍스트 OCR 비교/검수 웹 애플리케이션**
- **형태:** React + TypeScript 기반의 PWA (Progressive Web App, 오프라인 및 설치형 지원)
- **주요 기능:**
  1. 포장재 디자인 원본 시안(좌우 분할/상하 분할 등)과 인쇄 실사 사진(앞면/뒷면) 업로드
  2. OpenCV.js 기반 이미지 전처리 (확대, 그레이스케일, 이진화, 반전, 노이즈 제거)
  3. Tesseract.js 기반 한글/영문 OCR 텍스트 추출
  4. 시안 vs 실사 텍스트 토큰 단위 비교/매칭률 산출 및 시각적 Diff 표기 (PASS/FAIL 판정)

---

## 2. 🛠 기술 스택 (Tech Stack)

| 구분 | 기술 / 라이브러리 | 버전 / 비고 |
| :--- | :--- | :--- |
| **Frontend Framework** | React 19, TypeScript | `react@^19.2.8`, `typescript@~6.0.2` |
| **Build & Bundler** | Vite 8 + `@vitejs/plugin-react` | `vite@^8.2.2` |
| **PWA Support** | `vite-plugin-pwa` | 오프라인 캐싱 (최대 20MB 캐시 허용) |
| **Computer Vision** | `@techstark/opencv-js` | OpenCV.js (`^5.0.0-release.1`) 이미지 전처리용 |
| **OCR Engine** | `tesseract.js` | Tesseract.js (`^7.0.0`) 브라우저 내 OCR 실행 |
| **Linter** | `oxlint` | 빠른 정적 코드 분석 (`oxlint@^1.79.0`) |

---

## 3. 📂 디렉터리 및 아키텍처 구조 (Directory Structure)

```text
packmatch-pwa/
├── .agent/skills/kodari/       # 코다리 부장 스킬 및 행동 수칙 가이드
├── public/                    # 정적 에셋 (파비콘 등)
├── samples/                   # 테스트용 샘플 이미지 (design, photo)
├── src/
│   ├── assets/                # 리액트 정적 리소스
│   ├── components/
│   │   └── UploadZone.tsx     # 드래그 앤 드롭 및 파일 업로드 컴포넌트
│   ├── lib/                   # 핵심 비즈니스 로직 및 엔진 모듈
│   │   ├── compare.ts         # 시안 vs 실사 종합 비교 오케스트레이션 및 PASS/FAIL 판정
│   │   ├── imageLoader.ts     # HTMLImageElement 로더 및 Canvas 유틸
│   │   ├── imagePreprocess.ts # OpenCV.js 활용 전처리 (스케일링, Otsu 이진화 등)
│   │   ├── ocr.ts             # Tesseract.js 워커 관리 및 한글/영문 인식 로직
│   │   ├── splitDesign.ts     # 원본 디자인 시안 자동 분할 로직 (좌/우, 상/하, 전면/후면 매핑)
│   │   └── textCompare.ts     # 텍스트 정규화, 토큰화, Levenshtein 거리/유사도 계산 알고리즘
│   ├── App.tsx                # 메인 UI 레이아웃, 단계별 워크플로우 상태 관리
│   ├── App.css / index.css    # 스타일링
│   └── main.tsx               # 애플리케이션 진입점
├── dist/                      # 빌드 산출물
├── package.json               # 의존성 및 실행 스크립트 정의
├── tsconfig.json              # TS 설정 파일
└── vite.config.ts             # Vite 및 PWA 빌드 설정
```

---

## 4. ⚙️ 핵심 모듈 분석 (Core Modules)

1. **`splitDesign.ts` (시안 분할 모듈)**
   - 와이드형 포장재 시안을 좌/우 또는 상/하로 자동 분할하여 앞면(Front)/뒷면(Back) 영역으로 분리.
2. **`imagePreprocess.ts` (영상 전처리 모듈)**
   - 인쇄 실사 이미지의 작은 글씨를 인식하기 위해 업스케일링(최대 4배) 및 그레이스케일, 적응형/오츠(Otsu) 이진화 처리.
3. **`ocr.ts` (OCR 모듈)**
   - `tesseract.js` 워커 풀 생성 및 캐싱, 한국어(`kor`)와 영어(`eng`) 다중 언어 인식 지원.
4. **`textCompare.ts` & `compare.ts` (텍스트 비교 및 검수 판정)**
   - OCR 추출 텍스트에서 노이즈 제거 및 토큰화 진행 후, 레벤슈타인(Levenshtein) 유사도 기반 비교.
   - 일치율(기본 85% 이상 기준)에 따른 PASS/FAIL 판정 및 불일치 텍스트(시안에만 있음 / 실사에만 있음) 시각화.

---

## 5. 💡 코다리 부장의 총평 & 개선 제안 (Lean & Efficient) 😎🚀

1. **OCR 성능 및 속도 최적화 방어 팁:**
   - 브라우저 환경에서 `Tesseract.js`와 `OpenCV.js`가 동시 구동되므로 모바일 기기 메모리 부하에 유의해야 합니다.
   - 불필요한 고해상도 전체 OCR 대신 ROI(관심영역/영양정보표, 제품명 등) 우선 크롭 인식 구조가 도입되면 속도가 비약적으로 향상됩니다.
2. **UI/UX 개선 방향:**
   - 검수 결과 레포트(PDF/이미지 출력) 내보내기 기능 추가 고려.
