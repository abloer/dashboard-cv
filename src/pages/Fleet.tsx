import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Header } from "@/components/layout/Header";
import { FleetStatusTable } from "@/components/dashboard/FleetStatusTable";
import { MetricCard } from "@/components/dashboard/MetricCard";
import { Truck, CheckCircle, AlertCircle, Wrench } from "lucide-react";

const Fleet = () => {
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
          value="14"
          icon={Truck}
          variant="primary"
          className="animate-fade-in stagger-1"
        />
        <MetricCard
          title="Active"
          value="9"
          subtitle="64% dari total"
          icon={CheckCircle}
          variant="success"
          className="animate-fade-in stagger-2"
        />
        <MetricCard
          title="Idle"
          value="3"
          subtitle="21% dari total"
          icon={AlertCircle}
          variant="warning"
          className="animate-fade-in stagger-3"
        />
        <MetricCard
          title="Maintenance"
          value="2"
          subtitle="14% dari total"
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
