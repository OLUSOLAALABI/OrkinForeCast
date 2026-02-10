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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Create account</h1>
        <p className="text-muted-foreground mt-1">
          Invite an HQ Admin or Region Admin by email. They will get the correct access when they sign in.
        </p>
      </div>

      <CreateAccountForm regions={regions ?? []} />
    </div>
  )
}
