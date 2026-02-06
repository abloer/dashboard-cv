import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Header } from "@/components/layout/Header";
import { ActivityLog } from "@/components/dashboard/ActivityLog";
import { MetricCard } from "@/components/dashboard/MetricCard";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Activity, CheckCircle, AlertTriangle, XCircle, Download, Filter } from "lucide-react";
import { useFleetSummary } from "@/hooks/useFleetData";

const ActivityPage = () => {
  const { data: summary } = useFleetSummary();

  return (
    <DashboardLayout>
      <Header 
        title="Activity Log" 
        subtitle="Timeline hasil analisa video"
      />

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <MetricCard
          title="Total Analytics"
          value={`${summary?.totalVideos || 0}`}
          icon={Activity}
          variant="primary"
          className="animate-fade-in stagger-1"
        />
        <MetricCard
          title="Cycle Time"
          value={`${summary?.cycleTimeCount || 0}`}
          icon={CheckCircle}
          variant="success"
          className="animate-fade-in stagger-2"
        />
        <MetricCard
          title="Bench Height"
          value={`${summary?.benchHeightCount || 0}`}
          icon={AlertTriangle}
          variant="warning"
          className="animate-fade-in stagger-3"
        />
        <MetricCard
          title="Front Loading"
          value={`${summary?.frontLoadingCount || 0}`}
          icon={XCircle}
          variant="default"
          className="animate-fade-in stagger-4"
        />
      </div>

      {/* Filters */}
      <div className="bg-card rounded-xl border border-border p-4 mb-6 animate-fade-in">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Filter:</span>
          </div>
          
          <Select defaultValue="all">
            <SelectTrigger className="w-40 bg-secondary border-border">
              <SelectValue placeholder="Unit" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Sources</SelectItem>
              <SelectItem value="video">Video Analytics</SelectItem>
            </SelectContent>
          </Select>

          <Select defaultValue="all">
            <SelectTrigger className="w-40 bg-secondary border-border">
              <SelectValue placeholder="Activity Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Analytics</SelectItem>
              <SelectItem value="cycle">Cycle Time</SelectItem>
              <SelectItem value="bench">Bench Height</SelectItem>
              <SelectItem value="front">Front Loading</SelectItem>
            </SelectContent>
          </Select>

          <Select defaultValue="all">
            <SelectTrigger className="w-40 bg-secondary border-border">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="available">Available</SelectItem>
            </SelectContent>
          </Select>

          <div className="ml-auto">
            <Button variant="outline" className="gap-2 border-border">
              <Download className="w-4 h-4" />
              Export CSV
            </Button>
          </div>
        </div>
      </div>

      {/* Activity Log */}
      <div className="animate-fade-in">
        <ActivityLog />
      </div>
    </DashboardLayout>
  );
};

export default ActivityPage;
