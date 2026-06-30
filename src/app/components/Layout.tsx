import { Outlet } from '@tanstack/react-router'
import Sidebar from './Sidebar'

function Layout() {
  return (
    <div className="flex h-screen flex-col overflow-hidden sm:bg-surface-bg">
      <main className="grid flex-1 grid-cols-1 overflow-hidden sm:grid-cols-[auto_1fr]">
        <Sidebar />
        <div className="overflow-hidden sm:px-[15px] sm:py-3">
          <div className="flex h-full flex-col overflow-hidden rounded-xl bg-primary-background">
            <Outlet />
          </div>
        </div>
      </main>
    </div>
  )
}

export default Layout
