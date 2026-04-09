import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, MoveVertical, RotateCcw, Save, ShieldCheck } from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Header } from "@/components/layout/Header";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  DEFAULT_WORKING_AT_HEIGHT_CONFIG,
  type WorkingAtHeightModuleConfig,
  readWorkingAtHeightConfig,
  resetWorkingAtHeightConfig,
  writeWorkingAtHeightConfig,
} from "@/lib/workingAtHeightConfig";
import {
  getModuleConfigEnvelope,
  updateModuleConfig,
  type ModuleConfigActiveModel,
} from "@/lib/moduleConfigs";

export default function WorkingAtHeightSetup() {
  const { toast } = useToast();
  const [config, setConfig] = useState<WorkingAtHeightModuleConfig>(() => readWorkingAtHeightConfig());
  const [activeModel, setActiveModel] = useState<ModuleConfigActiveModel | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  const readiness = useMemo(
    () => [
      {
        label: "Person Detector",
        ready: config.modelPath.trim().length > 0 && config.personLabels.trim().length > 0,
        detail: `${config.modelPath || "--"} • ${config.personLabels || "--"}`,
      },
      {
        label: "Working at Height Zone",
        ready: config.zoneId.trim().length > 0,
        detail: config.zoneId || "Belum ada zone ID default.",
      },
      {
        label: "Presence Rule",
        ready: config.minimumPresenceSeconds.trim().length > 0,
        detail: `Minimum presence ${config.minimumPresenceSeconds || "--"} detik`,
      },
      {
        label: "Height PPE Policy",
        ready: config.requiredPpeAtHeight.trim().length > 0 && config.alertCooldownSeconds.trim().length > 0,
        detail: `${config.requiredPpeAtHeight || "--"} • Cooldown ${config.alertCooldownSeconds || "--"}s`,
      },
    ],
    [config]
  );
  const readyCount = readiness.filter((item) => item.ready).length;

  useEffect(() => {
    let ignore = false;
    setIsSyncing(true);
    getModuleConfigEnvelope<WorkingAtHeightModuleConfig>("working-at-height")
      .then((payload) => {
        if (ignore) return;
        const mergedConfig = {
          ...DEFAULT_WORKING_AT_HEIGHT_CONFIG,
          ...payload.config,
        };
        setConfig(mergedConfig);
        setActiveModel(payload.activeModel);
        writeWorkingAtHeightConfig(mergedConfig);
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

  const handleChange = (field: keyof WorkingAtHeightModuleConfig, value: string) => {
    setConfig((current) => ({ ...current, [field]: value }));
  };

  const useDeploymentGateModel = () => {
    if (!activeModel?.modelPath) {
      toast({
        title: "Belum ada model aktif",
        description: "Deployment Gate belum punya model aktif untuk modul HSE • Working at Height.",
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
      const saved = await updateModuleConfig("working-at-height", config);
      setConfig(saved);
      writeWorkingAtHeightConfig(saved);
      toast({
        title: "Konfigurasi disimpan",
        description: "Preset HSE • Working at Height tersimpan di server dan siap dipakai untuk assessment zone-based.",
      });
    } catch (error) {
      writeWorkingAtHeightConfig(config);
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
    const defaults = resetWorkingAtHeightConfig();
    setConfig(defaults);
    setIsSyncing(true);
    try {
      const saved = await updateModuleConfig("working-at-height", defaults);
      setConfig(saved);
      writeWorkingAtHeightConfig(saved);
      toast({
        title: "Konfigurasi direset",
        description: "Preset working at height dikembalikan ke nilai default server.",
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
        title="HSE • Working at Height Setup"
        subtitle="Workspace konfigurasi awal untuk assessment pekerjaan di area ketinggian berbasis zone dan durasi keberadaan person."
      />

      <div className="grid gap-6 xl:grid-cols-[1.05fr,0.95fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-xl">Detector Setup</CardTitle>
              <CardDescription>
                Fase awal modul ini memakai detector person dan zone area ketinggian untuk menyusun finding <code>working at height</code>.
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
                  <label className="text-sm font-medium text-foreground">Person Labels</label>
                  <Input value={config.personLabels} onChange={(event) => handleChange("personLabels", event.target.value)} />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Zone ID</label>
                  <Input value={config.zoneId} onChange={(event) => handleChange("zoneId", event.target.value)} />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Zone Config Path</label>
                  <Input value={config.zoneConfigPath} onChange={(event) => handleChange("zoneConfigPath", event.target.value)} />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Minimum Presence (seconds)</label>
                  <Input value={config.minimumPresenceSeconds} onChange={(event) => handleChange("minimumPresenceSeconds", event.target.value)} />
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
                Rules ini dipakai untuk menentukan kapan keberadaan person pada area elevasi dianggap finding yang perlu diteruskan ke supervisor.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Required PPE at Height</label>
                <Input value={config.requiredPpeAtHeight} onChange={(event) => handleChange("requiredPpeAtHeight", event.target.value)} />
              </div>
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
                  <Save className="mr-2 h-4 w-4" /> Simpan Konfigurasi
                </Button>
                <Button variant="outline" onClick={resetConfig} disabled={isSyncing}>
                  <RotateCcw className="mr-2 h-4 w-4" /> Reset Default
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
                Modul ini dipakai untuk memantau person yang bekerja di platform, scaffold, atau area elevasi lain berdasarkan zone yang dikonfigurasi.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg border border-cyan-500/20 bg-cyan-500/5 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">Kesiapan Modul Working at Height</p>
                    <p className="text-xs text-muted-foreground">{readyCount} dari {readiness.length} komponen inti sudah terisi.</p>
                  </div>
                  <Badge variant={readyCount === readiness.length ? "default" : "secondary"}>
                    {readyCount === readiness.length ? "Ready" : "Needs Review"}
                  </Badge>
                </div>
                <div className="mt-4 space-y-3">
                  {readiness.map((item) => (
                    <div key={item.label} className="rounded-lg border border-border/70 bg-background/60 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium text-foreground">{item.label}</p>
                          <p className="text-xs text-muted-foreground">{item.detail}</p>
                        </div>
                        <Badge variant={item.ready ? "default" : "secondary"}>
                          {item.ready ? "Ready" : "Missing"}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded-lg border border-border/70 bg-background/50 p-4 text-sm text-muted-foreground">
                <div className="flex items-start gap-3">
                  <MoveVertical className="mt-0.5 h-5 w-5 text-primary" />
                  <p>
                    Fase awal <code>Working at Height</code> diposisikan sebagai zone-based assessment. Operator menyiapkan zone ketinggian dan threshold durasi, lalu hasil run akan dipakai HSE untuk audit aktivitas di area elevasi.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-xl">Preset Aktif Saat Ini</CardTitle>
              <CardDescription>Ringkasan singkat konfigurasi default yang akan diturunkan ke assessment working at height.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-lg border border-border/70 bg-background/50 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Model</p>
                <p className="mt-2 text-sm font-medium break-all text-foreground">{config.modelPath}</p>
              </div>
              <div className="rounded-lg border border-border/70 bg-background/50 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Zone</p>
                <p className="mt-2 text-sm font-medium text-foreground">{config.zoneId}</p>
              </div>
              <div className="rounded-lg border border-border/70 bg-background/50 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Presence Rule</p>
                <p className="mt-2 text-sm font-medium text-foreground">{config.minimumPresenceSeconds} detik minimum</p>
              </div>
              <div className="rounded-lg border border-border/70 bg-background/50 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Policy</p>
                <p className="mt-2 text-sm font-medium text-foreground">{config.requiredPpeAtHeight}</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
