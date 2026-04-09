import { useEffect, useMemo, useState } from "react";
import { RotateCcw, Save, ShieldAlert, TrafficCone } from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Header } from "@/components/layout/Header";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  DEFAULT_RED_LIGHT_VIOLATION_CONFIG,
  readRedLightViolationConfig,
  resetRedLightViolationConfig,
  type RedLightViolationModuleConfig,
  writeRedLightViolationConfig,
} from "@/lib/redLightViolationConfig";
import {
  getModuleConfigEnvelope,
  updateModuleConfig,
  type ModuleConfigActiveModel,
} from "@/lib/moduleConfigs";

export default function RedLightViolationSetup() {
  const { toast } = useToast();
  const [config, setConfig] = useState<RedLightViolationModuleConfig>(() => readRedLightViolationConfig());
  const [activeModel, setActiveModel] = useState<ModuleConfigActiveModel | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  const readiness = useMemo(
    () => [
      {
        label: "Vehicle Detector",
        ready: config.vehicleModelPath.trim().length > 0 && config.vehicleLabels.trim().length > 0,
        detail: `${config.vehicleModelPath || "--"} • ${config.vehicleLabels || "--"}`,
      },
      {
        label: "Traffic Light Detector",
        ready:
          config.trafficLightModelPath.trim().length > 0 &&
          config.redLightLabels.trim().length > 0 &&
          config.greenLightLabels.trim().length > 0,
        detail: `${config.redLightLabels || "--"} • ${config.greenLightLabels || "--"}`,
      },
      {
        label: "Intersection Rule",
        ready: config.intersectionId.trim().length > 0 && config.crossingWindowSeconds.trim().length > 0,
        detail: `${config.intersectionId || "--"} • crossing window ${config.crossingWindowSeconds || "--"}s`,
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
    getModuleConfigEnvelope<RedLightViolationModuleConfig>("red-light-violation")
      .then((payload) => {
        if (ignore) return;
        const mergedConfig = {
          ...DEFAULT_RED_LIGHT_VIOLATION_CONFIG,
          ...payload.config,
        };
        setConfig(mergedConfig);
        setActiveModel(payload.activeModel);
        writeRedLightViolationConfig(mergedConfig);
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

  const handleChange = (field: keyof RedLightViolationModuleConfig, value: string) => {
    setConfig((current) => ({ ...current, [field]: value }));
  };

  const useDeploymentGateModel = () => {
    if (!activeModel?.modelPath) {
      toast({
        title: "Belum ada model aktif",
        description: "Deployment Gate belum punya model aktif untuk modul Operations • Red Light Violation.",
        variant: "destructive",
      });
      return;
    }

    setConfig((current) => ({
      ...current,
      modelSource: "deployment-gate",
      vehicleModelPath: activeModel.modelPath,
      trafficLightModelPath: activeModel.modelPath,
    }));
    toast({
      title: "Model aktif dipakai",
      description: `Konfigurasi sekarang mengikuti model aktif ${activeModel.name} dari Deployment Gate.`,
    });
  };

  const saveConfig = async () => {
    setIsSyncing(true);
    try {
      const saved = await updateModuleConfig("red-light-violation", config);
      setConfig(saved);
      writeRedLightViolationConfig(saved);
      toast({
        title: "Konfigurasi disimpan",
        description: "Preset default Operations • Red Light Violation tersimpan di server.",
      });
    } catch (error) {
      writeRedLightViolationConfig(config);
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
    const defaults = resetRedLightViolationConfig();
    setConfig(defaults);
    setIsSyncing(true);
    try {
      const saved = await updateModuleConfig("red-light-violation", defaults);
      setConfig(saved);
      writeRedLightViolationConfig(saved);
      toast({
        title: "Konfigurasi direset",
        description: "Preset red light violation dikembalikan ke nilai default server.",
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
        title="Operations • Red Light Violation Setup"
        subtitle="Workspace konfigurasi awal untuk mendeteksi kendaraan yang melintasi stop line saat lampu merah di persimpangan tambang."
      />

      <div className="grid gap-6 xl:grid-cols-[1.05fr,0.95fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-xl">Detector Setup</CardTitle>
              <CardDescription>
                Phase 1 modul ini memisahkan detector kendaraan dan status lampu agar nanti rule crossing dapat memverifikasi pelanggaran merah dengan lebih akurat.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2 md:col-span-2">
                  <label className="text-sm font-medium text-foreground">Vehicle Model Path</label>
                  <Input value={config.vehicleModelPath} onChange={(event) => handleChange("vehicleModelPath", event.target.value)} />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <label className="text-sm font-medium text-foreground">Traffic Light Model Path</label>
                  <Input value={config.trafficLightModelPath} onChange={(event) => handleChange("trafficLightModelPath", event.target.value)} />
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
                  <label className="text-sm font-medium text-foreground">Vehicle Labels</label>
                  <Input value={config.vehicleLabels} onChange={(event) => handleChange("vehicleLabels", event.target.value)} />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Intersection ID</label>
                  <Input value={config.intersectionId} onChange={(event) => handleChange("intersectionId", event.target.value)} />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Red Light Labels</label>
                  <Input value={config.redLightLabels} onChange={(event) => handleChange("redLightLabels", event.target.value)} />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Green Light Labels</label>
                  <Input value={config.greenLightLabels} onChange={(event) => handleChange("greenLightLabels", event.target.value)} />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Stop Line Config Path</label>
                  <Input value={config.stopLineConfigPath} onChange={(event) => handleChange("stopLineConfigPath", event.target.value)} />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Crossing Window (seconds)</label>
                  <Input value={config.crossingWindowSeconds} onChange={(event) => handleChange("crossingWindowSeconds", event.target.value)} />
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
                Rule ini dipakai untuk menilai apakah kendaraan benar-benar melintasi stop line saat lampu merah dan kapan alert baru boleh dikirim lagi.
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
                Modul operations ini disiapkan untuk mengamati keselamatan kendaraan di persimpangan tambang sebelum engine crossing diaktifkan penuh di halaman run.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-medium text-foreground">Kesiapan Modul Red Light</p>
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
                  <TrafficCone className="mt-0.5 h-4 w-4 text-primary" />
                  <p>
                    Menu <code>Analysis Modules</code> dipakai untuk setup baseline detector kendaraan, status lampu, intersection, dan stop line. Proses run aktual akan mengikuti sprint engine Operations berikutnya.
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
