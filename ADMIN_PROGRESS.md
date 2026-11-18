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
