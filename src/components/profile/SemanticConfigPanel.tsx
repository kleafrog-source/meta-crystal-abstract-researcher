"use client";

import { useState } from "react";
import { Brain, CheckCircle2, Loader2, RotateCcw, Search } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FieldLabel } from "@/components/ui/field-hint";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { apiPost } from "@/hooks/use-fetch";
import type { EditableProfile } from "@/lib/profile-presets";

type SemanticMatchedEntry = {
  id: string;
  entityType: string;
  displayName: string;
  technicalName: string;
  description: string | null;
  confidence: number;
  score: number;
  matchedPhrase: string | null;
  reason: string;
  selectedValue: string | number | boolean | null;
};

type ProposedParameterValue = {
  value: string | number | boolean;
  source: string;
  confidence: number | "default";
  reason: string;
};

type ValidationWarning = {
  level: "warning" | "error";
  code: string;
  message: string;
  field?: string;
};

type ConfigDiffEntry = {
  scope: "params" | "flags" | "patterns";
  key: string;
  before: unknown;
  after: unknown;
  source: "query_explicit" | "semantic_retrieval";
  reason: string;
};

type SemanticConfigProposal = {
  query: string;
  retrievalMode: "dense";
  profile: EditableProfile;
  proposal: {
    generation: Record<string, ProposedParameterValue>;
    domains: SemanticMatchedEntry[];
    patterns: SemanticMatchedEntry[];
    operators: SemanticMatchedEntry[];
    formulas: SemanticMatchedEntry[];
    metrics: SemanticMatchedEntry[];
    lexicalCategories: SemanticMatchedEntry[];
    constants: SemanticMatchedEntry[];
  };
  matchedEntries: SemanticMatchedEntry[];
  defaultedParameters: string[];
  inferredParameters: string[];
  warnings: ValidationWarning[];
  hardErrors: ValidationWarning[];
  configurationDiff: ConfigDiffEntry[];
};

export function SemanticConfigPanel({
  profile,
  onApplyProposal,
}: {
  profile: EditableProfile;
  onApplyProposal: (profile: EditableProfile) => void;
}) {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [proposal, setProposal] = useState<SemanticConfigProposal | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSuggest = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await apiPost<{ proposal: SemanticConfigProposal }>("/api/lexicon/propose", {
        query,
        profile,
      });
      setProposal(result.proposal);
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleApply = () => {
    if (!proposal) return;
    onApplyProposal(proposal.profile);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <Brain className="h-4 w-4 text-cyan-300" />
            Semantic parameter retrieval
          </CardTitle>
          <CardDescription>
            Free-form query {"->"} dense retrieval over validated lexicon {"->"} proposed profile diff. Generator parameters are not applied until you confirm them.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <FieldLabel
              label="Natural-language query"
              hint="Напишите свободный запрос. Система подберет домены, паттерны и связанные записи meta-lexicon, затем соберет предложенную конфигурацию без автозапуска генератора."
            />
            <Textarea
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="min-h-[120px]"
              placeholder="Generate complex mathematical and biomimetic crystals using a genetic cycle and topological cascade..."
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={handleSuggest} disabled={loading || !query.trim()}>
              {loading ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Search className="mr-1.5 h-3.5 w-3.5" />}
              Suggest configuration
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setProposal(null);
                setError(null);
                setQuery("");
              }}
            >
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
              Reset
            </Button>
            <Badge variant="outline">manual confirmation only</Badge>
            <Badge variant="outline">dense retrieval</Badge>
          </div>
          {error ? <div className="rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{error}</div> : null}
        </CardContent>
      </Card>

      {proposal ? (
        <div className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Matched lexicon entries</CardTitle>
              <CardDescription>
                Original query, semantic matches, confidence, matched phrases and proposed directional choices.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-md border border-border/60 bg-card/30 p-3 text-sm text-muted-foreground">
                <div className="mb-1 text-xs uppercase tracking-wide text-emerald-300">Original query</div>
                <div>{proposal.query}</div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">{proposal.matchedEntries.length} matches</Badge>
                <Badge variant="outline">{proposal.defaultedParameters.length} defaulted params</Badge>
                <Badge variant="outline">{proposal.inferredParameters.length} inferred changes</Badge>
              </div>
              <ScrollArea className="h-[520px] rounded-md border border-border/60 bg-card/20">
                <div className="space-y-4 p-4">
                  <EntryGroup title="Domains" entries={proposal.proposal.domains} />
                  <EntryGroup title="Patterns" entries={proposal.proposal.patterns} />
                  <EntryGroup title="Operators" entries={proposal.proposal.operators} />
                  <EntryGroup title="Formulas" entries={proposal.proposal.formulas} />
                  <EntryGroup title="Metrics" entries={proposal.proposal.metrics} />
                  <EntryGroup title="Lexical categories" entries={proposal.proposal.lexicalCategories} />
                  <EntryGroup title="Constants" entries={proposal.proposal.constants} />
                </div>
              </ScrollArea>
            </CardContent>
          </Card>

          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Generation proposal</CardTitle>
                <CardDescription>Defaults, explicit overrides and configuration diff against the current profile.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                  {Object.entries(proposal.proposal.generation).map(([key, item]) => (
                    <div key={key} className="rounded-md border border-border/60 bg-card/30 px-3 py-2 text-xs">
                      <div className="font-mono text-emerald-300">{key}</div>
                      <div className="mt-1 font-mono">{String(item.value)}</div>
                      <div className="mt-1 text-muted-foreground">{item.source}</div>
                    </div>
                  ))}
                </div>
                <div className="space-y-2">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">Warnings</div>
                  {proposal.warnings.length === 0 ? (
                    <div className="text-sm text-muted-foreground">No warnings.</div>
                  ) : (
                    proposal.warnings.map((warning) => (
                      <div key={`${warning.code}-${warning.field ?? ""}`} className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
                        {warning.message}
                      </div>
                    ))
                  )}
                </div>
                <div className="space-y-2">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">Hard errors</div>
                  {proposal.hardErrors.length === 0 ? (
                    <div className="text-sm text-muted-foreground">No hard errors.</div>
                  ) : (
                    proposal.hardErrors.map((warning) => (
                      <div key={`${warning.code}-${warning.field ?? ""}`} className="rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-100">
                        {warning.message}
                      </div>
                    ))
                  )}
                </div>
                <div className="space-y-2">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">Configuration diff</div>
                  {proposal.configurationDiff.length === 0 ? (
                    <div className="text-sm text-muted-foreground">No changes against the current profile.</div>
                  ) : (
                    <div className="space-y-2">
                      {proposal.configurationDiff.map((entry) => (
                        <div key={`${entry.scope}-${entry.key}`} className="rounded-md border border-border/60 bg-card/30 px-3 py-2 text-sm">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-mono text-cyan-300">{entry.scope}.{entry.key}</span>
                            <Badge variant="outline">{entry.source}</Badge>
                          </div>
                          <div className="mt-1 text-muted-foreground">
                            {stringifyValue(entry.before)} {"->"} {stringifyValue(entry.after)}
                          </div>
                          <div className="mt-1 text-xs text-muted-foreground">{entry.reason}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button onClick={handleApply} disabled={proposal.hardErrors.length > 0}>
                    <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                    Apply to current profile
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function EntryGroup({ title, entries }: { title: string; entries: SemanticMatchedEntry[] }) {
  if (entries.length === 0) return null;
  return (
    <section className="space-y-2">
      <div className="flex items-center gap-2">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</div>
        <Badge variant="outline">{entries.length}</Badge>
      </div>
      <div className="space-y-2">
        {entries.map((entry) => (
          <div key={entry.id} className="rounded-md border border-border/60 bg-card/30 px-3 py-2 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium text-foreground">{entry.displayName}</span>
              <Badge variant="outline">{entry.entityType}</Badge>
              <Badge variant="outline">{entry.confidence.toFixed(2)}</Badge>
            </div>
            <div className="mt-1 text-xs font-mono text-cyan-300">{entry.id}</div>
            {entry.description ? <div className="mt-1 text-sm text-muted-foreground">{entry.description}</div> : null}
            <div className="mt-1 flex flex-wrap gap-3 text-xs text-muted-foreground">
              {entry.matchedPhrase ? <span>matched: {entry.matchedPhrase}</span> : null}
              <span>{entry.reason}</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function stringifyValue(value: unknown) {
  if (typeof value === "boolean") return value ? "true" : "false";
  if (Array.isArray(value)) return value.join(", ");
  if (value == null) return "null";
  return String(value);
}
