# PROGRESS.md — Project State Tracker, Decisions & Debugging Log

> **Project:** Custom Cursor Studio & Library | **Tracking schema:** v1.0  
> **Last updated:** 2026-11-17  | **Status:** NOT STARTED / documentation baseline prepared  
> **Current phase:** P1 — Foundation | **Current task:** T01  
> **Important:** Trạng thái bên dưới là template ban đầu; **không** có task kỹ thuật nào được đánh dấu PASS trước khi Agent thực sự chạy code/test.

## 1. Executive Snapshot

| Field | Current value | Update rule |
|---|---|---|
| Overall status | `NOT_STARTED` | `NOT_STARTED / IN_PROGRESS / BLOCKED / RELEASE_READY / RELEASED` |
| Active Phase | P1 — Docker-First Foundation | Đổi khi phase gate pass |
| Active Task | `T01` — Backend package and container image | Một task primary tại một thời điểm |
| Backend Owner | Codex | Owner changes require explicit agreement |
| Frontend Owner | Antigravity | Start after API shape confirmed |
| Target stack | Python 3.12, FastAPI, MySQL 8.0, React 18, Vite, TS strict | Change via CR |
| P0 scope | 7 endpoints, 8 product roles, 15 Windows slots | Do not silently expand |
| Latest passing build | `N/A — not run` | Command + evidence |
| Latest passing tests | `N/A — not run` | Count + command + date |
| Latest release decision | `NO-GO — not implemented` | Gate-based, not intuition |
| Known blockers | License review, future Windows VM validation | Assign before launch |
| Next handoff | Give Codex T01 | Copy prompt at bottom |

## 2. Phase Status Board

| Phase | Tasks | Owner | Status | Done / Total | Exit criteria | Proof |
|---|---|---|---|---:|---|---|
| P1 — Foundation | T01–T07 | Codex | TODO | 0/7 | Healthy Docker, 5 cat, ≥2 seeded full packs | Pending |
| P2 — APIs / Security | T08–T15 | Codex | TODO | 0/8 | 7 endpoints validated, 15-slot ZIP & CUR tests | Pending |
| P3 — UI / Studio | T16–T22 | Antigravity | TODO | 0/7 | Gallery, Sandbox, Studio, Mix & Share E2E | Pending |
| P4 — Production | T23–T25 | Both; owner per task | TODO | 0/3 | HTTPS, backup restore, CI, Windows QA, license | Pending |
| **TOTAL** | **T01–T25** | — | **TODO** | **0/25** | **Release gates all PASS** | **Pending** |

**Allowed status:** `TODO`, `IN_PROGRESS`, `BLOCKED`, `IN_REVIEW`, `DONE`, `SKIPPED_WITH_APPROVAL`. No `DONE` unless AC and evidence complete. `SKIPPED_WITH_APPROVAL` must record Product Owner, why, risk and follow-up.

## 3. Full Task Checklist (canonical IDs)

| ID | Task | Agent | Status | Evidence / Commit |
|---|---|---|---|---|
| T01 | Backend package & Docker image | Codex | TODO | — |
| T02 | Dev Compose & example env | Codex | TODO | — |
| T03 | Config & AsyncSession | Codex | TODO | — |
| T04 | Category / pack models | Codex | TODO | — |
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
task_id: T01
task_name: Backend package and container image
agent: Codex
status: TODO
started_at: null
completed_at: null
git_branch: task/T01-backend-image
git_commit: null
primary_files:
  - backend/pyproject.toml
  - backend/Dockerfile
dependencies: []
acceptance:
  - [ ] Docker development target builds
  - [ ] Python 3.12 + dependency checks pass
  - [ ] Production stage non-root, no reload
  - [ ] No secrets committed
commands_run: []
result_summary: Not started
open_blocker: null
next_task: T02
```

### 3.2 Task Session Log (append-only entries)

| Timestamp (UTC+7) | Agent | Task | Summary | Files | Tests PASS/FAIL | Commit | Next |
|---|---|---|---|---|---|---|---|
| 2026-11-17 | Architect | Docs baseline | 6 planning documents drafted; no code/task execution claimed | `*.md` | N/A | — | T01 |

**Append rule:** không sửa lịch sử kết quả cũ thành PASS; nếu retry, thêm dòng mới với cause/fix. Link logs phải được sanitize secrets.

## 4. Current Sprint Checklist

**Sprint 1 / Foundation — planned, not started:**

- [ ] T01 — tạo backend package + development/prod Docker stages.
- [ ] T02 — docker compose gồm chính xác db/backend.
- [ ] T03 — typed settings + async DB session.
- [ ] T04 — Category, cursor pack models.
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

**Current precise state (initial):** docs baseline available, implementation not started; next task **T01 for Codex**. Do not ask Antigravity to implement API mocks before backend contracts stabilize unless owner authorizes parallel layout-only scaffold.

### 9.1 Next Session Prompt — Codex (ready to copy)

```text
Bạn đang là Codex, Backend Agent của dự án Custom Cursor Studio & Library.

Trước khi code, đọc đủ 6 tài liệu tại root:
PRD.md, ARCHITECTURE.md, DESIGN.md, RULES.md, TASKS.md, PROGRESS.md.

Trạng thái hiện tại: toàn bộ code chưa triển khai; active task T01.
Hãy thực thi CHỈ TASK T01 — Backend package and container image.
Primary files được sửa: backend/pyproject.toml và backend/Dockerfile.
Được phép tạo scaffold/package stubs và lockfiles tự sinh, liệt kê rõ.
Cài Python 3.12 + FastAPI async stack, Docker stages development/production.

Bắt buộc:
- Theo STRICT RULES của Codex, không sửa frontend hay API contract.
- Chạy `docker build --target development -t ccs-backend:dev ./backend`
  và các kiểm tra package thích hợp.
- Không tuyên bố PASS nếu build chưa chạy.
- Cập nhật PROGRESS.md: T01 status, files, commands/results, blockers,
  next task T02.
- Trả kết quả theo template ở cuối RULES.md.
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
