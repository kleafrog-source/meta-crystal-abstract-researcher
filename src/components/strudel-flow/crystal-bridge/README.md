# Crystal Bridge: Meta-Crystal → Strudel

Мост для преобразования абстрактных состояний мета-кристаллов в музыкальные модули Strudel с использованием семантического поиска.

## Архитектура

```
┌─────────────────────┐     ┌──────────────────────┐     ┌─────────────────┐
│  Meta-Crystal       │     │  Crystal Bridge      │     │  Strudel Flow   │
│  (Abstract State)   │────▶│  (Query Generator)   │────▶│  (Music Nodes)  │
│                     │     │                      │     │                 │
│ - dimensions        │     │ - semantic mapping   │     │ - oscillators   │
│ - tags              │     │ - confidence score   │     │ - effects       │
│ - description       │     │ - auto-apply logic   │     │ - patterns      │
└─────────────────────┘     └──────────────────────┘     └─────────────────┘
```

## Компоненты

### 1. Типы (`types-crystal-bridge.ts`)

```typescript
interface MetaCrystalState {
  id: string;
  name: string;
  dimensions: {
    complexity: number; // 0-1
    chaos: number;      // 0-1
    harmony: number;    // 0-1
    density: number;    // 0-1
  };
  tags: string[];
  description: string;
}
```

### 2. Логика моста (`CrystalToStrudelBridge.ts`)

- **`generateQueryFromCrystal()`** - Преобразует измерения кристалла в поисковый запрос
- **`CrystalToStrudelBridge.transform()`** - Полный цикл трансформации
- **`calculateConfidence()`** - Оценка уверенности сопоставления

#### Словарь измерений

| Измерение | Низкое значение (0.0-0.5) | Высокое значение (0.5-1.0) |
|-----------|---------------------------|----------------------------|
| Complexity | simple, minimal, clean | complex, layered, dense, polyphonic |
| Chaos | ordered, stable, harmonic | chaotic, glitch, distorted, noisy |
| Harmony | dissonant, tense, atonal | harmonious, melodic, warm, smooth |
| Density | sparse, empty, ambient | dense, full, rich, compressed |

### 3. React компонент (`CrystalBridgePanel.tsx`)

UI панель с:
- Визуализацией состояния кристалла
- Индикатором уверенности
- Списком рекомендаций
- Возможностью авто-применения

## Использование

### Базовый пример

```tsx
import { CrystalBridgePanel } from '@/components/strudel-flow/crystal-bridge';
import { MetaCrystalState } from '@/lib/strudel/types-crystal-bridge';

const crystal: MetaCrystalState = {
  id: 'crystal-1',
  name: 'Cyber Dreamscape',
  dimensions: {
    complexity: 0.8,
    chaos: 0.6,
    harmony: 0.3,
    density: 0.7
  },
  tags: ['cyberpunk', 'glitch', 'bass'],
  description: 'Dark electronic landscape with glitch elements'
};

async function searchStrudel(query: string) {
  const res = await fetch('/api/strudel/search', {
    method: 'POST',
    body: JSON.stringify({ query })
  });
  return res.json();
}

function MyComponent() {
  return (
    <CrystalBridgePanel
      crystal={crystal}
      onSearch={searchStrudel}
      onApplied={(result) => console.log('Applied:', result)}
      autoApply={false}
      verbose={true}
    />
  );
}
```

### Режим авто-применения

```tsx
<CrystalBridgePanel
  crystal={crystal}
  onSearch={searchStrudel}
  autoApply={true}  // Автоматически применит при confidence > 0.75
/>
```

### Программное использование

```typescript
import { CrystalToStrudelBridge, generateQueryFromCrystal } from '@/lib/strudel/CrystalToStrudelBridge';

const bridge = new CrystalToStrudelBridge({
  maxSuggestions: 5,
  autoApplyThreshold: 0.8
});

const result = await bridge.transform(crystal, searchStrudel);

console.log('Generated query:', result.query);
console.log('Suggestions:', result.suggestions);
console.log('Confidence:', result.confidence);

if (bridge.shouldAutoApply(result.confidence)) {
  // Применить автоматически
}
```

## API Endpoints

### POST `/api/strudel/search`

Поиск параметров Strudel по текстовому запросу.

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

## Генерация запросов

Мост поддерживает три стиля генерации запросов:

### 1. Technical (по умолчанию)
```
audio processing: effects like distortion, bitcrush, glitch. 
full frequency spectrum with compression
```

### 2. Literal
```
sound characteristics: complex, chaotic, dissonant, dense
```

### 3. Metaphorical
```
imagine a sound that is complex yet chaotic yet dissonant yet dense
```

Настройка:
```typescript
const bridge = new CrystalToStrudelBridge({
  promptStyle: 'metaphorical'
});
```

## Конфигурация

```typescript
interface BridgeConfig {
  autoApplyThreshold?: number;  // Порог авто-применения (0-1)
  maxSuggestions?: number;       // Макс. количество предложений
  includeDescription?: boolean;  // Включать описание кристалла
  includeTags?: boolean;         // Включать теги
  promptStyle?: 'literal' | 'metaphorical' | 'technical';
}
```

## Интеграция с Meta-Crystal Abstract Researcher

Для интеграции с приложением `meta-crystal-abstract-researcher`:

1. Импортируйте `MetaCrystalState` из соответствующего репозитория
2. Используйте хук или контекст для получения текущего состояния кристалла
3. Передайте состояние в `CrystalBridgePanel`

```tsx
import { useCrystalStore } from 'meta-crystal-abstract-researcher';
import { CrystalBridgePanel } from '@/components/strudel-flow/crystal-bridge';

function IntegratedView() {
  const currentCrystal = useCrystalStore(state => state.currentCrystal);
  
  return (
    <CrystalBridgePanel
      crystal={currentCrystal}
      onSearch={searchStrudel}
    />
  );
}
```

## Зависимости

- `@/lib/strudel/strudel-flow-store` - Zustand store для управления узлами
- `@/components/ui/*` - shadcn/ui компоненты
- `lucide-react` - иконки

## Примеры сценариев

### Сценарий 1: Эмбиент кристалл
```typescript
{
  name: 'Ethereal Void',
  dimensions: {
    complexity: 0.2,  // simple
    chaos: 0.1,       // ordered
    harmony: 0.8,     // harmonious
    density: 0.1      // sparse
  },
  tags: ['ambient', 'meditative', 'space']
}
// → Рекомендации: reverb, delay, lpf, sine oscillator
```

### Сценарий 2: Глитч кристалл
```typescript
{
  name: 'Digital Decay',
  dimensions: {
    complexity: 0.7,  // complex
    chaos: 0.9,       // chaotic
    harmony: 0.3,     // dissonant
    density: 0.6      // moderately dense
  },
  tags: ['glitch', 'idm', 'experimental']
}
// → Рекомендации: crush, glitch, arp, random pattern
```

## Лицензия

MIT
