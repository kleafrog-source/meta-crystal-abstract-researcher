"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Mic, Plus, Square } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export function SpeechInputButtons({ value, onChange, label }: { value: string; onChange: (value: string) => void; label: string }) {
  const [state, setState] = useState<"idle" | "recording" | "transcribing">("idle");
  const [mode, setMode] = useState<"replace" | "append" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const animationRef = useRef<number | null>(null);

  const releaseAudio = () => {
    if (animationRef.current !== null) cancelAnimationFrame(animationRef.current);
    animationRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (audioContextRef.current && audioContextRef.current.state !== "closed") void audioContextRef.current.close();
    audioContextRef.current = null;
    recorderRef.current = null;
  };

  useEffect(() => () => releaseAudio(), []);

  const toggle = async (nextMode: "replace" | "append") => {
    if (state === "recording") {
      if (recorderRef.current?.state === "recording") recorderRef.current.stop();
      return;
    }
    if (state === "transcribing") return;
    setError(null);
    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") throw new Error("Запись голоса не поддерживается этим браузером.");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const preferredType = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"].find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = new MediaRecorder(stream, preferredType ? { mimeType: preferredType } : undefined);
      recorderRef.current = recorder;
      const chunks: BlobPart[] = [];
      recorder.ondataavailable = (event) => { if (event.data.size > 0) chunks.push(event.data); };
      recorder.onerror = () => {
        setError("Не удалось записать аудио.");
        setState("idle");
        setMode(null);
        releaseAudio();
      };
      recorder.onstop = async () => {
        const mimeType = recorder.mimeType || "audio/webm";
        const blob = new Blob(chunks, { type: mimeType });
        releaseAudio();
        if (blob.size === 0) {
          setError("Запись не содержит аудио.");
          setState("idle");
          setMode(null);
          return;
        }
        setState("transcribing");
        try {
          const form = new FormData();
          form.append("audio", blob, mimeType.includes("ogg") ? "speech.ogg" : "speech.webm");
          const response = await fetch("/api/llm/stt", { method: "POST", body: form });
          const payload = await response.json() as { text?: string; error?: string };
          if (!response.ok || !payload.text?.trim()) throw new Error(payload.error ?? `STT HTTP ${response.status}`);
          const recognized = payload.text.trim();
          onChange(nextMode === "append" ? [value.trim(), recognized].filter(Boolean).join(" ") : recognized);
        } catch (caught) {
          setError(caught instanceof Error ? caught.message : String(caught));
        } finally {
          setState("idle");
          setMode(null);
        }
      };

      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 1024;
      audioContext.createMediaStreamSource(stream).connect(analyser);
      const samples = new Uint8Array(analyser.fftSize);
      const startedAt = performance.now();
      let heardSpeech = false;
      let silenceStartedAt: number | null = null;
      const monitorSilence = () => {
        if (recorder.state !== "recording") return;
        analyser.getByteTimeDomainData(samples);
        let energy = 0;
        for (const sample of samples) energy += ((sample - 128) / 128) ** 2;
        const rms = Math.sqrt(energy / samples.length);
        const now = performance.now();
        if (rms >= 0.018) {
          heardSpeech = true;
          silenceStartedAt = null;
        } else if (heardSpeech) {
          silenceStartedAt ??= now;
          if (now - silenceStartedAt >= 3000) {
            recorder.stop();
            return;
          }
        }
        if (now - startedAt >= 60000) {
          recorder.stop();
          return;
        }
        animationRef.current = requestAnimationFrame(monitorSilence);
      };
      recorder.start(250);
      setMode(nextMode);
      setState("recording");
      animationRef.current = requestAnimationFrame(monitorSilence);
    } catch (caught) {
      releaseAudio();
      setState("idle");
      setMode(null);
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  };

  return (
    <div>
      <div className="flex flex-col gap-1">
        <SpeechButton mode="append" activeMode={mode} state={state} label={label} onClick={() => void toggle("append")} />
        <SpeechButton mode="replace" activeMode={mode} state={state} label={label} onClick={() => void toggle("replace")} />
      </div>
      {error ? <div className="mt-1 max-w-48 text-[10px] text-destructive">{error}</div> : null}
    </div>
  );
}

function SpeechButton({ mode, activeMode, state, label, onClick }: { mode: "replace" | "append"; activeMode: "replace" | "append" | null; state: "idle" | "recording" | "transcribing"; label: string; onClick: () => void }) {
  const active = activeMode === mode && state !== "idle";
  const title = mode === "append" ? "Добавить голосом" : "Заменить голосом";
  const hint = active && state === "recording"
    ? "Останавливает текущую запись и отправляет её на распознавание."
    : active && state === "transcribing"
      ? "Аудио распознаётся локальной STT-моделью."
      : mode === "append"
        ? `Распознаёт речь и добавляет текст в конец поля «${label}».`
        : `Распознаёт речь и заменяет содержимое поля «${label}».`;
  return <Tooltip><TooltipTrigger asChild><button type="button" aria-label={`${title}: ${label}`} className={`inline-flex size-7 items-center justify-center rounded-md border ${active && state === "recording" ? "border-red-400 bg-red-500/20 text-red-300" : "border-white/15 bg-black/70 text-muted-foreground"}`} onClick={onClick} disabled={state === "transcribing"}>
    {active && state === "recording" ? <Square className="size-3.5 fill-current" /> : active && state === "transcribing" ? <Loader2 className="size-4 animate-spin" /> : mode === "append" ? <span className="relative"><Mic className="size-4" /><Plus className="absolute -right-1.5 -top-1.5 size-2.5 stroke-[3]" /></span> : <Mic className="size-4" />}
  </button></TooltipTrigger><TooltipContent side="right" sideOffset={6} className="max-w-xs text-left">{hint}</TooltipContent></Tooltip>;
}
