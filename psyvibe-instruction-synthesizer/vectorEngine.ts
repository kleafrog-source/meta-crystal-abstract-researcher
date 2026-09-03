import { MMSSParameter } from './types';
import { MMSS_PARAMETERS } from './paramsData';

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s\u0400-\u04FF]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1);
}

export interface RetrievalResult {
  param: MMSSParameter;
  score: number;
  matchedKeywords: string[];
}

export function retrieveSemanticParameters(
  query: string,
  topK: number = 30
): RetrievalResult[] {
  if (!query || query.trim().length === 0) {
    return MMSS_PARAMETERS.map((param) => ({
      param,
      score: 1.0,
      matchedKeywords: [],
    }));
  }

  const queryTokens = tokenize(query);

  const results: RetrievalResult[] = MMSS_PARAMETERS.map((param) => {
    const textToEmbed = `${param.label} ${param.description} ${param.mmssMapping} ${param.tags.join(' ')} ${param.category}`;
    const paramTokens = tokenize(textToEmbed);

    let tokenMatches = 0;
    const matchedKeywords: string[] = [];

    queryTokens.forEach((qToken) => {
      let matched = false;
      paramTokens.forEach((pToken) => {
        if (pToken.includes(qToken) || qToken.includes(pToken)) {
          matched = true;
          if (!matchedKeywords.includes(qToken)) {
            matchedKeywords.push(qToken);
          }
        }
      });
      if (matched) tokenMatches++;
    });

    const tfScore = tokenMatches / Math.max(queryTokens.length, 1);
    
    let tagBonus = 0;
    param.tags.forEach(tag => {
      if (queryTokens.some(q => tag.includes(q) || q.includes(tag))) {
        tagBonus += 0.25;
      }
    });

    let semanticBonus = 0;
    const qLower = query.toLowerCase();
    if ((qLower.includes('scratch') || qLower.includes('vinyl') || qLower.includes('paulstretch')) && param.category === 'liquid') {
      semanticBonus += 0.4;
    }
    if ((qLower.includes('metal') || qLower.includes('metalcore') || qLower.includes('industrial')) && (param.category === 'spatial' || param.id.includes('metal'))) {
      semanticBonus += 0.4;
    }
    if ((qLower.includes('lyric') || qLower.includes('vocal') || qLower.includes('text')) && param.category === 'lfe') {
      semanticBonus += 0.4;
    }
    if ((qLower.includes('phase') || qLower.includes('time') || qLower.includes('sequence')) && param.category === 'phases') {
      semanticBonus += 0.35;
    }
    if ((qLower.includes('reset') || qLower.includes('universe') || qLower.includes('axiom')) && param.category === 'axioms') {
      semanticBonus += 0.35;
    }
    if ((qLower.includes('metric') || qLower.includes('singularity') || qLower.includes('fractal')) && param.category === 'metrics') {
      semanticBonus += 0.35;
    }

    const rawScore = (tfScore * 0.4) + Math.min(tagBonus, 0.3) + semanticBonus;
    const score = Math.min(0.99, Math.max(0.08, Number(rawScore.toFixed(3))));

    return {
      param,
      score,
      matchedKeywords,
    };
  });

  results.sort((a, b) => b.score - a.score);

  return results.slice(0, topK);
}