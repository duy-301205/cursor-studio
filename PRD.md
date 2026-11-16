# PRODUCT REQUIREMENTS DOCUMENT (PRD)
**Tên dự án:** Custom Cursor Studio & Library
**Phiên bản:** 1.0 (MVP to Scale)
**Kiến trúc triển khai:** Docker-First Backend + Decoupled SPA Frontend

## 1. Tổng quan & Mục tiêu
Xây dựng nền tảng web cho phép người dùng tìm kiếm, dùng thử trực tiếp trên trình duyệt, tự sáng tạo bằng ảnh cá nhân/AI và tải về các bộ con trỏ chuột Windows (`.cur` tĩnh và `.ani` động) kèm cơ chế cài đặt nhanh 1-click.

## 2. Đối tượng Người dùng Mục tiêu
* Giới trẻ, học sinh/sinh viên, nhân viên văn phòng yêu thích cá nhân hóa giao diện máy tính và trang trí góc làm việc (Desk Setup).
* Người dùng mạng xã hội (TikTok, YouTube Shorts) thích chia sẻ các tùy biến máy tính độc đáo, dễ viral.
* Người dùng phổ thông không rành kỹ thuật, gặp khó khăn khi phải gán thủ công từng trạng thái chuột trong Windows Control Panel.

## 3. Tính năng Cốt lõi & Lộ trình (Scope)
### Giai đoạn 1: MVP (Core Product - Ưu tiên hiện tại)
1. **Thư viện & Tìm kiếm (Gallery):** Lọc theo danh mục (Anime, Cute, Minimal, Pixel, Meme), tìm kiếm từ khóa, sắp xếp (Phổ biến, Mới nhất). Tính năng **Hover-to-Test** đổi con trỏ ngay khi di chuột vào thẻ sản phẩm.
2. **Interactive Sandbox:** Màn hình giả lập Windows thu nhỏ trên trình duyệt, chuyển đổi độc lập Light/Dark Mode, kiểm tra đầy đủ các trạng thái con trỏ (`pointer`, `link`, `text`, `busy`, `precision`, `unavailable`, `move`).
3. **1-Click Windows Installer Packager:** Tự động sinh file `Install.inf` chuẩn Windows Registry, nén cùng các file `.cur`/`.ani` trên RAM và trả về file `.zip`.

### Giai đoạn 2: Tăng trưởng & Viral (Growth)
4. **Photo-to-Sticker Studio:** Upload ảnh cá nhân $\rightarrow$ Tách nền ngay trên trình duyệt (`@imgly/background-removal`) $\rightarrow$ Thêm viền trắng sticker trên Canvas $\rightarrow$ Chọn điểm chạm (Hotspot X, Y) trên lưới pixel 32x32 hoặc 48x48 $\rightarrow$ Xuất file `.cur`.
5. **Mix & Match + Share Link:** Phối hợp từng icon trạng thái từ các bộ khác nhau (lưu `localStorage`) và tạo mã chia sẻ ngắn (`share_code`) lưu trên DB để chia sẻ link dùng thử.

### Giai đoạn 3: Mở rộng & Kiếm tiền (Monetization)
6. **Text-to-Cursor AI:** Tạo sticker con trỏ từ câu lệnh (Prompt) qua API AI (giới hạn lượt miễn phí/ngày).
7. **Affiliate & Freemium:** Gợi ý phụ kiện Desk Setup theo chủ đề bộ con trỏ và mở khóa bộ `is_premium`.