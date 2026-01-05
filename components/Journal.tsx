import React, { useEffect, useState } from 'react';
import { generateDiary, getStoredJournal, supabase } from '../services/supabaseClient';
import { AppView } from '../types';
import BottomNav from './BottomNav';

interface JournalProps {
  currentUser: any;
  onNavigate: (view: AppView) => void;
}

// Interfaces matching the Clean AI API Response
interface AiJournalResponse {
    period?: {
        type: string;
        label: string;
    };
    narrative?: {
        theme: string;
        summary: string;
        highlight: string;
        achievement?: Array<{
            title: string;
            reason: string;
        }>;
    };
}

const Journal: React.FC<JournalProps> = ({ currentUser, onNavigate }) => {
  // State
  const [rangeType, setRangeType] = useState<'month' | 'year'>('month');
  const [journalData, setJournalData] = useState<AiJournalResponse | null>(null);
  const [stats, setStats] = useState({ given: 0, received: 0 });
  
  // UI State
  const [isLoadingDb, setIsLoadingDb] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Helper to generate consistent date keys.
   */
  const getDateKeys = (type: 'month' | 'year') => {
      const now = new Date();
      const year = now.getFullYear();
      
      if (type === 'month') {
          // Format: MM (pad to 2 digits)
          const month = String(now.getMonth() + 1).padStart(2, '0');
          return {
              apiValue: `${year}-${month}`,      // e.g. "2025-05"
              dbLabel: `${year}-${month} 月`     // e.g. "2025-05 月"
          };
      } else {
          return {
              apiValue: `${year}`,               // e.g. "2025"
              dbLabel: `${year} 年`              // e.g. "2025 年"
          };
      }
  };

  // 1. Fetch Stats for Left Panel
  useEffect(() => {
    const fetchStats = async () => {
        if (!currentUser) return;
        
        try {
            // Help Given: Tasks where I am helper AND status is completed
            const { count: givenCount } = await supabase
                .from('tasks')
                .select('*', { count: 'exact', head: true })
                .eq('helper_uid', currentUser.id)
                .eq('status', 'completed');

            // Help Received: Tasks where I am owner AND status is completed
            const { count: receivedCount } = await supabase
                .from('tasks')
                .select('*', { count: 'exact', head: true })
                .eq('user_uid', currentUser.id)
                .eq('status', 'completed');

            setStats({ 
                given: givenCount || 0, 
                received: receivedCount || 0 
            });
        } catch (e) {
            console.error("Error fetching stats", e);
        }
    };
    fetchStats();
  }, [currentUser]);

  /**
   * 2. READ-ONLY MODE
   * Checks the database whenever the user or range type changes.
   */
  useEffect(() => {
      if (!currentUser) return;

      const checkDatabase = async () => {
          setIsLoadingDb(true);
          setError(null);
          setJournalData(null); // Clear previous view while loading

          try {
              const { dbLabel } = getDateKeys(rangeType);
              const storedEntry = await getStoredJournal(currentUser.id, rangeType, dbLabel);
              
              if (storedEntry && storedEntry.narrative) {
                  let rawData = storedEntry.narrative;
                  // Parse if stringified
                  if (typeof rawData === 'string') {
                      try { rawData = JSON.parse(rawData); } catch (e) { console.error(e); }
                  }
                  
                  // Normalize Data (Handle legacy/malformed structures)
                  const normalized = normalizeJournalData(rawData, rangeType, dbLabel);
                  setJournalData(normalized);
              }
              // If no entry found, journalData remains null, UI shows "Generate" button.
          } catch (err) {
              console.error("DB Check Failed:", err);
              setError("讀取日記失敗，請檢查網路連線");
          } finally {
              setIsLoadingDb(false);
          }
      };

      checkDatabase();
  }, [rangeType, currentUser]);

  /**
   * 3. MANUAL TRIGGER
   * Calls the Edge Function to generate or regenerate the diary.
   */
  const handleGenerate = async (forceRefresh: boolean) => {
      if (!currentUser) return;
      
      setIsGenerating(true);
      setError(null);

      try {
          const { apiValue, dbLabel } = getDateKeys(rangeType);
          
          console.log(`[Journal] Calling AI... Range: ${apiValue}, Force: ${forceRefresh}`);
          
          // Call Edge Function
          const data = await generateDiary(rangeType, apiValue, forceRefresh);
          
          // Normalize and Update UI
          const normalized = normalizeJournalData(data, rangeType, dbLabel);
          setJournalData(normalized);

      } catch (err: any) {
          console.error("AI Generation Failed:", err);
          setError("生成失敗，請稍後再試");
      } finally {
          setIsGenerating(false);
      }
  };

  /**
   * Data Normalization Helper
   */
  const normalizeJournalData = (rawData: any, type: string, label: string): AiJournalResponse => {
      let normalized: AiJournalResponse = { ...rawData };

      // Handle flat structure where root IS the narrative
      if (!normalized.narrative && (rawData.theme || rawData.summary)) {
            normalized = {
                period: { type, label },
                narrative: rawData
            };
      }

      // Ensure 'period' exists
      if (!normalized.period) {
          normalized.period = { type, label };
      }

      // Ensure 'achievement' is an array
      if (normalized.narrative?.achievement && !Array.isArray(normalized.narrative.achievement)) {
            // @ts-ignore
            normalized.narrative.achievement = [normalized.narrative.achievement];
      }

      return normalized;
  };

  return (
    <div className="min-h-screen w-full bg-[#FDFBF7] font-display flex flex-col lg:flex-row pb-24 lg:pb-0">
      
      {/* Left Panel: Stats & Title */}
      <div className="w-full lg:w-[35%] bg-white lg:h-screen lg:sticky lg:top-0 flex flex-col p-8 border-b lg:border-b-0 lg:border-r border-stone-100 z-10 shadow-sm lg:shadow-none relative overflow-hidden">
        {/* Decorative Background Blob */}
        <div className="absolute top-[-10%] right-[-10%] w-64 h-64 bg-yellow-50 rounded-full blur-3xl opacity-60 pointer-events-none"></div>
        <div className="absolute bottom-[-10%] left-[-10%] w-64 h-64 bg-green-50 rounded-full blur-3xl opacity-60 pointer-events-none"></div>

        <header className="mb-4 lg:mb-6 relative z-10">
            <h1 className="text-3xl lg:text-4xl font-black text-stone-800 tracking-tight font-hand-drawn">幸福日記</h1>
            <p className="text-stone-500 font-medium mt-2">記錄善意，看見影響力</p>
        </header>

        <div className="flex-grow flex flex-col justify-start lg:justify-center gap-4 lg:gap-5 relative z-10 px-2">
            
            {/* Stat 1: Help Given */}
            <div className="flex flex-col items-start p-4 lg:p-5 rounded-3xl bg-[#F0FAF4] border border-[#D1E7DD] relative group hover:scale-[1.02] transition-transform duration-300">
                <div className="flex items-center gap-3 mb-2">
                    <span className="material-symbols-outlined text-3xl text-green-600">volunteer_activism</span>
                    <span className="text-stone-500 font-bold tracking-widest text-sm uppercase">Help Given</span>
                </div>
                <div className="flex items-baseline gap-2">
                    <span className="text-5xl lg:text-3xl font-black text-[#2D5A42] font-hand-drawn leading-none">
                        {stats.given}
                    </span>
                    <span className="text-xl text-stone-400 font-bold">次</span>
                </div>
                <p className="text-sm text-stone-500 mt-2 font-medium">您主動伸出援手的時刻</p>
            </div>

            {/* Stat 2: Help Received */}
            <div className="flex flex-col items-start p-4 lg:p-5 rounded-3xl bg-[#FEF2F2] border border-[#FEE2E2] relative group hover:scale-[1.02] transition-transform duration-300">
                 <div className="flex items-center gap-3 mb-2">
                    <span className="material-symbols-outlined text-3xl text-red-500">favorite</span>
                    <span className="text-stone-500 font-bold tracking-widest text-sm uppercase">Received</span>
                </div>
                <div className="flex items-baseline gap-2">
                    <span className="text-5xl lg:text-3xl font-black text-[#7F1D1D] font-hand-drawn leading-none">
                        {stats.received}
                    </span>
                    <span className="text-xl text-stone-400 font-bold">次</span>
                </div>
                <p className="text-sm text-stone-500 mt-2 font-medium">來自社區溫暖的回饋</p>
            </div>

        </div>

        <div className="mt-8 text-center lg:text-left relative z-10">
            <p className="text-stone-400 font-handwritten text-lg opacity-80">
                "Every act of kindness is a piece of happiness."
            </p>
        </div>
      </div>

      {/* Right Panel: Content */}
      <div className="w-full lg:w-[65%] p-4 lg:p-12 flex flex-col bg-[#FDFBF7] overflow-y-auto">
         
         {/* Controls */}
         <div className="flex justify-between items-center mb-6">
             <div className="bg-white rounded-full p-1 shadow-sm border border-stone-200 flex">
                 <button 
                    onClick={() => !isGenerating && setRangeType('month')}
                    disabled={isGenerating}
                    className={`px-4 py-1.5 rounded-full text-sm font-bold transition-all ${rangeType === 'month' ? 'bg-stone-800 text-white shadow-md' : 'text-stone-500 hover:bg-stone-100'}`}
                 >
                    本月
                 </button>
                 <button 
                    onClick={() => !isGenerating && setRangeType('year')}
                    disabled={isGenerating}
                    className={`px-4 py-1.5 rounded-full text-sm font-bold transition-all ${rangeType === 'year' ? 'bg-stone-800 text-white shadow-md' : 'text-stone-500 hover:bg-stone-100'}`}
                 >
                    本年
                 </button>
             </div>
             
             {/* Refresh Button (Only shows if data exists) */}
             {!isLoadingDb && journalData && !isGenerating && (
                 <button 
                    onClick={() => handleGenerate(true)} // Force Refresh = true
                    className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white border border-stone-200 hover:bg-stone-50 text-stone-500 text-xs font-bold transition-colors shadow-sm"
                    title="重新生成日記"
                 >
                    <span className="material-symbols-outlined text-base">sync</span>
                    重新生成
                 </button>
             )}
         </div>

         {/* Main Content Area */}
         {isLoadingDb ? (
             <div className="flex-1 flex flex-col items-center justify-center min-h-[400px]">
                 <div className="w-8 h-8 border-4 border-stone-200 border-t-stone-800 rounded-full animate-spin mb-4"></div>
                 <p className="text-stone-400 font-bold text-sm">讀取歷史紀錄中...</p>
             </div>
         ) : isGenerating ? (
             <div className="flex-1 flex flex-col items-center justify-center min-h-[400px]">
                 <div className="w-12 h-12 border-4 border-yellow-200 border-t-yellow-500 rounded-full animate-spin mb-6"></div>
                 <h3 className="text-xl font-bold text-stone-700 mb-2">AI 正在撰寫您的日記</h3>
                 <p className="text-stone-500 animate-pulse">正在回顧您的善行點滴...</p>
             </div>
         ) : error ? (
             <div className="flex-1 flex flex-col items-center justify-center min-h-[400px] text-center">
                 <span className="material-symbols-outlined text-4xl text-stone-300 mb-2">error</span>
                 <p className="text-stone-500 font-bold mb-4">{error}</p>
                 <button onClick={() => window.location.reload()} className="px-6 py-2 bg-stone-800 text-white rounded-lg font-bold">重新整理頁面</button>
             </div>
         ) : journalData ? (
             // DISPLAY MODE
             <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                 
                 {/* Period Chip */}
                 <div className="flex flex-wrap gap-2">
                    {journalData.period && (
                        <span className="inline-flex items-center gap-1 px-3 py-1 bg-blue-100 text-blue-700 rounded-lg text-sm font-bold">
                            <span className="material-symbols-outlined text-base">calendar_month</span>
                            {journalData.period.label}
                        </span>
                    )}
                 </div>

                 {/* Narrative Card */}
                 <div className="bg-white rounded-3xl p-6 lg:p-10 shadow-sm border border-stone-100 relative overflow-hidden">
                     <span className="absolute top-4 right-6 text-8xl text-stone-100 font-serif leading-none select-none">”</span>
                     
                     <h2 className="text-2xl lg:text-3xl font-black text-stone-800 mb-4 font-hand-drawn relative z-10">
                        {journalData.narrative?.theme}
                     </h2>
                     <p className="text-stone-600 leading-loose text-lg mb-6 relative z-10">
                        {journalData.narrative?.summary}
                     </p>

                     {journalData.narrative?.highlight && (
                        <div className="bg-[#FFFDF5] border-l-4 border-yellow-400 p-4 rounded-r-xl relative z-10">
                            <p className="text-stone-800 font-bold italic">
                                {journalData.narrative.highlight}
                            </p>
                        </div>
                     )}
                 </div>

                 {/* Achievements */}
                 {journalData.narrative?.achievement && Array.isArray(journalData.narrative.achievement) && journalData.narrative.achievement.length > 0 && (
                     <div className="flex flex-col gap-4">
                         <h3 className="text-xl font-bold text-stone-700 px-2 flex items-center gap-2">
                             <span className="material-symbols-outlined text-yellow-500">military_tech</span>
                             近期成就
                         </h3>
                         <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                             {journalData.narrative.achievement.map((item, idx) => (
                                 <div key={idx} className="bg-white p-5 rounded-2xl shadow-sm border border-stone-100 hover:shadow-md transition-shadow">
                                     <div className="flex items-start gap-3">
                                         <div className="mt-1 w-2 h-2 rounded-full bg-accent-primary shrink-0"></div>
                                         <div>
                                             <h4 className="font-bold text-stone-800 text-lg mb-1">{item.title}</h4>
                                             <p className="text-sm text-stone-500 leading-relaxed">{item.reason}</p>
                                         </div>
                                     </div>
                                 </div>
                             ))}
                         </div>
                     </div>
                 )}
             </div>
         ) : (
             // EMPTY STATE: Show Generate Button
             <div className="flex-1 flex flex-col items-center justify-center min-h-[400px] text-center p-6">
                 <div className="bg-white p-6 rounded-full shadow-soft mb-6 border-4 border-[#FFF5B8]">
                    <span className="material-symbols-outlined text-6xl text-stone-400">auto_stories</span>
                 </div>
                 
                 <h3 className="text-2xl font-black text-stone-700 mb-3 font-hand-drawn">
                     尚無{rangeType === 'month' ? '本月' : '年度'}日記
                 </h3>
                 <p className="text-stone-500 mb-8 max-w-md text-lg leading-relaxed">
                     點擊下方按鈕，讓 AI 為您整理這段時間的<br/>善意流動與精彩成就。
                 </p>
                 
                 <button
                    onClick={() => handleGenerate(false)} // Force Refresh = false
                    className="group relative inline-flex items-center justify-center gap-3 px-8 py-4 rounded-full bg-stone-800 text-white font-bold text-lg shadow-lg hover:bg-stone-700 hover:scale-105 hover:shadow-xl transition-all duration-300"
                 >
                    <span className="material-symbols-outlined group-hover:animate-wiggle">magic_button</span>
                    生成幸福日記
                 </button>
             </div>
         )}
      </div>

      <BottomNav currentView={AppView.JOURNAL} onNavigate={onNavigate} />
    </div>
  );
};

export default Journal;