import type { ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { TopBar } from './TopBar'
import { LeftRail } from './LeftRail'

export function AppShell({ children }: { children: ReactNode }) {
 const location = useLocation()

 return (
  <div className="flex h-full flex-col">
   <TopBar />
   <div className="flex min-h-0 flex-1">
    <LeftRail />
    <main key={location.pathname} className="fade-in min-w-0 flex-1 overflow-y-auto px-4 py-3.5">
     <div className="mx-auto max-w-[1600px]">{children}</div>
    </main>
   </div>
  </div>
 )
}

