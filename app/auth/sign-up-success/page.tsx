import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import Image from "next/image"
import { Mail } from "lucide-react"
import Link from "next/link"
import { ResendConfirmationForm } from "@/components/auth/resend-confirmation-form"

type Props = { searchParams: Promise<{ email?: string }> }

export default async function SignUpSuccessPage({ searchParams }: Props) {
  const { email: emailFromUrl } = await searchParams
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md text-center">
        <CardHeader>
          <div className="flex justify-center mb-4">
            <Image src="/orkinlogo.png" alt="Orkin" width={140} height={40} className="h-10 w-auto" priority />
          </div>
          <div className="flex justify-center mb-4">
            <div className="rounded-full bg-accent/10 p-3">
              <Mail className="h-8 w-8 text-accent" />
            </div>
          </div>
          <CardTitle className="text-2xl">Check your email</CardTitle>
          <CardDescription>
            We&apos;ve sent you a confirmation link to verify your account
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Please check your inbox and click the confirmation link to complete your registration.
            After confirming, you can sign in to access your dashboard.
          </p>
          <ResendConfirmationForm initialEmail={emailFromUrl ?? ""} />
          <Button asChild className="w-full">
            <Link href="/auth/login">Back to Sign In</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
