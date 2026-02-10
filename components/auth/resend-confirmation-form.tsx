"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Loader2 } from "lucide-react"

type Props = { initialEmail?: string }

export function ResendConfirmationForm({ initialEmail = "" }: Props) {
  const [email, setEmail] = useState(initialEmail)
  const [loading, setLoading] = useState(false)
  useEffect(() => {
    if (initialEmail) setEmail(initialEmail)
  }, [initialEmail])
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null)

  const handleResend = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim()) return
    setLoading(true)
    setMessage(null)
    const supabase = createClient()
    const { error } = await supabase.auth.resend({ type: "signup", email: email.trim() })
    setLoading(false)
    if (error) {
      setMessage({ type: "error", text: error.message })
      return
    }
    setMessage({ type: "success", text: "Confirmation email sent. Check your inbox." })
  }

  return (
    <form onSubmit={handleResend} className="space-y-3 pt-2 border-t border-border">
      <p className="text-sm text-muted-foreground">Didn&apos;t receive the email?</p>
      <div className="flex gap-2">
        <div className="flex-1 space-y-1">
          <Label htmlFor="resend-email" className="sr-only">Email</Label>
          <Input
            id="resend-email"
            type="email"
            placeholder="your@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            disabled={loading}
            className="h-9"
          />
        </div>
        <Button type="submit" variant="secondary" size="sm" disabled={loading} className="shrink-0">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Resend"}
        </Button>
      </div>
      {message && (
        <p className={`text-sm ${message.type === "success" ? "text-green-600 dark:text-green-400" : "text-destructive"}`}>
          {message.text}
        </p>
      )}
    </form>
  )
}
