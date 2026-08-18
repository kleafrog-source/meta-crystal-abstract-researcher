import type { StrudelSearchResult } from '../components/strudel-flow/types';

// Alias for Crystal Bridge usage
export type StrudelSuggestion = StrudelSearchResult;

/**
 * Структура Мета-Кристалла (упрощенная модель из meta-crystal-abstract-researcher)
 */
export interface MetaCrystalState {
  id: string;
  name: string;
  // Абстрактные измерения кристалла
  dimensions: {
    complexity: number; // 0-1
    chaos: number;      // 0-1
    harmony: number;    // 0-1
    density: number;    // 0-1
  };
  // Семантические теги, описывающие кристалл
  tags: string[];
  // Описание природы кристалла
  description: string;
  // История трансформаций (опционально)
  history?: string[];
}

/**
 * Результат работы моста
 */
export interface CrystalBridgeResult {
  query: string; // Сгенерированный поисковый запрос
  suggestions: StrudelSuggestion[]; // Найденные узлы Strudel
  confidence: number; // Оценка уверенности сопоставления
  timestamp: number;
}

/**
 * Конфигурация моста
 */
export interface BridgeConfig {
  // Порог уверенности для автоматического применения (0-1)
  autoApplyThreshold?: number;
  // Максимальное количество предложений
  maxSuggestions?: number;
  // Включать ли описание кристалла в запрос
  includeDescription?: boolean;
  // Включать ли теги в запрос
  includeTags?: boolean;
  // Стиль генерации запроса ('literal' | 'metaphorical' | 'technical')
  promptStyle?: 'literal' | 'metaphorical' | 'technical';
}
