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
cd backend && pip install -e .
alembic upgrade head          # или оставь AUTO_CREATE_TABLES=true для dev
uvicorn app.main:app --reload
# воркер (нужен GPU + ffmpeg)
arq app.worker.WorkerSettings
# фронт
cd frontend && npm install && npm run dev
```

API: http://localhost:8000/docs · Фронт: http://localhost:5173 · MinIO-консоль: http://localhost:9001

## Деплой в k8s (Helm)

```bash
# 1. GPU time-slicing (один раз на кластер) — делит карту между worker и vLLM
kubectl apply -f helm/gpu-time-slicing/time-slicing-config.yaml
#    затем подключить конфиг к device plugin (см. helm/gpu-time-slicing/README.md)

# 2. собрать и запушить образы
docker build -t lecture-tests-api ./backend
docker build -t lecture-tests-frontend ./frontend

# 3. установить чарт
helm install lt helm/lecture-tests \
  --set minio.publicEndpoint=192.168.1.116:30900 \
  --set vllm.baseUrl=http://192.168.1.116:30800/v1
```

Фронт — NodePort `30080`, MinIO — NodePort `30900` (его адрес должен совпадать с
`minio.publicEndpoint`, т.к. браузер ходит туда по presigned URL). vLLM не
разворачивается чартом — переиспользуется существующий деплой.

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
  App.tsx Quiz.tsx api.ts   Mantine UI + модалка теста + клиент к API
helm/lecture-tests/       Helm-чарт (api, worker, frontend, postgres, redis, minio)
helm/gpu-time-slicing/    конфиг шаринга GPU между worker и vLLM
```

## Статус

Скелет + UI теста + Helm-чарт + GPU time-slicing + Alembic-миграции + PVC под кэш Whisper.
Дальше: production-секреты (sealed secrets), сборка образов и первый деплой.
```
