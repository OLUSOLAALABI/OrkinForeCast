import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !key) {
    return NextResponse.json(
      {
        ok: false,
        error: "Missing env: NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY",
      },
      { status: 500 }
    )
  }

  try {
    const supabase = createClient(url, key)

    // Test 1: Auth / API reachable
    const { error: authError } = await supabase.auth.getSession()

    if (authError) {
      return NextResponse.json({
        ok: false,
        error: "Supabase auth unreachable or invalid key",
        detail: authError.message,
      })
    }

    // Test 2: Try to read regions (fails if schema not run)
    const { data, error } = await supabase
      .from("regions")
      .select("id")
      .limit(1)

    if (error) {
      return NextResponse.json({
        ok: true,
        connection: "OK",
        schema: "Not run or RLS blocking",
        hint: "Run scripts/001_create_schema.sql in Supabase SQL Editor",
        detail: error.message,
      })
    }

    return NextResponse.json({
      ok: true,
      connection: "OK",
      schema: "OK",
      regionsCount: data?.length ?? 0,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json(
      { ok: false, error: "Connection failed", detail: message },
      { status: 500 }
    )
  }
}
