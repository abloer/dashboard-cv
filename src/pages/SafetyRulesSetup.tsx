import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, RotateCcw, Save, ShieldCheck } from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Header } from "@/components/layout/Header";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  type SafetyRulesModuleConfig,
  readSafetyRulesConfig,
  resetSafetyRulesConfig,
  writeSafetyRulesConfig,
} from "@/lib/safetyRulesConfig";
import {
  getModuleConfigEnvelope,
  updateModuleConfig,
  type ModuleConfigActiveModel,
} from "@/lib/moduleConfigs";

export default function SafetyRulesSetup() {
  const { toast } = useToast();
  const [config, setConfig] = useState<SafetyRulesModuleConfig>(() => readSafetyRulesConfig());
  const [activeModel, setActiveModel] = useState<ModuleConfigActiveModel | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  const readiness = useMemo(
    () => [
      {
        label: "Model HSE",
        ready: config.modelPath.trim().length > 0,
        detail: config.modelPath.trim() || "Model path belum diisi.",
      },
      {
        label: "Restricted Zones",
        ready: config.restrictedZones.trim().length > 0,
        detail: config.restrictedZones.trim() || "Belum ada zona terbatas.",
      },
      {
        label: "Required PPE",
        ready: config.requiredPpe.trim().length > 0,
        detail: config.requiredPpe.trim() || "Checklist PPE belum diisi.",
      },
    ],
    [config.modelPath, config.requiredPpe, config.restrictedZones]
  );
  const readyCount = readiness.filter((item) => item.ready).length;

  useEffect(() => {
    let ignore = false;
    setIsSyncing(true);
    getModuleConfigEnvelope<SafetyRulesModuleConfig>("safety-rules")
      .then((payload) => {
        if (ignore) return;
        setConfig(payload.config);
        setActiveModel(payload.activeModel);
        writeSafetyRulesConfig(payload.config);
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

  const handleChange = (field: keyof SafetyRulesModuleConfig, value: string) => {
    setConfig((current) => ({ ...current, [field]: value }));
  };

  const saveConfig = async () => {
    setIsSyncing(true);
    try {
      const saved = await updateModuleConfig("safety-rules", config);
      setConfig(saved);
      writeSafetyRulesConfig(saved);
      toast({
        title: "Konfigurasi disimpan",
        description: "Preset HSE • Safety Rules tersimpan di server dan aktif sebagai baseline operasional.",
      });
    } catch (error) {
      writeSafetyRulesConfig(config);
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
    const defaults = resetSafetyRulesConfig();
    setConfig(defaults);
    setIsSyncing(true);
    try {
      const saved = await updateModuleConfig("safety-rules", defaults);
      setConfig(saved);
      writeSafetyRulesConfig(saved);
      toast({
        title: "Konfigurasi direset",
        description: "Preset safety rules dikembalikan ke nilai default server.",
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
        title="HSE • Safety Rules Setup"
        subtitle="Workspace konfigurasi awal untuk aturan keselamatan umum, restricted zone, dan baseline compliance."
      />

      <div className="grid gap-6 xl:grid-cols-[1.05fr,0.95fr]">
        <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Detector Setup</CardTitle>
            <CardDescription>
              Preset detector ini menjadi baseline saat assessment atau run HSE dijalankan dari{" "}
              <code>Media Sources &gt; Run Analysis</code>.
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
                <p className="text-xs text-muted-foreground">
                  Gunakan model yang bisa mendeteksi person, PPE, atau object pelanggaran yang relevan untuk aturan HSE.
                </p>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Detector Labels</label>
                <Input value={config.detectorLabels} onChange={(event) => handleChange("detectorLabels", event.target.value)} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Violation Labels</label>
                <Input value={config.violationLabels} onChange={(event) => handleChange("violationLabels", event.target.value)} />
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
              Baseline policy ini menyusun aturan keselamatan yang akan dipakai lintas source HSE sebagai rule profile default.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2 md:col-span-2">
                <label className="text-sm font-medium text-foreground">Rule Profile Name</label>
                <Input value={config.ruleProfileName} onChange={(event) => handleChange("ruleProfileName", event.target.value)} />
              </div>
              <div className="space-y-2 md:col-span-2">
                <label className="text-sm font-medium text-foreground">Restricted Zones</label>
                <Textarea value={config.restrictedZones} onChange={(event) => handleChange("restrictedZones", event.target.value)} className="min-h-[100px]" />
              </div>
              <div className="space-y-2 md:col-span-2">
                <label className="text-sm font-medium text-foreground">Required PPE</label>
                <Input value={config.requiredPpe} onChange={(event) => handleChange("requiredPpe", event.target.value)} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Max People In Zone</label>
                <Input value={config.maxPeopleInZone} onChange={(event) => handleChange("maxPeopleInZone", event.target.value)} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Alert Cooldown (s)</label>
                <Input value={config.alertCooldownSeconds} onChange={(event) => handleChange("alertCooldownSeconds", event.target.value)} />
              </div>
              <div className="space-y-2 md:col-span-2">
                <label className="text-sm font-medium text-foreground">Supervisor Escalation Note</label>
                <Textarea value={config.supervisorEscalationNote} onChange={(event) => handleChange("supervisorEscalationNote", event.target.value)} className="min-h-[100px]" />
              </div>
              <div className="space-y-2 md:col-span-2">
                <label className="text-sm font-medium text-foreground">Incident Narrative Template</label>
                <Textarea value={config.incidentNarrativeTemplate} onChange={(event) => handleChange("incidentNarrativeTemplate", event.target.value)} className="min-h-[110px]" />
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
                Modul HSE sekarang dipakai untuk menyimpan struktur aturan keselamatan sekaligus baseline model yang dipakai untuk evaluasi event otomatis.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-sm text-muted-foreground">
              <div className="rounded-lg border border-cyan-500/20 bg-cyan-500/5 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">Kesiapan Modul HSE</p>
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
                <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                <p>
                  Rule profile membantu menyamakan restricted zone, kebutuhan PPE, detector labels, dan cooldown alert sebagai default module HSE untuk semua source yang memakai kategori ini.
                </p>
              </div>
              <div className="flex items-start gap-3 rounded-lg border border-border/70 bg-secondary/10 p-4">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                <p>
                  Menu `Analysis Modules` dipakai khusus untuk setup default module. Proses assessment atau run aktual tetap dibuka dari action `Run Analysis` pada masing-masing row di `Media Sources`.
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
                <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Rule Profile</p>
                <p className="mt-1 text-sm text-foreground">{config.ruleProfileName}</p>
              </div>
              <div className="rounded-lg border border-border/70 bg-secondary/10 p-4">
                <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Detector Baseline</p>
                <p className="mt-1 break-all text-sm text-foreground">{config.modelPath}</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  Labels: {config.detectorLabels} | Violations: {config.violationLabels}
                </p>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-lg border border-border/70 bg-secondary/10 p-4">
                  <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Threshold</p>
                  <p className="mt-1 text-sm text-foreground">
                    Conf {config.confidenceThreshold} • IoU {config.iouThreshold}
                  </p>
                </div>
                <div className="rounded-lg border border-border/70 bg-secondary/10 p-4">
                  <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Sampling</p>
                  <p className="mt-1 text-sm text-foreground">
                    Step {config.frameStep} • Size {config.imageSize}
                  </p>
                </div>
              </div>
              <div className="rounded-lg border border-border/70 bg-secondary/10 p-4">
                <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Policy Baseline</p>
                <p className="mt-1 text-sm text-foreground">
                  Zones: {config.restrictedZones}
                </p>
                <p className="mt-2 text-sm text-foreground">
                  PPE: {config.requiredPpe} | Max People: {config.maxPeopleInZone} | Cooldown: {config.alertCooldownSeconds}s
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
  const useDeploymentGateModel = () => {
    if (!activeModel?.modelPath) {
      toast({
        title: "Belum ada model aktif",
        description: "Deployment Gate belum punya model aktif untuk modul HSE • Safety Rules.",
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
