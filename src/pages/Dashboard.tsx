import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Header } from "@/components/layout/Header";
import { MetricCard } from "@/components/dashboard/MetricCard";
import { ProductivityChart, CycleTimeChart, StatusPieChart, HourlyProductivityChart } from "@/components/dashboard/Charts";
import { FleetStatusTable } from "@/components/dashboard/FleetStatusTable";
import { ActivityLog } from "@/components/dashboard/ActivityLog";
import { Shovel, Truck, Timer, Clock, Ruler, Mountain, TrendingUp, Zap } from "lucide-react";
import { useFleetSummary } from "@/hooks/useFleetData";
import { useDailySummary } from "@/hooks/useDailySummary";

const Dashboard = () => {
  const { data: fleetSummary } = useFleetSummary();
  const { data: dailySummary } = useDailySummary();

  return (
    <DashboardLayout>
      <Header 
        title="Dashboard" 
        subtitle="Real-time monitoring & analytics overview"
      />

      {/* Summary Cards - Row 1 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <MetricCard
          title="Excavator Terdeteksi"
          value={`${fleetSummary?.totalExcavators || 0} Unit`}
          icon={Shovel}
          variant="primary"
          trend={{ value: 12, isPositive: true }}
          className="animate-fade-in stagger-1"
        />
        <MetricCard
          title="Dump Truck Terdeteksi"
          value={`${fleetSummary?.totalDumpTrucks || 0} Unit`}
          icon={Truck}
          variant="accent"
          trend={{ value: 8, isPositive: true }}
          className="animate-fade-in stagger-2"
        />
        <MetricCard
          title="Avg. Excavator Cycle"
          value={dailySummary?.avg_cycle_time ? `${dailySummary.avg_cycle_time} detik` : "-- detik"}
          icon={Timer}
          variant="warning"
          className="animate-fade-in stagger-3"
        />
        <MetricCard
          title="Total Loads"
          value={`${dailySummary?.total_loads || 0}`}
          icon={Clock}
          className="animate-fade-in stagger-4"
        />
      </div>

      {/* Summary Cards - Row 2 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <MetricCard
          title="Active Units"
          value={`${fleetSummary?.totalActive || 0}`}
          icon={Ruler}
          variant="success"
          className="animate-fade-in stagger-5"
        />
        <MetricCard
          title="Idle Units"
          value={`${fleetSummary?.totalIdle || 0}`}
          icon={Mountain}
          variant="warning"
          className="animate-fade-in stagger-6"
        />
        <MetricCard
          title="Total Volume"
          value={dailySummary?.total_volume_m3 ? `${dailySummary.total_volume_m3} m³` : "-- m³"}
          icon={TrendingUp}
          className="animate-fade-in stagger-7"
        />
        <MetricCard
          title="Efektifitas Operasional"
          value={dailySummary?.overall_efficiency ? `${dailySummary.overall_efficiency}%` : "--%"}
          icon={Zap}
          variant="success"
          trend={{ value: 5, isPositive: true }}
          className="animate-fade-in stagger-8"
        />
      </div>

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div className="animate-fade-in">
          <ProductivityChart />
        </div>
        <div className="animate-fade-in">
          <CycleTimeChart />
        </div>
      </div>

      {/* Charts Row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <div className="animate-fade-in">
          <StatusPieChart />
        </div>
        <div className="lg:col-span-2 animate-fade-in">
          <HourlyProductivityChart />
        </div>
      </div>

      {/* Fleet Table & Activity Log */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="animate-fade-in">
          <FleetStatusTable limit={5} />
        </div>
        <div className="animate-fade-in">
          <ActivityLog limit={5} />
        </div>
      </div>
    </DashboardLayout>
  );
};

export default Dashboard;
