# Лекции → Тесты

Загружаешь видео своей лекции → извлекается звук → транскрибируется → по лекции
генерируются тесты (20 вопросов с вариантами ответа) → отслеживается прогресс по пользователям.

## Стек

| Слой | Технология |
|------|-----------|
| Фронт | React 19 + Mantine (Vite) |
| Бэкенд | Python + FastAPI (async) |
| Очередь | arq + Redis, GPU-воркер (concurrency=1) |
| Файлы | MinIO (видео/аудио/транскрипты, presigned URLs) |
| Состояние | PostgreSQL |
| Транскрипция | faster-whisper large-v3 (GPU, ru) |
| Генерация | vLLM / Qwen3-14B-AWQ (guided JSON) |
| Инфра | k8s + Docker, GPU time-slicing, Helm |

## Поток

1. **Загрузка** — React берёт presigned URL, заливает видео прямо в MinIO, регистрирует лекцию → arq-задача.
2. **Обработка** (GPU-воркер) — ffmpeg → faster-whisper → vLLM (конспект). Статусы: `extracting → transcribing → structuring → done`.
3. **Тест** — по кнопке vLLM генерит 20 свежих MCQ; проверка на клиенте; на сервер уходит разбивка по вопросам (где ошибся).
4. **Прогресс** — `mastery_pct` по каждой лекции из попыток (Вариант Б: история + шкалы).

## Локальный запуск

```bash
cp .env.example .env          # при необходимости поправь VLLM_BASE_URL
docker compose up -d postgres redis minio createbuckets
# бэкенд
cd backend && pip install -e . && uvicorn app.main:app --reload
# воркер (нужен GPU + ffmpeg)
arq app.worker.WorkerSettings
# фронт
cd frontend && npm install && npm run dev
```

API: http://localhost:8000/docs · Фронт: http://localhost:5173 · MinIO-консоль: http://localhost:9001

## Структура

```
backend/app/
  main.py          FastAPI + роутеры
  config.py        настройки (.env)
  db.py models.py  SQLAlchemy (users, lectures, attempts)
  storage.py       MinIO + presigned URLs
  vllm_client.py   guided-JSON генерация конспекта и вопросов
  worker.py        arq: ffmpeg → whisper → vLLM
  routers/         users, lectures, quiz, attempts
frontend/src/
  App.tsx api.ts   Mantine UI + клиент к API
helm/              чарт k8s (шаг 6)
```

## Статус

Скелет + UI прохождения теста (модалка с MCQ, проверка на клиенте, отправка результата).
Дальше: миграции Alembic, Helm-чарт + GPU time-slicing.
```
