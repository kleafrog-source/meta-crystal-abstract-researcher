"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useUiLanguage, useUiText } from "@/lib/ui-i18n";

type UiLanguage = "en" | "ru" | "de";

export function InterfaceLanguagePreference() {
  const t = useUiText();
  const initialLanguage = useUiLanguage();
  const router = useRouter();
  const [language, setLanguage] = useState<UiLanguage>(initialLanguage);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const update = async (next: UiLanguage) => {
    if (busy || next === language) return;
    setBusy(true);
    setLanguage(next);
    setError("");
    try {
      const response = await fetch("/api/ui-preferences", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ language: next }) });
      if (!response.ok) throw new Error(t("Не удалось сохранить язык интерфейса."));
      router.refresh();
    } catch (cause) {
      setLanguage(initialLanguage);
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  return <Card><CardHeader><CardTitle>{t("Язык интерфейса")}</CardTitle><CardDescription>{t("Выберите язык приложения. Переводы на русский и английский применяются сразу; для немецкого используется английский.")}</CardDescription></CardHeader><CardContent className="space-y-2"><Label htmlFor="interface-language">{t("Язык")}</Label><Select value={language} onValueChange={(value) => void update(value as UiLanguage)} disabled={busy}><SelectTrigger id="interface-language" className="max-w-sm"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="en">English</SelectItem><SelectItem value="ru">Русский</SelectItem><SelectItem value="de">Deutsch</SelectItem></SelectContent></Select>{error ? <p role="alert" className="text-xs text-destructive">{error}</p> : null}</CardContent></Card>;
}
