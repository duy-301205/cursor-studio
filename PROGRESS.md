# PROGRESS.md — Project State Tracker, Decisions & Debugging Log

> **Project:** Custom Cursor Studio & Library | **Tracking schema:** v1.0  
> **Last updated:** 2026-11-17 | **Status:** IN_PROGRESS
>
> **Current phase:** P1 — Foundation | **Next task:** T05
>
> **Important:** Trạng thái bên dưới là template ban đầu; **không** có task kỹ thuật nào được đánh dấu PASS trước khi Agent thực sự chạy code/test.

## 1. Executive Snapshot

| Field | Current value | Update rule |
|---|---|---|
| Overall status | `IN_PROGRESS` | `NOT_STARTED / IN_PROGRESS / BLOCKED / RELEASE_READY / RELEASED` |
| Active Phase | P1 — Docker-First Foundation | Đổi khi phase gate pass |
| Active Task | `T05` — Cursor item / share models (TODO) | Một task primary tại một thời điểm |
| Backend Owner | Codex | Owner changes require explicit agreement |
| Frontend Owner | Antigravity | Start after API shape confirmed |
| Target stack | Python 3.12, FastAPI, MySQL 8.0, React 18, Vite, TS strict | Change via CR |
| P0 scope | 7 endpoints, 8 product roles, 15 Windows slots | Do not silently expand |
| Latest passing build | `ccs-backend:t04-dev`, Docker Desktop Linux/amd64 | Command + evidence |
| Latest passing tests | T04, 2026-11-17. MySQL DDL compile, metadata, relationship, Ruff và mypy. | Count + command + date |
| Latest release decision | `NO-GO — not implemented` | Gate-based, not intuition |
| Known blockers | License review, future Windows VM validation | Assign before launch |
| Next handoff | Give Codex T05 | Copy prompt at bottom |

## 2. Phase Status Board

| Phase | Tasks | Owner | Status | Done / Total | Exit criteria | Proof |
|---|---|---|---|---:|---|---|
| P1 — Foundation | T01–T07 | Codex | IN_PROGRESS | 4/7 | Healthy Docker, 5 cat, ≥2 seeded full packs | T01–T04 PASS. Phase gate pending. |
| P2 — APIs / Security | T08–T15 | Codex | TODO | 0/8 | 7 endpoints validated, 15-slot ZIP & CUR tests | Pending |
| P3 — UI / Studio | T16–T22 | Antigravity | TODO | 0/7 | Gallery, Sandbox, Studio, Mix & Share E2E | Pending |
| P4 — Production | T23–T25 | Both; owner per task | TODO | 0/3 | HTTPS, backup restore, CI, Windows QA, license | Pending |
| **TOTAL** | **T01–T25** | — | **IN_PROGRESS** | **4/25** | **Release gates all PASS** | **T01–T04 PASS** |

**Allowed status:** `TODO`, `IN_PROGRESS`, `BLOCKED`, `IN_REVIEW`, `DONE`, `SKIPPED_WITH_APPROVAL`. No `DONE` unless AC and evidence complete. `SKIPPED_WITH_APPROVAL` must record Product Owner, why, risk and follow-up.

## 3. Full Task Checklist (canonical IDs)

| ID | Task | Agent | Status | Evidence / Commit |
|---|---|---|---|---|
| T01 | Backend package & Docker image | Codex | DONE | Hai stage build và khởi động, `pip check` sạch, production UID 10001. |
| T02 | Dev Compose & example env | Codex | DONE | Hai service chạy, MySQL healthy, hot reload và dữ liệu qua restart đã kiểm chứng. |
| T03 | Config & AsyncSession | Codex | DONE | Hai image rebuild, MySQL SELECT 1 và vòng đời session PASS. Production startup lỗi đúng khi thiếu cấu hình. |
| T04 | Category / pack models | Codex | DONE | Metadata và DDL MySQL đối chiếu với DDL chuẩn, Ruff và mypy PASS. |
| T05 | Cursor item / share models | Codex | TODO | — |
| T06 | CUR binary encoder & tests | Codex | TODO | — |
| T07 | Auto-seed, lifespan, health | Codex | TODO | — |
| T08 | Alembic migration | Codex | TODO | — |
| T09 | Gallery schemas/categories/packs APIs | Codex | TODO | — |
| T10 | Trusted asset storage adapter | Codex | TODO | — |
| T11 | Studio convert API | Codex | TODO | — |
| T12 | 15-slot Install.inf builder | Codex | TODO | — |
| T13 | RAM ZIP packager / download API | Codex | TODO | — |
| T14 | Share service / endpoints | Codex | TODO | — |
| T15 | API integration suite | Codex | TODO | — |
| T16 | Vite React strict scaffold | Antigravity | TODO | — |
| T17 | API client & DTO | Antigravity | TODO | — |
| T18 | Gallery / PackCard | Antigravity | TODO | — |
| T19 | Sandbox / Pack Detail | Antigravity | TODO | — |
| T20 | Hotspot picker / lazy AI | Antigravity | TODO | — |
| T21 | Studio Canvas / Export | Antigravity | TODO | — |
| T22 | MixDock / Mix page / share | Antigravity | TODO | — |
| T23 | Prod Compose / Caddy | Codex | TODO | — |
| T24 | Backup / restore | Codex | TODO | — |
| T25 | CI / Browser E2E / release | Antigravity + Codex review | TODO | — |

### 3.1 Active Task Card — copy and update each session

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

**Append rule:** không sửa lịch sử kết quả cũ thành PASS; nếu retry, thêm dòng mới với cause/fix. Link logs phải được sanitize secrets.

## 4. Current Sprint Checklist

**Sprint 1 / Foundation — in progress**

- [x] T01 — tạo backend package + development/prod Docker stages.
- [x] T02 — docker compose gồm chính xác db/backend.
- [x] T03 — typed settings + async DB session.
- [x] T04 — Category, cursor pack models.
- [ ] T05 — Cursor item, custom creation models.
- [ ] T06 — binary CUR encoder + tests.
- [ ] T07 — lifespan auto-seed + 5 categories/2 packs/8 roles + health check.
- [ ] Phase gate P1: fresh clone test / idempotency / check logs.

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

**Trạng thái:** T01–T04 PASS trên Docker Desktop Linux/amd64. T05 đang chờ giao việc.

### 9.1 Next Session Prompt — Codex (ready to copy)

```text
Bạn đang là Codex, Backend Agent của dự án Custom Cursor Studio & Library.

Trước khi code, đọc đủ 6 tài liệu tại root:
PRD.md, ARCHITECTURE.md, DESIGN.md, RULES.md, TASKS.md, PROGRESS.md.

T04 đã PASS. Khi được giao T05, đọc phạm vi và tiêu chí nghiệm thu
trong TASKS.md. Dùng DeclarativeBase hiện có trong backend/app/db/session.py.
```

### 9.2 Next Session Prompt — Antigravity (use only after backend readiness)

```text
Bạn đang là Antigravity, Frontend Agent của Custom Cursor Studio & Library.
Đọc 6 tài liệu chuẩn, đặc biệt API contract ở ARCHITECTURE.md và
STRICT RULES trong RULES.md.

Chỉ bắt đầu task T16 khi backend shape của T09 hoặc T15 đã ổn định,
hoặc Product Owner cho phép scaffold frontend trước. Không tự giả mạo API.
Primary files của T16: frontend/package.json, frontend/src/App.tsx.
Vite + React 18 + TypeScript strict + Tailwind + Lucide; site theme shell.
Chạy npm ci/typecheck/build, ghi evidence vào PROGRESS.md.
Sau T16 handoff T17, không nhảy sang Studio khi API client chưa sẵn sàng.
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
