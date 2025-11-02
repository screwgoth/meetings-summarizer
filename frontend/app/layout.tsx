import './globals.css'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Meeting Transcription App',
  description: 'AI-powered meeting transcription and analysis',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}