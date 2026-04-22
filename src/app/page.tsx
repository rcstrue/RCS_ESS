'use client'

import dynamic from 'next/dynamic'

const ExpensesPage = dynamic(() => import('./expenses-page'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center min-h-screen">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
    </div>
  ),
})

export default function Home() {
  return (
    <ExpensesPage
      userRole="manager"
      userId={123}
      userName="Demo Manager"
      userUnitId={5}
      userEmpCode="MGR001"
      managerId={100}
    />
  )
}
