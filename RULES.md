# CODING RULES & GUARDRAILS FOR AI AGENTS

## 1. Quy tắc Chung & Môi trường
* **Docker-First Backend:** Backend chạy trong Docker (`docker-compose.dev.yml`) ở port `8000`. Không yêu cầu người dùng cài Python hay MySQL trực tiếp lên máy host.
* **Đồng bộ Schema:** Mọi thay đổi ở Pydantic Schema (Backend) phải được cập nhật tương ứng vào `frontend/src/types/cursor.ts`.
* **Xử lý lỗi rõ ràng:** Backend luôn trả về HTTP status code chuẩn kèm JSON `{"detail": "Thông báo lỗi dễ hiểu"}`. Frontend phải bắt lỗi và hiển thị Toast/Alert thân thiện, không để crash trắng trang.

## 2. Quy tắc Kỹ thuật Bắt buộc (Technical Must-Haves)
* **CSS Cursor Fallback:** Mọi thuộc tính CSS `cursor: url(...)` trên Frontend BẮT BUỘC phải kèm tọa độ Hotspot và từ khóa dự phòng ở cuối. Ví dụ: `cursor: url('...') 4 2, auto;`.
* **Giới hạn kích thước trình duyệt:** Ảnh dùng làm CSS `cursor` trên trình duyệt không được vượt quá `128x128px` (chuẩn dùng `32x32` hoặc `48x48`).
* **Windows `Install.inf` 15 Slots:** Khi sinh file `Install.inf`, chuỗi giá trị trong `[Scheme.Reg]` BẮT BUỘC phải có đủ 15 vị trí phân cách bởi dấu phẩy theo đúng thứ tự của Windows Registry (`Pointer, Help, Work, Busy, Cross, Text, Hand, Unavailiable, Vert, Horz, Dgn1, Dgn2, Move, Alternate, Link`).
* **Bảo mật Upload:** Endpoint `/api/v1/studio/convert` phải kiểm tra Magic Bytes thực tế của file (chỉ cho phép PNG, JPEG, WEBP), giới hạn tối đa `2MB`, và ép giá trị `hotspot_x`, `hotspot_y` nằm trong khoảng `[0, size - 1]`.

## 3. Những Điều AI Tuyệt Đối KHÔNG Được Làm (Strict Prohibitions)
* **KHÔNG** lưu file `.zip` tạm ra ổ cứng server khi người dùng tải về; bắt buộc nén và stream trực tiếp trên RAM bằng `io.BytesIO`.
* **KHÔNG** gửi ảnh gốc nặng hàng MB lên Backend để tách nền; việc tách nền AI (`@imgly/background-removal`) và vẽ viền sticker phải thực hiện 100% ở Frontend Canvas.
* **KHÔNG** hardcode URL `http://localhost:8000` rải rác trong các component React; phải tập trung qua biến môi trường `import.meta.env.VITE_API_BASE_URL` trong `src/services/api.ts`.
* **KHÔNG** tự ý xóa hoặc sửa đổi cấu trúc 4 bảng MySQL cốt lõi nếu không có yêu cầu.