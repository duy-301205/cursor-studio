# ADMIN_EXTENSION.md — Admin Cursor Pack Manager

> **Project:** Custom Cursor Studio & Library  
> **Document status:** PROPOSED / NOT IMPLEMENTED  
> **Version:** 1.0 · 2026-11-18  
> **Scope:** Module quản trị mở rộng sau T22; **không thay thế** `PRD.md`, `ARCHITECTURE.md`, `DESIGN.md`, `RULES.md`, `TASKS.md`, `PROGRESS.md` và `AGENTS.md`.  
> **Task namespace:** `A01`–`A15` (riêng biệt với `T01`–`T25`).

## 0. Hướng dẫn bắt buộc cho AI Agents

1. **Đọc `AGENTS.md` và đủ sáu tài liệu cốt lõi trước khi viết code.** Sau đó đọc tài liệu này. Với task Admin, đọc thêm `ADMIN_SPEC.md`/`ADMIN_TASKS.md` nếu được tạo ở A01; các tài liệu sau phải nhất quán với tài liệu này.
2. `T01`–`T22` được báo cáo DONE; **Agent phải kiểm tra repository thật**, không mặc nhiên cho rằng file, chức năng, bài test tồn tại nếu chưa kiểm chứng. `T23`–`T25` thuộc kế hoạch Production/QA và **không được tự đánh dấu DONE**.
3. Thực hiện **một task Axx mỗi lượt**, theo dependency; phạm vi file ghi bên dưới là *primary files*; test, migration, dependency và mount router có thể cần file phụ. Nếu vượt phạm vi, nêu lý do và xin phê duyệt trước.
4. **Codex** sở hữu Backend, migrations, auth, storage, API. **Antigravity** sở hữu React UI, typed client và browser E2E. Không sửa code của Agent kia nếu chưa được cho phép.
5. Sau khi thỏa toàn bộ Definition of Done (DoD), cập nhật `ADMIN_TASKS.md` và phần Admin ở `PROGRESS.md` (hoặc `ADMIN_PROGRESS.md` nếu được quyết định tại A01); task chưa test không được đánh dấu PASS. **Không sửa checklist T01–T25.**
6. Không tự ý thay đổi hợp đồng của 7 API công khai; nếu cần, lập Architecture Change Request (ACR), mô tả backward compatibility và xin duyệt.
7. Chưa được deploy Admin lên Internet nếu chưa qua Security Release Gate ở §12.

## 1. Mục tiêu sản phẩm, personas, phạm vi

### 1.1 Mục tiêu

Cho phép một quản trị viên hợp lệ biến ý tưởng thiết kế thành bộ Cursor Windows đăng trên Gallery, không dùng thao tác SQL thủ công: tạo draft → khai báo metadata → upload ảnh/asset → gán đủ 8 role và hotspot → preview → validate → publish → hiện trên Gallery → tải ZIP chứa `Install.inf` 15 slots. Hỗ trợ unpublish an toàn và theo dõi lỗi/audit.

### 1.2 In scope (v1)

- Tài khoản Admin nội bộ, không có self-registration; bootstrap từ CLI được bảo vệ.
- Session auth bảo mật và phân quyền trên **mọi endpoint ghi dữ liệu**.
- Quản lý danh sách pack (draft/published), tạo draft, sửa metadata, gán ảnh/`.cur` hợp lệ, preview, validate, publish/unpublish.
- Tái sử dụng encoder CUR, object storage (local/R2), 8-role Sandbox, Hotspot Picker và 15-slot INF/ZIP packager hiện có.
- Giữ nguyên 7 API công khai hiện có, kể cả logic 404 cho draft.
- Hỗ trợ truy vết các thay đổi quan trọng và kiểm thử từ API đến UI.

### 1.3 Out of scope (v1)

- Đăng ký Admin công khai, multi-tenant, RBAC nhiều cấp, marketplace cho cộng tác viên.
- Thanh toán, AI prompt-to-8-assets, moderation tự động, version history toàn phần, workflow nhiều người duyệt.
- Tự động thay đổi Windows cursor từ trang web; việc cài `.inf` vẫn do người dùng Windows thực hiện.
- Xóa cứng pack đã xuất bản/asset có thể đang được tham chiếu (chỉ unpublish trong v1).
- Quy trình tạo `.ani` từ ảnh tĩnh; nếu nhận `.ani`, phải có validator/preview riêng, không giả định CUR encoder tạo ANI.

### 1.4 Định nghĩa thành công

Admin có thể tạo **một pack tĩnh** 8 role, xem trước đầy đủ và xuất bản mà không chạm SQL; public Gallery/Detail/ZIP hoạt động; không người dùng chưa xác thực nào có thể gọi admin mutations; 7 API công khai và bài test cũ tiếp tục PASS. V1 coi `.ani` là **optional gated enhancement** sau khi validator format, mapping và preview thật đã được chứng minh.

## 2. Hiện trạng và tích hợp với hệ thống đang có

### 2.1 Những phần tái sử dụng

| Thành phần hiện tại | Tác dụng trong Admin |
|---|---|
| `cursor_packs` | `category_id`, `title`, `slug`, `description`, `thumbnail_url`, `is_animated`, `is_premium`, `status`, counters/timestamps |
| `cursor_items` | 8 role; `preview_png_url`, `cursor_file_url`, `hotspot_x`, `hotspot_y`; unique `(pack_id, role_type)` |
| `GET /api/v1/categories` | Chọn danh mục (public API chỉ trả pack_count published) |
| CUR encoder + `/studio/convert` | Chuyển PNG sang CUR hoặc xác thực chuẩn nhị phân, không cần viết encoder mới |
| Storage adapter local / R2 | Lưu previews và cursor; key do server tạo, không tin URL bất kỳ từ client |
| ZIP packager + INF builder | Public download ZIP và 15 slot Windows |
| `HotspotGridPicker`, `InteractiveSandbox` | Chọn hotspot và preview 8 vùng, ưu tiên tái sử dụng composition |
| `RULES.md` + Design Tokens | Strict Python/TS, UI consistency, hạn chế hành vi không an toàn |

**Lưu ý:** `cursor_items.hotspot_x/y` có CHECK DB 0–47; **validation ứng dụng** phải kiểm tra tọa độ nhỏ hơn kích thước pixel thực tế (32 hoặc 48). DB hiện tại không lưu `size`, nên validator phải xác định kích thước từ file asset, không đoán từ hotspot.

### 2.2 Compatibility contract

- Public `GET /packs` và `GET /packs/{slug}` không được lộ draft; thao tác download cũng không tải draft.
- Không thay đổi định dạng JSON, pagination, CORS mặc định hoặc ý nghĩa trường trên 7 endpoint cũ khi chưa có ACR.
- 8 role canonical: `pointer`, `link`, `text`, `busy`, `working`, `precision`, `unavailable`, `move`.
- 15 INF slots được sinh từ role mapping hiện có; **không tạo 15 cursor_items**.
- Asset preview/URL phải truy xuất được từ browser và server production; không trả `localhost` trong production.
- Cấu hình Mix & Match được chia sẻ có thể tham chiếu các pack bị unpublish: API public phải xử lý không lộ draft, không dùng asset bí mật, và trả lỗi/placeholder hợp đồng rõ ràng. A15 kiểm tra regression.

## 3. Luồng nghiệp vụ và trạng thái

```text
Admin Login (session)
     |
     v
Create Draft (metadata + category) ---> Edit Draft
     |                                    |
     v                                    v
Upload assets (previews + CUR files) --> Assign 8 roles + hotspots
     |                                    |
     +-----------------> Authenticated Preview
                                      |
                                      v
                              Validate for publish
                                |            |
                           FAIL/errors      PASS
                                |            |
                           Fix draft         v
                                        Publish
                                           |
                                           v
                                  Public Gallery/Detail
                                           |
                                           v
                                   Download ZIP + INF
                                           |
                                           v
                                       Unpublish
                                         (draft)
```

**Invariants:**

1. `draft`: chỉ admin được xem/sửa qua endpoint admin. Public endpoints trả 404.
2. `published`: 8 role đầy đủ, file hợp lệ/có thể đọc, thumbnail hợp lệ, category tồn tại, ZIP/INF generation không lỗi.
3. Publish kiểm tra lại dữ liệu **trên server ngay lúc chuyển trạng thái**, không tin checklist do client gửi.
4. Cập nhật metadata/role của pack đang public trong v1: **chặn cập nhật asset trực tiếp**; yêu cầu `unpublish → edit → validate → republish`. Không để trạng thái công khai chứa asset chưa hoàn chỉnh. V2 có thể bổ sung staging version và atomic swap.
5. Unpublish không xóa object ngay; tránh broken links và cho phép rollback/điều tra.
6. Tránh race condition: publish dùng transaction, kiểm tra trạng thái/phiên bản dưới row lock hoặc cơ chế optimistic concurrency; không coi transaction DB là transaction xuyên R2. Asset cần được upload/xác thực trước khi commit publish.

### 3.1 Bản ghi ví dụ

```json
{
  "id": 123,
  "title": "Cyber Neon Purple",
  "slug": "cyber-neon-purple",
  "category_id": 5,
  "description": "8 cursor tĩnh phong cách cyberpunk màu tím",
  "is_animated": false,
  "is_premium": false,
  "status": "draft"
}
```

## 4. Kiến trúc đề xuất

```text
Frontend React (/admin/*)
  |  credentials: include, CSRF token on writes
  v
FastAPI (/api/v1/admin/*)
  |-- admin_auth router -> session store (DB, opaque session ID cookie)
  |-- require_admin dependency / authorization
  |-- admin_packs router -> validation / publish service
  |-- admin_assets router -> upload service -> Local/R2 storage
  |
  +---- SQLAlchemy AsyncSession -> MySQL (existing packs/items + admin tables)

Public APIs remain unchanged:
  /api/v1/categories, /packs, /packs/{slug}, /packs/{id}/download,
  /studio/convert, /studio/share, /studio/share/{code}
```

### 4.1 Auth & session design decision

- Mặc định **server-side opaque session** (random token đủ entropy), lưu DB **hash của token**, không lưu plaintext. Cookie chứa token, gắn `HttpOnly`, `Secure` (production HTTPS), `SameSite=Lax` nếu admin+API same-site; `Path=/api/v1/admin` khi chỉ admin API cần cookie. Session revoke được khi logout, có absolute expiry và optional idle expiry.
- Cookie `__Host-` chỉ sử dụng nếu thỏa `Secure; Path=/; không Domain`. **Không** dùng prefix `__Host-` cho cookie `Path=/api/v1/admin`.
- Admin Web và API ưu tiên **same-origin** thông qua reverse proxy (`https://example.com/admin` và `https://example.com/api/v1/admin`) để đơn giản hóa cookies/CSRF. Nếu khác origin, phải có danh sách CORS allowlist cụ thể, `Access-Control-Allow-Credentials`, không `*`; phân tích cookie same-site/cross-site và chính sách trình duyệt trước khi chọn thiết kế.
- Mutations POST/PATCH/PUT/DELETE yêu cầu **CSRF protection**: token per-session cung cấp qua endpoint tương ứng, gửi header `X-CSRF-Token`, server xác minh; đồng thời kiểm tra `Origin`/`Referer` phù hợp. `SameSite` không thay thế CSRF token.
- Tài khoản Admin bootstrap qua CLI chạy nội bộ, password nhập từ prompt/secret; Argon2id (thông số được phê duyệt), chống timing leak, không hardcode credential. Không mở public registration.
- Login: generic error không tiết lộ user tồn tại, IP+account throttling, audit login failures, 429 khi vượt ngưỡng; hỗ trợ disable account/revoke sessions; không log password/token/PII không cần thiết.
- Session renewal và thời hạn xác định ở A01. Có kế hoạch rotation/revoke. API luôn kiểm tra auth+authorization ở Backend; React route guard chỉ giúp UX.
- HTTPS bắt buộc production; cấu hình TrustedHost/proxy headers chính xác và session cookie secure khi release.

### 4.2 Database additions (illustrative, A02 finalizes)

Schema dưới đây là **đề xuất**; A01 phải kiểm tra ORM/Alembic migration hiện hữu và đưa ra migration có upgrade/downgrade không phá dữ liệu. Không chạy SQL này trực tiếp trên DB production.

```sql
CREATE TABLE admin_users (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  username VARCHAR(100) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
    ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_admin_users_username (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE admin_sessions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  admin_user_id BIGINT UNSIGNED NOT NULL,
  token_hash BINARY(32) NOT NULL,
  csrf_token_hash BINARY(32) NOT NULL,
  expires_at DATETIME(6) NOT NULL,
  revoked_at DATETIME(6) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  last_seen_at DATETIME(6) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_admin_sessions_token_hash (token_hash),
  KEY idx_admin_sessions_user_expiry (admin_user_id, expires_at),
  KEY idx_admin_sessions_expiry (expires_at),
  CONSTRAINT fk_admin_sessions_admin FOREIGN KEY (admin_user_id)
    REFERENCES admin_users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

Optional: `admin_audit_events` để ghi actor, action, target, request_id, timestamp và status **không** chứa password/token/file contents. Nếu muốn audit bắt buộc trong v1, A01 phải bổ sung migration và acceptance tests tương ứng.

### 4.3 Asset model decision

DB hiện có chỉ lưu URL tại `cursor_items` và `cursor_packs`. Để tránh URL arbitrary và orphan data, v1 **khuyến nghị** thêm bảng `admin_assets` với `id`, `storage_key`, `kind`, `mime_type`, `byte_size`, `sha256`, `width`, `height`, `created_by_admin_id`, `pack_id`, `created_at`; liên kết vào role theo cách tương thích với các URL public hiện tại. A01 cần chốt: (i) FK assets và projection URL hay (ii) controlled URL + asset registry. Không tự ý đổi public response fields.

Asset keys immutable, do server cấp, ví dụ `packs/<pack-id>/assets/<uuid>.png`; tuyệt đối không lấy filename/path do client cung cấp làm key. Xác thực CUR bằng header, directory entries, offsets, payload và hotspot bounds; `.ani` yêu cầu RIFF/ACON validation độc lập. Không dùng chỉ magic bytes làm bảo đảm đủ tính hợp lệ.

## 5. Admin API Contract v1 (proposed)

**Prefix** `/api/v1/admin`. Tất cả endpoint trừ `login` yêu cầu Admin session; mọi mutation cần CSRF. Response JSON dùng `application/json`, lỗi theo error envelope nhất quán với dự án hiện tại; download/upload binary dùng media type đúng. ID path = positive integer; encode input; validate max lengths.

| Method | Path | Request | Success |
|---|---|---|---|
| POST | `/auth/login` | `{username,password}` | `200` session cookie + csrf token |
| POST | `/auth/logout` | CSRF header | `204` revoke cookie/session |
| GET | `/auth/me` | Cookie | `200` current admin + csrf token (không token session) |
| GET | `/packs` | `?status=&q=&page=&limit=` | `200` list paginated, includes drafts |
| POST | `/packs` | metadata | `201` draft |
| GET | `/packs/{id}` | Cookie | `200` full editable admin detail |
| PATCH | `/packs/{id}` | metadata, precondition | `200` updated draft |
| POST | `/packs/{id}/assets` | multipart | `201` validated asset metadata |
| PUT | `/packs/{id}/roles/{role}` | `{asset_id,preview_asset_id,hotspot_x,hotspot_y}` | `200` role assignment |
| POST | `/packs/{id}/validate` | Cookie + CSRF | `200` validation report (no publish) |
| POST | `/packs/{id}/publish` | CSRF + precondition | `200` published |
| POST | `/packs/{id}/unpublish` | CSRF + precondition | `200` draft |

A01 phải kiểm tra xem prefix router trong code hiện hữu đã là `/api/v1`; không mount trùng prefix. Không tự động tạo public API `POST /packs`.

### 5.1 JSON examples (illustrative; finalize in A01)

**Login request:**

```json
{"username":"admin","password":"<supplied-secret>"}
```

**Login response:**

```json
{"admin":{"id":1,"username":"admin"},"csrf_token":"<ephemeral-csrf-token>","expires_at":"2026-11-18T12:00:00Z"}
```

Session token chỉ đi qua `Set-Cookie`, **không** nằm trong JSON. CSRF token không lưu `localStorage`; giữ trong memory. Không lưu password dưới mọi hình thức ở frontend.

**Create draft request:**

```json
{
  "title": "Cyber Neon Purple",
  "slug": "cyber-neon-purple",
  "category_id": 5,
  "description": "Bộ con trỏ tím neon phong cách cyberpunk",
  "is_animated": false,
  "is_premium": false
}
```

**Create response 201:**

```json
{
  "id": 123,
  "title": "Cyber Neon Purple",
  "slug": "cyber-neon-purple",
  "category_id": 5,
  "description": "Bộ con trỏ tím neon phong cách cyberpunk",
  "is_animated": false,
  "is_premium": false,
  "status": "draft",
  "thumbnail_url": null,
  "roles": [],
  "updated_at": "2026-11-18T05:00:00Z"
}
```

**Important compatibility note:** Public `cursor_packs.thumbnail_url` là `NOT NULL`. Để hỗ trợ draft chưa có thumbnail, A01 **phải quyết định** dùng placeholder server-controlled hợp lệ hoặc migration nullable có chiến lược serializer/public, thay vì viết `NULL` vào schema cũ mà không migration. JSON trên là view Admin đề xuất, không phải khẳng định DB chấp nhận null.

**Asset upload:** `multipart/form-data` với `file` và `kind` (`preview`, `thumbnail`, `cursor`), tùy thiết kế có `role_type`. Giữ server-computed metadata.

**Asset response:**

```json
{"asset_id":"a_01","kind":"cursor","filename":"pointer.cur","storage_key":"packs/123/assets/8f1c.cur","byte_size":1234,"sha256":"<hex>","width":48,"height":48,"hotspot_x":1,"hotspot_y":1}
```

`storage_key` chỉ nên trả cho admin nếu thực sự cần; UI thông thường dùng `asset_id`, URL preview hoặc admin read URL. Không cấp public access cho draft raw asset trước khi publish.

**Assign role request:**

```json
{"asset_id":"a_01","preview_asset_id":"a_02","hotspot_x":1,"hotspot_y":1}
```

**Validate response:**

```json
{
  "valid": false,
  "pack_id": 123,
  "missing_roles": ["busy","working"],
  "errors": [{"code":"ASSET_MISSING","field":"roles.busy","message":"Thiếu file cursor"}],
  "warnings": []
}
```

**Publish response:**

```json
{"id":123,"status":"published","slug":"cyber-neon-purple","published":true}
```

**Error statuses:** `400` invalid business action, `401` unauthenticated, `403` unauthorized/CSRF, `404` not found (including ID outside allowed scope), `409` conflict/slug/optimistic lock, `413` oversized, `415` invalid format, `422` validation, `429` throttle, `503` dependent storage unavailable. Không đưa stack trace, SQL hoặc secrets vào response.

**TypeScript API client:** `credentials:'include'` trên admin fetch, gửi CSRF token header cho mutations, AbortSignal, native `fetch`, không dùng `any`, parse errors theo API thực tế.

## 6. Validation matrix trước Publish

| Check | Điều kiện PASS |
|---|---|
| Category | Tồn tại và được phép sử dụng |
| Metadata | Title/slug hợp lệ, unique, description trong giới hạn, không có XSS khi hiển thị |
| Thumbnail | Server-controlled asset hợp lệ, truy cập được ở môi trường public sau publish |
| Roles | Chính xác 8 role canonical, mỗi role 1 cursor item |
| Cursor asset | Valid `.cur` tĩnh, hotspot đúng, payload decode được; `.ani` chỉ khi support validator đã hoàn tất |
| Preview | PNG hợp lệ, 32/48 pixel chuẩn hoặc contract cho preview rõ ràng; không có mismatch với cursor |
| Hotspot | Tọa độ integer >=0, nhỏ hơn width/height thực tế và <=47 theo DB |
| Storage | Key thuộc storage cho phép; object tồn tại và nội dung/hash phù hợp |
| Packaging | ZIP có file mỗi role; INF map đúng 15 slot; filenames an toàn/unique |
| Public invariants | Published không lộ dữ liệu Admin/secrets; draft 404 từ public API |
| Concurrency | Không thể vừa sửa role vừa publish khi trạng thái không nhất quán |

### 6.1 15 Windows slots mapping

Không tạo mapping mới trái với `ARCHITECTURE.md`. Mọi publish gate phải chạy logic packager hiện tại cho các registry slots: `Arrow`, `Help`, `AppStarting`, `Wait`, `Crosshair`, `IBeam`, `NWPen`, `No`, `SizeNS`, `SizeWE`, `SizeNWSE`, `SizeNESW`, `SizeAll`, `UpArrow`, `Hand` (hoặc tên canonical tương ứng trong code hiện hành). Xác nhận bằng test đối chiếu `ARCHITECTURE.md` và artifact được sinh, không hardcode mapping mới trong Admin.

## 7. Security & abuse-prevention rules (non-negotiable)

1. Auth và permission luôn ở Backend; route guard React không là hàng rào bảo mật.
2. Không có Admin signup mặc định; bootstrap nội bộ có audit, không dùng default credentials.
3. Session ID có entropy cao; lưu hash server-side; cookie HttpOnly Secure (prod), rotation/revocation, expiry; không dùng localStorage cho token.
4. CSRF token + Origin validation cho cookie-authenticated mutations; test request thiếu/giả token.
5. Login rate limiting theo account và IP; giữ thông báo lỗi đăng nhập chung, không xác nhận tồn tại username.
6. Upload dùng allowlist MIME + magic + parser validation, giới hạn bytes/pixels, phòng decompression bomb, kiểm tra các offsets của CUR/ANI, chống path traversal/symlink, không thực thi nội dung upload.
7. Lưu asset private/quarantine lúc draft, chỉ public hóa khi publish theo thiết kế storage; không suy đoán rằng CDN URL trong DB luôn an toàn.
8. Không fetch arbitrary URLs do Admin cung cấp; chỉ dùng storage key do server sở hữu.
9. Thực hiện DB transaction cho trạng thái publish, idempotency khi retry, dọn orphan R2 sau lỗi; không xóa asset trước khi chắc chắn không còn tham chiếu.
10. Có structured audit trail cho login, create, upload, role update, publish, unpublish; không log passwords, cookies, CSRF token, file bytes.
11. Kiểm tra error handling, host/CORS/HTTPS/cookie, limit payload, resource exhaustion, concurrent edits, TOCTOU.
12. Các endpoint admin không được lộ trong public navbar hay sitemap; **nhưng giấu route không thay thế auth**.

## 8. Admin UI/UX Specification

### 8.1 Routes

```text
/admin/login
/admin/packs
/admin/packs/new
/admin/packs/:id/edit
```

### 8.2 Components

- `AdminLoginPage`: username/password, thông báo lỗi chung, loading, keyboard accessibility, không lưu password; sau login chuyển về `/admin/packs`.
- `AdminRoute`: gọi `GET /auth/me`, phân biệt loading/unauthenticated/authorized; không render protected data trước khi xác minh.
- `AdminPacksPage`: bảng danh sách, search, filter draft/published, pagination; nút Create; loading/empty/error; xác nhận Unpublish.
- `AdminPackEditorPage`: metadata form, category, thumbnail, 8 role cards, upload/assign, save draft, validation report, preview, publish.
- `RoleAssetEditor`: file chooser, format/size progress/errors, preview, hotspot coordinates, reassign/replace.
- `AdminPackPreview`: tái sử dụng InteractiveSandbox và data-cursor-role; sandbox theme độc lập.
- `PublishChecklist`: trình bày kết quả server `/validate`, disable Publish nếu invalid nhưng server vẫn kiểm tra lại.

### 8.3 UI states/UX requirements

- Modern Creative Asset Hub theo `DESIGN.md`; responsive 375/768/1440, Light/Dark, accessible focus, aria labels.
- Không dùng ảnh dummy để ngụy tạo sản phẩm đã lưu.
- Tạo draft trước rồi mới upload/assign (có pack ID).
- Auto-save chỉ được thêm nếu đã có conflict protection; mặc định dùng Save rõ ràng.
- Khi tải lại vẫn lấy dữ liệu thật từ Backend; không coi localStorage là source of truth cho Admin.
- Phân biệt server validation errors, network errors và session expired; phản hồi 401 về Login có bảo toàn state hợp lý, không retry mutations vô hạn.
- Khi upload hoặc Publish đang diễn ra, chống double submit; hiển thị trạng thái dựa trên server response, không giả định success trước.
- V1 chỉ cho chỉnh sửa draft; pack published phải Unpublish trước khi sửa nội dung có thể ảnh hưởng public.

## 9. Task execution plan A01–A15

> Quy ước: mỗi dòng ghi **hai primary files** (trừ trường hợp một file); các test/migration/registration file là supporting changes phải được liệt kê riêng và xin duyệt nếu vượt giới hạn task. Mỗi task có test theo đúng phạm vi. `ADMIN_TASKS.md` có thể được tạo ở A01 để Agent đánh dấu checkpoint.

### Stage A — Security Foundation / Codex

**A01 — Lock Admin Architecture & Contracts**  
Primary: `ADMIN_SPEC.md`, `ADMIN_TASKS.md`.  
Dependencies: T15, T22 verified.  
DoD: inspect actual ORM/routes/storage/frontend; chọn same-origin deployment, cookie/CSRF strategy, sessions, asset registry, draft thumbnail policy, `.ani` scope; chốt JSON request/response/errors và test evidence; lập ACR khi xung đột; không sửa app code; chỉ cập nhật tài liệu sau phê duyệt.

**A02 — Admin ORM + Alembic migration**  
Primary: `backend/app/models/admin_user.py`, `backend/alembic/versions/<revision>_admin.py` (đường dẫn migration theo repo thật).  
Dependencies: A01.  
DoD: admin_users, sessions và asset/audit schema theo contract; migrate upgrade/downgrade trên DB test, không mất dữ liệu 4 bảng cũ; unique/index/FK đúng; không seed tài khoản mặc định; migration repeatability test.

**A03 — Session Authentication**  
Primary: `backend/app/core/admin_auth.py`, `backend/app/api/v1/admin_auth.py`.  
Dependencies: A02.  
DoD: login/logout/me, Argon2id, session issuance/revocation, secure cookie policy, CSRF protection; bad credentials/expired/revoked/CSRF-invalid tests PASS; mount router ở entrypoint thật được xác nhận.

**A04 — Authorization & Secure Bootstrap**  
Primary: `backend/app/api/deps/admin.py`, `backend/app/cli/create_admin.py`.  
Dependencies: A03.  
DoD: dependency require_admin ở mọi endpoint, admin bootstrap CLI qua secret không lộ log/shell history, login throttle, disabled admin, audit; 401/403 behavior verified; không có signup public.

### Stage B — Backend Pack Management / Codex

**A05 — Admin Pack CRUD**  
Primary: `backend/app/api/v1/admin_packs.py`, `backend/app/schemas/admin_pack.py`.  
Dependencies: A04.  
DoD: list/create/detail/patch draft với validation slug/category/length và conflict; non-admin bị chặn; published mutation blocked; không ảnh hưởng public read contracts; main router mount test.

**A06 — Admin Asset Upload & Registry**  
Primary: `backend/app/services/admin_assets.py`, `backend/app/api/v1/admin_assets.py`.  
Dependencies: A05, A02.  
DoD: upload preview/thumbnail/CUR theo allowed formats, parse/hashing/size/pixel limits, server-generated keys, quarantine draft, integrity/ownership; tests invalid magic, crafted CUR, traversal, oversize, orphan cleanup, R2/local mock.

**A07 — Eight-Role Assignment**  
Primary: `backend/app/services/pack_validator.py`, `backend/app/api/v1/admin_packs.py` (đã tạo A05, chỉ patch tối thiểu).  
Dependencies: A06.  
DoD: PUT role, 8-role uniqueness, hotspot < actual size, asset ownership, consistency between preview/CUR, proper transactional update; partial drafts allowed, published changes denied; missing/duplicate role tests.

**A08 — Publish / Unpublish Service**  
Primary: `backend/app/services/pack_publisher.py`, `backend/app/api/v1/admin_packs.py`.  
Dependencies: A07.  
DoD: validate report, server-side prepublish checks, ZIP/15 INF, safe state transition, concurrency lock, rollback/retry behavior, draft 404 public, publish visible public, unpublish hidden public, CDN visibility tests.

**A09 — Admin Backend Security & Regression**  
Primary: `backend/tests/test_admin_security.py`, `backend/tests/test_admin_packs.py`.  
Dependencies: A08.  
DoD: comprehensive 401/403/CSRF/429, invalid upload, stale update, concurrent publish, auth expiry, database transaction/asset orphan, public API regression; `ruff`, `mypy`, existing pytest suite PASS in Docker; test runs documented.

### Stage C — Frontend Admin Console / Antigravity

**A10 — Typed Admin API Client**  
Primary: `frontend/src/types/admin.ts`, `frontend/src/lib/adminApi.ts`.  
Dependencies: A01 contract finalized, A09 recommended.  
DoD: typed DTOs and wrappers for all Admin endpoints; credentials, CSRF header, AbortSignal, multipart, normalized error handling; typecheck/build PASS; no `any`, no fake server success.

**A11 — Login + Route Guard**  
Primary: `frontend/src/features/admin/AdminLoginPage.tsx`, `frontend/src/components/admin/AdminRoute.tsx`.  
Dependencies: A10.  
DoD: protected routes wired into router (supporting change with permission), login/logout/me live API, refresh persists via cookie, unauthorized redirect without protected flash, mobile/accessibility + browser tests.

**A12 — Admin Pack List**  
Primary: `frontend/src/features/admin/AdminPacksPage.tsx`, `frontend/src/components/admin/AdminPackTable.tsx`.  
Dependencies: A11.  
DoD: real API pagination/search/status, loading/empty/errors, create draft, navigate edit; no mock packs; 375/768/1440 layout, typecheck/build/e2e smoke PASS.

**A13 — Pack Editor & 8-role Assets**  
Primary: `frontend/src/features/admin/AdminPackEditorPage.tsx`, `frontend/src/components/admin/RoleAssetEditor.tsx`.  
Dependencies: A12.  
DoD: metadata draft saving, thumbnail, upload, hotspot via existing grid, assign 8 roles, preview independent of global theme, server errors mapped to fields, avoid editing published content; browser integration PASS.

**A14 — Validation, Sandbox Preview & Publish UI**  
Primary: `frontend/src/components/admin/PublishChecklist.tsx`, `frontend/src/components/admin/AdminPackPreview.tsx`.  
Dependencies: A13.  
DoD: data from server validation, reuse sandbox, publish/unpublish real API, disable action on invalid client view while Backend remains final gate; success/error statuses, links to public pack, keyboard/accessibility tests.

### Stage D — Cross-agent Release QA

**A15 — End-to-end Admin Acceptance & Security Gate**  
Primary: `frontend/e2e/admin-workflow.spec.ts` (Antigravity), `backend/tests/test_admin_e2e.py` (Codex).  
Dependencies: A09, A14.  
DoD: create admin → login → create draft → upload 8 → select hotspot → validate → publish → public Gallery/Detail → ZIP with 15 INF slots → unpublish → public 404; unauthorized, CSRF, invalid uploads, concurrent edits, backup/export, legacy suite PASS; capture evidence/screenshots/logs with secrets removed; security signoff before T23 release.

### 9.1 Dependencies and handoffs

```text
T01–T22 complete (reported) ───> A01
A01 -> A02 -> A03 -> A04 -> A05 -> A06 -> A07 -> A08 -> A09
A01 + A09 -> A10 -> A11 -> A12 -> A13 -> A14
A09 + A14 -> A15
A15 -> Production integration with T23–T25 (not automatically DONE)
```

**Execution rule:** Do not start next Axx automatically. T23–T25 can be prepared separately, but publishing the Admin module publicly must await A15 and security review.

## 10. Test plan / evidence matrix

| Layer | Commands or method | Gate |
|---|---|---|
| Python style | `ruff check app tests`, `ruff format --check app tests`, `mypy app` (chạy đúng từ `backend/`, tùy config repo) | PASS |
| Backend test | Docker Compose MySQL test DB + `pytest` existing/new tests | PASS |
| Migration | Alembic upgrade/downgrade/upgrade in isolated DB | PASS |
| API Auth | login/me/logout, revoke, expiry, disabled user, no cookie, CSRF missing/wrong | PASS |
| Upload | valid PNG/CUR, invalid magic+payload, oversize, malicious filename, decompression bomb | PASS |
| Publish | missing role, invalid hotspot, asset missing, lock race, draft/visible lifecycle | PASS |
| Legacy API | Run original T15 tests for all 7 public routes | PASS |
| Frontend | `npm ci`, `npm run typecheck`, `npm run build` (and lint if configured) | PASS |
| Browser | 375/768/1440, theme, login, editor, keyboard, API error, network failure | PASS |
| ZIP/INF | Real download ZIP archive integrity, all 15 registry slots, Windows manual install smoke | PASS |
| Security | no secret logging, CORS/CSRF, proper cookie flags, storage isolation, authz all mutations | PASS |

Không ghi PASS nếu chỉ kiểm thử qua router/entrypoint tạm khi app chính chưa mount router. Không thay thế test với mock bằng tuyên bố đã chạy hệ thống thật.

## 11. Khiếu nại/điểm quyết định cần phê duyệt tại A01

1. **Draft thumbnail:** schema gốc `thumbnail_url NOT NULL` — placeholder server-controlled hay migration nullable? Mặc định chọn placeholder private hợp lệ rồi thay bằng asset thật trước Publish nếu tránh migration.
2. **Asset registry:** có thêm bảng `admin_assets` không, kiểu asset ID và cách map URL? Mặc định **có registry** để ownership và cleanup rõ ràng.
3. **Draft privacy:** R2 private bucket/object + signed read URLs cho admin; public CDN chỉ sau Publish. Tương thích với storage adapter hiện hữu?
4. **Cookie deployments:** same-origin Caddy routing hay Pages domain riêng? Mặc định đề xuất same-origin production cho Admin; nếu Cloudflare Pages ở domain khác API thì chọn một topology rõ ràng, kiểm tra cookie/CSRF/CORS.
5. **Published edits:** v1 unpublish-before-edit (mặc định); versioned staging là V2.
6. **ANI support:** v1 static CUR required; `.ani` chỉ hỗ trợ nếu validation và download/render theo code hiện tại đã thực sự được test.
7. **Audit and session expiry:** thời gian session, retention audit và cách cleanup session hết hạn.
8. **Deletion:** v1 unpublish; hard-delete cần deletion policy tách riêng.
9. **Pack ownership:** một Admin hoặc nhiều tài khoản; v1 quyền editor đơn giản nhưng kiểm tra mọi endpoint theo role admin.
10. **Rate limit:** login, upload và mutation thresholds cụ thể, cơ chế shared limiter khi nhiều replica.

Mọi quyết định cần ghi trong `ADMIN_SPEC.md` để Codex và Antigravity không tự quyết các hợp đồng trái nhau.

## 12. Release Gate và Definition of Done

### 12.1 Task-level DoD

- Chỉ sửa files trong scope đã duyệt, code đạt strict lint/typecheck.
- Tests phù hợp PASS; báo cáo rõ PASS/FAIL/NOT RUN, lệnh, môi trường, file thay đổi.
- Không phá public API contracts hoặc backward compatibility.
- Ghi audit/sự cố vào tracker theo quy tắc AGENTS.
- Dừng đúng task, không tự nhảy Axx+1.

### 12.2 Module-level Done (A15)

- [ ] Admin session + authorization + CSRF được kiểm thử thực tế.
- [ ] Không có default credentials, signup công khai hay token trong localStorage.
- [ ] Admin tạo draft rồi upload 8 asset, gán đúng hotspot và xem trước.
- [ ] Server refuse publish thiếu role/file sai, kể cả bypass UI.
- [ ] Published xuất hiện trên public Gallery/Detail và download ZIP 15 INF slots.
- [ ] Unpublish ẩn pack khỏi API công khai; không bị lộ qua draft asset URL.
- [ ] 7 public endpoints và test hồi quy T15 PASS.
- [ ] R2/local behavior, atomicity/cleanup, error handling đã kiểm chứng.
- [ ] Frontend typecheck/build/E2E và responsive/accessibility PASS.
- [ ] Migration và rollback kế hoạch được kiểm tra trên staging.
- [ ] Bảo mật production (TLS, cookies, CORS, secrets, rate limit, monitoring) được sign-off trước publish.

## 13. Hướng dẫn sử dụng tài liệu với Agent

**Prompt A01 gọn:**

> Hãy đọc `AGENTS.md`, sáu tài liệu cốt lõi và `ADMIN_EXTENSION.md`. Xác minh repository hiện tại. Chỉ triển khai A01: tạo `ADMIN_SPEC.md` và `ADMIN_TASKS.md`, khóa kiến trúc và API admin theo các quyết định ở mục 11. Không sửa code, không thực hiện A02, không thay đổi T23–T25. Báo cáo quyết định cần tôi duyệt rồi dừng.

**Prompt mỗi Task tiếp theo:**

> Đọc `AGENTS.md`, sáu tài liệu cốt lõi, `ADMIN_EXTENSION.md`, `ADMIN_SPEC.md`, `ADMIN_TASKS.md` và progress. Chỉ triển khai Axx; giới hạn file đúng task; chạy test và đưa bằng chứng; cập nhật checklist/progress khi PASS; nếu cần sửa file ngoài scope xin phê duyệt; dừng, không chuyển task kế.

**Bổ sung cho `AGENTS.md` (không tự chỉnh nếu chưa được yêu cầu):**

```markdown
## Admin Extension
Khi task liên quan Admin Cursor Pack Manager, đọc thêm `ADMIN_EXTENSION.md`
(và `ADMIN_SPEC.md`, `ADMIN_TASKS.md` khi đã được tạo).
Task Admin dùng namespace A01–A15, không thay thế T01–T25.
Một task mỗi lần, không triển khai tiếp nếu chưa được duyệt.
```

---

**Ưu tiên tài liệu khi mâu thuẫn:** `RULES.md`/`ARCHITECTURE.md` về kỹ thuật hệ thống hiện hữu; `PRD.md` về sản phẩm; `DESIGN.md` về UI; `TASKS.md`/`PROGRESS.md` về T01–T25. `ADMIN_EXTENSION.md` chỉ mở rộng scope admin. `ADMIN_SPEC.md` sau A01 chỉ có hiệu lực nếu được phê duyệt và không phá hợp đồng công khai; mọi xung đột phải ghi ACR trước khi sửa code.
