/**
 * Crystal Bridge Module - Экспорт всех компонентов моста Meta-Crystal ↔ Strudel
 */

// Типы
export {
  MetaCrystalState,
  CrystalBridgeResult,
  BridgeConfig,
  StrudelSuggestion,
} from '@/lib/strudel/types-crystal-bridge';

// Логика моста
export {
  CrystalToStrudelBridge,
  createCrystalBridge,
  generateQueryFromCrystal
} from '@/lib/strudel/CrystalToStrudelBridge';

// React компонент
export { CrystalBridgePanel } from './CrystalBridgePanel';
