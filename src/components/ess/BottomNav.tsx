'use client';

import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Separator } from '@/components/ui/separator';
import { ChevronRight, LogOut } from 'lucide-react';
import { NAV_ITEMS, MORE_MENU_ITEMS } from './constants';

// ══════════════════════════════════════════════════════════════
// Bottom Navigation Bar
// ══════════════════════════════════════════════════════════════

interface BottomNavProps {
  currentPage: string;
  showMoreMenu: boolean;
  setShowMoreMenu: (open: boolean) => void;
  onNavigate: (page: string) => void;
}

export default function BottomNav({ currentPage, showMoreMenu, setShowMoreMenu, onNavigate }: BottomNavProps) {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t safe-area-bottom">
      <div className="flex items-center justify-around h-16 max-w-lg mx-auto px-2">
        {NAV_ITEMS.map((item) => {
          const isActive = item.key === '_more'
            ? !['dashboard', 'directory', 'expenses'].includes(currentPage)
            : item.key === currentPage;

          if (item.key === '_more') {
            return (
              <Sheet key={item.key} open={showMoreMenu} onOpenChange={setShowMoreMenu}>
                <button
                  onClick={() => setShowMoreMenu(true)}
                  className={`flex flex-col items-center justify-center gap-0.5 flex-1 py-1.5 rounded-lg transition-colors ${isActive ? 'text-emerald-600 bg-emerald-50' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  <item.icon className="w-5 h-5" />
                  <span className="text-[10px] font-medium">{item.label}</span>
                </button>
                <SheetContent side="bottom" className="rounded-t-2xl max-h-[80vh] overflow-y-auto">
                  <SheetHeader className="pb-2">
                    <SheetTitle className="text-center">More Options</SheetTitle>
                  </SheetHeader>
                  <div className="space-y-1 px-2 pb-4">
                    {MORE_MENU_ITEMS.map((menuItem) => (
                      <button key={menuItem.key} onClick={() => onNavigate(menuItem.key)} className="flex items-center gap-3 w-full p-3 rounded-xl hover:bg-gray-50 transition-colors text-left">
                        <div className="flex items-center justify-center w-10 h-10 rounded-full bg-gray-100 shrink-0">
                          <menuItem.icon className="w-5 h-5 text-gray-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-800">{menuItem.label}</p>
                          <p className="text-xs text-gray-400">{menuItem.description}</p>
                        </div>
                        <ChevronRight className="w-4 h-4 text-gray-300 shrink-0" />
                      </button>
                    ))}
                    <Separator className="my-2" />
                    <button onClick={() => onNavigate('logout')} className="flex items-center gap-3 w-full p-3 rounded-xl hover:bg-rose-50 transition-colors text-left">
                      <div className="flex items-center justify-center w-10 h-10 rounded-full bg-rose-100 shrink-0">
                        <LogOut className="w-5 h-5 text-rose-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-rose-700">Logout</p>
                        <p className="text-xs text-rose-400">Sign out of your account</p>
                      </div>
                    </button>
                  </div>
                </SheetContent>
              </Sheet>
            );
          }

          return (
            <button key={item.key} onClick={() => onNavigate(item.key)} className={`flex flex-col items-center justify-center gap-0.5 flex-1 py-1.5 rounded-lg transition-colors ${isActive ? 'text-emerald-600 bg-emerald-50' : 'text-gray-500 hover:text-gray-700'}`}>
              <item.icon className="w-5 h-5" />
              <span className="text-[10px] font-medium">{item.label}</span>
            </button>
          );
        })}
      </div>
      <div className="h-[env(safe-area-inset-bottom,0px)] bg-white" />
    </nav>
  );
}
