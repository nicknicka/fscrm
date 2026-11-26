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
import { useEffect, useState } from "react";
import type {
  StageDatum,
  TrendDatum,
  LevelDatum,
} from "@/lib/analytics/dashboard";

/**
 * 图表配色：墨金体系的数据可视化色阶，按主题分别调过。
 *
 * 暗色不能只反转背景——深墨色的扇区在深底上会整个消失，
 * 所以两套色阶是各自选点，不是同一组颜色换不透明度。
 * 分类色取彼此距离足够的三个点，避免同一色相两个明度读成同一类。
 */
type ChartPalette = {
  ink: string;
  brass: string;
  pie: string[];
  grid: string;
  axis: string;
  tooltip: React.CSSProperties;
};

const LIGHT: ChartPalette = {
  ink: "#1c1b16",
  brass: "#c9963c",
  /*
   * 扇区颜色按业务权重排序：高 > 中 > 低。
   * 亮色下"最重" = 最深，所以高价值用近黑，中价值深棕，低价值浅卡其。
   * 上一版把中价值(#a89b7e)排得比高价值亮一倍，语义反了。
   */
  /*
   * 同一色相（琥珀）的三级明度阶梯，而不是"深墨 + 卡其 + 黑"三种色相。
   * 单色相阶梯的好处：三档天然是"同一种东西的三个等级"，
   * 且每档都与白卡有足够明度差，不会有一档融进底色。
   * 高价值最深 → 中价值居中 → 低价值最浅。
   */
  pie: ["#6b4f1c", "#a8884a", "#d9c9a8", "#c9963c", "#8a7a5c"],
  grid: "#e7e4dc",
  axis: "#6b685c",
  tooltip: {
    borderRadius: 10,
    border: "1px solid #e7e4dc",
    backgroundColor: "#fff",
    boxShadow: "0 8px 24px -8px rgb(28 27 22 / 0.18)",
    fontSize: 13,
  },
};

/* 暗色：墨色扇区要提亮成暖灰金，否则与深底融成一片 */
const DARK: ChartPalette = {
  ink: "#e8e5db",
  brass: "#d9ad5c",
  /*
   * 暗色下"最重" = 最亮：高价值用最亮的琥珀金，中价值次之，低价值最暗。
   * 上一版低价值 #f0c878 成了整图最亮的一块，视觉主角错位。
   */
  /* 暗色把阶梯反过来：高价值最亮，低价值最暗，但最低一档仍高于卡片底色 */
  pie: ["#f5c97f", "#b08a4a", "#6e5d3c", "#8f8672", "#b9b2a0"],
  grid: "#3d3a2e",
  axis: "#a5a193",
  tooltip: {
    borderRadius: 10,
    border: "1px solid #4a4738",
    backgroundColor: "#2c2a20",
    color: "#f0eee5",
    boxShadow: "0 8px 24px -8px rgb(0 0 0 / 0.6)",
    fontSize: 13,
  },
};

/**
 * 当前主题的图表配色。
 *
 * 用 CSS 变量读取而不是 React 状态：主题由 <html data-theme> 驱动，
 * 图表只需在渲染时跟随，不必为切换重挂整个图表树。
 */
function usePalette(): ChartPalette {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    const read = () => setDark(root.dataset.theme === "dark");
    read();
    const observer = new MutationObserver(read);
    observer.observe(root, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => observer.disconnect();
  }, []);

  return dark ? DARK : LIGHT;
}

/** 阶段分布柱状图。 */
export function StageChart({ data }: { data: StageDatum[] }) {
  const p = usePalette();

  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={p.grid} />
        <XAxis
          dataKey="label"
          fontSize={12}
          tick={{ fill: p.axis }}
          tickLine={false}
          axisLine={{ stroke: p.grid }}
        />
        <YAxis
          allowDecimals={false}
          fontSize={12}
          tick={{ fill: p.axis }}
          tickLine={false}
          axisLine={false}
        />
        <Tooltip
          contentStyle={p.tooltip}
          cursor={{ fill: "rgba(201,150,60,0.08)" }}
        />
        <Bar
          dataKey="count"
          name="商机数"
          fill={p.brass}
          radius={[4, 4, 0, 0]}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** 商机趋势折线图：数量与预计金额两条线，金额轴用万/亿缩写。 */
export function TrendChart({ data }: { data: TrendDatum[] }) {
  const p = usePalette();

  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={p.grid} />
        <XAxis
          dataKey="month"
          fontSize={12}
          tick={{ fill: p.axis }}
          tickLine={false}
          axisLine={{ stroke: p.grid }}
        />
        <YAxis
          yAxisId="count"
          allowDecimals={false}
          fontSize={12}
          tick={{ fill: p.axis }}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          yAxisId="amount"
          orientation="right"
          fontSize={12}
          tick={{ fill: p.axis }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(value: number) =>
            Math.abs(value) >= 10000
              ? `${Math.round(value / 10000)}万`
              : String(value)
          }
        />
        <Tooltip contentStyle={p.tooltip} />
        <Legend wrapperStyle={{ color: p.axis, fontSize: 12 }} />
        <Line
          yAxisId="count"
          type="monotone"
          dataKey="count"
          name="商机数"
          stroke={p.ink}
          strokeWidth={2}
          dot={{ fill: p.ink, r: 3 }}
        />
        <Line
          yAxisId="amount"
          type="monotone"
          dataKey="amount"
          name="预计金额"
          stroke={p.brass}
          strokeWidth={2}
          dot={{ fill: p.brass, r: 3 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

/**
 * 等级 → 颜色。
 *
 * 必须按等级语义取色，不能按数组下标：数据顺序由查询决定，
 * 一旦顺序变化，颜色就会错位到别的等级上，"高价值最重"就不成立了。
 */
function levelColor(level: string, p: ChartPalette): string {
  switch (level) {
    case "HIGH":
      return p.pie[0];
    case "MEDIUM":
      return p.pie[1];
    case "LOW":
      return p.pie[2];
    default:
      return p.pie[3];
  }
}

/**
 * 客户等级分布：完整环形 + 中心总量。
 * 半圆环只画一半、没有总数，读起来像占位图；完整环加中心数字才是一张图。
 */
export function LevelChart({ data }: { data: LevelDatum[] }) {
  const p = usePalette();
  const total = data.reduce((sum, item) => sum + item.count, 0);

  return (
    <div className="relative">
      <ResponsiveContainer width="100%" height={260}>
        <PieChart>
          <Pie
            data={data}
            dataKey="count"
            nameKey="label"
            cx="50%"
            cy="50%"
            innerRadius={58}
            outerRadius={92}
            paddingAngle={2}
            strokeWidth={0}
          >
            {data.map((entry) => (
              <Cell key={entry.level} fill={levelColor(entry.level, p)} />
            ))}
          </Pie>
          <Tooltip contentStyle={p.tooltip} />
          <Legend
            verticalAlign="bottom"
            iconType="circle"
            wrapperStyle={{ fontSize: 12, color: p.axis }}
          />
        </PieChart>
      </ResponsiveContainer>

      {/* 中心总量：环心留白填上有意义的信息，而不是让它空着 */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex h-[200px] flex-col items-center justify-center">
        <span className="num-stat text-ink">{total}</span>
        <span className="mt-1 text-[11px] text-ink-faint">位客户</span>
      </div>
    </div>
  );
}
