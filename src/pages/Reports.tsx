import { useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Header } from "@/components/layout/Header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { FileText, Download, Calendar as CalendarIcon, FileSpreadsheet, File, Clock } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { useReports } from "@/hooks/useReports";
import { Skeleton } from "@/components/ui/skeleton";

const reportTypes = [
  { id: "daily", name: "Daily Operations Report", description: "Summary harian produktivitas & cycle time", icon: FileText },
  { id: "weekly", name: "Weekly Performance Report", description: "Analisis performa mingguan per unit", icon: FileSpreadsheet },
  { id: "fleet", name: "Fleet Status Report", description: "Status lengkap semua armada", icon: File },
  { id: "efficiency", name: "Efficiency Analysis Report", description: "Analisis efisiensi operasional", icon: Clock },
];

const Reports = () => {
  const [date, setDate] = useState<Date>();
  const [selectedReport, setSelectedReport] = useState<string>("");
  const [isGenerating, setIsGenerating] = useState(false);
  const { data: recentReports, isLoading } = useReports();

  const handleGenerate = () => {
    setIsGenerating(true);
    setTimeout(() => {
      setIsGenerating(false);
    }, 2000);
  };

  return (
    <DashboardLayout>
      <Header 
        title="Analytics" 
        subtitle="Daftar hasil analitik yang tersinkron ke cloud"
      />

      {/* Report Generator */}
      <Card className="p-6 mb-6 bg-card border-border animate-fade-in">
        <h3 className="text-lg font-semibold text-foreground mb-4">📄 Generate Report</h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {reportTypes.map((report) => (
            <button
              key={report.id}
              onClick={() => setSelectedReport(report.id)}
              className={cn(
                "p-4 rounded-lg border text-left transition-all",
                selectedReport === report.id 
                  ? "border-primary bg-primary/10" 
                  : "border-border hover:border-primary/50 bg-secondary/30"
              )}
            >
              <report.icon className={cn(
                "w-8 h-8 mb-2",
                selectedReport === report.id ? "text-primary" : "text-muted-foreground"
              )} />
              <p className="font-medium text-foreground text-sm">{report.name}</p>
              <p className="text-xs text-muted-foreground mt-1">{report.description}</p>
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-end gap-4">
          <div className="space-y-2">
            <label className="text-sm text-muted-foreground">Date Range</label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-64 justify-start text-left font-normal border-border bg-secondary",
                    !date && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {date ? format(date, "PPP") : "Pick a date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={date}
                  onSelect={setDate}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>

          <div className="space-y-2">
            <label className="text-sm text-muted-foreground">Export Format</label>
            <Select defaultValue="pdf">
              <SelectTrigger className="w-40 bg-secondary border-border">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pdf">PDF</SelectItem>
                <SelectItem value="excel">Excel</SelectItem>
                <SelectItem value="csv">CSV</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Button 
            onClick={handleGenerate}
            disabled={!selectedReport || isGenerating}
            className="bg-primary hover:bg-primary/90 text-primary-foreground gap-2"
          >
            {isGenerating ? (
              <>
                <div className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Download className="w-4 h-4" />
                Generate Report
              </>
            )}
          </Button>
        </div>
      </Card>

      {/* Latest Analytics */}
      <Card className="p-6 bg-card border-border animate-fade-in">
        <h3 className="text-lg font-semibold text-foreground mb-4">📁 Latest Analytics</h3>
        
        {isLoading ? (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="pb-3 text-sm font-medium text-muted-foreground">File</th>
                  <th className="pb-3 text-sm font-medium text-muted-foreground">Analytic Type</th>
                  <th className="pb-3 text-sm font-medium text-muted-foreground">Location</th>
                  <th className="pb-3 text-sm font-medium text-muted-foreground">Operator</th>
                  <th className="pb-3 text-sm font-medium text-muted-foreground text-right">Avg Cycle</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {recentReports?.map((report) => (
                  <tr key={report.id} className="hover:bg-secondary/30 transition-colors">
                    <td className="py-3 text-foreground">{report.fileName || "-"}</td>
                    <td className="py-3 text-muted-foreground">{report.analyticType || "-"}</td>
                    <td className="py-3 text-muted-foreground">{report.location || "-"}</td>
                    <td className="py-3 text-muted-foreground">{report.operator || "-"}</td>
                    <td className="py-3 text-right text-muted-foreground">
                      {report.avgCycleTime ? `${report.avgCycleTime}s` : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </DashboardLayout>
  );
};

export default Reports;
