import React, { useState, useMemo } from 'react';
import { Search, Sliders, Cpu, Terminal, Copy, Check, RefreshCw, Zap, Layers, Sparkles, Filter } from 'lucide-react';
import { CATEGORIES, MMSS_PARAMETERS } from './paramsData';
import { retrieveSemanticParameters, RetrievalResult } from './vectorEngine';
import { assembleMMSSInstruction } from './instructionBuilder';
import { MMSSParameter, CategoryId } from './types';

export default function MMSSApp() {
  const [query, setQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<CategoryId | 'all'>('all');
  const [protocolTitle, setProtocolTitle] = useState('UNIFIED_MMSS_SYNTHESIS_PROTOCOL');
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<'controls' | 'preview'>('controls');

  // Initialize selected values with default parameter values
  const [values, setValues] = useState<Record<string, any>>(() => {
    const initial: Record<string, any> = {};
    MMSS_PARAMETERS.forEach((p) => {
      initial[p.id] = p.defaultValue;
    });
    return initial;
  });

  // Vector retrieval via bge-m3 embeddings simulation
  const retrievalResults: RetrievalResult[] = useMemo(() => {
    return retrieveSemanticParameters(query, 104);
  }, [query]);

  // Filtered list based on search/embedding scores + selected category tab
  const displayedParams = useMemo(() => {
    let list = retrievalResults;
    if (selectedCategory !== 'all') {
      list = list.filter((r) => r.param.category === selectedCategory);
    }
    return list;
  }, [retrievalResults, selectedCategory]);

  const handleValueChange = (id: string, val: any) => {
    setValues((prev) => ({
      ...prev,
      [id]: val,
    }));
  };

  const generatedInstructionJson = useMemo(() => {
    return assembleMMSSInstruction(values, MMSS_PARAMETERS, protocolTitle);
  }, [values, protocolTitle]);

  const copyToClipboard = () => {
    navigator.clipboard.writeText(generatedInstructionJson);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleResetDefaults = () => {
    const initial: Record<string, any> = {};
    MMSS_PARAMETERS.forEach((p) => {
      initial[p.id] = p.defaultValue;
    });
    setValues(initial);
  };

  // Quick preset query triggers
  const PRESET_QUERIES = [
    'paulstretch 600% viscous scratch textures liquid flow',
    'dehumanized metalcore cathedral reverb breakdown',
    'lyrics fusion phonetic collapse noise whisper',
    'strong reset independence zero flux monotonic path',
    'metric stability fractal dimension Df 91.5 golden ratio',
  ];

  return (
    <div className="min-h-screen w-full bg-slate-950 text-slate-100 flex flex-col font-mono selection:bg-cyan-500 selection:text-black">
      {/* Header Bar */}
      <header className="border-b border-cyan-900/50 bg-slate-900/80 backdrop-blur-md px-6 py-4 flex flex-wrap items-center justify-between gap-4 sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-cyan-950 border border-cyan-500/30 text-cyan-400">
            <Cpu className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-wider text-cyan-300 flex items-center gap-2">
              MMSS BGE-M3 SYNTHESIZER
              <span className="text-xs px-2 py-0.5 rounded bg-cyan-900/50 text-cyan-400 border border-cyan-500/30">
                104 CONTROLS
              </span>
            </h1>
            <p className="text-xs text-slate-400">
              Dense Vector Retrieval Configurator | bge-m3 Embedding Matching & Semantic Mapping
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleResetDefaults}
            className="px-3 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 border border-slate-700 flex items-center gap-2 transition"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Reset Defaults
          </button>

          <button
            onClick={copyToClipboard}
            className="px-4 py-2 rounded-md bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold text-xs flex items-center gap-2 transition shadow-lg shadow-cyan-950"
          >
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            {copied ? 'COPIED JSON!' : 'ASSEMBLE & COPY INSTRUCTION'}
          </button>
        </div>
      </header>

      {/* Main Grid Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Column: Semantic Retrieval Query & Controls (Cols 1-8) */}
        <div className="lg:col-span-8 flex flex-col gap-6">
          
          {/* BGE-M3 Embedding Query Input Panel */}
          <div className="p-5 rounded-xl bg-slate-900/90 border border-cyan-800/40 shadow-xl space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-cyan-400 uppercase tracking-widest flex items-center gap-2">
                <Search className="w-4 h-4 text-cyan-400" />
                BGE-M3 Vector Embedding Query Filter
              </label>
              <span className="text-[10px] text-slate-400 font-normal">
                Local Retrieval Engine Active
              </span>
            </div>

            <div className="relative">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Enter semantic query (e.g. 'paulstretch 600% scratch', 'metalcore breakdown', 'phase shift')..."
                className="w-full px-4 py-3 bg-slate-950 border border-cyan-900/60 rounded-lg text-sm text-cyan-100 placeholder-slate-500 focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 font-mono transition"
              />
              {query && (
                <button
                  onClick={() => setQuery('')}
                  className="absolute right-3 top-3 text-xs text-slate-400 hover:text-cyan-300"
                >
                  Clear
                </button>
              )}
            </div>

            {/* Query Presets */}
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <span className="text-[10px] text-slate-500 uppercase flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-cyan-400" /> Presets:
              </span>
              {PRESET_QUERIES.map((preset, idx) => (
                <button
                  key={idx}
                  onClick={() => setQuery(preset)}
                  className="text-[10px] px-2 py-1 rounded bg-slate-800/80 hover:bg-cyan-950/80 hover:border-cyan-500/50 border border-slate-700/60 text-slate-300 transition truncate max-w-[200px]"
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>

          {/* Category Tabs */}
          <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-800 pb-3">
            <button
              onClick={() => setSelectedCategory('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition flex items-center gap-1.5 ${
                selectedCategory === 'all'
                  ? 'bg-cyan-500 text-slate-950 font-bold shadow'
                  : 'bg-slate-900 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
              }`}
            >
              <Filter className="w-3.5 h-3.5" />
              ALL (104)
            </button>
            {CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition flex items-center gap-1 ${
                  selectedCategory === cat.id
                    ? 'bg-cyan-500 text-slate-950 font-bold shadow'
                    : 'bg-slate-900 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                }`}
              >
                <span>{cat.symbol}</span>
                <span>{cat.name.split('.')[1] || cat.name}</span>
              </button>
            ))}
          </div>

          {/* Parameter Controls List */}
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs text-slate-400 px-1">
              <span>Displaying {displayedParams.length} parameters</span>
              {query && (
                <span className="text-cyan-400 font-semibold">
                  Sorted by BGE-M3 Dense Cosine Similarity Score
                </span>
              )}
            </div>

            <div className="space-y-2.5">
              {displayedParams.map(({ param, score, matchedKeywords }) => (
                <div
                  key={param.id}
                  className="p-4 rounded-xl bg-slate-900/80 border border-slate-800/80 hover:border-cyan-900/60 transition group"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-slate-100 group-hover:text-cyan-300 transition">
                          {param.label}
                        </span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700/50 uppercase">
                          {param.type}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">{param.description}</p>
                      <p className="text-[11px] text-cyan-400/90 font-mono mt-1 flex items-center gap-1">
                        <span className="text-slate-500">MMSS:</span> {param.mmssMapping}
                      </p>
                    </div>

                    {/* Embedding Match Score Badge */}
                    {query && (
                      <div className="text-right">
                        <span className="inline-block text-[10px] px-2 py-0.5 rounded-full bg-cyan-950 border border-cyan-500/40 text-cyan-300 font-bold">
                          Score: {(score * 100).toFixed(1)}%
                        </span>
                      </div>
                    )}
                  </div>

                  {/* UI Inputs Control Binding */}
                  <div className="mt-3 pt-3 border-t border-slate-800/60">
                    
                    {/* Toggle Switch */}
                    {param.type === 'toggle' && (
                      <label className="inline-flex items-center cursor-pointer gap-3">
                        <input
                          type="checkbox"
                          checked={Boolean(values[param.id])}
                          onChange={(e) => handleValueChange(param.id, e.target.checked)}
                          className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-cyan-500 relative"></div>
                        <span className="text-xs font-semibold text-slate-300">
                          {values[param.id] ? 'ENABLED [TRUE]' : 'DISABLED [FALSE]'}
                        </span>
                      </label>
                    )}

                    {/* Number Input */}
                    {param.type === 'number' && (
                      <div className="flex items-center gap-3 max-w-xs">
                        <input
                          type="number"
                          min={param.min}
                          max={param.max}
                          step={param.step || 1}
                          value={values[param.id]}
                          onChange={(e) => handleValueChange(param.id, parseFloat(e.target.value))}
                          className="w-36 px-3 py-1.5 bg-slate-950 border border-slate-700 rounded text-xs text-cyan-200 font-mono focus:border-cyan-400 focus:outline-none"
                        />
                        {param.unit && <span className="text-xs text-slate-400">{param.unit}</span>}
                      </div>
                    )}

                    {/* Range Slider */}
                    {param.type === 'range' && (
                      <div className="space-y-1">
                        <div className="flex justify-between text-xs text-slate-400">
                          <span>Min: {param.min}</span>
                          <span className="font-bold text-cyan-300">
                            Current: {values[param.id]} {param.unit || ''}
                          </span>
                          <span>Max: {param.max}</span>
                        </div>
                        <input
                          type="range"
                          min={param.min}
                          max={param.max}
                          step={param.step || 0.01}
                          value={values[param.id]}
                          onChange={(e) => handleValueChange(param.id, parseFloat(e.target.value))}
                          className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-400"
                        />
                      </div>
                    )}

                    {/* Radio Button Options */}
                    {param.type === 'radio' && param.options && (
                      <div className="flex flex-wrap gap-3">
                        {param.options.map((opt) => (
                          <label key={opt.value} className="flex items-center gap-1.5 cursor-pointer text-xs text-slate-300">
                            <input
                              type="radio"
                              name={`radio_${param.id}`}
                              value={opt.value}
                              checked={values[param.id] === opt.value}
                              onChange={() => handleValueChange(param.id, opt.value)}
                              className="accent-cyan-400 cursor-pointer"
                            />
                            <span>{opt.label}</span>
                          </label>
                        ))}
                      </div>
                    )}

                    {/* Select Menu Dropdown */}
                    {param.type === 'select' && param.options && (
                      <div className="max-w-md">
                        <select
                          value={values[param.id]}
                          onChange={(e) => handleValueChange(param.id, e.target.value)}
                          className="w-full px-3 py-1.5 bg-slate-950 border border-slate-700 rounded text-xs text-cyan-200 font-mono focus:border-cyan-400 focus:outline-none cursor-pointer"
                        >
                          {param.options.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>

        {/* Right Column: Assembled Instruction Output & Preview (Cols 9-12) */}
        <div className="lg:col-span-4 flex flex-col gap-4">
          
          <div className="p-5 rounded-xl bg-slate-900/90 border border-cyan-900/60 shadow-xl sticky top-20 flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-3">
              <div className="flex items-center gap-2">
                <Terminal className="w-4 h-4 text-cyan-400" />
                <h3 className="text-xs font-bold text-cyan-300 uppercase tracking-widest">
                  Instruction JSON Manifest
                </h3>
              </div>

              <div className="flex items-center gap-1">
                <button
                  onClick={copyToClipboard}
                  className="p-1.5 rounded bg-slate-800 hover:bg-cyan-900 text-slate-300 hover:text-cyan-200 transition"
                  title="Copy JSON"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            {/* Protocol Title Edit */}
            <div className="mb-3 space-y-1">
              <label className="text-[10px] text-slate-400 uppercase tracking-wider">Protocol Root Key</label>
              <input
                type="text"
                value={protocolTitle}
                onChange={(e) => setProtocolTitle(e.target.value)}
                className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded text-xs text-cyan-300 font-mono focus:border-cyan-400 focus:outline-none"
              />
            </div>

            {/* JSON Code Viewer */}
            <div className="flex-1 overflow-auto bg-slate-950 p-3 rounded-lg border border-slate-800 text-[11px] font-mono leading-relaxed text-cyan-200/90 select-all">
              <pre>{generatedInstructionJson}</pre>
            </div>

            {/* Stats Footer */}
            <div className="mt-3 pt-3 border-t border-slate-800 flex items-center justify-between text-[10px] text-slate-400">
              <span>Active Params: {MMSS_PARAMETERS.length}</span>
              <span className="text-cyan-400 font-semibold">STRONG_RESET_INDEPENDENCE</span>
            </div>
          </div>

        </div>

      </main>
    </div>
  );
}
