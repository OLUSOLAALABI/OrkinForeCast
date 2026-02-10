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

// Get month name
export function getMonthName(month: number): string {
  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ]
  return months[month - 1] || ""
}

// Get short month name
export function getShortMonthName(month: number): string {
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
  return months[month - 1] || ""
}
