import { useEffect, useMemo, useState } from "react";
import { RotateCcw, Save, ShieldAlert, Truck } from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Header } from "@/components/layout/Header";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  DEFAULT_DUMP_TRUCK_BED_OPEN_CONFIG,
  readDumpTruckBedOpenConfig,
  resetDumpTruckBedOpenConfig,
  type DumpTruckBedOpenModuleConfig,
  writeDumpTruckBedOpenConfig,
} from "@/lib/dumpTruckBedOpenConfig";
import {
  getModuleConfigEnvelope,
  updateModuleConfig,
  type ModuleConfigActiveModel,
} from "@/lib/moduleConfigs";

export default function DumpTruckBedOpenSetup() {
  const { toast } = useToast();
  const [config, setConfig] = useState<DumpTruckBedOpenModuleConfig>(() => readDumpTruckBedOpenConfig());
  const [activeModel, setActiveModel] = useState<ModuleConfigActiveModel | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  const readiness = useMemo(
    () => [
      {
        label: "Truck Detector",
        ready: config.modelPath.trim().length > 0 && config.truckLabels.trim().length > 0,
        detail: `${config.modelPath || "--"} • ${config.truckLabels || "--"}`,
      },
      {
        label: "Bed State Labels",
        ready: config.bedOpenLabels.trim().length > 0 && config.bedClosedLabels.trim().length > 0,
        detail: `${config.bedOpenLabels || "--"} • ${config.bedClosedLabels || "--"}`,
      },
      {
        label: "Movement Rule",
        ready: config.movementThreshold.trim().length > 0 && config.minimumMovingSeconds.trim().length > 0,
        detail: `Threshold ${config.movementThreshold || "--"} • minimum ${config.minimumMovingSeconds || "--"}s`,
      },
      {
        label: "Operational Policy",
        ready: config.alertCooldownSeconds.trim().length > 0,
        detail: `Cooldown ${config.alertCooldownSeconds || "--"}s`,
      },
    ],
    [config]
  );
  const readyCount = readiness.filter((item) => item.ready).length;

  useEffect(() => {
    let ignore = false;
    setIsSyncing(true);
    getModuleConfigEnvelope<DumpTruckBedOpenModuleConfig>("dump-truck-bed-open")
      .then((payload) => {
        if (ignore) return;
        const mergedConfig = {
          ...DEFAULT_DUMP_TRUCK_BED_OPEN_CONFIG,
          ...payload.config,
        };
        setConfig(mergedConfig);
        setActiveModel(payload.activeModel);
        writeDumpTruckBedOpenConfig(mergedConfig);
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

  const handleChange = (field: keyof DumpTruckBedOpenModuleConfig, value: string) => {
    setConfig((current) => ({ ...current, [field]: value }));
  };

  const useDeploymentGateModel = () => {
    if (!activeModel?.modelPath) {
      toast({
        title: "Belum ada model aktif",
        description: "Deployment Gate belum punya model aktif untuk modul Operations • Dump Truck Bed Open.",
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

  const saveConfig = async () => {
    setIsSyncing(true);
    try {
      const saved = await updateModuleConfig("dump-truck-bed-open", config);
      setConfig(saved);
      writeDumpTruckBedOpenConfig(saved);
      toast({
        title: "Konfigurasi disimpan",
        description: "Preset default Operations • Dump Truck Bed Open tersimpan di server.",
      });
    } catch (error) {
      writeDumpTruckBedOpenConfig(config);
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
    const defaults = resetDumpTruckBedOpenConfig();
    setConfig(defaults);
    setIsSyncing(true);
    try {
      const saved = await updateModuleConfig("dump-truck-bed-open", defaults);
      setConfig(saved);
      writeDumpTruckBedOpenConfig(saved);
      toast({
        title: "Konfigurasi direset",
        description: "Preset dump truck bed open dikembalikan ke nilai default server.",
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
        title="Operations • Dump Truck Bed Open Setup"
        subtitle="Workspace konfigurasi awal untuk mendeteksi dump truck yang bergerak dengan bak masih terbuka."
      />

      <div className="grid gap-6 xl:grid-cols-[1.05fr,0.95fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-xl">Detector Setup</CardTitle>
              <CardDescription>
                Phase 1 modul ini memakai detector truck dan state bak untuk menyiapkan rule kendaraan berjalan dengan bak terbuka.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2 md:col-span-2">
                  <label className="text-sm font-medium text-foreground">Model Path</label>
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
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">ROI ID</label>
                  <Input value={config.roiId} onChange={(event) => handleChange("roiId", event.target.value)} />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">ROI Config Path</label>
                  <Input value={config.roiConfigPath} onChange={(event) => handleChange("roiConfigPath", event.target.value)} />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Truck Labels</label>
                  <Input value={config.truckLabels} onChange={(event) => handleChange("truckLabels", event.target.value)} />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Bed Open Labels</label>
                  <Input value={config.bedOpenLabels} onChange={(event) => handleChange("bedOpenLabels", event.target.value)} />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Bed Closed Labels</label>
                  <Input value={config.bedClosedLabels} onChange={(event) => handleChange("bedClosedLabels", event.target.value)} />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Movement Threshold</label>
                  <Input value={config.movementThreshold} onChange={(event) => handleChange("movementThreshold", event.target.value)} />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Minimum Moving (seconds)</label>
                  <Input value={config.minimumMovingSeconds} onChange={(event) => handleChange("minimumMovingSeconds", event.target.value)} />
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
                Rule ini dipakai untuk menilai kapan truck dianggap bergerak dan apakah bak yang masih terbuka layak dikirim sebagai alert operations.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Alert Cooldown (seconds)</label>
                <Input value={config.alertCooldownSeconds} onChange={(event) => handleChange("alertCooldownSeconds", event.target.value)} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Operational Notes</label>
                <Textarea
                  className="min-h-[140px]"
                  value={config.operationalNotes}
                  onChange={(event) => handleChange("operationalNotes", event.target.value)}
                />
              </div>
              <div className="flex flex-wrap gap-3">
                <Button onClick={saveConfig} disabled={isSyncing}>
                  <Save className="mr-2 h-4 w-4" />
                  Simpan Konfigurasi
                </Button>
                <Button variant="outline" onClick={resetConfig} disabled={isSyncing}>
                  <RotateCcw className="mr-2 h-4 w-4" />
                  Reset Default
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-xl">Readiness &amp; Peran Modul</CardTitle>
              <CardDescription>
                Modul operations ini disiapkan untuk safety kendaraan tambang sebelum engine run detail diaktifkan penuh di halaman analisis.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-medium text-foreground">Kesiapan Modul Dump Truck</p>
                    <p className="text-sm text-muted-foreground">
                      {readyCount} dari {readiness.length} komponen inti sudah terisi.
                    </p>
                  </div>
                  <Badge variant={readyCount === readiness.length ? "default" : "secondary"}>
                    {readyCount === readiness.length ? "Ready" : "Needs Review"}
                  </Badge>
                </div>
              </div>

              {readiness.map((item) => (
                <div key={item.label} className="rounded-lg border border-border/60 bg-secondary/10 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-medium text-foreground">{item.label}</p>
                      <p className="text-sm text-muted-foreground">{item.detail}</p>
                    </div>
                    <Badge variant={item.ready ? "default" : "secondary"}>{item.ready ? "Ready" : "Missing"}</Badge>
                  </div>
                </div>
              ))}

              <div className="rounded-lg border border-border/60 bg-secondary/10 p-4 text-sm text-muted-foreground">
                <div className="flex items-start gap-3">
                  <Truck className="mt-0.5 h-4 w-4 text-primary" />
                  <p>
                    Menu <code>Analysis Modules</code> dipakai untuk setup baseline detector dump truck, state bak, dan rule gerak. Proses run aktual akan mengikuti sprint engine Operations berikutnya.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
