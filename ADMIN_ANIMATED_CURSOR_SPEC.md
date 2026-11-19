# Admin pack hỗ trợ con trỏ tĩnh và động

**Trạng thái:** Đề xuất kỹ thuật, chờ duyệt thay đổi hợp đồng Admin và điều kiện phát hành.  
**Mục tiêu:** Admin có thể chọn định dạng theo từng vai trò. Một pack có thể dùng `pointer.cur`, `link.cur` và `busy.ani` cùng lúc. Windows phát chuyển động sau khi người dùng cài và áp dụng scheme. [Microsoft Learn — About Cursors](https://learn.microsoft.com/windows/win32/menurc/about-cursors)

## 1. Phạm vi bản đầu

- Giữ 8 vai trò hiện có và quy trình Draft → Validate → Publish. Mỗi vai trò gắn một file con trỏ và một ảnh preview PNG. Thumbnail của pack dùng luồng hiện tại.
- **Tĩnh (.cur)** là mặc định cho vai trò mới. Tiếp tục tải PNG, chọn hotspot, tạo hoặc tải CUR, rồi lưu.
- **Động (.ani)** nhận một file ANI đã chuẩn bị sẵn và một PNG đại diện. Phạm vi hỗ trợ ban đầu là frame CUR một ảnh, DIB 32-bit, cùng kích thước 32×32 hoặc 48×48, cùng hotspot giữa các frame. Đây là tập con do dự án chọn để kiểm soát tương thích và giới hạn tài nguyên.
- Gallery, chi tiết pack và Sandbox dùng PNG đại diện trên web. Giao diện ghi rõ **Ảnh xem trước tĩnh · Chuyển động khi áp dụng trong Windows**. Trình tạo ANI từ các PNG, trình chỉnh timeline và preview động trên web dành cho đề xuất sau.

## 2. Luồng Admin

1. Trong **Gán Asset Role**, chọn **Tĩnh (.cur)** hoặc **Động (.ani)**. Khi mở lại role đã lưu, xác định lựa chọn từ asset đã gắn.
2. Với **Tĩnh**, PNG quyết định kích thước của picker. Admin chọn hotspot rồi tạo CUR hoặc nhập file tương thích.
3. Với **Động**, chọn file ANI và tải PNG đại diện cùng kích thước, khớp hình và alpha của frame phát đầu tiên. Sau khi server kiểm tra ANI, hiển thị kích thước và hotspot đọc từ file. Picker dùng chế độ chỉ xem. Đổi hotspot động bằng cách xuất lại ANI nguồn rồi tải lên.
4. **Lưu Gán Role** chỉ thực hiện khi có đủ hai asset hợp lệ. Khi đổi chế độ, xóa lựa chọn file con trỏ đang chỉnh của chế độ trước. Binding đã lưu vẫn dùng được cho đến khi lưu thành công. Nút hủy bỏ thay đổi đang chỉnh.
5. Hiển thị lỗi cạnh trường tương ứng cho file sai loại, kích thước, hotspot hoặc preview. Dùng luồng tải lại bản nháp hiện có khi ETag xung đột. Khi mở modal, giữ nền trang cố định và cho nội dung modal cuộn.
6. **Validate** kiểm cả 8 binding và bộ cài dự kiến. **Publish** công bố phiên bản đã kiểm tra. Thử tay trước với Busy động và các vai trò còn lại tĩnh.

## 3. Hợp đồng và lưu trữ đề xuất

| Thành phần | Thiết kế |
|---|---|
| Upload Admin | Giữ endpoint asset multipart và `kind=cursor`. Phân biệt CUR và ANI từ bytes đã qua validator. Dùng MIME từ server và suffix chuẩn để phân biệt registry asset. CUR cũ tiếp tục dùng `application/octet-stream`. Đề xuất `application/x-navi-animation` cho ANI trong registry và Admin DTO, cần xác nhận với adapter hiện có. |
| Gán role | Giữ route và payload hiện tại gồm `asset_id`, `preview_asset_id`, `hotspot_x`, `hotspot_y`. Với ANI, frontend dùng tọa độ server trả về sau upload. Backend kiểm tọa độ khớp hotspot đã xác thực. |
| Database | Ưu tiên tái sử dụng `kind`, `mime_type`, `storage_key`, kích thước và hotspot hiện có. Kiểm tra DDL, DTO và storage adapter trước khi chốt phương án. Nếu cần trường định dạng riêng hoặc migration, lập change request và duyệt trước. |
| Metadata pack | `is_animated` do server suy ra khi có ít nhất một role gắn ANI. Draft Admin đọc giá trị từ binding hiện tại. Public projection và cờ pack được cập nhật trong cùng transaction publish. Chuyển role ANI cuối cùng về CUR rồi publish phải đưa cờ về `false`. |
| Tương thích | Giữ shape Public DTO, URL preview PNG và quyền hiện hành. Asset CUR và URL cũ tiếp tục hoạt động. Bổ sung ANI vào contract Admin sau khi duyệt, giữ giới hạn, CSRF, ownership, ETag và mã lỗi đang dùng. |

Storage key vẫn do server cấp theo pack và UUID. Rà tất cả nơi đang suy ra `.cur` chỉ từ `kind=cursor`, gồm key builder, đọc Admin, kiểm hash, đường media managed, projection khi publish, cleanup, và tải trực tiếp. Bảo đảm extension, loại asset và bytes đồng nhất. Kiểm tra Local và R2 với cùng quy tắc. [Hợp đồng Admin hiện tại](ADMIN_SPEC.md)

## 4. Validator và giới hạn tài nguyên

- Dùng một validator ANI dùng chung cho upload, Validate/Publish và tải file. Kiểm RIFF/ACON, chiều dài khai báo, ranh giới và padding của chunk, số frame thực tế, số bước phát, bảng thứ tự/timing, cùng điều kiện hợp lệ của từng frame. Xác định frame phát đầu tiên từ thứ tự phát để so pixel và alpha với PNG đại diện. [Microsoft Learn — Resource File Formats](https://learn.microsoft.com/en-us/windows/win32/menurc/resource-file-formats)
- Tái dùng kiểm tra CUR theo từng frame cho tập con hỗ trợ. Mọi frame phải cùng kích thước và hotspot, offsets/length hợp lệ và hotspot nằm trong ảnh. Từ chối payload hỏng hoặc biến thể ngoài tập con với thông báo cụ thể. Kiểm file mẫu thật để xác nhận quy tắc đọc bảng timing/thứ tự và các biến thể được chấp nhận.
- Giữ **2 MiB/file** cho upload Admin. Đề xuất thêm trần **60 frame và 120 bước phát**, thời lượng một vòng tối đa **30 giây**. Xác nhận ngưỡng với corpus và test Windows trước khi bật. Kiểm count và kích thước trước khi lấy buffer theo metadata. Chạy xử lý nhị phân ngoài event loop với giới hạn song song hiện có.
- Giữ lỗi theo hợp đồng hiện hành. File vượt dung lượng trả **413**, file ANI ngoài định dạng hỗ trợ hoặc hỏng trả **415**, binding thiếu hoặc preview/hotspot sai trả lỗi validation tương ứng. Thông báo phân biệt được hai trường hợp file hỏng và biến thể chưa hỗ trợ.

## 5. Publish, tải ZIP và rollback

- ZIP xác định extension từ asset đã kiểm tra. `Install.inf`, manifest và các mục copy dùng đúng tên thực tế. Giữ thứ tự **15 slot**, đặc biệt **Wait → busy.ani** và **AppStarting → working.cur hoặc working.ani**. Kiểm mọi tham chiếu INF trỏ vào file trong ZIP. [Mapping chuẩn](ARCHITECTURE.md)
- Áp cùng quyền tải User hiện hành cho GET/HEAD CUR và ANI. Preview PNG vẫn công khai. Raw URL legacy hoặc CDN tuân theo chính sách chặn file tải và cache hiện hành. Giữ quy tắc atomic download counter của ZIP.
- Bật upload/gán ANI bằng cấu hình riêng sau khi cả backend và frontend tương thích. Chốt cơ chế rollback trước khi có pack ANI published. Khi tắt quyền ghi ANI, bản đang phục vụ vẫn phải có khả năng đọc và đóng gói pack đã xuất bản. Nếu cần rollback sang bản thiếu hỗ trợ đọc, gỡ publish pack ANI bị ảnh hưởng hoặc thay bằng bản CUR đã kiểm tra trước khi hạ phiên bản.

## 6. Hạng mục triển khai và nghiệm thu

| Thứ tự | Phụ trách | Điều kiện hoàn thành |
|---|---|---|
| 1. Duyệt hợp đồng | Chủ dự án + Codex | Chốt tập con ANI, phân loại asset, giới hạn, feature flag và phương án rollback; ghi quyết định trước khi đổi API hoặc schema. |
| 2. Backend | Codex | Parser chung, upload/đọc/gán role, projection, cache và ZIP/INF. Integration MySQL trên pack toàn CUR và pack hỗn hợp. Kiểm file hỏng, file chỉ đúng magic bytes, timing/count ngoài giới hạn, hotspot/preview lệch, quyền và ETag. |
| 3. Editor | Antigravity | Chuyển chế độ, giữ binding cũ đến khi lưu, hiển thị hotspot chỉ xem ở chế độ động, lỗi dễ hiểu. Browser test desktop/mobile cho upload/lưu, đóng mở lại role và đổi ANI về CUR. |
| 4. Windows và staging | Codex + Antigravity | Trên Windows 10 và 11, cài ZIP, áp dụng scheme và quan sát Busy thực sự quay khi Windows dùng vị trí Wait. Kiểm con trỏ tĩnh và hotspot vẫn đúng, quyền tải trực tiếp hoạt động, Admin và Gallery hồi quy đạt. Dùng staging để kiểm Local/R2 theo topology sẽ phát hành. |

**Tiêu chí phát hành:** Có ít nhất một fixture ANI thật chạy trên Windows 10 và 11, một pack hỗn hợp vượt qua luồng Admin → Publish → ZIP → cài đặt, suite tĩnh xanh và có bằng chứng kiểm quyền tải/caching. Nghiệm thu thay đổi theo [A15](ADMIN_TASKS.md) và [cổng staging U09](USER_AUTH_TASKS.md).

### Tiến độ backend

- [x] Bộ kiểm tra ANI cho tập con đề xuất và 12 ca kiểm thử riêng.
- [x] Tích hợp nhận, lưu và đọc ANI trong registry Admin, giữ schema và các payload hiện có. Khi process backend có `ADMIN_ANI_UPLOAD_ENABLED=true`, multipart `kind=cursor` nhận ANI hợp lệ và trả `mime_type=application/x-navi-animation`, kích thước, hotspot. Key do server cấp có đuôi `.ani`. Tải private qua `GET /api/v1/admin/packs/{id}/assets/{asset_id}/content` với phiên Admin. `content_url` cho cursor hiện vẫn `null`. Cờ mặc định tắt và chỉ nên bật trong môi trường test ở bước này.
- [x] Gán ANI vào role Admin khi cờ upload bật. Kiểm PNG với frame phát đầu, hotspot và ETag trên MySQL cô lập. Validate/Publish vẫn dùng đường kiểm tĩnh ở bước này.
- [x] Validate/Publish và public projection cho pack hỗn hợp. MySQL/HTTP đạt ZIP 15 slot, `Wait → busy.ani`, tải gateway GET/HEAD có phiên User và từ chối khách khi User guard bật. Unpublish chặn tải và publish lại toàn CUR đưa `is_animated` về false.
- [x] Nối lựa chọn CUR/ANI ở editor và truyền cờ backend qua Compose dev. Chrome/MySQL cô lập đạt chọn ANI, hotspot chỉ xem, lưu, mở lại role, hủy đổi kiểu và thay bằng CUR.
- [x] Hiển thị **Có con trỏ động** trong danh sách draft dựa trên binding hiện tại. Chrome 390 px + MySQL cô lập đạt gán ANI, mở lại, hủy, đổi về CUR và cập nhật trạng thái.
- [x] Kiểm ZIP thử trên Windows 10 build 19045 bằng Win32. Nạp được CUR và ANI, vẽ được 4 khung hình Busy khác nhau, Wait trỏ đúng `busy.ani`. [LoadImageW](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-loadimagew) · [DrawIconEx](https://learn.microsoft.com/windows/win32/api/winuser/nf-winuser-drawiconex)
- [ ] Nghiệm thu staging và cài Áp dụng scheme thật trên Windows 10/11. Lượt kiểm Win32 chỉ nạp ảnh vào bộ nhớ. Máy hiện tại là Windows 10 và chưa có môi trường Windows 11 dùng để kiểm thử.

**Bật để chạy thử local:** Đặt `ADMIN_ANI_UPLOAD_ENABLED=true` trong `.env` của Compose ở root và `VITE_ADMIN_ANI_ENABLED=true` trong `frontend/.env.local`. Tạo lại container backend để nhận biến môi trường và khởi động lại Vite. Cả hai cờ mặc định tắt. Với frontend build tĩnh, biến Vite cần có tại thời điểm build.
