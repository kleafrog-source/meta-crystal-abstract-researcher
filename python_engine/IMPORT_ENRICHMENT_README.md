# Импорт данных обогащения из z-ai-reference-crystal-pool-demo

Этот документ описывает процесс импорта расширенных данных из демо-пула в основной проект.

## Источники данных

### 1. Лексикон (deepseek_json)
- **Файл:** `z-ai-reference-crystal-pool-demo/meta_crystals/snapshots/deepseek_json_20260729_abdc46.json`
- **Содержимое:** 271 категория, 3978 терминов
- **Назначение:** Расширение базы знаний для RAG (KnowledgeEntity)

### 2. Кристаллы (exported)
- **Директория:** `z-ai-reference-crystal-pool-demo/exported/`
- **Файлы:** 17 JSON файлов с экспортом кристаллов
- **Объем:** ~17,000 кристаллов (с дубликатами между файлами)
- **Назначение:** Расширение библиотеки кристаллов (Crystal)

## Порядок выполнения

### Шаг 1: Создание бэкапа (ОБЯЗАТЕЛЬНО)

Перед импортом создайте бэкап базы данных:

```bash
cd python_engine
python create_backup_snapshot.py
```

**Что делает:**
- Создает копию файла `dev.db` в папку `backups/`
- Создает JSON snapshot основных таблиц (Crystal, KnowledgeEntity, Profile, Snapshot)
- Сохраняет метку времени для идентификации бэкапа

**Результат:**
- Файл бэкапа: `backups/dev_backup_YYYYMMDD_HHMMSS.db`
- JSON snapshot: `backups/snapshot_YYYYMMDD_HHMMSS.json`

### Шаг 2: Импорт лексикона

```bash
cd python_engine
python import_lexicon_enrichment.py
```

**Что делает:**
- Загружает лексикон из deepseek_json
- Проверяет существующие записи в KnowledgeEntity
- Добавляет только новые термины (дедупликация по [kind, name])
- Создает записи с метаданными категории

**Результат:**
- Новые термины добавляются в таблицу KnowledgeEntity
- Дубликаты пропускаются
- Статистика по добавленным/пропущенным записям

### Шаг 3: Импорт кристаллов

```bash
cd python_engine
python import_crystals_enrichment.py
```

**Что делает:**
- Сканирует директорию exported для всех JSON файлов
- Проверяет существующие коды кристаллов в БД
- Импортирует только новые кристаллы (дедупликация по code)
- Преобразует формат экспорта в схему БД
- Сохраняет метаданные (microNotes, translation, torus координаты)

**Результат:**
- Новые кристаллы добавляются в таблицу Crystal
- Дубликаты пропускаются
- Статистика по файлам, добавленным/пропущенным кристаллам

## Требования

- Python 3.8+
- База данных SQLite (dev.db в корне проекта)
- Модуль sqlite3 (входит в стандартную библиотеку Python)

## Откат изменений

### Вариант 1: Восстановление из DB бэкапа

```bash
# Остановите приложение
# Скопируйте бэкап поверх текущей БД
cp backups/dev_backup_YYYYMMDD_HHMMSS.db dev.db
```

### Вариант 2: SQL запросы для частичного отката

```sql
-- Удалить импортированные кристаллы
DELETE FROM Crystal WHERE filepath LIKE 'imported/%';

-- Удалить импортированные термины лексикона
DELETE FROM KnowledgeEntity WHERE kind = 'lexicon' AND metaJson LIKE '%"definition": "Термин из категории лексикона"%';
```

### Вариант 3: Восстановление из JSON snapshot

Можно написать скрипт для восстановления данных из JSON snapshot (требует разработки).

## Мониторинг

После импорта проверьте:

1. Количество записей в KnowledgeEntity:
```sql
SELECT kind, COUNT(*) FROM KnowledgeEntity GROUP BY kind;
```

2. Количество кристаллов:
```sql
SELECT type, COUNT(*) FROM Crystal GROUP BY type;
```

3. Качество данных через веб-интерфейс приложения

## Troubleshooting

### Ошибка: файл не найден
Проверьте пути в скриптах - они должны соответствовать вашей файловой системе.

### Ошибка: БД не найдена
Убедитесь, что файл `dev.db` существует в корне проекта:
```bash
ls D:/WORK/CLIENTS/mmss-meta-crystal/dev.db
```

Если БД не существует, инициализируйте её:
```bash
cd D:/WORK/CLIENTS/mmss-meta-crystal
npx prisma db push
```

### Дубликаты не пропускаются
Скрипты используют дедупликацию по уникальным полям. Если дубликаты всё равно добавляются, проверьте схему БД на наличие уникальных ограничений.

### Ошибка ModuleNotFoundError: No module named 'prisma'
Скрипты переписаны на использование sqlite3 напрямую, Prisma не требуется.
