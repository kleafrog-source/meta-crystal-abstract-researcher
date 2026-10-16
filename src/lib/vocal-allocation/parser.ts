import type { ActiveParameter } from "@/lib/rag-v3/types";

export const LANGUAGE_ALIASES: Record<string, string[]> = {
  lat: ["latin", "classical latin", "латын", "латинск"], prg: ["old prussian", "древнепрусск"],
  grc: ["ancient greek", "древнегреч"], sux: ["sumerian", "шумерск"], san: ["sanskrit", "vedic", "санскрит", "ведическ"],
  akk: ["akkadian", "аккадский"], non: ["old norse", "древнескандинавский"], got: ["gothic", "готский"],
  arc: ["aramaic", "арамейск"], gez: ["geez", "ge'ez", "геэз"], goh: ["old high german", "древневерхненемец"],
  cop: ["coptic", "коптский"], is: ["icelandic", "исландский"], cy: ["welsh", "валлийский"],
  ja: ["japanese", "японский"], de: ["german", "немецкий"], fi: ["finnish", "финский"], sv: ["swedish", "шведский"],
  ar: ["arabic", "арабский"], he: ["hebrew", "иврит"], pl: ["polish", "польский"], tr: ["turkish", "турецкий"],
  hu: ["hungarian", "венгерский"], ka: ["georgian", "грузинский"], eu: ["basque", "баскский"],
  cu: ["church slavonic", "old church slavonic", "церковнославянский", "старославянский", "chu"],
  orv: ["old russian", "old east slavic", "древнерусский"],
};

const TECH: Record<string, string[]> = {
  VGUT: ["vgut", "guttural", "false chord", "гуттурал", "ложные связки"], VFRY: ["vfry", "vocal fry", "фрай"],
  VCLR: ["vclr", "clear vocal", "operatic", "чистый вокал", "оперный"], VWSP: ["vwsp", "whisper", "шепот", "шёпот"],
  VINH: ["vinh", "inhale", "ингрессивный"], VGRN: ["vgrn", "granular vocal", "гранулярный вокал"],
};
const FX: Record<string, string[]> = {
  DRV1: ["drv1", "drive", "overdrive", "distortion", "драйв", "овердрайв"], PSH1: ["psh1", "pitch shift", "питч шифт"],
  FMT1: ["fmt1", "formant shift", "формантный сдвиг"], GRN1: ["grn1", "granular", "гранулярный"],
  DLY1: ["dly1", "delay", "дилей", "задержка"], RVB1: ["rvb1", "reverb", "реверберация", "реверб"],
};

function matches(text: string, alias: string): boolean {
  if (alias.length >= 4 && text.includes(alias)) return true;
  const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}([^\\p{L}\\p{N}]|$)`, "iu").test(text);
}

export function parseVocalQuery(query: string) {
  const text = query.toLowerCase();
  const languages = Object.entries(LANGUAGE_ALIASES).filter(([code, aliases]) => matches(text, code) || aliases.some((a) => matches(text, a))).map(([code]) => code);
  const techniques = Object.entries(TECH).filter(([, aliases]) => aliases.some((a) => matches(text, a))).map(([code]) => code);
  const effects = Object.entries(FX).filter(([, aliases]) => aliases.some((a) => matches(text, a))).map(([code]) => code);
  const digits: Record<string, number> = {};
  for (const key of ["i", "s", "e", "a"]) {
    const hit = text.match(new RegExp(`(?:^|[^\\p{L}\\p{N}])${key}\\s*[:=]\\s*(10|[0-9])(?=$|[^0-9])`, "iu"));
    if (hit) digits[key] = Number(hit[1]);
  }
  return { languages, techniques, effects, digits };
}

export function isVocalMatrixParameter(parameter: Pick<ActiveParameter, "technical_name" | "category" | "sub_category">): boolean {
  const text = `${parameter.technical_name} ${parameter.category} ${parameter.sub_category}`.toLowerCase();
  return /(vocal|voice|phonetic|language|linguistic|polyglot|guttural|whisper|choir|formant|sibil|plosive)/.test(text);
}

export function selectOption(options: string[] | undefined, token: string): string | undefined {
  const lower = token.toLowerCase();
  return options?.find((option) => option.toLowerCase() === lower) ?? options?.find((option) => option.toLowerCase().startsWith(`${lower}_`)) ?? options?.find((option) => option.toLowerCase().includes(lower));
}
