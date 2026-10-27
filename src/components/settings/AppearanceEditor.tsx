"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { applyAppearance, DEFAULT_APPEARANCE, normalizeAppearance, PALETTES, type AppearanceConfig, type PaletteConfig, type PaletteId, type ThemeMode } from "@/lib/appearance";

const MODES: Array<{ id: ThemeMode; label: string }> = [{ id:"dark",label:"Тёмная" },{ id:"light",label:"Светлая" },{ id:"medium",label:"Средняя" }];
function ThemeSliderField({ label, name, min, max, suffix = "", value, onChange }: { label:string; name:keyof PaletteConfig; min:number; max:number; suffix?:string; value:PaletteConfig; onChange:(name:keyof PaletteConfig,value:number)=>void }) {
  return <label className="grid grid-cols-[minmax(125px,1fr)_2fr_56px] items-center gap-3 text-xs"><span>{label}</span><input type="range" min={min} max={max} value={Number(value[name])} onChange={(event) => onChange(name, Number(event.target.value))} /><output className="text-right font-mono">{value[name]}{suffix}</output></label>;
}
export function AppearanceEditor() {
  const [saved, setSaved] = useState(DEFAULT_APPEARANCE);
  const [draft, setDraft] = useState(DEFAULT_APPEARANCE);
  const [palette, setPalette] = useState<PaletteId>("emerald");
  const [mode, setMode] = useState<ThemeMode>("dark");
  const [busy, setBusy] = useState(true);
  const [message, setMessage] = useState("");
  useEffect(() => { void fetch("/api/appearance", { cache:"no-store" }).then((response) => response.json()).then((data) => {
    const config = normalizeAppearance(data.appearance); setSaved(config); setDraft(config);
    const choice = config.activeByMode.settings ?? { palette:"emerald" as PaletteId, mode:"dark" as ThemeMode };
    setPalette(choice.palette); setMode(choice.mode);
  }).catch(() => setMessage("Не удалось загрузить настройки оформления.")).finally(() => setBusy(false)); }, []);
  const value = draft.palettes[palette][mode];
  const builtIn = DEFAULT_APPEARANCE.palettes[palette][mode];
  const update = (key: keyof typeof value, next: number | string) => {
    const changed = { ...draft, palettes: { ...draft.palettes, [palette]: { ...draft.palettes[palette], [mode]: { ...value, [key]: next } } } } as AppearanceConfig;
    setDraft(changed); applyAppearance(changed, palette, mode); setMessage("");
  };
  const save = async () => {
    setBusy(true);
    try {
      const response = await fetch("/api/appearance", { method:"PUT", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ appearance:draft }) });
      if (!response.ok) throw new Error("Не удалось сохранить пресет.");
      const data = await response.json(); const config = normalizeAppearance(data.appearance); setSaved(config); setDraft(config); setMessage("Пресет сохранён."); window.dispatchEvent(new Event("appearance:changed"));
    } catch (error) { setMessage(error instanceof Error ? error.message : "Ошибка сохранения."); }
    finally { setBusy(false); }
  };
  const cancel = () => { setDraft(saved); const choice = saved.activeByMode.settings ?? { palette:"emerald" as PaletteId, mode:"dark" as ThemeMode }; setPalette(choice.palette); setMode(choice.mode); applyAppearance(saved, choice.palette, choice.mode); setMessage("Черновик отменён."); };
  const reset = () => { const changed = { ...draft, palettes: { ...draft.palettes, [palette]: DEFAULT_APPEARANCE.palettes[palette] } }; setDraft(changed); applyAppearance(changed, palette, mode); setMessage("Встроенные значения трёх тем восстановлены. Нажмите «Сохранить пресет», чтобы применить Reset."); };
  const changed = JSON.stringify(value) !== JSON.stringify(builtIn);
  return <Card>
    <CardHeader><CardTitle>Цветовые пресеты</CardTitle><CardDescription>Шесть общих пресетов, три варианта темы и отдельная настройка каждого. Изменения ниже — черновик до сохранения.</CardDescription></CardHeader>
    <CardContent className="space-y-4">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Редактируемый пресет">{PALETTES.map((item) => <Button key={item.id} type="button" variant={palette === item.id ? "default" : "outline"} size="sm" onClick={() => { setPalette(item.id); applyAppearance(draft,item.id,mode); }}>{item.label}</Button>)}</div>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Тема пресета">{MODES.map((item) => <Button key={item.id} type="button" variant={mode === item.id ? "default" : "outline"} size="sm" onClick={() => { setMode(item.id); applyAppearance(draft,palette,item.id); }}>{item.label}</Button>)}</div>
      <div className="text-xs text-muted-foreground">{busy ? "Загрузка…" : changed ? "Переопределено пользователем" : "Встроенные значения"}. Фон, поверхности, текст, обводки и контраст состояний вычисляются из этих токенов.</div>
      <div className="space-y-2 rounded-md border p-3"><div className="text-sm font-medium">Фоновые и второстепенные элементы</div><ThemeSliderField label="Hue" name="backgroundHue" min={0} max={360} suffix="°" value={value} onChange={update}/><ThemeSliderField label="Насыщенность" name="backgroundSaturation" min={0} max={65} suffix="%" value={value} onChange={update}/><ThemeSliderField label="Интенсивность фона" name="backgroundIntensity" min={8} max={98} suffix="%" value={value} onChange={update}/></div>
      <div className="space-y-2 rounded-md border p-3"><div className="text-sm font-medium">Активные элементы</div><ThemeSliderField label="Hue" name="activeHue" min={0} max={360} suffix="°" value={value} onChange={update}/><ThemeSliderField label="Насыщенность" name="activeSaturation" min={0} max={90} suffix="%" value={value} onChange={update}/><ThemeSliderField label="Интенсивность акцента" name="activeIntensity" min={28} max={78} suffix="%" value={value} onChange={update}/></div>
      <div className="grid gap-3 sm:grid-cols-2"><label className="space-y-1 text-xs">Стиль badges<select className="h-9 w-full rounded-md border border-input bg-background px-2" value={value.badgeStyle} onChange={(event) => update("badgeStyle", event.target.value)}><option value="soft">Заливка</option><option value="outline">Обводка</option><option value="solid">Плотная</option></select></label><ThemeSliderField label="Интенсивность badges" name="badgeIntensity" min={0} max={70} suffix="%" value={value} onChange={update}/></div>
      <p className="text-xs text-muted-foreground">Семантические состояния ошибки, предупреждения и успеха сохраняют свои отдельные цвета. Выбранная тема хранится отдельно для каждого рабочего режима.</p>
      {message ? <p role="status" className="text-xs text-muted-foreground">{message}</p> : null}
      <div className="flex flex-wrap gap-2"><Button type="button" onClick={() => void save()} disabled={busy}>Сохранить пресет</Button><Button type="button" variant="outline" onClick={reset} disabled={busy}>Reset</Button><Button type="button" variant="ghost" onClick={cancel} disabled={busy}>Отменить черновик</Button></div>
    </CardContent>
  </Card>;
}
