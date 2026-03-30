import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, HardHat, Save, RotateCcw, Settings2 } from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Header } from "@/components/layout/Header";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  COMMUNITY_DEMO_PRESET,
  DEFAULT_NO_HELMET_CONFIG,
  STRICT_DISTANCE_PRESET,
  readNoHelmetConfig,
  resetNoHelmetConfig,
  writeNoHelmetConfig,
  type NoHelmetModuleConfig,
} from "@/lib/noHelmetConfig";
import { getModuleConfigEnvelope, updateModuleConfig, type ModuleConfigActiveModel } from "@/lib/moduleConfigs";

export default function NoHelmetSetup() {
  const { toast } = useToast();
  const [config, setConfig] = useState<NoHelmetModuleConfig>(() => readNoHelmetConfig());
  const [activeModel, setActiveModel] = useState<ModuleConfigActiveModel | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const readiness = useMemo(
    () => [
      {
        label: "Model Detector",
        ready: config.modelPath.trim().length > 0,
        detail: config.modelPath.trim() || "Model path belum diisi.",
      },
      {
        label: "Label Mapping",
        ready:
          config.personLabels.trim().length > 0 &&
          config.helmetLabels.trim().length > 0,
        detail: `${config.personLabels || "--"} | ${config.helmetLabels || "--"} | ${config.violationLabels || "matching only"}`,
      },
      {
        label: "Rule Smoothing",
        ready:
          config.violationOnFrames.trim().length > 0 &&
          config.cleanOffFrames.trim().length > 0 &&
          config.frameStep.trim().length > 0,
        detail: `On ${config.violationOnFrames || "--"} • Off ${config.cleanOffFrames || "--"} • Step ${config.frameStep || "--"}`,
      },
      {
        label: "Policy Baseline",
        ready: config.requiredPpe.trim().length > 0 && config.alertCooldownSeconds.trim().length > 0,
        detail: `PPE wajib: ${config.requiredPpe || "--"} • Cooldown ${config.alertCooldownSeconds || "--"}s`,
      },
    ],
    [config]
  );
  const readyCount = readiness.filter((item) => item.ready).length;

  useEffect(() => {
    let ignore = false;
    setIsSyncing(true);
    getModuleConfigEnvelope<NoHelmetModuleConfig>("no-helmet")
      .then((payload) => {
        if (ignore) return;
        setConfig(payload.config);
        setActiveModel(payload.activeModel);
        writeNoHelmetConfig(payload.config);
      })
      .catch(() => {
        if (ignore) return;
      })
      .finally(() => {
        if (!ignore) {
          setIsSyncing(false);
        }
      });

    return () => {
      ignore = true;
    };
  }, []);

  const handleChange = (field: keyof NoHelmetModuleConfig, value: string) => {
    setConfig((current) => ({ ...current, [field]: value }));
  };

  const applyDemoPreset = () => {
    setConfig((current) => ({
      ...current,
      modelSource: "manual",
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

  const applyStrictDistancePreset = () => {
    setConfig((current) => ({
      ...current,
      modelSource: "manual",
      modelPath: STRICT_DISTANCE_PRESET.suggestedModelPath,
      confidenceThreshold: STRICT_DISTANCE_PRESET.confidenceThreshold,
      iouThreshold: STRICT_DISTANCE_PRESET.iouThreshold,
      topRatio: STRICT_DISTANCE_PRESET.topRatio,
      helmetOverlapThreshold: STRICT_DISTANCE_PRESET.helmetOverlapThreshold,
      personLabels: STRICT_DISTANCE_PRESET.personLabels,
      helmetLabels: STRICT_DISTANCE_PRESET.helmetLabels,
      violationLabels: STRICT_DISTANCE_PRESET.violationLabels,
      violationOnFrames: STRICT_DISTANCE_PRESET.violationOnFrames,
      cleanOffFrames: STRICT_DISTANCE_PRESET.cleanOffFrames,
      frameStep: STRICT_DISTANCE_PRESET.frameStep,
      imageSize: STRICT_DISTANCE_PRESET.imageSize,
    }));
    toast({
      title: "Preset strict diterapkan",
      description: "Preset konservatif untuk kamera jauh diterapkan agar false positive no helmet berkurang.",
    });
  };

  const saveConfig = async () => {
    setIsSyncing(true);
    try {
      const saved = await updateModuleConfig("no-helmet", config);
      setConfig(saved);
      writeNoHelmetConfig(saved);
      toast({
        title: "Konfigurasi disimpan",
        description:
          "Preset default PPE • No Helmet tersimpan di server dan siap dipakai lintas browser maupun hasil Deployment Gate.",
      });
    } catch (error) {
      writeNoHelmetConfig(config);
      toast({
        title: "Server config belum tersinkron",
        description:
          error instanceof Error
            ? `${error.message} Preset lokal tetap disimpan di browser ini.`
            : "Preset lokal tetap disimpan di browser ini.",
        variant: "destructive",
      });
    } finally {
      setIsSyncing(false);
    }
  };

  const useDeploymentGateModel = () => {
    if (!activeModel?.modelPath) {
      toast({
        title: "Belum ada model aktif",
        description: "Deployment Gate belum punya model aktif untuk modul PPE • No Helmet.",
        variant: "destructive",
      });
      return;
    }

    setConfig((current) => ({
      ...current,
      modelSource: "deployment-gate",
      modelPath: activeModel.modelPath,
    }));
    toast({
      title: "Model aktif dipakai",
      description: `Konfigurasi sekarang mengikuti model aktif ${activeModel.name} dari Deployment Gate.`,
    });
  };

  const resetConfig = async () => {
    const defaults = resetNoHelmetConfig();
    setConfig(defaults);
    setIsSyncing(true);
    try {
      const saved = await updateModuleConfig("no-helmet", defaults);
      setConfig(saved);
      writeNoHelmetConfig(saved);
      toast({
        title: "Konfigurasi direset",
        description: "Preset modul dikembalikan ke default server.",
      });
    } catch (error) {
      toast({
        title: "Reset lokal berhasil",
        description:
          error instanceof Error
            ? `${error.message} Default lokal tetap diterapkan pada browser ini.`
            : "Default lokal tetap diterapkan pada browser ini.",
        variant: "destructive",
      });
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <DashboardLayout>
      <Header
        title="PPE • No Helmet Setup"
        subtitle="Workspace setup default module untuk detector no helmet dan baseline policy yang akan dipakai saat source PPE dijalankan dari Media Sources."
      />

      <div className="grid gap-6 xl:grid-cols-[1.05fr,0.95fr]">
        <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Detector Setup</CardTitle>
            <CardDescription>
              Preset detector ini menjadi baseline saat operator mengeksekusi <code>PPE • No Helmet</code> dari{" "}
              <code>Media Sources &gt; Run Analysis</code>.
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

            <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-4 space-y-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-medium text-foreground">Strict Distant-View Preset</p>
                  <p className="text-xs text-muted-foreground">
                    Rekomendasi untuk kamera jauh, objek kecil, dan scene yang rawan false positive.
                  </p>
                </div>
                <Button type="button" variant="outline" onClick={applyStrictDistancePreset}>
                  Gunakan Preset Strict
                </Button>
              </div>
              <p className="text-xs break-all text-muted-foreground">
                Conf {STRICT_DISTANCE_PRESET.confidenceThreshold} • Step {STRICT_DISTANCE_PRESET.frameStep} • On {STRICT_DISTANCE_PRESET.violationOnFrames} • Off {STRICT_DISTANCE_PRESET.cleanOffFrames} • ImgSz {STRICT_DISTANCE_PRESET.imageSize}
              </p>
              <p className="text-xs text-muted-foreground">
                Label pelanggaran langsung dikosongkan agar engine mengandalkan matching `person + hardhat`, bukan tuduhan `no-hardhat` langsung.
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
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <Badge variant={config.modelSource === "deployment-gate" ? "default" : "secondary"}>
                    {config.modelSource === "deployment-gate" ? "Deployment Gate" : "Manual Override"}
                  </Badge>
                  {activeModel ? (
                    <span>
                      Model aktif: <span className="text-foreground">{activeModel.name}</span>
                    </span>
                  ) : (
                    <span>Belum ada model aktif dari Deployment Gate untuk modul ini.</span>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" onClick={useDeploymentGateModel} disabled={isSyncing || !activeModel}>
                    Gunakan Model Aktif
                  </Button>
                </div>
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
                  placeholder="Opsional. Kosongkan untuk hanya memakai person + hardhat matching"
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
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Policy / Rules Engine</CardTitle>
            <CardDescription>
              Baseline policy ini melengkapi detector setup, sehingga hasil deteksi bisa langsung dibaca sebagai keputusan operasional default.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2 md:col-span-2">
                <label className="text-sm font-medium text-foreground">Required PPE</label>
                <Input value={config.requiredPpe} onChange={(event) => handleChange("requiredPpe", event.target.value)} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Alert Cooldown (s)</label>
                <Input
                  value={config.alertCooldownSeconds}
                  onChange={(event) => handleChange("alertCooldownSeconds", event.target.value)}
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <label className="text-sm font-medium text-foreground">Operational Notes</label>
                <Textarea
                  value={config.operationalNotes}
                  onChange={(event) => handleChange("operationalNotes", event.target.value)}
                  className="min-h-[110px]"
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button type="button" onClick={saveConfig} className="gap-2" disabled={isSyncing}>
                <Save className="h-4 w-4" />
                {isSyncing ? "Menyimpan..." : "Simpan Konfigurasi"}
              </Button>
              <Button type="button" variant="outline" onClick={resetConfig} className="gap-2" disabled={isSyncing}>
                <RotateCcw className="h-4 w-4" />
                Reset Default
              </Button>
            </div>
          </CardContent>
        </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-xl">Readiness & Peran Modul</CardTitle>
              <CardDescription>
                Menu `Analysis Modules` dipakai untuk menyiapkan default detector dan policy. Proses run aktual tetap berjalan per-source dari `Media Sources`.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-sm text-muted-foreground">
              <div className="rounded-lg border border-cyan-500/20 bg-cyan-500/5 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">Kesiapan Modul PPE • No Helmet</p>
                    <p className="text-xs text-muted-foreground">
                      {readyCount} dari {readiness.length} komponen inti sudah terisi.
                    </p>
                  </div>
                  <Badge variant={readyCount === readiness.length ? "default" : "secondary"}>
                    {readyCount === readiness.length ? "Ready" : "Needs Review"}
                  </Badge>
                </div>
                <div className="mt-4 grid gap-3">
                  {readiness.map((item) => (
                    <div key={item.label} className="rounded-lg border border-border/70 bg-background/40 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-medium text-foreground">{item.label}</p>
                        <Badge variant={item.ready ? "default" : "secondary"}>
                          {item.ready ? "Ready" : "Missing"}
                        </Badge>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">{item.detail}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex items-start gap-3 rounded-lg border border-border/70 bg-secondary/10 p-4">
                <Settings2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                <p>
                  Gunakan halaman ini untuk menyimpan default detector, threshold, label mapping, dan policy baseline yang akan dipakai operator saat run analysis.
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
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                <p>
                  Policy baseline seperti PPE wajib, cooldown alert, dan catatan operasional disimpan di level modul agar setiap source PPE mewarisi default yang sama sebelum dijalankan.
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
                  Person: {config.personLabels} | Helmet: {config.helmetLabels} | Violation: {config.violationLabels || "matching only"}
                </p>
              </div>
              <div className="rounded-lg border border-border/70 bg-secondary/10 p-4">
                <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Policy Baseline</p>
                <p className="mt-1 text-sm text-foreground">
                  PPE: {config.requiredPpe} | Cooldown: {config.alertCooldownSeconds}s
                </p>
                <p className="mt-2 text-sm text-muted-foreground">{config.operationalNotes}</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
