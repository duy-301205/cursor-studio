# ARCHITECTURE.md — System Architecture, Database & API Contract

> **Version:** 1.0 | **Date:** 2026-11-17 | **API Prefix:** `/api/v1`  
> **Contract owner:** Codex; frontend consumes this document unchanged until a reviewed contract change.  
> **Source of truth:** `ARCHITECTURE.md` for schema/wire protocol; `RULES.md` for security invariants.

## 1. Kiến trúc tổng thể

```text
                 USERS (Windows 10 / 11, desktop browsers)
                                  |
                           HTTPS / TLS 1.3
                                  |
                     +-------------------------+
                     | Cloudflare Pages         |
                     | Vite + React + TS build  |
                     | Public SPA + assets      |
                     +-------------------------+
                               | REST /api/v1
                               v
                    api.<domain> / Caddy (TLS)
                               |
                    +-------------------------+
                    | FastAPI / Uvicorn         |
                    | Async SQLAlchemy         |
                    | Validation + ZIP + CUR   |
                    | Upload rate limit        |
                    +-------------------------+
                         |                  |
                     MySQL 8            Storage adapter
                         |                  |
                    persistent DB       local /static (dev)
                                        Cloudflare R2 (prod)

     Browser-only: Canvas, WASM background-removal, localStorage Mix
     Browser → API: metadata, source file ONLY on Export CUR, share config
```

### 1.1 ADRs (Architecture Decision Records)

- **ADR-001:** Monorepo, độc lập backend/frontend, giao tiếp JSON + multipart/binary. Không dùng Next.js/SSR giai đoạn MVP.
- **ADR-002:** `FastAPI`, `SQLAlchemy 2.x async`, `asyncmy`, `Pydantic v2`, `Alembic`; database MySQL 8.0. Không chạy SQL sync blocking trong event loop.
- **ADR-003:** Bắt đầu **2 containers dev** (`db`, `backend`) với hot reload và seed idempotent. Frontend chạy `npm run dev` trên máy host, gọi API qua env.
- **ADR-004:** `/static/samples` sinh idempotent bằng Pillow; frontend chỉ dùng dữ liệu trả về từ API, không hardcode mocks.
- **ADR-005:** Ảnh xem trước dùng URL phục vụ web; file `.cur/.ani` dùng URL download. API **không** HTTP-fetch tùy ý từ URL do client gửi; resolve từ key/path nội bộ đã trust.
- **ADR-006:** CUR MVP do server sinh theo cấu trúc `ICONDIR` + `ICONDIRENTRY` + DIB, không dùng sai chiều `win2xcur` (Windows → Xcursor).
- **ADR-007:** ZIP chỉ trong RAM (`io.BytesIO`), có hạn mức kích thước và số request đồng thời. Không lưu bản ZIP trung gian.
- **ADR-008:** Tách nền trong client; giấy phép AGPL phải được review trước release. Client gửi file đã xử lý khi người dùng chủ động Export.
- **ADR-009:** Share preset **chỉ tham chiếu asset công khai trên DB**; không URL ngoài, ảnh tự tạo hay mã nhúng trong JSON.
- **ADR-010:** INF tạo scheme 15 slot chuẩn. Không đồng nghĩa “web tự cài Windows”; máy người dùng phải chạy Install và chọn/áp dụng scheme.

## 2. Luồng dữ liệu trọng yếu (ASCII Data Flow)

### 2.1 Download ZIP / Windows Quick Installer

```text
[Click Download Pack]
         |
         v
GET /api/v1/packs/{id}/download
         |
         v
[Validate published + resolve 8 role items]
         |                      \
         |                       +--> [Trusted local/R2 object keys]
         |                                  |
         v                                  v
[Map product roles -> 15 Registry slots] [Fetch .cur/.ani bytes]
         |                                  |
         +----------------------------------+
                           |
                    [Inspect magic/size]
                           |
                 [Create Install.inf, README]
                           |
                [ZipFile(BytesIO) memory-only]
                           |
                [DB download_count += 1]
                           |
              application/zip streaming response
                           |
               [Browser saves ZIP locally]
                           |
    [Extract -> Right-click INF -> Install -> Select Scheme]
```

**Failure guarantees:** nếu item thiếu, URL ngoài allowlist, invalid cursor magic, ZIP vượt 50 MiB hoặc tạo INF lỗi: fail 409/502/500 thích hợp, **không tăng count**; log ID giao dịch, không log binary. Nếu người dùng mất kết nối sau khi stream bắt đầu, count có thể đã tăng; đó là **generated download**, không phải cài thành công.

### 2.2 Photo Studio / Convert

```text
[Select file <=2MB] -> [Browser Image decode] -> [Canvas preview]
                               |                     |
                    [Optional WASM AI cutout]        |
                               |                     |
                     [Alpha outline sticker] <-------+
                               |
                     [Contain fit 32/48 RGBA]
                               |
                      [Hotspot x,y on grid]
                               |
                    [Explicit Export .cur click]
                               |
              POST /api/v1/studio/convert multipart
                               |
                     [IP rate-limit 10/min]
                               |
         [Magic bytes + size + Pillow verify + pixel limit]
                               |
                   [DIB CUR binary encoder]
                               |
                   00 00 02 00 + CUR data
                               |
                   [attachment custom-cursor.cur]
```

**Privacy boundary:** client-side remove background không upload ảnh. Request `convert` **có upload** file đã xử lý. Backend không persist file upload, không gửi ảnh đến model bên thứ ba.

### 2.3 Mix & Match / Share

```text
[Gallery/Detail role select]
           |
           v
[localStorage: ccs.mix.v1] ---> [Sandbox immediate preview]
           |
      [Click Share]
           |
 POST /api/v1/studio/share
           |
 [Validate <=8 roles, pack IDs, published ownership]
           |
 [Generate crypto-safe Base62 code 10 chars; DB UNIQUE]
           |
 [Store config_json + expires_at + created_at]
           |
 [Return /mix/{code}]
           |
    [Another visitor]
           |
 GET /api/v1/studio/share/{code}
           |
 [Resolve public role refs -> preview URLs]
           |
 [Read-only preview; "Use this mix" to overwrite local draft]
```

## 3. Monorepo skeleton

```text
custom-cursor-studio/
├── PRD.md
├── ARCHITECTURE.md
├── DESIGN.md
├── RULES.md
├── TASKS.md
├── PROGRESS.md
├── README.md
├── .gitignore
├── .env.example
├── docker-compose.dev.yml
├── docker-compose.prod.yml
├── infra/
│   ├── Caddyfile
│   ├── backup-mysql.sh
│   └── restore-mysql.sh
├── backend/
│   ├── Dockerfile
│   ├── pyproject.toml
│   ├── alembic.ini
│   ├── alembic/
│   │   ├── env.py
│   │   └── versions/
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py
│   │   ├── core/{config.py,security.py,logging.py,rate_limit.py}
│   │   ├── db/{base.py,session.py,seed.py}
│   │   ├── models/{category.py,cursor_pack.py,cursor_item.py,custom_creation.py}
│   │   ├── schemas/{catalog.py,studio.py,error.py}
│   │   ├── api/v1/{catalog.py,studio.py}
│   │   ├── services/{storage.py,cur_encoder.py,inf_builder.py,zip_packager.py,share_service.py}
│   │   └── static/samples/            # generated in dev; .gitkeep only
│   └── tests/{conftest.py,test_gallery_api.py,test_cur_encoder.py,test_zip_installer.py,test_studio_api.py,test_share_api.py}
└── frontend/
    ├── index.html
    ├── package.json
    ├── tsconfig.json
    ├── vite.config.ts
    ├── tailwind.config.ts
    ├── .env.example
    ├── public/{favicon.svg,robots.txt}
    └── src/
        ├── main.tsx
        ├── App.tsx
        ├── app/{router.tsx,providers.tsx}
        ├── styles/{globals.css,tokens.css}
        ├── lib/{api.ts,cursorCss.ts,localStorage.ts,schemas.ts}
        ├── types/{api.ts,cursor.ts}
        ├── components/{PackCard.tsx,InteractiveSandbox.tsx,HotspotGridPicker.tsx,MixMatchDock.tsx}
        ├── features/gallery/{GalleryPage.tsx,PackDetailPage.tsx}
        ├── features/studio/{StudioPage.tsx,StudioCanvas.tsx,backgroundRemoval.ts}
        ├── features/mix/{MixPage.tsx,mixStore.ts}
        └── tests/{PackCard.test.tsx,HotspotGridPicker.test.tsx,MixStore.test.ts}
```

**Atomic task policy:** Agent có thể thêm test file tương ứng nhưng không tự ý đổi cấu trúc public contract; tham khảo `TASKS.md`.

## 4. Database — executable MySQL 8.0 DDL

Mỗi migration có up/down rõ ràng. Production dùng Alembic; đoạn SQL dưới đây là schema canonical để đối chiếu migration. `CHECK` cần MySQL **8.0.16+**; mục tiêu MySQL `8.0` bản mới nhất trong nhánh 8.0 được tổ chức phê duyệt (pin digest khi production).

```sql
CREATE DATABASE IF NOT EXISTS cursor_studio
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;
USE cursor_studio;

CREATE TABLE categories (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(100) NOT NULL,
  slug VARCHAR(120) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_categories_slug (slug),
  KEY idx_categories_order (sort_order, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE cursor_packs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  category_id BIGINT UNSIGNED NOT NULL,
  title VARCHAR(180) NOT NULL,
  slug VARCHAR(200) NOT NULL,
  description TEXT NOT NULL,
  thumbnail_url VARCHAR(1024) NOT NULL,
  is_animated BOOLEAN NOT NULL DEFAULT FALSE,
  is_premium BOOLEAN NOT NULL DEFAULT FALSE,
  download_count INT UNSIGNED NOT NULL DEFAULT 0,
  status ENUM('draft','published') NOT NULL DEFAULT 'draft',
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
             ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_cursor_packs_slug (slug),
  KEY idx_packs_category_status_newest (category_id, status, created_at, id),
  KEY idx_packs_status_popular (status, download_count, id),
  KEY idx_packs_status_newest (status, created_at, id),
  CONSTRAINT fk_packs_category
    FOREIGN KEY (category_id) REFERENCES categories(id)
    ON UPDATE RESTRICT ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE cursor_items (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  pack_id BIGINT UNSIGNED NOT NULL,
  role_type ENUM(
    'pointer','link','text','busy','working',
    'precision','unavailable','move'
  ) NOT NULL,
  preview_png_url VARCHAR(1024) NOT NULL,
  cursor_file_url VARCHAR(1024) NOT NULL,
  hotspot_x TINYINT UNSIGNED NOT NULL DEFAULT 0,
  hotspot_y TINYINT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uq_item_pack_role (pack_id, role_type),
  KEY idx_items_role (role_type),
  CONSTRAINT fk_items_pack
    FOREIGN KEY (pack_id) REFERENCES cursor_packs(id)
    ON UPDATE RESTRICT ON DELETE CASCADE,
  CONSTRAINT chk_item_hotspot_x CHECK (hotspot_x BETWEEN 0 AND 47),
  CONSTRAINT chk_item_hotspot_y CHECK (hotspot_y BETWEEN 0 AND 47)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE custom_creations (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  share_code VARCHAR(12) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  title VARCHAR(180) NOT NULL,
  config_json JSON NOT NULL,
  download_count INT UNSIGNED NOT NULL DEFAULT 0,
  expires_at DATETIME(6) NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_creation_share_code (share_code),
  KEY idx_creation_expiry (expires_at),
  KEY idx_creation_created (created_at),
  CONSTRAINT chk_share_code_length
    CHECK (CHAR_LENGTH(share_code) BETWEEN 8 AND 12),
  CONSTRAINT chk_creation_expiry CHECK (expires_at > created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

**Lưu ý MySQL:** `BOOLEAN` là alias của `TINYINT(1)`; `CHECK` kiểm tra hotspot đến 47 nhưng **API** kiểm tra `< size` với `size` cụ thể. Dùng `DATETIME(6)` theo UTC ở ứng dụng; connection init đặt `time_zone='+00:00'`. `download_count` cho custom creations dành cho future mix download (MVP chưa có endpoint đó).

### 4.1 Index & query contracts

```sql
-- Category counts chỉ tính published; dùng LEFT JOIN để gồm danh mục rỗng.
SELECT c.id, c.name, c.slug, c.sort_order, COUNT(p.id) AS pack_count
FROM categories AS c
LEFT JOIN cursor_packs AS p
  ON p.category_id = c.id AND p.status = 'published'
GROUP BY c.id, c.name, c.slug, c.sort_order
ORDER BY c.sort_order ASC, c.id ASC;

-- Sort newest; SQLAlchemy bind :limit/:offset, q escaped when dùng LIKE.
SELECT p.* FROM cursor_packs p
WHERE p.status = 'published'
  AND (:category_id IS NULL OR p.category_id = :category_id)
  AND (:q IS NULL OR p.title LIKE :q ESCAPE '!')
ORDER BY p.created_at DESC, p.id DESC
LIMIT :limit OFFSET :offset;
```

`q` mặc định tìm title (description search growth), 1–100 ký tự đã trim; bind wildcard có escape `!`, `%`, `_`. Cursor preview pointer lấy qua joined eager load hoặc batched select, không N+1. Tổng rows `COUNT` query riêng. Migrations không chạy đồng thời nhiều replicas.

## 5. REST API contract — 7 endpoints

### 5.1 Quy ước toàn cục

- **Base:** `https://api.example.com/api/v1` production; dev `http://localhost:8000/api/v1`.
- **Encoding:** JSON UTF-8; timestamps UTC ISO 8601 có `Z`; ID số nguyên dương; URLs absolute HTTPS in prod, local absolute HTTP in dev; enum lower-case.
- **Success JSON:** response trực tiếp, không wrap vô nghĩa; paginated list dùng `{items,pagination}`.
- **Error JSON:** thống nhất `{ "error": { "code": "...", "message": "...", "details": [], "request_id": "..." } }` ngoại trừ mặc định của FastAPI phải được error handler chuẩn hóa.
- **HTTP:** 200 JSON, 201 create, 400 bad syntax, 404 not found, 410 expired, 413 oversize, 415 unsupported file, 422 validation, 429 throttle, 500 internal, 502 storage unavailable.
- **No authentication** MVP cho 7 public endpoints. Không cho client tạo/cập nhật published packs.
- **CORS:** production allow exact frontend origins, never `*` với credentials. V1 không dùng cookies/auth.
- **Rate limit:** convert 10 req/min/IP; share 5 req/min/IP; download 30 req/min/IP theo cấu hình. Chống abuse tại Caddy/Cloudflare bổ sung, không thay application validation.
- **Cache:** categories 60s, packs list 30s, detail 60s (ETag tùy chọn), share 30s nhưng không cache khi expired, download `no-store`, convert `no-store`.

#### JSON Schema — reusable roles / mix config (Draft 2020-12)

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://cursor.example/schemas/mix-config.v1.json",
  "title": "MixConfigV1",
  "type": "object",
  "additionalProperties": false,
  "required": ["version", "roles"],
  "properties": {
    "version": {"const": 1},
    "roles": {
      "type": "object",
      "minProperties": 1,
      "maxProperties": 8,
      "additionalProperties": false,
      "properties": {
        "pointer": {"$ref": "#/$defs/sourcePointer"},
        "link": {"$ref": "#/$defs/sourceLink"},
        "text": {"$ref": "#/$defs/sourceText"},
        "busy": {"$ref": "#/$defs/sourceBusy"},
        "working": {"$ref": "#/$defs/sourceWorking"},
        "precision": {"$ref": "#/$defs/sourcePrecision"},
        "unavailable": {"$ref": "#/$defs/sourceUnavailable"},
        "move": {"$ref": "#/$defs/sourceMove"}
      }
    }
  },
  "$defs": {
    "sourceBase": {
      "type": "object", "additionalProperties": false,
      "required": ["pack_id", "role_type"],
      "properties": {"pack_id": {"type": "integer", "minimum": 1}, "role_type": {"type": "string"}}
    },
    "sourcePointer": {"allOf": [{"$ref": "#/$defs/sourceBase"}, {"properties": {"role_type": {"const": "pointer"}}}]},
    "sourceLink": {"allOf": [{"$ref": "#/$defs/sourceBase"}, {"properties": {"role_type": {"const": "link"}}}]},
    "sourceText": {"allOf": [{"$ref": "#/$defs/sourceBase"}, {"properties": {"role_type": {"const": "text"}}}]},
    "sourceBusy": {"allOf": [{"$ref": "#/$defs/sourceBase"}, {"properties": {"role_type": {"const": "busy"}}}]},
    "sourceWorking": {"allOf": [{"$ref": "#/$defs/sourceBase"}, {"properties": {"role_type": {"const": "working"}}}]},
    "sourcePrecision": {"allOf": [{"$ref": "#/$defs/sourceBase"}, {"properties": {"role_type": {"const": "precision"}}}]},
    "sourceUnavailable": {"allOf": [{"$ref": "#/$defs/sourceBase"}, {"properties": {"role_type": {"const": "unavailable"}}}]},
    "sourceMove": {"allOf": [{"$ref": "#/$defs/sourceBase"}, {"properties": {"role_type": {"const": "move"}}}]}
  }
}
```

**Validation thêm ở server:** `allOf` JSON Schema giới hạn `role_type` theo role key nhưng Pydantic validators vẫn phải kiểm tra; source pack published và có cursor item tương ứng; không nhận URL, Base64, prototype keys, config lạ; JSON payload max 8 KiB.

### E1. `GET /api/v1/categories`

**Request:** không có params. **Response 200:**

```json
[
  {"id": 1, "name": "Minimal", "slug": "minimal", "sort_order": 10, "pack_count": 2},
  {"id": 2, "name": "Cute & Kawaii", "slug": "cute-kawaii", "sort_order": 20, "pack_count": 1},
  {"id": 3, "name": "Gaming", "slug": "gaming", "sort_order": 30, "pack_count": 0},
  {"id": 4, "name": "Anime Inspired", "slug": "anime-inspired", "sort_order": 40, "pack_count": 0},
  {"id": 5, "name": "Neon & Cyber", "slug": "neon-cyber", "sort_order": 50, "pack_count": 0}
]
```

`pack_count` chỉ bao gồm `published`, kể cả 0; sort by `sort_order`, `id`.

### E2. `GET /api/v1/packs?category=&sort=popular|newest&q=&page=1&limit=12`

**Validation:** `sort` mặc định `popular`; `page>=1`; `1<=limit<=48`; `category` là slug, không phải ID; `q` trim <=100 chars. Sort popular dùng `(download_count DESC,id DESC)`; newest dùng `(created_at DESC,id DESC)`.

**Response 200:**

```json
{
  "items": [
    {
      "id": 12,
      "category": {"id": 1, "name": "Minimal", "slug": "minimal"},
      "title": "Crystal White",
      "slug": "crystal-white",
      "description": "Clean white cursor set",
      "thumbnail_url": "https://cdn.example.com/packs/crystal-white/thumb.webp",
      "is_animated": false,
      "is_premium": false,
      "download_count": 1532,
      "created_at": "2026-11-17T03:00:00Z",
      "pointer": {
        "role_type": "pointer",
        "preview_png_url": "https://cdn.example.com/packs/crystal-white/pointer.png",
        "cursor_file_url": "https://cdn.example.com/packs/crystal-white/pointer.cur",
        "hotspot_x": 0,
        "hotspot_y": 0
      }
    }
  ],
  "pagination": {"page": 1, "limit": 12, "total": 37, "total_pages": 4, "has_next": true}
}
```

Không trả `status=draft`, không trả `cursor_items` đầy đủ ở list. Nếu pack không có pointer do dữ liệu lỗi, skip pack và ghi cảnh báo integrity (không trả fake URL).

### E3. `GET /api/v1/packs/{slug}`

**Response 200:**

```json
{
  "id": 12,
  "category": {"id": 1, "name": "Minimal", "slug": "minimal"},
  "title": "Crystal White",
  "slug": "crystal-white",
  "description": "Clean white cursor set",
  "thumbnail_url": "https://cdn.example.com/packs/crystal-white/thumb.webp",
  "is_animated": false,
  "is_premium": false,
  "download_count": 1532,
  "created_at": "2026-11-17T03:00:00Z",
  "updated_at": "2026-11-17T03:00:00Z",
  "cursor_items": [
    {"id": 101, "role_type": "pointer", "preview_png_url": "https://cdn.example.com/packs/crystal-white/pointer.png", "cursor_file_url": "https://cdn.example.com/packs/crystal-white/pointer.cur", "hotspot_x": 0, "hotspot_y": 0},
    {"id": 102, "role_type": "link", "preview_png_url": "https://cdn.example.com/packs/crystal-white/link.png", "cursor_file_url": "https://cdn.example.com/packs/crystal-white/link.cur", "hotspot_x": 4, "hotspot_y": 1},
    {"id": 103, "role_type": "text", "preview_png_url": "https://cdn.example.com/packs/crystal-white/text.png", "cursor_file_url": "https://cdn.example.com/packs/crystal-white/text.cur", "hotspot_x": 16, "hotspot_y": 16},
    {"id": 104, "role_type": "busy", "preview_png_url": "https://cdn.example.com/packs/crystal-white/busy.png", "cursor_file_url": "https://cdn.example.com/packs/crystal-white/busy.cur", "hotspot_x": 16, "hotspot_y": 16},
    {"id": 105, "role_type": "working", "preview_png_url": "https://cdn.example.com/packs/crystal-white/working.png", "cursor_file_url": "https://cdn.example.com/packs/crystal-white/working.cur", "hotspot_x": 0, "hotspot_y": 0},
    {"id": 106, "role_type": "precision", "preview_png_url": "https://cdn.example.com/packs/crystal-white/precision.png", "cursor_file_url": "https://cdn.example.com/packs/crystal-white/precision.cur", "hotspot_x": 16, "hotspot_y": 16},
    {"id": 107, "role_type": "unavailable", "preview_png_url": "https://cdn.example.com/packs/crystal-white/unavailable.png", "cursor_file_url": "https://cdn.example.com/packs/crystal-white/unavailable.cur", "hotspot_x": 16, "hotspot_y": 16},
    {"id": 108, "role_type": "move", "preview_png_url": "https://cdn.example.com/packs/crystal-white/move.png", "cursor_file_url": "https://cdn.example.com/packs/crystal-white/move.cur", "hotspot_x": 16, "hotspot_y": 16}
  ]
}
```

Mảng trả về theo thứ tự role canonical, không phụ thuộc thứ tự INSERT; nếu slug draft/không tồn tại trả 404.

### E4. `GET /api/v1/packs/{id}/download`

**Request:** `id` BIGINT >0, không có body. **Response 200** binary ZIP:

```http
HTTP/1.1 200 OK
Content-Type: application/zip
Content-Disposition: attachment; filename="crystal-white-windows.zip"
Cache-Control: no-store
X-Content-Type-Options: nosniff

<ZIP binary: PK\x03\x04 ...>
```

**ZIP layout:**

```text
Crystal-White/
├── Install.inf
├── README.txt
├── pointer.cur
├── link.cur
├── text.cur
├── busy.cur       # may be .ani when source pack animated
├── working.cur    # may be .ani when source pack animated
├── precision.cur
├── unavailable.cur
└── move.cur
```

Tên file trong INF phải trùng tên phát sinh thực tế (`.cur`/`.ani`); mọi file name do backend chủ động sinh. Trả 404 cho draft/missing, 409 `PACK_INCOMPLETE`, 502 `ASSET_UNAVAILABLE`. `is_premium=true` trong MVP chưa khóa tải vì chưa có auth/entitlement; chỉ enable premium gating khi phase Monetization có hệ thống quyền hợp lệ.

### E5. `POST /api/v1/studio/convert`

**Content-Type:** `multipart/form-data`; form fields:

```text
file: binary PNG/JPEG/WEBP (<= 2 * 1024 * 1024 bytes)
hotspot_x: integer, 0..size-1
hotspot_y: integer, 0..size-1
size: integer, one of {32, 48}
```

**Response 200:**

```http
HTTP/1.1 200 OK
Content-Type: application/octet-stream
Content-Disposition: attachment; filename="custom-cursor.cur"
Cache-Control: no-store
X-Content-Type-Options: nosniff

<00 00 02 00 01 00 ... CUR binary>
```

**Errors:** 413 `FILE_TOO_LARGE`; 415 `UNSUPPORTED_MEDIA_TYPE`; 422 `INVALID_HOTSPOT`/`CORRUPT_IMAGE`; 429 `RATE_LIMITED`. Type declared multipart is not trusted; validate first bytes and Pillow format; pixel cap 12 MP; process in memory.

### E6. `POST /api/v1/studio/share`

**Request 201:**

```json
{
  "title": "My soft glow setup",
  "config": {
    "version": 1,
    "roles": {
      "pointer": {"pack_id": 12, "role_type": "pointer"},
      "link": {"pack_id": 29, "role_type": "link"},
      "text": {"pack_id": 12, "role_type": "text"}
    }
  }
}
```

**Response 201:**

```json
{
  "share_code": "a7Kp92QzB4",
  "share_url": "https://www.example.com/mix/a7Kp92QzB4",
  "expires_at": "2027-02-15T03:00:00Z"
}
```

**Rules:** title trim 1–180; share code random Base62 10-char (DB accepts 8–12); TTL default 90 days; DB unique retry max 5; payload <=8 KiB; max 8 keys; `pack_id` published and item corresponding to role exists. `config_json` lưu đúng config v1, không lưu resolved URLs. `429` share abuse; `422` malformed/unknown pack/role; không cho client chỉ định expires_at.

### E7. `GET /api/v1/studio/share/{code}`

**Response 200:**

```json
{
  "share_code": "a7Kp92QzB4",
  "title": "My soft glow setup",
  "config": {
    "version": 1,
    "roles": {
      "pointer": {"pack_id": 12, "role_type": "pointer"},
      "link": {"pack_id": 29, "role_type": "link"},
      "text": {"pack_id": 12, "role_type": "text"}
    }
  },
  "resolved_items": [
    {
      "target_role": "pointer", "pack_id": 12, "pack_title": "Crystal White",
      "role_type": "pointer", "preview_png_url": "https://cdn.example.com/packs/crystal-white/pointer.png", "hotspot_x": 0, "hotspot_y": 0
    },
    {
      "target_role": "link", "pack_id": 29, "pack_title": "Pastel Pink",
      "role_type": "link", "preview_png_url": "https://cdn.example.com/packs/pastel-pink/link.png", "hotspot_x": 4, "hotspot_y": 1
    },
    {
      "target_role": "text", "pack_id": 12, "pack_title": "Crystal White",
      "role_type": "text", "preview_png_url": "https://cdn.example.com/packs/crystal-white/text.png", "hotspot_x": 16, "hotspot_y": 16
    }
  ],
  "expires_at": "2027-02-15T03:00:00Z"
}
```

`404` invalid/missing code; `410` expired; `410 SHARE_ASSET_UNAVAILABLE` nếu tài sản từng public bị unpublish (không tiết lộ dữ liệu draft). View không ghi vào localStorage cho đến khi user chọn Use this mix.

### 5.2 Mẫu error chuẩn

```json
{
  "error": {
    "code": "INVALID_HOTSPOT",
    "message": "hotspot_x must be between 0 and size - 1",
    "details": [{"field": "hotspot_x", "reason": "value 48 invalid for size 48"}],
    "request_id": "req_01JG9M8N6W"
  }
}
```

`X-Request-ID` gắn vào mọi response và log; server không tiết lộ trace/SQL/secrets.

## 6. Windows CUR encoding specification

### 6.1 Byte layout

```text
ICONDIR (6 bytes):
  WORD idReserved = 0x0000
  WORD idType     = 0x0002      <-- first 4 bytes: 00 00 02 00
  WORD idCount    = 0x0001
ICONDIRENTRY (16 bytes):
  BYTE bWidth, bHeight (32/48)
  BYTE bColorCount = 0
  BYTE bReserved = 0
  WORD wHotspotX, wHotspotY
  DWORD dwBytesInRes
  DWORD dwImageOffset = 22
IMAGE DATA:
  BITMAPINFOHEADER 40-byte DIB (biHeight = 2 * logical height)
  BGRA XOR bitmap rows in bottom-up order
  1-bit AND transparency mask rows in bottom-up order, padded to 32 bits
```

**Reference implementation (compatible with single-frame 32-bit CUR):**

```python
# backend/app/services/cur_encoder.py (đoạn thuật toán chuẩn, ghép vào service)
from __future__ import annotations

from io import BytesIO
from struct import pack
from PIL import Image, ImageOps


def encode_cur(source: Image.Image, size: int, hotspot_x: int, hotspot_y: int) -> bytes:
    if size not in (32, 48):
        raise ValueError("size must be 32 or 48")
    if not (0 <= hotspot_x < size and 0 <= hotspot_y < size):
        raise ValueError("invalid hotspot")

    rgba = ImageOps.exif_transpose(source).convert("RGBA")
    rgba.thumbnail((size, size), Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    left = (size - rgba.width) // 2
    top = (size - rgba.height) // 2
    canvas.alpha_composite(rgba, (left, top))

    # XOR: bottom-up BGRA; giữ alpha để Windows hỗ trợ transparency 32-bit.
    xor_rows = [
        canvas.crop((0, y, size, y + 1)).tobytes("raw", "BGRA")
        for y in range(size - 1, -1, -1)
    ]
    xor_bitmap = b"".join(xor_rows)

    # AND mask: 1 = trong suốt; mỗi hàng padded 32-bit.
    and_stride = ((size + 31) // 32) * 4
    and_rows = []
    alpha = canvas.getchannel("A")
    for y in range(size - 1, -1, -1):
        row = bytearray(and_stride)
        for x in range(size):
            if alpha.getpixel((x, y)) == 0:
                row[x // 8] |= 0x80 >> (x % 8)
        and_rows.append(bytes(row))
    and_bitmap = b"".join(and_rows)

    dib = pack(
        "<IiiHHIIiiII",
        40, size, size * 2, 1, 32, 0,
        len(xor_bitmap) + len(and_bitmap), 0, 0, 0, 0,
    )
    payload = dib + xor_bitmap + and_bitmap
    header = pack("<HHH", 0, 2, 1)
    entry = pack("<BBBBHHII", size, size, 0, 0,
                 hotspot_x, hotspot_y, len(payload), 22)
    return header + entry + payload


def inspect_cur_header(binary: bytes) -> tuple[int, int, int, int]:
    if len(binary) < 22 or binary[:6] != b"\x00\x00\x02\x00\x01\x00":
        raise ValueError("Not a 1-image CUR")
    from struct import unpack_from
    width, height, _, _, hx, hy, length, offset = unpack_from(
        "<BBBBHHII", binary, 6
    )
    if offset != 22 or 22 + length != len(binary):
        raise ValueError("Invalid CUR payload offset/size")
    return width, height, hx, hy
```

**Cần test thực tế Windows** với file output; kiểm tra nội dung RGBA, height = 2×size, AND mask và hotspot. Không xem việc Pillow đọc được `.cur` là bằng chứng duy nhất. Không cố gắng encode `.ani` bằng hàm này; `.ani` là RIFF/ACON với frame và timing riêng.

### 6.2 Validation upload, tránh decompression bomb

```python
from io import BytesIO
from PIL import Image, UnidentifiedImageError

MAX_UPLOAD_BYTES = 2 * 1024 * 1024
MAX_IMAGE_PIXELS = 12_000_000
Image.MAX_IMAGE_PIXELS = MAX_IMAGE_PIXELS


def sniff_type(data: bytes) -> str | None:
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "PNG"
    if data[:3] == b"\xff\xd8\xff":
        return "JPEG"
    if len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "WEBP"
    return None


def validate_and_decode(data: bytes) -> Image.Image:
    if len(data) > MAX_UPLOAD_BYTES:
        raise ValueError("FILE_TOO_LARGE")
    declared = sniff_type(data)
    if declared is None:
        raise ValueError("UNSUPPORTED_MEDIA_TYPE")
    with Image.open(BytesIO(data)) as probe:
        if probe.format != declared or probe.width * probe.height > MAX_IMAGE_PIXELS:
            raise ValueError("CORRUPT_OR_TOO_LARGE_IMAGE")
        if getattr(probe, "is_animated", False):
            raise ValueError("ANIMATED_IMAGE_NOT_SUPPORTED")
        probe.verify()
    with Image.open(BytesIO(data)) as image:
        image.load()
        return image.copy()
```

**API integration:** dùng exception handlers tương ứng 413/415/422; file `UploadFile.read(MAX_UPLOAD_BYTES+1)` để tránh đọc vô hạn; bọc Pillow exceptions, warnings và timeout; `ImageOps.exif_transpose()` khi encode; PIL có thể phát sinh cảnh báo và lỗi từ ảnh độc hại nên giới hạn CPU/request concurrency.

## 7. Windows `Install.inf` canonical — 15 slots

**Quan trọng:** product role chỉ có 8, nhưng Windows scheme có 15 đường dẫn theo thứ tự sau:

| Index | Registry slot | UI name | Role nguồn (MVP) | Tên file phát sinh ví dụ |
|---:|---|---|---|---|
| 0 | `Arrow` | Normal Select | pointer | `pointer.cur` |
| 1 | `Help` | Help Select | pointer | `pointer.cur` |
| 2 | `AppStarting` | Working in Background | working | `working.cur` / `.ani` |
| 3 | `Wait` | Busy | busy | `busy.cur` / `.ani` |
| 4 | `Crosshair` | Precision Select | precision | `precision.cur` |
| 5 | `IBeam` | Text Select | text | `text.cur` |
| 6 | `NWPen` | Handwriting | pointer | `pointer.cur` |
| 7 | `No` | Unavailable | unavailable | `unavailable.cur` |
| 8 | `SizeNS` | Vertical Resize | move | `move.cur` |
| 9 | `SizeWE` | Horizontal Resize | move | `move.cur` |
| 10 | `SizeNWSE` | Diagonal Resize 1 | move | `move.cur` |
| 11 | `SizeNESW` | Diagonal Resize 2 | move | `move.cur` |
| 12 | `SizeAll` | Move | move | `move.cur` |
| 13 | `UpArrow` | Alternate Select | pointer | `pointer.cur` |
| 14 | `Hand` | Link Select | link | `link.cur` |

**Thứ tự Windows là thứ tự theo Registry slots trên, không phải thứ tự 8 product roles.** Windows 11 còn có `Pin`, `Person` tùy phiên bản; không nằm trong 15-slot baseline và không được coi là “đã hỗ trợ đầy đủ 17” ở MVP.

### 7.1 `Install.inf` concrete example

```ini
; Generated by Custom Cursor Studio & Library — static example
; Extract entire ZIP. Right-click Install.inf > Install.
; Then open Mouse Properties > Pointers > Scheme and Apply if needed.
[Version]
Signature="$CHICAGO$"

[DefaultInstall]
CopyFiles=CursorFiles
AddReg=CursorScheme

[SourceDisksNames]
1="%DISK_NAME%",,,

[SourceDisksFiles]
pointer.cur=1
link.cur=1
text.cur=1
busy.cur=1
working.cur=1
precision.cur=1
unavailable.cur=1
move.cur=1

[DestinationDirs]
CursorFiles=10,"%CUR_DIR%"

[CursorFiles]
pointer.cur
link.cur
text.cur
busy.cur
working.cur
precision.cur
unavailable.cur
move.cur

[CursorScheme]
HKCU,"Control Panel\Cursors\Schemes","%SCHEME_NAME%",0x00000000,"%10%\%CUR_DIR%\pointer.cur,%10%\%CUR_DIR%\pointer.cur,%10%\%CUR_DIR%\working.cur,%10%\%CUR_DIR%\busy.cur,%10%\%CUR_DIR%\precision.cur,%10%\%CUR_DIR%\text.cur,%10%\%CUR_DIR%\pointer.cur,%10%\%CUR_DIR%\unavailable.cur,%10%\%CUR_DIR%\move.cur,%10%\%CUR_DIR%\move.cur,%10%\%CUR_DIR%\move.cur,%10%\%CUR_DIR%\move.cur,%10%\%CUR_DIR%\move.cur,%10%\%CUR_DIR%\pointer.cur,%10%\%CUR_DIR%\link.cur"

[Strings]
DISK_NAME="Custom Cursor Studio Assets"
CUR_DIR="Cursors\CCS-Crystal-White"
SCHEME_NAME="CCS - Crystal White"
```

**Vì sao có `[SourceDisksNames]` và `[SourceDisksFiles]`:** các section này khai báo nguồn của từng file `CopyFiles`; giữ nguyên danh sách khi thêm `.ani`, thay tên thực tế và khai báo nguồn tương ứng. Không bao giờ đưa `Install.inf` vào `[SourceDisksFiles]` để copy chính INF. **Lưu ý:** sao chép vào `%WINDIR%\Cursors` có thể cần quyền quản trị tùy Windows/policy.

**Chú ý với INF parsing:** `0x00000000` đăng ký `REG_SZ`. Với một số sản phẩm, `REG_EXPAND_SZ` (`0x00020000`) cũng được sử dụng. `%10%` được SetupAPI thay bằng Windows directory trong INF. `CUR_DIR` và `SCHEME_NAME` phải do server sinh từ slug/allowed charset, không chèn raw user input; đảm bảo escaping `%`, `\`, quote, comma, CR/LF. File sử dụng ASCII-safe names, chuỗi template mẫu không dùng ký tự Unicode ngoài khả năng parser INF. Đối với `.ani`, builder tạo tên file thực tế (`busy.ani`, `working.ani`) và thay đúng mọi tham chiếu theo mapping.

### 7.2 Pseudocode source mapping, không phụ thuộc hardcoded extension

```python
REGISTRY_ROLE_ORDER = (
    ("Arrow", "pointer"), ("Help", "pointer"),
    ("AppStarting", "working"), ("Wait", "busy"),
    ("Crosshair", "precision"), ("IBeam", "text"),
    ("NWPen", "pointer"), ("No", "unavailable"),
    ("SizeNS", "move"), ("SizeWE", "move"),
    ("SizeNWSE", "move"), ("SizeNESW", "move"),
    ("SizeAll", "move"), ("UpArrow", "pointer"),
    ("Hand", "link"),
)

# filenames: dict[role, safe generated filename]; no user-controlled paths
assert len(REGISTRY_ROLE_ORDER) == 15
assert set(role for _, role in REGISTRY_ROLE_ORDER) <= filenames.keys()
# For each of 15 entries:
#   destination = f"%10%\\%CUR_DIR%\\{filenames[role]}"
# Serialize ONE comma-separated REG_SZ string preserving order.
```

**Kiểm thử cài đặt:** Windows 10/11 VM, full extraction to a directory, right-click Install, verify `HKCU\Control Panel\Cursors\Schemes` has named scheme and 15 comma separated paths, verify all copied files exist under `%WINDIR%\Cursors\CCS-*`; activate scheme explicitly. Không ghi `HKLM` hay dùng RunOnce để chạy code ẩn.

## 8. Storage abstraction and defensive delivery

```python
from typing import Protocol

class Storage(Protocol):
    async def read_asset(self, trusted_asset_url: str, *, max_bytes: int) -> bytes: ...
    def public_url(self, path: str) -> str: ...
```

`LocalStorage` chỉ chấp nhận URL prefix `http://localhost:8000/static/samples/` và resolve path nằm dưới `backend/app/static/samples/`, chống `..`/symlinks. `R2Storage` chỉ chấp nhận `PUBLIC_CDN_BASE_URL` configured, parse key, dùng S3-compatible SDK với bucket cố định hoặc request tới R2 bằng credentials server-side; không forward HTTP đến tên miền do user đưa. Không expose secret keys trong JSON. Previews `image/png`, thumbnails `image/webp`, cursors `application/octet-stream`; R2 CORS cho image assets khi dùng canvas pixel read (nếu canvas cần), thêm `crossOrigin="anonymous"` nếu phù hợp.

**Budget:** upload <=2MB, decode <=12MP, CUR 32/48; download pack <=8 role files, per file <=10MiB và aggregate <=50MiB, bounded concurrent jobs. Max JSON body 8KiB share. Không upload ZIP hay CUR tạm lên R2 trong MVP.

## 9. Docker First — DEV and PROD examples

### 9.1 `docker-compose.dev.yml`

```yaml
name: custom-cursor-dev
services:
  db:
    image: mysql:8.0
    restart: unless-stopped
    environment:
      MYSQL_ROOT_PASSWORD: ${MYSQL_ROOT_PASSWORD:?set in root .env}
      MYSQL_DATABASE: ${MYSQL_DATABASE:-cursor_studio}
      MYSQL_USER: ${MYSQL_USER:-cursor_app}
      MYSQL_PASSWORD: ${MYSQL_PASSWORD:?set in root .env}
    ports:
      - "127.0.0.1:3307:3306"
    volumes:
      - mysql_dev_data:/var/lib/mysql
    healthcheck:
      test: ["CMD-SHELL", "mysqladmin ping -h 127.0.0.1 -uroot -p\"$$MYSQL_ROOT_PASSWORD\" --silent"]
      interval: 5s
      timeout: 5s
      retries: 20
      start_period: 20s

  backend:
    build:
      context: ./backend
      target: development
    command: uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
    environment:
      APP_ENV: development
      DATABASE_HOST: db
      DATABASE_PORT: "3306"
      DATABASE_NAME: ${MYSQL_DATABASE:-cursor_studio}
      DATABASE_USER: ${MYSQL_USER:-cursor_app}
      DATABASE_PASSWORD: ${MYSQL_PASSWORD:?set in root .env}
      PUBLIC_API_BASE_URL: http://localhost:8000
      PUBLIC_FRONTEND_BASE_URL: http://localhost:5173
      CORS_ORIGINS: http://localhost:5173
      STORAGE_BACKEND: local
      AUTO_SEED: "true"
    volumes:
      - ./backend:/app
    ports:
      - "127.0.0.1:8000:8000"
    depends_on:
      db:
        condition: service_healthy

volumes:
  mysql_dev_data:
```

**Dev workflow:** `cp .env.example .env` (mật khẩu chỉ local) → `docker compose -f docker-compose.dev.yml up --build -d` → API docs `/docs` → `cd frontend && npm ci && npm run dev`. Dev auto `metadata.create_all()` cho bootstrap **chỉ** khi `APP_ENV=development`; production chạy Alembic migrations. Thực tế mật khẩu có ký tự đặc biệt cần URL-encode hoặc xây DSN bằng `SQLAlchemy URL.create()` từ các env rời; không giả định interpolation DSN luôn an toàn.

### 9.2 `docker-compose.prod.yml`

```yaml
name: custom-cursor-prod
services:
  db:
    image: mysql:8.0
    restart: unless-stopped
    env_file: .env.prod
    environment:
      MYSQL_DATABASE: ${MYSQL_DATABASE:-cursor_studio}
      MYSQL_USER: ${MYSQL_USER:-cursor_app}
      MYSQL_PASSWORD: ${MYSQL_PASSWORD:?required}
      MYSQL_ROOT_PASSWORD: ${MYSQL_ROOT_PASSWORD:?required}
    volumes:
      - mysql_prod_data:/var/lib/mysql
    networks: [private]
    healthcheck:
      test: ["CMD-SHELL", "mysqladmin ping -h 127.0.0.1 -uroot -p\"$$MYSQL_ROOT_PASSWORD\" --silent"]
      interval: 10s
      timeout: 5s
      retries: 15

  backend:
    image: ${BACKEND_IMAGE:?set immutable versioned image}
    restart: unless-stopped
    env_file: .env.prod
    environment:
      APP_ENV: production
      AUTO_SEED: "false"
      STORAGE_BACKEND: r2
    expose: ["8000"]
    depends_on:
      db:
        condition: service_healthy
    networks: [private]
    read_only: true
    tmpfs: [/tmp]
    security_opt: ["no-new-privileges:true"]

  caddy:
    image: caddy:2.10
    restart: unless-stopped
    environment:
      API_DOMAIN: ${API_DOMAIN:?set public api domain}
    ports:
      - "80:80"
      - "443:443"
      - "443:443/udp"
    volumes:
      - ./infra/Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data
      - caddy_config:/config
    depends_on: [backend]
    networks: [private]

networks:
  private:

volumes:
  mysql_prod_data:
  caddy_data:
  caddy_config:
```

**Caddyfile (requires Caddy 2.10+ for `request_body`; pin tested version/digest in production):**

```caddyfile
{$API_DOMAIN} {
    encode zstd gzip
    request_body {
        max_size 3MB
    }
    reverse_proxy backend:8000
    header {
        X-Content-Type-Options nosniff
        Referrer-Policy strict-origin-when-cross-origin
    }
}
```

**Production release procedure:** build/push immutable image; `docker compose --env-file .env.prod -f docker-compose.prod.yml run --rm backend alembic upgrade head` trước rolling restart; verify `GET /health/live`, `/health/ready`; do not mount source or use `--reload`; DB không expose port host. Caddy must trust only intended forwarded headers. Frontend Cloudflare Pages build `npm ci && npm run build`, output `frontend/dist`, env `VITE_API_BASE_URL=https://api.<domain>/api/v1`.

### 9.3 `backend/Dockerfile` pattern

```dockerfile
FROM python:3.12-slim AS base
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
COPY pyproject.toml ./
COPY app ./app
COPY alembic ./alembic
COPY alembic.ini ./
RUN pip install --no-cache-dir .

FROM base AS development
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]

FROM base AS production
RUN useradd -r -u 10001 appuser && chown -R appuser:appuser /app
USER appuser
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]
```

**Build requirements:** `pyproject.toml` phải khai báo `build-system` và Python package discovery hợp lệ (`setuptools`/`hatchling`), cùng dependency lock hoặc pinned versions. Đoạn Dockerfile này là pattern để Codex hiện thực, **không phải build đã được xác nhận**; `docker build --target development` là nghiệm thu bắt buộc. Production worker count dựa VPS RAM, tránh vượt bộ nhớ với các ZIP in-memory jobs.

## 10. Lifespan auto-seed và migrations

- Chạy connection retry khi MySQL khởi động; setup app không được trả ready trước khi DB usable.
- `APP_ENV=development && AUTO_SEED=true`: `Base.metadata.create_all()` sau khi DB healthy; upsert 5 categories theo slug, 2–3 packs sample `published` với **đủ 8 roles**, Pillow vẽ RGBA mỗi role, encode `.cur` bằng service thật và lưu trong `app/static/samples/`; seed idempotent, không đổi ID/asset nếu file hợp lệ.
- Dữ liệu seed có chủ đề đa dạng: Minimal, Cute & Kawaii, Gaming, Anime Inspired, Neon & Cyber. Không sử dụng hình nhân vật/vật phẩm có bản quyền nếu thiếu quyền.
- `APP_ENV=production`: **không** `create_all`, **không** auto-generate seed khi mỗi replica start; dùng Alembic migrations + controlled content import.
- Startup tasks không ghi file vào root read-only trong prod; static samples là dev-only.

## 11. Backups, monitoring, tests

### 11.1 Nightly MySQL backup to R2

Cron tại VPS **02:00 Asia/Bangkok** (UTC+7); đặt `CRON_TZ=Asia/Bangkok` nếu cron implementation hỗ trợ, nếu không quy đổi UTC và ghi rõ timezone. Script `mysqldump --single-transaction --routines --triggers --events --set-gtid-purged=OFF` trong container hoặc host client, nén `gzip`, tạo checksum SHA-256, upload bằng AWS CLI vào R2 qua `--endpoint-url`. **File backup được phép lưu tạm** trong directory bảo vệ hoặc stream pipe; giới hạn “không ghi tạm” chỉ áp dụng **ZIP download runtime**. Không hardcode credentials; `umask 077`; retention đề xuất daily 14 bản, weekly 8, monthly 6; quyền R2 least privilege; alert khi backup thất bại; kiểm tra restore staging tối thiểu mỗi tháng. R2 egress free nhưng storage/operations vẫn bị tính phí.

### 11.2 Monitoring

`GET /health/live` trả 200 nếu process sống (không query DB); `GET /health/ready` trả 200 khi DB và storage config hợp lệ, 503 khi chưa ready. JSON structured logs: `request_id`, `route`, `status`, `latency_ms`, `asset_id`, `error_code`; loại bỏ secrets/file bytes. Metrics: P50/P95, 5xx, 429, download ZIP errors, image validation errors, R2 timeouts, backup age.

### 11.3 Test matrix

| Layer | Bài test tối thiểu | Tiêu chí |
|---|---|---|
| Unit | CUR header, 32/48, hotspot corners, alpha, truncated binary | 100% case pass |
| Unit | 15-slot role order; .cur/.ani filenames; sanitized scheme | all 15 valid paths |
| API | category counts, pagination, sort, q, draft exclusion | Contract exact |
| API | convert GIF/SVG/EXE giả đuôi; oversized; huge pixels; 429 | đúng 4xx, không 500 |
| API | share invalid roles, unpublished ID, conflict retry, expired | 201/404/410/422 |
| Integration | ZIP openable, no traversal entries, all files referenced | 100% file exists |
| E2E | Browser gallery → detail → sandbox → ZIP; studio export; share | pass on Chromium |
| Windows VM | Install.inf + activation Win 10/11; .cur hotspot/click | documented manual results |
| Ops | DB restart, R2 outage, backup restore | expected 503/recovery |

## 12. Environment contract

```dotenv
# root .env (local only; never commit real credentials)
MYSQL_DATABASE=cursor_studio
MYSQL_USER=cursor_app
MYSQL_PASSWORD=CHANGE_ME_LOCAL
MYSQL_ROOT_PASSWORD=CHANGE_ME_LOCAL_ROOT

# backend production .env.prod (illustrative keys)
APP_ENV=production
AUTO_SEED=false
DATABASE_HOST=db
DATABASE_PORT=3306
DATABASE_NAME=cursor_studio
DATABASE_USER=cursor_app
DATABASE_PASSWORD=REPLACE_WITH_SECRET
PUBLIC_API_BASE_URL=https://api.example.com
PUBLIC_FRONTEND_BASE_URL=https://www.example.com
CORS_ORIGINS=https://www.example.com
STORAGE_BACKEND=r2
R2_ENDPOINT=https://<account_id>.r2.cloudflarestorage.com
R2_BUCKET=cursor-assets
R2_ACCESS_KEY_ID=REPLACE
R2_SECRET_ACCESS_KEY=REPLACE
PUBLIC_CDN_BASE_URL=https://cdn.example.com
API_DOMAIN=api.example.com
BACKEND_IMAGE=registry.example.com/ccs-backend:1.0.0

# frontend/.env.example
VITE_API_BASE_URL=http://localhost:8000/api/v1
```

Đừng copy placeholder sang production. Tách env password DB thành các biến rời để tránh ký tự đặc biệt phá URL. `PUBLIC_FRONTEND_BASE_URL` là nguồn tạo share URL, không lấy từ Host header do client gửi.

## 13. Contract change protocol

Mọi thay đổi public endpoint/enum/field buộc cập nhật: (1) Pydantic DTO, (2) OpenAPI, (3) `frontend/src/types/api.ts` và validation, (4) test contract, (5) `ARCHITECTURE.md` + entry `PROGRESS.md`. Version breaking change phải đặt API mới (ví dụ `/api/v2`) thay vì lặng lẽ phá client.

## 14. References / verification notes

- Windows INF `DefaultInstall`: https://learn.microsoft.com/en-us/windows-hardware/drivers/install/inf-defaultinstall-section
- Windows cursor types: https://learn.microsoft.com/en-us/dotnet/api/system.windows.input.cursortype
- CSS cursor grammar: https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/cursor
- `win2xcur`/`x2wincur` orientation: https://pypi.org/project/win2xcur/
- Browser background removal license: https://github.com/imgly/background-removal-js
- Cloudflare R2 pricing: https://developers.cloudflare.com/r2/pricing/

**Không xem các sample code là đã triển khai:** Agent phải tạo file thật, chạy lint/tests/build và cập nhật bằng chứng trong `PROGRESS.md`.
