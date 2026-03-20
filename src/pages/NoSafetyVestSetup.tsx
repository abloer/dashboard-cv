import { useState } from "react";
import { HardHat, RotateCcw, Save, ShieldAlert } from "lucide-react";
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
  type NoSafetyVestModuleConfig,
  readNoSafetyVestConfig,
  resetNoSafetyVestConfig,
  writeNoSafetyVestConfig,
} from "@/lib/noSafetyVestConfig";

export default function NoSafetyVestSetup() {
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const { data: mediaItems = [] } = useMediaRegistry();
  const [config, setConfig] = useState<NoSafetyVestModuleConfig>(() => readNoSafetyVestConfig());

  const selectedSourceId = searchParams.get("sourceId");
  const selectedSource = mediaItems.find((item) => item.id === selectedSourceId) || null;

  const handleChange = (field: keyof NoSafetyVestModuleConfig, value: string) => {
    setConfig((current) => ({ ...current, [field]: value }));
  };

  const saveConfig = () => {
    writeNoSafetyVestConfig(config);
    toast({
      title: "Konfigurasi disimpan",
      description: "Preset default PPE • No Safety Vest siap dipakai untuk modul inspeksi rompi keselamatan.",
    });
  };

  const resetConfig = () => {
    const defaults = resetNoSafetyVestConfig();
    setConfig(defaults);
    toast({
      title: "Konfigurasi direset",
      description: "Preset modul no safety vest dikembalikan ke nilai default.",
    });
  };

  return (
    <DashboardLayout>
      <Header
        title="PPE • No Safety Vest Setup"
        subtitle="Konfigurasi awal modul inspeksi pekerja tanpa rompi keselamatan untuk source yang dipilih."
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
                Setup aktif. Preset default bisa disimpan sekarang, sedangkan workflow eksekusi akan mengikuti source dari Media Sources.
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
              Preset baseline untuk inspeksi `No Safety Vest` sebelum dihubungkan ke engine deteksi spesifik.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2 md:col-span-2">
                <label className="text-sm font-medium text-foreground">Default Model Path</label>
                <Input value={config.modelPath} onChange={(event) => handleChange("modelPath", event.target.value)} />
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
              <div className="space-y-2 md:col-span-2">
                <label className="text-sm font-medium text-foreground">Operational Notes</label>
                <Textarea value={config.operationalNotes} onChange={(event) => handleChange("operationalNotes", event.target.value)} className="min-h-[110px]" />
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
              <CardTitle className="text-xl">Peran Modul</CardTitle>
              <CardDescription>
                Modul ini disiapkan agar PPE selain helm juga sudah punya workspace konfigurasi aktif.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-sm text-muted-foreground">
              <div className="flex items-start gap-3 rounded-lg border border-border/70 bg-secondary/10 p-4">
                <HardHat className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                <p>
                  Preset ini dipakai untuk area yang ingin mengawasi kepatuhan rompi keselamatan, khususnya pada jalur loading, workshop, dan area akses alat berat.
                </p>
              </div>
              <div className="flex items-start gap-3 rounded-lg border border-border/70 bg-secondary/10 p-4">
                <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                <p>
                  Engine deteksi final masih bisa berubah, tetapi operator sudah dapat menyusun default label, threshold, dan catatan operasional dari sekarang.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
