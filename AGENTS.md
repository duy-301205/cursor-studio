
# HƯỚNG DẪN DÀNH CHO AI AGENTS

Trước khi viết hoặc sửa bất kỳ dòng code nào, mọi AI Agent
(Codex, Antigravity, v.v.) BẮT BUỘC đọc đủ 6 tài liệu:

1. `RULES.md` — Các luật kỹ thuật và điều cấm.
2. `ARCHITECTURE.md` — Kiến trúc, Database và API Contract.
3. `PRD.md` — Mục tiêu và yêu cầu sản phẩm.
4. `DESIGN.md` — Design System và UI/UX.
5. `TASKS.md` — Danh sách Task và tiêu chí nghiệm thu.
6. `PROGRESS.md` — Trạng thái và tiến độ hiện tại.

## Quy tắc làm việc bắt buộc

- Chỉ thực hiện Task được giao, đúng phạm vi file.
- Codex phụ trách Backend, Antigravity phụ trách Frontend.
- Không nhảy cóc Phase khi Phase hiện tại chưa hoàn thành.
- Không tự ý thay đổi API Contract hoặc Database Schema.
- Phải chạy kiểm thử trước khi đánh dấu Task hoàn thành.
- Khi Task PASS, đánh dấu `[x]` vào checklist tương ứng
  trong `TASKS.md` và cập nhật `PROGRESS.md`.
- Nếu Task FAIL, giữ `[ ]` và ghi nguyên nhân vào PROGRESS.md.
- Kết thúc Task phải báo cáo file đã sửa, kết quả kiểm thử
  và Task tiếp theo.
- Không tự động thực hiện Task tiếp theo.
