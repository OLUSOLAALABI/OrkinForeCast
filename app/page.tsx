import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import Image from "next/image"
import { BarChart3, Database, LineChart, Shield, Building2, Users } from "lucide-react"

export default function HomePage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <Image src="/orkinlogo.png" alt="Orkin" width={120} height={36} className="h-9 w-auto" priority />
          <div className="flex items-center gap-4">
            <Link href="/auth/login">
              <Button variant="ghost">Sign in</Button>
            </Link>
            <Link href="/auth/sign-up">
              <Button>Get Started</Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="container mx-auto px-4 py-24 text-center">
        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-foreground max-w-4xl mx-auto text-balance">
          Orkin - Branch Forecasting Made Simple
        </h1>
        <p className="mt-6 text-lg text-muted-foreground max-w-2xl mx-auto text-pretty">
          Three-year branch data is pre-loaded. Sign in to generate and view monthly forecasts for 2026. 
          Role-based access ensures the right people see the right data.
        </p>
        <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link href="/auth/sign-up">
            <Button size="lg" className="text-lg px-8">
              Start Forecasting
            </Button>
          </Link>
          <Link href="/auth/login">
            <Button size="lg" variant="outline" className="text-lg px-8 bg-transparent">
              Sign In
            </Button>
          </Link>
        </div>
      </section>

      {/* Features Section */}
      <section className="container mx-auto px-4 py-16">
        <h2 className="text-3xl font-bold text-center mb-12">Key Features</h2>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          <Card>
            <CardHeader>
              <div className="rounded-full bg-primary/10 p-3 w-fit mb-2">
                <Database className="h-6 w-6 text-primary" />
              </div>
              <CardTitle>Pre-loaded Branch Data</CardTitle>
              <CardDescription>
                Three years of actuals per branch are already in the system. Generate forecasts without uploading files.
              </CardDescription>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader>
              <div className="rounded-full bg-accent/10 p-3 w-fit mb-2">
                <LineChart className="h-6 w-6 text-accent" />
              </div>
              <CardTitle>Smart Forecasting</CardTitle>
              <CardDescription>
                Generate accurate monthly forecasts using seasonal patterns and trend analysis
              </CardDescription>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader>
              <div className="rounded-full bg-primary/10 p-3 w-fit mb-2">
                <Shield className="h-6 w-6 text-primary" />
              </div>
              <CardTitle>Role-Based Access</CardTitle>
              <CardDescription>
                Three-tier access control: HQ Admins, Region Admins, and Branch Users
              </CardDescription>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader>
              <div className="rounded-full bg-accent/10 p-3 w-fit mb-2">
                <Building2 className="h-6 w-6 text-accent" />
              </div>
              <CardTitle>Branch Management</CardTitle>
              <CardDescription>
                Organize branches by region with detailed performance tracking and comparisons
              </CardDescription>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader>
              <div className="rounded-full bg-primary/10 p-3 w-fit mb-2">
                <Users className="h-6 w-6 text-primary" />
              </div>
              <CardTitle>Team Collaboration</CardTitle>
              <CardDescription>
                Multiple users can view and generate forecasts based on their access level
              </CardDescription>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader>
              <div className="rounded-full bg-accent/10 p-3 w-fit mb-2">
                <BarChart3 className="h-6 w-6 text-accent" />
              </div>
              <CardTitle>Visual Analytics</CardTitle>
              <CardDescription>
                Interactive charts and tables to visualize forecasts, budgets, and variances
              </CardDescription>
            </CardHeader>
          </Card>
        </div>
      </section>

      {/* Access Levels Section */}
      <section className="container mx-auto px-4 py-16">
        <h2 className="text-3xl font-bold text-center mb-4">Access Levels</h2>
        <p className="text-muted-foreground text-center mb-12 max-w-2xl mx-auto">
          Our hierarchical access system ensures data security while enabling collaboration
        </p>
        <div className="grid gap-6 md:grid-cols-3 max-w-4xl mx-auto">
          <Card className="border-primary/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-primary" />
                HQ Admin
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li>Access all branches and regions</li>
                <li>View company-wide forecasts</li>
                <li>Manage users and permissions</li>
                <li>Configure system settings</li>
              </ul>
            </CardContent>
          </Card>

          <Card className="border-accent/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5 text-accent" />
                Region Admin
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li>Access all branches in region</li>
                <li>View regional forecasts</li>
                <li>View and generate forecasts for any branch in region</li>
                <li>Monitor regional performance</li>
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5" />
                Branch User
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li>Access own branch only</li>
                <li>Generate and view branch forecasts</li>
                <li>Generate branch forecasts</li>
                <li>View branch performance</li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* CTA Section */}
      <section className="container mx-auto px-4 py-24 text-center">
        <Card className="bg-primary/5 border-primary/20 max-w-3xl mx-auto">
          <CardContent className="py-12">
            <h2 className="text-3xl font-bold mb-4">Ready to Start Forecasting?</h2>
            <p className="text-muted-foreground mb-8 max-w-xl mx-auto">
              Create an account and start generating forecasts today. 
              Generate accurate forecasts for your branches in minutes.
            </p>
            <Link href="/auth/sign-up">
              <Button size="lg" className="text-lg px-8">
                Create Your Account
              </Button>
            </Link>
          </CardContent>
        </Card>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-8">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
          <p>Orkin - Monthly forecasts for 2026</p>
        </div>
      </footer>
    </div>
  )
}
