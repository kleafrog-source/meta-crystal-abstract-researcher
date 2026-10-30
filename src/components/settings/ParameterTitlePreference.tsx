"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type TitleOrder = "en-ru" | "ru-en";

export function ParameterTitlePreference() {
  const [order, setOrder] = useState<TitleOrder>("en-ru");
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    void fetch("/api/ui-preferences", { cache: "no-store" }).then(async (response) => {
      if (!response.ok) throw new Error("Не удалось загрузить настройку.");
      const data = await response.json() as { parameterTitleOrder?: TitleOrder };
      if (data.parameterTitleOrder === "ru-en" || data.parameterTitleOrder === "en-ru") setOrder(data.parameterTitleOrder);
    }).catch((cause) => setError(cause instanceof Error ? cause.message : String(cause))).finally(() => setBusy(false));
  }, []);

  const update = async (next: TitleOrder) => {
    const previous = order;
    setOrder(next);
    setError("");
    try {
      const response = await fetch("/api/ui-preferences", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ parameterTitleOrder: next }) });
      if (!response.ok) throw new Error("Не удалось сохранить настройку.");
      window.dispatchEvent(new CustomEvent("ui-preferences:changed", { detail: { parameterTitleOrder: next } }));
    } catch (cause) {
      setOrder(previous);
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  return <Card><CardHeader><CardTitle>Названия параметров</CardTitle><CardDescription>Общий порядок заголовков параметров, включая банки AM-Stage.</CardDescription></CardHeader><CardContent className="space-y-2"><Label htmlFor="parameter-title-order">Порядок EN/RU</Label><Select value={order} onValueChange={(value) => void update(value as TitleOrder)} disabled={busy}><SelectTrigger id="parameter-title-order" className="max-w-sm"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="en-ru">English → Русский (по умолчанию)</SelectItem><SelectItem value="ru-en">Русский → English</SelectItem></SelectContent></Select>{error ? <p role="alert" className="text-xs text-destructive">{error}</p> : null}</CardContent></Card>;
}
