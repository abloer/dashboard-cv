import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface FleetUnit {
  id: string;
  type: "Excavator" | "Dump Truck";
  location: string;
  status: "Active" | "Idle" | "Maintenance";
  operator: string;
  productivity?: number;
  lastUpdate: string;
}

const fleetData: FleetUnit[] = [
  { id: "EX-01", type: "Excavator", location: "Zone A", status: "Active", operator: "Johanson", productivity: 92, lastUpdate: "08:45:12" },
  { id: "EX-02", type: "Excavator", location: "Zone B", status: "Idle", operator: "Budi", productivity: 0, lastUpdate: "08:42:30" },
  { id: "EX-03", type: "Excavator", location: "Zone C", status: "Active", operator: "Anggi", productivity: 88, lastUpdate: "08:44:55" },
  { id: "EX-04", type: "Excavator", location: "Zone D", status: "Idle", operator: "Herry", productivity: 0, lastUpdate: "08:40:10" },
  { id: "EX-05", type: "Excavator", location: "Zone E", status: "Maintenance", operator: "Silitonga", productivity: 0, lastUpdate: "08:30:00" },
  { id: "DT-06", type: "Dump Truck", location: "Haul Road 2", status: "Active", operator: "Azis", productivity: 95, lastUpdate: "08:45:00" },
  { id: "DT-07", type: "Dump Truck", location: "Haul Road 3", status: "Active", operator: "Marwan", productivity: 90, lastUpdate: "08:44:20" },
  { id: "EX-08", type: "Excavator", location: "Zone A", status: "Active", operator: "Saprol", productivity: 85, lastUpdate: "08:43:45" },
  { id: "EX-09", type: "Excavator", location: "Zone B", status: "Idle", operator: "Deo", productivity: 0, lastUpdate: "08:35:15" },
  { id: "EX-10", type: "Excavator", location: "Zone C", status: "Active", operator: "Congex", productivity: 91, lastUpdate: "08:44:30" },
];

const statusStyles = {
  Active: "bg-success/20 text-success border-success/30",
  Idle: "bg-warning/20 text-warning border-warning/30",
  Maintenance: "bg-destructive/20 text-destructive border-destructive/30",
};

export function FleetStatusTable({ limit }: { limit?: number }) {
  const data = limit ? fleetData.slice(0, limit) : fleetData;

  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden">
      <div className="px-4 py-3 border-b border-border">
        <h3 className="font-semibold text-foreground">🚜 Fleet Status Overview</h3>
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="border-border hover:bg-transparent">
              <TableHead className="text-muted-foreground">Unit ID</TableHead>
              <TableHead className="text-muted-foreground">Type</TableHead>
              <TableHead className="text-muted-foreground">Location</TableHead>
              <TableHead className="text-muted-foreground">Status</TableHead>
              <TableHead className="text-muted-foreground">Operator</TableHead>
              <TableHead className="text-muted-foreground text-right">Productivity</TableHead>
              <TableHead className="text-muted-foreground text-right">Last Update</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((unit) => (
              <TableRow key={unit.id} className="border-border hover:bg-secondary/30">
                <TableCell className="font-medium text-foreground">{unit.id}</TableCell>
                <TableCell>
                  <Badge variant="outline" className="bg-secondary/50 border-border text-foreground">
                    {unit.type}
                  </Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">{unit.location}</TableCell>
                <TableCell>
                  <Badge className={cn("border", statusStyles[unit.status])}>
                    {unit.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">{unit.operator}</TableCell>
                <TableCell className="text-right">
                  {unit.productivity > 0 ? (
                    <span className={cn(
                      "font-medium",
                      unit.productivity >= 90 ? "text-success" : 
                      unit.productivity >= 80 ? "text-foreground" : "text-warning"
                    )}>
                      {unit.productivity}%
                    </span>
                  ) : (
                    <span className="text-muted-foreground">-</span>
                  )}
                </TableCell>
                <TableCell className="text-right text-muted-foreground font-mono text-sm">
                  {unit.lastUpdate}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
