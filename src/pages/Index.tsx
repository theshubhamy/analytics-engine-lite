import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Layout } from "@/components/Layout";
import { MetricCard } from "@/components/MetricCard";
import { EventsFeed } from "@/components/EventsFeed";
import { useWebSocket } from "@/hooks/useWebSocket";
import { Users, Eye, MousePointer, TrendingUp, Wifi } from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const API_BASE_URL = "http://localhost:3000/api";
const WS_URL = "ws://localhost:3000";

interface RealtimeData {
  activeSessions: number;
  eventsPerMinute: number;
  topPages: Array<{ url: string; count: number }>;
  recentEvents: Array<{
    id: string;
    type: string;
    action?: string;
    url?: string;
    timestamp: string;
  }>;
  eventsChart: Array<{ time: string; count: number }>;
}

const Index = () => {
  const [realtimeData, setRealtimeData] = useState<RealtimeData>({
    activeSessions: 0,
    eventsPerMinute: 0,
    topPages: [],
    recentEvents: [],
    eventsChart: [],
  });

  // Fetch initial data
  const { data } = useQuery({
    queryKey: ["realtime"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE_URL}/analytics/realtime`);
      return res.json();
    },
    refetchInterval: 5000,
  });

  // WebSocket connection for live updates
  const { isConnected } = useWebSocket({
    url: WS_URL,
    onMessage: (data) => {
      console.log("WebSocket message:", data);
      if (data.type === "realtime_update") {
        setRealtimeData((prev) => ({
          ...prev,
          ...data.payload,
        }));
      }
    },
  });

  useEffect(() => {
    if (data) {
      setRealtimeData(data);
    }
  }, [data]);

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold">Real-time Dashboard</h2>
            <p className="text-muted-foreground mt-1">Live analytics updated every 5 seconds</p>
          </div>
          <Badge variant={isConnected ? "default" : "secondary"} className="gap-2">
            <Wifi className="h-3 w-3" />
            {isConnected ? "Live" : "Connecting..."}
          </Badge>
        </div>

        {/* Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <MetricCard
            title="Active Sessions"
            value={realtimeData.activeSessions}
            icon={Users}
            live={isConnected}
          />
          <MetricCard
            title="Events/Minute"
            value={realtimeData.eventsPerMinute}
            icon={TrendingUp}
            live={isConnected}
          />
          <MetricCard
            title="Page Views (5m)"
            value={
              realtimeData.recentEvents?.filter((e) => e.type === "pageview").length || 0
            }
            icon={Eye}
          />
          <MetricCard
            title="Actions (5m)"
            value={
              realtimeData.recentEvents?.filter((e) => e.type === "action").length || 0
            }
            icon={MousePointer}
          />
        </div>

        {/* Events Chart */}
        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-4">Events Per Minute (Last 15 Minutes)</h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={realtimeData.eventsChart || []}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="time" stroke="hsl(var(--muted-foreground))" />
              <YAxis stroke="hsl(var(--muted-foreground))" />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "var(--radius)",
                }}
              />
              <Line
                type="monotone"
                dataKey="count"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                dot={{ fill: "hsl(var(--primary))", r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </Card>

        {/* Top Pages & Recent Events */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Top Pages */}
          <div className="metric-card">
            <h3 className="text-lg font-semibold mb-4">Top Pages (Last 5 Minutes)</h3>
            <div className="space-y-3">
              {realtimeData.topPages?.length > 0 ? (
                realtimeData.topPages.map((page, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border/50"
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <span className="text-2xl font-bold text-muted-foreground">
                        #{index + 1}
                      </span>
                      <p className="text-sm font-medium truncate">{page.url}</p>
                    </div>
                    <Badge variant="secondary">{page.count} views</Badge>
                  </div>
                ))
              ) : (
                <p className="text-muted-foreground text-sm">No pages viewed yet...</p>
              )}
            </div>
          </div>

          {/* Recent Events */}
          <EventsFeed events={realtimeData.recentEvents || []} />
        </div>
      </div>
    </Layout>
  );
};

export default Index;
