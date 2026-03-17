import { Boxes, BrainCircuit, FlaskConical, ShieldCheck } from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Header } from "@/components/layout/Header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const sections = [
  {
    title: "Model Registry",
    description: "Daftar model yang tersedia untuk inference, lengkap dengan versi, domain, dan status deploy.",
    icon: Boxes,
    status: "Planned",
  },
  {
    title: "Training Jobs",
    description: "Ruang untuk menjalankan training, fine-tuning, dan monitoring job model.",
    icon: BrainCircuit,
    status: "Planned",
  },
  {
    title: "Evaluation",
    description: "Perbandingan hasil evaluasi model, precision/recall, confusion case, dan benchmark per kamera.",
    icon: FlaskConical,
    status: "Planned",
  },
  {
    title: "Deployment Gate",
    description: "Persetujuan model sebelum dipakai sebagai preset aktif pada modul analisis operasional.",
    icon: ShieldCheck,
    status: "Planned",
  },
] as const;

export default function Models() {
  return (
    <DashboardLayout>
      <Header
        title="Models"
        subtitle="Ruang terpisah untuk registry model, training, evaluasi, dan lifecycle deploy model analisis."
      />

      <div className="grid gap-6 xl:grid-cols-2">
        {sections.map((section) => (
          <Card key={section.title} className="border-border/60">
            <CardHeader>
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-secondary/60">
                  <section.icon className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <CardTitle className="text-xl">{section.title}</CardTitle>
                    <Badge variant="secondary">{section.status}</Badge>
                  </div>
                  <CardDescription>{section.description}</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Bagian ini dipisahkan dari `Modules` agar konfigurasi rule operasional tidak tercampur dengan lifecycle model seperti training, evaluasi, dan registry versi.
            </CardContent>
          </Card>
        ))}
      </div>
    </DashboardLayout>
  );
}
