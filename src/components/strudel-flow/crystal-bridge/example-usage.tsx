/**
 * Пример использования Crystal Bridge в приложении Meta-Crystal
 * 
 * Этот файл демонстрирует интеграцию моста между мета-кристаллами
 * и семантическим поиском Strudel параметров.
 */

import { MetaCrystalState } from '@/lib/strudel/types-crystal-bridge';
import { CrystalBridgePanel } from '@/components/strudel-flow/crystal-bridge';

// Пример состояния мета-кристалла из meta-crystal-abstract-researcher
const exampleCrystal: MetaCrystalState = {
  id: 'crystal-001',
  name: 'Neon Dreamscape',
  dimensions: {
    complexity: 0.75,  // Высокая сложность
    chaos: 0.6,        // Умеренный хаос
    harmony: 0.4,      // Низкая гармония (диссонанс)
    density: 0.8       // Высокая плотность
  },
  tags: ['cyberpunk', 'atmospheric', 'glitch', 'bass-heavy'],
  description: 'Темный электронный ландшафт с глитч-элементами и глубоким басом',
  history: [
    'Initial formation',
    'Chaos infusion',
    'Density compression'
  ]
};

/**
 * Функция поиска через API
 */
async function searchStrudelParams(query: string) {
  const response = await fetch('/api/strudel/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, limit: 5 })
  });
  
  if (!response.ok) {
    throw new Error('Search failed');
  }
  
  const data = await response.json();
  return data.suggestions;
}

/**
 * Компонент интеграции в приложение Meta-Crystal
 */
export function MetaCrystalStrudelIntegration() {
  const handleApplied = (result: { query: string; suggestions: any[] }) => {
    console.log('Applied to flow:', result);
    // Здесь можно добавить дополнительную логику
    // например, сохранить связь между кристаллом и узлами Strudel
  };

  return (
    <div className="p-4 space-y-4">
      <h2 className="text-xl font-bold">Meta-Crystal → Strudel Bridge</h2>
      
      {/* Панель моста */}
      <CrystalBridgePanel
        crystal={exampleCrystal}
        onSearch={searchStrudelParams}
        onApplied={handleApplied}
        autoApply={false}
        verbose={true}
      />

      {/* Пример с авто-применением */}
      <div className="mt-8">
        <h3 className="text-lg font-semibold mb-2">Режим авто-применения</h3>
        <CrystalBridgePanel
          crystal={{
            ...exampleCrystal,
            name: 'Auto-Test Crystal'
          }}
          onSearch={searchStrudelParams}
          onApplied={handleApplied}
          autoApply={true}
          verbose={false}
        />
      </div>
    </div>
  );
}

export default MetaCrystalStrudelIntegration;
