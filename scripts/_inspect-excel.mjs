import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const XLSX = require('xlsx')

const wb = XLSX.readFile('branchData/last_month/03-2026 Total Company P&L.xlsm')
console.log('Sheets:', wb.SheetNames.join(', '))

const ws = wb.Sheets['ORKIN CANADA']
if (!ws) { console.log('No ORKIN CANADA sheet'); process.exit(1) }

const d = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
console.log('Rows:', d.length, 'Cols:', d[0]?.length)

// Print first 8 rows (headers)
for (let i = 0; i < 8; i++) {
  console.log(`R${i}:`, JSON.stringify((d[i] || []).slice(0, 25)))
}

// Find the description column and month header row
// Look for a row containing month names or 'JANUARY', 'FEBRUARY', etc.
for (let i = 0; i < 15; i++) {
  const row = d[i] || []
  const str = row.map(c => String(c).toUpperCase()).join('|')
  if (str.includes('JAN') || str.includes('REVENUE') || str.includes('PEST')) {
    console.log(`\nPotential header/data row ${i}:`, JSON.stringify(row.slice(0, 25)))
  }
}

// Print rows 15-30 to see data layout
console.log('\n--- Data rows 15-30 ---')
for (let i = 15; i < 30; i++) {
  const row = d[i] || []
  console.log(`R${i}:`, JSON.stringify(row.slice(0, 25)))
}

// Look for column T onwards (col index 19+) in the first few rows
console.log('\n--- Cols T+ (idx 19+) in rows 0-10 ---')
for (let i = 0; i < 10; i++) {
  const row = d[i] || []
  if (row.length > 19) {
    console.log(`R${i} cols T+:`, JSON.stringify(row.slice(19, 35)))
  }
}
