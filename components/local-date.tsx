"use client"

export function LocalDate({ date }: { date: string }) {
  return <>{new Date(date).toLocaleString()}</>
}
