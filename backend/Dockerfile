FROM python:3.12-slim-bookworm@sha256:935c3c5b12357a7e10caa9c1e6ca5692344d97cf229832ef584be2cec9fc03df AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1
WORKDIR /app
EXPOSE 8000

FROM base AS development

ENV APP_ENV=development
COPY requirements-dev.lock ./
RUN python -m pip install --no-cache-dir --require-hashes --only-binary=:all: -r requirements-dev.lock
COPY pyproject.toml ./
COPY app ./app
# Windows build contexts can mark ordinary source files executable.
RUN find app -type f -name '*.py' -exec chmod a-x {} +
CMD ["python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]

FROM base AS production

ENV APP_ENV=production AUTO_SEED=false
COPY requirements.lock ./
RUN python -m pip install --no-cache-dir --require-hashes --only-binary=:all: -r requirements.lock \
    && groupadd --gid 10001 appuser \
    && useradd --uid 10001 --gid 10001 --no-create-home --shell /usr/sbin/nologin appuser
COPY app ./app
USER 10001:10001
CMD ["python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
