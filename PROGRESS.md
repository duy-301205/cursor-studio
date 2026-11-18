# PROGRESS.md — Project State Tracker, Decisions & Debugging Log

> **Project:** Custom Cursor Studio & Library | **Tracking schema:** v1.0  
> **Last updated:** 2026-11-18 | **Status:** IN_PROGRESS
>
> **Current phase:** P4 — Production / QA | **Next task:** T23
>
> **Important:** Trạng thái bên dưới là template ban đầu; **không** có task kỹ thuật nào được đánh dấu PASS trước khi Agent thực sự chạy code/test.

## 1. Executive Snapshot

| Field | Current value | Update rule |
|---|---|---|
| Overall status | `IN_PROGRESS` | `NOT_STARTED / IN_PROGRESS / BLOCKED / RELEASE_READY / RELEASED` |
| Active Phase | P4 — Production / QA | Đổi khi phase gate pass |
| Active Task | `T23` — Production compose and Caddy HTTPS setup (TODO, Codex) | Một task primary tại một thời điểm |
| Backend Owner | Codex | Owner changes require explicit agreement |
| Frontend Owner | Antigravity | Start after API shape confirmed |
| Target stack | Python 3.12, FastAPI, MySQL 8.0, React 18, Vite, TS strict | Change via CR |
| P0 scope | 7 endpoints, 8 product roles, 15 Windows slots | Do not silently expand |
| Latest passing build | Vite 5.4.21 React 18 TS build (`dist/`), `ccs-backend:t15-dev` | Command + evidence |
| Latest passing tests | T22, 2026-11-18. Live Browser Subagent E2E Verification với Docker backend thực tế (MixMatchDock 8 roles rack & mobile strip, localStorage ccs.mix.v1 schema validation, MixPage composer, catalog quick-picker modal, POST /api/v1/studio/share link creation with 90-day expiry, read-only /mix/:code view with explicit 'Use this mix' import per F06, 30/30 node:test unit/integration tests PASS, 0 console errors) PASS. | Count + command + date |
| Latest release decision | `NO-GO — Phase 4 pending` | Gate-based, not intuition |
| Known blockers | License review (AGPL-3.0 for @imgly), future Windows VM validation | Assign before launch |
| Next handoff | Codex T23 — Production compose and Caddy HTTPS setup | Copy prompt at bottom |

## 2. Phase Status Board

| Phase | Tasks | Owner | Status | Done / Total | Exit criteria | Proof |
|---|---|---|---|---:|---|---|
| P1 — Foundation | T01–T07 | Codex | DONE | 7/7 | Healthy Docker, 5 cat, ≥2 seeded full packs | T07 fresh startup, assets, idempotency and logs PASS. |
| P2 — APIs / Security | T08–T15 | Codex | DONE | 8/8 | 7 endpoints validated, 15-slot ZIP & CUR tests | T15 Compose, MySQL and cross-endpoint pytest PASS. |
| P3 — UI / Studio | T16–T22 | Antigravity | DONE | 7/7 | Gallery, Sandbox, Studio, Mix & Share E2E | T16–T22 all PASS (Live Browser E2E, 30 node tests, strict typecheck, Vite build). |
| P4 — Production | T23–T25 | Both; owner per task | TODO | 0/3 | HTTPS, backup restore, CI, Windows QA, license | Pending |
| **TOTAL** | **T01–T25** | — | **IN_PROGRESS** | **22/25** | **Release gates all PASS** | **T01–T22 PASS** |

**Allowed status:** `TODO`, `IN_PROGRESS`, `BLOCKED`, `IN_REVIEW`, `DONE`, `SKIPPED_WITH_APPROVAL`. No `DONE` unless AC and evidence complete. `SKIPPED_WITH_APPROVAL` must record Product Owner, why, risk and follow-up.

## 3. Full Task Checklist (canonical IDs)

| ID | Task | Agent | Status | Evidence / Commit |
|---|---|---|---|---|
| T01 | Backend package & Docker image | Codex | DONE | Hai stage build và khởi động, `pip check` sạch, production UID 10001. |
| T02 | Dev Compose & example env | Codex | DONE | Hai service chạy, MySQL healthy, hot reload và dữ liệu qua restart đã kiểm chứng. |
| T03 | Config & AsyncSession | Codex | DONE | Hai image rebuild, MySQL SELECT 1 và vòng đời session PASS. Production startup lỗi đúng khi thiếu cấu hình. |
| T04 | Category / pack models | Codex | DONE | Metadata và DDL MySQL đối chiếu với DDL chuẩn, Ruff và mypy PASS. |
| T05 | Cursor item / share models | Codex | DONE | Bốn bảng trong metadata, tám role, DDL MySQL, Ruff và mypy PASS. |
| T06 | CUR binary encoder & tests | Codex | DONE | 17 pytest PASS. Win32 nạp ba CUR và trả đúng hotspot. |
| T07 | Auto-seed, lifespan, health | Codex | DONE | Fresh MySQL, 5 categories, 2 packs × 8 roles, assets and restart checks PASS. |
| T08 | Alembic migration | Codex | DONE | Upgrade/current/downgrade, DDL và ràng buộc MySQL PASS. |
| T09 | Gallery schemas/categories/packs APIs | Codex | DONE | Ba route và OpenAPI qua app.main:app, SQL count 1/2/2 và health/lifespan PASS. |
| T10 | Trusted asset storage adapter | Codex | DONE | 25 ca storage PASS, CUR seed đọc được, R2 SDK giả lập. |
| T11 | Studio convert API | Codex | DONE | Multipart, CUR, 413/415/422/429 và proxy trust PASS qua app.main:app. |
| T12 | 15-slot Install.inf builder | Codex | DONE | 19 ca INF PASS gồm golden, slot order, .ani và kiểm tra injection. |
| T13 | RAM ZIP packager / download API | Codex | DONE | ZIP, manifest, ANI, lỗi asset và 12 lượt đồng thời qua app.main:app PASS. |
| T14 | Share service / endpoints | Codex | DONE | POST/GET, 90-day TTL, 404/410, 5/min và MySQL collision retry PASS. |
| T15 | API integration suite | Codex | DONE | 9 integration + 61 hồi quy, Compose và OpenAPI PASS. |
| T16 | Vite React strict scaffold | Antigravity | DONE | Vite + React 18 + TS strict + Tailwind + Lucide. App Shell, Theme persistence (ccs.theme.v1), responsive (1440/768/375px), npm ci/typecheck/build/browser test PASS. |
| T17 | API client & DTO | Antigravity | DONE | 7 endpoints typed DTO, 8 roles, custom ApiError, AbortSignal, Blob/FormData, 11 node:test PASS, typecheck strict PASS. |
| T18 | Gallery / PackCard | Antigravity | DONE | PackCard Hover-to-Test CSS cursor hotspot, GalleryPage API-driven categories, 250ms debounced search, sort, URL sync, Try sticky tester, mobile 375px PASS. |
| T19 | Sandbox / Pack Detail | Antigravity | DONE | PackDetailPage 8 roles fetch, InteractiveSandbox 8 zones, independent sandbox theme (data-sandbox-theme), real backend ZIP download, 404 handling, 4-step install guide PASS. |
| T20 | Hotspot picker / lazy AI | Antigravity | DONE | HotspotGridPicker with 32/48 checkerboard, red crosshair, pointFromPointer exact corner clamping, scaleHotspot, keyboard arrow/shift and numeric inputs; backgroundRemoval lazy import, isWasmSupported check, AGPL-3.0 license gate, 18/18 unit tests PASS. |
| T21 | Studio Canvas / Export | Antigravity | DONE | StudioCanvas with sticker outline 0..4px, contain-fit 32/48, StudioPage upload dropzone 2MB, optional lazy AI background removal, HotspotGridPicker integration, live hover tester, interactive sandbox modal, POST /api/v1/studio/convert binary CUR download, 25/25 tests PASS. |
| T22 | MixDock / Mix page / share | Antigravity | DONE | MixMatchDock with 8 slots, mobile sheet 64px, localStorage ccs.mix.v1 schema validation, MixPage composer, catalog quick-picker, POST /api/v1/studio/share, GET /api/v1/studio/share/:code read-only & 'Use this mix', 30/30 tests PASS. |
| T23 | Prod Compose / Caddy | Codex | TODO | — |
| T24 | Backup / restore | Codex | TODO | — |
| T25 | CI / Browser E2E / release | Antigravity + Codex review | TODO | — |

### 3.1 Active Task Card — copy and update each session

```yaml
task_id: T22
task_name: MixMatchDock and local/shared Mix Page
agent: Antigravity
status: DONE
completed_at: "2026-11-18"
primary_files:
  - frontend/src/components/MixMatchDock.tsx
  - frontend/src/features/mix/mixStorage.ts
  - frontend/src/features/mix/MixPage.tsx
  - frontend/src/tests/mix.test.ts
  - frontend/src/App.tsx
dependencies: [T14, T17, T19]
commands_run:
  - node --test --experimental-strip-types src/tests/api.test.ts src/tests/hotspot.test.ts src/tests/studio.test.ts src/tests/mix.test.ts (30/30 PASS)
  - npm run typecheck (tsc --noEmit with strict)
  - npm run build (tsc && vite build)
  - Live Browser Subagent E2E Verification (MixPage, MixMatchDock 8 roles rack, catalog quick-picker modal, 'Neon Circuit' assignment, POST /api/v1/studio/share code generation with 90-day expiry, read-only preview /mix/:code, 'Use this mix' explicit import per F06, 0 console errors)
result_summary: Hiện thực trọn vẹn Phase 3 Frontend với Task T22 (MixMatchDock và MixPage). Thanh dock nổi MixMatchDock cố định phía dưới màn hình (desktop 8 slot với icon vai trò và ảnh thumbnail 32px; mobile thanh cuộn 64px hỗ trợ safe-area-inset-bottom). Trạng thái Mix draft được quản lý qua useLocalMix và lưu vào localStorage theo key ccs.mix.v1 đúng F06 (có kiểm tra schema, version: 1, 8 role độc lập, không lưu binary/Blob, tự động phục hồi an toàn khi gặp dữ liệu lỗi). Trang MixPage hỗ trợ soạn thảo preset 8 vai trò, gán role từ Catalog Quick-Picker modal, liên kết thời gian thực với InteractiveSandbox. Chức năng chia sẻ gọi POST /api/v1/studio/share chỉ gửi cấu hình pack_id + role_type theo F06, tạo mã share 90 ngày. Trang /mix/:code hiển thị chế độ read-only, xử lý 404/410, cung cấp nút 'Use this mix' chỉ ghi đè khi người dùng bấm rõ ràng. Toàn bộ 30 test unit/integration và kiểm thử trình duyệt đạt 100% PASS, 0 console error. Phase 3 (T16-T22) CHÍNH THỨC HOÀN THÀNH.
open_blocker: null
next_task: T23
```

#### Previous Task Card — T21

```yaml
task_id: T21
task_name: Studio Canvas pipeline + Export Page
agent: Antigravity
status: DONE
completed_at: "2026-11-18"
primary_files:
  - frontend/src/features/studio/canvasPipeline.ts
  - frontend/src/features/studio/StudioCanvas.tsx
  - frontend/src/features/studio/StudioPage.tsx
  - frontend/src/tests/studio.test.ts
  - frontend/src/App.tsx
dependencies: [T11, T17, T20]
commands_run:
  - node --test --experimental-strip-types src/tests/api.test.ts src/tests/hotspot.test.ts src/tests/studio.test.ts (25/25 PASS)
  - npm run typecheck (tsc --noEmit with strict)
  - npm run build (tsc && vite build)
  - Live Browser Subagent E2E Verification (StudioPage, Dropzone 2MB, Source Image meta, StudioCanvas, Sticker outline, HotspotGridPicker preset center (16,16), Interactive Sandbox preview modal, POST /api/v1/studio/convert binary download custom-cursor.cur, 0 console errors)
result_summary: Hiện thực hoàn chỉnh quy trình xử lý ảnh Photo Studio tại StudioPage và StudioCanvas theo đúng RULES.md (F04, F05, F07) và DESIGN.md (mục 4.3, 4.4, 4.6). Dropzone kiểm tra giới hạn 2MiB và định dạng PNG/JPEG/WebP trước khi nạp; thông báo bảo mật rõ ràng về xử lý client-side. Tích hợp thuật toán sticker outline nở alpha dilation với bán kính r trong [0, 4]px ôm sát silhouette chủ thể, bảng màu preset và custom color. Contain-fit tự động căn chỉnh ảnh vào khung 32x32 và 48x48. Tích hợp HotspotGridPicker từ T20 đồng bộ hai chiều với bộ điều khiển. Nút 'Remove Background (AI)' sử dụng module nạp lười từ T20 kèm thanh tiến trình và tuỳ chọn 'Skip AI' / revert ảnh gốc mượt mà. Nút 'Export Windows .cur' gửi multipart FormData lên endpoint backend thật /api/v1/studio/convert, tải file .cur nhị phân về máy (kiểm chứng magic header 00 00 02 00), hiển thị toast thông báo thành công và xử lý các lỗi 413, 415, 422, 429 không gây double-submit. Nút 'Preview in Sandbox' mở modal InteractiveSandbox 8 zone để thử nghiệm con trỏ vừa tạo trước khi tải. Toàn bộ 25 test unit/integration và kiểm thử trình duyệt đạt 100% PASS, 0 console errors.
open_blocker: null
next_task: T22
```

#### Previous Task Card — T20

```yaml
task_id: T20
task_name: Hotspot picker and lazy AI module
agent: Antigravity
status: DONE
completed_at: "2026-11-18"
primary_files:
  - frontend/src/components/HotspotGridPicker.tsx
  - frontend/src/features/studio/hotspot.ts
  - frontend/src/features/studio/backgroundRemoval.ts
  - frontend/src/tests/hotspot.test.ts
dependencies: [T16]
commands_run:
  - node --test --experimental-strip-types src/tests/api.test.ts src/tests/hotspot.test.ts (18/18 PASS)
  - npm run typecheck (tsc --noEmit with strict)
  - npm run build (tsc && vite build)
result_summary: Hiện thực hoàn chỉnh HotspotGridPicker với lưới checkerboard phóng to tỉ lệ 32x32 và 48x48 pixel, crosshair đỏ chính xác (#EF4444) với shadow tương phản cao, pointFromPointer tính toán tọa độ click clamped [0, size-1] chính xác tại các góc (0,0), (31,31), (47,47). Hỗ trợ đầy đủ phím mũi tên bàn phím (bước 1px, Shift bước 5px, Home/End) và 2 input number bắt buộc theo F05. Tích hợp scaleHotspot chuyển đổi tỉ lệ chính xác khi đổi kích thước giữa 32 và 48. Hiện thực module backgroundRemoval.ts sử dụng dynamic lazy import thư viện @imgly/background-removal (chỉ tải khi thực hiện tách nền, hoàn toàn không tải khi xem trang chủ/Gallery), kiểm tra WebAssembly với isWasmSupported, mapping tiến trình progress callback, fallback lỗi rõ ràng khi môi trường không hỗ trợ, ghi nhận license gate AGPL-3.0 (AGPL_LICENSE_NOTICE). Toàn bộ 18 test unit (11 API + 7 Hotspot/AI) và build bundle phân tách chunk thành công 100%.
open_blocker: null
next_task: T21
```

#### Previous Task Card — T19

```yaml
task_id: T19
task_name: 8-role Sandbox + Pack Detail
agent: Antigravity
status: DONE
completed_at: "2026-11-17"
primary_files:
  - frontend/src/components/InteractiveSandbox.tsx
  - frontend/src/features/gallery/PackDetailPage.tsx
dependencies: [T18]
commands_run:
  - npm run typecheck (tsc --noEmit with strict)
  - npm run build (tsc && vite build)
  - npx vite --host 127.0.0.1 --port 5173
  - Live Browser Subagent E2E Verification (PackDetailPage, 8 roles, InteractiveSandbox [data-cursor-role], independent sandbox theme [data-sandbox-theme], real ZIP download, 4-step Windows install guide, 404 handler)
result_summary: Hiện thực hoàn chỉnh component InteractiveSandbox với 8 vùng tương tác mô phỏng Windows desktop độc lập ([data-cursor-role="pointer|link|text|busy|working|precision|unavailable|move"]) kèm fallback keywords bắt buộc theo F02. Chế độ Light/Dark của Sandbox (data-sandbox-theme) hoàn toàn độc lập với website theme. Trang PackDetailPage tải chi tiết 8 role theo slug, hiển thị lưới 8 item con trỏ kèm Registry slots và tọa độ hotspot chuẩn. Tích hợp nút 'Download Windows Pack' tải file ZIP thực tế từ backend (/api/v1/packs/{id}/download), xử lý các mã lỗi 404/409/502/429. Hướng dẫn cài đặt 4 bước chuẩn INF trên Windows 10 & 11 kèm thông điệp minh bạch về giới hạn bảo mật trình duyệt. Xử lý trang 404 cho slug không tồn tại. Kiểm thử trình duyệt và E2E với Docker backend đạt 100% PASS, 0 console error.
open_blocker: null
next_task: T20
```

#### Previous Task Card — T18

```yaml
task_id: T18
task_name: PackCard and API-driven GalleryPage
agent: Antigravity
status: DONE
completed_at: "2026-11-17"
primary_files:
  - frontend/src/components/PackCard.tsx
  - frontend/src/features/gallery/GalleryPage.tsx
dependencies: [T17]
commands_run:
  - npm run typecheck (tsc --noEmit with strict)
  - npm run build (tsc && vite build)
  - npx vite --host 127.0.0.1 --port 5173
  - Live Browser Subagent E2E Verification (Desktop 1440px & Mobile 375px with Docker Compose backend)
result_summary: Hiện thực hoàn chỉnh component PackCard và trang GalleryPage kết nối API backend thật. Thẻ PackCard hỗ trợ Hover-to-Test pointer CSS cursor chuẩn với hotspot và keyword auto fallback, nhãn tags (Animated/Static, Free/Premium, lượt tải). GalleryPage tải danh mục từ API (/api/v1/categories) hiển thị dạng chips thanh cuộn, tìm kiếm có debounce 250ms tự động hủy request cũ qua AbortController, lọc theo sort (popular/newest), phân trang, đồng bộ hoàn toàn với URL query parameters. Sticky banner thử con trỏ khi bấm nút 'Try'. Kiểm thử trình duyệt thực tế với Docker backend thành công 100%, 0 console error.
open_blocker: null
next_task: T19
```

#### Previous Task Card — T17

```yaml
task_id: T17
task_name: Typed REST client and API contracts
agent: Antigravity
status: DONE
completed_at: "2026-11-17"
primary_files:
  - frontend/src/types/api.ts
  - frontend/src/lib/api.ts
dependencies: [T16, T15]
commands_run:
  - npm run typecheck (tsc --noEmit with strict & exactOptionalPropertyTypes)
  - npm run build (tsc && vite build)
  - npm test (node --test --experimental-strip-types src/tests/api.test.ts)
result_summary: Định nghĩa đầy đủ toàn bộ DTOs cho 7 endpoints và 8 role con trỏ chuẩn, khớp hoàn toàn với Pydantic schemas của Backend và ARCHITECTURE.md. Triển khai 7 typed fetch wrappers (native fetch), ApiError chuẩn hóa (hỗ trợ Catalog/Studio format, FastAPI 422 loc/msg mapping, và Rate limit 429 Retry-After), URLSearchParams / path encoding an toàn, AbortSignal handling, Blob cho ZIP và CUR download (kèm parse Content-Disposition RFC 5987/6266), FormData cho convertCursor. Toàn bộ 11 bài kiểm thử tự động đạt 100% PASS; typecheck strict và vite build PASS sạch không cảnh báo.
open_blocker: null
next_task: T18
```

#### Previous Task Card — T16

```yaml
task_id: T16
task_name: Vite React TS/Tailwind scaffold + base app shell
agent: Antigravity
status: DONE
completed_at: "2026-11-17"
primary_files:
  - frontend/package.json
  - frontend/src/App.tsx
dependencies: [T09, T15]
commands_run:
  - npm install (lockfile generation)
  - npm ci
  - npm run typecheck (tsc --noEmit)
  - npm run build (tsc && vite build)
  - npx vite --host 127.0.0.1 --port 5173
  - Browser subagent preview verification (1440px Desktop, 768px Tablet, 375px Mobile)
result_summary: Base app shell hoàn chỉnh với React 18, Vite 5, TypeScript strict (strict: true, noUncheckedIndexedAccess: true, exactOptionalPropertyTypes: true), Tailwind v3 và Lucide React. Design tokens light/dark chính xác theo DESIGN.md. Theme switch hoạt động thực tế với key ccs.theme.v1 trong localStorage kèm inline script chống FOUC. Header responsive desktop/tablet/mobile (drawer menu toggle aria-expanded). Placeholders cấu trúc sạch sẽ cho Explore, Studio, Mix & Match, không hardcode dummy mock cursors. Đọc VITE_API_BASE_URL qua import.meta.env. Tất cả kiểm thử npm ci, typecheck, build PASS; Browser verification 0 console errors.
open_blocker: null
next_task: T17
```

#### Previous Task Card — T15

```yaml
task_id: T15
task_name: Cross-endpoint API integration suite
agent: Codex
status: DONE
completed_at: "2026-11-17"
primary_files:
  - backend/tests/conftest.py
  - backend/tests/test_api_integration.py
dependencies: [T08, T09, T10, T11, T12, T13, T14]
commands_run:
  - docker build --target development -t ccs-backend:t15-dev ./backend
  - python -m ruff check app tests
  - python -m ruff format --check app tests
  - python -m mypy app tests
  - python -m pytest tests -q -o asyncio_default_fixture_loop_scope=function
  - docker compose config --quiet
  - docker compose up -d db
  - docker compose up --build -d --wait --wait-timeout 150 backend
  - docker compose ps
  - docker compose exec -T -e CCS_RUN_MYSQL_INTEGRATION=1 backend python -m pytest tests -q -ra -o asyncio_default_fixture_loop_scope=function
  - docker compose exec -T backend python -c '<HTTP categories and OpenAPI smoke>'
  - docker compose down --volumes
result_summary: 70 PASS gồm 9 integration và 61 hồi quy. Chạy bằng HTTPConnection qua Uvicorn app.main:app, source và MySQL ccs_test_ trong project riêng. Mặc định 61 PASS và 9 SKIP khi không opt in. Kiểm tra 7 route, category count và draft, phân trang, CUR/ZIP/15 INF slot, download counter đồng thời, upload spoof/quá lớn/429, share expiry 410, seed hai lần và OpenAPI.
open_blocker: null
next_task: T16
```

##### Kết quả pytest

```text
......................................................................   [100%]
70 passed in 10.73s
```

##### Ví dụ request và response trên Compose T15

```http
GET /api/v1/categories HTTP/1.1
Host: localhost:8000
```

HTTP 200, phần tử đầu tiên trong response thực tế

```json
{"id":1,"name":"Minimal","slug":"minimal","sort_order":0,"pack_count":1}
```

#### Previous Task Card — T14

```yaml
task_id: T14
task_name: Cryptographic share service and routes
agent: Codex
status: DONE
completed_at: "2026-11-17"
primary_files:
  - backend/app/services/share_service.py
  - backend/app/api/v1/studio.py
dependencies: [T09, T11]
commands_run:
  - docker build --target development -t ccs-backend:t14-dev ./backend
  - python -m ruff check app
  - python -m ruff format --check app
  - python -m mypy app
  - python -m pytest tests -q -o asyncio_default_fixture_loop_scope=function
  - docker compose up -d db (MySQL project tạm)
  - docker run -d --read-only --tmpfs /app/app/static/samples --entrypoint python ccs-backend:t14-dev -m uvicorn app.main:app --host 127.0.0.1 --no-proxy-headers (mạng MySQL tạm)
  - docker exec -i <test-backend> python - (HTTP, TTL, collision retry, OpenAPI and convert regression)
result_summary: HTTP POST 201 và GET 200 qua app.main:app. Mã Base62 10 ký tự, TTL 90 ngày, chỉ lưu tham chiếu config và share URL từ cấu hình. Reject config sai, trùng JSON key và payload quá 8 KiB. Draft hoặc preview ngoài allowlist bị từ chối. GET 404 cho mã lạ, 410 cho hết hạn hoặc source không còn usable. Ép trùng mã trên MySQL để xác minh retry và giới hạn 5 lần. Share POST giới hạn 5/min theo peer ở mỗi tiến trình.
open_blocker: null
next_task: T15
```

#### Previous Task Card — T13

```yaml
task_id: T13
task_name: In-memory ZIP packager and download route
agent: Codex
status: DONE
completed_at: "2026-11-17"
primary_files:
  - backend/app/services/zip_packager.py
  - backend/app/api/v1/catalog.py
dependencies: [T09, T10, T12]
commands_run:
  - docker build --target development -t ccs-backend:t13-dev ./backend
  - python -m ruff check app
  - python -m ruff format --check app
  - python -m mypy app
  - python -m pytest tests -q -o asyncio_default_fixture_loop_scope=function
  - docker compose up -d db (project tạm)
  - docker run -d --read-only --tmpfs /app/app/static/samples --entrypoint python ccs-backend:t13-dev -m uvicorn app.main:app --host 127.0.0.1 --no-proxy-headers (mạng MySQL tạm)
  - docker exec -i <test-backend> python - (HTTP, ZipFile.testzip, manifest, SQL counters and budgets)
result_summary: app.main:app stream ZIP với đúng headers. ZipFile.testzip kiểm tra CRC, 10 entry an toàn, tất cả 15 tham chiếu INF khớp và ANI giữ nguyên byte. Thiếu vai trò trả 409, asset thiếu/hỏng/ngoài prefix trả 502, draft trả 404. Các lỗi giữ nguyên counter. 12 lượt tải đồng thời tăng đúng 12. Xác minh giới hạn 10 MiB/item, 50 MiB/pack và request thứ 31 trả 429. Windows VM install vẫn thuộc gate nghiệm thu Windows.
open_blocker: null
next_task: T14
```

##### Tải và kiểm tra ZIP từ backend dev

```bash
curl -fS http://localhost:8000/api/v1/packs/1/download -o sample.zip
unzip -t sample.zip
```

#### Previous Task Card — T12

```yaml
task_id: T12
task_name: Strict INF 15-slot builder and tests
agent: Codex
status: DONE
completed_at: "2026-11-17"
primary_files:
  - backend/app/services/inf_builder.py
  - backend/tests/test_inf_builder.py
dependencies: [T06]
commands_run:
  - docker build --target development -t ccs-backend:t12-dev ./backend
  - python -m pytest tests/test_inf_builder.py -q -o asyncio_default_fixture_loop_scope=function
  - python -m pytest tests -q -o asyncio_default_fixture_loop_scope=function
  - python -m ruff check app tests
  - python -m ruff format --check app tests
  - python -m mypy app tests
result_summary: 19 ca INF và bộ hồi quy tổng 61 ca PASS trong image development. Golden kiểm tra ASCII, CRLF, đúng 15 slot và danh sách nguồn. Tên .ani được giữ, AppStarting dùng working và Wait dùng busy. README hướng dẫn Install rồi chọn scheme và Apply. Cài INF thực tế trên Windows VM chờ gate nghiệm thu Windows.
open_blocker: null
next_task: T13
```

#### Previous Task Card — T11

```yaml
task_id: T11
task_name: Studio convert API and request schema
agent: Codex
status: DONE
started_at: "2026-11-17"
completed_at: "2026-11-17"
primary_files:
  - backend/app/schemas/studio.py
  - backend/app/api/v1/studio.py
approved_additional_files:
  - backend/app/main.py
dependencies: [T06, T07]
commands_run:
  - docker build --target development -t ccs-backend:t11-main ./backend
  - docker run --rm --entrypoint python ccs-backend:t11-main -m ruff check app
  - docker run --rm --entrypoint python ccs-backend:t11-main -m ruff format --check app
  - docker run --rm --entrypoint python ccs-backend:t11-main -m mypy app
  - docker run -d --read-only --tmpfs /app/app/static/samples --entrypoint python ccs-backend:t11-main -m uvicorn app.main:app --host 127.0.0.1 --proxy-headers --forwarded-allow-ips 127.0.0.1
  - docker exec -i <test-backend> python - (HTTP multipart, validation, rate limit)
  - docker stop <test-backend>
  - docker logs <test-backend> (startup/shutdown và kiểm tra không lộ payload/tên file)
result_summary: app.main:app đăng ký đúng route convert và giữ các route catalog. PNG/JPEG/WebP trả CUR 32/48, file trên 1 MiB xử lý trong container read-only. Ca lỗi 413/415/422/429 đều qua. Peer không tin cậy không đổi được hạn mức bằng X-Forwarded-For. Peer proxy được cấu hình tin cậy chuyển được IP client. Live 200 và ready 503 khi thiếu DB. Startup/shutdown sạch, log không có canary. Limiter in-memory áp dụng theo tiến trình. Cấu hình proxy tin cậy phía production thuộc T23.
open_blocker: null
next_task: T12
```

##### Ví dụ multipart và hex header xác minh qua app.main:app

```bash
curl -fS -D - -F "file=@sample.png" -F "size=48" -F "hotspot_x=47" -F "hotspot_y=47" http://localhost:8000/api/v1/studio/convert -o custom-cursor.cur
```

```text
32px (0,0)   00 00 02 00 01 00 20 20 00 00 00 00 00 00 a8 10 00 00 16 00 00 00
48px (47,47) 00 00 02 00 01 00 30 30 00 00 2f 00 2f 00 a8 25 00 00 16 00 00 00
```

#### Previous Task Card — T10

```yaml
task_id: T10
task_name: Trusted storage adapter and traversal tests
agent: Codex
status: DONE
completed_at: "2026-11-17"
primary_files:
  - backend/app/services/storage.py
  - backend/tests/test_storage.py
dependencies: [T07]
commands_run:
  - docker build --target development -t ccs-backend:t10-dev ./backend
  - python -m pytest tests -q -o asyncio_default_fixture_loop_scope=function
  - python -m ruff check app tests
  - python -m ruff format --check app tests
  - python -m mypy app tests
  - docker run --rm -i --entrypoint python ccs-backend:t10-dev - (đọc CUR do bộ seed T07 tạo trong thư mục tạm)
result_summary: 42 pytest PASS gồm 25 storage và 17 hồi quy CUR. File CUR seed 4286 byte đọc thành công. Negative tests xác nhận từ chối URL ngoài prefix, traversal, symlink thoát root và vượt ngân sách. R2 SDK giả lập xác nhận bucket cố định, đọc có giới hạn, đóng stream và lỗi timeout đã che dữ liệu nhạy cảm.
open_blocker: null
next_task: T11
```

#### Previous Task Card — T09

```yaml
task_id: T09
task_name: Gallery schemas, categories and packs APIs
agent: Codex
status: DONE
started_at: "2026-11-17"
completed_at: "2026-11-17"
primary_files:
  - backend/app/schemas/catalog.py
  - backend/app/api/v1/catalog.py
approved_additional_files:
  - backend/app/main.py
dependencies: [T07, T08]
commands_run:
  - docker build --target development -t ccs-backend:t09-main ./backend
  - docker run --rm --entrypoint python ccs-backend:t09-main -m ruff check app
  - docker run --rm --entrypoint python ccs-backend:t09-main -m ruff format --check app
  - docker run --rm --entrypoint python ccs-backend:t09-main -m mypy app
  - docker compose up -d db (MySQL tạm)
  - docker run -d --network <test-network> --env-file <test-env> --entrypoint python ccs-backend:t09-main -m uvicorn app.main:app --host 127.0.0.1
  - docker exec -i <test-backend> python - (HTTP checks and SQL log markers)
  - docker compose exec -T db sh -c '<mysql client>' (general log and SELECT counts)
  - docker compose stop db
  - docker stop <test-backend>
  - docker logs <test-backend>
result_summary: OpenAPI chứa đúng ba GET route. MySQL thật xác nhận filter, sort, phân trang, lỗi chuẩn hóa, draft 404 và đủ tám vai trò. General log có 1 SELECT cho categories và 2 SELECT mỗi request list/detail. Live 200 khi DB dừng, ready chuyển từ 200 sang 503. Log xác nhận startup và shutdown.
open_blocker: null
next_task: T10
```

##### JSON thực tế từ app.main:app

<details><summary>GET /api/v1/categories</summary>

```json
[{"id":1,"name":"Minimal","slug":"minimal","sort_order":0,"pack_count":1},{"id":2,"name":"Cute & Kawaii","slug":"cute-kawaii","sort_order":1,"pack_count":0},{"id":3,"name":"Gaming","slug":"gaming","sort_order":2,"pack_count":0},{"id":4,"name":"Anime Inspired","slug":"anime-inspired","sort_order":3,"pack_count":0},{"id":5,"name":"Neon & Cyber","slug":"neon-cyber","sort_order":4,"pack_count":1}]
```

</details>

<details><summary>GET /api/v1/packs</summary>

```json
{"items":[{"id":2,"category":{"id":5,"name":"Neon & Cyber","slug":"neon-cyber"},"title":"Neon Circuit","slug":"sample-neon","description":"Original Neon Circuit sample cursor set.","thumbnail_url":"http://localhost:8000/static/samples/sample-neon/thumbnail.webp","is_animated":false,"is_premium":false,"download_count":0,"created_at":"2026-11-17T10:31:21.737867Z","pointer":{"role_type":"pointer","preview_png_url":"http://localhost:8000/static/samples/sample-neon/pointer.png","cursor_file_url":"http://localhost:8000/static/samples/sample-neon/pointer.cur","hotspot_x":3,"hotspot_y":3}},{"id":1,"category":{"id":1,"name":"Minimal","slug":"minimal"},"title":"Minimal Graphite","slug":"sample-minimal","description":"Original Minimal Graphite sample cursor set.","thumbnail_url":"http://localhost:8000/static/samples/sample-minimal/thumbnail.webp","is_animated":false,"is_premium":false,"download_count":0,"created_at":"2026-11-17T10:31:21.706051Z","pointer":{"role_type":"pointer","preview_png_url":"http://localhost:8000/static/samples/sample-minimal/pointer.png","cursor_file_url":"http://localhost:8000/static/samples/sample-minimal/pointer.cur","hotspot_x":3,"hotspot_y":3}}],"pagination":{"page":1,"limit":12,"total":2,"total_pages":1,"has_next":false}}
```

</details>

<details><summary>GET /api/v1/packs/sample-minimal</summary>

```json
{"id":1,"category":{"id":1,"name":"Minimal","slug":"minimal"},"title":"Minimal Graphite","slug":"sample-minimal","description":"Original Minimal Graphite sample cursor set.","thumbnail_url":"http://localhost:8000/static/samples/sample-minimal/thumbnail.webp","is_animated":false,"is_premium":false,"download_count":0,"created_at":"2026-11-17T10:31:21.706051Z","updated_at":"2026-11-17T10:31:21.706051Z","cursor_items":[{"role_type":"pointer","preview_png_url":"http://localhost:8000/static/samples/sample-minimal/pointer.png","cursor_file_url":"http://localhost:8000/static/samples/sample-minimal/pointer.cur","hotspot_x":3,"hotspot_y":3,"id":1},{"role_type":"link","preview_png_url":"http://localhost:8000/static/samples/sample-minimal/link.png","cursor_file_url":"http://localhost:8000/static/samples/sample-minimal/link.cur","hotspot_x":11,"hotspot_y":4,"id":2},{"role_type":"text","preview_png_url":"http://localhost:8000/static/samples/sample-minimal/text.png","cursor_file_url":"http://localhost:8000/static/samples/sample-minimal/text.cur","hotspot_x":16,"hotspot_y":16,"id":3},{"role_type":"busy","preview_png_url":"http://localhost:8000/static/samples/sample-minimal/busy.png","cursor_file_url":"http://localhost:8000/static/samples/sample-minimal/busy.cur","hotspot_x":16,"hotspot_y":16,"id":4},{"role_type":"working","preview_png_url":"http://localhost:8000/static/samples/sample-minimal/working.png","cursor_file_url":"http://localhost:8000/static/samples/sample-minimal/working.cur","hotspot_x":3,"hotspot_y":3,"id":5},{"role_type":"precision","preview_png_url":"http://localhost:8000/static/samples/sample-minimal/precision.png","cursor_file_url":"http://localhost:8000/static/samples/sample-minimal/precision.cur","hotspot_x":16,"hotspot_y":16,"id":6},{"role_type":"unavailable","preview_png_url":"http://localhost:8000/static/samples/sample-minimal/unavailable.png","cursor_file_url":"http://localhost:8000/static/samples/sample-minimal/unavailable.cur","hotspot_x":16,"hotspot_y":16,"id":7},{"role_type":"move","preview_png_url":"http://localhost:8000/static/samples/sample-minimal/move.png","cursor_file_url":"http://localhost:8000/static/samples/sample-minimal/move.cur","hotspot_x":16,"hotspot_y":16,"id":8}]}
```

</details>

#### Previous Task Card — T08

```yaml
task_id: T08
task_name: Alembic canonical MySQL schema migration
agent: Codex
status: DONE
completed_at: "2026-11-17"
primary_files:
  - backend/alembic/env.py
  - backend/alembic/versions/0001_initial.py
scaffold:
  - backend/alembic.ini
dependencies: [T07]
commands_run:
  - docker compose up -d db
  - docker inspect <test-db> (wait for healthy)
  - alembic upgrade head --sql
  - alembic upgrade head
  - alembic current
  - alembic downgrade base
  - python -m ruff check app alembic
  - python -m ruff format --check alembic
  - python -m mypy app alembic
result_summary: Dùng MySQL mới trong project Compose tạm và mount backend vào image hiện có. Alembic chạy riêng. SHOW CREATE TABLE của bốn bảng trùng với kết quả chạy DDL chuẩn trên cùng MySQL. DB từ chối trùng slug, mã chia sẻ và pack/role. Đã xác minh ASCII phân biệt hoa thường, CHECK, FK RESTRICT/CASCADE và downgrade base.
open_blocker: null
deployment_followup: Dockerfile hiện chưa COPY Alembic. Khi đóng gói production cho T23, cần đưa alembic.ini và thư mục alembic vào image để lệnh migration chạy trực tiếp.
next_task: T09
```

#### Previous Task Card — T07

```yaml
task_id: T07
task_name: Auto-seed, app lifespan, health and static samples
agent: Codex
status: DONE
completed_at: "2026-11-17"
primary_files:
  - backend/app/db/seed.py
  - backend/app/main.py
dependencies: [T02, T03, T04, T05, T06]
commands_run:
  - docker build --target development -t ccs-backend:t07-dev ./backend
  - docker run --rm --entrypoint python ccs-backend:t07-dev -m ruff check app
  - docker run --rm --entrypoint python ccs-backend:t07-dev -m ruff format --check app
  - docker run --rm --entrypoint python ccs-backend:t07-dev -m mypy app
  - docker compose up --build -d --wait --wait-timeout 150
  - docker compose exec -T backend python - (SQL queries and HTTP GET/HEAD byte checks)
  - docker compose restart backend (twice)
  - docker compose stop db
  - docker compose up -d --wait --wait-timeout 150 db
  - docker compose logs --no-color --tail 10 backend
  - docker build --target production -t ccs-backend:t07-prod ./backend
  - docker run -d --read-only --network <test-network> --env-file <temp-prod-env> ccs-backend:t07-prod
  - docker exec -i <prod-container> python - (HTTP checks and SHOW TABLES)
result_summary: Compose chạy trên bản sao source và volume mới. MySQL có 5 categories, 2 pack published với đủ 8 role mỗi pack. 34 URL qua HEAD/GET và đọc binary. Hai lần restart giữ nguyên ID, timestamps và mtime. Khi MySQL dừng, live 200 và ready 503; ready trở lại 200 khi DB hoạt động. Production read-only chạy với DB mới vẫn không có bảng và sample routes trả 404.
open_blocker: null
next_task: T08
```

#### Previous Task Card — T06

```yaml
task_id: T06
task_name: Binary CUR encoder and unit tests
agent: Codex
status: DONE
completed_at: "2026-11-17"
primary_files:
  - backend/app/services/cur_encoder.py
  - backend/tests/test_cur_encoder.py
dependencies: [T03]
commands_run:
  - docker build --target development -t ccs-backend:t06-dev ./backend
  - python -m pytest tests/test_cur_encoder.py -q
  - python -m ruff check app tests
  - python -m ruff format --check app tests
  - python -m mypy app tests
  - python -c "<encode 48px CUR and print the first 22 bytes>"
  - python - "<Win32 LoadImageW and GetIconInfo smoke check>"
result_summary: 17 ca pytest và kiểm tra tĩnh PASS trong image dev. Win32 nạp CUR 32px (0,0), 32px (31,31) và 48px (47,47). Các file Win32 sinh tạm. Chưa kiểm tra hiển thị thủ công.
header_48px_47_47: "00 00 02 00 01 00 30 30 00 00 2f 00 2f 00 a8 25 00 00 16 00 00 00"
open_blocker: null
next_task: T07
```

#### Previous Task Card — T05

```yaml
task_id: T05
task_name: Cursor item and share ORM models
agent: Codex
status: DONE
completed_at: "2026-11-17"
primary_files:
  - backend/app/models/cursor_item.py
  - backend/app/models/custom_creation.py
dependencies: [T04]
commands_run:
  - docker build --target development -t ccs-backend:t05-dev ./backend
  - docker run --rm --entrypoint python ccs-backend:t05-dev -m ruff check app
  - docker run --rm --entrypoint python ccs-backend:t05-dev -m ruff format --check app
  - docker run --rm --entrypoint python ccs-backend:t05-dev -m mypy app
  - docker run --rm -i --entrypoint python ccs-backend:t05-dev -
result_summary: Import bốn bảng, configure mapper và biên dịch DDL MySQL để đối chiếu kiểu cột, tám role, FK CASCADE, check constraints và indexes. Schema chưa áp dụng vào database.
open_blocker: null
next_task: T06
```

#### Previous Task Card — T04

```yaml
task_id: T04
task_name: Category and pack ORM models
agent: Codex
status: DONE
completed_at: "2026-11-17"
primary_files:
  - backend/app/models/category.py
  - backend/app/models/cursor_pack.py
dependencies: [T03]
commands_run:
  - docker build --target development -t ccs-backend:t04-dev ./backend
  - docker run --rm --entrypoint python ccs-backend:t04-dev -m ruff check app
  - docker run --rm --entrypoint python ccs-backend:t04-dev -m ruff format --check app
  - docker run --rm --entrypoint python ccs-backend:t04-dev -m mypy app
  - docker run --rm -i --entrypoint python ccs-backend:t04-dev -
result_summary: So sánh metadata và DDL MySQL biên dịch từ hai model với DDL chuẩn. Xác minh kiểu và độ dài cột, mặc định, khóa, thứ tự index, ENUM và relationship. Kiểm tra dùng MySQL dialect và chưa áp dụng schema lên cơ sở dữ liệu.
open_blocker: null
next_task: T05
```

#### Previous Task Card — T03

```yaml
task_id: T03
task_name: Typed application config and AsyncSession
agent: Codex
status: DONE
started_at: "2026-11-17"
completed_at: "2026-11-17"
primary_files:
  - backend/app/core/config.py
  - backend/app/db/session.py
approved_additional_files:
  - backend/app/main.py
  - backend/pyproject.toml
  - backend/requirements.lock
  - backend/requirements-dev.lock
dependencies: [T02]
commands_run:
  - docker compose --env-file <temp-env> -p <test-project> -f docker-compose.dev.yml up -d --wait --wait-timeout 150 db
  - docker build --target development -t ccs-backend:t03-dev ./backend
  - docker build --target production -t ccs-backend:t03-prod ./backend
  - docker run --rm --entrypoint python ccs-backend:t03-dev -m ruff check app
  - docker run --rm --entrypoint python ccs-backend:t03-dev -m ruff format --check app
  - docker run --rm --entrypoint python ccs-backend:t03-dev -m mypy app
  - docker run --rm --entrypoint python <image> -m pip check
  - docker run --rm --entrypoint python <image> -c 'import cryptography; print(cryptography.__version__)'
  - docker run --rm --network <test-network> --env-file <runtime-env> -i --entrypoint python ccs-backend:t03-dev -
  - docker run --rm -e APP_ENV=production ccs-backend:t03-prod (với biến kiểm thử cho từng ca)
result_summary: Cryptography 50.0.2 có trong cả hai image. Image dev chạy SELECT 1 qua service db, UTC, mỗi request có session riêng, trả kết nối và dispose pool khi ASGI shutdown. Lỗi sai mật khẩu có thông báo kiểm tra cấu hình. Uvicorn production trả mã 3 khi thiếu cấu hình hoặc port sai. Log không chứa giá trị thử của credentials hay input lỗi.
open_blocker: null
next_task: T04
```

#### Previous Task Card — T02

```yaml
task_id: T02
task_name: Local Docker Compose and example env
agent: Codex
status: DONE
completed_at: "2026-11-17"
primary_files: [docker-compose.dev.yml, .env.example]
dependencies: [T01]
commands_run:
  - docker pull mysql:8.0
  - docker compose --env-file <temp/.env> -p <test-project> -f docker-compose.dev.yml config --quiet
  - docker compose --env-file <temp/.env> -p <test-project> -f docker-compose.dev.yml up -d --wait --wait-timeout 150 db
  - docker compose --env-file <temp/.env> -p <test-project> -f docker-compose.dev.yml up --build -d --wait --wait-timeout 150
  - docker compose --env-file <temp/.env> -p <test-project> -f docker-compose.dev.yml restart db backend
  - docker compose --env-file <temp/.env> -p <test-project> -f docker-compose.dev.yml ps
  - docker compose --env-file <temp/.env> -p <test-project> -f docker-compose.dev.yml down --volumes
result_summary: MySQL healthy trên 127.0.0.1:3307. File thử trên host kích hoạt Uvicorn reload. Truy vấn sau restart trả lại 42. Đúng hai service.
open_blocker: null
next_task: T03
```

#### Previous Task Card — T01

```yaml
task_id: T01
task_name: Backend package and container image
agent: Codex
status: DONE
started_at: "2026-11-17"
completed_at: "2026-11-17"
git_branch: main
git_commit: null
primary_files:
  - backend/pyproject.toml
  - backend/Dockerfile
dependencies: []
acceptance:
  - "[x] Docker development target builds"
  - "[x] Python 3.12 + dependency checks pass"
  - "[x] Production stage non-root, no reload"
  - "[x] No secrets in the backend build inputs"
commands_run:
  - docker build --target development -t ccs-backend:dev ./backend
  - docker build -f backend/Dockerfile --target development backend
  - docker run --rm --entrypoint python ccs-backend:dev -m pip check
  - docker build --target production -t ccs-backend:prod ./backend
  - docker run --rm --entrypoint python ccs-backend:prod -m pip check
  - docker run --rm --entrypoint id ccs-backend:prod -u
  - docker image inspect ccs-backend:dev ccs-backend:prod
  - docker history --no-trunc ccs-backend:dev
  - docker history --no-trunc ccs-backend:prod
  - docker run -d ccs-backend:dev
  - docker run -d ccs-backend:prod
  - docker exec <container> python -c '<TCP smoke check on 127.0.0.1:8000>'
  - docker run --rm --entrypoint python ccs-backend:dev -m ruff check app
  - docker run --rm --entrypoint python ccs-backend:dev -m ruff format --check app
  - docker run --rm --entrypoint python ccs-backend:dev -m mypy app
result_summary: Hai stage build và CMD mặc định mở cổng 8000. Cả hai dùng Python 3.12.16 và qua pip check. Development có reload. Production chạy UID 10001 với reload tắt. Pip cảnh báo cache không ghi được dưới UID này và vẫn trả mã 0.
open_blocker: null
next_task: T02
```

### 3.2 Task Session Log (append-only entries)

| Timestamp (UTC+7) | Agent | Task | Summary | Files | Tests PASS/FAIL | Commit | Next |
|---|---|---|---|---|---|---|---|
| 2026-11-17 | Architect | Docs baseline | 6 planning documents drafted; no code/task execution claimed | `*.md` | N/A | — | T01 |
| 2026-11-17 | Codex | T01 | Lần đầu Docker CLI thiếu pipe `dockerDesktopLinuxEngine`. Build và kiểm tra runtime chưa chạy được. | `backend/` | BLOCKED | — | T01 |
| 2026-11-17 | Codex | T01 | BuildKit mất kết nối EOF trong lần build đầu. Sau khi Docker Desktop chạy lại, build tuần tự. Ruff phát hiện file Python executable từ Windows build context. | `backend/` | FAIL | — | T01 |
| 2026-11-17 | Codex | T01 | Chuẩn hóa quyền file Python trong image dev và chạy lại kiểm thử. Ghim base image theo digest và khóa dependency trực tiếp, gián tiếp bằng SHA-256. | `backend/`, `TASKS.md`, `PROGRESS.md` | PASS | — | T02 |
| 2026-11-17 | Codex | T02 | `docker compose --env-file <temp/.env> -p <test-project> -f docker-compose.dev.yml config --quiet` PASS. Cấu hình đúng hai service và bind MySQL vào `127.0.0.1:3307`. Lệnh `up -d --wait db` gặp `unexpected EOF` lúc giải nén `mysql:8.0`. Lượt chạy lại bị gián đoạn khi tải image. Chờ kiểm thử MySQL healthy, reload và dữ liệu qua restart. | `docker-compose.dev.yml`, `.env.example`, `PROGRESS.md` | INCOMPLETE | — | T02 |
| 2026-11-17 | Codex | T02 | MySQL đã healthy. Kiểm tra TCP backend chạy sớm hơn lúc Uvicorn sẵn sàng và trả Connection refused. | `docker-compose.dev.yml`, `.env.example` | FAIL | — | T02 |
| 2026-11-17 | Codex | T02 | Chạy lại với bước chờ Uvicorn báo startup hoàn tất. Xác minh MySQL healthy, Uvicorn reload khi sửa file host và dữ liệu giữ qua restart. | `docker-compose.dev.yml`, `.env.example`, `TASKS.md`, `PROGRESS.md` | PASS | — | T03 |
| 2026-11-17 | Codex | T03 | Lỗi MySQL trên image hiện tại: asyncmy cần cryptography cho caching_sha2_password. Container tạm cài gói này đã qua SQL smoke test và kiểm tra vòng đời session. Startup hook từ chối thiếu cấu hình khi gọi riêng, entrypoint thật chưa nối hook. Ruff và mypy PASS. | `backend/app/core/config.py`, `backend/app/db/session.py`, `PROGRESS.md` | BLOCKED | — | T03 |
| 2026-11-17 | Codex | T03 | Sau khi được duyệt, nối FastAPI lifespan và khóa cryptography cho hai image. Giữ nguyên phiên bản dependency cũ. MySQL thật, ASGI startup/shutdown, log production và lint/typecheck PASS. | `backend/app/main.py`, `backend/pyproject.toml`, hai lockfile, `TASKS.md`, `PROGRESS.md` | PASS | — | T04 |
| 2026-11-17 | Codex | T04 | Đối chiếu metadata và DDL MySQL của hai model với schema chuẩn. Ruff, format và mypy PASS. | `backend/app/models/category.py`, `backend/app/models/cursor_pack.py`, `TASKS.md`, `PROGRESS.md` | PASS | — | T05 |
| 2026-11-17 | Codex | T05 | Ruff yêu cầu ngắt dòng import SQLAlchemy. Đã chỉnh và chạy lại build, Ruff, format, mypy, metadata và DDL MySQL. | `backend/app/models/cursor_item.py`, `backend/app/models/custom_creation.py`, `TASKS.md`, `PROGRESS.md` | PASS | — | T06 |
| 2026-11-17 | Codex | T06 | Đã sửa lỗi typecheck trong bài test alpha và chạy lại. 17 pytest, Ruff, mypy, hex header và Win32 hotspot PASS. | `backend/app/services/cur_encoder.py`, `backend/tests/test_cur_encoder.py`, `TASKS.md`, `PROGRESS.md` | PASS | — | T07 |
| 2026-11-17 | Codex | T07 | Sửa kiểu Table cho mypy và MIME WebP cho StaticFiles. Fresh Compose, 34 URL, hai lượt restart, health khi DB dừng và production read-only PASS. | `backend/app/db/seed.py`, `backend/app/main.py`, `TASKS.md`, `PROGRESS.md` | PASS | — | T08 |
| 2026-11-17 | Codex | T08 | Tạo Alembic scaffold tối thiểu và migration chuẩn. Kiểm thử lifecycle revision, SHOW CREATE TABLE và ràng buộc dữ liệu trên MySQL tạm. | `backend/alembic.ini`, `backend/alembic/env.py`, `backend/alembic/versions/0001_initial.py`, `TASKS.md`, `PROGRESS.md` | PASS | — | T09 |
| 2026-11-17 | Codex | T09 | Build, Ruff và mypy PASS. HTTP MySQL PASS qua mount tạm. Chờ duyệt mount router vào entrypoint vì T09 giới hạn hai file. | `backend/app/schemas/catalog.py`, `backend/app/api/v1/catalog.py`, `PROGRESS.md` | BLOCKED | — | T09 |
| 2026-11-17 | Codex | T09 | Sau khi được duyệt, mount router một lần trong main.py. Build, OpenAPI, HTTP MySQL, số SELECT và health/lifespan đều PASS qua app.main:app. | `backend/app/main.py`, `TASKS.md`, `PROGRESS.md` | PASS | — | T10 |
| 2026-11-17 | Codex | T10 | Local/R2 storage, kiểm tra URL/key, giới hạn read và timeout. 42 pytest, đọc CUR seed, Ruff và mypy PASS. | `backend/app/services/storage.py`, `backend/tests/test_storage.py`, `TASKS.md`, `PROGRESS.md` | PASS | — | T11 |
| 2026-11-17 | Codex | T11 | Build và kiểm thử HTTP qua mount tạm. CUR, upload negatives, 429, read-only và log PASS. Chờ duyệt mount Studio router vào entrypoint chính. | `backend/app/schemas/studio.py`, `backend/app/api/v1/studio.py`, `PROGRESS.md` | BLOCKED | — | T11 |
| 2026-11-17 | Codex | T11 | Sau khi được duyệt, mount Studio router trong main.py. Build, Ruff, mypy, HTTP, proxy trust và health/lifespan PASS qua app.main:app. | `backend/app/main.py`, `TASKS.md`, `PROGRESS.md` | PASS | — | T12 |
| 2026-11-17 | Codex | T12 | Golden INF, 15 slot theo thứ tự, .ani, chặn tên file và title độc hại, README kích hoạt thủ công. Build, pytest, Ruff và mypy PASS. | `backend/app/services/inf_builder.py`, `backend/tests/test_inf_builder.py`, `TASKS.md`, `PROGRESS.md` | PASS | — | T13 |
| 2026-11-17 | Codex | T13 | ZIP trong RAM, kiểm tra asset/INF, HTTP và cập nhật counter atomic. Build, 61 hồi quy, MySQL đồng thời, Ruff và mypy PASS. | `backend/app/services/zip_packager.py`, `backend/app/api/v1/catalog.py`, `TASKS.md`, `PROGRESS.md` | PASS | — | T14 |
| 2026-11-17 | Codex | T14 | Share create/view với preview allowlist và 90-day TTL. HTTP qua app.main, MySQL collision, OpenAPI, convert hồi quy và 61 pytest PASS. | `backend/app/services/share_service.py`, `backend/app/api/v1/studio.py`, `TASKS.md`, `PROGRESS.md` | PASS | — | T15 |
| 2026-11-17 | Codex | T15 | Suite hợp đồng 7 API trên app.main và MySQL tạm. Docker Compose, 70 pytest, Ruff, mypy và OpenAPI PASS. | `backend/tests/conftest.py`, `backend/tests/test_api_integration.py`, `TASKS.md`, `PROGRESS.md` | PASS | — | T16 |

**Append rule:** không sửa lịch sử kết quả cũ thành PASS; nếu retry, thêm dòng mới với cause/fix. Link logs phải được sanitize secrets.

## 4. Current Sprint Checklist

**Sprint 1 / Foundation — in progress**

- [x] T01 — tạo backend package + development/prod Docker stages.
- [x] T02 — docker compose gồm chính xác db/backend.
- [x] T03 — typed settings + async DB session.
- [x] T04 — Category, cursor pack models.
- [x] T05 — Cursor item, custom creation models.
- [x] T06 — binary CUR encoder + tests.
- [x] T07 — lifespan auto-seed + 5 categories/2 packs/8 roles + health check.
- [x] Phase gate P1: fresh clone test / idempotency / check logs.

**Rules for sprint updates:** mỗi phiên chỉ tick những mục đã có bằng chứng. Nếu phát hiện việc ngoài scope, ghi Proposed Task/CR, không mở rộng Txx.

## 5. Known Issues & Resolutions (Debugging Log)

### 5.1 Reusable issue template

```text
ISSUE ID: BUG-YYYYMMDD-NNN
First seen: YYYY-MM-DD HH:mm Asia/Bangkok
Phase / Task / Agent:
Severity: P0 blocker | P1 high | P2 medium | P3 low
Status: OPEN | INVESTIGATING | FIXED | VERIFIED | WONT_FIX_APPROVED
Environment: OS / Docker / DB / browser / API version
Symptom / expected vs actual:
Reproduction (minimal steps or curl):
Error message / stack excerpt (redact secrets):
Root cause:
Fix approach:
Files changed:
Regression test:
Verification commands & results:
Owner:
Resolved at:
Follow-up / linked CR:
```

### 5.2 Issue register — initial

| ID | Area | Finding | Status | Owner | Resolution / gate |
|---|---|---|---|---|---|
| RISK-001 | Windows Install | INF registers scheme; may require user to select/apply in Control Panel | KNOWN_LIMITATION | Product/UI | Honest README + Win10/11 VM check |
| RISK-002 | Library licensing | `@imgly/background-removal` AGPL, obligations must be evaluated | OPEN_GATE | Product/legal | License review or alternative, before public launch |
| RISK-003 | Browser cursor | CSS `.ani` support not guaranteed; >128px often restricted | MITIGATED_BY_DESIGN | Frontend | static PNG CSS + separate animation preview |
| RISK-004 | Windows roles | Schema has 8 UI roles, Windows legacy 15, Windows 11 optional 17 | MITIGATED_BY_DESIGN | Backend | canonical mapping; future 17-slot ADR |
| RISK-005 | Shared rate limits | slowapi in-memory not globally accurate with multi-worker deployment | OPEN_GATE | Backend/Ops | shared limit store or edge enforcement + load test |
| RISK-006 | CDN/R2 costs | Egress free ≠ free storage/operations | TRACK | Ops | cost budget / monthly alerts |

**Important:** đây là risk/known limitations, **không** phải bug đã được tái hiện. Khi lỗi thật xuất hiện, thêm entry theo mẫu, đừng gán “FIXED” nếu chưa test.

### 5.3 Worked example — illustration only, not actual bug

```text
ISSUE ID: EXAMPLE-NOT-ACTUAL
Task: T11
Symptom: PNG with filename .jpg fails upload
Root cause: extension and actual bytes disagree
Fix: sniff Magic Bytes + Pillow verify; reject mismatched/corrupt payload
Expected regression: 415 UNSUPPORTED_MEDIA_TYPE, never 500
Verification: <replace with actual test command/output when implemented>
Status: EXAMPLE_ONLY
```

## 6. Local Docker Environment

### 6.1 Env matrix

| Variable | Local value example | Production policy | Owner |
|---|---|---|---|
| `APP_ENV` | `development` | `production` | Codex |
| `AUTO_SEED` | `true` | `false` | Codex |
| `MYSQL_DATABASE` | `cursor_studio` | from secret-managed env | Codex |
| `MYSQL_USER` | `cursor_app` | least-privileged DB user | Codex |
| `MYSQL_PASSWORD` | **REDACTED** | secret, never git | Ops |
| `MYSQL_ROOT_PASSWORD` | **REDACTED** | secret, never git | Ops |
| `DATABASE_HOST` | `db` | `db` (compose service) | Codex |
| `DATABASE_PORT` | `3306` | `3306` internal only | Codex |
| `PUBLIC_API_BASE_URL` | `http://localhost:8000` | `https://api.example.com` placeholder | Codex |
| `PUBLIC_FRONTEND_BASE_URL` | `http://localhost:5173` | canonical site URL | Codex |
| `CORS_ORIGINS` | `http://localhost:5173` | exact approved https origins | Codex |
| `VITE_API_BASE_URL` | `http://localhost:8000/api/v1` | `https://api.example.com/api/v1` | Antigravity |
| `STORAGE_BACKEND` | `local` | `r2` | Ops |
| `PUBLIC_CDN_BASE_URL` | API local static URL | trusted R2 custom domain | Ops |
| `R2_ENDPOINT` | unset | account endpoint, private | Ops |
| `R2_BUCKET` | unset | expected assets bucket | Ops |
| `R2_ACCESS_KEY_ID` | unset | **REDACTED** | Ops |
| `R2_SECRET_ACCESS_KEY` | unset | **REDACTED** | Ops |
| `API_DOMAIN` | unset | `api.<your-domain>` | Ops |

Do **not** paste literal secrets in this table, screenshots or chat. The sample domains are placeholders, not configured deployed URLs.

### 6.2 Local commands reference

```bash
# Setup
cp .env.example .env
# edit passwords only in ignored .env

docker compose -f docker-compose.dev.yml up --build -d
docker compose -f docker-compose.dev.yml ps

docker compose -f docker-compose.dev.yml logs --tail=100 backend
curl -fsS http://localhost:8000/health/live
curl -fsS http://localhost:8000/health/ready
curl -fsS http://localhost:8000/api/v1/categories

# Frontend
cd frontend
npm ci
npm run dev
npm run typecheck
npm run build

# Backend integration tests
cd ../backend
python -m pytest tests -q

# Shutdown while retaining DB data
cd ..
docker compose -f docker-compose.dev.yml down
```

**Expected before implementation:** commands may fail because repository code has not been generated. Do not mark PASS until actual outputs exist.

### 6.3 Production verification entries (fill only after deployment)

```text
Release build SHA:
Frontend Pages deployment URL:
Backend version/image digest:
Caddy certificate status:
MySQL migration revision:
R2 bucket and CDN (no credentials):
Most recent backup timestamp:
Most recent successful restore check:
Windows 10 install test:
Windows 11 install test:
AGPL/asset licensing approval:
Production smoke test status:
```

## 7. Quality & Release Gates

| Gate | Criterion | Status | Evidence / Approver |
|---|---|---|---|
| G1 — API | 7 endpoints match contract + 4xx validations | PENDING | — |
| G2 — CUR | Header/offset/alpha/hotspot 32/48; Windows test | PENDING | — |
| G3 — Installer | 15 ordered Windows slots + ZIP paths + manual Windows test | PENDING | — |
| G4 — Privacy | Photos browser-only until export, upload no persist | PENDING | — |
| G5 — Security | Magic Bytes, size cap, no SSRF/path traversal, rate limits | PENDING | — |
| G6 — UI | Sandbox independent theme, 8 roles, keyboard/touch, mobile | PENDING | — |
| G7 — Sharing | Safe DB refs, code uniqueness, 404/410, 90d TTL | PENDING | — |
| G8 — Operations | TLS, DB migration, R2, 02:00 backup + restore | PENDING | — |
| G9 — Compliance | AGPL, third-party assets/license and content | PENDING | — |
| G10 — CI | Ruff/pytest, TS/lint/build, Playwright journey | PENDING | — |

`RELEASE_DECISION = NO-GO` until all ten PASS or a specifically documented owner-approved exception for non-security, non-privacy, non-compliance criteria.

## 8. Architecture Decisions / Change Requests

### 8.1 Decision register

| ADR | Decision | Rationale | State |
|---|---|---|---|
| ADR-001 | Dev 2 services, frontend host Vite | Fast inner loop | ACCEPTED |
| ADR-002 | Studio AI browser-side, CUR compile API | Privacy + verified binary | ACCEPTED |
| ADR-003 | 8 UI roles map deterministic to 15 Windows slots | MVP scope; complete registry list | ACCEPTED |
| ADR-004 | Mix share references published assets only | No arbitrary public upload/SSRF | ACCEPTED |
| ADR-005 | Quick-install branding ≠ actual one-click OS activation | Windows security boundary | ACCEPTED |
| ADR-006 | AGPL is a release review gate | Licensing risk | PENDING_APPROVAL |
| ADR-007 | Local storage dev; R2 production | Cost and deploy simplicity | ACCEPTED |

### 8.2 CR template

```text
CR ID:
Requester / timestamp:
Affected API / DB / frontend:
Current behavior:
Proposed behavior:
User / business impact:
Security / privacy / licensing implications:
Compatibility / migration:
Implementation tasks:
Approval (owner/date):
Status:
```

## 9. Session Handoff — copy for next Agent

**Trạng thái:** Backend API T01–T15 (Phase 1–2) và Toàn bộ Frontend T16–T22 (Phase 3) đã PASS 100%. Phase 4 — Production / QA bắt đầu với Task T23 dành cho Codex.

### 9.1 Next Session Prompt — Codex (T23)

```text
Bạn đang là Codex, Backend / DevOps Agent của dự án Custom Cursor Studio & Library.

Trước khi code, đọc đủ 6 tài liệu tại root:
PRD.md, ARCHITECTURE.md, DESIGN.md, RULES.md, TASKS.md, PROGRESS.md.

Task hiện tại: T23 — Production compose and Caddy HTTPS setup.
Primary files: docker-compose.prod.yml, deploy/Caddyfile.
Yêu cầu:
- Thiết lập production Docker Compose với backend, MySQL 8.0, Caddy reverse proxy HTTPS tự động.
- Cấu hình SPA routing cho Frontend tĩnh đã build (dist/), proxy /api và /static tới FastAPI backend.
- Cấu hình bảo mật: HSTS, X-Content-Type-Options: nosniff, CORS, Content Security Policy, rate limit.
- Chạy thử nghiệm compose và xác nhận health checks.
- Sau khi T23 hoàn thành, DỪNG lại để báo cáo. Không tự động chuyển sang T24.
```

### 9.3 End-of-session handoff update template

```text
Date / timezone:
Agent:
Last completed task:
Current active task/status:
Git branch / commit:
Exact files changed:
Last successful commands (and failures):
Open blockers (priority / owner):
Contract changes or CRs:
Environment assumptions (redact credentials):
Next task and dependency:
Copy-ready prompt for next session:
```

## 10. Maintenance rules for this document

- `PROGRESS.md` luôn phản ánh trạng thái code thực, không phản ánh kỳ vọng hoặc kế hoạch như thể đã hoàn thành.
- Mỗi lần task kết thúc, cập nhật **Phase Board**, **Task Checklist**, **Active Task Card**, **Session Log**, **Known Issues** nếu cần, và **Next Session Prompt**; không sửa bảng của Agent khác khi không có bằng chứng.
- Khi done count thay đổi, kiểm tra nhất quán `SUM(phase done) == total done` và task statuses.
- Sau release, snapshot tài liệu thành `docs/releases/v1.0/` và bắt đầu new progress cycle; không xóa lịch sử bug/decision.
