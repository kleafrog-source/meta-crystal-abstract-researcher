# Crystal Bridge Implementation Summary

## Обзор реализации

Мост **Crystal Bridge** успешно интегрирован в проект `strudel-flow` для преобразования абстрактных состояний мета-кристаллов из приложения `meta-crystal-abstract-researcher` в музыкальные модули Strudel с использованием семантического поиска на основе RAG.

## Созданные файлы

### 1. Типы и интерфейсы
- **`src/lib/strudel/types-crystal-bridge.ts`** - TypeScript типы для моста
  - `MetaCrystalState` - состояние мета-кристалла
  - `CrystalBridgeResult` - результат работы моста
  - `BridgeConfig` - конфигурация
  - `StrudelSuggestion` - alias для результатов поиска

### 2. Логика моста
- **`src/lib/strudel/CrystalToStrudelBridge.ts`** - основная логика
  - `DIMENSION_MAPPINGS` - словарь перевода измерений в музыкальные термины
  - `generateQueryFromCrystal()` - генерация поискового запроса
  - `CrystalToStrudelBridge` - класс моста
  - `createCrystalBridge()` - фабричная функция

### 3. React компонент
- **`src/components/strudel-flow/crystal-bridge/CrystalBridgePanel.tsx`** - UI панель
  - Визуализация состояния кристалла
  - Индикатор уверенности
  - Список рекомендаций
  - Поддержка авто-применения

### 4. Экспорты
- **`src/components/strudel-flow/crystal-bridge/index.ts`** - экспорт модуля
- **`src/components/strudel-flow/index.ts`** - обновлен с экспортом Crystal Bridge
- **`src/lib/strudel/index.ts`** - экспорт из lib

### 5. Документация и примеры
- **`src/components/strudel-flow/crystal-bridge/README.md`** - полная документация
- **`src/components/strudel-flow/crystal-bridge/example-usage.tsx`** - примеры использования

### 6. Обновленные типы
- **`src/components/strudel-flow/types.ts`** - добавлены:
  - `StrudelSuggestion` (alias)
  - `StrudelParamDBItem`

## Архитектура

```
┌─────────────────────────┐
│  Meta-Crystal State     │
│  (Abstract Researcher)  │
│                         │
│  - dimensions           │
│    • complexity: 0.75   │
│    • chaos: 0.6         │
│    • harmony: 0.4       │
│    • density: 0.8       │
│  - tags: [...]          │
│  - description: "..."   │
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│  Crystal Bridge         │
│                         │
│  1. generateQueryFrom-  │
│     Crystal()           │
│     ↓                   │
│  2. semantic search     │
│     ↓                   │
│  3. calculateConfidence │
│     ↓                   │
│  4. generateExplanation │
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│  Strudel Flow Nodes     │
│                         │
│  - oscillators          │
│  - effects              │
│  - patterns             │
│                         │
│  Added via Zustand      │
│  store integration      │
└─────────────────────────┘
```

## Ключевые возможности

### 1. Семантическая генерация запросов
Три стиля генерации:
- **Technical** (по умолчанию) - технические термины
- **Literal** - прямое описание характеристик
- **Metaphorical** - образное описание

### 2. Словарь измерений
| Измерение | Низкое (0.0-0.5) | Высокое (0.5-1.0) |
|-----------|------------------|-------------------|
| Complexity | simple, minimal | complex, layered |
| Chaos | ordered, stable | chaotic, glitch |
| Harmony | dissonant, tense | harmonious, warm |
| Density | sparse, ambient | dense, compressed |

### 3. Расчет уверенности
```typescript
confidence = (baseConfidence * 0.4) + 
             (avgScore * 0.4) + 
             (dimensionClarity * 0.2)
```

### 4. Авто-применение
При `confidence >= threshold` (по умолчанию 0.75) топ-1 рекомендация применяется автоматически.

## Использование

### Базовый пример
```tsx
import { CrystalBridgePanel } from '@/components/strudel-flow/crystal-bridge';

<CrystalBridgePanel
  crystal={currentCrystal}
  onSearch={async (query) => {
    const res = await fetch('/api/strudel/search', {
      method: 'POST',
      body: JSON.stringify({ query })
    });
    return res.json();
  }}
  autoApply={false}
  verbose={true}
/>
```

### Программный API
```typescript
import { CrystalToStrudelBridge } from '@/lib/strudel/CrystalToStrudelBridge';

const bridge = new CrystalToStrudelBridge({
  maxSuggestions: 5,
  autoApplyThreshold: 0.8,
  promptStyle: 'technical'
});

const result = await bridge.transform(crystal, searchFunction);

if (bridge.shouldAutoApply(result.confidence)) {
  // Применить автоматически
}

const explanation = bridge.generateExplanation(crystal, result);
```

## API Endpoints

### POST `/api/strudel/search`
Поиск параметров Strudel по запросу.

**Request:**
```json
{
  "query": "dark glitch bass with complex modulation",
  "limit": 5
}
```

**Response:**
```json
{
  "suggestions": [
    {
      "id": "crush",
      "name": "Crush",
      "description": "Bit-crushing effect",
      "category": "Audio Effects",
      "score": 0.89
    }
  ]
}
```

## Примеры сценариев

### Сценарий 1: Эмбиент
```typescript
{
  name: 'Ethereal Void',
  dimensions: {
    complexity: 0.2,  // simple
    chaos: 0.1,       // ordered
    harmony: 0.8,     // harmonious
    density: 0.1      // sparse
  },
  tags: ['ambient', 'meditative']
}
// → reverb, delay, lpf, sine
```

### Сценарий 2: Глитч/IDM
```typescript
{
  name: 'Digital Decay',
  dimensions: {
    complexity: 0.7,  // complex
    chaos: 0.9,       // chaotic
    harmony: 0.3,     // dissonant
    density: 0.6      // dense
  },
  tags: ['glitch', 'experimental']
}
// → crush, arp, random, distortion
```

## Интеграция с Meta-Crystal Abstract Researcher

```tsx
import { useCrystalStore } from 'meta-crystal-abstract-researcher';
import { CrystalBridgePanel } from '@/components/strudel-flow/crystal-bridge';

function IntegratedView() {
  const currentCrystal = useCrystalStore(state => state.currentCrystal);
  
  return (
    <CrystalBridgePanel
      crystal={currentCrystal}
      onSearch={searchStrudel}
      onApplied={(result) => {
        // Сохранить связь между кристаллом и узлами
        saveCrystalToNodesMapping(currentCrystal.id, result.suggestions);
      }}
    />
  );
}
```

## Тестирование

Build прошел успешно:
```bash
npm run build
# ✓ Compiled successfully
# ✓ Static pages generated
# ✓ Dynamic routes created
```

## Зависимости

- `@/lib/strudel/strudel-flow-store` - Zustand store
- `@/components/ui/*` - shadcn/ui компоненты
- `lucide-react` - иконки
- `/api/strudel/search` - backend API для семантического поиска

## Следующие шаги

1. **Тестирование с реальными данными** - подключить к actual meta-crystal store
2. **Настройка порогов** - калибровка `autoApplyThreshold` на реальных данных
3. **Расширение словаря** - добавить больше музыкальных терминов для измерений
4. **Визуализация связей** - показать граф связей между кристаллами и узлами
5. **Экспорт паттернов** - генерация готового кода Strudel на основе рекомендаций

## Лицензия

MIT
