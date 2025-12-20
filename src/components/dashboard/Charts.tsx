import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell, Legend, AreaChart, Area } from "recharts";
import { cn } from "@/lib/utils";

const productivityData = [
  { name: "EX-01", productivity: 45, target: 50 },
  { name: "EX-02", productivity: 52, target: 50 },
  { name: "EX-03", productivity: 49, target: 50 },
  { name: "EX-04", productivity: 61, target: 50 },
  { name: "EX-05", productivity: 58, target: 50 },
  { name: "EX-06", productivity: 42, target: 50 },
  { name: "EX-07", productivity: 55, target: 50 },
  { name: "EX-08", productivity: 48, target: 50 },
];

const cycleTimeData = [
  { time: "06:00", digging: 35, swinging: 20, dumping: 25 },
  { time: "07:00", digging: 38, swinging: 22, dumping: 23 },
  { time: "08:00", digging: 32, swinging: 18, dumping: 28 },
  { time: "09:00", digging: 40, swinging: 21, dumping: 24 },
  { time: "10:00", digging: 36, swinging: 19, dumping: 26 },
  { time: "11:00", digging: 34, swinging: 23, dumping: 22 },
  { time: "12:00", digging: 42, swinging: 20, dumping: 25 },
];

const statusData = [
  { name: "Active", value: 65, color: "hsl(var(--success))" },
  { name: "Idle", value: 25, color: "hsl(var(--warning))" },
  { name: "Maintenance", value: 10, color: "hsl(var(--destructive))" },
];

const hourlyProductivity = [
  { hour: "06", value: 78 },
  { hour: "07", value: 85 },
  { hour: "08", value: 92 },
  { hour: "09", value: 88 },
  { hour: "10", value: 95 },
  { hour: "11", value: 82 },
  { hour: "12", value: 70 },
  { hour: "13", value: 75 },
  { hour: "14", value: 90 },
  { hour: "15", value: 87 },
];

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

export function ProductivityChart() {
  return (
    <ChartCard title="📈 Produktivitas Excavator per Unit">
      <ResponsiveContainer width="100%" height={250}>
        <BarChart data={productivityData} barGap={4}>
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
            name="Productivity (ton/hr)"
          />
          <Bar 
            dataKey="target" 
            fill="hsl(var(--muted))" 
            radius={[4, 4, 0, 0]}
            name="Target"
          />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

export function CycleTimeChart() {
  return (
    <ChartCard title="⏱️ Cycle Time Trend">
      <ResponsiveContainer width="100%" height={250}>
        <LineChart data={cycleTimeData}>
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
    </ChartCard>
  );
}

export function StatusPieChart() {
  return (
    <ChartCard title="🚜 Fleet Status Distribution">
      <ResponsiveContainer width="100%" height={250}>
        <PieChart>
          <Pie
            data={statusData}
            cx="50%"
            cy="50%"
            innerRadius={60}
            outerRadius={90}
            paddingAngle={5}
            dataKey="value"
          >
            {statusData.map((entry, index) => (
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
          />
          <Legend 
            formatter={(value) => <span style={{ color: "hsl(var(--foreground))" }}>{value}</span>}
          />
        </PieChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

export function HourlyProductivityChart() {
  return (
    <ChartCard title="📊 Hourly Productivity Trend">
      <ResponsiveContainer width="100%" height={250}>
        <AreaChart data={hourlyProductivity}>
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
    </ChartCard>
  );
}
