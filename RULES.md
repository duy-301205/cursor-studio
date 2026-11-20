# RULES.md — AI Agent Guardrails & Coding Standards

> **Mode:** STRICT / NON-NEGOTIABLE | **Version:** 1.0 | **Date:** 2026-11-17  
> **Applies to:** Codex (Python/FastAPI/SQL/Docker), Antigravity (React/TypeScript/Tailwind).  
> **Precedence:** Security + data integrity > accepted architecture/API contract > approved task scope > personal Agent preference.

## 0. Agent handshake — đọc trước mọi task

**BẮT BUỘC:** Trước khi sửa code, Agent đọc lần lượt `PRD.md`, `ARCHITECTURE.md`, `DESIGN.md`, `RULES.md`, `TASKS.md`, `PROGRESS.md`, sau đó đọc task được giao và dependencies. Mọi output phải nêu: task ID, files changed, commands executed, test results, known issues. Không bắt đầu task sau khi task hiện tại chưa đạt DoD, trừ khi có blocker được ghi vào PROGRESS.

**Phân quyền:**

- **Codex** sở hữu `backend/**`, `docker-compose*.yml`, `infra/**`, SQL/migrations, OpenAPI contract và backend tests. Không trực tiếp sửa `frontend/src/**` nếu task không quy định.
- **Antigravity** sở hữu `frontend/**`, component UI, browser logic, TS API client và frontend tests. Không trực tiếp sửa backend hoặc chỉnh behavior API để “chữa” lỗi frontend.
- **Shared docs:** `ARCHITECTURE.md` là contract; việc sửa contract phải có review và ghi change request. `PROGRESS.md` là state tracker; task owner cập nhật dòng task, result, blockers sau khi hoàn thành.
- **Concurrent workflow:** chỉ một Agent được chỉnh một file cùng thời điểm. Nếu PR backend thay schema, frontend chỉ cập nhật sau khi contract mới được chấp thuận.

**Task scope guard:** 1 task chỉnh tối đa 1–2 **primary files** đã liệt kê; files tự tạo bởi scaffold/lockfile, fixtures auto-generated, `.pyc`, `dist/`, coverage không tính, nhưng không được commit artifacts không cần thiết. Nếu cần chỉnh thêm file người, dừng phần ngoài scope và ghi blocker/new task thay vì âm thầm mở rộng phạm vi.

## 1. Strict rules — Codex (Backend)

### B01 — Python strict + typed

- Python 3.12, `from __future__ import annotations`, `ruff format`, `ruff check`, `mypy` (hoặc pyright chuẩn), `pytest`, `pytest-asyncio`.
- Module/function public có type hints và Pydantic v2 models. Không dùng `Any` tràn lan; nếu cần `Any` cho third-party phải isolate và giải thích.
- `async def` cho I/O DB/network; SQLAlchemy 2.0 `AsyncSession` per request, `async with` transaction; không share session giữa concurrent requests.
- Pillow transform, CUR encoding, ZIP compression và SDK sync nặng **không được block event loop**; dùng `fastapi.concurrency.run_in_threadpool()`/`anyio.to_thread.run_sync` có semaphore giới hạn concurrency.
- Log có structure/request_id, không log ảnh, Base64, passwords, cookies/tokens, signed R2 URLs hay full customer config.

### B02 — Docker-first and environment

- Dev compose **đúng 2 services**: `db` MySQL 8.0 và `backend` FastAPI `--reload`; frontend chạy Vite host.
- Dev MySQL healthcheck, backend depends_on healthy, named volume DB; không commit `.env` credentials.
- Production tách config; **không** `--reload`, **không** auto-seed, **không** tạo bảng bằng `create_all()` lúc run; migrations Alembic explicit.
- API `/health/live` và `/health/ready`; readiness query DB, không báo ready giả.
- Container production non-root, DB không public port, Caddy HTTPS. Không commit R2 keys.

### B03 — DB and idempotency

- Schema/enum/indices phải khớp `ARCHITECTURE.md` canonical DDL. Mọi raw SQL phải parameterized; không string interpolation input.
- Dev lifespan seed 5 categories cùng ít nhất 2 published packs đủ 17 vị trí, vẽ PNG/CUR hợp lệ cho 8 vai trò gốc bằng chính encoder service và dùng ánh xạ tương thích cho các vị trí còn lại. Chạy lần 2 không sinh bản ghi trùng/đổi ID.
- FK `ON DELETE CASCADE` cho items, `UNIQUE(pack_id,role_type)`; published validation enforced ở service, không chỉ UI.
- DB UTC (`DATETIME(6)`); `created_at`/`updated_at` nhất quán; share expiry timestamp lấy từ server.
- Tăng `download_count` có atomic SQL update `download_count = download_count + 1` sau khi gói đã tạo thành công, tránh lost update.

### B04 — REST contract invariants

- Implement đủ 7 endpoints chính xác (categories, packs list, pack detail, pack download, convert, share create, share get).
- JSON fields/enums/status codes đúng `ARCHITECTURE.md`; published filter trên server, không dựa frontend.
- Pydantic response DTO, không return ORM thô; list phải phân trang với stable secondary sort ID.
- Error handler chuẩn `{error:{code,message,details,request_id}}`, kể cả request validation lỗi.
- Không lấy `share_url` từ untrusted request `Host`, chỉ dùng `PUBLIC_FRONTEND_BASE_URL` env.
- API v1 breaking field change = contract change, không sửa lén.

### B05 — Upload security: Magic Bytes / limit / raster

- Chỉ nhận PNG, JPEG, WebP dựa **trên Magic Bytes + Pillow actual decoder**. `file.content_type` hay extension chỉ là metadata.
- **MAX_BYTES = 2_097_152**; đọc tối đa `MAX_BYTES + 1` trước khi quyết định 413, không đọc vô hạn `await file.read()`.
- `Image.MAX_IMAGE_PIXELS` và kiểm tra `width*height <= 12_000_000`; decode/verify toàn bộ; reject corrupt/animated upload nếu không được support (animated WebP phải lấy frame đầu có khai báo, MVP chọn reject).
- Chặn SVG/HTML/GIF/BMP/ICO/EXE/MZ, polyglot gây decoder mismatch; không tự fetch image URL từ client.
- `size` chỉ 32 hoặc 48, `0 <= hotspot_x,y < size`; reject bool/float/string non-int ngoài parser rõ ràng; file xuất luôn RGBA.
- `slowapi` **10 requests/phút/IP** cho convert, share 5/min và download 30/min; behind Caddy chỉ tin proxy xác định, không tin arbitrary `X-Forwarded-For`.
- Rate limit dùng in-memory chỉ phù hợp single process dev; production nhiều worker/replica cần Redis-backed/shared limiter hoặc enforce bổ sung tại Cloudflare/Caddy. Nếu không có shared store, không tuyên bố giới hạn toàn cụm là chính xác.

### B06 — CUR binary invariant

- Bytes đầu `.cur`: `00 00 02 00`; `idCount>=1`, MVP `idCount=1`.
- `ICONDIRENTRY` width/height đúng 32/48; hotspot lưu vào WORD offsets tương ứng; offset/length khớp actual bytes.
- DIB header 40-byte với `biHeight = 2 * logical_height`, XOR BGRA bottom-up, AND mask aligned 32-bit, preserves alpha.
- Không đổi hotspot sau khi letterbox/resize mà không cập nhật coordinate semantics; hotspot người dùng chọn trên raster cuối.
- **KHÔNG** dùng `win2xcur` để PNG → Windows CUR: tool đó đảo chiều; nếu dùng thư viện khác phải chứng minh chiều conversion và binary test.
- `.ani` do admin cung cấp được validate RIFF/ACON và limits, không cố sinh `.ani` bằng CUR encoder.

### B07 — 17 Registry slots MUST preserve order

```python
# Canonical order: NO SORT, NO REORDER
WINDOWS_SLOT_TO_ROLE = (
    ('Arrow', 'pointer'),
    ('Help', 'help'),
    ('AppStarting', 'working'),
    ('Wait', 'busy'),
    ('Crosshair', 'precision'),
    ('IBeam', 'text'),
    ('NWPen', 'handwriting'),
    ('No', 'unavailable'),
    ('SizeNS', 'resize_vertical'),
    ('SizeWE', 'resize_horizontal'),
    ('SizeNWSE', 'resize_diagonal_nwse'),
    ('SizeNESW', 'resize_diagonal_nesw'),
    ('SizeAll', 'move'),
    ('UpArrow', 'alternate'),
    ('Hand', 'link'),
    ('Pin', 'location'),
    ('Person', 'person'),
)
assert len(WINDOWS_SLOT_TO_ROLE) == 17
```

- Registry path: `HKCU,"Control Panel\Cursors\Schemes"`; 17 đường dẫn tương ứng **một** chuỗi comma-separated trong value named scheme. Không nhầm label marketing `Pointer/Work/Busy/...` với Registry slot names.
- Mọi file được refer trong scheme **phải có trong ZIP**; `.ani` extension phải chính xác; names ASCII-safe, sanitized. INF `CopyFiles`, `SourceDisksNames`, `SourceDisksFiles` và `DestinationDirs` nhất quán.
- Không tự ghi `HKLM`, chạy PowerShell, RunOnce, UAC bypass hay auto-execute system changes. Website không tự áp dụng cursor Windows.
- CR-20261120-01 thêm `Pin` và `Person` ở cuối chuỗi. Kiểm tra cài đặt trên Windows trước khi phát hành.

### B08 — ZIP in-memory only

- Tạo ZIP bằng `ZipFile(BytesIO(), ZIP_DEFLATED)`, không tạo file ZIP tạm trong `/tmp`, không load toàn bucket, không viết file ZIP lên ổ đĩa.
- Các **assets nguồn** đọc qua trusted local/R2 adapter; không fetch remote URL bất kỳ từ user/input/share config.
- Files trong ZIP do server định tên; không absolute path, `..`, `\`, control chars, không ZIP Slip, không symlink entries.
- Tổng bytes raw assets <=50MiB, từng file <=10MiB, tối đa 17 tệp con trỏ; giới hạn jobs đồng thời để tránh memory exhaustion.
- Trước khi trả 200: tạo manifest, verify 17 references resolve, assert ZIP format, rồi mới atomic count increment.
- `Content-Disposition` có tên an toàn, `Cache-Control:no-store`, `X-Content-Type-Options:nosniff`.

### B09 — Share safety

- `config_json` chỉ `version` + `roles`, mỗi role có `pack_id` và `role_type` tương ứng, max 8, body <=8KiB.
- `pack_id` phải tồn tại và `status=published`, item role phải có; không cho external URLs/HTML/scripts/blob/base64/custom image nội bộ trong share.
- Share code dùng `secrets`/crypto-safe Base62 8–12, DB unique, retry on conflict 5 lần; không dựa `random` yếu.
- Server tự đặt TTL 90 ngày; API trả 404 unknown và 410 expired/unpublished asset.
- Chỉ serve preview đã được allowlist và validate, không SSRF.

### B10 — Tests and observability

- Backend CI: ruff, mypy/pyright, pytest unit & integration, SQL migration smoke. Mỗi endpoint có happy path + bad input + DB/error case.
- Windows installer tests: parse scheme 17 positions, count strings, check each `.cur/.ani` exists in ZIP; test actual install Windows VM trước release.
- Failing test không được “fix” bằng cách xóa test, hardcode expected success hay disable validator.
- `print()` không thay production logs; no secrets in trace.

## 2. Strict rules — Antigravity (Frontend)

### F01 — React/TypeScript strict

- React 18, Vite, TypeScript `strict: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true`; ESLint + Prettier.
- Không `any`, không `@ts-ignore` vô lý, không cast `as unknown as` để qua lỗi; define API DTO và data validators (Zod hoặc handwritten discriminated checks).
- Function components/hooks, state predictable; side effect không chạy trong render; abort fetch khi filter/page đổi hoặc unmount.
- `VITE_API_BASE_URL` bắt buộc, không hardcode localhost trong production code.
- API chỉ dùng 7 endpoints; nếu backend thiếu feature, show UI disabled/empty state và ghi dependency, không tự chế endpoint.

### F02 — Cursor CSS hard constraint

```css
/* VALID: URL + numeric hotspot + mandatory keyword fallback */
cursor: url("https://cdn.example.com/pointer.png") 0 0, auto;
cursor: url("https://cdn.example.com/link.png") 4 1, pointer;
cursor: url("https://cdn.example.com/text.png") 16 16, text;
cursor: url("https://cdn.example.com/busy.png") 16 16, wait;

/* INVALID: no keyword fallback, unsupported global override */
/* cursor: url("/pointer.png") 0 0; */
/* body { cursor: url("/pointer.png"), auto; } */
```

- Every dynamic value is `cursor: url(...) X Y, <keyword fallback>`; X/Y validated integer and clamped to output bitmap dimensions.
- Custom cursor asset <=128px (prefer 32px/48px), dynamic preview URL comes only from trusted API/allowlist, never unescaped external user text.
- Apply cursor only on explicit test zone; never override `<body>` globally, never prevent user closing dialog due to pointer behavior.
- `.ani` browser native support không được giả định; sử dụng PNG/WebP preview + frame animation visual fallback, tải `.ani` Windows không đổi.
- `data-cursor-role` của Sandbox phải đủ 8 roles; fallback keywords phải theo `DESIGN.md`.

### F03 — Site Theme vs Sandbox Theme

- Website `data-theme` trên root, lưu preference riêng `ccs.theme.v1`.
- Sandbox state bên trong component `data-sandbox-theme`, mặc định light; **không** phụ thuộc và **không** ghi đè website theme.
- Toggle Sandbox không reset Mix, route, active pack hay hotspot.

### F04 — Canvas / WASM / privacy

- Upload `accept` chỉ là UX; frontend kiểm tra size/type sơ bộ và backend kiểm tra Magic Bytes khi export.
- Không tải model ngay khi vào homepage; dynamic import `@imgly/background-removal` khi user click Remove Background.
- Implement AGPL license review gate trước public launch; không giả định dùng package là không có nghĩa vụ công bố source.
- Nếu WASM không chạy, phải có `Skip AI` để user dùng image nguyên bản, không chặn export.
- Canvas giữ alpha; sticker outline làm theo alpha mask, không phải border vuông; downsize contain fit 32/48 trước convert.
- Không lưu ảnh/upload blob vào localStorage, analytics hoặc share config; revoke object URLs.

### F05 — Hotspot correctness

- Lưới HotspotPicker 32×32/48×48, pixel crosshair đỏ, checkerboard, coordinate origin top-left (0,0).
- Convert click pos từ `getBoundingClientRect` của **actual grid**, clamp `[0,size-1]`; không nhân DPR hai lần.
- Keyboard + numeric input bắt buộc; X/Y cập nhật cùng source of truth; size change scale/clamp.
- Preview CSS and POST convert use **same** hotspot and raster dimensions; không dùng width of displayed scaled image làm binary size.

### F06 — Mix local state and share

- localStorage key `ccs.mix.v1`, versioned schema, 8 keys maximum; validate on read; không lưu file Blob/Base64.
- `Use this mix` chỉ ghi sau explicit user click; mở share URL không tự overwrite draft.
- On sharing, send only config refs (source pack+role), not preview URL; show 410/404 states.
- Các role lựa chọn từ pack published; unknown role must fail validation, never silently map.

### F07 — A11y and responsive

- WCAG 2.2 AA as target, meaningful HTML, keyboard access, focus visible, aria labels, reduced motion.
- Hover actions có keyboard/touch alternative; PackCard không là một click target lồng nhiều button không hợp lệ.
- Loading/empty/error states có text, không chỉ icon/spinner; 429 Retry-After user guidance.
- Floating dock responsive, safe area, không che primary CTA; no scroll lock khi không có modal.

### F08 — Data fetching and caching

- API client centralizes base URL, timeout/AbortController, binary Blob vs JSON, structured error responses.
- Chỉ render dữ liệu thực từ backend auto-seed; cấm fake hardcoded cards trong final MVP.
- Sort/page/filter sync URL query string; query input debounced 250ms; stale requests canceled.
- Không dùng remote data URL trong CSS chưa validated; CORS/Canvas resources must obey allowlisted origins.

### F09 — State and performance

- `Studio` route code-split; WASM lazy loaded, no long blocking tasks on main thread where worker APIs available.
- Images `loading="lazy"` ở gallery, fixed dimensions; avoid large base64 state; cleanup event listeners.
- Async export must disable duplicate clicks, handle user navigation, no leak object URLs.

### F10 — Frontend Definition of Done

- TS strict build, ESLint, unit/component tests, browser e2e for essential flows; no console errors.
- UI snapshot/light-dark/mobile/keyboard smoke, WCAG audit, 8 cursor roles tested.
- Docs and `PROGRESS.md` updated with screenshots evidence locations if relevant; no claim feature works solely because code exists.

## 3. Cross-agent contracts and change control

| Layer | Codex owns | Antigravity consumes | Gate |
|---|---|---|---|
| SQL / migrations | Tables, indexes, seed | Never direct DB | Migration & schema test |
| REST / OpenAPI | Pydantic DTO + errors | TS DTO + parser | Same JSON samples |
| Cursor assets | `.cur/.ani` binary, preview URL, hotspot | CSS + visual preview | Width, coords, file valid |
| ZIP / INF | 15-slot mapping, safe package | Download UI/instructions | Windows QA |
| Studio upload | File validation, binary CUR | Canvas, alpha, UX | Header + hotspot tests |
| Share | Safe refs/TTL | localStorage and share UI | 404/410/422 tests |
| Deploy | Docker/Caddy/backup | Cloudflare Pages build | HTTPS/CORS/smoke |

**Contract change format (ghi vào PROGRESS):**

```text
CHANGE REQUEST ID: CR-YYYYMMDD-XX
Proposed by: Codex | Antigravity
Old behavior:
New behavior:
Why required:
Affected endpoints / DTOs / DB / UI:
Backward compatibility:
Migration and rollback:
Approval:
```

No code change across a contract boundary until change accepted. Nếu đang bị blocker, báo chính xác lỗi + reproduction, không bịa response/mock.

## 4. 10 Anti-patterns nghiêm cấm tuyệt đối

| # | CẤM | Thay thế bắt buộc |
|---:|---|---|
| AP-01 | **Frontend tự sửa Backend/API contract** khi lỗi UI | Lập contract issue, Codex sửa server |
| AP-02 | **Dùng `any`, bỏ TS strict, vô hiệu lint/test** để build xanh | Types/schema đúng, sửa nguyên nhân |
| AP-03 | **Tin `Content-Type`, filename hoặc extension** của upload | Magic Bytes + Pillow verify + pixel/size cap |
| AP-04 | **Fetch URL từ share config/upload** vào backend (SSRF) | Trusted storage adapter + allowlisted keys |
| AP-05 | **Tạo ZIP tạm ra disk** hay trích file client cung cấp với path tùy ý | ZipFile + BytesIO + server-generated safe names |
| AP-06 | **Thiếu CSS cursor fallback** hoặc dùng >128px; override body toàn cục | `url(...) x y, keyword` trên zone 32/48 |
| AP-07 | **Đổi thứ tự 15 Registry slots**, đặt sai `AppStarting`/`Wait`, trỏ đến file không có | Canonical tuple + ZIP manifest test |
| AP-08 | **Dùng `win2xcur` PNG→CUR**, hoặc tạo binary giả chỉ có 4 byte header | Correct CUR encoder + binary/Windows tests |
| AP-09 | **Làm giả 1-click OS installation hoặc che giấu upload ảnh** | UI hướng dẫn Install/Apply; privacy statement |
| AP-10 | **Hardcode secrets, mock data production, bỏ license review hoặc skip backup/restore** | Env/secrets, real seed/API, license gate, ops QA |

**Violation handling:** dừng task, revert phạm vi ảnh hưởng, ghi Known Issue/Resolution và bổ sung regression test. Vi phạm AP-03/04/05/07/08/10 là release blocker.

## 5. Required command checklist

**Codex trước bàn giao task:**

```bash
# Chạy sau khi deps đã cài; điều chỉnh đường dẫn theo môi trường thật
python -m ruff check backend
python -m ruff format --check backend
python -m pytest backend/tests -q
docker compose -f docker-compose.dev.yml config
docker compose -f docker-compose.dev.yml up --build -d
curl -fsS http://localhost:8000/health/ready
```

**Antigravity trước bàn giao task:**

```bash
cd frontend
npm ci
npm run typecheck
npm run lint
npm run test -- --run
npm run build
```

**Ghi đúng kết quả:** nếu command chưa tồn tại ở task sớm, ghi `N/A (not yet scaffolded)` thay vì tự tuyên bố PASS. Một task có blocker không thể marked DONE bằng lý do “chưa test”.

## 6. Quy cách trả lời mỗi phiên AI Agent

```text
TASK: Txx — <tên>
STATUS: DONE | BLOCKED | IN_PROGRESS
FILES CHANGED:
- path/to/file1
- path/to/file2
IMPLEMENTATION NOTES:
- ...
COMMANDS EXECUTED / OUTPUT SUMMARY:
- ... PASS/FAIL/N/A
ACCEPTANCE CRITERIA:
- [x] ...
- [ ] ... (reason, blocking action)
SECURITY / REGRESSION CHECK:
- ...
NEXT TASK / DEPENDENCY:
- ...
PROGRESS.md UPDATED: YES | NO (reason)
```

**Không mô tả những phần chưa chạy là đã thành công.** Nếu phải sinh source code bổ sung ngoài 1–2 file cho task, yêu cầu tách task hoặc ghi exception được duyệt; không che thay đổi phạm vi.
