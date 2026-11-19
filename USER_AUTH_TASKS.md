# USER_AUTH_TASKS.md — Tài khoản người dùng và quyền sử dụng tính năng

**2026-11-19 · U01 đã duyệt · U04 PASS**

Mở rộng Custom Cursor Studio & Library để khách vào thẳng Gallery, còn các thao tác sử dụng bộ con trỏ yêu cầu đăng nhập. Kế hoạch này dùng namespace U01–U09. A15 vẫn là bước nghiệm thu module Admin hiện có, còn T23–T25 theo kế hoạch production. Chỉ bắt đầu triển khai sau khi chủ dự án duyệt phạm vi và thay đổi hợp đồng API ở U01.

## Hiện trạng đã đối chiếu

| Thành phần | Hành vi trong mã nguồn và tác động |
|---|---|
| MySQL 8 / Alembic | Head trong repository là `0002_admin`, kế tiếp `0001_initial`. Bốn bảng catalog/share gồm `categories`, `cursor_packs`, `cursor_items`, `custom_creations`. Admin có bảy bảng riêng, gồm identity, session, state, asset registry, role, audit và rate limit. Kiểm tra revision của môi trường đích trước khi migrate. Dev auto-seed chỉ bao phủ bảng catalog/share. |
| Xác thực Admin | `/api/v1/admin/auth` và `/admin/login` đã có. Cookie Admin giới hạn `Path=/api/v1/admin`, đăng nhập bằng username, có CSRF và bootstrap CLI. Giữ luồng này cho Admin. |
| Route frontend | `/`, `/packs`, `/packs/:slug`, alias `/pack/:slug`, `/studio`, `/mix`, `/mix/:code`. `/admin/packs` và editor được bảo vệ. Gallery là trang chính cho khách và User. Chưa cần một dashboard User mới. |
| Dependency của Admin Editor | `RoleAssetEditor.tsx` dùng `convertCursor()` từ client công khai. Khóa `POST /studio/convert` bằng phiên User sẽ làm hỏng tạo CUR trong Admin nếu chưa có đường convert riêng. Cookie Admin hiện không được gửi tới route này. |
| Asset và cache | DTO catalog có `cursor_file_url`. Static dev có thể phục vụ CUR legacy, managed media hiện trả cả PNG/WebP/CUR cho pack published. `GET /studio/share/{code}` hiện cho phép cache công khai tối đa 30 giây. ZIP backend đọc bytes qua storage adapter. |
| Mix & Match | Bản phối cá nhân hiện nằm trong `localStorage` theo key `ccs.mix.v1`. Share dùng `custom_creations` và mã có hạn 90 ngày. Chưa có quan hệ sở hữu theo User. |

Đối chiếu tại `backend/alembic/versions/`, `backend/app/main.py`, `backend/app/api/v1/{catalog,studio,admin_auth}.py`, `backend/app/services/share_service.py`, `frontend/src/App.tsx`, `frontend/vite.config.ts` và `frontend/src/components/admin/RoleAssetEditor.tsx`.

## Luồng người dùng đề xuất

1. Khách vào `/` hoặc `/packs` và xem Gallery ngay. Nút **Đăng ký / Đăng nhập** nằm ở góc trên bên phải, có vị trí tương đương trong điều hướng mobile.
2. Khách có thể xem, tìm kiếm, lọc và mở chi tiết bộ. Khi bấm **Tải ZIP**, **Thử trong Sandbox**, **Dùng Studio**, **Thêm vào Mix** hoặc mở một bản phối chia sẻ, ứng dụng chuyển đến `/login` và giữ đường dẫn nội bộ để quay lại. Link chia sẻ có thể mở trang giới thiệu khi chưa đăng nhập. Nội dung bản phối chỉ tải sau khi xác thực.
3. `/login` và `/register` dùng lại bố cục và thành phần form từ màn hình Admin hiện tại. `/login` nhận email User hoặc username Admin. Cú pháp định danh chọn đúng một API để gửi yêu cầu, còn quyền và điều hướng dựa trên phiên backend trả về. `/admin/login` tiếp tục dùng được như lối vào dành cho Admin. Form đăng ký là màn hình mới dùng chung bố cục.
4. User đăng ký bằng email và mật khẩu. Sau khi đăng nhập, User quay lại trang vừa định dùng hoặc về Gallery. Với thao tác có tác dụng như tải ZIP, tạo share hay export, người dùng bấm lại nút sau khi quay về. Admin đăng nhập thành công chuyển đến `/admin/packs`.
5. Backend xác định loại tài khoản và quyền từ phiên đã xác thực. Giao diện dùng kết quả xác thực để điều hướng. Đăng ký công khai chỉ cấp quyền User. Tài khoản Admin tiếp tục do CLI nội bộ cấp.

### Phạm vi truy cập

| Màn hình hoặc thao tác | Khách | User đã đăng nhập |
|---|---|---|
| Gallery, danh mục, tìm kiếm, lọc và chi tiết pack | Xem | Xem |
| Thumbnail và ảnh xem trước dùng để hiển thị Gallery/chi tiết | Xem | Xem |
| Hover-to-Test, Interactive Sandbox, Add to Mix và Mix composer | Chuyển đến đăng nhập khi sử dụng | Dùng |
| Studio, xuất CUR và tải ZIP | Chuyển đến đăng nhập | Dùng |
| Tạo link chia sẻ hoặc tải nội dung bản phối từ link | Chuyển đến đăng nhập | Dùng |
| Admin Console và Admin API | Yêu cầu phiên Admin | Yêu cầu phiên Admin |

**Điểm cần duyệt ở U01.** Các API đọc Gallery vẫn công khai, gồm `GET /categories`, `GET /packs` và `GET /packs/{slug}`. Các API tải ZIP, convert CUR, tạo share và lấy nội dung share dự kiến trả `401` khi thiếu phiên. Route tải CUR/ANI trực tiếp phải áp cùng chính sách nếu hiện cho phép tải file qua URL, kể cả với pack legacy. Ảnh preview cần công khai để Gallery hiển thị, vì vậy các thao tác chạy hoàn toàn trong trình duyệt như Hover-to-Test chỉ được kiểm soát ở giao diện. Chốt chính sách link chia sẻ cũ, cache CDN, và việc phiên Admin có dùng được các tính năng User hay cần phiên User riêng. Đây là thay đổi so với quy định 7 Public API không yêu cầu xác thực trong kiến trúc MVP. U01 phải ghi quyết định tương thích và kế hoạch chuyển đổi trước khi đổi hành vi.

## Đặc tả kỹ thuật U01

### Schema và phạm vi dữ liệu

| Bảng mới đề xuất | Dữ liệu và ràng buộc |
|---|---|
| `users` | `id BIGINT UNSIGNED` PK, `email_normalized VARCHAR(254)` unique với collation binary, `password_hash VARCHAR(255)` dạng Argon2id PHC, `is_active`, `created_at`, `updated_at`. Dùng một chuẩn email nhất quán ở đăng ký và đăng nhập. Đề xuất v1 nhận email ASCII, trim/lowercase, giữ nguyên dấu chấm và phần `+`. Unique DB là chốt cuối cho đăng ký đồng thời. |
| `user_sessions` | PK, `user_id` FK tới `users.id` ON DELETE CASCADE, `token_hash BINARY(32)` unique, `csrf_token_hash BINARY(32)`, `created_at`, `last_seen_at`, `expires_at`, `revoked_at` nullable. Index expiry và (user_id, expires_at). UTC `DATETIME(6)`. ID số đi ra JSON phải nằm trong giới hạn an toàn của JavaScript. |

Hai bảng trên là schema tài khoản và phiên. Đề xuất U01 bên dưới bổ sung một bảng counter riêng và dùng structured log cho sự kiện bảo mật User. Nếu cần bảng vận hành mới thì khai báo rõ schema, index và retention trong hợp đồng. Migration additive nối head thực tế, dự kiến `0003_user_auth` sau `0002_admin`. Không sửa migration cũ, backfill danh tính, đổi FK catalog, hoặc seed mật khẩu mặc định. Không phụ thuộc `create_all()`. Kiểm upgrade/downgrade trên bản sao. Trước khi downgrade môi trường có dữ liệu User, cần phương án export/restore được duyệt.

Đề xuất giữ bản phối hiện có ở trình duyệt, không tự nhập vào tài khoản sau khi đăng nhập. U01 chốt cách tránh lộ bản phối trên máy dùng chung, ví dụ namespace theo ID User và thao tác nhập bản phối legacy có xác nhận. Bản đầu tập trung vào auth và quyền sử dụng, chưa mở rộng sang đồng bộ bản phối đa thiết bị, profile công khai hoặc lịch sử tải. Chủ dự án duyệt email verification và khôi phục mật khẩu trước khi quyết định phạm vi phát hành production.

### Hợp đồng API và đường tải tệp

| Method / route dưới `/api/v1` | Thay đổi dự kiến |
|---|---|
| GET `/categories`, `/packs`, `/packs/{slug}` | Vẫn đọc công khai, giữ shape, lọc published và pagination. |
| GET `/packs/{id}/download` | Phiên User. Kiểm trước I/O, build ZIP hoặc tăng download counter. Giữ format ZIP/INF và tên file. |
| POST `/studio/convert` | Phiên User + CSRF. Kiểm quyền trước khi đọc multipart. Giữ giới hạn upload và payload/binary contract. |
| POST `/studio/share` | Phiên User + CSRF trước khi parse body. Giữ payload tham chiếu pack/role và TTL hiện có. |
| GET `/studio/share/{code}` | Phiên User, trả 401 trước khi tra code nếu chưa xác thực. Sau đăng nhập giữ 404/410 và link/mã cũ. Dùng `private, no-store` và bỏ cache công khai, purge các bản cache cũ khi chuyển đổi. |
| POST `/auth/register`, POST `/auth/login`, GET `/auth/me`, POST `/auth/logout` | API User mới. U01 chốt DTO và mã lỗi. Đề xuất register nhận email/password, trả 201 và chuyển sang login. Login/me trả danh tính User, CSRF token và thời hạn, không đưa token phiên vào JSON. Logout trả 204 và thu hồi phiên. |
| POST `/admin/tools/convert` | Đề xuất endpoint Admin mới dùng chung pipeline encode với Studio, kiểm phiên Admin + CSRF. Chuyển RoleAssetEditor sang endpoint này trước hoặc cùng đợt bật quyền User cho Studio. Admin không cần tạo tài khoản User để làm công việc quản trị. |

Về file .cur/.ani, đề xuất hướng tải qua ZIP là luồng chính. Nếu giữ tải binary trực tiếp, dùng đường dẫn same-origin có kiểm phiên và `no-store` cho cả GET/HEAD, hoặc chặn đường tải raw nếu không còn dùng. U01 phải quyết định `cursor_file_url` sẽ giữ dạng cũ nhưng trỏ tới gateway có auth, hay đổi DTO theo kế hoạch tương thích rõ ràng. Rà nơi frontend đọc đuôi file để hiển thị CUR/ANI. Bao phủ static legacy, managed gateway, CDN URL cũ và truy cập trực tiếp bucket. Không sử dụng ẩn nút hay bỏ URL khỏi DTO như biện pháp duy nhất. Preview PNG/WebP vẫn công khai để Gallery và Sandbox dùng được. ZIP backend tiếp tục đọc asset nội bộ bằng storage adapter.

### Phiên, lỗi và triển khai

- Đề xuất phiên User opaque ngẫu nhiên 256 bit, lưu digest, cookie riêng host-only, `HttpOnly`, `Secure` khi dùng HTTPS và `SameSite=Lax`. Ưu tiên `Path=/api/v1` để cookie tới auth và 4 API cần khóa, giữ nguyên cookie Admin. Nếu cần download gateway có cookie, đặt dưới prefix tương thích. Chốt idle/absolute TTL, giới hạn đăng ký/đăng nhập và thu hồi phiên ở U01.
- Kiểm Origin và CSRF với ghi dữ liệu có cookie. Register/login trước khi có phiên kiểm Origin, chỉ nhận JSON giới hạn kích thước và rate-limit. Dùng error envelope `error.code/message/details/request_id`, 401 thiếu phiên/sai thông tin, 403 sai quyền hoặc CSRF, 422 payload sai, 429 kèm `Retry-After`. U01 chốt xử lý email trùng sao cho không tự đăng nhập vào tài khoản cũ và không làm lộ danh tính qua thông báo/lưu lượng. Không log email thô khi không cần, password, session token hoặc CSRF token.
- Giữ same-origin ở local và production. Proxy Vite `/api/v1/admin/` hiện giữ Host, còn proxy `/api` dùng `changeOrigin: true`. U03/U04 phải cấu hình giữ origin hiệu lực trên cả User auth và mutation được khóa, xác minh qua `http://localhost:5173`. Staging xác minh HTTPS, trusted proxy, cookie flags, CDN bypass/purge và cache.
- Quay lại sau login chỉ chấp nhận route nội bộ allowlist, giữ slug/query cần thiết và từ chối URL ngoài site, `//...`, dạng mã hóa hoặc admin path đối với User. Khách mở `/mix/:code` có thể thấy trang mời đăng nhập nhưng không tải hay cache dữ liệu share trước khi có phiên. Frontend phân biệt đang kiểm phiên với đã đăng xuất để tránh hiện nhầm dữ liệu hoặc chuyển hướng lặp.
- Triển khai theo thứ tự schema → auth và đường convert Admin → frontend mới và chính sách bảo vệ đã duyệt → staging/E2E. Chốt cơ chế bật đồng bộ và rollback, đồng thời ghi rõ trạng thái cache cũ; phục hồi phiên bản ứng dụng không tự downgrade dữ liệu User.

## U01 — Hợp đồng backend được phê duyệt

**ACR: U01-PUBLIC-ACCESS.** Điều kiện truy cập thay đổi trên bốn endpoint hiện có tại bảng API phía trên. Giữ nguyên ba endpoint đọc catalog, JSON/binary payload thành công của bốn endpoint được bảo vệ, mã share, TTL và bộ cài ZIP/INF. Client cũ gọi ẩn danh vào endpoint được bảo vệ sẽ nhận `401` sau khi chuyển đổi. Chủ dự án đã đồng ý tiếp tục U02 ngày 2026-11-19. Các điều kiện phát hành production vẫn được nghiệm thu ở U09.

| Quyết định | Đề xuất chốt cho bản đầu |
|---|---|
| Danh tính | Admin dùng username và endpoint Admin hiện có. User dùng email và endpoint User. Form dùng chung gửi đúng một yêu cầu theo loại định danh, không thử lại sang namespace còn lại. Admin về `/admin/packs`. User về Gallery hoặc route công khai hợp lệ vừa định sử dụng. |
| Đăng ký | Email ASCII chuẩn hóa theo phần schema, password 15–128 ký tự và tối đa 512 byte UTF-8, dùng Argon2id. Tạo User active và chuyển sang login tường minh. Email trùng trả `409 EMAIL_UNAVAILABLE`. Phản hồi trùng này cho phép suy ra email đã được dùng, nên U01 cần duyệt trade-off trước khi chọn phương án cho production. |
| Phạm vi v1 | Bản dev đầu tiên gồm đăng ký, login, logout, refresh nhận lại phiên và bảo vệ tính năng. Hoãn xác minh email, quên mật khẩu và đồng bộ Mix khỏi bản dev đầu. Trước khi mở đăng ký trên Internet, chủ dự án chốt chính sách xác minh quyền sở hữu email và khôi phục tài khoản. |
| Phiên User | Idle 30 phút, absolute 12 giờ như mặc định Admin đã duyệt. Cookie host-only `__Secure-ccs_user`, `Path=/api/v1`, `HttpOnly`, `Secure`, `SameSite=Lax`. HTTP local chỉ khi bật rõ và dùng loopback, cookie tên riêng. Login xoay token, logout thu hồi phiên hiện tại. Không làm mới absolute TTL qua `me`. |
| Quyền | User được dùng tính năng công khai đã khóa. Phiên Admin tiếp tục phục vụ Admin API, gồm endpoint convert Admin mới. Chỉ có phiên Admin thì các tính năng User yêu cầu phiên User. Hai phiên độc lập nếu cùng tồn tại, logout chỉ kết thúc phiên tương ứng. |
| Giới hạn và audit | Đề xuất login 5 lần sai/15 phút theo IP và email chuẩn hóa, đăng ký 5 lần/giờ theo IP. Counter nguyên tử dùng chung giữa worker và tự hết hạn theo cửa sổ. Dùng bảng `user_rate_limits` riêng theo cấu trúc scope, subject hash, window start, counter và expiry, với index expiry. Sự kiện đăng ký, login và logout đi vào structured log có request ID, outcome, ID nội bộ nếu đã xác thực. Không thêm bảng audit User trong bản đầu. Chốt retention log ở release gate. |
| Tải file đơn | Giữ field string `cursor_file_url` nhưng đổi giá trị sang route same-origin `GET/HEAD /api/v1/packs/{id}/assets/{role}/cursor.{ext}` để giữ đuôi `.cur`/`.ani` mà frontend đang đọc. Route tra pack published và role từ DB, kiểm phiên trước khi đọc storage, chỉ chấp nhận đuôi khớp file thật và dùng `private, no-store`. URL cũ dưới static/CDN phải ngừng phục vụ binary hoặc qua lớp kiểm quyền tương đương. |
| Share đã tồn tại | Giữ code cũ và TTL 90 ngày từ lúc tạo. Khách thấy lời mời đăng nhập khi mở frontend route. API trả `401` trước khi đọc code. User đã đăng nhập nhận nội dung hoặc `404`/`410` như trước. Tắt cache công khai và purge cache cũ khi bật chính sách. |

### Request và response mẫu dưới `/api/v1`

```text
POST /auth/register  {"email":"user@example.com","password":"<password>"}
201                  {"user":{"id":42,"email":"user@example.com"}}
POST /auth/login     {"email":"user@example.com","password":"<password>"}
200 + Set-Cookie     {"user":{"id":42,"email":"user@example.com"},"csrf_token":"<csrf>","expires_at":"2026-11-20T07:00:00Z"}
GET /auth/me         Cookie User
200                  Cùng shape với login, không cấp lại cookie cho mỗi request
POST /auth/logout    Cookie User + X-CSRF-Token
204                  Không có body, xóa cookie
```

```json
{"error":{"code":"AUTH_REQUIRED","message":"User session required.","details":[],"request_id":"req_example"}}
```

`401 INVALID_CREDENTIALS` trả thông báo chung cho email chưa tồn tại, sai mật khẩu và tài khoản bị vô hiệu hóa. `403 ORIGIN_DENIED` và `403 CSRF_FAILED` áp dụng theo luồng. Dùng dữ liệu dạng UTC RFC3339. Header `Retry-After` đi kèm `429 RATE_LIMITED`. Khóa phải bao phủ các tuyến API, binary và alternate routes đã liệt kê phía trên.

### Cổng chuyển đổi

1. Áp migration additive và phát hành auth User, endpoint convert Admin và Admin Editor dùng endpoint mới. Kiểm Admin login, convert và publish regression với bản phát hành này.
2. Nối frontend User và kiểm tra middleware trong cùng origin trước khi bật các route guard bắt buộc. Nếu dùng cờ rollout, kiểm riêng trạng thái trước và sau khi bật.
3. Chuyển backend, frontend, URL binary cũ và chính sách cache Share/CDN trong một đợt có kiểm tra. Hồi quy 7 endpoint theo ACR đã duyệt. Kiểm thử bằng cả phiên khách, User và Admin.
4. Nếu cần rollback, quay về bộ ứng dụng/proxy tương thích và giữ các bảng User. Chủ dự án duyệt riêng nếu rollback làm một endpoint tải hoặc share hoạt động công khai trở lại.

**Trạng thái U01:** Đã duyệt cho phạm vi dev theo ACR và các quyết định trên. Chính sách email verification và khôi phục tài khoản trước khi mở đăng ký production vẫn thuộc cổng phát hành.

## Checklist triển khai

### [x] U01 — Chốt luồng tài khoản, quyền và API contract

- **Phụ trách** — Codex và Antigravity, chủ dự án duyệt. **Phụ thuộc** — A01–A14, đối chiếu kết quả A15 nếu đã có.
- **Phạm vi dự kiến** — Đặc tả tài khoản, bảng quyền theo thao tác/endpoint, phương án giữ tương thích.
- **Yêu cầu** — Đề xuất User đăng nhập bằng email, Admin dùng username hiện có. Dùng chung giao diện đăng nhập, giữ luồng xác thực Admin và User riêng, định tuyến theo loại tài khoản đã được backend xác thực. Chốt vòng đời phiên, email verification/reset nếu có, xử lý link cũ, đường dẫn quay lại và chính sách tải trực tiếp. Chốt phần nào thuộc bản đầu, duyệt ACR cho 4 API và chọn chính sách binary/CDN, đường convert Admin, schema rate limit/audit, xác minh email và khôi phục tài khoản.
- **Nghiệm thu** — PASS khi có bảng quyền đủ cho Khách/User/Admin, request/response và lỗi mẫu, tiêu chí chuyển đổi 7 API hiện tại và phê duyệt của chủ dự án.

### [x] U02 — Schema User và phiên đăng nhập

- **Phụ trách** — Codex. **Phụ thuộc** — U01.
- **Phạm vi dự kiến** — SQLAlchemy models và Alembic revision mới cho User/session.
- **Yêu cầu** — Thêm email chuẩn hóa có unique constraint, password hash Argon2id, trạng thái tài khoản và phiên có thời hạn/thu hồi. Tách dữ liệu User khỏi tài khoản Admin.
- **Nghiệm thu** — PASS khi upgrade và kiểm tra rollback trên MySQL test, kiểm unique/FK và xác nhận dữ liệu Admin/catalog hiện có được giữ nguyên. Thử hai transaction insert cùng email chuẩn hóa và kiểm single Alembic head.

### [x] U03 — API đăng ký, đăng nhập và phiên User

- **Phụ trách** — Codex. **Phụ thuộc** — U02.
- **Phạm vi dự kiến** — Router, DTO, service xác thực User và tích hợp app chính.
- **Yêu cầu** — Đề xuất namespace `/api/v1/auth` với register, login, me, logout. Tái sử dụng primitive Argon2id và quy tắc bảo mật phù hợp từ Admin. Áp cookie riêng với `HttpOnly`, `Secure` trên HTTPS, `SameSite`, kiểm Origin/CSRF và giới hạn yêu cầu. Payload đăng ký chỉ nhận trường cho phép. Backend tự cấp quyền User. Dùng counter chia sẻ giữa worker, hỗ trợ cleanup theo TTL và kiểm thử khôi phục phiên qua proxy.
- **Nghiệm thu** — PASS khi đăng ký, trùng email, credential sai, đọc/thu hồi/hết hạn phiên và CSRF được kiểm thử qua app chính. Yêu cầu tự gán quyền Admin bị từ chối.

### [x] U04 — Bảo vệ API sử dụng tính năng và tải file

- **Phụ trách** — Codex. **Phụ thuộc** — U01, U03.
- **Phạm vi dự kiến** — Dependency xác thực quyền sử dụng, endpoint tải ZIP/convert/share đường phân phối file tải xuống và adapter convert Admin.
- **Yêu cầu** — Áp bảng quyền U01 tại backend. Kiểm cả API và URL tải trực tiếp từ pack legacy/managed, bảo toàn khả năng tải của User hợp lệ, và kiểm quyền trước thao tác nặng hoặc thay đổi dữ liệu. Phối hợp frontend chuyển editor Admin sang convert riêng trước khi thêm guard vào Studio. Kiểm thay đổi cache Share và raw binary.
- **Nghiệm thu** — PASS khi khách vẫn đọc được Gallery/chi tiết, nhận 401 khi gọi chức năng được bảo vệ, User hợp lệ vẫn dùng được và User nhận từ chối với Admin API. Admin vẫn tạo CUR được từ editor. Cache hoặc URL cũ không cấp quyền tải cho khách.

### [x] U05 — Giao diện đăng nhập và đăng ký dùng chung

- **Phụ trách** — Antigravity. **Phụ thuộc** — U01, U03.
- **Phạm vi dự kiến** — Thành phần form dùng chung, trang `/login`, `/register`, tích hợp `/admin/login` và typed API client.
- **Yêu cầu** — Giữ giao diện nhận diện nhất quán với Admin hiện có. Form hỗ trợ lỗi, loading, keyboard/mobile và phân biệt luồng đăng ký User với đăng nhập. Tích hợp convert Admin trong U07 để cùng kiểm tra khi bật guard Studio. Khi đăng nhập thành công, điều hướng theo phiên backend đã xác thực. Dùng credentials và CSRF đúng hợp đồng, lưu state phiên trong bộ nhớ.
- **Nghiệm thu** — PASS khi User đăng ký/đăng nhập được và về Gallery hoặc trang hợp lệ đã chọn, Admin về `/admin/packs`, URL quay lại bên ngoài bị từ chối, typecheck/build PASS.

### [ ] U06 — Nút tài khoản và trạng thái phiên trên Gallery

- **Phụ trách** — Antigravity. **Phụ thuộc** — U05.
- **Phạm vi dự kiến** — App shell/header và trạng thái phiên User.
- **Yêu cầu** — Nút **Đăng ký / Đăng nhập** dễ thấy ở góc phải trên desktop và trong điều hướng mobile. Khi có phiên User, hiển thị thông tin tài khoản phù hợp và lối đăng xuất. Tải lại trang khôi phục phiên qua API.
- **Nghiệm thu** — PASS khi khách vào Gallery trực tiếp, nút hoạt động trên desktop/mobile, giao diện đồng bộ sau tải lại và đăng xuất, và tài khoản khác trên cùng trình duyệt không thấy bản phối của phiên trước.

### [ ] U07 — Chặn thao tác frontend và quay lại sau đăng nhập

- **Phụ trách** — Antigravity. **Phụ thuộc** — U04, U05, U06.
- **Phạm vi dự kiến** — Route/action guards cho Studio, Sandbox, Download, Mix và Share, cùng việc chuyển RoleAssetEditor sang endpoint convert Admin đã nghiệm thu ở U04.
- **Yêu cầu** — Áp bảng quyền tại vị trí người dùng bắt đầu thao tác. Xử lý mở URL trực tiếp, session hết hạn, quay lại bằng đường dẫn nội bộ hợp lệ và giữ Gallery khả dụng cho khách.
- **Nghiệm thu** — PASS khi khách bấm từng thao tác được bảo vệ hoặc mở URL trực tiếp đều được đưa vào đúng luồng login. Đăng nhập xong quay về đúng chỗ và có thể tự tiếp tục thao tác. Editor Admin tạo được CUR khi chỉ có phiên Admin.

### [ ] U08 — Kiểm thử tương thích và bảo mật backend

- **Phụ trách** — Codex. **Phụ thuộc** — U04.
- **Phạm vi dự kiến** — MySQL/API integration tests, hồi quy catalog, Storage, Share và Admin.
- **Yêu cầu** — Kiểm phân quyền chéo, cookie/CSRF, session expiry/revoke, đăng ký trùng, trả lỗi chung, rate limit và tải file trực tiếp. Cập nhật test hợp đồng công khai theo quyết định U01. Kiểm POST race khi đăng ký trùng, throttle giữa worker, ZIP counter không tăng khi bị từ chối, share 401/404/410, 15 slot INF và convert Admin.
- **Nghiệm thu** — PASS khi suite hiện có và suite mới đạt trên MySQL cô lập. Các thay đổi hành vi công khai đều có test và phù hợp hợp đồng đã duyệt.

### [ ] U09 — Nghiệm thu xuyên suốt và chuẩn bị phát hành

- **Phụ trách** — Antigravity đầu mối browser E2E, Codex nghiệm thu backend và bảo mật. **Phụ thuộc** — U07, U08.
- **Phạm vi dự kiến** — Browser E2E, bằng chứng staging và hướng dẫn triển khai/rollback.
- **Yêu cầu** — Chạy luồng khách → Gallery → bấm tải → đăng ký/đăng nhập → quay lại → tải ZIP. Thử Studio, Mix & Match và share link. Kiểm đăng xuất, refresh, phiên hết hạn, Admin đăng nhập chung chuyển đúng trang và User bị từ chối ở Admin.
- **Nghiệm thu** — PASS khi luồng desktop/mobile và staging đạt, quyền tải trực tiếp và cache CDN đã kiểm tra, hồi quy Admin/A15 đã được đối chiếu, và chủ dự án duyệt trước khi đưa bản mở rộng lên production.


## Kết quả U02

**2026-11-19 · Codex · PASS**

- Files: `backend/app/models/user.py`, `backend/alembic/versions/0003_user_auth.py` và đăng ký metadata ở `backend/alembic/env.py`.
- Head duy nhất `0003_user_auth` nối từ `0002_admin`. Tạo `users`, `user_sessions` và `user_rate_limits`. Email chuẩn hóa duy nhất, token/CSRF là digest BINARY(32), FK User session xóa cascade và counter có khóa ghép. Ba bảng rỗng sau upgrade.
- MySQL 8.0.46 cô lập: kiểm DDL/ORM, unique ở hai transaction đồng thời với cùng email chuẩn hóa, FK/cascade, token trùng, khóa counter trùng. Downgrade từ chối khi còn User. Upgrade → downgrade → upgrade thành công sau khi xóa fixture User. Đối chiếu schema và dữ liệu 11 bảng catalog/Admin trước và sau, đều giữ nguyên.
- Ruff, Ruff Format và mypy PASS. Suite backend chạy qua hai Uvicorn worker với MySQL opt-in: 79 PASS, 0 skip, gồm Admin và T15.
- Migration chỉ chạy trên database test. Downgrade yêu cầu kết nối online, dừng User writers và xử lý dữ liệu User theo kế hoạch rollback đã duyệt.

**Task kế tiếp — U03, API đăng ký, đăng nhập và phiên User.**


## Kết quả U03

**2026-11-19 · Codex · PASS**

- Bốn endpoint `/api/v1/auth/register`, `/login`, `/me`, `/logout` đã mount qua app.main. Đăng ký User trả 201, không tự cấp phiên. Email chuẩn hóa trùng trả 409. Login dùng Argon2id chung với Admin, cookie User riêng, session/CSRF digest trong MySQL, idle 30 phút và absolute 12 giờ.
- Rate limit dùng chung MySQL. Login 5 lỗi theo IP và email trong cửa sổ 15 phút. Register 5 lượt theo IP trong cửa sổ 1 giờ. Audit User ghi request ID, action, outcome và ID nội bộ khi có. Dọn record hết hạn/tồn quá thời gian giữ bằng `python -m app.cli.cleanup_user_auth`.
- File chính: `backend/app/core/user_auth.py`, `backend/app/api/v1/user_auth.py`, `backend/app/cli/cleanup_user_auth.py`. Supporting: dùng chung KDF/Origin qua `backend/app/core/admin_auth.py`, `backend/app/api/deps/admin.py`, mount ở `backend/app/main.py`, cấu hình dev tại `docker-compose.dev.yml` và `frontend/vite.config.ts`.
- User auth mặc định tắt. Dev cần migration `0003_user_auth`, `USER_AUTH_ENABLED=true`, `USER_ORIGIN` khớp origin trình duyệt, `USER_CSRF_KEY` là 32 byte ngẫu nhiên ở dạng hex lowercase. Bật `USER_ALLOW_LOOPBACK_HTTP=true` riêng nếu dùng HTTP loopback. Production giữ gate tắt tới nghiệm thu. U03 chưa bật trên stack dev đang dùng và chưa áp migration vào đó.

| Kiểm tra | Kết quả |
|---|---|
| Ruff, Ruff Format và mypy | PASS, 45 file được kiểm format, 38 file typecheck. |
| MySQL 8 và HTTP qua app.main | PASS. Đăng ký đồng thời cùng email chuẩn hóa cho một 201 và một 409. Role injection bị từ chối. Origin/CSRF, login/me/logout, rotate/revoke, idle/absolute expiry, digest và cookie flags PASS. |
| Hai worker và proxy | PASS. Rate limit dùng chung cho login IP/email và đăng ký. Phiên User/Admin tách biệt, logout User giữ phiên Admin. Reverse proxy loopback mô phỏng Host-preserving với cookie jar phục hồi phiên PASS. |
| Cleanup và log | PASS. CLI dọn counter hết hạn và session cũ. Không thấy email/password/token/CSRF trong log kiểm thử. |
| Hồi quy hiện có | 79 backend tests PASS, 0 skip. Docker Compose config và frontend typecheck PASS. |

**Task kế tiếp của Codex — U04, bảo vệ API tính năng.** U05 đã đủ phụ thuộc để Antigravity bắt đầu theo hợp đồng U01.


## Kết quả U04

**2026-11-19 · Codex · PASS**

- `USER_FEATURE_AUTH_REQUIRED` mặc định tắt. Khi bật, catalog và preview vẫn đọc công khai. ZIP, Studio convert và Share yêu cầu phiên User trước khi parse payload hoặc đọc tài nguyên. POST kiểm Origin/CSRF. API được bảo vệ áp `private, no-store` và CDN no-store, kể cả lỗi.
- `cursor_file_url` trỏ tới `GET/HEAD /api/v1/packs/{id}/assets/{role}/cursor.{ext}` khi bật cờ. Endpoint kiểm quyền, pack published, role, đuôi thực và format lấy từ storage tin cậy. Managed binary còn kiểm hash. Legacy static và managed media URL cũ chặn raw CUR/ANI tại backend khi bật cờ. PNG/WebP vẫn truy cập được.
- `POST /api/v1/admin/tools/convert` đã hoạt động với phiên Admin và CSRF, dùng cùng validator/encoder. Antigravity chuyển RoleAssetEditor sang endpoint này ở U07 theo kế hoạch. Không bật cờ trên dev đang dùng trước khi client chuyển đổi. Cấu hình Vite giữ Host khi proxy `/api`.
- Files: `backend/app/api/deps/user_features.py`, `backend/app/api/v1/catalog.py`, `backend/app/api/v1/studio.py`, `backend/app/main.py`, `docker-compose.dev.yml`, `frontend/vite.config.ts`.

| Kiểm tra | Kết quả |
|---|---|
| Ruff, Ruff Format, mypy | PASS, 46 file format và 39 file typecheck. |
| Hồi quy khi rollout tắt | 79 PASS, 0 skip trên MySQL 8 test, gồm Admin và T15. |
| App chính khi rollout bật | PASS. Catalog/preview công khai, khách 401 trước I/O/payload, CSRF/Origin 403, ZIP 15 slot và counter, CUR/ANI legacy + managed GET/HEAD, raw link cũ 404, Share cũ 401/404/410 và no-store, unpublish chặn asset. |
| Convert Admin | PASS. User bị từ chối, Admin thiếu CSRF bị từ chối, Admin hợp lệ xuất CUR giống Studio. |
| Cấu hình dev | Docker Compose config và frontend typecheck PASS. |

CDN/R2 staging chưa kiểm thử. Trước cutover phải chặn raw binary ở edge và bucket public, purge cache URL cũ và Share, thử phát hành phối hợp với U07/U09.

**Tiếp theo phía frontend — U05–U07 (Antigravity). Task backend kế tiếp — U08.**

## Kết quả U05

**2026-11-19 · Antigravity · PASS**

- Primary files: `frontend/src/features/auth/LoginPage.tsx`, `frontend/src/features/auth/RegisterPage.tsx`, `frontend/src/lib/userApi.ts`, `frontend/src/types/userAuth.ts`, `frontend/src/components/UserAuthProvider.tsx`.
- Supporting files: `frontend/src/App.tsx` (routing `/login`, `/register`, `UserAuthProvider`), `frontend/src/tests/userAuth.test.ts`, `frontend/package.json`.
- Typed User API Client ([userApi.ts](file:///e:/cursor-studio/frontend/src/lib/userApi.ts)):
  - Quản lý CSRF token User hoàn toàn trong bộ nhớ (`getUserCsrfToken`, `setUserCsrfToken`, `clearUserCsrfToken`), tách biệt hoàn toàn với phiên Admin.
  - Tự động đính kèm `credentials: 'include'` trên toàn bộ các request qua same-origin dev proxy `http://localhost:5173`.
  - Thực thi 4 API: `POST /api/v1/auth/register`, `POST /api/v1/auth/login`, `GET /api/v1/auth/me`, `POST /api/v1/auth/logout`.
  - Phân loại lỗi tường minh với `UserApiError` (`isUnauthorized`, `isEmailUnavailable`, `isValidationError`, `isRateLimited`, `isForbidden`, `isNotFound`).
  - Hàm làm sạch URL điều hướng an toàn `getSafeRedirectUrl`: Chấp nhận route nội bộ hợp lệ, chặn đứng URL ngoài (`http://`, `https://`, `//`), backslash, ký tự điều khiển và chặn toàn bộ các route `/admin/*` đối với User.
- Trang Đăng Nhập Dùng Chung ([LoginPage.tsx](file:///e:/cursor-studio/frontend/src/features/auth/LoginPage.tsx)):
  - Một trường định danh duy nhất nhận diện tự động: nếu có `@` điều phối gọi User API (`/api/v1/auth/login`), nếu không có `@` điều phối gọi Admin API (`/api/v1/admin/auth/login`).
  - Điều hướng chính xác theo loại tài khoản: Admin vào thẳng `/admin/packs`, User chuyển về trang nội bộ hợp lệ vừa thao tác hoặc về `/`.
  - Thông báo lỗi 401 generic không tiết lộ sự tồn tại của tài khoản, countdown timer thời gian chờ khi gặp 429 `Retry-After`.
  - Chống double-submit, loading spinner, bàn phím và responsive mobile 375px/768px/1440px.
  - Giữ nguyên lối vào riêng `/admin/login` cho Quản trị viên.
- Trang Đăng Ký Người Dùng ([RegisterPage.tsx](file:///e:/cursor-studio/frontend/src/features/auth/RegisterPage.tsx)):
  - Form đăng ký User với email và mật khẩu (ràng buộc 15–128 ký tự chuẩn Argon2id).
  - Đăng ký thành công trả về 201, tự động chuyển sang `/login` kèm thông báo thành công và điền sẵn email theo đúng hợp đồng.
  - Báo lỗi email trùng `409 EMAIL_UNAVAILABLE` và lỗi validation `422`.
- Unit & Live Integration Tests ([userAuth.test.ts](file:///e:/cursor-studio/frontend/src/tests/userAuth.test.ts)):
  - 6 ca kiểm thử bao phủ toàn diện: sanitization redirect an toàn, phân loại định danh email/username, CSRF store trong bộ nhớ, phân loại mã lỗi `UserApiError`, mock flows với 204 No Content, và **kiểm thử tích hợp trực tiếp với backend thật** (đăng ký user mới, từ chối trùng email 409, sai mật khẩu 401, đăng nhập 200, lấy danh tính me, và đăng xuất 204).

| Kiểm tra | Kết quả |
|---|---|
| `npm run typecheck` (`tsc --noEmit`) | PASS, 0 errors với strict, exactOptionalPropertyTypes, noUncheckedIndexedAccess. |
| `npm test` (`node --test --experimental-strip-types`) | 79/79 PASS (6 tests mới `userAuth.test.ts` + 73 tests từ các suite trước). |
| Backend Live Test (ca 6 `userAuth.test.ts`) | PASS trực tiếp với FastAPI backend (Argon2id, MySQL session token, cookie và CSRF). |
| `npm run build` (`tsc && vite build`) | PASS, bundle production sạch trong 22.91s, 0 cảnh báo. |

**Task kế tiếp của Antigravity — U06, Nút tài khoản và trạng thái phiên trên Gallery. Dừng trước U06.**
