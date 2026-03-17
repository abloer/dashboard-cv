import { useMemo } from "react";
import { ArrowRight, Briefcase, HardHat, ShieldCheck, Users } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Header } from "@/components/layout/Header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useMediaRegistry } from "@/hooks/useMediaRegistry";
import { cn } from "@/lib/utils";

const CATEGORY_CARDS = [
  {
    key: "PPE",
    title: "PPE",
    description: "Kategori analisis untuk inspeksi kepatuhan alat pelindung diri.",
    icon: HardHat,
    modules: [
      {
        name: "No Helmet Setup",
        description: "Deteksi pekerja yang tidak menggunakan helm di area kerja.",
        href: "/no-helmet-setup",
        status: "active" as const,
      },
      {
        name: "No Safety Vest",
        description: "Placeholder untuk modul rompi keselamatan.",
        href: "",
        status: "planned" as const,
      },
    ],
  },
  {
    key: "HSE",
    title: "HSE",
    description: "Kategori analisis untuk keselamatan kerja dan compliance umum.",
    icon: ShieldCheck,
    modules: [
      {
        name: "Safety Rules",
        description: "Placeholder untuk aturan keselamatan umum.",
        href: "",
        status: "planned" as const,
      },
    ],
  },
  {
    key: "Operations",
    title: "Operations",
    description: "Kategori analisis untuk aktivitas area dan visibilitas personel.",
    icon: Users,
    modules: [
      {
        name: "People Count",
        description: "Placeholder untuk hitung jumlah orang.",
        href: "",
        status: "planned" as const,
      },
    ],
  },
  {
    key: "Fleet & KPI",
    title: "Fleet & KPI",
    description: "Kategori analisis untuk performa armada dan indikator operasional.",
    icon: Briefcase,
    modules: [
      {
        name: "Fleet KPI",
        description: "Placeholder untuk KPI alat dan armada.",
        href: "",
        status: "planned" as const,
      },
    ],
  },
] as const;

export default function AnalysisSetup() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { data: mediaItems = [] } = useMediaRegistry();

  const selectedSourceId = searchParams.get("sourceId");
  const selectedSource = useMemo(
    () => mediaItems.find((item) => item.id === selectedSourceId) || null,
    [mediaItems, selectedSourceId]
  );
  const selectedCategories = useMemo(
    () => new Set(selectedSource?.analytics || []),
    [selectedSource]
  );
  const orderedCategories = useMemo(() => {
    if (!selectedSource || selectedCategories.size === 0) {
      return CATEGORY_CARDS;
    }

    return [...CATEGORY_CARDS].sort((left, right) => {
      const leftPriority = selectedCategories.has(left.key) ? 0 : 1;
      const rightPriority = selectedCategories.has(right.key) ? 0 : 1;
      if (leftPriority !== rightPriority) {
        return leftPriority - rightPriority;
      }
      return left.title.localeCompare(right.title);
    });
  }, [selectedCategories, selectedSource]);

  const openModule = (href: string) => {
    if (!href) return;
    const query = selectedSourceId ? `?sourceId=${encodeURIComponent(selectedSourceId)}` : "";
    navigate(`${href}${query}`);
  };

  return (
    <DashboardLayout>
      <Header
        title="Analysis Setup"
        subtitle="Pilih kategori output utama dan modul analisis yang akan digunakan untuk source yang dipilih."
      />

      {selectedSource ? (
        <Card className="mb-6 border-cyan-500/20 bg-cyan-500/5">
          <CardContent className="grid gap-4 p-5 md:grid-cols-[1.4fr,1fr,1fr]">
            <div className="space-y-1">
              <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                Source Aktif
              </p>
              <p className="text-lg font-semibold text-foreground">{selectedSource.name}</p>
              <p className="text-sm text-muted-foreground">
                {selectedSource.location} • {selectedSource.type === "upload" ? "Upload Video" : "Camera Stream"}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                Kategori Output Saat Ini
              </p>
              <div className="flex flex-wrap gap-2">
                {selectedSource.analytics.length > 0 ? (
                  selectedSource.analytics.map((analytic) => (
                    <Badge key={analytic} variant="outline" className="border-primary/20">
                      {analytic}
                    </Badge>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">Belum ada kategori yang dipilih.</p>
                )}
              </div>
            </div>
            <div className="space-y-1">
              <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                Petunjuk
              </p>
              <p className="text-sm text-muted-foreground">
                Kategori yang dipilih pada Media Sources akan diprioritaskan di halaman ini. Setelah itu masuk ke modul setup spesifik untuk mengatur rule analisis.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="mb-6 border-border/60 bg-secondary/10">
          <CardContent className="p-5 text-sm text-muted-foreground">
            Analysis Setup bisa dibuka langsung dari `Media Sources` melalui action `Setup Analysis`, atau dipakai tanpa source terpilih untuk meninjau modul yang tersedia.
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 xl:grid-cols-2">
        {orderedCategories.map((category) => {
          const isPrioritized = selectedCategories.has(category.key);
          return (
          <Card
            key={category.key}
            className={cn(
              "border-border/60 transition-colors",
              isPrioritized ? "border-cyan-500/30 bg-cyan-500/5" : "bg-background"
            )}
          >
            <CardHeader>
              <div className="flex items-start gap-4">
                <div
                  className={cn(
                    "flex h-12 w-12 items-center justify-center rounded-2xl",
                    isPrioritized ? "bg-cyan-500/15" : "bg-secondary/60"
                  )}
                >
                  <category.icon className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <CardTitle className="text-xl">{category.title}</CardTitle>
                    {isPrioritized ? (
                      <Badge variant="default">Prioritas Source</Badge>
                    ) : (
                      <Badge variant="outline">Tersedia</Badge>
                    )}
                  </div>
                  <CardDescription>{category.description}</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {category.modules.map((module) => (
                <div
                  key={module.name}
                  className="flex flex-col gap-4 rounded-xl border border-border/70 bg-secondary/10 p-4 md:flex-row md:items-center md:justify-between"
                >
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium text-foreground">{module.name}</p>
                      <Badge variant={module.status === "active" ? "default" : "secondary"}>
                        {module.status === "active" ? "Ready" : "Planned"}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{module.description}</p>
                  </div>
                  <Button
                    type="button"
                    variant={module.status === "active" ? "default" : "outline"}
                    disabled={module.status !== "active"}
                    onClick={() => openModule(module.href)}
                    className="gap-2 self-start md:self-center"
                  >
                    {module.status === "active" ? "Buka Setup" : "Coming Soon"}
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>
        )})}
      </div>
    </DashboardLayout>
  );
}
