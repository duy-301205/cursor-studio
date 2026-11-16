# IMPLEMENTATION TASKS (STEP-BY-STEP)

## Phase 1: Backend Docker & Core API (Agent: Codex)
- [ ] **Task 1.1:** Tạo `docker-compose.dev.yml`, `backend/Dockerfile`, `backend/requirements.txt` và `app/core/config.py`.
- [ ] **Task 1.2:** Viết SQLAlchemy async models (`categories`, `cursor_packs`, `cursor_items`, `custom_creations`) và Pydantic schemas.
- [ ] **Task 1.3:** Viết script auto-seed trong `lifespan`: tự tạo bảng, tạo 5 danh mục, tự vẽ bằng Pillow/win2xcur 3 bộ con trỏ mẫu vào `backend/static/samples/` và mount `/static`.
- [ ] **Task 1.4:** Xây dựng API đọc dữ liệu: `GET /api/v1/categories`, `GET /api/v1/packs` (lọc, tìm kiếm, phân trang), `GET /api/v1/packs/{slug}`.
- [ ] **Task 1.5:** Viết `services/cursor_converter.py` (PNG -> `.cur` nhị phân) và `services/inf_builder.py` (sinh `Install.inf` đủ 15 slot).
- [ ] **Task 1.6:** Hoàn thiện `GET /api/v1/packs/{id}/download` (ZIP stream trên RAM), `POST /api/v1/studio/convert`, và `POST/GET /api/v1/studio/share`.
- [ ] **Task 1.7:** Viết `pytest` kiểm tra header nhị phân file `.cur` (`00 00 02 00`) và định dạng file `Install.inf`.

## Phase 2: Frontend MVP & Sandbox (Agent: Antigravity)
- [ ] **Task 2.1:** Khởi tạo Vite + React 18 + TS + Tailwind CSS, cấu hình `src/types/cursor.ts` và `src/services/api.ts`.
- [ ] **Task 2.2:** Xây dựng `HomePage.tsx`, `FilterBar.tsx` và `PackCard.tsx` (tích hợp tính năng Hover-to-Test).
- [ ] **Task 2.3:** Xây dựng `PackDetailPage.tsx`, hook `useDynamicCursor.ts` và `InteractiveSandbox.tsx` (Light/Dark toggle + test đủ các role + nút tải ZIP).

## Phase 3: Studio & Viral Features (Agent: Antigravity)
- [ ] **Task 3.1:** Viết `utils/stickerCanvas.ts` tích hợp `@imgly/background-removal` và thuật toán vẽ viền trắng sticker trên Canvas.
- [ ] **Task 3.2:** Xây dựng `HotspotGridPicker.tsx` và `StudioPage.tsx` kết nối API `/studio/convert` để tải file `.cur`.
- [ ] **Task 3.3:** Xây dựng `useMixMatch.ts` (lưu `localStorage`), thanh nổi `MixMatchDock.tsx` và tính năng tạo/xem link chia sẻ (`/s/:code`).

## Phase 4: Verification & Production Deploy
- [ ] **Task 4.1:** Kiểm thử thực tế file `.zip` và `Install.inf` trên hệ điều hành Windows 10/11.
- [ ] **Task 4.2:** Tích hợp Cloudflare R2 (`boto3`), viết `docker-compose.prod.yml` kèm Caddy SSL và deploy Frontend lên Cloudflare Pages.