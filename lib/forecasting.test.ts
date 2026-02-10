import { describe, it, expect } from "vitest"
import {
  generateForecast,
  generateBranchForecasts,
  formatCurrency,
  formatPercent,
  getMonthName,
  getShortMonthName,
  type ForecastInput,
} from "./forecasting"

describe("generateForecast", () => {
  it("returns 12 results per description", () => {
    const input: ForecastInput = {
      description: "Revenue",
      lastYearData: [100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100],
      currentYearData: [110, 105, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      budgetData: [120, 120, 120, 120, 120, 120, 120, 120, 120, 120, 120, 120],
      currentMonth: 3,
    }
    const results = generateForecast(input)
    expect(results).toHaveLength(12)
    results.forEach((r, i) => {
      expect(r.month).toBe(i + 1)
      expect(r.description).toBe("Revenue")
    })
  })

  it("uses actual data for past months (month <= currentMonth)", () => {
    const input: ForecastInput = {
      description: "Revenue",
      lastYearData: [100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100],
      currentYearData: [50, 60, 70, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      budgetData: [100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100],
      currentMonth: 3,
    }
    const results = generateForecast(input)
    expect(results[0].forecastValue).toBe(50)
    expect(results[1].forecastValue).toBe(60)
    expect(results[2].forecastValue).toBe(70)
  })

  it("computes forecast for future months", () => {
    const input: ForecastInput = {
      description: "Revenue",
      lastYearData: [100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100],
      currentYearData: [100, 100, 100, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      budgetData: [100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100],
      currentMonth: 3,
    }
    const results = generateForecast(input)
    expect(results[3].forecastValue).toBeGreaterThan(0)
    expect(results[11].forecastValue).toBeGreaterThan(0)
  })

  it("handles all-zero last year (no division by zero)", () => {
    const input: ForecastInput = {
      description: "New",
      lastYearData: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      currentYearData: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      budgetData: [10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10],
      currentMonth: 1,
    }
    const results = generateForecast(input)
    expect(results).toHaveLength(12)
    expect(results[0].forecastValue).toBe(0)
  })

  it("rounds forecastValue and variance to 2 decimals", () => {
    const input: ForecastInput = {
      description: "Revenue",
      lastYearData: [100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100],
      currentYearData: [100, 100, 100, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      budgetData: [100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100],
      currentMonth: 3,
    }
    const results = generateForecast(input)
    results.forEach((r) => {
      expect(Number.isInteger(r.forecastValue * 100)).toBe(true)
      expect(Number.isInteger(r.variance * 100)).toBe(true)
    })
  })
})

describe("generateBranchForecasts", () => {
  it("groups by description and produces 12 months per description", () => {
    const actualsData = [
      { description: "Revenue", month: 1, year: 2024, value: 100 },
      { description: "Revenue", month: 2, year: 2024, value: 100 },
      { description: "Revenue", month: 1, year: 2025, value: 110 },
      { description: "Costs", month: 1, year: 2024, value: 50 },
      { description: "Costs", month: 1, year: 2025, value: 55 },
    ]
    const budgetData = [
      { description: "Revenue", month: 1, value: 120 },
      { description: "Costs", month: 1, value: 60 },
    ]
    const results = generateBranchForecasts(
      actualsData,
      budgetData,
      2025,
      1
    )
    const descriptions = [...new Set(results.map((r) => r.description))]
    expect(descriptions.sort()).toEqual(["Costs", "Revenue"])
    expect(results.filter((r) => r.description === "Revenue")).toHaveLength(12)
    expect(results.filter((r) => r.description === "Costs")).toHaveLength(12)
  })
})

describe("formatCurrency", () => {
  it("formats as CAD with no decimals", () => {
    expect(formatCurrency(1234.56)).toMatch(/\$1,235|1,234/)
    expect(formatCurrency(0)).toBe("$0")
  })
})

describe("formatPercent", () => {
  it("includes + for non-negative and no + for negative", () => {
    expect(formatPercent(5)).toContain("+")
    expect(formatPercent(-3)).not.toContain("+")
    expect(formatPercent(0)).toContain("+")
  })
  it("formats to one decimal", () => {
    expect(formatPercent(10.456)).toMatch(/10\.5/)
  })
})

describe("getMonthName", () => {
  it("returns full month name for 1-12", () => {
    expect(getMonthName(1)).toBe("January")
    expect(getMonthName(12)).toBe("December")
    expect(getMonthName(6)).toBe("June")
  })
  it("returns empty string for out of range", () => {
    expect(getMonthName(0)).toBe("")
    expect(getMonthName(13)).toBe("")
  })
})

describe("getShortMonthName", () => {
  it("returns short month name for 1-12", () => {
    expect(getShortMonthName(1)).toBe("Jan")
    expect(getShortMonthName(12)).toBe("Dec")
  })
  it("returns empty string for out of range", () => {
    expect(getShortMonthName(0)).toBe("")
  })
})
