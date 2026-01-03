import React, { useState, useEffect } from 'react';
import { AppView } from './types';
import LoginPage from './components/LoginPage';
import Dashboard from './components/Dashboard';
import TaskDetail from './components/TaskDetail';
import UserProfile from './components/UserProfile';
import TimeCreditLog from './components/TimeCreditLog';
import ThanksWall from './components/ThanksWall';
import Journal from './components/Journal';
import { supabase, loginWithLine } from './services/supabaseClient';

const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<AppView>(AppView.LOGIN);
  // Store previous view to handle "Back" navigation correctly from TaskDetail
  const [previousView, setPreviousView] = useState<AppView>(AppView.DASHBOARD);
  const [isLoading, setIsLoading] = useState(true);
  
  // Centralized User State
  const [currentUser, setCurrentUser] = useState<any>(null);
  
  // State to pass data between views
  const [currentTaskId, setCurrentTaskId] = useState<string | null>(null);

  const LIFF_ID = import.meta.env.VITE_LIFF_ID;

  useEffect(() => {
    // Check initial session only once on mount
    const checkSession = async () => {
      let hasSession = false;

      // Priority Check: If there is a 'code' in the URL (from LINE Login Callback),
      // we must force the Login View to render so that LoginPage.tsx can handle the code exchange logic.
      if (window.location.search.includes('code=')) {
          setCurrentView(AppView.LOGIN);
          setIsLoading(false);
          return;
      }

      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          hasSession = true;
          setCurrentUser(session.user);
          setCurrentView(AppView.DASHBOARD);
        }
      } catch (error) {
        console.error("Session check error", error);
      } 

      // LIFF Initialization & Auto Login Logic
      try {
        if (window.liff && LIFF_ID) {
            await window.liff.init({ liffId: LIFF_ID });
            
            // Check if running in LIFF Client
            if (window.liff.isInClient()) {
                // If logged in to LINE but NOT Supabase, try silent login
                if (window.liff.isLoggedIn() && !hasSession) {
                    setIsLoading(true);
                    const idToken = window.liff.getIDToken();
                    if (idToken) {
                        console.log("Auto-logging in via LIFF...");
                        await loginWithLine({ idToken: idToken });
                        // loginWithLine will handle the redirect via action_link
                        return;
                    }
                }
            }
        } else if (!LIFF_ID) {
             console.error("VITE_LIFF_ID is not set in environment variables.");
        }
      } catch (liffError) {
          console.error("LIFF Init failed", liffError);
      } finally {
          setIsLoading(false);
      }
    };

    checkSession();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setCurrentUser(session?.user ?? null);
      
      if (!session) {
        // If logged out, force login view
        setCurrentView(AppView.LOGIN);
      } 
      // Note: We intentionally DO NOT force AppView.DASHBOARD here if a session exists.
      // This allows the user to navigate to TASK_DETAIL or PROFILE without being 
      // redirected back to DASHBOARD by this listener.
    });

    return () => subscription.unsubscribe();
  }, [LIFF_ID]);

  const handleLoginSuccess = () => {
     // Session update will be caught by onAuthStateChange, but we explicitly move view
     setCurrentView(AppView.DASHBOARD);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setCurrentUser(null);
    
    // Also logout from LIFF if applicable
    if (window.liff && window.liff.isLoggedIn()) {
        window.liff.logout();
    }
    
    setCurrentView(AppView.LOGIN);
  };

  const navigateToTaskDetail = (taskId: string) => {
    setPreviousView(currentView); // Save origin for back navigation
    setCurrentTaskId(taskId);
    setCurrentView(AppView.TASK_DETAIL);
  };

  const navigateBackFromTaskDetail = () => {
    setCurrentView(previousView);
  };

  const navigateToProfile = () => {
    // Navigate from top bar logic usually goes to profile
    setCurrentView(AppView.USER_PROFILE);
  };

  const navigateToDashboard = () => {
    setCurrentView(AppView.DASHBOARD);
  };
  
  const navigateToTimeLog = () => {
    setCurrentView(AppView.TIME_CREDIT_LOG);
  };

  // Main navigation handler for BottomNav
  const handleMainNavigation = (view: AppView) => {
    setCurrentView(view);
  };

  if (isLoading) {
    return (
        <div className="fixed inset-0 z-50 bg-[#FFF9E6] flex items-center justify-center">
            <div className="flex flex-col items-center animate-pulse">
                <div className="w-12 h-12 border-4 border-brand-green border-t-transparent rounded-full animate-spin mb-4"></div>
                <p className="font-sans font-bold text-slate-600 text-lg">Loading HelpWall...</p>
            </div>
        </div>
    );
  }

  return (
    <>
      {currentView === AppView.LOGIN && (
        <LoginPage onLoginSuccess={handleLoginSuccess} />
      )}

      {currentView === AppView.DASHBOARD && (
        <Dashboard 
          currentUser={currentUser}
          onNavigateToTaskDetail={navigateToTaskDetail}
          onNavigate={handleMainNavigation}
        />
      )}

      {currentView === AppView.GRATITUDE && (
        <ThanksWall 
          currentUser={currentUser}
          onNavigate={handleMainNavigation}
        />
      )}
      
      {currentView === AppView.JOURNAL && (
        <Journal 
          currentUser={currentUser}
          onNavigate={handleMainNavigation}
        />
      )}

      {currentView === AppView.TASK_DETAIL && (
        <TaskDetail 
          currentUser={currentUser}
          taskId={currentTaskId} 
          onBack={navigateBackFromTaskDetail} 
        />
      )}

      {currentView === AppView.USER_PROFILE && (
        <UserProfile 
          currentUser={currentUser}
          onBack={navigateToDashboard} // Fallback if back button is shown
          onLogout={handleLogout}
          onNavigateToTaskDetail={navigateToTaskDetail}
          onNavigateToWallet={navigateToTimeLog}
          onNavigate={handleMainNavigation}
        />
      )}

      {currentView === AppView.TIME_CREDIT_LOG && (
        <TimeCreditLog 
          currentUser={currentUser}
          onBack={navigateToProfile}
          onNavigateToTaskDetail={navigateToTaskDetail}
        />
      )}
    </>
  );
};

export default App;