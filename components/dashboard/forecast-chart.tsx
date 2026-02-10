"use client"

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts"
import { type ForecastResult, getShortMonthName, formatCurrency } from "@/lib/forecasting"

type ForecastChartProps = {
  forecasts: ForecastResult[]
  currentMonth: number
}

export function ForecastChart({ forecasts, currentMonth }: ForecastChartProps) {
  // Aggregate data by month
  const monthlyData = Array.from({ length: 12 }, (_, i) => {
    const month = i + 1
    const monthForecasts = forecasts.filter(f => f.month === month)
    
    return {
      month: getShortMonthName(month),
      forecast: monthForecasts.reduce((sum, f) => sum + f.forecastValue, 0),
      budget: monthForecasts.reduce((sum, f) => sum + f.budgetValue, 0),
      lastYear: monthForecasts.reduce((sum, f) => sum + f.lastYearValue, 0),
    }
  })

  return (
    <div className="h-[400px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={monthlyData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
          <XAxis 
            dataKey="month" 
            className="text-xs"
            tick={{ fill: "hsl(var(--muted-foreground))" }}
          />
          <YAxis 
            className="text-xs"
            tick={{ fill: "hsl(var(--muted-foreground))" }}
            tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "hsl(var(--card))",
              borderColor: "hsl(var(--border))",
              borderRadius: "var(--radius)",
            }}
            labelStyle={{ color: "hsl(var(--foreground))" }}
            formatter={(value: number) => [formatCurrency(value), ""]}
          />
          <Legend />
          <ReferenceLine
            x={getShortMonthName(currentMonth)}
            stroke="hsl(var(--muted-foreground))"
            strokeDasharray="5 5"
            label={{ value: "Current", position: "top", fill: "hsl(var(--muted-foreground))" }}
          />
          <Line
            type="monotone"
            dataKey="forecast"
            name="Forecast"
            stroke="hsl(var(--primary))"
            strokeWidth={2}
            dot={{ fill: "hsl(var(--primary))", strokeWidth: 2 }}
            activeDot={{ r: 6 }}
          />
          <Line
            type="monotone"
            dataKey="budget"
            name="Budget"
            stroke="hsl(var(--accent))"
            strokeWidth={2}
            strokeDasharray="5 5"
            dot={{ fill: "hsl(var(--accent))", strokeWidth: 2 }}
          />
          <Line
            type="monotone"
            dataKey="lastYear"
            name="Last Year"
            stroke="hsl(var(--muted-foreground))"
            strokeWidth={1}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
