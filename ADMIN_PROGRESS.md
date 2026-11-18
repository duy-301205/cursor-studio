# ADMIN_PROGRESS.md — Tiến độ Admin Cursor Pack Manager

## A02 — Admin ORM + Alembic Migration

**2026-11-18 · Codex · PASS**

- A01 đã được chủ dự án phê duyệt. Các giá trị được duyệt cho task sau gồm idle 30 phút, absolute lifetime 12 giờ, login 5 lần thất bại/15 phút theo IP và tài khoản, audit retention tối thiểu 90 ngày và có thể cấu hình. Argon2id cần benchmark và ghi thông số. A02 chỉ tạo schema nền tảng.
- Files: backend/app/models/admin_user.py, backend/alembic/versions/0002_admin.py, backend/alembic/env.py (thêm import đăng ký metadata), ADMIN_TASKS.md (tick A02), ADMIN_PROGRESS.md.
- Revision duy nhất `0002_admin` nối từ `0001_initial`. Bảy bảng gồm `admin_users`, `admin_sessions`, `admin_pack_state`, `admin_assets`, `admin_pack_roles`, `admin_audit_events` và `admin_rate_limits`. Các bảng rỗng sau upgrade. Session và CSRF chỉ có cột digest BINARY(32).
- Index được đặt tên rõ ràng cho hạn session, asset theo pack, audit và expiry của counter. Schema có unique username, session digest, storage key và cặp pack/asset. FK composite khóa asset cùng pack cho thumbnail và hai binding role. PK pack/role và CHECK 0–47 bảo vệ role/hotspot.

### Bằng chứng kiểm thử

| Kiểm tra | Kết quả |
|---|---|
| `ruff check app alembic tests` và `ruff format --check app alembic tests` | PASS trên bản sao Linux chuẩn hóa file modes. Bind mount Windows ban đầu báo EXE002 cho cả file cũ lẫn mới do mode executable. |
| `mypy app alembic` | PASS, 22 file nguồn. |
| `alembic heads`, `alembic upgrade head`, `alembic current` | PASS, MySQL 8.0.46, UTC +00:00, một head duy nhất. |
| `SHOW CREATE TABLE`, SQLAlchemy inspector, ORM insert | PASS cho cả 7 bảng. So kiểu/default/nullability, PK, indexes, unique, FK và CHECK với metadata. Thử duplicate, asset chéo pack, hotspot 48, FK RESTRICT, CASCADE và SET NULL. |
| `alembic downgrade 0001_initial` khi có managed pack | Guard PASS. Revision, schema và managed row vẫn còn sau khi từ chối. |
| `alembic downgrade 0001_initial` rồi `alembic upgrade head` | PASS sau khi bỏ managed fixture. So snapshot toàn bộ rows và SHOW CREATE TABLE của categories, cursor_packs, cursor_items, custom_creations qua từng checkpoint. |
| `CCS_RUN_MYSQL_INTEGRATION=1 python -m pytest -p no:cacheprovider tests -q` | 70 PASS, gồm T15 qua app.main trên database hồi quy riêng đã upgrade. |

Cả migration lifecycle và hồi quy chạy trong Docker test cô lập, với hai database riêng. Không áp migration lên database dev đang sử dụng hoặc production.

### Lưu ý vận hành

- Downgrade yêu cầu kết nối DB để kiểm tra managed pack và phải dừng tác vụ ghi Admin. Phải sao lưu dữ liệu Admin cần giữ trước khi bỏ các bảng, kể cả khi pack registry rỗng.
- Dev database đã được bootstrap bằng create_all nhưng chưa có Alembic revision cần đối chiếu baseline riêng trước khi triển khai migration. A02 kiểm tra đường nâng cấp từ revision 0001_initial với dữ liệu legacy.
- MySQL tự commit DDL. Khi triển khai thực tế cần backup và kiểm tra từng bước nếu migration bị gián đoạn. Kiểm tra ID an toàn cho JavaScript thuộc biên API khi các task tiếp theo triển khai DTO.

**Task kế tiếp — A03, Session Authentication. Điểm dừng hiện tại là A02.**

## A03 — Session Authentication

**2026-11-18 · Codex · PASS**

- Thêm backend/app/core/admin_auth.py cho Argon2id và session MySQL. Thêm backend/app/api/v1/admin_auth.py cho POST /auth/login, GET /auth/me và POST /auth/logout dưới /api/v1/admin. Mount một lần tại backend/app/main.py. Giữ public OpenAPI đúng 7 operation.
- Dùng Argon2id PHC từ cryptography đã khóa trong dự án, m=65536 KiB, t=3, p=1, salt 16 byte, output 32 byte. Thread limiter cho tối đa 2 phép băm đồng thời mỗi process. Benchmark Docker Python 3.12, 7 lần tuần tự, median 385 ms và 314–437 ms trong lần đo ít tải. Khi chạy song song với hồi quy, median 775 ms và 273–901 ms. Cần đo lại trên hạ tầng production khi duyệt release.
- Phiên opaque 256 bit, DB chỉ giữ digest session/CSRF. Hết hạn tuyệt đối 12 giờ, idle 30 phút. Cấp token mới khi login, thu hồi phiên cũ khi rotate/logout và kiểm tra tài khoản active ở server.
- Cookie HTTPS host-only, HttpOnly, Secure, SameSite=Lax, Path=/api/v1/admin. CSRF HMAC per-session, mutation kiểm Origin/Referer. Login chỉ nhận JSON tối đa 4 KiB và dùng lỗi chung cho sai mật khẩu, unknown hoặc disabled.
- Cổng A03 chỉ bật trong tiến trình development với ADMIN_AUTH_ENABLED=true, ADMIN_ORIGIN là origin HTTPS cụ thể và ADMIN_CSRF_KEY là 32 byte ngẫu nhiên dạng 64 ký tự hex lowercase. HTTP dev chỉ hỗ trợ origin loopback khi ADMIN_ALLOW_LOOPBACK_HTTP=true. Các biến truyền vào môi trường tiến trình backend. A03 khóa route ở production. Bootstrap, audit và rate limit login đã duyệt thuộc A04.

### Kiểm thử

| Kiểm tra | Kết quả |
|---|---|
| Ruff, Ruff Format, mypy | PASS trên bản sao Linux. mypy kiểm 24 file nguồn. |
| `alembic upgrade head` | PASS trên MySQL 8 test riêng. |
| HTTP qua Uvicorn app.main | PASS cho login/me/logout, credential errors, Origin/Referer và host, JSON cap, cookie flags qua trusted proxy test, rotation, thiếu/sai CSRF, revoke, idle/absolute expiry, disabled user, digest DB và log redaction. |
| `CCS_RUN_MYSQL_INTEGRATION=1 python -m pytest -p no:cacheprovider tests -q` | 70 PASS. Lần đầu có asset Peach Bloom sao chép từ dev, lần sau gặp rate limit tích lũy trong process. Tách asset khỏi bản sao cô lập và restart Uvicorn test để chạy suite sạch. |

**Task kế tiếp — A04, Authorization & Secure Bootstrap.** Frontend bắt đầu ở A10, do Antigravity phụ trách.

## A04 — Authorization & Secure Bootstrap

**2026-11-18 · Codex · PASS**

- Thêm require_admin và CSRF guard dùng chung trong backend/app/api/deps/admin.py. Router dùng dependency cho /auth/me và kiểm tra CSRF cùng transaction thu hồi tại /auth/logout. Bổ sung auth audit và rate-limit wiring tại backend/app/api/v1/admin_auth.py và backend/app/core/admin_auth.py. Không tạo public signup.
- CLI nội bộ: python -m app.cli.create_admin create USER, reset USER, disable USER và cleanup. CREATE/RESET dùng prompt không echo hoặc --password-stdin. Reset/disable thu hồi mọi phiên đang hoạt động theo transaction. Audit ghi target account, request ID và outcome, giữ actor null cho thao tác vận hành CLI.
- MySQL chia sẻ ngưỡng 5 lần thất bại theo từng IP và tài khoản, cửa sổ UTC cố định 15 phút. Dự trữ lượt trước Argon2id và hoàn lại lượt thành công cùng transaction tạo session/audit. Trả 429 kèm Retry-After đến khi cửa sổ kết thúc. Khóa counter là HMAC, không lưu IP hoặc username thô trong limiter/audit.
- Cleanup chạy theo lệnh vận hành, mỗi nhóm xóa tối đa 500 dòng/lượt. Xóa counter hết hạn và session hết hạn hoặc revoked từ 7 ngày trước. Tham số --audit-retention-days mặc định 90, từ chối giá trị dưới 90. Auth Admin vẫn giới hạn ở môi trường dev đã bật tường minh.

### Kiểm thử

| Kiểm tra | Kết quả |
|---|---|
| Ruff, Ruff Format và mypy | PASS trên bản sao Linux, 31 file format và 26 file typecheck. |
| MySQL 8 và hai tiến trình Uvicorn app.main | PASS. 401 cho thiếu session, 403 thiếu CSRF, signup 404. Giới hạn IP và account cùng có hiệu lực giữa hai tiến trình. 8 yêu cầu đồng thời cho một account cho kết quả 5 lỗi credentials và 3 phản hồi 429 kèm Retry-After. |
| CLI và audit | PASS. Tạo tài khoản bằng stdin, chuẩn hóa username, từ chối duplicate/mật khẩu ngắn, reset và disable thu hồi session trên cả hai tiến trình. Audit success/failure, cleanup retention 120 ngày và log redaction PASS. |
| T15 và hồi quy backend | 70 PASS, đủ 7 Public API qua MySQL test. |

**Task kế tiếp — A05, Admin Pack CRUD.** Frontend bắt đầu ở A10, do Antigravity phụ trách.

## A05 — Admin Pack CRUD

**2026-11-18 · Codex · PASS**

- Thêm backend/app/api/v1/admin_packs.py và backend/app/schemas/admin_pack.py, mount router duy nhất tại backend/app/main.py. Bốn thao tác Admin gồm list có status/search/pagination, create draft, detail và PATCH metadata.
- Dùng auth/CSRF A04, giới hạn mutation 60 lượt/phút/Admin trong MySQL và audit create/edit. Lưu placeholder do deploy cấp qua ADMIN_DRAFT_THUMBNAIL_URL (HTTPS). Admin trả null khi chưa gán thumbnail. Upload và đọc ảnh thuộc A06, gán thumbnail/role thuộc A07.
- Giữ legacy ở chế độ chỉ đọc, khóa pack published và giữ slug sau lần publish đầu. PATCH khóa hàng pack và state theo thứ tự, kiểm If-Match trước khi ghi. PATCH no-op giữ revision, thay đổi hợp lệ tăng revision. Từ chối và rollback nếu ID do DB cấp vượt giới hạn JavaScript.

| Kiểm tra | Kết quả |
|---|---|
| Ruff, Ruff Format, mypy | PASS trên bản sao Linux (33 file format, 28 file typecheck). |
| MySQL 8 và HTTP qua app.main | PASS. Auth/CSRF, metadata strict, category, 16 KiB, list/filter/pagination, draft 201, slug conflict, ETag 428/422/409, no-op và cạnh tranh hai PATCH cùng ETag. |
| Trạng thái pack và DTO | PASS. Legacy/published bị khóa, giữ slug sau publish, registry chiếu URL Admin và ẩn storage key. Draft 404 ở public detail/download và không vào Gallery. |
| Audit, guard ID và throttle | PASS. Audit create/edit và lỗi, rollback ID vượt 2^53−1, 429 và Retry-After khi hết lượt. |
| T15 và hồi quy backend | 70 PASS, đúng 7 operation trong public OpenAPI. |

Các thao tác migration/fixture chỉ chạy trên database test cô lập. **Task kế tiếp — A06, Admin Asset Upload & Registry.**

## A06 — Admin Asset Upload & Registry

**2026-11-18 · Codex · PASS**

- Thêm backend/app/api/v1/admin_assets.py và backend/app/services/admin_assets.py. Supporting changes gồm mount router tại backend/app/main.py và tách factory SDK dùng chung tại backend/app/services/storage.py.
- Multipart file + kind giới hạn 2 MiB/file và 32 KiB overhead. Preview chuẩn hóa RGBA PNG 32/48, thumbnail WebP tối đa 512×512, CUR tĩnh được kiểm DIB/XOR/AND và hotspot. Kiểm tra magic, payload, pixel cap, animation và chuyển đổi đồng bộ trong worker có giới hạn.
- Upload xác thực/CSRF, kiểm If-Match lại dưới khóa pack/state, giới hạn 128 asset/pack và 20 upload/phút/Admin. Upload thành công giữ nguyên revision. Registry lưu key UUID, hash SHA-256 và geometry. GET content chỉ trả ảnh có xác thực, đúng pack, MIME cố định và no-store, kiểm lại hash.
- Private Local cần ADMIN_ASSET_LOCAL_ROOT là đường dẫn tuyệt đối nằm ngoài vùng public static. R2 dùng ADMIN_ASSET_R2_BUCKET riêng với cấu hình SDK sẵn có và conditional PUT. Adapter đọc managed URL theo key đã có để A08 dùng. Nếu lưu/commit gặp lỗi, tra registry rồi mới xóa object chưa đăng ký. Nếu không xác minh được hoặc lỗi cleanup, ghi request ID và key nội bộ để đối soát.

| Kiểm tra | Kết quả |
|---|---|
| Ruff, Ruff Format, mypy | PASS trên bản sao Linux, 35 file format và 30 file typecheck. |
| HTTP và MySQL 8 qua app.main | PASS. PNG/WebP/CUR hợp lệ, 401/403 trước upload, 428/409, 413/415/422, quota 128, 429, không tăng revision và kiểm digest. |
| Local và quyền riêng tư | PASS. Cấm overwrite, traversal, symlink, pack ID sai, hỏng digest, đọc CUR qua route ảnh và truy cập trực tiếp qua public static. |
| R2 stub và fault injection | PASS cho điều kiện create-only, bounded read/close, rollback registry và xóa orphan khi DB commit lỗi hoặc SDK báo lỗi sau ghi. R2 staging thật kiểm ở A15. |
| T15 và hồi quy backend | 70 PASS trên database test riêng đã migration. |

Sửa ca DecompressionBombWarning vì Studio cấu hình Pillow nâng cảnh báo pixel thành exception. Đã xác minh API từ chối ảnh vượt giới hạn bằng 415. Public media gateway và đối soát định kỳ thuộc A08. **Task kế tiếp — A07, Eight-Role Assignment.** Frontend bắt đầu ở A10.

## A07 — Eight-Role Assignment

**2026-11-18 · Codex · PASS**

- Thêm backend/app/services/pack_validator.py, mở rộng backend/app/api/v1/admin_packs.py và DTO nhỏ tại backend/app/schemas/admin_pack.py.
- PUT /api/v1/admin/packs/{id}/roles/{role} ghi tối đa một binding cho mỗi role canonical. Cho phép draft thiếu role, ghi đè binding bằng asset hợp lệ và trả ETag mới khi thay đổi. PATCH hỗ trợ gán hoặc bỏ thumbnail bằng ID thuộc pack. Khóa cùng thứ tự pack/state, kiểm If-Match trong transaction, audit thay đổi và giữ revision với no-op.
- Xác minh key, loại asset, SHA-256, geometry 32/48, bounds và hotspot khớp header CUR. So raster RGBA đã giải mã, bao gồm alpha và bỏ qua RGB ở pixel hoàn toàn trong suốt. Pack published và legacy vẫn chỉ đọc qua các thao tác này.

| Kiểm tra | Kết quả |
|---|---|
| Ruff, Ruff Format, mypy | PASS trên bản sao Linux, 36 file format và 31 file typecheck. |
| MySQL 8 và HTTP qua app.main | PASS. Auth/CSRF, role lạ, asset khác pack/sai kind, mismatch kích thước/pixel, hotspot kiểu sai/ngoài bounds/lệch header, hash hỏng và storage thiếu. |
| Binding và concurrency | PASS. Gán đủ 8 role, thay 32px bằng 48px, PATCH gán/bỏ thumbnail, no-op, khóa published, stale ETag, audit. Hai editor cùng ETag cho đúng một 200 và một 409. |
| T15 và hồi quy backend | 70 PASS trên database test cô lập đã migration. |

**Task kế tiếp — A08, Publish / Unpublish Service.** Frontend bắt đầu ở A10.

## A08 — Publish / Unpublish Service

**2026-11-18 · Codex · PASS**

- Primary: backend/app/services/pack_publisher.py và backend/app/api/v1/admin_packs.py. Supporting: backend/app/api/deps/admin.py (error details), backend/app/api/v1/catalog.py (adapter download), backend/app/main.py (managed media GET/HEAD), backend/app/services/admin_assets.py và storage.py (inventory, missing-file classification), backend/app/services/pack_validator.py (bytes CUR đã xác minh), backend/app/cli/cleanup_pack_assets.py.
- Validate snapshot có report theo revision. Publish kiểm lại thumbnail, đủ 8 role, asset integrity và ZIP/INF 15 slot ngoài transaction giữ khóa. Sau đó khóa pack/state, đối chiếu snapshot, cập nhật projection/status/revision/audit trong một transaction. Unpublish giữ bindings, projection IDs và object. Re-publish giữ ID, slug và download_count. Rate limit validate/publish 5 lượt/phút/pack.
- Managed media chỉ phục vụ asset khớp binding và projection của pack published, kiểm hash và trả no-store cho browser/CDN. Local dùng /static/samples/managed/... trước mount static. Khi triển khai R2, proxy phải rewrite path managed dưới PUBLIC_CDN_BASE_URL đến /internal/managed/<pack-id>/<file>, bật bypass cache cho namespace managed và giữ bucket private.
- Cleanup theo pack: python -m app.cli.cleanup_pack_assets PACK_ID. Kiểm trong DB dưới khóa, giữ binding/projection và object mới, đối soát Local/R2 theo inventory với grace 24 giờ. Scheduler và xác nhận R2/CDN thật thuộc triển khai sau.

| Kiểm tra | Kết quả |
|---|---|
| Ruff, Ruff Format, mypy | PASS trên bản sao Linux, 38 file format và 33 file typecheck. |
| Validate và rollback | PASS. Thiếu thumbnail/role, file thiếu/hỏng, 503 storage timeout mô phỏng, throttle/Retry-After và rollback projection trên MySQL 8. |
| HTTP lifecycle qua app.main | PASS. Race publish/publish, unpublish/unpublish và publish/edit. Public Gallery, share 200/410, ZIP hợp lệ với 15 slot, GET/HEAD 200 khi published và 404 khi draft, giữ ID/counter khi republish. |
| CDN/R2 và cleanup | PASS cho edge/cache và R2 inventory mô phỏng, CLI Local xóa orphan quá 24 giờ và giữ asset đang tham chiếu/còn mới. CDN/R2 staging thật NOT RUN, thuộc A15. |
| Backend regression T15 | 70 PASS trên database test cô lập, 7 Public API giữ hợp đồng. |

**Task kế tiếp — A09, Admin Backend Security & Regression.** Frontend bắt đầu ở A10.

## A09 — Admin Backend Security & Regression

**2026-11-18 · Codex · PASS**

- Thêm 9 bài kiểm thử trong backend/tests/test_admin_security.py và backend/tests/test_admin_packs.py. Mở rộng backend/tests/conftest.py để dùng HTTP client hiện có cho hai worker, tạo tài khoản test bằng CLI và dọn fixture theo từng test. Chỉ thay đổi test code ở A09.
- Bộ security kiểm cookie/Origin/CSRF, session expiry/rotation/revoke, thiếu quyền trên mọi mutation, giới hạn đăng nhập 5 lần theo IP và tài khoản dùng chung hai worker, audit và log redaction.
- Bộ pack kiểm payload sai/quá lớn, ownership, integrity, stale ETag, cạnh tranh publish/unpublish, rollback khi lỗi storage/DB, cleanup, Share 410, ZIP/INF 15 slot và media no-store.

| Kiểm tra | Kết quả |
|---|---|
| `ruff check app alembic tests`, `ruff format --check app alembic tests`, `mypy app alembic` | PASS trên bản sao Linux, 40 file format và 33 file typecheck. |
| `alembic upgrade head` | PASS trong MySQL 8 test cô lập. |
| `python -m pytest -p no:cacheprovider tests -q -rs` với cả hai opt-in | 79 PASS, 0 skip, khoảng 104 giây. Bao gồm 9 bài mới và toàn bộ T15 cho 7 Public API. |
| Pytest với cả hai opt-in tắt | 62 PASS, 17 integration skip theo cấu hình mặc định. |

### Chạy lại suite đầy đủ

- Dùng database `ccs_test_*` cô lập, `DATABASE_HOST=db`, Local storage và public API base `http://localhost:8000`. Chạy Alembic trước. Dùng private root ghi được bên ngoài static.
- Chạy Uvicorn `app.main:app` trên loopback cổng 8000 và 8001 với `--forwarded-allow-ips 127.0.0.1`. Bật seed trên worker 8000, tắt seed trên worker 8001. Cả hai có chung DB, `ADMIN_AUTH_ENABLED=true`, `ADMIN_ORIGIN=https://localhost`, secret CSRF test và URL placeholder HTTPS.
- Trong container test chạy với `CCS_RUN_MYSQL_INTEGRATION=1`, `CCS_RUN_ADMIN_INTEGRATION=1`, cùng `ADMIN_ASSET_LOCAL_ROOT` với hai worker và `CCS_ADMIN_TEST_LOGS` chứa hai đường dẫn log phân tách bằng dấu phẩy.
- Production TLS/CDN/R2 thật và browser E2E thuộc A15. A09 dùng MySQL thật và mô phỏng HTTPS ở biên proxy loopback.

**Điểm bàn giao — A10, Typed Admin API Client, do Antigravity phụ trách.** A09 kết thúc chuỗi backend trước bàn giao frontend.
