import type { Metadata } from 'next'
import { Geist } from 'next/font/google'
import './globals.css'
import { SoftphoneProvider } from '@/lib/SoftphoneContext'
import Sidebar from '@/components/Sidebar'
import InboundAlert from '@/components/InboundAlert'

const geist = Geist({ subsets: ['latin'], variable: '--font-geist' })

export const metadata: Metadata = {
  title: 'Dialer',
  description: 'SwiftPath Dialer',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geist.variable} h-full`}>
      <body className="h-full bg-gray-900 text-white antialiased">
        <SoftphoneProvider>
          <div className="flex h-full">
            <Sidebar />
            <main className="flex-1 overflow-auto">{children}</main>
          </div>
          <InboundAlert />
        </SoftphoneProvider>
      </body>
    </html>
  )
}
