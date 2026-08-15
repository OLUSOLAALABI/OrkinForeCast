export const DUPLICATE_RENAMES = {
  "COMMERCIAL BED BUG REVENUE": { first: "COMMERCIAL BED BUG REVENUE (recur)", second: "COMMERCIAL BED BUG REVENUE" },
  "DEPRECIATION": { first: "DEPRECIATION", second: "DEPRECIATION (fixed)" },
}

const DIRECT_CANONICAL_NAMES = {
  "COMMERCIAL BED BUG REVENUE (RECUR)": "COMMERCIAL BED BUG REVENUE (recur)",
  "COMMERCIAL BED BUG REVENUE (ODD JOB)": "COMMERCIAL BED BUG REVENUE",
  "DEPRECIATION (FIXED)": "DEPRECIATION (fixed)",
}

const DESCRIPTION_NORMALIZE = {
  "PAYROLL SERVICE FEES": "ULTIPRO COST",
  "ADMIN INCENTIVE PAID": "MANAGERS INCENTIVES PAID",
  "PC MGMT FAILURE": "PC COMM MGMT FAILURE",
  "ULTIPRO FEES": "ULTIPRO COST",
}

export function normalizeDescription(rawDescription, seenDescriptions = new Map()) {
  let description = String(rawDescription ?? "").trim()
  if (!description) return description

  const direct = DIRECT_CANONICAL_NAMES[description.toUpperCase()]
  if (direct) return direct

  const normalized = DESCRIPTION_NORMALIZE[description.toUpperCase()]
  if (normalized) description = normalized

  const upperDescription = description.toUpperCase()
  const rename = DUPLICATE_RENAMES[upperDescription]
  if (!rename) return description

  const count = (seenDescriptions.get(upperDescription) || 0) + 1
  seenDescriptions.set(upperDescription, count)
  return count === 1 ? rename.first : rename.second
}
