import { useMemo, useState } from "react";
import { AlertTriangle, RotateCcw, Save, ShieldCheck } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
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
  type SafetyRulesModuleConfig,
  readSafetyRulesConfig,
  resetSafetyRulesConfig,
  writeSafetyRulesConfig,
} from "@/lib/safetyRulesConfig";

export default function SafetyRulesSetup() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const { data: mediaItems = [] } = useMediaRegistry();
  const [config, setConfig] = useState<SafetyRulesModuleConfig>(() => readSafetyRulesConfig());

  const selectedSourceId = searchParams.get("sourceId");
  const selectedSource = mediaItems.find((item) => item.id === selectedSourceId) || null;
  const isCameraSource = selectedSource?.type === "camera";
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
      {
        label: "Konteks Source",
        ready: Boolean(selectedSource),
        detail: selectedSource
          ? `${selectedSource.name} • ${selectedSource.executionMode === "manual" ? "Manual" : selectedSource.executionMode}`
          : "Buka dari Media Sources untuk mengikat rule ke source tertentu.",
      },
    ],
    [config.modelPath, config.requiredPpe, config.restrictedZones, selectedSource]
  );
  const readyCount = readiness.filter((item) => item.ready).length;

  const handleChange = (field: keyof SafetyRulesModuleConfig, value: string) => {
    setConfig((current) => ({ ...current, [field]: value }));
  };

  const saveConfig = () => {
    writeSafetyRulesConfig(config);
    toast({
      title: "Konfigurasi disimpan",
      description: "Preset HSE • Safety Rules sudah aktif sebagai baseline operasional.",
    });
  };

  const resetConfig = () => {
    const defaults = resetSafetyRulesConfig();
    setConfig(defaults);
    toast({
      title: "Konfigurasi direset",
      description: "Preset safety rules dikembalikan ke nilai default.",
    });
  };

  return (
    <DashboardLayout>
      <Header
        title="HSE • Safety Rules Setup"
        subtitle="Workspace konfigurasi awal untuk aturan keselamatan umum, restricted zone, dan baseline compliance."
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
              <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Status Modul</p>
              <p className="text-sm text-muted-foreground">
                Workspace HSE sudah aktif untuk menyusun model, rule profile, restricted zone, dan baseline alert.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[1.05fr,0.95fr]">
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Rule Profile</CardTitle>
            <CardDescription>
              Simpan parameter dasar HSE agar source yang masuk kategori `HSE` punya baseline konfigurasi yang konsisten.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2 md:col-span-2">
                <label className="text-sm font-medium text-foreground">Rule Profile Name</label>
                <Input value={config.ruleProfileName} onChange={(event) => handleChange("ruleProfileName", event.target.value)} />
              </div>
              <div className="space-y-2 md:col-span-2">
                <label className="text-sm font-medium text-foreground">Model Path</label>
                <Input value={config.modelPath} onChange={(event) => handleChange("modelPath", event.target.value)} />
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
                  Rule profile membantu menyamakan restricted zone, kebutuhan PPE, detector labels, dan cooldown alert antar source yang diawasi dalam kategori HSE.
                </p>
              </div>
              <div className="flex items-start gap-3 rounded-lg border border-border/70 bg-secondary/10 p-4">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                <p>
                  Modul ini sekarang punya model path dan parameter deteksi, sehingga tim bisa menyiapkan baseline inferensi HSE sebelum rule detail seperti trespass atau unsafe behavior dipecah menjadi engine terpisah.
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                {selectedSource ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() =>
                      navigate(
                        isCameraSource
                          ? `/live-monitoring?sourceId=${encodeURIComponent(selectedSource.id)}`
                          : `/analysis-setup?sourceId=${encodeURIComponent(selectedSource.id)}`
                      )
                    }
                  >
                    {isCameraSource ? "Buka Live Monitoring" : "Kembali ke Analysis Setup"}
                  </Button>
                ) : null}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
