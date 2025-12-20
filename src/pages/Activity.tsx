import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Header } from "@/components/layout/Header";
import { ActivityLog } from "@/components/dashboard/ActivityLog";
import { MetricCard } from "@/components/dashboard/MetricCard";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Activity, CheckCircle, AlertTriangle, XCircle, Download, Filter } from "lucide-react";

const ActivityPage = () => {
  return (
    <DashboardLayout>
      <Header 
        title="Activity Log" 
        subtitle="AI-detected activity timeline"
      />

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <MetricCard
          title="Total Events Today"
          value="248"
          icon={Activity}
          variant="primary"
          className="animate-fade-in stagger-1"
        />
        <MetricCard
          title="Success Events"
          value="198"
          icon={CheckCircle}
          variant="success"
          className="animate-fade-in stagger-2"
        />
        <MetricCard
          title="Warnings"
          value="42"
          icon={AlertTriangle}
          variant="warning"
          className="animate-fade-in stagger-3"
        />
        <MetricCard
          title="Errors"
          value="8"
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
              <SelectItem value="all">All Units</SelectItem>
              <SelectItem value="excavator">Excavator</SelectItem>
              <SelectItem value="dump-truck">Dump Truck</SelectItem>
            </SelectContent>
          </Select>

          <Select defaultValue="all">
            <SelectTrigger className="w-40 bg-secondary border-border">
              <SelectValue placeholder="Activity Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Activities</SelectItem>
              <SelectItem value="loading">Loading</SelectItem>
              <SelectItem value="digging">Digging</SelectItem>
              <SelectItem value="swinging">Swinging</SelectItem>
              <SelectItem value="dumping">Dumping</SelectItem>
              <SelectItem value="idle">Idle</SelectItem>
            </SelectContent>
          </Select>

          <Select defaultValue="all">
            <SelectTrigger className="w-40 bg-secondary border-border">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="success">Success</SelectItem>
              <SelectItem value="warning">Warning</SelectItem>
              <SelectItem value="error">Error</SelectItem>
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
