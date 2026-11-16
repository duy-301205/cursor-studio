# SYSTEM ARCHITECTURE & DATA FLOW

## 1. Tech Stack Chuẩn
* **Frontend:** Vite + React 18 + TypeScript + Tailwind CSS + Lucide Icons.
* **Client-side AI & Graphics:** `@imgly/background-removal` (WebAssembly) + HTML5 Canvas API.
* **Backend:** Python 3.11 + FastAPI + Uvicorn (Async) + SQLAlchemy 2.0 + `aiomysql`.
* **Image & Binary Engine:** `Pillow` + `win2xcur` + `io.BytesIO` + `zipfile`.
* **Database:** MySQL 8.0.
* **Storage:** Local Static Mock (Giai đoạn Dev) $\rightarrow$ Cloudflare R2 (Production).
* **DevOps:** Docker Compose (Dev & Prod), Caddy (Reverse Proxy + Auto SSL), Cloudflare Pages (FE).

## 2. Cấu trúc Thư mục Monorepo
```text
cursor-studio/
├── PRD.md, ARCHITECTURE.md, DESIGN.md, RULES.md, TASKS.md, PROGRESS.md
├── docker-compose.dev.yml
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── static/samples/          # Chứa file .png/.cur mock tự sinh khi dev
│   └── app/
│       ├── main.py              # Entry point, CORS, Lifespan (Auto-seed DB)
│       ├── core/                # config.py, database.py
│       ├── models/              # SQLAlchemy ORM (4 bảng)
│       ├── schemas/             # Pydantic v2 Request/Response
│       ├── routers/             # packs.py, studio.py, download.py
│       └── services/            # cursor_converter.py, inf_builder.py, storage_service.py
└── frontend/
    └── src/
        ├── types/cursor.ts      # Shared interfaces khớp với Backend
        ├── services/api.ts      # Fetch client giao tiếp localhost:8000
        ├── hooks/               # useDynamicCursor.ts, useMixMatch.ts
        ├── utils/               # stickerCanvas.ts, hotspotUtils.ts
        ├── components/          # gallery/, sandbox/, studio/, common/
        └── pages/               # HomePage.tsx, PackDetailPage.tsx, StudioPage.tsx