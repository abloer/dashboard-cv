import { useState } from "react";
import { HardHat, Save, RotateCcw, Settings2 } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Header } from "@/components/layout/Header";
import { useMediaRegistry } from "@/hooks/useMediaRegistry";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  COMMUNITY_DEMO_PRESET,
  DEFAULT_NO_HELMET_CONFIG,
  readNoHelmetConfig,
  resetNoHelmetConfig,
  writeNoHelmetConfig,
  type NoHelmetModuleConfig,
} from "@/lib/noHelmetConfig";

export default function NoHelmetSetup() {
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const { data: mediaItems = [] } = useMediaRegistry();
  const [config, setConfig] = useState<NoHelmetModuleConfig>(() => readNoHelmetConfig());

  const selectedSourceId = searchParams.get("sourceId");
  const selectedSource = mediaItems.find((item) => item.id === selectedSourceId) || null;

  const handleChange = (field: keyof NoHelmetModuleConfig, value: string) => {
    setConfig((current) => ({ ...current, [field]: value }));
  };

  const applyDemoPreset = () => {
    setConfig((current) => ({
      ...current,
      modelPath: COMMUNITY_DEMO_PRESET.suggestedModelPath,
      confidenceThreshold: COMMUNITY_DEMO_PRESET.confidenceThreshold,
      personLabels: COMMUNITY_DEMO_PRESET.personLabels,
      helmetLabels: COMMUNITY_DEMO_PRESET.helmetLabels,
      violationLabels: COMMUNITY_DEMO_PRESET.violationLabels,
      violationOnFrames: COMMUNITY_DEMO_PRESET.violationOnFrames,
      cleanOffFrames: COMMUNITY_DEMO_PRESET.cleanOffFrames,
      frameStep: COMMUNITY_DEMO_PRESET.frameStep,
      imageSize: COMMUNITY_DEMO_PRESET.imageSize,
    }));
    toast({
      title: "Preset demo diterapkan",
      description: "Preset PPE • No Helmet siap disimpan sebagai konfigurasi default modul.",
    });
  };

  const saveConfig = () => {
    writeNoHelmetConfig(config);
    toast({
      title: "Konfigurasi disimpan",
      description:
        "Preset default PPE • No Helmet akan dipakai oleh halaman Run Analysis manual maupun source camera yang masuk ke monitoring otomatis.",
    });
  };

  const resetConfig = () => {
    const defaults = resetNoHelmetConfig();
    setConfig(defaults);
    toast({
      title: "Konfigurasi direset",
      description: "Preset modul dikembalikan ke nilai default aplikasi.",
    });
  };

  return (
    <DashboardLayout>
      <Header
        title="PPE • No Helmet Setup"
        subtitle="Halaman ini khusus untuk setup dan konfigurasi modul PPE rule no helmet. Eksekusi run dilakukan dari action pada Media Sources."
      />

      {selectedSource ? (
        <Card className="mb-6 border-cyan-500/20 bg-cyan-500/5">
          <CardContent className="grid gap-4 p-5 md:grid-cols-[1.5fr,1fr,1fr]">
            <div className="space-y-1">
              <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Source Konteks</p>
              <p className="text-lg font-semibold text-foreground">{selectedSource.name}</p>
              <p className="text-sm text-muted-foreground">
                {selectedSource.location} • {selectedSource.type === "upload" ? "Upload Video" : "Camera Stream"}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Kategori Output</p>
              <div className="flex flex-wrap gap-2">
                {selectedSource.analytics.map((analytic) => (
                  <Badge key={analytic} variant="outline" className="border-primary/20">
                    {analytic}
                  </Badge>
                ))}
              </div>
            </div>
            <div className="space-y-1">
              <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Eksekusi</p>
              <p className="text-sm text-muted-foreground">
                Setelah konfigurasi disimpan, gunakan `Run Analysis` untuk video batch/manual atau `Start Monitoring` untuk source camera otomatis.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[1.05fr,0.95fr]">
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Konfigurasi Default Modul</CardTitle>
            <CardDescription>
              Preset ini akan menjadi baseline saat operator mengeksekusi `PPE • No Helmet` dari Media Sources.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="rounded-lg border border-cyan-500/20 bg-cyan-500/5 p-4 space-y-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-medium text-foreground">Community Demo Preset</p>
                  <p className="text-xs text-muted-foreground">
                    Rekomendasi awal untuk model komunitas {COMMUNITY_DEMO_PRESET.name}.
                  </p>
                </div>
                <Button type="button" variant="outline" onClick={applyDemoPreset}>
                  Gunakan Preset Demo
                </Button>
              </div>
              <p className="text-xs break-all text-muted-foreground">
                Repo sumber: {COMMUNITY_DEMO_PRESET.repoUrl}
              </p>
              <p className="text-xs break-all text-muted-foreground">
                Suggested model path: {COMMUNITY_DEMO_PRESET.suggestedModelPath}
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2 md:col-span-2">
                <label className="text-sm font-medium text-foreground">Default Model Path</label>
                <Input
                  value={config.modelPath}
                  onChange={(event) => handleChange("modelPath", event.target.value)}
                  placeholder="/absolute/path/to/ppe-model.pt"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Default ROI ID</label>
                <Input value={config.roiId} onChange={(event) => handleChange("roiId", event.target.value)} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Default ROI Config Path</label>
                <Input
                  value={config.roiConfigPath}
                  onChange={(event) => handleChange("roiConfigPath", event.target.value)}
                  placeholder="Opsional"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Person Labels</label>
                <Input value={config.personLabels} onChange={(event) => handleChange("personLabels", event.target.value)} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Helmet Labels</label>
                <Input value={config.helmetLabels} onChange={(event) => handleChange("helmetLabels", event.target.value)} />
              </div>
              <div className="space-y-2 md:col-span-2">
                <label className="text-sm font-medium text-foreground">Violation Labels</label>
                <Input
                  value={config.violationLabels}
                  onChange={(event) => handleChange("violationLabels", event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Confidence</label>
                <Input
                  value={config.confidenceThreshold}
                  onChange={(event) => handleChange("confidenceThreshold", event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">IoU Tracker</label>
                <Input value={config.iouThreshold} onChange={(event) => handleChange("iouThreshold", event.target.value)} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Top Ratio</label>
                <Input value={config.topRatio} onChange={(event) => handleChange("topRatio", event.target.value)} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Helmet Overlap</label>
                <Input
                  value={config.helmetOverlapThreshold}
                  onChange={(event) => handleChange("helmetOverlapThreshold", event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">On Frames</label>
                <Input value={config.violationOnFrames} onChange={(event) => handleChange("violationOnFrames", event.target.value)} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Off Frames</label>
                <Input value={config.cleanOffFrames} onChange={(event) => handleChange("cleanOffFrames", event.target.value)} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Frame Step</label>
                <Input value={config.frameStep} onChange={(event) => handleChange("frameStep", event.target.value)} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Image Size</label>
                <Input value={config.imageSize} onChange={(event) => handleChange("imageSize", event.target.value)} />
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button type="button" onClick={saveConfig} className="gap-2">
                <Save className="h-4 w-4" />
                Simpan Konfigurasi
              </Button>
              <Button type="button" variant="outline" onClick={resetConfig} className="gap-2">
                <RotateCcw className="h-4 w-4" />
                Reset Default
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-xl">Peran Halaman Ini</CardTitle>
              <CardDescription>
                `PPE • No Helmet Setup` sekarang diposisikan sebagai workspace konfigurasi modul, bukan halaman eksekusi.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-sm text-muted-foreground">
              <div className="flex items-start gap-3 rounded-lg border border-border/70 bg-secondary/10 p-4">
                <Settings2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                <p>
                  Gunakan halaman ini untuk menyimpan default model, threshold, label mapping, dan rule smoothing yang akan dipakai operator saat run analysis.
                </p>
              </div>
              <div className="flex items-start gap-3 rounded-lg border border-border/70 bg-secondary/10 p-4">
                <HardHat className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                <p>
                  Modul ini tidak lagi menjadi tombol eksekusi utama. Eksekusi manual ada di{" "}
                  <span className="font-medium text-foreground">Media Sources &gt; Run Analysis</span>,
                  sedangkan source camera live dikendalikan dari{" "}
                  <span className="font-medium text-foreground">Live Monitoring</span>.
                </p>
              </div>
              <div className="flex items-start gap-3 rounded-lg border border-border/70 bg-secondary/10 p-4">
                <HardHat className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                <p>
                  Eksekusi aktual `PPE • No Helmet` dilakukan dari action `Run Analysis` pada masing-masing row di `Media Sources`, agar workflow operasional tetap berpusat pada source.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-xl">Preset Aktif Saat Ini</CardTitle>
              <CardDescription>
                Ringkasan singkat konfigurasi default yang akan diturunkan ke halaman run.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded-lg border border-border/70 bg-secondary/10 p-4">
                <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Model</p>
                <p className="mt-1 break-all text-sm text-foreground">{config.modelPath || DEFAULT_NO_HELMET_CONFIG.modelPath}</p>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-lg border border-border/70 bg-secondary/10 p-4">
                  <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Threshold</p>
                  <p className="mt-1 text-sm text-foreground">
                    Conf {config.confidenceThreshold} • IoU {config.iouThreshold}
                  </p>
                </div>
                <div className="rounded-lg border border-border/70 bg-secondary/10 p-4">
                  <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Smoothing</p>
                  <p className="mt-1 text-sm text-foreground">
                    On {config.violationOnFrames} • Off {config.cleanOffFrames} • Step {config.frameStep}
                  </p>
                </div>
              </div>
              <div className="rounded-lg border border-border/70 bg-secondary/10 p-4">
                <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Label Mapping</p>
                <p className="mt-1 text-sm text-foreground">
                  Person: {config.personLabels} | Helmet: {config.helmetLabels} | Violation: {config.violationLabels}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
