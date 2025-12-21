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
import { useFleetUnits } from "@/hooks/useFleetData";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";

const statusStyles = {
  Active: "bg-success/20 text-success border-success/30",
  Idle: "bg-warning/20 text-warning border-warning/30",
  Maintenance: "bg-destructive/20 text-destructive border-destructive/30",
};

export function FleetStatusTable({ limit }: { limit?: number }) {
  const { data: fleetData, isLoading, error } = useFleetUnits(limit);

  if (isLoading) {
    return (
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <h3 className="font-semibold text-foreground">🚜 Fleet Status Overview</h3>
        </div>
        <div className="p-4 space-y-3">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <h3 className="font-semibold text-foreground">🚜 Fleet Status Overview</h3>
        </div>
        <div className="p-4 text-destructive">Failed to load fleet data</div>
      </div>
    );
  }

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
            {fleetData?.map((unit) => (
              <TableRow key={unit.id} className="border-border hover:bg-secondary/30">
                <TableCell className="font-medium text-foreground">{unit.unit_id}</TableCell>
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
                <TableCell className="text-muted-foreground">{unit.operator || "-"}</TableCell>
                <TableCell className="text-right">
                  {unit.productivity !== null && unit.productivity > 0 ? (
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
                  {format(new Date(unit.last_update), "HH:mm:ss")}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
