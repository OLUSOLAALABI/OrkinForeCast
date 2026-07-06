// Forecasting utilities ported from Python script
// This implements the forecasting logic for monthly predictions

export type ForecastInput = {
  description: string
  lastYearData: number[] // 12 months of previous year
  currentYearData: number[] // Current year data up to current month
  budgetData: number[] // 12 months of budget
  currentMonth: number // 1-12
}

export type ForecastResult = {
  description: string
  month: number
  forecastValue: number
  budgetValue: number
  actualValue?: number
  lastMonthValue: number
  lastYearValue: number
  variance: number
  variancePercent: number
}

// Calculate seasonal index based on historical data
function calculateSeasonalIndex(monthlyData: number[]): number[] {
  const total = monthlyData.reduce((a, b) => a + b, 0)
  if (total === 0) return new Array(12).fill(1 / 12)
  
  return monthlyData.map(value => (value / total) * 12)
}

// Calculate trend factor comparing current year to last year
function calculateTrendFactor(currentYTD: number[], lastYearYTD: number[]): number {
  const currentTotal = currentYTD.reduce((a, b) => a + b, 0)
  const lastYearTotal = lastYearYTD.reduce((a, b) => a + b, 0)
  
  if (lastYearTotal === 0) return 1
  return currentTotal / lastYearTotal
}

// Calculate weighted average of recent months
function calculateWeightedAverage(data: number[], weights: number[]): number {
  let sum = 0
  let weightSum = 0
  
  for (let i = 0; i < Math.min(data.length, weights.length); i++) {
    sum += data[i] * weights[i]
    weightSum += weights[i]
  }
  
  return weightSum > 0 ? sum / weightSum : 0
}

// Main forecasting function
export function generateForecast(input: ForecastInput): ForecastResult[] {
  const results: ForecastResult[] = []
  const { description, lastYearData, currentYearData, budgetData, currentMonth } = input
  
  // Calculate seasonal indices from last year
  const seasonalIndices = calculateSeasonalIndex(lastYearData)
  
  // Calculate year-to-date totals for trend
  const currentYTD = currentYearData.slice(0, currentMonth)
  const lastYearYTD = lastYearData.slice(0, currentMonth)
  const trendFactor = calculateTrendFactor(currentYTD, lastYearYTD)
  
  // Calculate average monthly value from current year
  const avgCurrentMonth = currentYTD.length > 0 
    ? currentYTD.reduce((a, b) => a + b, 0) / currentYTD.length 
    : 0
  
  // Weights for recent months (more weight to recent data)
  const weights = [0.4, 0.3, 0.2, 0.1]
  
  // Generate forecasts for remaining months
  for (let month = 1; month <= 12; month++) {
    const lastYearValue = lastYearData[month - 1] || 0
    const budgetValue = budgetData[month - 1] || 0
    
    let forecastValue: number
    
    if (month <= currentMonth) {
      // For past months, use actual data
      forecastValue = currentYearData[month - 1] || 0
    } else {
      // For future months, calculate forecast
      // Method 1: Seasonal adjustment of last year
      const seasonalForecast = lastYearValue * trendFactor
      
      // Method 2: Weighted average adjusted for seasonality
      const recentMonths = currentYearData.slice(Math.max(0, currentMonth - 4), currentMonth)
      const weightedAvg = calculateWeightedAverage(recentMonths.reverse(), weights)
      const seasonalAdjusted = weightedAvg * seasonalIndices[month - 1]
      
      // Method 3: Budget with trend adjustment
      const budgetAdjusted = budgetValue * trendFactor
      
      // Blend methods (40% seasonal, 30% weighted, 30% budget)
      forecastValue = (seasonalForecast * 0.4) + (seasonalAdjusted * 0.3) + (budgetAdjusted * 0.3)
      
      // Apply reasonable bounds (not more than 2x or less than 0.5x of budget)
      if (budgetValue > 0) {
        forecastValue = Math.max(budgetValue * 0.5, Math.min(budgetValue * 2, forecastValue))
      }
    }
    
    const lastMonthValue = month > 1 
      ? (month <= currentMonth ? currentYearData[month - 2] : lastYearData[month - 2])
      : lastYearData[11]
    
    const variance = forecastValue - budgetValue
    const variancePercent = budgetValue !== 0 ? (variance / budgetValue) * 100 : 0
    
    results.push({
      description,
      month,
      forecastValue: Math.round(forecastValue * 100) / 100,
      budgetValue,
      lastMonthValue,
      lastYearValue,
      variance: Math.round(variance * 100) / 100,
      variancePercent: Math.round(variancePercent * 100) / 100,
    })
  }
  
  return results
}

// Aggregate forecasts for multiple descriptions
export function generateBranchForecasts(
  actualsData: { description: string; month: number; year: number; value: number }[],
  budgetData: { description: string; month: number; value: number }[],
  currentYear: number,
  currentMonth: number
): ForecastResult[] {
  // Group data by description
  const descriptions = [...new Set(actualsData.map(d => d.description))]
  const allResults: ForecastResult[] = []
  
  for (const description of descriptions) {
    // Get last year data
    const lastYearData = new Array(12).fill(0)
    actualsData
      .filter(d => d.description === description && d.year === currentYear - 1)
      .forEach(d => { lastYearData[d.month - 1] = d.value })
    
    // Get current year data
    const currentYearData = new Array(12).fill(0)
    actualsData
      .filter(d => d.description === description && d.year === currentYear)
      .forEach(d => { currentYearData[d.month - 1] = d.value })
    
    // Get budget data
    const budget = new Array(12).fill(0)
    budgetData
      .filter(d => d.description === description)
      .forEach(d => { budget[d.month - 1] = d.value })
    
    const forecasts = generateForecast({
      description,
      lastYearData,
      currentYearData,
      budgetData: budget,
      currentMonth,
    })
    
    allResults.push(...forecasts)
  }
  
  return allResults
}

// Format currency for display
export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "CAD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value)
}

// Format percentage for display
export function formatPercent(value: number): string {
  const sign = value >= 0 ? "+" : ""
  return `${sign}${value.toFixed(1)}%`
}

/**
 * Returns true if the description looks like a subtotal/total line
 */
export function isSubtotalDescription(desc: string | null | undefined): boolean {
  if (!desc) return false
  const d = desc.toUpperCase()
  return (
    d.includes("TOTAL") ||
    d.includes("SUBTOTAL") ||
    d.includes("SUB TOTAL") ||
    d.includes("PROFIT") ||
    d.includes("CONTRIBUTION") ||
    d.includes("B/4 OVERHEAD") ||
    d.includes("NET CONTRACT")
  )
}

/**
 * Returns true if the description is a leaf node (not a subtotal)
 */
export function isLeafDescription(desc: string | null | undefined): boolean {
  if (!desc) return false
  return !isSubtotalDescription(desc)
}

// Get month name
export function getMonthName(month: number): string {
  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ]
  return months[month - 1] || ""
}

// Get short month name
// Normalize description for comparison
export function normDesc(s: string): string {
  return String(s ?? "").toUpperCase().replace(/\s+/g, " ").trim()
}

export function isRevenueLine(description: string): boolean {
  const d = normDesc(description)
  return d === "TOTAL NET REVENUE" || d.includes("REVENUE")
}

export function isExpenseLine(description: string): boolean {
  const d = normDesc(description)
  return !d.includes("REVENUE")
}

export function getShortMonthName(month: number): string {
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
  return months[month - 1] || ""
}

/**
 * Calculates the number of working days (Mon-Fri) in Ontario, Canada
 * for any given year and month, taking into account statutory public holidays
 * and weekend observations.
 */
export function getOntarioWorkingDays(year: number, month: number): number {
  // Helper to get Easter Sunday using Meeus/Jones/Butcher algorithm
  function getEasterSunday(y: number): Date {
    const a = y % 19
    const b = Math.floor(y / 100)
    const c = y % 100
    const d = Math.floor(b / 4)
    const e = b % 4
    const f = Math.floor((b + 8) / 25)
    const g = Math.floor((b - f + 1) / 3)
    const h = (19 * a + b - d - g + 15) % 30
    const i = Math.floor(c / 4)
    const k = c % 4
    const l = (32 + 2 * e + 2 * i - h - k) % 7
    const m = Math.floor((a + 11 * h + 22 * l) / 451)
    const monthIndex = Math.floor((h + l - 7 * m + 114) / 31)
    const day = ((h + l - 7 * m + 114) % 31) + 1
    return new Date(y, monthIndex - 1, day)
  }

  // Good Friday is 2 days before Easter Sunday
  const easter = getEasterSunday(year)
  const goodFriday = new Date(easter)
  goodFriday.setDate(easter.getDate() - 2)

  // 3rd Monday in Feb (Family Day)
  const feb1 = new Date(year, 1, 1)
  const feb1Day = feb1.getDay()
  const firstMondayInFeb = 1 + (8 - feb1Day) % 7
  const familyDay = new Date(year, 1, firstMondayInFeb + 14)

  // Victoria Day: Monday preceding May 25 (May 24 or earlier)
  const may25 = new Date(year, 4, 25)
  const may25Day = may25.getDay()
  const victoriaDay = new Date(year, 4, 25 - (may25Day === 0 ? 6 : (may25Day - 1 || 7)))

  // Canada Day: July 1. If Sunday, observed Monday July 2
  let canadaDay = new Date(year, 6, 1)
  if (canadaDay.getDay() === 0) {
    canadaDay = new Date(year, 6, 2)
  }

  // Labour Day: 1st Monday in Sept
  const sept1 = new Date(year, 8, 1)
  const sept1Day = sept1.getDay()
  const labourDay = new Date(year, 8, 1 + (8 - sept1Day) % 7)

  // Thanksgiving Day: 2nd Monday in Oct
  const oct1 = new Date(year, 9, 1)
  const oct1Day = oct1.getDay()
  const thanksgivingDay = new Date(year, 9, 1 + (8 - oct1Day) % 7 + 7)

  // Christmas Day & Boxing Day weekend observation
  // Christmas = Dec 25, Boxing Day = Dec 26
  let christmas = new Date(year, 11, 25)
  let boxingDay = new Date(year, 11, 26)

  const xmasDayOfWeek = christmas.getDay() // 0 = Sun, 5 = Fri, 6 = Sat
  if (xmasDayOfWeek === 5) {
    // Friday Christmas, Saturday Boxing Day -> observed Monday Dec 28
    boxingDay = new Date(year, 11, 28)
  } else if (xmasDayOfWeek === 6) {
    // Saturday Christmas, Sunday Boxing Day -> observed Mon Dec 27, Tue Dec 28
    christmas = new Date(year, 11, 27)
    boxingDay = new Date(year, 11, 28)
  } else if (xmasDayOfWeek === 0) {
    // Sunday Christmas, Monday Boxing Day -> observed Mon Dec 26, Tue Dec 27
    christmas = new Date(year, 11, 26)
    boxingDay = new Date(year, 11, 27)
  }

  const holidayDates = new Set([
    `${year}-01-01`, // New Year's Day (Jan 1)
    `${year}-02-${String(familyDay.getDate()).padStart(2, "0")}`,
    `${year}-04-${String(goodFriday.getDate()).padStart(2, "0")}`,
    `${year}-05-${String(victoriaDay.getDate()).padStart(2, "0")}`,
    `${year}-07-${String(canadaDay.getDate()).padStart(2, "0")}`,
    `${year}-09-${String(labourDay.getDate()).padStart(2, "0")}`,
    `${year}-10-${String(thanksgivingDay.getDate()).padStart(2, "0")}`,
    `${year}-12-${String(christmas.getDate()).padStart(2, "0")}`,
    `${year}-12-${String(boxingDay.getDate()).padStart(2, "0")}`,
  ])

  // New Year's Day observation: if Jan 1 is Saturday or Sunday, observe next Monday (usually Jan 2 or Jan 3)
  const newYears = new Date(year, 0, 1)
  if (newYears.getDay() === 0) {
    holidayDates.add(`${year}-01-02`)
  } else if (newYears.getDay() === 6) {
    holidayDates.add(`${year}-01-03`)
  }

  let workingDays = 0
  const daysInMonth = new Date(year, month, 0).getDate()
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month - 1, d)
    const dayOfWeek = date.getDay()
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6

    const formattedDate = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`

    if (!isWeekend && !holidayDates.has(formattedDate)) {
      workingDays++
    }
  }

  return workingDays
}

