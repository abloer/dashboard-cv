import { useEffect, useMemo, useState } from "react";
import { HardHat, RotateCcw, Save, ShieldAlert } from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Header } from "@/components/layout/Header";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  DEFAULT_NO_SAFETY_VEST_CONFIG,
  type NoSafetyVestModuleConfig,
  readNoSafetyVestConfig,
  resetNoSafetyVestConfig,
  writeNoSafetyVestConfig,
} from "@/lib/noSafetyVestConfig";
import {
  getModuleConfigEnvelope,
  updateModuleConfig,
  type ModuleConfigActiveModel,
} from "@/lib/moduleConfigs";

export default function NoSafetyVestSetup() {
  const { toast } = useToast();
  const [config, setConfig] = useState<NoSafetyVestModuleConfig>(() => readNoSafetyVestConfig());
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
        ready: config.vestLabels.trim().length > 0,
        detail:
          config.violationLabels.trim().length > 0
            ? `${config.vestLabels || "--"} | ${config.violationLabels || "--"}`
            : `${config.vestLabels || "--"} | matching only`,
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
    getModuleConfigEnvelope<NoSafetyVestModuleConfig>("no-safety-vest")
      .then((payload) => {
        if (ignore) return;
        const mergedConfig = {
          ...DEFAULT_NO_SAFETY_VEST_CONFIG,
          ...payload.config,
        };
        setConfig(mergedConfig);
        setActiveModel(payload.activeModel);
        writeNoSafetyVestConfig(mergedConfig);
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

  const handleChange = (field: keyof NoSafetyVestModuleConfig, value: string) => {
    setConfig((current) => ({ ...current, [field]: value }));
  };

  const useDeploymentGateModel = () => {
    if (!activeModel?.modelPath) {
      toast({
        title: "Belum ada model aktif",
        description: "Deployment Gate belum punya model aktif untuk modul PPE • No Safety Vest.",
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

  const applyPositiveVestBaseline = () => {
    setConfig((current) => ({
      ...current,
      confidenceThreshold: "0.28",
      iouThreshold: "0.30",
      vestLabels: "safety-vest, vest",
      violationLabels: "",
      violationOnFrames: "3",
      cleanOffFrames: "3",
      frameStep: "2",
      imageSize: "1280",
      operationalNotes:
        "Baseline default disarankan memakai model positive vest yang stabil. Label negatif langsung dibuat opsional agar violation final lebih mengandalkan bukti vest positif yang hilang secara konsisten.",
    }));
    toast({
      title: "Baseline positive vest diterapkan",
      description: "Preset ini menyiapkan modul vest untuk model khusus rompi keselamatan dan mengurangi ketergantungan pada label negatif langsung.",
    });
  };

  const saveConfig = async () => {
    setIsSyncing(true);
    try {
      const saved = await updateModuleConfig("no-safety-vest", config);
      setConfig(saved);
      writeNoSafetyVestConfig(saved);
      toast({
        title: "Konfigurasi disimpan",
        description: "Preset default PPE • No Safety Vest tersimpan di server dan siap dipakai lintas browser.",
      });
    } catch (error) {
      writeNoSafetyVestConfig(config);
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

  const resetConfig = async () => {
    const defaults = resetNoSafetyVestConfig();
    setConfig(defaults);
    setIsSyncing(true);
    try {
      const saved = await updateModuleConfig("no-safety-vest", defaults);
      setConfig(saved);
      writeNoSafetyVestConfig(saved);
      toast({
        title: "Konfigurasi direset",
        description: "Preset modul no safety vest dikembalikan ke nilai default server.",
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
        title="PPE • No Safety Vest Setup"
        subtitle="Workspace setup default module untuk detector no safety vest dan baseline policy yang akan dipakai saat source PPE dijalankan dari Media Sources."
      />

      <div className="grid gap-6 xl:grid-cols-[1.05fr,0.95fr]">
        <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Detector Setup</CardTitle>
            <CardDescription>
              Preset detector ini menjadi baseline saat operator menjalankan modul <code>PPE • No Safety Vest</code> dari{" "}
              <code>Media Sources &gt; Run Analysis</code>.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2 md:col-span-2">
                <label className="text-sm font-medium text-foreground">Default Model Path</label>
                <Input value={config.modelPath} onChange={(event) => handleChange("modelPath", event.target.value)} />
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
                  <Button type="button" variant="outline" onClick={applyPositiveVestBaseline} disabled={isSyncing}>
                    Gunakan Baseline Positive Vest
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Default ROI ID</label>
                <Input value={config.roiId} onChange={(event) => handleChange("roiId", event.target.value)} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Default ROI Config Path</label>
                <Input value={config.roiConfigPath} onChange={(event) => handleChange("roiConfigPath", event.target.value)} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Confidence</label>
                <Input value={config.confidenceThreshold} onChange={(event) => handleChange("confidenceThreshold", event.target.value)} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">IoU Tracker</label>
                <Input value={config.iouThreshold} onChange={(event) => handleChange("iouThreshold", event.target.value)} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Vest Labels</label>
                <Input value={config.vestLabels} onChange={(event) => handleChange("vestLabels", event.target.value)} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Violation Labels</label>
                <Input value={config.violationLabels} onChange={(event) => handleChange("violationLabels", event.target.value)} />
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
              Baseline policy ini melengkapi detector setup agar pelanggaran rompi keselamatan langsung terbaca sebagai keputusan operasional default.
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
                <Textarea value={config.operationalNotes} onChange={(event) => handleChange("operationalNotes", event.target.value)} className="min-h-[110px]" />
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
                    <p className="text-sm font-medium text-foreground">Kesiapan Modul PPE • No Safety Vest</p>
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
                <HardHat className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                <p>
                  Preset ini dipakai untuk area yang ingin mengawasi kepatuhan rompi keselamatan, khususnya pada jalur loading, workshop, dan area akses alat berat.
                </p>
              </div>
              <div className="flex items-start gap-3 rounded-lg border border-border/70 bg-secondary/10 p-4">
                <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                <p>
                  Selain detector setup, modul ini sekarang menyimpan policy baseline seperti PPE wajib, cooldown alert, dan catatan operasional agar run per-source langsung konsisten.
                </p>
              </div>
              <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-4">
                <p className="text-sm font-medium text-foreground">Strategi Improvement Model Vest</p>
                <p className="mt-2 text-xs leading-6 text-muted-foreground">
                  Untuk modul vest, strategi yang lebih stabil adalah melatih model positif <span className="text-foreground">person + safety-vest</span>, lalu gunakan fallback logic untuk
                  mengidentifikasi pekerja yang tidak punya bukti vest secara konsisten. Label negatif langsung seperti <code>no-safety-vest</code> tetap opsional dan tidak perlu dipaksa menjadi
                  sinyal utama pada semua kamera.
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
                <p className="mt-1 break-all text-sm text-foreground">{config.modelPath}</p>
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
