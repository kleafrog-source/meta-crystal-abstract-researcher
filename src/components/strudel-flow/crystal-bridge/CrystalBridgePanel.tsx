'use client';

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { MetaCrystalState, StrudelSuggestion } from '@/lib/strudel/types-crystal-bridge';
import { CrystalToStrudelBridge } from '@/lib/strudel/CrystalToStrudelBridge';
import { useStrudelFlowStore, createNodeFromSearchResult } from '@/lib/strudel/strudel-flow-store';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Sparkles, ArrowRight, CheckCircle2, AlertCircle, Loader2 } from '@/components/icons';

interface CrystalBridgePanelProps {
  /** Текущее состояние мета-кристалла */
  crystal: MetaCrystalState | null;
  /** Функция поиска (обычно вызов API) */
  onSearch: (query: string) => Promise<StrudelSuggestion[]>;
  /** Callback при успешном применении */
  onApplied?: (result: { query: string; suggestions: StrudelSuggestion[] }) => void;
  /** Автоматически применять при высокой уверенности */
  autoApply?: boolean;
  /** Показывать ли подробную информацию */
  verbose?: boolean;
}

/**
 * React компонент панели моста между Meta-Crystal и Strudel
 * Отображает состояние кристалла, генерирует запрос и показывает рекомендации
 */
export function CrystalBridgePanel({
  crystal,
  onSearch,
  onApplied,
  autoApply = false,
  verbose = true
}: CrystalBridgePanelProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<{
    query: string;
    suggestions: StrudelSuggestion[];
    confidence: number;
    explanation: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const addNode = useStrudelFlowStore((state) => state.addNode);

  const bridge = useMemo(() => new CrystalToStrudelBridge({
    maxSuggestions: 5,
    autoApplyThreshold: autoApply ? 0.75 : 0.9
  }), [autoApply]);

  // Применение отдельного предложения
  const handleApplySuggestion = useCallback((suggestion: StrudelSuggestion) => {
    addNode(createNodeFromSearchResult(suggestion));
  }, [addNode]);

  // Обработка трансформации кристалла в предложения
  const handleTransform = useCallback(async () => {
    if (!crystal) return;

    setIsProcessing(true);
    setError(null);

    try {
      const bridgeResult = await bridge.transform(crystal, onSearch);
      const explanation = bridge.generateExplanation(crystal, bridgeResult);

      setResult({
        query: bridgeResult.query,
        suggestions: bridgeResult.suggestions,
        confidence: bridgeResult.confidence,
        explanation
      });

      if (autoApply && bridge.shouldAutoApply(bridgeResult.confidence)) {
        const topSuggestion = bridgeResult.suggestions[0];
        if (topSuggestion) {
          handleApplySuggestion(topSuggestion);
          onApplied?.({
            query: bridgeResult.query,
            suggestions: bridgeResult.suggestions
          });
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка обработки кристалла');
    } finally {
      setIsProcessing(false);
    }
  }, [autoApply, bridge, crystal, handleApplySuggestion, onApplied, onSearch]);

  // Эффект для авто-обработки при изменении кристалла
  useEffect(() => {
    if (autoApply && crystal) {
      handleTransform();
    }
  }, [autoApply, crystal, handleTransform]);

  if (!crystal) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Sparkles className="w-5 h-5" />
            Crystal → Strudel Bridge
          </CardTitle>
          <CardDescription>
            Преобразуйте мета-кристалл в музыкальные модули
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Alert variant="default">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Выберите или создайте мета-кристалл для начала работы
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-purple-500" />
          Crystal → Strudel Bridge
        </CardTitle>
        <CardDescription>
          Трансформация абстрактных измерений в звуковые модули
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Информация о кристалле */}
        <div className="p-3 bg-muted rounded-lg">
          <div className="font-medium mb-2">{crystal.name}</div>
          
          {verbose && (
            <>
              <div className="grid grid-cols-2 gap-2 text-xs mb-2">
                <div className="flex justify-between">
                  <span>Complexity:</span>
                  <span className="font-mono">{crystal.dimensions.complexity.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Chaos:</span>
                  <span className="font-mono">{crystal.dimensions.chaos.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Harmony:</span>
                  <span className="font-mono">{crystal.dimensions.harmony.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Density:</span>
                  <span className="font-mono">{crystal.dimensions.density.toFixed(2)}</span>
                </div>
              </div>
              
              {crystal.tags.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {crystal.tags.slice(0, 5).map((tag, i) => (
                    <Badge key={i} variant="secondary" className="text-xs">
                      {tag}
                    </Badge>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Кнопка трансформации */}
        {!autoApply && (
          <Button
            onClick={handleTransform}
            disabled={isProcessing}
            className="w-full"
          >
            {isProcessing ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Обработка...
              </>
            ) : (
              <>
                <ArrowRight className="w-4 h-4 mr-2" />
                Сгенерировать предложения
              </>
            )}
          </Button>
        )}

        {/* Ошибка */}
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Результаты */}
        {result && (
          <div className="space-y-3">
            {/* Индикатор уверенности */}
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <div className="flex justify-between text-xs mb-1">
                  <span>Уверенность</span>
                  <span className="font-medium">
                    {(result.confidence * 100).toFixed(0)}%
                  </span>
                </div>
                <div className="h-2 bg-secondary rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all ${
                      result.confidence > 0.75
                        ? 'bg-green-500'
                        : result.confidence > 0.5
                        ? 'bg-yellow-500'
                        : 'bg-red-500'
                    }`}
                    style={{ width: `${result.confidence * 100}%` }}
                  />
                </div>
              </div>
              {result.confidence > 0.75 && (
                <CheckCircle2 className="w-5 h-5 text-green-500" />
              )}
            </div>

            {/* Объяснение */}
            {verbose && (
              <Alert>
                <AlertDescription className="text-sm">
                  {result.explanation}
                </AlertDescription>
              </Alert>
            )}

            {/* Список предложений */}
            <div className="space-y-2">
              <div className="text-sm font-medium">Рекомендуемые модули:</div>
              {result.suggestions.map((suggestion, index) => (
                <div
                  key={suggestion.id}
                  className="p-3 border rounded-lg hover:bg-accent transition-colors cursor-pointer"
                  onClick={() => handleApplySuggestion(suggestion)}
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="font-medium text-sm">
                        {index + 1}. {suggestion.name}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {suggestion.description}
                      </div>
                      {suggestion.category && (
                        <Badge variant="outline" className="mt-2 text-xs">
                          {suggestion.category}
                        </Badge>
                      )}
                    </div>
                    <div className="text-right">
                      <div className="text-xs font-mono">
                        {(suggestion.score * 100).toFixed(0)}%
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Сгенерированный запрос (для отладки) */}
            {verbose && (
              <details className="text-xs">
                <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                  Показать сгенерированный запрос
                </summary>
                <div className="mt-2 p-2 bg-muted rounded font-mono text-xs break-words">
                  {result.query}
                </div>
              </details>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default CrystalBridgePanel;
