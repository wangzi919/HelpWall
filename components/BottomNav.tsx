import React from 'react';
import { AppView } from '../types';

interface BottomNavProps {
  currentView: AppView;
  onNavigate: (view: AppView) => void;
}

const BottomNav: React.FC<BottomNavProps> = ({ currentView, onNavigate }) => {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 w-full">
      <div className="mx-4 mb-4 rounded-3xl bg-white/70 backdrop-blur-lg shadow-lg border border-white/50">
        <div className="flex justify-around px-2 py-2">
          
          <button 
            onClick={() => onNavigate(AppView.DASHBOARD)}
            className={`flex flex-1 flex-col items-center justify-end gap-1 rounded-2xl p-2 transition-colors ${currentView === AppView.DASHBOARD ? 'text-red-500' : 'text-warm-gray/60 dark:text-gray-400'}`}
          >
            <span 
              className="material-symbols-outlined text-2xl"
              style={{ fontVariationSettings: currentView === AppView.DASHBOARD ? "'FILL' 1" : "'FILL' 0" }}
            >
              home
            </span>
            <p className={`text-xs ${currentView === AppView.DASHBOARD ? 'font-bold' : 'font-medium'}`}>Home</p>
          </button>

          <button 
            onClick={() => onNavigate(AppView.GRATITUDE)}
            className={`flex flex-1 flex-col items-center justify-end gap-1 rounded-2xl p-2 transition-colors ${currentView === AppView.GRATITUDE ? 'text-red-500' : 'text-warm-gray/60 dark:text-gray-400'}`}
          >
            <span 
              className="material-symbols-outlined text-2xl"
              style={{ fontVariationSettings: currentView === AppView.GRATITUDE ? "'FILL' 1" : "'FILL' 0" }}
            >
              favorite
            </span>
            <p className={`text-xs ${currentView === AppView.GRATITUDE ? 'font-bold' : 'font-medium'}`}>Gratitude</p>
          </button>

          {/* Updated to Journal View */}
          <button 
             onClick={() => onNavigate(AppView.JOURNAL)}
             className={`flex flex-1 flex-col items-center justify-end gap-1 rounded-2xl p-2 transition-colors ${currentView === AppView.JOURNAL ? 'text-red-500' : 'text-warm-gray/60 dark:text-gray-400'}`}
          >
            <span 
              className="material-symbols-outlined text-2xl"
              style={{ fontVariationSettings: currentView === AppView.JOURNAL ? "'FILL' 1" : "'FILL' 0" }}
            >
              menu_book
            </span>
            <p className={`text-xs ${currentView === AppView.JOURNAL ? 'font-bold' : 'font-medium'}`}>Journal</p>
          </button>

          <button 
            onClick={() => onNavigate(AppView.USER_PROFILE)}
            className={`flex flex-1 flex-col items-center justify-end gap-1 rounded-2xl p-2 transition-colors ${currentView === AppView.USER_PROFILE ? 'text-red-500' : 'text-warm-gray/60 dark:text-gray-400'}`}
          >
            <span 
              className="material-symbols-outlined text-2xl"
              style={{ fontVariationSettings: currentView === AppView.USER_PROFILE ? "'FILL' 1" : "'FILL' 0" }}
            >
              person
            </span>
            <p className={`text-xs ${currentView === AppView.USER_PROFILE ? 'font-bold' : 'font-medium'}`}>Profile</p>
          </button>

        </div>
      </div>
    </nav>
  );
};

export default BottomNav;