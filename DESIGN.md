# DESIGN SYSTEM & UI/UX GUIDELINES

## 1. Phong cách Tổng thể (Vibe)
* **Aesthetic:** Sáng tạo, trẻ trung, trực quan (lấy cảm hứng từ Figma Community, Notion và các nền tảng asset sáng tạo).
* **Tương phản cao:** Giao diện chính sạch sẽ, thoáng đãng để làm nổi bật các sticker con trỏ nhiều màu sắc.

## 2. Bảng màu (Color Palette - Tailwind CSS)
* **Nền chính (Background):** `bg-slate-50` (Light) / `bg-slate-950` (Dark).
* **Bề mặt thẻ (Card Surface):** `bg-white` với viền mảnh `border-slate-200`, bo góc lớn `rounded-2xl`, đổ bóng nhẹ `shadow-sm hover:shadow-md`.
* **Màu chủ đạo (Primary Brand):** Indigo / Violet (`indigo-600`, hover `indigo-700`) cho các nút hành động chính (Tải ZIP, Xuất file .CUR).
* **Màu nhấn (Accent):** Pink / Rose (`rose-500`) cho tâm ngắm Hotspot và badge Hot/New; Emerald (`emerald-500`) cho trạng thái sẵn sàng.

## 3. Typography
* **Font chính:** `Plus Jakarta Sans` hoặc `Inter` (Sans-serif hiện đại, hỗ trợ tiếng Việt tốt).
* **Font kỹ thuật (Tọa độ/Mã chia sẻ):** `JetBrains Mono` (Monospace) dùng cho hiển thị tọa độ `X: 4, Y: 2`, kích thước `32x32px`, và `share_code`.

## 4. Đặc tả Các Thành phần (Components) Cốt lõi
1. **`PackCard.tsx` (Thẻ bộ con trỏ):**
   * Hiển thị thumbnail lớn, tên bộ, badge danh mục, số lượt tải, badge `ANI` (nếu là con trỏ động).
   * **Hiệu ứng Hover-to-Test:** Khi hover vào thẻ, viền thẻ sáng lên (`ring-2 ring-indigo-500`), hiện nhãn nhỏ *"Đang dùng thử"* và con trỏ chuột thật biến thành `pointer` của bộ đó.
2. **`InteractiveSandbox.tsx` (Khung giả lập):**
   * Thiết kế giống một cửa sổ ứng dụng mini (có thanh tiêu đề 3 nút macOS/Windows).
   * Nút gạt **Sun / Moon** ở góc trên bên phải để đổi nền riêng bên trong Sandbox giữa Trắng sáng (`#FFFFFF`) và Tối (`#0F172A`) nhằm kiểm tra viền trắng của sticker.
   * Các vùng test bên trong phải rõ ràng: Nút bấm (`link`), ô Input gõ được chữ (`text`), vùng kẻ ô vuông (`precision`), nút vô hiệu hóa (`unavailable`), nút kích hoạt vòng xoay 3 giây (`busy`).
3. **`HotspotGridPicker.tsx` (Lưới chấm điểm click):**
   * Khung vuông tỷ lệ 1:1 phóng to gấp 8–10 lần (ví dụ lưới 32x32 hiển thị ở kích thước 320x320px).
   * Nền caro xám-trắng (checkerboard) để nhìn rõ vùng trong suốt của ảnh PNG.
   * Kẻ lưới pixel mảnh `1px`, ô được chọn tô viền đỏ và dấu thập tâm ngắm.
4. **`MixMatchDock.tsx` (Thanh công cụ nổi đáy màn hình):**
   * Dạng viên thuốc (Floating Pill) cố định ở dưới màn hình (`fixed bottom-6`), hiển thị các ô slot nhỏ chứa icon đã chọn từ các bộ khác nhau kèm nút "Xem thử" và "Chia sẻ".