# PRD.md — Product Requirements Document

> **Sản phẩm:** Custom Cursor Studio & Library (CCSL)  
> **Phiên bản tài liệu:** 1.0 | **Ngày:** 2026-11-17 | **Trạng thái:** Baseline/MVP approved for implementation  
> **Owner:** Product Owner | **Thực thi:** Codex (Backend), Antigravity (Frontend)  
> **Tài liệu liên quan:** `ARCHITECTURE.md`, `DESIGN.md`, `RULES.md`, `TASKS.md`, `PROGRESS.md`

## 1. Tầm nhìn và bài toán

Xây dựng một **Creative Asset Hub** dành riêng cho Windows cursor: người dùng khám phá thư viện, thử cursor trực tiếp ngay trong trình duyệt, phối hợp các trạng thái từ nhiều bộ, biến ảnh cá nhân thành `.cur`, rồi nhận tệp ZIP cài đặt Windows. Luồng lý tưởng: **Discover → Hover-to-Test → Sandbox → Customize → Download → Install → Share**.

**Bài toán hiện tại:** người dùng phải tải file rời, không biết hotspot đúng hay không, thiếu ảnh preview đủ trạng thái, gán con trỏ thủ công trong Control Panel, bộ cursor bị thiếu trạng thái, và link chia sẻ không giữ nguyên bản phối.

**Giá trị khác biệt:**

1. **Gallery Hover-to-Test:** nhìn và thử nhanh con trỏ `pointer` trong thẻ, có cơ chế fallback.
2. **Interactive Sandbox:** môi trường mô phỏng Windows với tám vùng tương tác, chuyển Light/Dark riêng không phụ thuộc theme toàn website.
3. **Photo Studio:** upload ảnh, tách nền trong browser, tạo viền sticker, phóng đại lưới 32/48 và chọn hotspot pixel chính xác; xuất file `.cur` bằng API.
4. **Quick Windows Installer:** ZIP chứa ít nhất 8 `.cur/.ani` tương ứng với 8 vai trò, `Install.inf` khai báo **15 slot Registry truyền thống**; một số vai trò Windows dùng chung file fallback xác định.
5. **Mix & Match:** lưu bản phối 8 vai trò trên localStorage, tạo share code 8–12 ký tự cho cấu hình chỉ tham chiếu tài sản đã xuất bản và kiểm duyệt.

### 1.1 Các tuyên bố phải chính xác

- Browser **không thể tự động sửa Windows Registry**; “1-Click” chỉ là tên thương mại cho **quick-install ZIP**. Hướng dẫn thật: giải nén → bấm phải `Install.inf` → Install (Win 11 có thể chọn Show more options) → chọn scheme trong Mouse Properties nếu chưa áp dụng.
- Tách nền xử lý **trên thiết bị**; khi nhấn **Export CUR**, ảnh PNG đã xử lý được tải lên API convert. Không quảng cáo “toàn bộ Studio không upload ảnh”.
- CSS cursor trên browser không phản ánh hoàn toàn `.ani` gốc; preview động phải dùng sprite/frame overlay nếu trình duyệt không hỗ trợ `.ani` trong CSS.
- Bộ cài 15 slot là baseline; có thể nâng lên 17 slot (`Pin`, `Person`) sau kiểm thử trên các bản Windows 11.
- Thư viện `@imgly/background-removal` mang giấy phép AGPL; việc dùng trong sản phẩm thương mại cần review nghĩa vụ giấy phép và phân phối mã nguồn liên quan trước public launch.
- Không lưu file do người dùng upload làm asset công khai trong MVP. Share link chỉ tham chiếu các asset công khai của hệ thống.

## 2. Đối tượng mục tiêu (Personas)

| Persona | Bối cảnh | Pain points | Nhiệm vụ quan trọng | Kênh tiếp cận |
|---|---|---|---|---|
| P1 — Học sinh/sinh viên yêu cá nhân hóa (16–24) | Thường thay đổi desktop theme | Không biết cài `.cur`, sợ tải file độc, thích thử trước | Xem preview, tải ZIP, chia sẻ TikTok | Shorts, TikTok, Reddit |
| P2 — Designer / creator / VTuber (18–35) | Có PNG/sticker nhân vật riêng | Khó tách nền và đặt hotspot, không biết chuẩn `.cur` | Upload, chỉnh sticker, xuất cursor, lưu phối màu | Figma Community, Discord |
| P3 — Setup enthusiast / game streamer (18–40) | Dùng gear RGB, theme hệ thống | Các trạng thái thiếu đồng bộ, tốn công phối nhiều pack | Mix & Match 8 role, sandbox Light/Dark, chia sẻ preset | YouTube, communities, SEO |

**JTBD:** “Khi muốn làm đẹp desktop, tôi cần thử bộ cursor trước, tạo/chỉnh theo phong cách riêng và cài nhanh mà không phải hiểu Registry.”

## 3. Phạm vi và ưu tiên

| Tính năng | MVP — Phase 1–4 | Growth | Monetization |
|---|---|---|---|
| Danh mục + gallery + search + phân trang | **P0** | SEO landing/trending | Sponsored placement có nhãn |
| Hover-to-Test + 8-role sandbox | **P0** | So sánh A/B pack | — |
| Ảnh / CUR mẫu được seed tự động | **P0** | Curated content pipeline | Premium collection |
| Studio upload 2MB, PNG/JPEG/WebP, resize 32/48, hotspot | **P0** | Batch Studio | AI credit usage |
| Tách nền client-side và sticker stroke | **P0** với license gate | Brush/eraser, undo stack | AI-enhanced generation |
| Export `.cur` chuẩn Windows | **P0** | Multi-size `.cur` | — |
| ZIP + `Install.inf` 15 slot | **P0** | Mở rộng 17 slot, signed helper tùy chọn | — |
| Mix & Match lưu localStorage | **P0** | Account sync | Cloud presets |
| Share code và page preview | **P0** chỉ asset công khai | Social cards / short links | — |
| Quảng cáo / affiliate | Không | Phân tích traffic và placements | Ads + affiliate |
| Gói Pro, rewarded ads, text-to-cursor | Không | Nghiên cứu thanh toán | Sau xác minh pháp lý và entitlement |

**Ngoài phạm vi MVP:** đăng nhập; thanh toán; duyệt/tải `.ani` do người dùng tự tạo; lưu ảnh cá nhân vào R2; tự động thi hành Registry từ website; mã nhúng tùy ý từ user; text-to-image trên server; admin portal đầy đủ; hệ thống user-generated public uploads.

## 4. Chuyến đi của người dùng (User journeys)

### J1 — Duyệt thư viện và cài bộ hoàn chỉnh

1. Vào Gallery, xem category, tìm kiếm theo tên; mặc định `sort=popular`, `page=1`, `limit=12`.
2. Hover hoặc focus vào PackCard: vùng thử nhỏ đổi cursor `pointer`, không đổi cursor toàn document.
3. Mở pack detail → xem toàn bộ 8 roles → mở Sandbox để kiểm tra các vùng.
4. Bấm **Download Windows Pack** → nhận ZIP chứa `Install.inf`, `.cur/.ani`, README.
5. Giải nén, chạy Install qua menu ngữ cảnh, áp dụng scheme trong Mouse Properties nếu cần.
6. Có thể trở lại để thử pack khác hoặc chia sẻ trang pack.

**Điều kiện chấp nhận:** tài sản công bố không có đường dẫn hỏng; file ZIP không thiếu file tham chiếu bởi INF; download count chỉ tăng sau khi tạo thành công gói ZIP.

### J2 — Tạo cursor từ ảnh cá nhân

1. Kéo thả PNG/JPEG/WEBP tối đa 2MB; frontend kiểm tra dung lượng, server kiểm tra bytes thật khi export.
2. Xem ảnh gốc trên canvas, dùng **Remove Background** nếu đủ tài nguyên thiết bị, hoặc bỏ qua.
3. Bật/tắt **Sticker Outline** (1–4px) và chọn màu trắng mặc định.
4. Chọn size 32 hoặc 48, hệ thống **letterbox fit** giữ tỷ lệ/alpha, không cắt tùy tiện.
5. Chọn hotspot trên lưới pixel phóng to, mặc định (0,0) với arrow, tâm với busy/precision.
6. Export: POST ảnh PNG đã xử lý + tọa độ + size → server trả binary `.cur`; frontend cho tải file và có thể test `.cur` bằng URL object tại phiên.

**Điều kiện chấp nhận:** PNG trong suốt không bị tạo nền đen; tọa độ 0 ≤ x,y < size; header `.cur` là `00 00 02 00`; không có remote upload trước nút Export ngoại trừ tải model/WASM (và trừ chức năng lưu/chia sẻ nếu người dùng đồng ý ở tương lai).

### J3 — Tạo bản phối và chia sẻ

1. Vào pack detail hoặc Gallery, chọn **Add to Mix** từng role.
2. MixMatchDock hiển thị 8 ô với trạng thái thiếu/đủ; thao tác thay role không làm mất role khác.
3. Autosave vào `localStorage` có version và timestamp; có Restore Defaults và Clear.
4. Sandbox nhận bản phối hiện tại; khi người dùng nhấn Share, chỉ gửi `pack_id + role_type` có thật.
5. POST share → nhận code 8–12 ký tự và link `/mix/{code}`; GET share tái tạo bản phối.
6. Link hết hạn sẽ trả 410 và đề xuất tạo bản phối mới.

**Điều kiện chấp nhận:** không lưu ảnh hay Base64 nội bộ vào config share; không chấp nhận URL ngoại hệ thống; share URL đọc được mà không cần tài khoản; không ghi đè localStorage trừ khi người dùng chọn **Use this mix**.

## 5. User Stories và Acceptance Criteria

### US-01 — Browse / filter / search
**As** một người muốn thay cursor, **I want** lọc theo category, tìm tên pack và phân trang, **so that** tìm nhanh theme hợp gu.

- **Given** database có published và draft packs, **when** GET `/packs` **then** chỉ published được trả về.
- **Given** category slug không tồn tại, **when** lọc **then** API trả danh sách rỗng (không phát sinh 500).
- **Given** query có ký tự `%`, `_`, dấu tiếng Việt, **when** tìm **then** được escape hoặc bind SQL an toàn, không gây injection.
- **Given** `limit > 48`, **when** request **then** trả 422; category pack_count chỉ đếm published.

### US-02 — Gallery Hover-to-Test
**As** visitor, **I want** hover/focus lên card để thử pointer, **so that** quyết định mở pack.

- **Given** pack có `pointer.preview_png_url` và hotspot, **when** hover **then** dùng `cursor: url("...") X Y, auto` trên `.pack-card__test-area`, không trên toàn page.
- **Given** preview lỗi hoặc browser không hỗ trợ **then** fallback `auto` và card vẫn click bằng bàn phím.
- **Given** thiết bị touch hoặc `prefers-reduced-motion` **then** hiện button **Try in sandbox** thay vì lệ thuộc hover.
- **Given** rời card **then** cursor mặc định được khôi phục.

### US-03 — Interactive Sandbox
**As** visitor, **I want** thử 8 trạng thái trên nền mô phỏng Windows, **so that** phát hiện cursor không tương phản.

- Mỗi khu vực có `data-cursor-role` thuộc đúng enum 8 vai trò: `pointer`, `link`, `text`, `busy`, `working`, `precision`, `unavailable`, `move`.
- Công tắc Light/Dark của sandbox không đổi theme website; đổi nền không reset selected pack/mix.
- Trong các vùng `text`, `link`, `unavailable`, `move`, fallback keyword tương ứng `text`, `pointer`, `not-allowed`, `move`.
- Có labels rõ ràng và thao tác keyboard; với trạng thái animated, preview canvas/CSS animation cung cấp visual fallback nếu native `.ani` không chạy.

### US-04 — Client-side Background Removal
**As** creator, **I want** tách nền ảnh trên browser, **so that** bảo vệ riêng tư và giảm tải xử lý server.

- Tải model khi người dùng chủ động chọn, không tải cùng homepage; hiển thị tải mô hình, processing, lỗi và retry.
- Dùng `@imgly/background-removal` **chỉ sau khi** license gate được Product Owner xác nhận.
- Có fallback **Skip AI**, hiển thị ảnh gốc nếu WASM không khả dụng hoặc hết RAM; không khóa luồng export.
- Không gửi ảnh tới API chỉ vì thao tác remove background.

### US-05 — Sticker Outline / Edit
**As** creator, **I want** viền màu quanh vùng alpha, **so that** cursor nhìn rõ trên nền sáng/tối.

- Viền 1–4px được tạo từ phép nở alpha mask trên canvas, không làm mờ subject.
- Canvas hiển thị checkerboard, giữ RGBA; có Undo một bước hoặc Reset to source.
- Outline có thể tắt trước export; không sửa file gốc.

### US-06 — Hotspot Pixel Grid
**As** creator, **I want** đặt tâm chạm lên từng pixel, **so that** click thật khớp với phần nhìn thấy.

- Chỉ cho chọn `(x,y)` trong `[0,size-1]` với size 32/48.
- Hiển thị lưới pixel, tâm ngắm đỏ, tooltip `(x, y)` và ô nhập số để hỗ trợ keyboard.
- Khi đổi 32 ↔ 48, hotspot được scale theo tỷ lệ rồi clamp; không để hotspot ngoài biên.
- Tọa độ theo bitmap **sau** resize/letterbox, không theo ảnh gốc.

### US-07 — Convert PNG to CUR
**As** creator, **I want** tải file `.cur` thực, **so that** Windows nhận dạng cursor.

- POST multipart chứa `file`, `hotspot_x`, `hotspot_y`, `size`; MIME đầu ra `application/octet-stream`, `Content-Disposition: attachment; filename="custom-cursor.cur"`.
- Server xác nhận Magic Bytes, Pillow decode/verify, giới hạn bytes và pixel, và tạo cursor CUR/BMP-DIB hợp lệ.
- `429` khi vượt 10 request/phút/IP; `413` với >2MB; `415` với định dạng lạ; `422` với hotspot sai.
- Không lưu file nhận được vĩnh viễn; request có log metadata nhưng không log ảnh.

### US-08 — ZIP Installer Packager
**As** người dùng Windows, **I want** tải ZIP có `Install.inf`, **so that** khỏi phải tự gán 15 slot từng cái.

- ZIP build `BytesIO`, không ghi file tạm cho đóng gói; file bên trong có manifest rõ ràng.
- Scheme có 15 mục đúng thứ tự Windows; mọi đường dẫn trong INF trỏ tới file ZIP có thật sau giải nén.
- Pack thiếu một hoặc nhiều role chỉ publish nếu hệ thống có fallback chính thức và policy được chấp nhận; MVP ưu tiên 8 role đầy đủ.
- README chỉ dẫn chính xác thao tác cài; không hứa tự áp dụng theme; không chứa executable/script lạ.

### US-09 — Mix & Match
**As** enthusiast, **I want** kết hợp role từ các packs, **so that** tạo theme của riêng mình.

- Thay từng ô độc lập, có undo hoặc Restore Defaults; không mất config khi reload cùng browser.
- Version schema localStorage; khi migrate lỗi thì backup key cũ và reset an toàn.
- Các role đã chọn trỏ tới published assets, có hiển thị provenance (nguồn pack).

### US-10 — Shareable Mix Link
**As** creator, **I want** gửi URL ngắn, **so that** bạn bè mở đúng preset trong sandbox.

- Code unique 8–12 ký tự Base62 ngẫu nhiên an toàn; xung đột thì retry có giới hạn.
- Validate mỗi phần tử `pack_id`, `role_type`, role khớp item trên DB, source pack là published; cấu hình tối đa 8 lựa chọn.
- Có TTL định trước 90 ngày (cấu hình được), UI nêu expiry; `404` không tồn tại, `410` đã hết hạn.
- Config chỉ gồm tham chiếu tài sản công khai, tuyệt đối không chứa ảnh riêng tư/base64/remote URLs.

## 6. Quy tắc miền dữ liệu (Domain rules)

- **8 product roles:** `pointer`, `link`, `text`, `busy`, `working`, `precision`, `unavailable`, `move`; mỗi pack tối đa 1 item trên mỗi role (`UNIQUE(pack_id,role_type)`).
- **15 Registry slots:** `Arrow`, `Help`, `AppStarting`, `Wait`, `Crosshair`, `IBeam`, `NWPen`, `No`, `SizeNS`, `SizeWE`, `SizeNWSE`, `SizeNESW`, `SizeAll`, `UpArrow`, `Hand`. Chính xác theo thứ tự; slot mở rộng Win 11 `Pin`, `Person` là phase sau.
- **Mapping mặc định:** Arrow→pointer; Help→pointer; AppStarting→working; Wait→busy; Crosshair→precision; IBeam→text; NWPen→pointer; No→unavailable; SizeNS/SizeWE/SizeNWSE/SizeNESW/SizeAll→move; UpArrow→pointer; Hand→link. Dùng một file ở nhiều slot là hợp lệ về mặt tham chiếu; chất lượng hình ảnh có thể khác cursor đặc thù Windows.
- **Visibility:** `draft` không xuất hiện trong public API; `published` phải đủ 8 roles, mỗi preview và file valid.
- **Animations:** `.ani` chỉ áp dụng pack admin cung cấp; Studio MVP chỉ export `.cur` tĩnh; frontend preview động hỗ trợ degradation.
- **Filename:** ASCII slug an toàn, không `..`, slash, backslash, CRLF, ký tự điều khiển; scheme name escape INF string, độ dài hạn chế.
- **Downloads:** only approved packs; chống cache sai đối với endpoint đếm lượt; `download_count` không phải lượt cài thành công.

## 7. Yêu cầu phi chức năng (NFR)

| Thuộc tính | Mục tiêu MVP | Cách kiểm chứng |
|---|---|---|
| Performance | API list/detail P95 < 400ms local seeded; gallery LCP < 2.5s trên mạng thử nghiệm Fast 4G | Lighthouse + request timing (mục tiêu nội bộ, không phải SLA) |
| Reliability | Không mất chức năng gallery khi một preview hỏng; download trả lỗi có cấu trúc nếu asset thiếu | Failure injection |
| Privacy | Ảnh chỉ rời browser khi người dùng nhấn Export; không lưu ảnh sau request; no PII trong analytics | DevTools network + audit logs |
| Security | Upload ≤2MB; decode pixel cap; safe ZIP; rate limit 10/min/IP; CORS allowlist | Automated negative tests |
| Accessibility | WCAG 2.2 AA target; keyboard navigation; labels; focus visible | axe + manual keyboard |
| Compatibility | Chrome/Edge/Firefox desktop mới; file CUR trên Windows 10/11 (kiểm thử VM) | Compatibility matrix |
| Operations | Health checks, logs JSON, nightly backup với restore rehearsal | Dev/staging runbook |
| SEO | SSR không bắt buộc MVP, nhưng title/meta/canonical, sitemap hoặc prerender SEO pages sau | Crawl checklist |
| Legal | Quyền dùng cursor packs; AGPL review; nội dung quảng cáo phân biệt rõ | Release gate |

## 8. Product Analytics và KPIs

**Funnel:** `gallery_view` → `pack_card_test` → `pack_detail_view` → `sandbox_interaction` → `download_click` → `download_success`. Studio funnel: `studio_open` → `image_selected` → `background_removed` (hoặc `skip`) → `hotspot_selected` → `cur_export_success`. Mix funnel: `mix_role_added` → `mix_share_created` → `mix_share_opened`.

**Events:** chỉ ghi `event`, `timestamp`, `anonymous_session_id` luân phiên, `pack_id`/`role_type`, `device_class`, `result`; **không** gửi tên file cá nhân, ảnh, hotspot chứa thông tin nhận dạng, hoặc share config full vào analytics. Hệ thống phải hoạt động khi người dùng từ chối analytics.

| KPI | Cách tính | Target đề xuất 90 ngày sau MVP (giả thuyết, cần hiệu chỉnh theo dữ liệu) |
|---|---|---|
| Activation | Sessions có sandbox test hoặc Studio upload / sessions gallery | ≥25% |
| Download conversion | Unique download successes / unique pack detail viewers | ≥12% |
| Studio export success | Successful CUR / attempted CUR exports | ≥95% (không tính cancel) |
| ZIP validity | Generated ZIP pass manifest/INF validation | 100% |
| Share rate | Successful shares / sessions có >=2 mix roles | ≥15% |
| 7-day returning rate | Anonymous visitors trở lại trong 7 ngày / visitors đủ điều kiện | ≥10% |
| API error rate | 5xx / tất cả API requests | <1% |
| Upload rejection accuracy | Test malformed/oversize rejected đúng status | 100% bộ test |

Không đặt mục tiêu “giảm 90% server” như kết quả đã kiểm chứng; đo bằng tỷ lệ requests không cần backend segmentation và CPU trước/sau.

## 9. Roadmap và exit gates

- **Gate A / Foundation:** Docker dev start được một lệnh, DB tables, seed 5 categories + packs, health và OpenAPI pass.
- **Gate B / Asset Delivery:** CUR writer valid, 15-slot INF đúng, ZIP có thể cài từ Windows VM; không có path injection.
- **Gate C / Experience:** gallery, sandbox, studio, mix, share hoạt động end-to-end; keyboard/empty states đầy đủ.
- **Gate D / Launch:** test suite xanh, security/license review, backups + restore, production domain/TLS/CORS, smoke test thực tế.

**Phụ thuộc then chốt:** tài sản mẫu có quyền sử dụng; review AGPL; browser cursor support; Windows VM kiểm chứng `Install.inf`; R2 access keys và origin CDN đúng domain; giới hạn thiết bị cho WASM.

## 10. Rủi ro và phương án

| Rủi ro | Mức | Giảm thiểu / owner |
|---|---|---|
| AGPL của bộ tách nền xung đột cách phân phối source | Cao | Product Owner chọn tuân thủ AGPL hoặc license thương mại/engine khác trước release |
| `.ani` không hiện trong CSS browser | Cao | Dùng preview webp/gif/video hoặc frame renderer, Windows download vẫn `.ani` |
| INF không tự kích hoạt scheme | Trung bình | Định vị là Quick Install, README theo đúng Windows, không hứa 1 click hoàn toàn |
| 8 product roles chưa đủ 15/17 hình đặc thù | Trung bình | Mapping/fallback minh bạch; mở rộng role model sau MVP |
| Image decompression bomb / ZIP path traversal | Cao | Limit pixel, Magic Bytes + decode, filenames do server sinh |
| R2 outages/costs | Trung bình | Dev local storage, retry có giới hạn, metrics; R2 không miễn phí storage/operations |
| R2 URL trỏ asset độc hại | Cao | Server fetch only trusted bucket/key, không fetch URL từ config user |
| Ads làm giảm UX | Trung bình | Chỉ triển khai sau traffic; không che CTA/hotspot; tuân thủ chính sách nền tảng |

## 11. Definition of Product Done

Chỉ coi MVP “done” khi: 7 REST endpoints có test thành công và lỗi; 5 categories có dữ liệu test; ít nhất 2 published packs 8 roles; ZIP test cả static và `.ani` được cung cấp, có file manifest đúng; Studio tạo được `.cur` 32 và 48; share link mở được trên browser khác; sandbox độc lập Light/Dark; security/cross-origin/license checklist pass; và đã thử cài trên Windows 10/11 (ghi kết quả thực tế thay vì giả định).

**Quy tắc giải quyết mâu thuẫn:** bảo mật và khả năng chạy đúng Windows > API contract trong `ARCHITECTURE.md` > UX chi tiết trong `DESIGN.md` > diễn giải marketing. Mọi thay đổi contract phải cập nhật đồng thời 6 tài liệu trong một PR.
