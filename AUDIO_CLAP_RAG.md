# Audio CLAP RAG

Изолированный режим `/audio-clap-rag` сопоставляет выбранный фрагмент аудиореференса с параметрами Flowmusic Genesis V3 через `laion/clap-htsat-fused`.

## Индекс

Кнопка **«Обновить CLAP-индекс»** запускает `python_engine/audio_clap_rag.py` через общий Python sidecar. Индекс сохраняется в:

`data/combinatorial-genesis/audio-clap-index/index.json`

Для каждой объединённой записи V3 сохраняются SHA-256 полного parameter object, CLAP text vector и исходные metadata. При повторном запуске неизменившиеся векторы переиспользуются; вычисляются только новые и изменённые параметры.

Первое индексирование около 6040 параметров на CPU может занять примерно час. Последующие проверки без изменений не запускают text encoder.

## Поиск

`POST /api/audio/search` принимает `multipart/form-data`: `audio`, `offset`, `duration`, `top_k`. Librosa загружает только выбранный фрагмент с частотой 48 kHz. CLAP audio embedding сравнивается с нормализованными текстовыми векторами по cosine similarity.

Значения Range/Toggle/Select детерминированно привязываются к нормализованной similarity внутри Top-K. Это similarity anchoring, а не обученная регрессия физических значений. После поиска значения можно вручную изменить в переиспользованном V3 control bank и экспортировать через переиспользованный Clean Macro Output.

## Настройки окружения

- `CLAP_MODEL` — по умолчанию `laion/clap-htsat-fused`.
- `CLAP_DEVICE` — по умолчанию `cpu`.
- `CLAP_TEXT_BATCH_SIZE` — по умолчанию `64`.
