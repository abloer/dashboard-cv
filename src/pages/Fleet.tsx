import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Header } from "@/components/layout/Header";
import { FleetStatusTable } from "@/components/dashboard/FleetStatusTable";
import { MetricCard } from "@/components/dashboard/MetricCard";
import { Truck, CheckCircle, AlertCircle, Wrench } from "lucide-react";
import { useFleetSummary } from "@/hooks/useFleetData";

const Fleet = () => {
  const { data: fleetSummary } = useFleetSummary();
  const totalUnits = fleetSummary?.totalVideos || 0;
  const cycleUnits = fleetSummary?.cycleTimeCount || 0;
  const benchUnits = fleetSummary?.benchHeightCount || 0;
  const frontUnits = fleetSummary?.frontLoadingCount || 0;

  const cyclePercent = totalUnits > 0 ? Math.round((cycleUnits / totalUnits) * 100) : 0;
  const benchPercent = totalUnits > 0 ? Math.round((benchUnits / totalUnits) * 100) : 0;
  const frontPercent = totalUnits > 0 ? Math.round((frontUnits / totalUnits) * 100) : 0;

  return (
    <DashboardLayout>
      <Header 
        title="Analytics Overview" 
        subtitle="Ringkasan hasil analitik video"
      />

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <MetricCard
          title="Total Video"
          value={`${totalUnits}`}
          icon={Truck}
          variant="primary"
          className="animate-fade-in stagger-1"
        />
        <MetricCard
          title="Cycle Time"
          value={`${cycleUnits}`}
          subtitle={`${cyclePercent}% dari total`}
          icon={CheckCircle}
          variant="success"
          className="animate-fade-in stagger-2"
        />
        <MetricCard
          title="Bench Height"
          value={`${benchUnits}`}
          subtitle={`${benchPercent}% dari total`}
          icon={AlertCircle}
          variant="warning"
          className="animate-fade-in stagger-3"
        />
        <MetricCard
          title="Front Loading"
          value={`${frontUnits}`}
          subtitle={`${frontPercent}% dari total`}
          icon={Wrench}
          variant="default"
          className="animate-fade-in stagger-4"
        />
      </div>

      {/* Fleet Table */}
      <div className="animate-fade-in">
        <FleetStatusTable />
      </div>
    </DashboardLayout>
  );
};

export default Fleet;
