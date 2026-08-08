"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  CheckCircle2,
  Clock,
  AlertTriangle,
  FileText,
  RefreshCw,
  Play,
  Download,
  ChevronRight,
} from "@/components/icons";

interface Overview {
  totalEntries: number;
  describedEntries: number;
  missingDescriptions: number;
  coveragePercent: number;
  ambiguousEntries: number;
  validationValid: number;
  validationTotal: number;
  buildStatus: string;
  runtimeCodeChanges: number;
  lastSnapshot: string;
  lastExtractionTimestamp: string;
  lastValidationTimestamp: string;
  lastBuildTimestamp: string;
}

interface CoverageEntry {
  entityType: string;
  total: number;
  described: number;
  missing: number;
  coveragePercent: number;
  status: "complete" | "partial" | "not_started" | "warning";
  nextAction: string;
}

interface PipelineStage {
  id: string;
  name: string;
  status: "complete" | "current" | "next" | "future" | "blocked";
  description: string;
}

interface MissingEntry {
  entry_id: string;
  entity_type: string;
  missing_fields: string[];
  reason: string;
  needs_human_review: boolean;
}

interface SourceDescription {
  entry_id: string;
  entity_type: string;
  description: string | null;
  source_file: string;
  source_path_or_symbol: string;
  extraction_method: string;
}

interface AmbiguousEntry {
  symbol: string;
  entities: string[];
  ambiguity_type: string;
  needs_human_review: boolean;
}

interface Report {
  id: string;
  name: string;
  path: string;
  exists: boolean;
  timestamp: string | null;
}

export default function LexiconStatusPage() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [coverage, setCoverage] = useState<CoverageEntry[]>([]);
  const [pipeline, setPipeline] = useState<PipelineStage[]>([]);
  const [missing, setMissing] = useState<MissingEntry[]>([]);
  const [descriptions, setDescriptions] = useState<SourceDescription[]>([]);
  const [ambiguous, setAmbiguous] = useState<AmbiguousEntry[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [validationStatus, setValidationStatus] = useState<"idle" | "running" | "success" | "error">("idle");
  const [buildStatus, setBuildStatus] = useState<"idle" | "running" | "success" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const [overviewRes, coverageRes, pipelineRes, missingRes, descriptionsRes, ambiguousRes, reportsRes] =
        await Promise.all([
          fetch("/api/lexicon?action=overview"),
          fetch("/api/lexicon?action=coverage"),
          fetch("/api/lexicon?action=pipeline"),
          fetch("/api/lexicon?action=missing"),
          fetch("/api/lexicon?action=descriptions"),
          fetch("/api/lexicon?action=ambiguous"),
          fetch("/api/lexicon?action=reports"),
        ]);

      setOverview(await overviewRes.json());
      setCoverage(await coverageRes.json());
      setPipeline(await pipelineRes.json());
      const missingData = await missingRes.json();
      setMissing(missingData.entries || []);
      const descriptionsData = await descriptionsRes.json();
      setDescriptions(descriptionsData.entries || []);
      const ambiguousData = await ambiguousRes.json();
      setAmbiguous(ambiguousData?.ambiguous_descriptions || []);
      const reportsData = await reportsRes.json();
      setReports(reportsData || []);
    } catch (e) {
      console.error("Error loading data:", e);
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function runValidation() {
    setValidationStatus("running");
    try {
      const res = await fetch("/api/lexicon?action=validate", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        setValidationStatus("success");
        await loadData();
      } else {
        setValidationStatus("error");
      }
    } catch (e) {
      setValidationStatus("error");
    }
  }

  async function runBuild() {
    if (!confirm("Build validated lexicon? This will write to the validated directory.")) return;
    setBuildStatus("running");
    try {
      const res = await fetch("/api/lexicon?action=build", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        setBuildStatus("success");
        await loadData();
      } else {
        setBuildStatus("error");
      }
    } catch (e) {
      setBuildStatus("error");
    }
  }

  function getStatusBadge(status: string) {
    switch (status) {
      case "complete":
        return <Badge variant="default" className="bg-green-600">Complete</Badge>;
      case "partial":
        return <Badge variant="secondary">Partial</Badge>;
      case "not_started":
        return <Badge variant="outline">Not Started</Badge>;
      case "warning":
        return <Badge variant="destructive">Warning</Badge>;
      case "current":
        return <Badge variant="default" className="bg-blue-600">Current</Badge>;
      case "next":
        return <Badge variant="secondary">Next</Badge>;
      case "future":
        return <Badge variant="outline">Future</Badge>;
      case "blocked":
        return <Badge variant="destructive">Blocked</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <RefreshCw className="animate-spin h-8 w-8" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center space-y-4">
          <AlertTriangle className="h-12 w-12 text-red-600 mx-auto" />
          <div className="text-lg font-medium">Error loading lexicon data</div>
          <div className="text-sm text-muted-foreground">{error}</div>
          <Button onClick={loadData} variant="outline">
            <RefreshCw className="mr-2 h-4 w-4" />
            Retry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Meta-Lexicon Status Dashboard</h1>
          <p className="text-muted-foreground">Machine and semantic layer completeness</p>
        </div>
        <Button onClick={loadData} variant="outline">
          <RefreshCw className="mr-2 h-4 w-4" />
          Refresh
        </Button>
      </div>

      {/* Overview Section */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Entries</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{overview?.totalEntries || 0}</div>
            <p className="text-xs text-muted-foreground">Across 9 entity types</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Described</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-600">{overview?.describedEntries || 0}</div>
            <p className="text-xs text-muted-foreground">{overview?.coveragePercent || 0}% coverage</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Missing</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-orange-600">{overview?.missingDescriptions || 0}</div>
            <p className="text-xs text-muted-foreground">Require enrichment</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Ambiguous</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-red-600">{overview?.ambiguousEntries || 0}</div>
            <p className="text-xs text-muted-foreground">Duplicate symbols</p>
          </CardContent>
        </Card>
      </div>

      {/* Coverage Progress */}
      <Card>
        <CardHeader>
          <CardTitle>Overall Coverage</CardTitle>
        </CardHeader>
        <CardContent>
          <Progress value={overview?.coveragePercent || 0} className="h-4" />
          <div className="flex justify-between mt-2 text-sm text-muted-foreground">
            <span>{overview?.describedEntries || 0} described</span>
            <span>{overview?.coveragePercent || 0}%</span>
            <span>{overview?.missingDescriptions || 0} missing</span>
          </div>
        </CardContent>
      </Card>

      {/* Entity Coverage Table */}
      <Card>
        <CardHeader>
          <CardTitle>Coverage by Entity Type</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-2">Entity Type</th>
                  <th className="text-right p-2">Total</th>
                  <th className="text-right p-2">Described</th>
                  <th className="text-right p-2">Missing</th>
                  <th className="text-right p-2">Coverage</th>
                  <th className="text-center p-2">Status</th>
                  <th className="text-left p-2">Next Action</th>
                </tr>
              </thead>
              <tbody>
                {coverage?.map((entry) => (
                  <tr key={entry.entityType} className="border-b">
                    <td className="p-2 font-medium">{entry.entityType}</td>
                    <td className="text-right p-2">{entry.total}</td>
                    <td className="text-right p-2 text-green-600">{entry.described}</td>
                    <td className="text-right p-2 text-orange-600">{entry.missing}</td>
                    <td className="text-right p-2">{entry.coveragePercent}%</td>
                    <td className="text-center p-2">{getStatusBadge(entry.status)}</td>
                    <td className="p-2 text-sm text-muted-foreground">{entry.nextAction}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Global Pipeline */}
      <Card>
        <CardHeader>
          <CardTitle>Global Project Stage</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {pipeline?.map((stage) => (
              <div key={stage.id} className="flex items-center gap-4 p-3 rounded-lg border">
                <div className="flex-shrink-0">{getStatusBadge(stage.status)}</div>
                <div className="flex-grow">
                  <div className="font-medium">{stage.name}</div>
                  <div className="text-sm text-muted-foreground">{stage.description}</div>
                </div>
                {stage.status === "next" && (
                  <ChevronRight className="h-5 w-5 text-blue-600" />
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Tabs for detailed views */}
      <Tabs defaultValue="missing">
        <TabsList>
          <TabsTrigger value="missing">Missing Descriptions ({missing?.length || 0})</TabsTrigger>
          <TabsTrigger value="descriptions">Source Descriptions ({descriptions?.length || 0})</TabsTrigger>
          <TabsTrigger value="ambiguous">Ambiguous ({ambiguous?.length || 0})</TabsTrigger>
          <TabsTrigger value="reports">Reports ({reports?.length || 0})</TabsTrigger>
          <TabsTrigger value="validation">Validation & Build</TabsTrigger>
        </TabsList>

        <TabsContent value="missing">
          <Card>
            <CardHeader>
              <CardTitle>Missing Semantic Descriptions</CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[400px]">
                <div className="space-y-2">
                  {missing?.map((entry) => (
                    <div key={entry.entry_id} className="p-3 rounded-lg border">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-medium">{entry.entry_id}</div>
                          <div className="text-sm text-muted-foreground">{entry.entity_type}</div>
                        </div>
                        {entry.needs_human_review && (
                          <Badge variant="outline">Needs Review</Badge>
                        )}
                      </div>
                      <div className="text-sm text-muted-foreground mt-1">{entry.reason}</div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="descriptions">
          <Card>
            <CardHeader>
              <CardTitle>Extracted Source Descriptions</CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[400px]">
                <div className="space-y-2">
                  {descriptions?.map((entry) => (
                    <div key={entry.entry_id} className="p-3 rounded-lg border">
                      <div className="font-medium">{entry.entry_id}</div>
                      <div className="text-sm text-muted-foreground">{entry.entity_type}</div>
                      {entry.description && (
                        <div className="text-sm mt-1">{entry.description}</div>
                      )}
                      <div className="text-xs text-muted-foreground mt-1">
                        Source: {entry.source_file} ({entry.extraction_method})
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ambiguous">
          <Card>
            <CardHeader>
              <CardTitle>Ambiguities and Duplicate Symbols</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {ambiguous?.map((entry) => (
                  <div key={entry.symbol} className="p-4 rounded-lg border border-orange-200 bg-orange-50 dark:bg-orange-950">
                    <div className="font-medium text-lg">{entry.symbol}</div>
                    <div className="text-sm text-muted-foreground mb-2">{entry.ambiguity_type}</div>
                    <div className="space-y-1">
                      {entry.entities.map((entity) => (
                        <div key={entity} className="text-sm">{entity}</div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="reports">
          <Card>
            <CardHeader>
              <CardTitle>Available Reports</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {reports?.map((report) => (
                  <div key={report.id} className="flex items-center justify-between p-3 rounded-lg border">
                    <div className="flex items-center gap-3">
                      <FileText className="h-5 w-5 text-muted-foreground" />
                      <div>
                        <div className="font-medium">{report.name}</div>
                        <div className="text-sm text-muted-foreground">{report.path}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {report.exists ? (
                        <Badge variant="default" className="bg-green-600">Available</Badge>
                      ) : (
                        <Badge variant="outline">Not Found</Badge>
                      )}
                      <Button size="sm" variant="outline" disabled={!report.exists}>
                        <Download className="h-4 w-4 mr-1" />
                        Download
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="validation">
          <Card>
            <CardHeader>
              <CardTitle>Validation and Build Controls</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-medium">Validation Status</h3>
                    {getStatusBadge(validationStatus)}
                  </div>
                  <div className="text-sm text-muted-foreground mb-2">
                    {overview?.validationValid || 0}/{overview?.validationTotal || 0} entries valid
                  </div>
                  <Button onClick={runValidation} disabled={validationStatus === "running"}>
                    {validationStatus === "running" ? (
                      <>
                        <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                        Running...
                      </>
                    ) : (
                      <>
                        <Play className="mr-2 h-4 w-4" />
                        Run Validation
                      </>
                    )}
                  </Button>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-medium">Build Status</h3>
                    {getStatusBadge(buildStatus)}
                  </div>
                  <div className="text-sm text-muted-foreground mb-2">
                    Last build: {overview?.buildStatus || "unknown"}
                  </div>
                  <div className="text-sm text-muted-foreground mb-2">
                    Snapshot: {overview?.lastSnapshot || "none"}
                  </div>
                  <Button onClick={runBuild} disabled={buildStatus === "running"}>
                    {buildStatus === "running" ? (
                      <>
                        <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                        Building...
                      </>
                    ) : (
                      <>
                        <Play className="mr-2 h-4 w-4" />
                        Build Validated Lexicon
                      </>
                    )}
                  </Button>
                </div>
              </div>

              <div className="pt-4 border-t">
                <h3 className="font-medium mb-2">Last Operations</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Extraction:</span>
                    <span>{overview?.lastExtractionTimestamp ? new Date(overview.lastExtractionTimestamp).toLocaleString() : "N/A"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Validation:</span>
                    <span>{overview?.lastValidationTimestamp ? new Date(overview.lastValidationTimestamp).toLocaleString() : "N/A"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Build:</span>
                    <span>{overview?.lastBuildTimestamp ? new Date(overview.lastBuildTimestamp).toLocaleString() : "N/A"}</span>
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <span>Runtime code changes: {overview?.runtimeCodeChanges ?? 0}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
