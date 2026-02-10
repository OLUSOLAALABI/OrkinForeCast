import React from "react"
import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import { AuthHashHandler } from '@/components/auth/auth-hash-handler'
import './globals.css'

const _geist = Geist({ subsets: ["latin"] });
const _geistMono = Geist_Mono({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: 'Orkin',
  description: 'Orkin - Monthly forecasting application for branch, region, and headquarters management',
  icons: {
    icon: '/orkinlogo.png',
    apple: '/orkinlogo.png',
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body className={`font-sans antialiased`}>
        <AuthHashHandler />
        {children}
        <Analytics />
      </body>
    </html>
  )
}
