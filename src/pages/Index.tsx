import { useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Header } from "@/components/layout/Header";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, Loader2 } from "lucide-react";
import { useVisionResults } from "@/hooks/useVisionResults";
import { Card, CardContent } from "@/components/ui/card";

export default function Index() {
  const { data: visionResults, isLoading } = useVisionResults();
  const [searchTerm, setSearchTerm] = useState("");

  const filteredResults = visionResults?.filter(item =>
    (item.fileName || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
    (item.location || "").toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

  return (
    <DashboardLayout>
      <Header
        title="Data Computer Vision"
        subtitle="Daftar hasil analisis video yang tersinkron ke cloud"
      />

      <div className="flex flex-col md:flex-row justify-between items-center gap-4 mb-6">
        <div className="relative w-full md:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Cari video atau lokasi..."
            className="pl-9"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nama Video</TableHead>
                <TableHead>Analytic Type</TableHead>
                <TableHead>Lokasi</TableHead>
                <TableHead>Operator</TableHead>
                <TableHead>Avg Cycle</TableHead>
                <TableHead>Bench Height</TableHead>
                <TableHead>Front Loading</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-24 text-center">
                    <div className="flex justify-center items-center gap-2">
                      <Loader2 className="w-5 h-5 animate-spin text-primary" />
                      <span>Memuat data...</span>
                    </div>
                  </TableCell>
                </TableRow>
              ) : filteredResults.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                    Belum ada data video yang tersimpan.
                  </TableCell>
                </TableRow>
              ) : (
                filteredResults.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">{item.fileName || "-"}</TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {item.analyticType || "-"}
                      </Badge>
                    </TableCell>
                    <TableCell>{item.location || "-"}</TableCell>
                    <TableCell>{item.operator || "-"}</TableCell>
                    <TableCell>{item.avgCycleTime ? `${item.avgCycleTime}s` : "-"}</TableCell>
                    <TableCell>{item.benchHeight ? `${item.benchHeight}m` : "-"}</TableCell>
                    <TableCell>{item.frontLoadingAreaLength ? `${item.frontLoadingAreaLength}m` : "-"}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </DashboardLayout>
  );
}
