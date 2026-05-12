import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { CreateAccountForm } from "./create-account-form"

export default async function CreateAccountPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect("/auth/login")

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single()

  if (profile?.role !== "hq_admin") {
    redirect("/dashboard")
  }

  const { data: regions } = await supabase
    .from("regions")
    .select("id, name")
    .order("name")

  const { data: branches } = await supabase
    .from("branches")
    .select("id, name, region_id")
    .order("name")

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Create account</h1>
        <p className="text-muted-foreground mt-1">
          Add a user by email. Choose HQ Admin, Region Admin, or Branch User. They will receive a temporary password in their email and can sign in immediately.
        </p>
      </div>

      <CreateAccountForm regions={regions ?? []} branches={branches ?? []} />
    </div>
  )
}
