import { useEffect, useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Header } from "@/components/layout/Header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Bot, Loader2, Monitor, Shield, Sparkles } from "lucide-react";
import {
  getAiAssistConfig,
  getAiAssistLocalStatus,
  updateAiAssistConfig,
  type AiAssistConfig,
  type AiAssistLocalStatus,
} from "@/lib/aiAssist";

const defaultAiAssistConfig: AiAssistConfig = {
  enabled: false,
  mode: "local",
  baseUrl: "http://127.0.0.1:11434/v1",
  apiKey: "",
  gemmaModel: "gemma-4",
  requestTimeoutMs: 30000,
  localOllamaBaseUrl: "http://127.0.0.1:11434",
  localGemmaModel: "gemma4:e2b",
};

const defaultAiAssistStatus: AiAssistLocalStatus = {
  mode: "local",
  ollamaReachable: false,
  ollamaError: "",
  localGemmaModel: "gemma4:e2b",
  localGemmaInstalled: false,
  localVisionRuntime: "Gemma 4 via Ollama",
  installedModels: [],
};

const Settings = () => {
  const { toast } = useToast();
  const [aiAssistConfig, setAiAssistConfig] = useState<AiAssistConfig>(defaultAiAssistConfig);
  const [aiAssistStatus, setAiAssistStatus] = useState<AiAssistLocalStatus>(defaultAiAssistStatus);
  const [isLoadingAiAssist, setIsLoadingAiAssist] = useState(true);
  const [isLoadingAiAssistStatus, setIsLoadingAiAssistStatus] = useState(true);
  const [isSavingAiAssist, setIsSavingAiAssist] = useState(false);

  useEffect(() => {
    let mounted = true;
    const loadConfig = async () => {
      setIsLoadingAiAssist(true);
      try {
        const [configResponse, statusResponse] = await Promise.all([
          getAiAssistConfig(),
          getAiAssistLocalStatus().catch(() => ({ ok: true as const, status: defaultAiAssistStatus })),
        ]);
        if (!mounted) return;
        setAiAssistConfig(configResponse.config);
        setAiAssistStatus(statusResponse.status);
      } catch (error) {
        if (!mounted) return;
        toast({
          title: "AI Assist belum termuat",
          description: error instanceof Error ? error.message : "Request failed.",
          variant: "destructive",
        });
      } finally {
        if (mounted) {
          setIsLoadingAiAssist(false);
          setIsLoadingAiAssistStatus(false);
        }
      }
    };

    void loadConfig();
    return () => {
      mounted = false;
    };
  }, [toast]);

  const handleSaveAiAssist = async () => {
    setIsSavingAiAssist(true);
    try {
      const response = await updateAiAssistConfig(aiAssistConfig);
      const statusResponse = await getAiAssistLocalStatus().catch(() => ({ ok: true as const, status: defaultAiAssistStatus }));
      setAiAssistConfig(response.config);
      setAiAssistStatus(statusResponse.status);
      toast({
        title: "AI Assist tersimpan",
        description: "Konfigurasi Gemma 4 sudah diperbarui.",
      });
    } catch (error) {
      toast({
        title: "Gagal menyimpan AI Assist",
        description: error instanceof Error ? error.message : "Request failed.",
        variant: "destructive",
      });
    } finally {
      setIsSavingAiAssist(false);
    }
  };

  return (
    <DashboardLayout>
      <Header title="Settings" subtitle="Konfigurasi sistem, provider AI assist, dan preferensi operasional." />

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <Card className="p-6 bg-card border-border xl:col-span-2 animate-fade-in">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center">
              <Bot className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground">AI Assist</h3>
              <p className="text-sm text-muted-foreground">
                Konfigurasi runtime lokal dan provider remote untuk Gemma 4.
              </p>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-secondary/20 p-4 mb-6 space-y-2 text-sm text-muted-foreground">
            <p className="font-medium text-foreground">Cara pakai cepat</p>
            <p>
              Aktifkan AI Assist jika Anda ingin menambahkan verifikasi visual untuk <span className="text-foreground">Needs Review</span>, narasi HSE otomatis, dan ringkasan incident operator dari hasil sesi analisis.
            </p>
            <p>
              Sistem ini memakai <span className="text-foreground">Gemma 4</span> untuk verifier visual <span className="text-foreground">Needs Review</span>, narasi HSE, dan ringkasan incident operator secara lokal/offline.
            </p>
            <p>
              Catatan: jalur AI assist sekarang disederhanakan agar stabil di laptop ini dengan fokus pada runtime <span className="text-foreground">Gemma 4 via Ollama</span>.
            </p>
          </div>

          <div className="rounded-lg border border-border bg-secondary/10 p-4 mb-6 space-y-3 text-sm">
            <p className="font-medium text-foreground">Status runtime lokal</p>
            {isLoadingAiAssistStatus ? (
              <p className="text-muted-foreground">Memeriksa Ollama dan folder model lokal...</p>
            ) : (
              <div className="space-y-2 text-muted-foreground">
                <p>
                  Ollama:{" "}
                  <span className={aiAssistStatus.ollamaReachable ? "text-foreground" : "text-destructive"}>
                    {aiAssistStatus.ollamaReachable ? "siap" : `belum siap${aiAssistStatus.ollamaError ? ` (${aiAssistStatus.ollamaError})` : ""}`}
                  </span>
                </p>
                <p>
                  Gemma lokal (`{aiAssistStatus.localGemmaModel}`):{" "}
                  <span className={aiAssistStatus.localGemmaInstalled ? "text-foreground" : "text-warning"}>
                    {aiAssistStatus.localGemmaInstalled ? "sudah terpasang" : "belum terpasang / masih proses download"}
                  </span>
                </p>
                <p>
                  Runtime vision lokal:{" "}
                  <span className="text-foreground">
                    {aiAssistStatus.localVisionRuntime}
                  </span>
                </p>
              </div>
            )}
          </div>

          {isLoadingAiAssist ? (
            <div className="rounded-lg border border-dashed border-border p-8 text-sm text-muted-foreground flex items-center gap-3">
              <Loader2 className="w-4 h-4 animate-spin" />
              Memuat konfigurasi AI Assist...
            </div>
          ) : (
            <div className="space-y-5">
              <div className="flex items-center justify-between rounded-lg border border-border bg-secondary/10 p-4">
                <div>
                  <p className="text-sm font-medium text-foreground">Aktifkan AI Assist</p>
                  <p className="text-xs text-muted-foreground">
                    Jika nonaktif, tombol verifikasi AI dan generator narasi akan tetap terlihat tetapi request akan ditolak backend.
                  </p>
                </div>
                <Switch
                  checked={aiAssistConfig.enabled}
                  onCheckedChange={(checked) =>
                    setAiAssistConfig((current) => ({ ...current, enabled: checked }))
                  }
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Mode AI Assist</label>
                  <Select
                    value={aiAssistConfig.mode}
                    onValueChange={(value: "remote-openai" | "local") =>
                      setAiAssistConfig((current) => ({ ...current, mode: value }))
                    }
                  >
                    <SelectTrigger className="bg-secondary border-border">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="local">Local Offline</SelectItem>
                      <SelectItem value="remote-openai">Remote OpenAI-Compatible</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Mode lokal memakai Ollama untuk Gemma 4. Semua fitur AI assist visual dan naratif dijalankan lewat Gemma 4 di mesin lokal.
                  </p>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Base URL Provider</label>
                  <Input
                    value={aiAssistConfig.baseUrl}
                    onChange={(event) =>
                      setAiAssistConfig((current) => ({ ...current, baseUrl: event.target.value }))
                    }
                    placeholder="http://127.0.0.1:11434/v1"
                    className="bg-secondary border-border"
                  />
                  <p className="text-xs text-muted-foreground">
                    URL endpoint OpenAI-compatible. Contoh: server lokal inference atau gateway internal.
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">API Key</label>
                <Input
                  type="password"
                  value={aiAssistConfig.apiKey}
                  onChange={(event) =>
                    setAiAssistConfig((current) => ({ ...current, apiKey: event.target.value }))
                  }
                  placeholder="Kosongkan jika provider lokal tidak butuh token"
                  className="bg-secondary border-border"
                />
                <p className="text-xs text-muted-foreground">
                  Dipakai hanya jika provider Anda memerlukan header <code>Authorization: Bearer</code>.
                </p>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Request Timeout (ms)</label>
                  <Input
                    type="number"
                    value={aiAssistConfig.requestTimeoutMs}
                    onChange={(event) =>
                      setAiAssistConfig((current) => ({
                        ...current,
                        requestTimeoutMs: Number(event.target.value || 30000),
                      }))
                    }
                    className="bg-secondary border-border"
                  />
                  <p className="text-xs text-muted-foreground">
                    Batas waktu request sebelum verifier atau generator narasi dianggap gagal.
                  </p>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Model Gemma 4</label>
                  <Input
                    value={aiAssistConfig.gemmaModel}
                    onChange={(event) =>
                      setAiAssistConfig((current) => ({ ...current, gemmaModel: event.target.value }))
                    }
                    placeholder="gemma-4"
                    className="bg-secondary border-border"
                  />
                  <p className="text-xs text-muted-foreground">
                    Dipakai untuk <span className="text-foreground">HSE narrative assistant</span>,
                    <span className="text-foreground"> operator incident summarizer</span>, serta verifier visual Needs Review.
                  </p>
                </div>
              </div>

              {aiAssistConfig.mode === "local" ? (
                <div className="space-y-5 rounded-lg border border-border bg-secondary/10 p-4">
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-foreground">Local Runtime</p>
                    <p className="text-xs text-muted-foreground">
                      Jalur lokal dipakai untuk menjalankan <span className="text-foreground">Gemma 4 via Ollama</span> tanpa cloud untuk verifier visual, narasi HSE, dan ringkasan incident operator.
                    </p>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-foreground">Ollama Base URL</label>
                      <Input
                        value={aiAssistConfig.localOllamaBaseUrl}
                        onChange={(event) =>
                          setAiAssistConfig((current) => ({
                            ...current,
                            localOllamaBaseUrl: event.target.value,
                          }))
                        }
                        className="bg-secondary border-border"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-foreground">Model Gemma Lokal</label>
                      <Input
                        value={aiAssistConfig.localGemmaModel}
                        onChange={(event) =>
                          setAiAssistConfig((current) => ({
                            ...current,
                            localGemmaModel: event.target.value,
                          }))
                        }
                        className="bg-secondary border-border"
                      />
                      <p className="text-xs text-muted-foreground">
                        Nama model Gemma lokal di Ollama. Rekomendasi awal untuk laptop ini: <code>gemma4:e2b</code>.
                      </p>
                    </div>
                  </div>

                  <div className="rounded-lg border border-border bg-secondary/10 p-4 text-xs text-muted-foreground">
                    Runtime vision lokal memakai <span className="text-foreground">Gemma 4 via Ollama</span>. Tidak ada model vision kedua yang perlu dikelola dari halaman ini.
                  </div>
                </div>
              ) : null}

              <div className="flex justify-end">
                <Button
                  onClick={handleSaveAiAssist}
                  disabled={isSavingAiAssist}
                  className="gap-2 bg-primary hover:bg-primary/90 text-primary-foreground"
                >
                  {isSavingAiAssist ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  Simpan AI Assist
                </Button>
              </div>
            </div>
          )}
        </Card>

        <div className="space-y-6">
          <Card className="p-6 bg-card border-border animate-fade-in">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-lg bg-accent/20 flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-accent" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground">Fitur AI Assist</h3>
                <p className="text-sm text-muted-foreground">Tiga integrasi yang aktif di workspace analisis.</p>
              </div>
            </div>
            <div className="space-y-3 text-sm text-muted-foreground">
              <div className="rounded-lg border border-border bg-secondary/10 p-3">
                <p className="font-medium text-foreground">Needs Review Verifier</p>
                <p>Meminta second opinion visual untuk finding ambigu sebelum operator menindaklanjuti.</p>
              </div>
              <div className="rounded-lg border border-border bg-secondary/10 p-3">
                <p className="font-medium text-foreground">HSE Narrative Assistant</p>
                <p>Menyusun narasi ringkas supervisor dari evidence PPE/HSE pada sesi aktif.</p>
              </div>
              <div className="rounded-lg border border-border bg-secondary/10 p-3">
                <p className="font-medium text-foreground">Operator Incident Summarizer</p>
                <p>Merangkum incident dan daftar aksi singkat untuk operator lapangan.</p>
              </div>
            </div>
          </Card>

          <Card className="p-6 bg-card border-border animate-fade-in">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-lg bg-success/20 flex items-center justify-center">
                <Shield className="w-5 h-5 text-success" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground">Catatan Implementasi</h3>
                <p className="text-sm text-muted-foreground">Hal yang perlu diingat saat melakukan evaluasi.</p>
              </div>
            </div>
            <div className="space-y-3 text-sm text-muted-foreground">
              <p>AI assist tidak menggantikan detector utama. Verifier dan summarizer hanya lapisan pendukung keputusan.</p>
              <p>Snapshot verifikasi diambil dari hasil sesi aktif pada halaman <code>Run Analysis</code>.</p>
              <p>Jika provider mati atau timeout, hasil analisis utama tetap berjalan tanpa AI assist.</p>
              <p>Untuk mode lokal, seluruh AI assist sekarang difokuskan ke Gemma 4 di Ollama agar lebih ringan dan stabil.</p>
            </div>
          </Card>

          <Card className="p-6 bg-card border-border animate-fade-in">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-lg bg-warning/20 flex items-center justify-center">
                <Monitor className="w-5 h-5 text-warning" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground">Status Halaman</h3>
                <p className="text-sm text-muted-foreground">Ringkasan sederhana untuk admin lokal.</p>
              </div>
            </div>
            <Textarea
              readOnly
              value={`AI Assist ${aiAssistConfig.enabled ? "aktif" : "nonaktif"}\nGemma: ${aiAssistConfig.gemmaModel}\nLocal runtime: ${aiAssistConfig.localGemmaModel}\nBase URL: ${aiAssistConfig.baseUrl}`}
              className="min-h-[140px] bg-secondary/30"
            />
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default Settings;
