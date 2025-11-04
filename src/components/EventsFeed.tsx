import { Clock } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface Event {
  id: string;
  type: string;
  action?: string;
  url?: string;
  timestamp: string;
}

interface EventsFeedProps {
  events: Event[];
}

export const EventsFeed = ({ events }: EventsFeedProps) => {
  const getEventColor = (type: string) => {
    switch (type) {
      case "pageview":
        return "text-primary";
      case "action":
        return "text-secondary";
      case "performance":
        return "text-success";
      default:
        return "text-muted-foreground";
    }
  };

  const getEventLabel = (event: Event) => {
    switch (event.type) {
      case "pageview":
        return `Page view: ${event.url}`;
      case "action":
        return `Action: ${event.action}`;
      case "performance":
        return `Performance metric recorded`;
      default:
        return "Unknown event";
    }
  };

  return (
    <div className="metric-card">
      <h3 className="text-lg font-semibold mb-4">Recent Events</h3>
      <div className="space-y-3 max-h-[400px] overflow-y-auto">
        {events.length === 0 ? (
          <p className="text-muted-foreground text-sm">No events yet...</p>
        ) : (
          events.map((event) => (
            <div
              key={event.id}
              className="flex items-start gap-3 p-3 rounded-lg bg-muted/30 border border-border/50 hover:border-primary/30 transition-all"
            >
              <div className={`mt-1 ${getEventColor(event.type)}`}>
                <Clock className="h-4 w-4" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{getEventLabel(event)}</p>
                <p className="text-xs text-muted-foreground">
                  {formatDistanceToNow(new Date(event.timestamp), { addSuffix: true })}
                </p>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
