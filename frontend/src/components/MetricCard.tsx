import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface MetricCardProps {
  title: string;
  value: string | number;
  change?: number;
  icon: LucideIcon;
  live?: boolean;
}

export const MetricCard = ({ title, value, change, icon: Icon, live }: MetricCardProps) => {
  return (
    <div className={cn("metric-card", live && "live-indicator")}>
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-sm text-muted-foreground mb-1">{title}</p>
          <p className="text-3xl font-bold mb-2">{value}</p>
          {change !== undefined && (
            <p
              className={cn(
                "text-sm font-medium",
                change >= 0 ? "text-success" : "text-destructive"
              )}
            >
              {change >= 0 ? "+" : ""}
              {change}% from last period
            </p>
          )}
        </div>
        <div className="p-3 bg-primary/10 rounded-lg">
          <Icon className="h-6 w-6 text-primary" />
        </div>
      </div>
    </div>
  );
};
