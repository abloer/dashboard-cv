import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useFleetUnits } from "@/hooks/useFleetData";
import { Skeleton } from "@/components/ui/skeleton";

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
          <h3 className="font-semibold text-foreground">📼 Video Analytics Overview</h3>
        </div>
        <div className="p-4 text-destructive">Failed to load analytics data</div>
      </div>
    );
  }

  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden">
      <div className="px-4 py-3 border-b border-border">
        <h3 className="font-semibold text-foreground">📼 Video Analytics Overview</h3>
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="border-border hover:bg-transparent">
              <TableHead className="text-muted-foreground">File</TableHead>
              <TableHead className="text-muted-foreground">Analytic Type</TableHead>
              <TableHead className="text-muted-foreground">Location</TableHead>
              <TableHead className="text-muted-foreground">Operator</TableHead>
              <TableHead className="text-muted-foreground text-right">Avg Cycle</TableHead>
              <TableHead className="text-muted-foreground text-right">Bench Height</TableHead>
              <TableHead className="text-muted-foreground text-right">Front Loading</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {fleetData?.map((unit) => (
              <TableRow key={unit.id} className="border-border hover:bg-secondary/30">
                <TableCell className="font-medium text-foreground">{unit.fileName || "-"}</TableCell>
                <TableCell>
                  <Badge variant="outline" className="bg-secondary/50 border-border text-foreground">
                    {unit.analyticType || "-"}
                  </Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">{unit.location || "-"}</TableCell>
                <TableCell className="text-muted-foreground">{unit.operator || "-"}</TableCell>
                <TableCell className="text-right text-muted-foreground">
                  {unit.avgCycleTime !== null ? `${unit.avgCycleTime}s` : "-"}
                </TableCell>
                <TableCell className="text-right text-muted-foreground">
                  {unit.benchHeight !== null ? `${unit.benchHeight}m` : "-"}
                </TableCell>
                <TableCell className="text-right text-muted-foreground">
                  {unit.frontLoadingAreaLength !== null ? `${unit.frontLoadingAreaLength}m` : "-"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
