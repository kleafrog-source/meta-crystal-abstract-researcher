"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { FieldHint, FieldLabel } from "@/components/ui/field-hint";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Brain } from "@/components/icons";
import {
  EditableProfile,
  FLAG_GROUPS,
  METRIC_KEYS,
  PATTERN_PRESETS,
} from "@/lib/profile-presets";

export function ProfileConfigurator({
  profile,
  onChange,
  engineFlags,
  enginePatterns,
  sections = ["params", "metrics", "patterns", "domains"],
  compact = false,
}: {
  profile: EditableProfile;
  onChange: (profile: EditableProfile) => void;
  engineFlags?: string[];
  enginePatterns?: string[];
  sections?: Array<"params" | "metrics" | "patterns" | "domains">;
  compact?: boolean;
}) {
  const patternList = enginePatterns?.length ? enginePatterns : PATTERN_PRESETS;
  const effectiveFlagGroups = engineFlags?.length
    ? mergeFlagGroups(engineFlags)
    : FLAG_GROUPS;

  const updateParam = <K extends keyof EditableProfile["params"]>(
    key: K,
    value: EditableProfile["params"][K],
  ) => {
    onChange({
      ...profile,
      params: { ...profile.params, [key]: value },
    });
  };

  const updateFlag = (flag: string, value: boolean) => {
    onChange({
      ...profile,
      flags: { ...profile.flags, [flag]: value },
    });
  };

  const updateMetricRole = (metric: string, role: "influencing" | "observational" | "disabled") => {
    const influencing = new Set(profile.metrics.influencing);
    const observational = new Set(profile.metrics.observational);
    influencing.delete(metric);
    observational.delete(metric);
    if (role === "influencing") influencing.add(metric);
    if (role === "observational") observational.add(metric);
    onChange({
      ...profile,
      metrics: {
        ...profile.metrics,
        influencing: [...influencing],
        observational: [...observational],
      },
    });
  };

  const updatePattern = (pattern: string, enabled: boolean) => {
    const disabled = new Set(profile.disabled_patterns);
    if (enabled) disabled.delete(pattern);
    else disabled.add(pattern);
    onChange({ ...profile, disabled_patterns: [...disabled] });
  };

  const setAllFlags = (value: boolean) => {
    const nextFlags: Record<string, boolean> = {};
    const knownFlags = new Set(Object.keys(profile.flags));
    for (const group of effectiveFlagGroups) {
      for (const flag of group.flags) knownFlags.add(flag);
    }
    for (const flag of knownFlags) nextFlags[flag] = value;
    onChange({ ...profile, flags: nextFlags });
  };

  return (
    <div className="space-y-4">
      {sections.includes("params") && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Базовые параметры</CardTitle>
            <CardDescription>Поколения, batch, top и ограничения формулы.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className={`grid gap-4 ${compact ? "grid-cols-1 md:grid-cols-2" : "grid-cols-1 md:grid-cols-3"}`}>
              <NumberField label="Поколения" value={profile.params.generations} onChange={(v) => updateParam("generations", v)} hint="Сколько поколений эволюции выполнить." />
              <NumberField label="Batch" value={profile.params.batch} onChange={(v) => updateParam("batch", v)} hint="Сколько комбинаций генерировать за поколение." />
              <NumberField label="Top" value={profile.params.top} onChange={(v) => updateParam("top", v)} hint="Сколько лучших результатов сохранить." />
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <SliderField label="Макс. глубина" value={profile.params.max_depth} min={1} max={20} step={1} onChange={(v) => updateParam("max_depth", v)} />
              <SliderField label="Макс. элементов" value={profile.params.max_elements} min={2} max={30} step={1} onChange={(v) => updateParam("max_elements", v)} />
              <SliderField label="Вероятность инверсии" value={profile.params.invert_probability} min={0} max={1} step={0.05} onChange={(v) => updateParam("invert_probability", v)} format={(v) => v.toFixed(2)} />
              <SliderField label="Вероятность психологии" value={profile.params.psychology_probability} min={0} max={1} step={0.05} onChange={(v) => updateParam("psychology_probability", v)} format={(v) => v.toFixed(2)} />
            </div>
            <div className={`grid gap-3 border-t border-border pt-2 ${compact ? "grid-cols-1" : "grid-cols-1 md:grid-cols-3"}`}>
              <ToggleField label="Иррациональные числа" value={profile.params.use_irrational} onChange={(v) => updateParam("use_irrational", v)} />
              <ToggleField label="Мнимые числа" value={profile.params.use_imaginary} onChange={(v) => updateParam("use_imaginary", v)} />
              <ToggleField label="Бесконечность" value={profile.params.use_infinity} onChange={(v) => updateParam("use_infinity", v)} />
            </div>
          </CardContent>
        </Card>
      )}

      {sections.includes("metrics") && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm"><Brain className="h-4 w-4 text-violet-400" />Метрики</CardTitle>
            <CardDescription>Для каждой метрики можно выбрать режим: влияющая, оценочная или отключенная.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mb-3 flex items-center justify-between rounded-md border border-border bg-card/40 px-3 py-2">
              <Switch
                checked={profile.metrics.enabled}
                onCheckedChange={(checked) =>
                  onChange({
                    ...profile,
                    metrics: { ...profile.metrics, enabled: checked },
                    flags: { ...profile.flags, enable_metrics: checked },
                  })}
              />
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {METRIC_KEYS.map((metric) => {
                const role = profile.metrics.influencing.includes(metric)
                  ? "influencing"
                  : profile.metrics.observational.includes(metric)
                    ? "observational"
                    : "disabled";
                return (
                  <div key={metric} className="rounded-md border border-border bg-card/40 px-3 py-2">
                    <div className="mb-2 flex items-center gap-1 font-mono text-sm text-emerald-300">
                      <span>{metric}</span>
                      <FieldHint hint="Режим метрики. influencing влияет на отбор, observational только показывается в отчетах, disabled полностью исключает метрику из профиля." />
                    </div>
                    <Select value={role} onValueChange={(value: "influencing" | "observational" | "disabled") => updateMetricRole(metric, value)}>
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="influencing">Влияющая</SelectItem>
                        <SelectItem value="observational">Оценочная</SelectItem>
                        <SelectItem value="disabled">Отключена</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {sections.includes("patterns") && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Структурные паттерны</CardTitle>
            <CardDescription>Снятая галочка означает, что паттерн исключается из профиля генерации.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mb-4 flex gap-2">
              <Button variant="outline" size="sm" onClick={() => {
                onChange({ ...profile, disabled_patterns: [] });
              }}>Включить все</Button>
              <Button variant="outline" size="sm" onClick={() => {
                onChange({ ...profile, disabled_patterns: patternList });
              }}>Выключить все</Button>
            </div>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
              {patternList.map((pattern) => {
                const enabled = !profile.disabled_patterns.includes(pattern);
                return (
                  <div key={pattern} className="flex items-center justify-between rounded-md border border-border bg-card/40 px-3 py-2">
                    <FieldLabel label={pattern} hint="Структурный паттерн генератора. Включенный паттерн разрешен для сборки новых формул, выключенный исключается из профиля." />
                    <Switch checked={enabled} onCheckedChange={(checked) => updatePattern(pattern, checked)} />
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {sections.includes("domains") && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Домены по категориям</CardTitle>
            <CardDescription>Группировка соответствует Python GUI `flag_groups`.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mb-4 flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setAllFlags(true)}>Включить все</Button>
              <Button variant="outline" size="sm" onClick={() => setAllFlags(false)}>Выключить все</Button>
            </div>
            <div className={`grid gap-4 ${compact ? "grid-cols-1" : "grid-cols-1 xl:grid-cols-2"}`}>
              {effectiveFlagGroups.map((group) => (
                <Card key={group.name} className="border-border/60 bg-card/30">
                  <CardHeader className="pb-2"><CardTitle className="text-sm">{group.name}</CardTitle></CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                      {group.flags.map((flag) => (
                        <div key={flag} className="flex items-center justify-between rounded-md border border-border/60 bg-card/40 px-3 py-2">
                          <div className="flex items-center gap-1">
                            <Label className="cursor-pointer text-xs font-mono" htmlFor={flag}>{flag.replace(/^enable_/, "")}</Label>
                            <FieldHint hint={`Флаг ${flag}. Включает или отключает соответствующий домен или режим генерации в текущем профиле.`} />
                          </div>
                          <Switch id={flag} checked={Boolean(profile.flags[flag])} onCheckedChange={(v) => updateFlag(flag, v)} />
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function mergeFlagGroups(engineFlags: string[]) {
  const known = new Set<string>();
  const groups = FLAG_GROUPS.map((group) => ({
    ...group,
    flags: group.flags.filter((flag) => {
      known.add(flag);
      return engineFlags.includes(flag);
    }),
  })).filter((group) => group.flags.length > 0);

  const extra = engineFlags.filter((flag) => !known.has(flag));
  if (extra.length > 0) {
    groups.push({ name: "Дополнительно", flags: extra });
  }
  return groups;
}

function NumberField({ label, value, onChange, hint }: { label: string; value: number; onChange: (v: number) => void; hint: string }) {
  return (
    <div className="space-y-1.5">
      <FieldLabel label={label} hint={hint} />
      <Input type="number" value={value} onChange={(e) => onChange(Number(e.target.value) || 0)} className="font-mono" />
    </div>
  );
}

function SliderField({
  label,
  value,
  min,
  max,
  step,
  onChange,
  format,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <FieldLabel
          label={label}
          hint={`Диапазон: ${min}-${max}. Изменение этого параметра влияет на структуру формулы и объем пространства поиска. Текущее значение: ${format ? format(value) : value}.`}
        />
        <span className="text-xs font-mono text-emerald-300">{format ? format(value) : value}</span>
      </div>
      <Slider value={[value]} min={min} max={max} step={step} onValueChange={(values) => onChange(values[0])} />
    </div>
  );
}

function ToggleField({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between rounded-md border border-border bg-card/40 px-3 py-2.5">
      <FieldLabel label={label} hint="Булевый параметр профиля. Включение активирует режим в генераторе, выключение полностью убирает его из текущего запуска." />
      <Switch checked={value} onCheckedChange={onChange} />
    </div>
  );
}
