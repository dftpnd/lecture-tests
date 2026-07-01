# CLAUDE.md

Заметки для Claude Code по этому репозиторию. Подробности стека и потока — в `README.md`.

## Деплой (эта машина = нода mg-ultra)

Хост, на котором идёт работа, — это и есть single-node кластер (kubeadm, containerd).
Релиз Helm: `lt`, namespace: `lectures`. Образы собираются локально и импортятся
прямо в containerd (`ctr -n k8s.io`), реестра нет.

**Одна команда на весь деплой — `scripts/deploy.sh`** (бампает семвер → build →
import → `helm upgrade` → ждёт rollout):

```bash
./scripts/deploy.sh frontend          # фронт: 1.12.0 → 1.12.1, собрать и раскатать
./scripts/deploy.sh api               # бэкенд-API (FastAPI)
./scripts/deploy.sh worker            # GPU-воркер (whisper + vLLM)
./scripts/deploy.sh api worker        # несколько сразу
./scripts/deploy.sh frontend --minor  # bump minor (x.Y.0); есть и --major
./scripts/deploy.sh frontend=1.20.0   # явная версия, без авто-бампа
DRY_RUN=1 ./scripts/deploy.sh api     # показать план, ничего не менять
```

Компоненты: `api` и `worker` — это **бэкенд**, `frontend` — фронт. `deploy.sh`
покрывает все три одинаково.

Детали, важные при деплое:
- **Тег образа в `helm/lecture-tests/values.yaml` — источник правды.** `deploy.sh`
  бампает его и пишет обратно, но **не коммитит** — коммит делает пользователь
  (как коммиты вида `bump frontend X.Y.Z`).
- **Миграции БД накатываются сами**: у `api` есть initContainer `migrate`, который
  перед стартом гоняет `alembic upgrade head`. Отдельного шага для миграций не нужно —
  достаточно задеплоить `api` с новым образом.
- `deploy.sh` катит через `helm upgrade --reuse-values --set images.<c>.tag=…`, т.е.
  меняется только тег образа; оверрайды minio/vllm/secret в живом релизе не трогаются.
- Полный `helm upgrade -f helm/lecture-tests/values-mgultra.yaml …` нужен, только
  когда меняется **сам чарт** (шаблоны/values), а не код компонента.
- `scripts/build.sh` — низкоуровневая сборка+импорт одного образа; `deploy.sh` его
  переиспользует. Обычно вызывай `deploy.sh`, а не `build.sh` напрямую.

## Окружение

- **На хосте нет Node** — npm/build/dev по фронту гонять в контейнере `node:22`
  (образ фронта и так собирается в Docker, так что для деплоя это не мешает).
- Доступны: `helm`, `kubectl`, `docker`, `ctr`, `jq`.
