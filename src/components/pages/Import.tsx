"use client";

import { useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Upload,
  FileJson,
  Eye,
  CheckCircle2,
  Loader2,
  Download,
  AlertTriangle,
  Plus,
  Minus,
  RefreshCw,
} from "@/components/icons";
import { useToast } from "@/hooks/use-toast";
import { apiPost } from "@/hooks/use-fetch";

interface DiffEntry {
  kind: string; // "added" | "modified" | "removed"
  name: string;
  category?: string | null;
  old?: unknown;
  new?: unknown;
}

interface PreviewResult {
  ok: boolean;
  path: string;
  diff: DiffEntry[];
  count: number;
}

interface ApplyResult {
  ok: boolean;
  result: { added: number; updated: number; skipped: number };
}

export function Import() {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadedPath, setUploadedPath] = useState<string | null>(null);
  const [uploadedName, setUploadedName] = useState<string>("");
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [applying, setApplying] = useState(false);
  const [applied, setApplied] = useState<ApplyResult | null>(null);
  const { toast } = useToast();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) {
      setFile(f);
      setPreview(null);
      setApplied(null);
      setUploadedPath(null);
    }
  };

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const r = await fetch("/api/import/upload", {
        method: "POST",
        body: formData,
      });
      const d = await r.json();
      if (!d.ok) throw new Error(d.error);
      setUploadedPath(d.path);
      setUploadedName(d.fileName);
      toast({
        title: "Файл загружен",
        description: `${d.fileName} (${d.size} байт)`,
      });
    } catch (e) {
      toast({
        title: "Ошибка загрузки",
        description: (e as Error).message,
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  const handlePreview = async () => {
    if (!uploadedPath) return;
    setPreviewing(true);
    setPreview(null);
    try {
      const r = await apiPost<PreviewResult>("/api/import/preview", { path: uploadedPath });
      setPreview(r);
      toast({
        title: "Предпросмотр готов",
        description: `${r.count} изменений найдено`,
      });
    } catch (e) {
      toast({
        title: "Ошибка предпросмотра",
        description: (e as Error).message,
        variant: "destructive",
      });
    } finally {
      setPreviewing(false);
    }
  };

  const handleApply = async () => {
    if (!uploadedPath) return;
    setApplying(true);
    try {
      const r = await apiPost<ApplyResult>("/api/import/apply", { path: uploadedPath });
      setApplied(r);
      toast({
        title: "Импорт применён",
        description: `+${r.result.added} обновлено ${r.result.updated} пропущено ${r.result.skipped}`,
      });
    } catch (e) {
      toast({
        title: "Ошибка применения",
        description: (e as Error).message,
        variant: "destructive",
      });
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <header className="px-6 py-5 border-b border-border bg-card/30 backdrop-blur-sm">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-glow-emerald">
            Импорт
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Загрузка файлов с терминами, операторами и паттернами с diff-предпросмотром
          </p>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-4xl space-y-4">
          {/* Upload card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <Upload className="h-4 w-4 text-emerald-400" />
                Загрузка файла
              </CardTitle>
              <CardDescription>
                JSON-файл с сущностями для импорта в базу знаний движка.
                Максимальный размер: 10 МБ.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-3">
                <label className="cursor-pointer">
                  <input
                    type="file"
                    accept=".json,.txt"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                  <div className="px-4 py-2 rounded-md border border-dashed border-border hover:border-primary/50 bg-card/40 text-sm flex items-center gap-2 transition-colors">
                    <FileJson className="h-4 w-4 text-muted-foreground" />
                    {file ? file.name : "Выбрать файл…"}
                  </div>
                </label>
                {file && (
                  <Button onClick={handleUpload} disabled={uploading} size="sm">
                    {uploading ? (
                      <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                    ) : (
                      <Upload className="h-3.5 w-3.5 mr-1.5" />
                    )}
                    Загрузить
                  </Button>
                )}
                {uploadedPath && (
                  <Badge variant="outline" className="text-emerald-300 border-emerald-500/30">
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                    загружен
                  </Badge>
                )}
              </div>
              {uploadedName && (
                <div className="text-xs text-muted-foreground">
                  Файл: <code className="font-mono">{uploadedName}</code>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Preview / Apply */}
          {uploadedPath && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <Eye className="h-4 w-4 text-cyan-400" />
                  Diff-предпросмотр
                </CardTitle>
                <CardDescription>
                  Сравнение содержимого файла с текущей базой знаний
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handlePreview}
                    disabled={previewing}
                  >
                    {previewing ? (
                      <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                    ) : (
                      <Eye className="h-3.5 w-3.5 mr-1.5" />
                    )}
                    Предпросмотр
                  </Button>
                  {preview && (
                    <Button
                      size="sm"
                      onClick={handleApply}
                      disabled={applying || !!applied}
                    >
                      {applying ? (
                        <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                      ) : (
                        <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
                      )}
                      Применить импорт
                    </Button>
                  )}
                  {preview && (
                    <Badge variant="outline">
                      {preview.count} изменений
                    </Badge>
                  )}
                </div>

                {applied && (
                  <Alert>
                    <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                    <AlertDescription>
                      Импорт применён: добавлено <strong>{applied.result.added}</strong>,
                      обновлено <strong>{applied.result.updated}</strong>,
                      пропущено <strong>{applied.result.skipped}</strong>.
                    </AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>
          )}

          {/* Diff viewer */}
          {preview && preview.diff.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Изменения ({preview.diff.length})</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <ScrollArea className="h-[400px]">
                  <div className="divide-y divide-border">
                    {preview.diff.slice(0, 200).map((d, i) => (
                      <DiffRow key={i} entry={d} />
                    ))}
                    {preview.diff.length > 200 && (
                      <div className="px-4 py-3 text-xs text-muted-foreground text-center">
                        … и ещё {preview.diff.length - 200} изменений
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          )}

          {preview && preview.diff.length === 0 && (
            <Card>
              <CardContent className="py-8 text-center">
                <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-emerald-400" />
                <p className="text-sm">Изменений не обнаружено</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Файл не вносит новых сущностей в базу знаний
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function DiffRow({ entry }: { entry: DiffEntry }) {
  const isAdded = entry.kind === "added";
  const isModified = entry.kind === "modified";
  const isRemoved = entry.kind === "removed";

  return (
    <div className="px-4 py-2 flex items-start gap-3">
      <div className="shrink-0 mt-0.5">
        {isAdded && <Plus className="h-3.5 w-3.5 text-emerald-400" />}
        {isModified && <RefreshCw className="h-3.5 w-3.5 text-amber-400" />}
        {isRemoved && <Minus className="h-3.5 w-3.5 text-rose-400" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono font-medium">{entry.name}</span>
          {entry.category && (
            <Badge variant="outline" className="text-[10px]">
              {entry.category}
            </Badge>
          )}
          <Badge
            variant="outline"
            className={`text-[10px] ${
              isAdded
                ? "text-emerald-300 border-emerald-500/30"
                : isModified
                  ? "text-amber-300 border-amber-500/30"
                  : "text-rose-300 border-rose-500/30"
            }`}
          >
            {entry.kind}
          </Badge>
        </div>
        {(isModified || isRemoved) && entry.old != null && (
          <div className="text-[11px] text-rose-300/80 font-mono mt-1 line-through">
            {JSON.stringify(entry.old).slice(0, 200)}
          </div>
        )}
        {(isAdded || isModified) && entry.new != null && (
          <div className="text-[11px] text-emerald-300/80 font-mono mt-1">
            {JSON.stringify(entry.new).slice(0, 200)}
          </div>
        )}
      </div>
    </div>
  );
}
