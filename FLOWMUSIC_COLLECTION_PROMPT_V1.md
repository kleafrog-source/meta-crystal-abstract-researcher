# Flowmusic Multi-Account Lexical Collection Protocol V1

## Назначение

Этот запрос собирает независимые наборы параметров для будущего лексического корпуса Combinatorial Genesis.

Flowmusic **не получает** текущий файл из 2733 параметров. Совпадения с ним и совпадения между аккаунтами разрешены. После сбора система отдельно выполнит merge, exact dedup, semantic dedup и сохранит частоту/происхождение совпадений.

## Правила эксперимента

- Открыть отдельную новую сессию на каждом аккаунте.
- Отправить Initial prompt без изменений.
- Не добавлять в prompt имя аккаунта и ответы других сессий.
- Не просить Flowmusic намеренно отличаться от других аккаунтов.
- Не генерировать аудио.
- Сохранять полный JSON-ответ и ссылку на сессию.
- Каждый следующий batch запрашивать одинаковым Continuation prompt с одинаковым номером во всех аккаунтах.

## Initial prompt — одинаковый для каждого аккаунта

```text
Hello! In this session we are building a machine-readable lexical source corpus for a Flowmusic / META-Ω semantic audio parameter engine. Audio generation is not required.

The future engine will split English technical parameter names into semantic atoms and use bge-m3 embeddings — without an LLM at runtime — to rank and recombine those atoms into new parameter names. Your task is to provide high-quality parameter records whose names and bilingual descriptions give this lexical corpus broad, technically meaningful coverage.

Produce exactly 10 audio-control parameter records. Aim for diverse but interpretable coverage across acoustic physics, dynamics, spectral processing, time and phase, spatial perception, synthesis, rhythm and structure, vocal morphology, nonlinear systems, generative algorithms, psychoacoustics, organic textures, and cross-domain controls.

Important collection rules:
1. Return JSON only, without markdown fences or commentary.
2. Do not generate audio.
3. Use lowercase English snake_case for technical_name. Use only a-z, 0-9, and underscores; write unit abbreviations in lowercase too (for example, `_db`, not `_dB`). Never use hyphens. Write the L-system concept as the single token `lsystem` (for example, `generative_lsystem_recursion_depth_limit`).
4. Each technical_name must describe one controllable quantity, not a sentence, preset, command, or artistic title.
5. Avoid duplicates inside this response and later inside this session. Repetition with any unknown external dataset is allowed.
6. Prefer names made from semantically meaningful words that remain useful when tokenized, while keeping the complete parameter technically coherent.
7. Do not create arbitrary word salad. The measurable property and unit must have an explainable relationship to the described audio behavior.
8. Choose the ui_element that matches the controlled value. Do not default every parameter to Range merely because the first example uses it. Valid values are Range, Select, Toggle, Text, Array, and String.
9. Fields common to every ui_element are: technical_name, name_ru, description_en, description_ru, category, sub_category, ui_element, default, unit, lyria_prompt_tags, and semantic_keywords.
10. Range: use it only for a continuous or stepped numeric quantity. Include finite numeric min_value, max_value, step, and default, with min_value <= default <= max_value and step > 0. Do not include options.
11. Select: use it for a closed set of named modes or choices. Include at least two unique non-empty string options and a string default exactly equal to one option. Omit min_value, max_value, and step.
12. Toggle: use it for an on/off state. Use numeric default 0 or 1, min_value 0, max_value 1, step 1, and unit "boolean". Do not include options.
13. Text: use it for free-form human-readable text. Use a string default and unit "text". Omit min_value, max_value, step, and options.
14. String: use it for a single machine-readable string value that is not restricted to a closed Select list. Use a string default and a descriptive unit such as "identifier", "label", or "expression". Omit min_value, max_value, step, and options.
15. Array: use it for an ordered list. Use a JSON array of finite numbers as default and a unit describing each item. Omit min_value, max_value, step, and options. Keep the array short enough to edit as one control value.
16. lyria_prompt_tags must contain exactly 3 concise English phrases.
17. semantic_keywords must contain exactly 7 strings: first 3 in Russian, next 4 in English.
18. name_ru must be a concise Russian parameter name.
19. For Range, description_en and description_ru must explain what lower and higher values do. For Select, explain the behavioral difference between its modes. For Toggle, explain the off and on states. For Text, String, and Array, explain how the supplied content is interpreted.

Return exactly this top-level shape:
{
  "collection_protocol": "FLOWMUSIC_LEXICAL_MULTI_ACCOUNT_V1",
  "batch_index": 1,
  "parameters": [
    {
      "technical_name": "example_control_property_ratio",
      "name_ru": "Пример коэффициента управляющего свойства",
      "description_en": "Controls ...; lower values ..., higher values ... .",
      "description_ru": "Управляет ...; низкие значения ..., высокие значения ... .",
      "category": "...",
      "sub_category": "...",
      "ui_element": "...",
      "default": "...",
      "unit": "...",
      "lyria_prompt_tags": ["...", "...", "..."],
      "semantic_keywords": ["...", "...", "...", "...", "...", "...", "..."]
    }
  ]
}
```

Use these ui_element-specific fragments when replacing the `"ui_element": "..."` placeholder above. Include exactly one fragment's fields in each record:

```json
{
  "Range":  { "ui_element": "Range",  "min_value": 0.0, "max_value": 1.0, "step": 0.01, "default": 0.5, "unit": "normalized_ratio" },
  "Select": { "ui_element": "Select", "options": ["minimum_phase", "linear_phase", "mixed_phase"], "default": "minimum_phase", "unit": "mode" },
  "Toggle": { "ui_element": "Toggle", "min_value": 0, "max_value": 1, "step": 1, "default": 0, "unit": "boolean" },
  "Text":   { "ui_element": "Text",   "default": "soft granular texture", "unit": "text" },
  "String": { "ui_element": "String", "default": "layer_a", "unit": "identifier" },
  "Array":  { "ui_element": "Array",  "default": [0.0, 0.5, 1.0], "unit": "normalized_ratio_per_point" }
}
```

The object above is a schema guide only. Do not return it as an extra object and do not copy its example values unless they genuinely fit the proposed parameter.

## Continuation prompt

Заменять только `{BATCH_INDEX}`. Для одного и того же batch использовать одинаковый текст во всех аккаунтах.

```text
Continue the same FLOWMUSIC_LEXICAL_MULTI_ACCOUNT_V1 collection protocol.

Return JSON only and produce exactly 10 additional audio-control parameter records using every schema and quality rule from the initial request. Do not repeat technical_name values already proposed earlier in this session. Repetition with unknown external datasets is allowed.

Set batch_index to {BATCH_INDEX}. Return the same top-level shape with collection_protocol, batch_index, and parameters. Audio generation is not required.
```

## Рекомендуемый пилот

- 5 независимых аккаунтов/сессий;
- сначала только batch 1 на всех пяти аккаунтах;
- проверить качество и стабильность формата;
- затем batches 2–5;
- 10 параметров на batch;
- до 250 сырых записей.

Одинаковые параметры в нескольких аккаунтах не удаляются бесследно: после dedup у canonical record сохраняются `source_count`, список batches и частота появления.
