# ADMIN_TASKS.md — Kế hoạch A01–A15

**2026-11-18 · A01 đã soạn và rà soát · Chờ phê duyệt trước A02**

Theo ADMIN_EXTENSION §9 và [ADMIN_SPEC.md](ADMIN_SPEC.md). Codex sở hữu backend. Antigravity sở hữu frontend. Mỗi lượt chỉ làm task đã được giao. Supporting files như test, router mount, deps/lock, config hoặc tooling cần kê rõ và xin duyệt khi vượt scope. Đề xuất cập nhật ADMIN_PROGRESS.md từ A02 sau khi duyệt. Các dòng T01–T25 tiếp tục dùng tracker hiện hành.

**Chuỗi:** T15 + T22 → A01 → A02 → A03 → A04 → A05 → A06 → A07 → A08 → A09. A01 đã duyệt + A09 → A10 → A11 → A12 → A13 → A14. A09 + A14 → A15 → xem xét tích hợp release với T23–T25. A06 dùng schema A02. A10 theo lịch mặc định chờ A09 để ghép client với backend thật.

**Quy ước kiểm thử:** Lệnh Python chạy từ backend với dependency đã cài. Integration dùng MySQL cô lập và app.main thật. Suite T15 chạy opt-in CCS_RUN_MYSQL_INTEGRATION=1 với cấu hình cô lập theo tests/conftest.py. Frontend chạy từ frontend. Dùng npm run typecheck, npm test và npm run build. Kiểm tra script lint hiện có trước khi gọi. Lệnh tới file kiểm thử Admin chỉ áp dụng sau khi file được tạo trong supporting scope đã duyệt. PASS yêu cầu đủ tiêu chí, báo cáo bằng chứng và review scope. FAIL khi một tiêu chí không đạt hoặc chưa kiểm chứng.

## Stage A — Nền tảng bảo mật

### [x] A01 — Admin Architecture & API Contract

- **Agent / phụ thuộc** — Codex. T15 và T22 được đối chiếu với tracker, route, tests và components trong repo.
- **File chính** — ADMIN_SPEC.md, ADMIN_TASKS.md.
- **Yêu cầu** — Đặc tả auth/session, migration, quản lý asset, draft/publish, endpoint, DTO, compatibility và security gate.
- **Nghiệm thu / kiểm thử** — Rà ADMIN_EXTENSION §4–§12, kiểm tra repo thật, đối chiếu API/schema/path, parse JSON mẫu, kiểm đồ thị và diff chỉ gồm hai tài liệu mới.
- **PASS/FAIL** — PASS tài liệu khi hai file đủ, consistency checks đạt, không có thay đổi triển khai. Chấp thuận kiến trúc là cổng riêng trước A02. Runtime không thuộc A01.

### [x] A02 — Admin ORM + Alembic Migration

- **Agent / phụ thuộc** — Codex. A01 và phê duyệt của chủ dự án.
- **File chính** — backend/app/models/admin_user.py, backend/alembic/versions/0002_admin.py (Xác nhận head trước khi đặt revision). Alembic env/model registration và migration tests là supporting files nếu cần.
- **Yêu cầu** — Thêm schema §3 theo revision tiếp theo của 0001_initial, FK composite, indexes, UTC, guard downgrade. Không bootstrap trong migration.
- **Nghiệm thu / kiểm thử** — Trên MySQL test có dữ liệu legacy, chạy alembic upgrade head, downgrade 0001_initial và upgrade head. So schema ORM/SHOW CREATE TABLE, test FK chéo pack, unique, rollback với dữ liệu Admin và so snapshot bốn bảng legacy.
- **PASS/FAIL** — PASS nếu chu trình, guard và bảo toàn legacy đạt. FAIL nếu migration làm mất dữ liệu, tạo admin mặc định hoặc có FK/index lệch.

### [x] A03 — Session Authentication

- **Agent / phụ thuộc** — Codex. A02.
- **File chính** — backend/app/core/admin_auth.py, backend/app/api/v1/admin_auth.py. Mount tại backend/app/main.py, settings, deps/lock Argon2id và test cần duyệt supporting scope.
- **Yêu cầu** — Login/logout/me, Argon2id, opaque session, issuance/revoke/expiry, cookie và CSRF/Origin theo spec. Chưa mở auth Admin ra Internet tại checkpoint này.
- **Nghiệm thu / kiểm thử** — HTTP qua app chính cho login/me/logout, wrong/unknown/disabled generic error, secure flags, session fixation, absolute/idle expiry, CSRF bị thiếu/sai và Origin bị chặn. Kiểm tra DB chỉ chứa hash.
- **PASS/FAIL** — PASS nếu toàn bộ ca auth đúng hợp đồng và T15 route/schema giữ tương thích. FAIL nếu phiên cũ còn dùng được sau revoke hoặc có secret lộ.

### [x] A04 — Authorization & Secure Bootstrap

- **Agent / phụ thuộc** — Codex. A03.
- **File chính** — backend/app/api/deps/admin.py, backend/app/cli/create_admin.py. Throttle/audit wiring và auth-router patch là supporting scope nếu cần.
- **Yêu cầu** — Dependency dùng chung và guard mutation, CLI create/reset/disable nội bộ, throttle IP/account dùng chung MySQL, audit và cleanup session/counter.
- **Nghiệm thu / kiểm thử** — Chạy CLI module trên DB cô lập qua prompt/stdin, thử duplicate, disable/reset rồi kiểm revoke. Test 401/403, 429/Retry-After giữa hai worker, audit và log đã lọc.
- **PASS/FAIL** — PASS nếu authz/throttle đúng trên app chính và không có public signup. FAIL nếu thiếu audit, dùng lại phiên revoked hoặc throttle chỉ có hiệu lực trong một worker.

## Stage B — Backend quản lý bộ

### [x] A05 — Admin Pack CRUD

- **Agent / phụ thuộc** — Codex. A04.
- **File chính** — backend/app/api/v1/admin_packs.py, backend/app/schemas/admin_pack.py. Router mount/test là supporting scope.
- **Yêu cầu** — List/create/detail/patch draft, category/slug/length, ETag, placeholder, metadata allowlist, legacy chỉ đọc, published khóa chỉnh sửa.
- **Nghiệm thu / kiểm thử** — HTTP test filter/search/pagination, create 201, duplicate 409, missing/stale If-Match, category sai, no auth, published/legacy blocked, draft 404 public. Kiểm tra baseline T15.
- **PASS/FAIL** — PASS nếu draft và concurrency đúng trên app chính. FAIL nếu draft xuất hiện công khai hoặc client ghi được status/URL tùy ý.

### [x] A06 — Admin Asset Upload & Registry

- **Agent / phụ thuộc** — Codex. A05, A02.
- **File chính** — backend/app/services/admin_assets.py, backend/app/api/v1/admin_assets.py. Storage/config/main và tests là supporting scope cần duyệt cụ thể.
- **Yêu cầu** — Multipart bounded, validator PNG/WebP/CUR, chuẩn hóa ảnh, immutable registry, authenticated content route, Local/R2 private write/read/cleanup, giao diện managed delivery cho A08.
- **Nghiệm thu / kiểm thử** — Test bytes thật, decode, CUR payload/hotspot, spoof/truncated/oversize, symlink/traversal, B05 limits, ownership, CSRF trước upload, orphan khi DB/SDK lỗi. Kiểm private direct URL và R2 stub/local; thử R2 staging ở A15.
- **PASS/FAIL** — PASS nếu file tốt đọc được bằng Admin và draft private. FAIL nếu parser bỏ qua payload, URL client được dùng làm key hoặc upload lỗi để lộ asset.

### [x] A07 — Eight-Role Assignment

- **Agent / phụ thuộc** — Codex. A06.
- **File chính** — backend/app/services/pack_validator.py, backend/app/api/v1/admin_packs.py.
- **Yêu cầu** — PUT role upsert, binding thumbnail, kiểm dimensions/hotspot/CUR preview, FK ownership, khóa theo pack và revision. Hỗ trợ partial draft.
- **Nghiệm thu / kiểm thử** — Gán/reassign 8 role theo enum. Thử unknown role, duplicate upsert, foreign asset, wrong kind, hotspot 32/48, mismatch bytes, stale revision và race hai editor.
- **PASS/FAIL** — PASS nếu mỗi role có tối đa một binding hợp lệ và published edit bị chặn. FAIL nếu có cross-pack binding hoặc ghi đè khi stale.

### [x] A08 — Publish / Unpublish Service

- **Agent / phụ thuộc** — Codex. A07.
- **File chính** — backend/app/services/pack_publisher.py, backend/app/api/v1/admin_packs.py. Public media wiring, proxy config staging và tests là supporting scope.
- **Yêu cầu** — Validate report, revalidate khi publish, projection/status/audit atomic, reuse ZIP/INF, managed media gate, retry/rollback và cleanup.
- **Nghiệm thu / kiểm thử** — Validate thiếu role, file corrupt/missing/storage timeout, stale/parallel publish/edit/unpublish, DB rollback, no download_count side effect. HTTP public Gallery/detail/download/share và direct asset GET/HEAD theo trạng thái. Inspect ZIP/15 ordered slots và thử CDN cache bypass.
- **PASS/FAIL** — PASS nếu chỉ pack đầy đủ hiện công khai và request media mới bị chặn sau unpublish. FAIL nếu commit một phần hoặc draft bytes lộ qua static/CDN.

### [x] A09 — Admin Backend Security & Regression

- **Agent / phụ thuộc** — Codex. A08.
- **File chính** — backend/tests/test_admin_security.py, backend/tests/test_admin_packs.py.
- **Yêu cầu** — Consolidate test backend theo §6, dùng app chính, DB thật, fault injection storage, test contract và origin/multi-worker.
- **Nghiệm thu / kiểm thử** — python -m ruff check app tests, python -m ruff format --check app tests, python -m mypy app, python -m pytest tests -q và T15 opt-in trong Docker MySQL test. Kiểm OpenAPI public, ZIP/INF, share 410 và payload/log redaction.
- **PASS/FAIL** — PASS nếu suite Admin và bảy operation T15 chạy đủ và xanh. FAIL nếu skipped integration, regression hoặc lỗ hổng session/upload/public visibility.

## Stage C — Admin Console

### [ ] A10 — Typed Admin API Client

- **Agent / phụ thuộc** — Antigravity. A01 đã phê duyệt, A09 theo lịch mặc định.
- **File chính** — frontend/src/types/admin.ts, frontend/src/lib/adminApi.ts.
- **Yêu cầu** — Model DTO/envelope, wrappers đủ endpoint, parse runtime, credentials, CSRF memory, AbortSignal, multipart, ETag/If-Match và lỗi 409/428/429.
- **Nghiệm thu / kiểm thử** — npm run typecheck, npm test, npm run build. HTTP client tests với 204, malformed response, 401, 409 và abort; kiểm typings không any.
- **PASS/FAIL** — PASS nếu wrappers khớp spec và không tự retry writes. FAIL nếu token vào localStorage, mất ETag hoặc giả lập success trong luồng thật.

### [ ] A11 — Login + Route Guard

- **Agent / phụ thuộc** — Antigravity. A10.
- **File chính** — frontend/src/features/admin/AdminLoginPage.tsx, frontend/src/components/admin/AdminRoute.tsx. frontend/src/App.tsx wiring cần duyệt supporting scope.
- **Yêu cầu** — /admin/login, protected routes, me sau reload, logout, 401/429 UI và keyboard accessibility. Admin không vào public navbar/sitemap.
- **Nghiệm thu / kiểm thử** — npm run typecheck, npm test, npm run build; browser live login/logout, reload cookie, expired session và direct route trên mobile.
- **PASS/FAIL** — PASS nếu guard không flash dữ liệu và login messages generic. FAIL nếu mất auth khi refresh hợp lệ hoặc protected data được render trước khi me thành công.

### [ ] A12 — Admin Pack List

- **Agent / phụ thuộc** — Antigravity. A11.
- **File chính** — frontend/src/features/admin/AdminPacksPage.tsx, frontend/src/components/admin/AdminPackTable.tsx.
- **Yêu cầu** — Real API search/filter/pagination, draft/published status, create và navigate, legacy chỉ đọc, loading/empty/error.
- **Nghiệm thu / kiểm thử** — npm run typecheck, npm test, npm run build; browser 375/768/1440, search/pagination, tạo draft và refresh vẫn thấy đúng dữ liệu.
- **PASS/FAIL** — PASS nếu list khớp server và hỗ trợ keyboard. FAIL nếu mock thay dữ liệu thật hoặc lệch filter/trạng thái.

### [ ] A13 — Pack Editor & 8-Role Assets

- **Agent / phụ thuộc** — Antigravity. A12.
- **File chính** — frontend/src/features/admin/AdminPackEditorPage.tsx, frontend/src/components/admin/RoleAssetEditor.tsx.
- **Yêu cầu** — /admin/packs/new và /admin/packs/:id/edit, metadata, thumbnail, 8 role, upload/assign, tái dùng HotspotGridPicker, lỗi theo field, conflict UX và khóa editor khi published.
- **Nghiệm thu / kiểm thử** — npm run typecheck, npm test, npm run build; browser live upload, 32/48 hotspot cạnh biên, stale conflict, refresh, CSRF/session expiry và double submit.
- **PASS/FAIL** — PASS nếu draft được lưu đúng và gán lại an toàn. FAIL nếu hotspot khác CUR, hỏng state khi retry hoặc published sửa được.

### [ ] A14 — Validation, Sandbox Preview & Publish UI

- **Agent / phụ thuộc** — Antigravity. A13.
- **File chính** — frontend/src/components/admin/PublishChecklist.tsx, frontend/src/components/admin/AdminPackPreview.tsx.
- **Yêu cầu** — Reuse InteractiveSandbox 8 vùng với theme độc lập, authenticated image, validate theo revision, publish/unpublish qua API thật và link Gallery. Confirm unpublish.
- **Nghiệm thu / kiểm thử** — npm run typecheck, npm test, npm run build; browser keyboard/light/dark và 8 fallback roles, missing asset, stale validation, publish/unpublish và timeout recovery.
- **PASS/FAIL** — PASS nếu UI dựa trên báo cáo server và hiển thị trạng thái sau commit. FAIL nếu CSS ảnh thoát namespace hoặc UI bỏ qua lỗi server.

## Stage D — Nghiệm thu

### [ ] A15 — End-to-End Admin Acceptance & Security Gate

- **Agent / phụ thuộc** — Antigravity phụ trách browser E2E, Codex phụ trách backend/release checks. A09, A14.
- **File chính** — frontend/e2e/admin-workflow.spec.ts, backend/tests/test_admin_e2e.py. Runner browser/CI và staging config cần scope duyệt.
- **Yêu cầu** — Bootstrap → login → draft → thumbnail + 8 role → preview/hotspot → validate → publish → Gallery/Detail/share → ZIP/INF → unpublish → 404 public/410 share. Test Local/R2 thật ở staging, negative auth/upload/concurrency, backup/restore và Windows 10/11 smoke.
- **Nghiệm thu / kiểm thử** — Chạy Admin E2E browser với app.main + MySQL và topology HTTPS mục tiêu; pytest tests -q với integration opt-in, npm run typecheck và npm run build; lưu kết quả 15 INF slot, archive integrity, screenshot 375/768/1440, log đã lọc và biên bản restore. Duyệt gate ADMIN_EXTENSION §12.
- **PASS/FAIL** — PASS khi test thực tế, hồi quy public và security sign-off đạt. FAIL nếu staging, restore, Windows smoke hoặc sign-off thiếu bằng chứng. ANI chỉ được bật nếu có gate riêng đã duyệt.

**Điểm dừng hiện tại — A01. A02 chỉ bắt đầu sau khi chủ dự án phê duyệt.**
