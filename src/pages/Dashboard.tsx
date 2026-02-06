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
        subtitle="Cloud analytics overview"
      />

      {/* Summary Cards - Row 1 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <MetricCard
          title="Total Video"
          value={`${fleetSummary?.totalVideos || 0}`}
          subtitle="data analytics"
          icon={Shovel}
          variant="primary"
          className="animate-fade-in stagger-1"
        />
        <MetricCard
          title="Cycle Time Analytic"
          value={`${fleetSummary?.cycleTimeCount || 0}`}
          subtitle="rekaman"
          icon={Truck}
          variant="accent"
          className="animate-fade-in stagger-2"
        />
        <MetricCard
          title="Avg Cycle Time"
          value={dailySummary?.avgCycleTime ? `${dailySummary.avgCycleTime}s` : "--"}
          subtitle="rata-rata"
          icon={Timer}
          variant="warning"
          className="animate-fade-in stagger-3"
        />
        <MetricCard
          title="Avg Queue Time"
          value={dailySummary?.avgQueueTime ? `${dailySummary.avgQueueTime}s` : "--"}
          subtitle="dump truck"
          icon={Clock}
          className="animate-fade-in stagger-4"
        />
      </div>

      {/* Summary Cards - Row 2 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <MetricCard
          title="Bench Height Analytic"
          value={`${fleetSummary?.benchHeightCount || 0}`}
          subtitle="rekaman"
          icon={Ruler}
          variant="success"
          className="animate-fade-in stagger-5"
        />
        <MetricCard
          title="Front Loading Analytic"
          value={`${fleetSummary?.frontLoadingCount || 0}`}
          subtitle="rekaman"
          icon={Mountain}
          variant="warning"
          className="animate-fade-in stagger-6"
        />
        <MetricCard
          title="Avg Bench Height"
          value={dailySummary?.avgBenchHeight ? `${dailySummary.avgBenchHeight}m` : "--"}
          subtitle="rata-rata"
          icon={TrendingUp}
          className="animate-fade-in stagger-7"
        />
        <MetricCard
          title="Avg Estimated Load"
          value={dailySummary?.avgEstimatedLoad ? `${dailySummary.avgEstimatedLoad}` : "--"}
          subtitle="dump truck"
          icon={Zap}
          variant="success"
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
