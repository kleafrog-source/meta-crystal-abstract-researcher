# Мета-Кристалл - Инструкция по установке и запуску

## Обзор

Мета-Кристалл - это веб-приложение для генерации и анализа кристаллических структур с использованием ML и алгоритмов комбинаторной алхимии.

## Системные требования

- **Node.js** v23.5.0 или выше
- **Python** 3.13.1 или выше
- **PostgreSQL** (опционально, для production)
- **Ollama** (опционально, для локальных LLM)

## Установка и запуск

### Быстрый старт (Windows)

1. **Запустите приложение двойным кликом по файлу `start.bat`**
   - Это автоматически запустит Python скрипт `start.py`
   - Сервер запустится на http://localhost:3000
   - Браузер откроется автоматически через 5 секунд

### Ручной запуск

#### Вариант 1: Python скрипт
```bash
python start.py
```

#### Вариант 2: Непосредственно через npm
```bash
npm run dev
```

## Конфигурация

### База данных

Приложение по умолчанию использует SQLite для прототипирования. Для переключения на PostgreSQL:

1. Отредактируйте файл `.env`:
```env
DATABASE_URL="postgresql://mind_user:mindfreak@localhost:5432/mmss-crystal"
```

2. Отредактируйте файл `prisma/schema.prisma`:
```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

3. Сгенерируйте Prisma Client:
```bash
npx prisma generate
npx prisma db push
```

### Ollama (локальные LLM)

Для использования локальных моделей через Ollama:

1. Установите Ollama: https://ollama.ai
2. Запустите Ollama сервер (обычно запускается автоматически на http://localhost:11434)
3. В настройках приложения (http://localhost:3000/settings) выберите провайдер "Ollama"
4. Настройте URL: `http://localhost:11434`
5. Выберите модели для чата и эмбеддингов

## Структура проекта

```
mmss-meta-crystal/
├── start.py              # Стартовый Python скрипт
├── start.bat             # Windows bat файл для быстрого запуска
├── package.json          # Node.js зависимости
├── requirements.txt      # Python зависимости
├── .env                  # Переменные окружения
├── prisma/
│   └── schema.prisma    # Схема базы данных
├── python_engine/        # Python движок генерации
│   ├── sidecar.py        # Main Python sidecar process
│   └── metacrystal_engine_v7.py  # Engine logic
├── src/
│   ├── app/              # Next.js приложение
│   ├── components/       # React компоненты
│   └── lib/              # Утилиты и подключения
└── data/                 # Директория для данных
```

## Доступные команды npm

```bash
npm run dev        # Запуск dev сервера
npm run build      # Сборка production версии
npm run start      # Запуск production сервера
npm run lint       # Проверка кода
npm run db:push    # Prisma: push schema to database
npm run db:generate # Prisma: generate client
npm run db:migrate # Prisma: run migrations
npm run db:reset   # Prisma: reset database
```

## Устранение проблем

### Ошибка "Node.js не найден"
- Установите Node.js с https://nodejs.org
- Перезапустите терминал после установки

### Ошибка подключения к базе данных
- Убедитесь, что PostgreSQL запущен
- Проверьте credentials в `.env` файле
- Для SQLite убедитесь, что файл `dev.db` доступен для записи

### Ollama недоступен
- Убедитесь, что Ollama сервер запущен: `ollama serve`
- Проверьте, что сервер доступен по http://localhost:11434
- Проверьте наличие установленных моделей: `ollama list`

### Порт 3000 уже занят
- Остановите процесс, занимающий порт 3000
- Или измените порт в `package.json`: `"dev": "next dev -p 3001"`

## Поддержка

Для дополнительной информации и поддержки:
- Проверьте документацию в папке `docs/`
- Создайте issue в репозитории проекта
