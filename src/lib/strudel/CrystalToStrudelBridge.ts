import { MetaCrystalState, CrystalBridgeResult, BridgeConfig, StrudelSuggestion } from './types-crystal-bridge';

/**
 * Словарь для перевода абстрактных измерений кристалла в музыкальные термины
 */
const DIMENSION_MAPPINGS = {
  complexity: {
    low: ['simple', 'minimal', 'basic', 'clean'],
    high: ['complex', 'layered', 'dense', 'intricate', 'polyphonic']
  },
  chaos: {
    low: ['ordered', 'stable', 'predictable', 'harmonic'],
    high: ['chaotic', 'random', 'glitch', 'distorted', 'noisy', 'experimental']
  },
  harmony: {
    low: ['dissonant', 'tense', 'clashing', 'atonal'],
    high: ['harmonious', 'melodic', 'consonant', 'smooth', 'warm']
  },
  density: {
    low: ['sparse', 'empty', 'ambient', 'spacious'],
    high: ['dense', 'full', 'rich', 'heavy', 'compressed']
  }
};

const DIMENSION_HINTS = {
  complexity: {
    low: ['sine', 'triangle', 'note', 'slow'],
    high: ['fm', 'am', 'chord', 'seq', 'layered modulation']
  },
  chaos: {
    low: ['clean', 'stable', 'scale', 'note'],
    high: ['distort', 'crush', 'rand', 'euclid', 'glitch']
  },
  harmony: {
    low: ['dissonant', 'transpose', 'atonal'],
    high: ['chord', 'scale', 'reverb', 'warm harmony']
  },
  density: {
    low: ['sparse', 'reverb', 'delay', 'slow'],
    high: ['density', 'chunk', 'arp', 'fast']
  }
} as const;

const TAG_HINTS: Array<{ match: RegExp; hints: string[] }> = [
  { match: /ретро|chiptune|8[- ]?bit|игров/i, hints: ['square', 'crush', 'arp'] },
  { match: /эмбиент|ambient|простран|space|атмос/i, hints: ['reverb', 'delay', 'slow', 'sine'] },
  { match: /бас|bass|sub/i, hints: ['sine', 'sawtooth', 'lpf'] },
  { match: /агресс|distort|гряз|жестк/i, hints: ['distort', 'crush', 'hpf'] },
  { match: /ритм|rhythm|перкус|drum/i, hints: ['seq', 'euclid', 'chunk'] },
  { match: /мелод|harmony|гармон|тональ/i, hints: ['note', 'scale', 'chord'] },
  { match: /хаос|chaos|случайн|random|парадокс/i, hints: ['rand', 'euclid', 'distort'] },
];

/**
 * Преобразует числовое значение измерения в качественный дескриптор
 */
function getDimensionDescriptor(value: number, dimension: keyof typeof DIMENSION_MAPPINGS): string {
  const mappings = DIMENSION_MAPPINGS[dimension];
  const threshold = 0.5;
  
  if (value < threshold) {
    return mappings.low[Math.floor(value * threshold * mappings.low.length)];
  } else {
    const normalizedValue = (value - threshold) / (1 - threshold);
    return mappings.high[Math.min(Math.floor(normalizedValue * mappings.high.length), mappings.high.length - 1)];
  }
}

/**
 * Генерирует поисковый запрос на основе состояния Мета-Кристалла
 */
export function generateQueryFromCrystal(
  crystal: MetaCrystalState,
  config: BridgeConfig = {}
): string {
  const {
    includeDescription = true,
    includeTags = true,
    promptStyle = 'technical'
  } = config;

  const parts: string[] = [];
  const directHints = new Set<string>();

  // Добавляем описание кристалла, если включено
  if (includeDescription && crystal.description) {
    parts.push(crystal.description);
    for (const rule of TAG_HINTS) {
      if (rule.match.test(crystal.description)) {
        rule.hints.forEach((hint) => directHints.add(hint));
      }
    }
  }

  // Добавляем теги
  if (includeTags && crystal.tags.length > 0) {
    parts.push(`tags: ${crystal.tags.join(', ')}`);
    for (const tag of crystal.tags) {
      for (const rule of TAG_HINTS) {
        if (rule.match.test(tag)) {
          rule.hints.forEach((hint) => directHints.add(hint));
        }
      }
    }
  }

  // Генерируем описания на основе измерений
  const dimensionDescriptors = Object.entries(crystal.dimensions)
    .map(([key, value]) => {
      const descriptor = getDimensionDescriptor(value, key as keyof typeof DIMENSION_MAPPINGS);
      const bucket = value >= 0.5 ? 'high' : 'low';
      for (const hint of DIMENSION_HINTS[key as keyof typeof DIMENSION_HINTS][bucket]) {
        directHints.add(hint);
      }
      return descriptor;
    })
    .filter(Boolean);

  if (dimensionDescriptors.length > 0) {
    if (promptStyle === 'literal') {
      parts.push(`sound characteristics: ${dimensionDescriptors.join(', ')}`);
    } else if (promptStyle === 'metaphorical') {
      parts.push(`imagine a sound that is ${dimensionDescriptors.join(' yet ')}`);
    } else {
      // technical style
      const technicalMapping: Record<string, string> = {
        complexity: dimensionDescriptors.some(d => ['complex', 'layered', 'dense'].includes(d)) 
          ? 'complex modulation and layering' 
          : 'simple structure',
        chaos: dimensionDescriptors.some(d => ['chaotic', 'glitch', 'distorted'].includes(d))
          ? 'effects like distortion, bitcrush, glitch'
          : 'clean signal path',
        harmony: dimensionDescriptors.some(d => ['harmonious', 'melodic', 'warm'].includes(d))
          ? 'warm filters and harmonic content'
          : 'dissonant tuning or atonal elements',
        density: dimensionDescriptors.some(d => ['dense', 'full', 'compressed'].includes(d))
          ? 'full frequency spectrum with compression'
          : 'sparse arrangement with reverb'
      };

      const technicalTerms = Object.entries(technicalMapping)
        .filter(([key]) => crystal.dimensions[key as keyof typeof crystal.dimensions] > 0.3)
        .map(([, value]) => value);

      if (technicalTerms.length > 0) {
        parts.push(`audio processing: ${technicalTerms.join(', ')}`);
      }
    }
  }

  if (directHints.size > 0) {
    parts.push(`strudel hints: ${Array.from(directHints).join(', ')}`);
  }

  // Формируем итоговый запрос
  let query = parts.join('. ');
  
  // Добавляем контекст имени кристалла, если оно есть
  if (crystal.name && promptStyle !== 'technical') {
    query = `Create music inspired by "${crystal.name}": ${query}`;
  }

  return query;
}

/**
 * Вычисляет уверенность сопоставления на основе согласованности измерений
 */
function calculateConfidence(crystal: MetaCrystalState, suggestions: StrudelSuggestion[]): number {
  if (suggestions.length === 0) return 0;

  // Базовая уверенность зависит от количества найденных совпадений
  const baseConfidence = Math.min(suggestions.length / 5, 1);

  // Усиливаем уверенность, если средние scores высокие
  const avgScore = suggestions.reduce((sum, s) => sum + s.score, 0) / suggestions.length;
  
  // Учитываем "четкость" кристалла (насколько выражены его измерения)
  const dimensionValues = Object.values(crystal.dimensions);
  const avgDimension = dimensionValues.reduce((a, b) => a + b, 0) / dimensionValues.length;
  const dimensionClarity = Math.max(...dimensionValues) - Math.min(...dimensionValues);

  const confidence = (baseConfidence * 0.4) + (avgScore * 0.4) + (dimensionClarity * 0.2);
  
  return Math.min(Math.max(confidence, 0), 1);
}

/**
 * Основной класс моста между Meta-Crystal и Strudel
 */
export class CrystalToStrudelBridge {
  private config: BridgeConfig;

  constructor(config: BridgeConfig = {}) {
    this.config = {
      autoApplyThreshold: 0.8,
      maxSuggestions: 5,
      ...config
    };
  }

  /**
   * Преобразует состояние Мета-Кристалла в предложения узлов Strudel
   */
  async transform(
    crystal: MetaCrystalState,
    searchFunction: (query: string) => Promise<StrudelSuggestion[]>
  ): Promise<CrystalBridgeResult> {
    // Шаг 1: Генерация поискового запроса
    const query = generateQueryFromCrystal(crystal, this.config);

    // Шаг 2: Выполнение семантического поиска
    const suggestions = await searchFunction(query);

    // Ограничиваем количество предложений
    const limitedSuggestions = suggestions.slice(0, this.config.maxSuggestions || 5);

    // Шаг 3: Расчет уверенности
    const confidence = calculateConfidence(crystal, limitedSuggestions);

    return {
      query,
      suggestions: limitedSuggestions,
      confidence,
      timestamp: Date.now()
    };
  }

  /**
   * Проверяет, следует ли автоматически применять результаты
   */
  shouldAutoApply(confidence: number): boolean {
    return confidence >= (this.config.autoApplyThreshold || 0.8);
  }

  /**
   * Генерирует человеко-читаемое объяснение рекомендаций
   */
  generateExplanation(crystal: MetaCrystalState, result: CrystalBridgeResult): string {
    const { suggestions, confidence } = result;
    
    if (suggestions.length === 0) {
      return "Не удалось найти соответствующие звуковые модули для данного кристалла.";
    }

    const dimensionHighlights = Object.entries(crystal.dimensions)
      .filter(([, value]) => value > 0.6 || value < 0.4)
      .map(([key, value]) => {
        const descriptor = getDimensionDescriptor(value, key as keyof typeof DIMENSION_MAPPINGS);
        return `${key}: ${descriptor}`;
      });

    const moduleNames = suggestions.map(s => s.name).join(', ');

    return `На основе кристалла "${crystal.name}" (${dimensionHighlights.join(', ')}) ` +
           `рекомендуются модули: ${moduleNames}. ` +
           `Уверенность: ${(confidence * 100).toFixed(0)}%.`;
  }
}

/**
 * Хук-подобная функция для использования моста в React компонентах
 * (может быть преобразована в настоящий хук при необходимости)
 */
export function createCrystalBridge(config?: BridgeConfig) {
  return new CrystalToStrudelBridge(config);
}

export default CrystalToStrudelBridge;
