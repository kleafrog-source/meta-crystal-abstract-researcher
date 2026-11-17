<p align="center">
  <img src="docs/assets/am-core-mark.svg" alt="Abstract-Mindfreak AM-Core" width="160" height="160"/>
</p>

<h1 align="center">Abstract-Mindfreak · AM-Core</h1>

<p align="center">
  <strong>Локальная мультимодальная среда для работы со звуковыми параметрами</strong><br/>
  Текст · аудио · спектрограмма → отбор контролов → значения → макросы и таймлайны
</p>

---

**Abstract-Mindfreak** — веб-приложение для исследования большой **библиотеки параметров** звукового продакшена (~7 тыс. записей): поиск языком, аудио или кадром спектрограммы, заполнение числовых и дискретных значений, группировка по **девяти акустическим слоям**, экспорт **макросов** и **priority timeline**.

Стек **локальный**: Next.js, Python sidecar, эмбеддинги и LLM через **Ollama**, аудио/изображение — **CLAP** и **SigLIP2**.

> English: [README.md](README.md)

---

## Чем интересно

- **Два текстовых индекса** — Qwen3 и EmbeddingGemma 2 параллельно.
- **AWTD и resolved** — роли (axis/weight/threshold/depth) с default’ами каталога *или* полноценный value-pass.
- **AM Tri-Modal Stage** — единый столчий столл сессии.
- **Service Bay** — все перестройки индексов в одном месте.
- **Каталог параметров** — единственный источник правды после Queue → commit.

---

## Режимы

Краткие карточки (EN + зеркала): папка [`docs/modes/`](docs/modes/).  
Карта MMSS: [`docs/mmss-modes/`](docs/mmss-modes/).

| Режим | Зачем |
|------|--------|
| AM Tri-Modal Stage | Полная мультимодальная сессия |
| AM-Core Engine | Быстрый текстовый поиск и Clean Macro |
| Service Bay | Индексы и якоря |
| Audio-to-Parameter / CLAP / Morpho | Специализированный audio/spec RAG |
| Genesis / Synthesis | Наполнение и семантический синтез |
| Parameter Catalogue | Редакция библиотеки |
| Settings | Модели, флаги банков, локаль |

---

## Запуск

```bash
pnpm install
python -m pip install -r requirements.txt
pnpm run dev
```

Нужны Node.js, pnpm, Python, Ollama. Веса и индексы — на диске, не в Git.

---

## Разработка

Интерфейс и retrieval дорабатывались с помощью **ChatGPT**; архитектурные контракты режимов фиксировались скиллом **[mmss-principle-synthesis](https://github.com/Abstract-Mindfreak/mmss-principle-synthesis/tree/main)**.

---

## Модели

В Settings задаются, среди прочего: **Qwen3 embedding**, **EmbeddingGemma 2**, **CLAP**, **SigLIP2**, опционально **LFM3-Audio** и текстовые LLM в Ollama. Соблюдайте лицензии правообладателей весов.

---

<p align="center">
  <sub>Abstract-Mindfreak · AM-Core</sub>
</p>
