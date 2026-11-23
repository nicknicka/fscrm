"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type {
  StageDatum,
  TrendDatum,
  LevelDatum,
} from "@/lib/analytics/dashboard";

const PIE_COLORS = [
  "#3b82f6",
  "#f59e0b",
  "#10b981",
  "#6b7280",
  "#8b5cf6",
  "#ec4899",
];

/** 阶段分布柱状图。 */
export function StageChart({ data }: { data: StageDatum[] }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="label" fontSize={12} />
        <YAxis allowDecimals={false} fontSize={12} />
        <Tooltip />
        <Bar
          dataKey="count"
          name="商机数"
          fill="#3b82f6"
          radius={[4, 4, 0, 0]}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** 商机趋势折线图：数量与预计金额两条线。 */
export function TrendChart({ data }: { data: TrendDatum[] }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="month" fontSize={12} />
        <YAxis yAxisId="count" allowDecimals={false} fontSize={12} />
        <YAxis yAxisId="amount" orientation="right" fontSize={12} />
        <Tooltip />
        <Legend />
        <Line
          yAxisId="count"
          type="monotone"
          dataKey="count"
          name="商机数"
          stroke="#3b82f6"
          strokeWidth={2}
        />
        <Line
          yAxisId="amount"
          type="monotone"
          dataKey="amount"
          name="预计金额"
          stroke="#10b981"
          strokeWidth={2}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

/** 客户等级分布饼图。 */
export function LevelChart({ data }: { data: LevelDatum[] }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <PieChart>
        <Pie
          data={data}
          dataKey="count"
          nameKey="label"
          cx="50%"
          cy="50%"
          outerRadius={80}
          label
        >
          {data.map((entry, index) => (
            <Cell
              key={entry.level}
              fill={PIE_COLORS[index % PIE_COLORS.length]}
            />
          ))}
        </Pie>
        <Tooltip />
        <Legend />
      </PieChart>
    </ResponsiveContainer>
  );
}
