import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Layout } from "@/components/Layout";
import { Card } from "@/components/ui/card";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { CalendarIcon, TrendingUp, Users, MousePointer, Zap } from "lucide-react";
import { format, subDays } from "date-fns";
import {
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { cn } from "@/lib/utils";

const API_BASE_URL = "http://localhost:3000/api";

const Analytics = () => {
  const [dateRange, setDateRange] = useState({
    from: subDays(new Date(), 7),
    to: new Date(),
  });

  const { data: summary } = useQuery({
    queryKey: ["analytics-summary", dateRange],
    queryFn: async () => {
      const from = format(dateRange.from, "yyyy-MM-dd");
      const to = format(dateRange.to, "yyyy-MM-dd");
      const res = await fetch(`${API_BASE_URL}/analytics/summary?from=${from}&to=${to}`);
      return res.json();
    },
    refetchInterval: 30000,
  });

  const { data: topPages } = useQuery({
    queryKey: ["top-pages", dateRange],
    queryFn: async () => {
      const from = format(dateRange.from, "yyyy-MM-dd");
      const to = format(dateRange.to, "yyyy-MM-dd");
      const res = await fetch(`${API_BASE_URL}/analytics/top-pages?from=${from}&to=${to}`);
      return res.json();
    },
    refetchInterval: 30000,
  });

  const { data: actions } = useQuery({
    queryKey: ["actions", dateRange],
    queryFn: async () => {
      const from = format(dateRange.from, "yyyy-MM-dd");
      const to = format(dateRange.to, "yyyy-MM-dd");
      const res = await fetch(`${API_BASE_URL}/analytics/actions?from=${from}&to=${to}`);
      return res.json();
    },
    refetchInterval: 30000,
  });

  const { data: performance } = useQuery({
    queryKey: ["performance", dateRange],
    queryFn: async () => {
      const from = format(dateRange.from, "yyyy-MM-dd");
      const to = format(dateRange.to, "yyyy-MM-dd");
      const res = await fetch(`${API_BASE_URL}/analytics/performance?from=${from}&to=${to}`);
      return res.json();
    },
    refetchInterval: 30000,
  });

  const COLORS = ["hsl(var(--chart-1))", "hsl(var(--chart-2))", "hsl(var(--chart-3))", "hsl(var(--chart-4))", "hsl(var(--chart-5))"];

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold">Historical Analytics</h2>
            <p className="text-muted-foreground mt-1">
              Viewing data from {format(dateRange.from, "MMM dd")} to {format(dateRange.to, "MMM dd, yyyy")}
            </p>
          </div>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className={cn("justify-start text-left font-normal")}>
                <CalendarIcon className="mr-2 h-4 w-4" />
                {format(dateRange.from, "MMM dd")} - {format(dateRange.to, "MMM dd, yyyy")}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <div className="p-3 space-y-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start"
                  onClick={() => setDateRange({ from: subDays(new Date(), 7), to: new Date() })}
                >
                  Last 7 days
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start"
                  onClick={() => setDateRange({ from: subDays(new Date(), 30), to: new Date() })}
                >
                  Last 30 days
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start"
                  onClick={() => setDateRange({ from: subDays(new Date(), 90), to: new Date() })}
                >
                  Last 90 days
                </Button>
              </div>
            </PopoverContent>
          </Popover>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="metric-card">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-muted-foreground mb-1">Total Page Views</p>
                <p className="text-3xl font-bold">{summary?.totalPageViews?.toLocaleString() || 0}</p>
              </div>
              <div className="p-3 bg-primary/10 rounded-lg">
                <TrendingUp className="h-6 w-6 text-primary" />
              </div>
            </div>
          </div>
          
          <div className="metric-card">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-muted-foreground mb-1">Unique Sessions</p>
                <p className="text-3xl font-bold">{summary?.uniqueSessions?.toLocaleString() || 0}</p>
              </div>
              <div className="p-3 bg-secondary/10 rounded-lg">
                <Users className="h-6 w-6 text-secondary" />
              </div>
            </div>
          </div>

          <div className="metric-card">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-muted-foreground mb-1">Total Actions</p>
                <p className="text-3xl font-bold">{summary?.totalActions?.toLocaleString() || 0}</p>
              </div>
              <div className="p-3 bg-success/10 rounded-lg">
                <MousePointer className="h-6 w-6 text-success" />
              </div>
            </div>
          </div>

          <div className="metric-card">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-muted-foreground mb-1">Avg Load Time</p>
                <p className="text-3xl font-bold">{summary?.avgLoadTime || 0}ms</p>
              </div>
              <div className="p-3 bg-warning/10 rounded-lg">
                <Zap className="h-6 w-6 text-warning" />
              </div>
            </div>
          </div>
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Page Views Over Time */}
          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4">Page Views Over Time</h3>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={summary?.pageViewsOverTime || []}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" />
                <YAxis stroke="hsl(var(--muted-foreground))" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "var(--radius)",
                  }}
                />
                <Line type="monotone" dataKey="views" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </Card>

          {/* Actions Breakdown */}
          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4">Actions Breakdown</h3>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={actions || []}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  outerRadius={100}
                  fill="hsl(var(--primary))"
                  dataKey="count"
                >
                  {(actions || []).map((entry: any, index: number) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "var(--radius)",
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </Card>
        </div>

        {/* Top Pages Table */}
        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-4">Top Pages</h3>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Page URL</th>
                  <th className="text-right py-3 px-4 text-sm font-medium text-muted-foreground">Views</th>
                  <th className="text-right py-3 px-4 text-sm font-medium text-muted-foreground">Avg Time</th>
                  <th className="text-right py-3 px-4 text-sm font-medium text-muted-foreground">Bounce Rate</th>
                </tr>
              </thead>
              <tbody>
                {(topPages || []).map((page: any, index: number) => (
                  <tr key={index} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                    <td className="py-3 px-4 text-sm font-medium">{page.url}</td>
                    <td className="py-3 px-4 text-sm text-right">{page.views?.toLocaleString()}</td>
                    <td className="py-3 px-4 text-sm text-right">{page.avgTime}s</td>
                    <td className="py-3 px-4 text-sm text-right">{page.bounceRate}%</td>
                  </tr>
                ))}
                {(!topPages || topPages.length === 0) && (
                  <tr>
                    <td colSpan={4} className="py-8 text-center text-muted-foreground">
                      No data available
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Performance Metrics */}
        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-4">Performance Metrics</h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={performance || []}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="timestamp" stroke="hsl(var(--muted-foreground))" />
              <YAxis stroke="hsl(var(--muted-foreground))" />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "var(--radius)",
                }}
              />
              <Legend />
              <Line type="monotone" dataKey="loadTime" stroke="hsl(var(--chart-1))" strokeWidth={2} name="Load Time (ms)" />
              <Line type="monotone" dataKey="fcp" stroke="hsl(var(--chart-2))" strokeWidth={2} name="FCP (ms)" />
              <Line type="monotone" dataKey="lcp" stroke="hsl(var(--chart-3))" strokeWidth={2} name="LCP (ms)" />
            </LineChart>
          </ResponsiveContainer>
        </Card>
      </div>
    </Layout>
  );
};

export default Analytics;
