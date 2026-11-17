# TASKS.md — Granular Execution Plan for Codex & Antigravity

> **Plan version:** 1.0 | **Total:** 25 atomic tasks / 4 phases | **Start state:** all TODO  
> **Primary implementation principle:** 1 task = 1 small outcome = maximum 1–2 **primary code/config files**. Generated skeleton/lockfiles are allowed during scaffold tasks, but must be listed in task report.  
> **Coordination:** `PROGRESS.md` is the authoritative execution log; no Agent may work on a second task until the current task is PASS or marked BLOCKED with actionable next step.

## 0. Execution protocol

### 0.1 Required reading before work

Each Agent opens all root docs, then reads only target task and its dependencies before coding:

```text
PRD.md -> ARCHITECTURE.md -> DESIGN.md -> RULES.md
       -> TASKS.md (current Task ID) -> PROGRESS.md
```

Every task delivery must show **files changed**, **exact terminal commands**, **tests/results**, **AC checklist**, **risks**, **update PROGRESS**. Never replace backend API with frontend mocks to force task completion. The codebase may have tooling-generated initial placeholder modules in Phase 1; subsequent tasks replace these deliberately without inventing response data.

### 0.2 Global Definition of Done for each task

- Primary files modified only within assigned list; ancillary changes are scaffold/lockfiles or explicitly approved.
- Runnable syntactically and typed; no critical lint errors; newly added endpoints/components have at least one relevant test (in a later dedicated test task if test file would exceed two-file scope).
- No secrets, customer uploads, raw binary logs or temporary ZIP files committed.
- Contract matches `ARCHITECTURE.md`; if mismatch, open CR before implementing.
- Task result reflected in `PROGRESS.md` with time, git commit (if any), evidence and next step.
- A task is **DONE** only if all its listed acceptance criteria pass; “feature seems fine” does not suffice.

### 0.3 Dependency graph

```text
PHASE 1 — Foundation / Codex
T01 -> T02 -> T03 -> T04 -> T05 -> T06 -> T07
                                    |       |
                                    +-------+--> T08
PHASE 2 — Backend APIs / Codex
T08 -> T09 -> T10 -> T11 -> T12 -> T13 -> T14 -> T15
             \         \                 /
              \-> list/detail       share tests
PHASE 3 — Frontend / Antigravity
T09 + T15 -> T16 -> T17 -> T18 -> T19 -> T20 -> T21 -> T22
PHASE 4 — Production / QA
T15 + T22 -> T23 -> T24 -> T25
```

The linear ordering above is the recommended solo workflow, not an excuse to wait when an earlier task only needs a documented interface. Backend and frontend can overlap after endpoints/schemas stabilize, but no shared-file collisions.

---

## PHASE 1 — Docker-First Foundation & Real Seed Data (T01–T07)

**Gate:** fresh clone + `.env` + one `docker compose up --build` launches healthy API; MySQL has exactly 5 seed categories, ≥2 published packs with all 8 valid cursor roles; restart is idempotent.

### T01 — Backend package and container image

- **Agent:** Codex | **Dependencies:** none | **Priority:** P0
- **Primary files:** `backend/pyproject.toml`, `backend/Dockerfile`.
- **Technical work:** Python 3.12; pin compatible ranges for FastAPI, uvicorn, SQLAlchemy[asyncio], asyncmy, Pydantic v2, Alembic, Pillow, python-multipart, slowapi, boto3/aioboto3 or bounded threadpool adapter, pytest/pytest-asyncio, ruff. Make development and production Docker stages. Production runs as non-root; no `--reload`. During initial framework scaffold, generate empty package directories, `backend/app/__init__.py`, `backend/alembic.ini` and stub API router modules **only if mechanically needed**, and report them as ancillary scaffold outputs.
- **Acceptance criteria:**
  - [x] Dockerfile has dev/prod target, Python 3.12, workdir `/app`, stable pip install and valid CMD.
  - [x] `docker build -f backend/Dockerfile --target development backend` passes with minimal app skeleton.
  - [x] `python -m pip check` passes in image; dependency versions are pinned/locked for CI reproducibility.
  - [x] No secrets in image layers, no debug root runtime in production.
- **Evidence command:** `docker build --target development -t ccs-backend:dev ./backend`.

### T02 — Local Docker Compose and example env

- **Agent:** Codex | **Dependencies:** T01
- **Primary files:** `docker-compose.dev.yml`, `.env.example`.
- **Technical work:** exactly two services `db:mysql:8.0` and `backend` hot-reload; MySQL healthcheck, named volume, host-bound 8000/3307; document local passwords placeholders, `CORS_ORIGINS`, `AUTO_SEED`.
- **Acceptance criteria:**
  - [x] `docker compose -f docker-compose.dev.yml config` passes with `.env` created from example.
  - [x] `docker compose ... up -d db` reaches `healthy`.
  - [x] Backend mounts source for reload, DB remains intact after service restart.
  - [x] No public MySQL port bind on `0.0.0.0` and no third dev container.
- **Evidence command:** `docker compose -f docker-compose.dev.yml ps`.

### T03 — Typed application config and AsyncSession

- **Agent:** Codex | **Dependencies:** T02
- **Primary files:** `backend/app/core/config.py`, `backend/app/db/session.py`.
- **Technical work:** Pydantic Settings/env parsing; dev/prod flags; CORS allowlist and public base URLs; SQLAlchemy `AsyncEngine`, `async_sessionmaker`, declarative Base; produce DSN safely from individual env vars (no interpolation injection); DB UTC, SQL pool_pre_ping.
- **Acceptance criteria:**
  - [x] Missing required prod settings cause startup validation error, no silent default secret.
  - [x] One AsyncSession per request, dependency yields/closes correctly.
  - [x] `asyncmy` connects DB via service name `db`; wrong password results in actionable log without secret.
  - [x] Typecheck/lint passes; no synchronous DB calls in event loop.
- **Evidence:** test connection within backend container; static checks.

### T04 — Category and pack ORM models

- **Agent:** Codex | **Dependencies:** T03
- **Primary files:** `backend/app/models/category.py`, `backend/app/models/cursor_pack.py`.
- **Technical work:** SQLAlchemy 2.x typed `Mapped[...]`; category slug unique/sort index; pack category FK, enum status draft/published, counts, created/updated UTC, indexes exactly as DDL; relationships with string names to avoid circular imports.
- **Acceptance criteria:**
  - [x] Column types/limits match canonical SQL including `BIGINT UNSIGNED` and MySQL enum.
  - [x] Draft is default, category FK RESTRICT, `download_count>=0` logically enforced by UNSIGNED.
  - [x] `metadata.tables` contains `categories`, `cursor_packs`; no hardcoded sample pack data in model.
- **Evidence:** small import/metadatas inspection; ruff.

### T05 — Cursor item and share ORM models

- **Agent:** Codex | **Dependencies:** T04
- **Primary files:** `backend/app/models/cursor_item.py`, `backend/app/models/custom_creation.py`.
- **Technical work:** 8-role enum, FK `ON DELETE CASCADE`, unique pack/role, hotspot TINYINT UNSIGNED + CHECK 0..47, URLs; share code case-sensitive ASCII unique, JSON, expiry index, download_count.
- **Acceptance criteria:**
  - [x] SQLAlchemy metadata has all four tables and explicit FK/index/unique constraints.
  - [x] Role enum contains exactly 8 values; no 15 registry slots stored directly as product roles.
  - [x] Share code constraint 8..12, JSON config field and UTC dates defined.
- **Evidence:** `python -c` metadata introspection and SQL compile check.

### T06 — Binary CUR encoder + unit tests

- **Agent:** Codex | **Dependencies:** T03
- **Primary files:** `backend/app/services/cur_encoder.py`, `backend/tests/test_cur_encoder.py`.
- **Technical work:** Pillow RGBA contain resize, exif normalization, 32-bit BGRA XOR bottom-up, AND mask padding to DWORD, CUR ICONDIR/ICONDIRENTRY with hotspots. Unit tests with transparent circles and corner cases.
- **Acceptance criteria:**
  - [x] 32px (0,0), 32px (31,31), 48px (47,47) encode correctly.
  - [x] Prefix bytes `00 00 02 00`, correct byte offsets/entry length; DIB biHeight double size.
  - [x] Alpha transparency retained, image not stretched; invalid size/hotspot raise exception.
  - [x] `pytest backend/tests/test_cur_encoder.py -q` passes, no external `win2xcur` dependency.
- **Evidence:** test stdout + inspected header hex.

### T07 — Auto-seed + app lifespan/health/static

- **Agent:** Codex | **Dependencies:** T02–T06
- **Primary files:** `backend/app/db/seed.py`, `backend/app/main.py`.
- **Technical work:** dev-only `create_all` in lifespan; idempotent upsert 5 categories, 2+ theme packs, PNG alpha + CUR 8 roles each via T06, files `app/static/samples`; enable `/health/live`, `/health/ready`, `/static/samples`; include scaffolded catalog/studio routers if present (otherwise route mounting added explicitly in T09/T11 through sanctioned small follow-up edit).
- **Acceptance criteria:**
  - [x] Fresh DB boots and `GET /health/ready` returns 200.
  - [x] Categories count exactly 5; ≥2 published packs each have precisely 8 distinct roles and working file URLs.
  - [x] Restart twice creates no duplicate rows or redundant file changes.
  - [x] `APP_ENV=production` does not run dev seed/create_all; `/docs` works in dev.
- **Evidence:** Docker logs, DB count SQL, `curl -I` preview asset.

---

## PHASE 2 — Data Contracts, Safe Converters & Packaging (T08–T15)

**Gate:** seven API endpoints pass contract, binary, validation, rate-limit and integration tests; ZIP's 15 Registry references resolve; images are not persisted by convert.

### T08 — Alembic canonical MySQL schema migration

- **Agent:** Codex | **Dependencies:** T07
- **Primary files:** `backend/alembic/env.py`, `backend/alembic/versions/0001_initial.py`.
- **Technical work:** async migration environment, initial migration matching DDL columns/index/constraints, upgrade/downgrade; `alembic.ini` supplied by T01 scaffold. Dev data remains; migration intended for clean production schema.
- **Acceptance criteria:**
  - [x] `alembic upgrade head` on clean DB creates 4 tables + indexes + FK + CHECK.
  - [x] `alembic current` reports head; downgrade test on disposable DB passes.
  - [x] Migration does not rely on backend startup `create_all()`.
  - [x] Unique pack slug, share code and `(pack_id,role_type)` enforced by DB.
- **Evidence:** generated `SHOW CREATE TABLE` comparison to doc.

### T09 — Gallery schemas + categories/list/detail endpoints

- **Agent:** Codex | **Dependencies:** T07, T08
- **Primary files:** `backend/app/schemas/catalog.py`, `backend/app/api/v1/catalog.py`.
- **Technical work:** `GET /categories`, `GET /packs`, `GET /packs/{slug}` with Pydantic response DTO; category published counts; q/slug/category filtering; stable popular/newest pagination; eager 8 roles sorted; pointer DTO in list. Ensure `main.py` router mount from T07 scaffold becomes active; if missing, record a tiny integration follow-up, never silently violate 2-file scope.
- **Acceptance criteria:**
  - [x] List default `page=1,limit=12,sort=popular`; category counts only published; no N+1.
  - [x] `?page=0`, `?limit=49`, `?sort=invalid` return normalized 422.
  - [x] Published detail has 8 roles + URLs/hotspots; draft slug returns 404.
  - [x] JSON property names, order policy and pagination match examples in Architecture.
- **Evidence:** three curl JSON samples saved in PROGRESS reference.

### T10 — Trusted storage adapter and traversal tests

- **Agent:** Codex | **Dependencies:** T07
- **Primary files:** `backend/app/services/storage.py`, `backend/tests/test_storage.py`.
- **Technical work:** local vs R2 adapter, strip only configured CDN prefix to known bucket key, local path resolution under static root; max asset bytes; no HTTP arbitrary remote fetch; async or bounded threadpool calls.
- **Acceptance criteria:**
  - [x] Read existing sample .cur by validated URL/key works.
  - [x] Reject external domain, `../`, `%2e%2e`, symlink escape and oversized file.
  - [x] R2 secrets never returned in URL/log; file read timeout maps to storage error.
  - [x] Tests pass without real R2 credentials (mocked adapter).
- **Evidence:** test_storage suite + negative tests.

### T11 — Studio convert API and request schema

- **Agent:** Codex | **Dependencies:** T06, T07
- **Primary files:** `backend/app/schemas/studio.py`, `backend/app/api/v1/studio.py`.
- **Technical work:** multipart POST convert; max 2MiB; magic PNG/JPEG/WEBP + Pillow verify + pixel cap; 32/48/hotspot bounds; rate limit 10/min/IP; threadpool CUR encoding; attachment/no-store response. Provide placeholder router for share endpoints to be added in T14 (do not fake responses).
- **Acceptance criteria:**
  - [x] Valid 32/48 returns binary with CUR prefix and correct `Content-Disposition`.
  - [x] SVG/GIF/EXE renamed `.png` rejected 415, >2MiB 413, invalid hotspot 422.
  - [x] 11th rapid convert (same test IP) returns 429; forwarded IP handling behind proxy is safe.
  - [x] No upload saved as permanent disk file, logs contain no image data.
- **Evidence:** curl multipart example and header hexdump; rate test.

### T12 — Strict INF 15-slot builder + tests

- **Agent:** Codex | **Dependencies:** T06
- **Primary files:** `backend/app/services/inf_builder.py`, `backend/tests/test_inf_builder.py`.
- **Technical work:** implement 15 ordered Windows slots exactly; accept mapping 8 role → generated safe filenames; generate `Install.inf` with `[Version]`, `[DefaultInstall]`, `[SourceDisksNames]`, `[SourceDisksFiles]`, `[DestinationDirs]`, `[CursorFiles]`, `[CursorScheme]`, `[Strings]`; quote/CRLF/percent sanitization; allow `.ani` where source really .ani.
- **Acceptance criteria:**
  - [x] `len(REGISTRY_ROLE_ORDER) == 15`; output comma-split has exactly 15 entries in canonical order.
  - [x] Every scheme path references declared safe file; `Wait` != `AppStarting` map.
  - [x] Pack title `"`, comma, `\r\n`, `%` cannot inject INF sections.
  - [x] Snapshot/golden INF test pass; README instructs real Windows install flow (no automatic activation promise).
- **Evidence:** `pytest backend/tests/test_inf_builder.py -q`.

### T13 — Byte-only ZIP packager + download route

- **Agent:** Codex | **Dependencies:** T09, T10, T12
- **Primary files:** `backend/app/services/zip_packager.py`, `backend/app/api/v1/catalog.py` (modify).
- **Technical work:** implement `GET /packs/{id}/download`, get trust-validated asset bytes with 10MiB/item and 50MiB total, package manifest, README and INF via in-memory BytesIO; atomic increment after successful package build; stream zip; no disk ZIP.
- **Acceptance criteria:**
  - [x] ZIP returns 200 `application/zip`, opens with Python ZipFile, contains `Install.inf`, README + 8 role files.
  - [x] Every referenced INF path ends in one of actual ZIP basenames, zero traversal entries.
  - [x] `.ani` preserved on trusted source item; missing/corrupt asset yields 409/502, no count increment.
  - [x] Download count increments once on successful generated ZIP, no lost update under concurrency test.
- **Evidence:** `curl -o sample.zip`; `unzip -t`; automated script inspect INF list.

### T14 — Cryptographic share service + share routes

- **Agent:** Codex | **Dependencies:** T09, T11
- **Primary files:** `backend/app/services/share_service.py`, `backend/app/api/v1/studio.py` (modify).
- **Technical work:** implement POST share and GET share; use Pydantic schemas from T11, strict v1 role refs; validate published pack/item; secure 10-char Base62 + unique DB retry; expiry 90d; resolved previews only; share rate limiting; client controlled title sanitized.
- **Acceptance criteria:**
  - [x] POST valid refs returns 201 with share_code/share_url/expires_at.
  - [x] GET code returns matching config and published resolved_items; link doesn't need auth.
  - [x] Invalid/hidden pack, invalid roles/config, payload >8KiB rejected 4xx.
  - [x] Unknown returns 404; expired or now-unpublished source returns 410; unique conflict retries correctly.
- **Evidence:** POST + GET test pair, expiry negative test.

### T15 — Cross-endpoint API integration suite

- **Agent:** Codex | **Dependencies:** T08–T14
- **Primary files:** `backend/tests/conftest.py`, `backend/tests/test_api_integration.py`.
- **Technical work:** isolated seeded test MySQL db / TestClient or HTTPX async transport, fixtures, all 7 endpoints; pagination/error contract, 15-slot ZIP, upload bytes/magic, rate limits, expired share. No production credentials or external calls.
- **Acceptance criteria:**
  - [x] All 7 endpoints happy path + relevant 4xx case pass.
  - [x] Header CUR = `00 00 02 00`, ZIP = `PK`, scheme split exactly 15.
  - [x] Seed rerun idempotent; draft excluded; expired share 410; upload spoof rejected.
  - [x] `ruff`, `pytest`, Docker compose smoke run green; OpenAPI JSON accessible.
- **Evidence:** complete test output + example request/response in PROGRESS.

---

## PHASE 3 — React Experience / Antigravity (T16–T22)

**Gate:** real API-backed gallery, sandbox 8 roles, Studio CUR export, Mix localStorage and share link all work on browser desktop/mobile; no fatal TS errors.

### T16 — Vite React TS/Tailwind scaffold + base app shell

- **Agent:** Antigravity | **Dependencies:** API contract from T09 stable (can start earlier using DTO examples)
- **Primary files:** `frontend/package.json`, `frontend/src/App.tsx`.
- **Technical work:** run Vite React+TS generator (index.html, main.tsx, tsconfig, vite.config, lockfile as mechanical outputs); set React 18, strict TS and Tailwind/Lucide; App shell header/nav/theme provider and placeholder route surfaces. Route placeholders are **not production mock data** and must be replaced by end T22.
- **Acceptance criteria:**
  - [x] `npm ci`, `npm run dev`, `npm run typecheck`, `npm run build` pass.
  - [x] Site theme Light/Dark works, header responsive, font tokens available.
  - [x] `VITE_API_BASE_URL` from env; no backend URL hardcoded in components.
  - [x] Generated scaffold files listed explicitly in report; TS config strict flags set.
- **Evidence:** dev screenshot both site themes + build logs.

### T17 — Typed REST client and API contracts

- **Agent:** Antigravity | **Dependencies:** T16, T15
- **Primary files:** `frontend/src/types/api.ts`, `frontend/src/lib/api.ts`.
- **Technical work:** DTO types matching 7 endpoints, all role enums, fetch typed wrappers, pagination params, error handler, GET abort/timeouts; Blob download for ZIP/CUR, `FormData` for studio, no manual multipart content-type; encoded query params.
- **Acceptance criteria:**
  - [x] No `any`, no type cast hiding missing fields; API errors map to user readable codes.
  - [x] Can GET categories, list and detail from Docker seed; binary download uses Blob safely.
  - [x] Browser network `VITE_API_BASE_URL` correctly points to dev API; CORS handled by backend.
  - [x] `npm run typecheck` passes with `strict`, `exactOptionalPropertyTypes`.
- **Evidence:** Network response screenshots or logs excluding binary/raw photo.

### T18 — `PackCard` and API-driven `GalleryPage`

- **Agent:** Antigravity | **Dependencies:** T17
- **Primary files:** `frontend/src/components/PackCard.tsx`, `frontend/src/features/gallery/GalleryPage.tsx`.
- **Technical work:** categories chips, text search debounce 250ms, sort and pagination URL sync, skeleton/empty/error, responsive cards; Hover-to-Test `pointer` as CSS cursor with hotspot and native fallback; keyboard/touch alternative.
- **Acceptance criteria:**
  - [x] Category and search filter data from API, not hardcoded packs.
  - [x] `cursor: url(...) x y, auto` only on card test zone; broken URLs do not block navigation.
  - [x] Browser back/forward restores q/category/sort/page; abort stale search.
  - [x] Keyboard enter/focus and mobile Try action usable; both themes visually correct.
- **Evidence:** demo hover/focus + Network requests + mobile screenshot.

### T19 — 8-role Sandbox + Pack Detail

- **Agent:** Antigravity | **Dependencies:** T18
- **Primary files:** `frontend/src/components/InteractiveSandbox.tsx`, `frontend/src/features/gallery/PackDetailPage.tsx`.
- **Technical work:** detail fetch by slug, 8 item cards, independent sandbox Light/Dark, 8 zones with `data-cursor-role`, dynamic CSS hotspots/fallback keywords, source `.ani` web preview downgrade; ZIP Download button from API, authentic install guide.
- **Acceptance criteria:**
  - [x] Eight roles displayed and mapped to unique DOM zones; site theme unchanged by sandbox switch.
  - [x] All CSS cursors have fallback, no global `body` override; thumbnails 32/48px.
  - [x] Download ZIP clicks actual backend and shows error when 409/502.
  - [x] Missing pack 404 handled; animated source not falsely displayed as native `.ani` CSS.
- **Evidence:** screenshot Light Sandbox on Dark site and reverse, downloaded ZIP manifest.

### T20 — Hotspot grid and lazy AI module

- **Agent:** Antigravity | **Dependencies:** T16
- **Primary files:** `frontend/src/components/HotspotGridPicker.tsx`, `frontend/src/features/studio/backgroundRemoval.ts`.
- **Technical work:** 32/48 zoomed checkerboard grid + red crosshair, click-to-pixel math, keyboard/numeric inputs, bounds/size scaling; lazy import đúng package `@imgly/background-removal`; fallback error/Skip AI and model progress callbacks. License approval must be tracked before release.
- **Acceptance criteria:**
  - [ ] Corner clicks `(0,0)`, `(31,31)`, `(47,47)` exact; keyboard arrows and numeric input work.
  - [ ] Changing size keeps valid hotspot proportional to final image.
  - [ ] AI module is not downloaded on Gallery load; safe fallback when unavailable.
  - [ ] No localStorage photo/Blob persistence; license gate present in release checklist.
- **Evidence:** unit/manual coordinate test results; network waterfall on Gallery shows no WASM.

### T21 — Studio Canvas pipeline + Export Page

- **Agent:** Antigravity | **Dependencies:** T11, T17, T20
- **Primary files:** `frontend/src/features/studio/StudioCanvas.tsx`, `frontend/src/features/studio/StudioPage.tsx`.
- **Technical work:** upload dropzone 2MiB validation, preview alpha checkerboard, optional client-side cutout using T20 helper, alpha-mask sticker outline, contain resize 32/48, hotspot picker from T20, POST PNG output + x/y/size to convert; Blob download; loading/error/retry/accessibility.
- **Acceptance criteria:**
  - [ ] Can export 32 and 48 transparent images into CUR from real backend (prefix header tested via browser blob).
  - [ ] AI remove background can be skipped/failed without disabling Export.
  - [ ] Outline follows subject alpha not bounding-box; image keeps proportions.
  - [ ] 413/415/422/429 show actionable error, no double submit, object URLs revoked.
- **Evidence:** 2 sample CUR downloaded + screenshot hotspot grid and Network payload.

### T22 — MixMatchDock and local/shared Mix Page

- **Agent:** Antigravity | **Dependencies:** T14, T17, T19
- **Primary files:** `frontend/src/components/MixMatchDock.tsx`, `frontend/src/features/mix/MixPage.tsx`.
- **Technical work:** 8 role dock, localStorage `ccs.mix.v1`, validation/migration fallback, add/replace/remove/clear, expanded mobile sheet, live sandbox integration via app state, share POST, read-only GET for `/mix/:code`, explicit Use this mix, 404/410.
- **Acceptance criteria:**
  - [ ] Mix persists reload, 8 roles independent, remove/reassign doesn't corrupt others.
  - [ ] Share creates URL, another browser can open and preview same public source roles.
  - [ ] Visiting link does not silently overwrite local mix; click Use this mix does.
  - [ ] Mobile dock doesn't cover key controls; corrupt localStorage handled gracefully.
  - [ ] No photo/Base64 or external URL in share config; only refs.
- **Evidence:** cross-browser share flow, localStorage schema screenshot (no sensitive user data).

---

## PHASE 4 — Deploy, Backup, CI and Release QA (T23–T25)

**Gate:** public Cloudflare Pages + VPS backend serve over HTTPS, R2 works, backup retention/restore tested, CI green, Windows VM installation performed manually, legal/license gate approved.

### T23 — Production Compose + TLS Reverse Proxy

- **Agent:** Codex | **Dependencies:** T15
- **Primary files:** `docker-compose.prod.yml`, `infra/Caddyfile`.
- **Technical work:** production MySQL+backend+Caddy stack; encrypted HTTPS, Caddy reverse proxy, health checks, non-root backend, read-only container, R2 env, DB only private network, no reload/seed; Cloudflare Pages frontend build configured in dashboard with `VITE_API_BASE_URL`.
- **Acceptance criteria:**
  - [ ] `docker compose --env-file .env.prod -f docker-compose.prod.yml config` valid using redacted secrets.
  - [ ] DB not exposed public; backend behind Caddy; HTTPS certificate healthy on staging domain.
  - [ ] CORS only expected frontend origins, `/health/ready` and 7 API endpoints reachable.
  - [ ] Alembic migration run once via deployment step, not auto-create schema on boot.
- **Evidence:** `curl -I https://api.<domain>/health/live` and compose status (redacted).

### T24 — 02:00 backup to R2 + verified restore

- **Agent:** Codex | **Dependencies:** T23
- **Primary files:** `infra/backup-mysql.sh`, `infra/restore-mysql.sh`.
- **Technical work:** encrypted/limited-privilege DB dump with `--single-transaction`, gzip, sha256 manifest, AWS S3-compatible R2 endpoint, cron 02:00 `Asia/Bangkok`, retention, failure alert/runbook, restore into staging DB only; script secure `umask 077` and no echo secrets.
- **Acceptance criteria:**
  - [ ] Cron configured for correct local timezone (test conversion against UTC).
  - [ ] Backup object and SHA-256 visible in R2; no secrets in logs.
  - [ ] Restore into disposable DB yields same row counts/integrity.
  - [ ] Failed upload exits nonzero and triggers documented alert; retention dry run safe.
- **Evidence:** timestamped backup key and anonymized restore log.

### T25 — Continuous validation, browser E2E and launch gates

- **Agent:** Antigravity (E2E) + Codex review CI backend job; **Owner:** Antigravity | **Dependencies:** T15, T22–T24
- **Primary files:** `.github/workflows/ci.yml`, `frontend/e2e/happy-path.spec.ts`.
- **Technical work:** GitHub Actions checks backend ruff/pytest/migration and frontend typecheck/lint/build; Playwright journey gallery → detail → sandbox → zip, studio → .cur, mix → share; use local docker services or test deployment; final release test matrix Windows 10/11 + security/license checklist logged in PROGRESS.
- **Acceptance criteria:**
  - [ ] CI green on clean pull request, failure stops deploy; actual API data used, no hardcoded response fixtures in E2E.
  - [ ] Playwright tests on Chromium (at minimum) pass; no console error/uncaught rejection.
  - [ ] Windows 10/11 VM: `Install.inf` installs scheme and exported CUR hotspot works (manual evidence if CI Windows VM unavailable).
  - [ ] Backup restore and AGPL/license gate marked PASS by responsible human; CDN CORS; Cloudflare Pages deployment uses immutable backend contract.
  - [ ] Release `GO` decision only after all `PROGRESS.md` gates checked; otherwise `NO-GO` with owner and blockers.
- **Evidence:** CI run link, E2E output, Windows test checklist, release decision (do not fabricate result).

---

## 5. Cross-phase acceptance matrix

| Capability | Backend task | Frontend task | Final QA |
|---|---|---|---|
| Dev Docker + seed 5 categories | T01–T07 | T17 | Dev compose health, idempotency |
| Gallery filter & pointer Hover | T09 | T18 | URL/query, keyboard/touch, real data |
| 8-role Sandbox | T09 | T19 | CSS fallback and independent Light/Dark |
| Photo Studio cutout/outline/hotspot | T06, T11 | T20–T21 | transparency, 32/48 corners, privacy |
| CUR binary export | T06, T11 | T21 | hex/Windows pointer test |
| Quick Installer ZIP with 15 slots | T10, T12–T13 | T19 | ZIP manifest + Windows VM |
| Mix local + share code | T14 | T22 | 404/410, cross-browser, TTL |
| Production R2/Caddy/backup | T10, T23–T24 | T16–T22 | HTTPS, restore, monitoring |
| Continuous checks | T15, T25 review | T25 | CI green / release gates |

## 6. Agent-ready task invocation template

Paste the following template and replace only `Txx` and any explicitly approved runtime values. Do not paste entire chat history into each Agent session.

```text
Bạn là <Codex/Antigravity> đang triển khai Custom Cursor Studio & Library.

1. Đọc 6 file PRD.md, ARCHITECTURE.md, DESIGN.md, RULES.md,
   TASKS.md, PROGRESS.md trong repo.
2. Chỉ thực thi TASK Txx trong TASKS.md và kiểm tra dependencies.
3. Không sửa quá 1–2 primary files đã chỉ định, trừ generated scaffolding
   hoặc change request được phê duyệt; không chỉnh API/schema ngoài contract.
4. Triển khai code chạy được; chạy chính xác commands/test của TASK.
5. Khi hoàn thành, cập nhật PROGRESS.md: status, evidence, known issues,
   decision, next session prompt; báo đầy đủ files changed.
6. Nếu bị blocker: nêu command, stack trace trích yếu, nguyên nhân,
   hành động khắc phục cụ thể; tuyệt đối không bịa PASS.

TASK ID: Txx
DEFINITION OF DONE: exactly as in TASKS.md.
```

## 7. Agent work handoff / merge controls

- Commit prefixes: `feat(be):`, `feat(fe):`, `fix(be):`, `fix(fe):`, `test:`, `infra:`, `docs:`. Git branch `task/Txx-short-slug`.
- Codex merges endpoint changes before Antigravity consumes schema; never edit same file concurrently.
- Backend must provide OpenAPI snapshot or sample endpoint responses after T15; frontend must report any mismatch as CR.
- Every task handoff includes unambiguous NEXT TASK. Update `PROGRESS.md` before changing to new phase.
- If generated app scaffold places more files than the two primary files, these are explicitly mechanical outputs; edit them manually only through a separate approved follow-up task when behavior changes.

## 8. Release decision rules

`GO` only when P0 user stories pass, tests green, security negatives green, 15-slot INF tested on Windows, R2 backup/restore proven, license rights/AGPL reviewed, HTTPS/CORS verified, responsive accessibility reviewed. Otherwise `NO-GO`, record each unmet item/owner/remediation in `PROGRESS.md`. Monetization features must not be introduced before this decision; premium flags remain informational during MVP.
