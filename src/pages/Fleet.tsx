import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Header } from "@/components/layout/Header";
import { FleetStatusTable } from "@/components/dashboard/FleetStatusTable";
import { MetricCard } from "@/components/dashboard/MetricCard";
import { Truck, CheckCircle, AlertCircle, Wrench } from "lucide-react";
import { useFleetSummary, useFleetUnits } from "@/hooks/useFleetData";

const Fleet = () => {
  const { data: fleetSummary } = useFleetSummary();
  const { data: fleetUnits } = useFleetUnits();

  const totalUnits = fleetUnits?.length || 0;
  const activeUnits = fleetSummary?.totalActive || 0;
  const idleUnits = fleetSummary?.totalIdle || 0;
  const maintenanceUnits = fleetSummary?.totalMaintenance || 0;

  const activePercent = totalUnits > 0 ? Math.round((activeUnits / totalUnits) * 100) : 0;
  const idlePercent = totalUnits > 0 ? Math.round((idleUnits / totalUnits) * 100) : 0;
  const maintenancePercent = totalUnits > 0 ? Math.round((maintenanceUnits / totalUnits) * 100) : 0;

  return (
    <DashboardLayout>
      <Header 
        title="Fleet Status" 
        subtitle="Real-time status semua unit armada"
      />

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <MetricCard
          title="Total Unit"
          value={`${totalUnits}`}
          icon={Truck}
          variant="primary"
          className="animate-fade-in stagger-1"
        />
        <MetricCard
          title="Active"
          value={`${activeUnits}`}
          subtitle={`${activePercent}% dari total`}
          icon={CheckCircle}
          variant="success"
          className="animate-fade-in stagger-2"
        />
        <MetricCard
          title="Idle"
          value={`${idleUnits}`}
          subtitle={`${idlePercent}% dari total`}
          icon={AlertCircle}
          variant="warning"
          className="animate-fade-in stagger-3"
        />
        <MetricCard
          title="Maintenance"
          value={`${maintenanceUnits}`}
          subtitle={`${maintenancePercent}% dari total`}
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
