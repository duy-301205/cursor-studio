# DESIGN.md — UI/UX Design System & Component Specifications

> **Version:** 1.0 | **Date:** 2026-11-17 | **UI owner:** Antigravity  
> **Design direction:** Modern Creative Asset Hub, tham khảo tính rõ ràng của Figma Community, không sao chép logo, artwork hay giao diện thương hiệu.

## 1. Tính cách sản phẩm và nguyên tắc UX

Sản phẩm mang cảm giác **creative / playful / precise / trustworthy**. Giao diện là một kho tài sản thiết kế hiện đại: tấm card lớn, preview chất lượng cao, trắng thoáng trên Light Mode, lớp nền sâu trên Dark Mode, nhấn brand violet, typography sắc nét. Tài sản cursor là nhân vật chính; hiệu ứng động trang trí không được làm giảm khả năng thử pointer, tương phản hoặc tốc độ tải.

**Nguyên tắc:**

1. **Try before download:** link truy cập Sandbox/Live preview không bị che bởi CTA.
2. **Honest interaction:** không gọi download là “installed”; không giả lập browser có quyền đổi cursor hệ điều hành.
3. **Personal photo is private until export:** ghi thông báo ngay trong Studio; không trích xuất ảnh vào analytics.
4. **Keyboard-first:** tương tác hover phải có focus/click fallback; mọi control có nhãn.
5. **Independence:** site Light/Dark và sandbox Light/Dark là **hai trạng thái độc lập**.
6. **Degrade gracefully:** màn hình nhỏ, touch, WASM thất bại, custom cursor browser không hỗ trợ vẫn dùng chức năng lõi.
7. **One clear primary action per area:** Gallery → Explore; Pack Detail → Download; Studio → Export CUR; Mix → Share.

## 2. Design Tokens

### 2.1 Color foundations — hex và Tailwind semantic names

| Token | Tailwind alias | Light | Dark | Mục đích |
|---|---|---|---|---|
| Canvas | `bg-canvas` | `#F7F8FC` | `#0D1020` | nền page |
| Surface | `bg-surface` | `#FFFFFF` | `#171B2E` | card, header |
| Raised | `bg-raised` | `#F0F3FA` | `#22283E` | hover, secondary blocks |
| Overlay | `bg-overlay` | `#FFFFFF` | `#242A43` | popover/modal |
| Text primary | `text-ink` | `#171A2B` | `#F4F6FF` | body, heading |
| Text secondary | `text-muted` | `#647084` | `#A6B2CA` | metadata |
| Border | `border-line` | `#E3E8F2` | `#343C58` | outlines |
| Brand | `bg-brand` | `#6D5EF8` | `#9B8EFF` | CTA, selected |
| Brand hover | `bg-brand-hover` | `#5546D9` | `#B5AAFF` | feedback |
| Brand subtle | `bg-brand-soft` | `#EEEAFE` | `#292449` | chips |
| Accent mint | `text-accent` | `#0A897D` | `#43D7C6` | creative details |
| Success | `text-success` | `#117A56` | `#53D2A1` | completed / exported |
| Warning | `text-warning` | `#A56710` | `#FFCA74` | nonblocking issue |
| Error | `text-danger` | `#CA3C55` | `#FF7D96` | errors |
| Focus ring | `ring-focus` | `#6054EC` | `#B3A9FF` | keyboard accessibility |
| Checker light | `--checker-a` | `#FFFFFF` | `#2A304A` | transparent preview |
| Checker dark | `--checker-b` | `#E2E6EF` | `#39425C` | transparent preview |

**Contrast policy:** verify WCAG AA (body >=4.5:1, large text >=3:1, meaningful icon borders >=3:1). Các cặp `brand`/white hoặc warning không được giả định đạt AA nếu chưa test; thay màu text khi cần mà không đổi semantic.

### 2.2 Token CSS example

```css
/* frontend/src/styles/tokens.css */
:root {
  color-scheme: light;
  --color-canvas: #F7F8FC;
  --color-surface: #FFFFFF;
  --color-raised: #F0F3FA;
  --color-overlay: #FFFFFF;
  --color-ink: #171A2B;
  --color-muted: #647084;
  --color-line: #E3E8F2;
  --color-brand: #6D5EF8;
  --color-brand-hover: #5546D9;
  --color-brand-soft: #EEEAFE;
  --color-accent: #0A897D;
  --color-success: #117A56;
  --color-warning: #A56710;
  --color-danger: #CA3C55;
  --color-focus: #6054EC;
  --checker-a: #FFFFFF;
  --checker-b: #E2E6EF;
}
[data-theme="dark"] {
  color-scheme: dark;
  --color-canvas: #0D1020;
  --color-surface: #171B2E;
  --color-raised: #22283E;
  --color-overlay: #242A43;
  --color-ink: #F4F6FF;
  --color-muted: #A6B2CA;
  --color-line: #343C58;
  --color-brand: #9B8EFF;
  --color-brand-hover: #B5AAFF;
  --color-brand-soft: #292449;
  --color-accent: #43D7C6;
  --color-success: #53D2A1;
  --color-warning: #FFCA74;
  --color-danger: #FF7D96;
  --color-focus: #B3A9FF;
  --checker-a: #2A304A;
  --checker-b: #39425C;
}
```

```ts
// frontend/tailwind.config.ts — excerpt
import type { Config } from 'tailwindcss';
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        canvas: 'var(--color-canvas)', surface: 'var(--color-surface)',
        raised: 'var(--color-raised)', overlay: 'var(--color-overlay)',
        ink: 'var(--color-ink)', muted: 'var(--color-muted)',
        line: 'var(--color-line)', brand: 'var(--color-brand)',
        'brand-hover': 'var(--color-brand-hover)',
        'brand-soft': 'var(--color-brand-soft)', accent: 'var(--color-accent)',
        success: 'var(--color-success)', warning: 'var(--color-warning)',
        danger: 'var(--color-danger)', focus: 'var(--color-focus)',
      },
      fontFamily: {
        sans: ['Plus Jakarta Sans', 'ui-sans-serif', 'system-ui'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      borderRadius: { card: '1.25rem', pill: '9999px' },
      boxShadow: {
        card: '0 10px 30px rgba(18, 24, 48, 0.06)',
        float: '0 18px 50px rgba(13, 16, 32, 0.20)',
      },
    },
  },
  plugins: [],
} satisfies Config;
```

**Typography assets:** dùng Google Fonts hoặc self-host nếu được phép; `font-display: swap`. Không để webfont block layout. Thử font Vietnamese accent trên thiết bị Windows/Android.

### 2.3 Typography, spacing, motion

| Element | Font | Desktop / mobile | Weight / line height |
|---|---|---|---|
| Hero H1 | Plus Jakarta Sans | 48 / 32 px | 800 / 1.15 |
| Page H2 | Plus Jakarta Sans | 32 / 26 px | 700 / 1.25 |
| Section H3 | Plus Jakarta Sans | 24 / 21 px | 700 / 1.3 |
| Card title | Plus Jakarta Sans | 18 / 17 px | 700 / 1.35 |
| Body | Plus Jakarta Sans | 16 / 15 px | 400–500 / 1.6 |
| Caption | Plus Jakarta Sans | 13 px | 500 / 1.4 |
| Code/coordinates | JetBrains Mono | 13–14 px | 500 / 1.5 |

- **Spacing:** hệ 4px; `4/8/12/16/24/32/48/64/96`.
- **Container:** max-width 1280px; page horizontal padding 24 desktop, 16 mobile.
- **Card:** border 1px, radius 20px, padding 16–20px.
- **Buttons:** height 44–48px; hit area tối thiểu 44×44; icon size 18–20.
- **Motion:** hover transform `translateY(-3px)` 160ms; modal 180ms; toast 220ms; easing `cubic-bezier(.2,.8,.2,1)`; `prefers-reduced-motion: reduce` tắt chuyển động không thiết yếu.
- **Shadows:** cards nhẹ; floating dock có shadow rõ hơn; dark tránh shadow quá đen, dùng border.
- **Z-index:** header 20, sticky controls 25, MixDock 30, dropdown 40, dialog 60, toast 70.

## 3. Layout và Responsive

| Breakpoint | Width | Gallery columns | Sandbox | Studio | MixDock |
|---|---|---|---|---|---|
| Mobile | <640px | 2 nếu card đủ 150px, nếu không 1 | 1 column | Canvas trên, controls dưới | sheet cuộn ngang, không che CTA |
| Tablet | 640–1023px | 2–3 | 2 zones/row | 2 cols tùy rộng | horizontal bottom dock |
| Desktop | 1024–1439px | 3–4 | 2–4 zones/row | 60% canvas / 40% controls | bottom floating 8 slots |
| Wide | >=1440px | 4–5 max 1280 container | 4 zones/row | max 1280 | fixed max-width 1100 |

### 3.1 Page hierarchy / route map

```text
/                     -> Landing / featured / CTA
/packs                -> Gallery category + q + sort + pagination
/packs/:slug          -> Pack detail / 8 preview roles / sandbox / download
/studio               -> Photo Studio / alpha, outline, hotspot, export
/mix                  -> Mix draft / optional dock expanded + sandbox
/mix/:code            -> Shared read-only preset + "Use this mix"
/about-install        -> Honest Windows install guide + FAQ
/*                    -> 404 / go back Gallery
```

Header cố định nhẹ (không gây scroll-jank): logo bên trái, links Gallery, Studio, Mix; search mở ở Gallery; theme toggle góc phải. Footer có quyền sử dụng assets, hướng dẫn cài đặt, privacy, licenses.

### 3.2 Gallery wireframe

```text
+--------------------------------------------------------------------------------+
| LOGO     Explore     Studio     Mix                          Search  Theme [●]  |
+--------------------------------------------------------------------------------+
| Discover cursors that feel like you                                            |
| Try before you install.                         [Create from an image]          |
+--------------------------------------------------------------------------------+
| Category chips: [All] [Minimal] [Cute] [Gaming] [Anime] [Cyber]                 |
| Search [__________________________________] Sort [Most popular v]              |
| +-------------------+ +-------------------+ +-------------------+              |
| | large pointer     | | large pointer     | | large pointer     |              |
| | preview checker   | | preview checker   | | preview checker   |              |
| | Crystal White     | | Pastel Pink       | | Neon Cursor       |              |
| | Static  / 1.5k DL | | Animated / 2k DL | | Static / 600 DL   |              |
| | [Try] [View pack] | | [Try] [View pack] | | [Try] [View pack] |              |
| +-------------------+ +-------------------+ +-------------------+              |
|                           [Previous] 1 2 3 [Next]                             |
+--------------------------------------------------------------------------------+
```

**URL is state:** `/packs?category=minimal&sort=newest&q=white&page=2`. Back/Forward restore filters; debounce search 250ms; cancel stale request via AbortController; no flickering card order.

## 4. Component specifications

### 4.1 `PackCard` — Hover-to-Test

**Props:**

```ts
type CursorRole = 'pointer' | 'link' | 'text' | 'busy' |
  'working' | 'precision' | 'unavailable' | 'move';
type CursorPreview = {
  role_type: CursorRole;
  preview_png_url: string;
  cursor_file_url: string;
  hotspot_x: number;
  hotspot_y: number;
};
type PackCardProps = {
  id: number; title: string; slug: string; thumbnailUrl: string;
  pointer: CursorPreview; downloadCount: number;
  isAnimated: boolean; isPremium: boolean;
  onTry?: (packId: number) => void;
};
```

**Behavior states:**

| Event | State | UI effect | A11y |
|---|---|---|---|
| Mouse enters preview | hovering | preview zone uses custom pointer + subtle elevated border | label “Try cursor” |
| Mouse leaves | idle | cursor removed from zone only | — |
| Focus Try button | focused | focus ring, sets cursor in test area or opens sandbox | `aria-label` |
| Pointer asset broken | fallback | native `auto`, show placeholder thumbnail | no blocking |
| Touch tap | preview action | open mini sandbox/details | never depend on hover |
| Add to Mix | selected | short toast `Added pointer to Mix` | live region polite |

**Do not apply `cursor` to `<body>` globally**, because inaccessible buttons/loading states may occur. Hover effect may animate card position but **not** pointer itself.

### 4.2 `InteractiveSandbox` — 8 isolated cursor zones

**Props:** `rolePreviews: Partial<Record<CursorRole, CursorPreview>>`, `initialMode?: 'light'|'dark'`, `onRoleInspect?`.

**Independent theme state:** `const [sandboxMode,setSandboxMode] = useState<'light'|'dark'>('light')`; website theme state belongs to separate provider. Sandbox uses `data-sandbox-theme`; do not modify root `data-theme` when toggled.

**Zones:**

| Role | DOM test zone | Native keyword fallback | Demo hành vi |
|---|---|---|---|
| pointer | `[data-cursor-role="pointer"]` | `auto` | Windows desktop folder |
| link | `[data-cursor-role="link"]` | `pointer` | clickable “Open folder” |
| text | `[data-cursor-role="text"]` | `text` | editable text input |
| busy | `[data-cursor-role="busy"]` | `wait` | spinner mock area |
| working | `[data-cursor-role="working"]` | `progress` | background task / progress bar |
| precision | `[data-cursor-role="precision"]` | `crosshair` | positioning target |
| unavailable | `[data-cursor-role="unavailable"]` | `not-allowed` | disabled action area |
| move | `[data-cursor-role="move"]` | `move` | draggable-looking tile (actual drag optional) |

**Implementation CSS contract:**

```css
/* Tất cả custom cursor cần keyword fallback cuối cùng */
.preview-zone[data-cursor-role="pointer"] {
  cursor: url("/assets/pointer.png") 0 0, auto;
}
.preview-zone[data-cursor-role="link"] {
  cursor: url("/assets/link.png") 4 1, pointer;
}
.preview-zone[data-cursor-role="text"] {
  cursor: url("/assets/text.png") 16 16, text;
}
.preview-zone[data-cursor-role="busy"] {
  cursor: url("/assets/busy.png") 16 16, wait;
}
```

**Dynamic behavior:** style từng zone từ `rolePreviews[role]`, không hardcode asset URL. Validate same-site/trusted CDN URL trước khi đưa vào CSS; clamp `hotspot` theo kích thước ảnh thực. Browser thường giới hạn kích thước custom cursor khoảng **128×128px** và có khác biệt giữa trình duyệt; preview chuẩn 32/48, **không** dùng Canvas zoom 512px làm cursor CSS. `.ani` không chắc hiển thị chuyển động; dùng static PNG pointer trong CSS và đặt preview animation riêng trong card nếu asset có animated web preview. <https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/cursor>

**Empty and error:** thiếu role thì show icon fallback native và chip “Default”; hiện thông báo nếu asset unavailable, không tạo khoảng trống. Switch Sandbox Light/Dark cần làm đổi contrast của mock Windows UI (titlebar, taskbar, desktop), **không** đổi màu của cursors.

### 4.3 `StudioUploadZone`

- Giao diện dropzone dashed border + button `Choose image`; accept `image/png,image/jpeg,image/webp` nhưng **server kiểm tra Magic Bytes**, không tin `accept`.
- Frontend reject >2MiB trước đọc; render format/size, chiều rộng×cao sau decode; reject ảnh quá lớn về pixel trước gọi WASM (mục tiêu <=12MP).
- `URL.createObjectURL` phải revoke khi ảnh mới hoặc unmount; không nhúng Base64 lớn vào state/localStorage.
- Ảnh lỗi thì giữ khả năng chọn lại; status `idle → loading-image → ready → processing → ready|error`.
- Privacy copy: “Ảnh chỉ được gửi lên máy chủ khi bạn chọn Export .cur. Tách nền xử lý trên thiết bị của bạn.”

### 4.4 `StudioCanvas` và StickerOutline

**Pipeline không phá ảnh gốc:**

```text
Blob source -> HTMLImageElement/ImageBitmap
    -> optional cutout mask (WASM)
    -> composited RGBA in working Canvas
    -> alpha dilation outline (white default, thickness 1..4px)
    -> contain-fit raster 32/48 RGBA
    -> HotspotGridPicker + PNG Blob for POST
```

Viền sticker phải bao quanh silhouette theo alpha, không phải `box-shadow` quanh hình chữ nhật. Thuật toán mẫu:

1. Đọc `ImageData` RGBA từ bản cutout, sao chép alpha `A`.
2. Với bán kính `r ∈ [1,4]`, tạo alpha nở `A_dilated(x,y)=max(A(x+dx,y+dy))` trên neighborhood hình tròn bán kính r.
3. Render màu viền với alpha `max(0, A_dilated−A)` vào canvas phía dưới subject.
4. Composite subject gốc lên trên (source-over), vẫn giữ alpha mềm.
5. Tạo output size 32/48 trên canvas mới (device pixel ratio không được làm tăng **kích thước binary** file).

Viền 1px ở output 32 dễ gây méo; trong UI nên cho chọn viền theo final output pixel. Với xử lý trên large canvas, scale radius tương ứng hoặc làm viền sau khi downsample.

### 4.5 `HotspotGridPicker` — checkerboard + pixel crosshair đỏ

**Props:**

```ts
type HotspotGridPickerProps = {
  size: 32 | 48;
  imageDataUrl?: string;           // preview PNG 32/48 only; object URL preferred
  x: number; y: number;
  onChange: (point: {x: number; y: number}) => void;
  disabled?: boolean;
};
```

**Visual:** checkerboard 8×8 CSS px squares, 32×32 hoặc 48×48 logical pixels hiển thị trên vùng 384×384px desktop (mobile min 256px). Pixel art dùng `image-rendering: pixelated`, lưới rất mỏng 1px, dấu thập đỏ `#EF4444` 2 nét ±7px và ô pixel đang chọn có outline đỏ. Hiển thị `X: 0` `Y: 0` bằng JetBrains Mono.

**Coordinate mapping:**

```ts
function pointFromPointer(
  clientX: number, clientY: number, rect: DOMRect, size: 32 | 48
): { x: number; y: number } {
  const x = Math.min(size - 1, Math.max(0,
    Math.floor((clientX - rect.left) * size / rect.width)));
  const y = Math.min(size - 1, Math.max(0,
    Math.floor((clientY - rect.top) * size / rect.height)));
  return {x, y};
}
```

**Critical:** `rect` phải là hình vuông chứa ảnh thực, không phải wrapper với padding/border; `clientX,Y` chịu CSS transform/layout đúng; `getBoundingClientRect()` được gọi tại click; nếu browser zoom, DPR không ảnh hưởng đến tọa độ logical. Ở màn hình 48×48, (47,47) luôn chọn được.

**Accessible:** lưới có `role="grid"` hoặc nhóm điều khiển có tên “Hotspot picker”; keyboard arrow keys di chuyển 1 pixel, Shift+Arrow di chuyển 5, Home `(0,y)`, End `(size-1,y)`, focus ring visible. Hai `<input type="number">` X/Y là đường dự phòng bắt buộc; thông báo `aria-live="polite"` giới hạn tần suất.

**Change size:** chuyển `(x,y)` từ size cũ sang mới bằng `round(x * (newSize - 1)/(oldSize - 1))` rồi clamp; không đảo trục, không chuyển hotspot relative to displayed transparent padding.

### 4.6 `StudioActions` / Export flow

- Primary CTA: `Export Windows .cur`; secondary: `Reset`, `Preview in Sandbox` (dùng image preview).
- Disabled khi chưa có ảnh, đang AI processing, đang request export, hoặc tọa độ invalid.
- Nút Export có spinner và trạng thái `Creating .cur…`; nếu lỗi `429` hiện retry guidance, không tự gửi lại vô hạn.
- Thành công: tự tải Blob, toast “Cursor .cur đã sẵn sàng”; browser có thể yêu cầu tương tác tải xuống.
- Hiển thị form metadata `32×32`, hotspot `(x,y)`, “Single static cursor”. Không giả vờ `.ani` được tạo từ ảnh tĩnh.

### 4.7 `MixMatchDock` — floating bottom dock

**Props:** `mix: MixConfigV1`, `onAssign`, `onClear`, `onShare`, `onOpen`.

**Desktop:** fixed bottom 20px, center width min(1100px, viewport−32), surface semi-opaque blur nhẹ, 8 draggable/selectable slots theo thứ tự product roles, một CTA `Share Mix`. Slot state: empty (dotted), active (icon preview 32px + role), broken (warning + replace).

**Mobile:** bottom sheet collapsed cao 64px hiển thị `X/8 selected` và “Expand”; expanded vùng nội dung cuộn ngang 8 slots, không che controls hoặc nút Export. `safe-area-inset-bottom` được tính, CTA lớn có hit area.

**Micro-interactions:**

- Add item: slot glow violet 300ms; toast không spam.
- Replace item: previous item fade 100ms, new thumbnail 160ms.
- Clear: confirmation khi có >0 items; `Clear all` không xóa site preferences.
- Share: disabled nếu 0 role; loading rồi copy URL, thông báo expiry 90 ngày.
- “Open Sandbox” cập nhật trực tiếp role mapping; preview không bị reset khi thay site theme.

**Persistence:** localStorage key `ccs.mix.v1`, object `{version:1,roles:{...},updatedAt:ISO}`; `updatedAt` không gửi lên POST share. Dữ liệu corrupt => fallback clean, log warning, không crash app.

### 4.8 `PackDetailPage`

Header: breadcrumb → hero preview 240–360px checkerboard → title, category, static/animated badge, count → actions `Download ZIP` primary, `Try in Sandbox`, `Add Roles to Mix`. Dưới hero: tab `All Cursor States` với 8 role cards, sandbox demo, 3-step installation instructions, related packs. Khi 8 role thiếu ở data, show state integrity warning thay vì nút tải hỏng.

**Download copy:** “Tải ZIP (gồm Install.inf)” và subtitle “Giải nén, cài từ menu chuột phải, chọn theme trong Mouse Properties nếu cần.” Không nói “nhấn một nút là cài trực tiếp”.

### 4.9 `MixPage` / Shared Mix

- `/mix`: các role lựa chọn bằng danh sách sources. Nếu localStorage trống: empty state + link Gallery.
- `/mix/:code`: read-only preview, tên mix, expiry, source pack titles, button `Use this mix` + `Copy link`.
- Không ghi đè local draft khi chỉ truy cập link; nếu overwrite, confirm nếu draft hiện tại không rỗng.
- `410`: “Link đã hết hạn hoặc asset không còn khả dụng” + quay về Gallery. `404`: “Không tìm thấy bản phối.”

## 5. Interaction protocol và trạng thái toàn trang

### 5.1 HTTP client states

| State | UI | Retry behavior |
|---|---|---|
| Idle | default UI | — |
| Loading | skeleton match card dimensions, aria-busy | request cancellable |
| Success | content + counts | data refresh khi filter đổi |
| Empty | icon + heading + “Clear filters” | không mô tả là lỗi |
| 404 | friendly missing resource | go Gallery |
| 410 | expired share | remix/return |
| 413/415/422 | inline form error on relevant control | sửa input |
| 429 | toast `Too many attempts`; countdown nếu Retry-After | không retry auto spam |
| >=500 / offline | non-destructive error + Retry | exponential backoff cho GET only |

Không để `isLoading` đơn lẻ lẫn `isError` mâu thuẫn; dùng typed discriminated state hoặc TanStack Query với error handling thống nhất.

### 5.2 Loading, transitions, feedback

- Skeleton cards giữ tỷ lệ thumbnail 4:3, shimmer disabled theo reduced motion.
- Toast hiển thị 4s, dừng khi focus/hover; announcement `role=status`, không chiếm focus.
- Modal dialog trap focus đúng; ESC đóng, backdrop click tùy action destructive.
- Link download luôn có trạng thái thật; `Content-Disposition` server quyết định tên file, client không tự thay đổi file binary.
- Thông báo quyền ảnh riêng tư trong Studio; `background-removal` chỉ lazy-load theo user action (network tải model có thể lớn).

## 6. Accessibility, security, performance

### 6.1 Accessibility checks

- Heading order H1→H2→H3; không thay icon bằng duy nhất màu.
- Touch target min 44×44; focus visible với ring 2px + offset 2px.
- Screenreader label cho 8 roles, vùng preview, theme toggles, hotspot X/Y.
- Keyboard: Tab qua Gallery, mở card Enter, Sandbox zones có interactive children, picker arrow keys, mix dock accessible reorder/select.
- `prefers-reduced-motion`: tắt fly/float, giữ animation chức năng tối thiểu; không bắt buộc xem cursor động.
- Contrast audit tự động + manual hai theme. Không làm giả `disabled` nếu vẫn kích hoạt được.

### 6.2 Secure rendering

- Text title/description render text nodes; không `dangerouslySetInnerHTML` từ API.
- Không inject user string vào `style.cursor` chưa sanitize; chỉ dùng `preview_png_url` từ trusted API + allowlisted origins.
- Không dùng Data URL/SVG do user upload làm executable preview. Canvas decode bitmap rồi export PNG; File API vẫn kiểm tra lại.
- Không lưu ảnh user, blob, Base64 trong localStorage. Revocation object URLs và AbortController khi unmount.

### 6.3 Browser compatibility and performance

- Chrome/Edge/Firefox desktop evergreen; Safari desktop as best effort, test CSS cursor formats riêng.
- Browser cursor images thiết kế 32/48 px; không giả định custom cursor >128 px hoạt động.
- Gallery images lazy loaded, sizes specified để tránh CLS. Studio code split route; WASM lazy load sau click; preload only hero assets.
- CORS phải hỗ trợ các canvas read operations nếu nguồn ảnh từ CDN; không bắt user cài extension.

## 7. Component Definition of Done

Mỗi component phải có: typed props không `any`; screenshot ở Light/Dark; desktop/mobile; keyboard focus; loading/empty/error; test interaction; không có console warnings; network assets từ API; không có mock hardcode sau khi backend ready. Các chức năng có animation hoặc custom cursor phải kiểm thử bằng browser thật, không chỉ unit tests JSDOM.

## 8. Design QA acceptance checklist

- [ ] Typography Plus Jakarta Sans, JetBrains Mono tải hoặc fallback hợp lệ.
- [ ] Light/Dark token được áp dụng tất cả layout; contrast kiểm chứng AA.
- [ ] Sandbox Light/Dark độc lập site theme và không reset 8 preview.
- [ ] `PackCard` hover/focus test hoạt động, touch fallback có CTA.
- [ ] 8 `data-cursor-role` hiển thị fallback đúng, no global body cursor override.
- [ ] Studio upload PNG/JPEG/WEBP, lỗi >2MB được xử lý trước upload.
- [ ] Alpha checkerboard / outline / 32×32 và 48×48 render chính xác.
- [ ] Hotspot lưới click góc cuối `(31,31)` và `(47,47)` chính xác; keyboard X/Y hợp lệ.
- [ ] Studio đang request không double-submit; URL blob revoke sau dùng.
- [ ] Mix local draft persist qua reload; share preview read-only.
- [ ] Error 404/410/413/415/422/429/500 có message dễ hiểu.
- [ ] Mobile dock không che footer/CTA, hỗ trợ safe-area.
- [ ] Animated preview không giả mạo là browser `.ani` native support.

**Visual delivery:** Antigravity tạo layout theo spec trước; mọi ý định đổi token, layout hoặc tương tác lớn phải lập đề xuất ngắn trong `PROGRESS.md` rồi chờ Product Owner/contract review nếu làm thay đổi user stories.
