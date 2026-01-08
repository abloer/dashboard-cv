import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell, Legend, AreaChart, Area } from "recharts";
import { cn } from "@/lib/utils";
import { useProductivityByUnit, useCycleTimeByHour, useFleetStatusDistribution, useHourlyProductivityTrend } from "@/hooks/useChartData";
import { Skeleton } from "@/components/ui/skeleton";

interface ChartCardProps {
  title: string;
  children: React.ReactNode;
  className?: string;
}

function ChartCard({ title, children, className }: ChartCardProps) {
  return (
    <div className={cn("bg-card rounded-xl border border-border p-4", className)}>
      <h3 className="font-semibold text-foreground mb-4">{title}</h3>
      {children}
    </div>
  );
}

function ChartSkeleton() {
  return (
    <div className="h-[250px] flex items-center justify-center">
      <Skeleton className="w-full h-full" />
    </div>
  );
}

function NoDataMessage() {
  return (
    <div className="h-[250px] flex items-center justify-center text-muted-foreground">
      Tidak ada data untuk ditampilkan
    </div>
  );
}

export function ProductivityChart() {
  const { data, isLoading } = useProductivityByUnit();

  return (
    <ChartCard title="📈 Produktivitas Excavator per Unit">
      {isLoading ? (
        <ChartSkeleton />
      ) : !data || data.length === 0 ? (
        <NoDataMessage />
      ) : (
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={data} barGap={4}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis 
              dataKey="name" 
              tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
              axisLine={{ stroke: "hsl(var(--border))" }}
            />
            <YAxis 
              tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
              axisLine={{ stroke: "hsl(var(--border))" }}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
                borderRadius: "8px",
                color: "hsl(var(--foreground))",
              }}
            />
            <Bar 
              dataKey="productivity" 
              fill="hsl(var(--primary))" 
              radius={[4, 4, 0, 0]}
              name="Productivity (%)"
            />
            <Bar 
              dataKey="target" 
              fill="hsl(var(--muted))" 
              radius={[4, 4, 0, 0]}
              name="Target"
            />
          </BarChart>
        </ResponsiveContainer>
      )}
    </ChartCard>
  );
}

export function CycleTimeChart() {
  const { data, isLoading } = useCycleTimeByHour();

  return (
    <ChartCard title="⏱️ Cycle Time Trend">
      {isLoading ? (
        <ChartSkeleton />
      ) : !data || data.length === 0 ? (
        <NoDataMessage />
      ) : (
        <ResponsiveContainer width="100%" height={250}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis 
              dataKey="time" 
              tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
              axisLine={{ stroke: "hsl(var(--border))" }}
            />
            <YAxis 
              tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
              axisLine={{ stroke: "hsl(var(--border))" }}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
                borderRadius: "8px",
                color: "hsl(var(--foreground))",
              }}
            />
            <Legend />
            <Line 
              type="monotone" 
              dataKey="digging" 
              stroke="hsl(var(--primary))" 
              strokeWidth={2}
              dot={{ fill: "hsl(var(--primary))", strokeWidth: 0 }}
              name="Digging (s)"
            />
            <Line 
              type="monotone" 
              dataKey="swinging" 
              stroke="hsl(var(--accent))" 
              strokeWidth={2}
              dot={{ fill: "hsl(var(--accent))", strokeWidth: 0 }}
              name="Swinging (s)"
            />
            <Line 
              type="monotone" 
              dataKey="dumping" 
              stroke="hsl(var(--warning))" 
              strokeWidth={2}
              dot={{ fill: "hsl(var(--warning))", strokeWidth: 0 }}
              name="Dumping (s)"
            />
          </LineChart>
        </ResponsiveContainer>
      )}
    </ChartCard>
  );
}

export function StatusPieChart() {
  const { data, isLoading } = useFleetStatusDistribution();

  return (
    <ChartCard title="🚜 Fleet Status Distribution">
      {isLoading ? (
        <ChartSkeleton />
      ) : !data || data.every(d => d.value === 0) ? (
        <NoDataMessage />
      ) : (
        <ResponsiveContainer width="100%" height={250}>
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={90}
              paddingAngle={5}
              dataKey="value"
            >
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                backgroundColor: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
                borderRadius: "8px",
                color: "hsl(var(--foreground))",
              }}
              formatter={(value) => `${value}%`}
            />
            <Legend 
              formatter={(value) => <span style={{ color: "hsl(var(--foreground))" }}>{value}</span>}
            />
          </PieChart>
        </ResponsiveContainer>
      )}
    </ChartCard>
  );
}

export function HourlyProductivityChart() {
  const { data, isLoading } = useHourlyProductivityTrend();

  return (
    <ChartCard title="📊 Hourly Productivity Trend">
      {isLoading ? (
        <ChartSkeleton />
      ) : !data || data.length === 0 ? (
        <NoDataMessage />
      ) : (
        <ResponsiveContainer width="100%" height={250}>
          <AreaChart data={data}>
            <defs>
              <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis 
              dataKey="hour" 
              tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
              axisLine={{ stroke: "hsl(var(--border))" }}
            />
            <YAxis 
              tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
              axisLine={{ stroke: "hsl(var(--border))" }}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
                borderRadius: "8px",
                color: "hsl(var(--foreground))",
              }}
            />
            <Area 
              type="monotone" 
              dataKey="value" 
              stroke="hsl(var(--primary))" 
              fillOpacity={1} 
              fill="url(#colorValue)"
              strokeWidth={2}
              name="Productivity %"
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </ChartCard>
  );
}
