import { MMSSParameter } from './types';

export function assembleMMSSInstruction(
  selectedValues: Record<string, any>,
  allParams: MMSSParameter[],
  protocolTitle: string = 'CUSTOM_MMSS_SYNTHESIS_PROTOCOL'
): string {
  const activeParams = allParams.filter(p => selectedValues[p.id] !== undefined);

  const grouped: Record<string, { param: MMSSParameter; val: any }[]> = {};

  activeParams.forEach(p => {
    if (!grouped[p.category]) grouped[p.category] = [];
    grouped[p.category].push({ param: p, val: selectedValues[p.id] });
  });

  const jsonOutput: Record<string, any> = {
    [protocolTitle]: {
      mode: 'STRONG_RESET_INDEPENDENCE',
      timestamp: new Date().toISOString(),
      embedding_model: 'bge-m3_local_dense_retrieval',
      active_parameters_count: activeParams.length,
      configured_modules: Object.keys(grouped),
    }
  };

  Object.entries(grouped).forEach(([catId, items]) => {
    const sectionData: Record<string, any> = {};
    items.forEach(({ param, val }) => {
      sectionData[param.id] = {
        label: param.label,
        value: val,
        unit: param.unit || null,
        mmss_mapping: param.mmssMapping
      };
    });
    jsonOutput[protocolTitle][`MODULE_${catId.toUpperCase()}`] = sectionData;
  });

  return JSON.stringify(jsonOutput, null, 2);
}
