import React, { useEffect, useState } from 'react';
import { generateDiary, getStoredJournal, supabase } from '../services/supabaseClient';
import { AppView } from '../types';
import BottomNav from './BottomNav';

interface JournalProps {
  currentUser: any;
  onNavigate: (view: AppView) => void;
}

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
  const [rangeType, setRangeType] = useState<'month' | 'year'>('month');
  const [journalData, setJournalData] = useState<AiJournalResponse | null>(null);
  const [stats, setStats] = useState({ given: 0, received: 0 });
  
  const [isLoadingDb, setIsLoadingDb] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getDateKeys = (type: 'month' | 'year') => {
      const now = new Date();
      const year = now.getFullYear();
      if (type === 'month') {
          const month = String(now.getMonth() + 1).padStart(2, '0');
          return {
              apiValue: `${year}-${month}`,
              dbLabel: `${year}-${month} 月`
          };
      } else {
          return {
              apiValue: `${year}`,
              dbLabel: `${year} 年`
          };
      }
  };

  useEffect(() => {
    const fetchStats = async () => {
        if (!currentUser) return;
        try {
            const { count: givenCount } = await supabase
                .from('tasks')
                .select('*', { count: 'exact', head: true })
                .eq('helper_uid', currentUser.id)
                .eq('status', 'completed');

            const { count: receivedCount } = await supabase
                .from('tasks')
                .select('*', { count: 'exact', head: true })
                .eq('user_uid', currentUser.id)
                .eq('status', 'completed');

            setStats({ given: givenCount || 0, received: receivedCount || 0 });
        } catch (e) {
            console.error("Error fetching stats", e);
        }
    };
    fetchStats();
  }, [currentUser]);

  useEffect(() => {
      if (!currentUser) return;
      const checkDatabase = async () => {
          setIsLoadingDb(true);
          setError(null);
          setJournalData(null);
          try {
              const { dbLabel } = getDateKeys(rangeType);
              const storedEntry = await getStoredJournal(currentUser.id, rangeType, dbLabel);
              if (storedEntry && storedEntry.narrative) {
                  let rawData = storedEntry.narrative;
                  if (typeof rawData === 'string') {
                      try { rawData = JSON.parse(rawData); } catch (e) { console.error(e); }
                  }
                  setJournalData(normalizeJournalData(rawData, rangeType, dbLabel));
              }
          } catch (err) {
              setError("讀取日記失敗，請檢查網路連線");
          } finally {
              setIsLoadingDb(false);
          }
      };
      checkDatabase();
  }, [rangeType, currentUser]);

  const handleGenerate = async (forceRefresh: boolean) => {
      if (!currentUser) return;
      setIsGenerating(true);
      setError(null);
      try {
          const { apiValue, dbLabel } = getDateKeys(rangeType);
          const data = await generateDiary(rangeType, apiValue, forceRefresh);
          setJournalData(normalizeJournalData(data, rangeType, dbLabel));
      } catch (err: any) {
          setError("生成失敗，請稍後再試");
      } finally {
          setIsGenerating(false);
      }
  };

  const normalizeJournalData = (rawData: any, type: string, label: string): AiJournalResponse => {
      let normalized: AiJournalResponse = { ...rawData };
      if (!normalized.narrative && (rawData.theme || rawData.summary)) {
            normalized = { period: { type, label }, narrative: rawData };
      }
      if (!normalized.period) normalized.period = { type, label };
      if (normalized.narrative?.achievement && !Array.isArray(normalized.narrative.achievement)) {
            normalized.narrative.achievement = [normalized.narrative.achievement];
      }
      return normalized;
  };

  return (
    <div className="min-h-screen w-full bg-[#FDFBF7] font-display flex flex-col lg:flex-row overflow-hidden">
      
      {/* Left Panel: 固定於左側，不隨右側滾動 */}
      <div className="w-full lg:w-[35%] bg-white lg:h-screen flex flex-col p-8 border-b lg:border-b-0 lg:border-r border-stone-100 z-10 shadow-sm lg:shadow-none relative overflow-hidden shrink-0">
        <div className="absolute top-[-10%] right-[-10%] w-64 h-64 bg-yellow-50 rounded-full blur-3xl opacity-60 pointer-events-none"></div>
        <div className="absolute bottom-[-10%] left-[-10%] w-64 h-64 bg-green-50 rounded-full blur-3xl opacity-60 pointer-events-none"></div>

        <header className="mb-4 lg:mb-8 relative z-10">
            <h1 className="text-3xl lg:text-4xl font-black text-stone-800 tracking-tight font-hand-drawn">幸福日記</h1>
            <p className="text-stone-500 font-medium mt-2">記錄善意，看見影響力</p>
        </header>

        <div className="flex-grow flex flex-col justify-start lg:justify-center gap-4 lg:gap-6 relative z-10 px-2">
            <div className="flex flex-col items-start p-5 rounded-3xl bg-[#F0FAF4] border border-[#D1E7DD] hover:scale-[1.02] transition-transform duration-300">
                <div className="flex items-center gap-3 mb-2">
                    <span className="material-symbols-outlined text-3xl text-green-600">volunteer_activism</span>
                    <span className="text-stone-500 font-bold tracking-widest text-sm uppercase">Help Given</span>
                </div>
                <div className="flex items-baseline gap-2">
                    <span className="text-5xl lg:text-4xl font-black text-[#2D5A42] font-hand-drawn leading-none">{stats.given}</span>
                    <span className="text-xl text-stone-400 font-bold">次</span>
                </div>
            </div>

            <div className="flex flex-col items-start p-5 rounded-3xl bg-[#FEF2F2] border border-[#FEE2E2] hover:scale-[1.02] transition-transform duration-300">
                 <div className="flex items-center gap-3 mb-2">
                    <span className="material-symbols-outlined text-3xl text-red-500">favorite</span>
                    <span className="text-stone-500 font-bold tracking-widest text-sm uppercase">Received</span>
                </div>
                <div className="flex items-baseline gap-2">
                    <span className="text-5xl lg:text-4xl font-black text-[#7F1D1D] font-hand-drawn leading-none">{stats.received}</span>
                    <span className="text-xl text-stone-400 font-bold">次</span>
                </div>
            </div>
        </div>

        <div className="mt-8 hidden lg:block relative z-10">
            <p className="text-stone-400 font-handwritten text-lg opacity-80">
                "Every act of kindness is a piece of happiness."
            </p>
        </div>
      </div>

      {/* Right Panel: 內容滾動區 */}
      <div className="w-full lg:w-[65%] h-screen overflow-y-auto flex flex-col bg-[#FDFBF7] relative">
         
         {/* 控制列：使用 sticky 確保在捲動時依然可見 */}
         <div className="sticky top-0 z-30 px-4 lg:px-12 py-6 bg-[#FDFBF7]/90 backdrop-blur-md flex justify-between items-center">
             <div className="bg-white rounded-full p-1 shadow-sm border border-stone-200 flex shrink-0">
                 <button 
                    onClick={() => !isGenerating && setRangeType('month')}
                    className={`min-w-[80px] px-6 py-2 rounded-full text-sm font-bold transition-all ${rangeType === 'month' ? 'bg-stone-800 text-white shadow-md' : 'text-stone-500 hover:bg-stone-100'}`}
                 >
                    本月
                 </button>
                 <button 
                    onClick={() => !isGenerating && setRangeType('year')}
                    className={`min-w-[80px] px-6 py-2 rounded-full text-sm font-bold transition-all ${rangeType === 'year' ? 'bg-stone-800 text-white shadow-md' : 'text-stone-500 hover:bg-stone-100'}`}
                 >
                    本年
                 </button>
             </div>
             
             {!isLoadingDb && journalData && !isGenerating && (
                 <button 
                    onClick={() => handleGenerate(true)}
                    className="flex items-center gap-2 px-4 py-2 rounded-full bg-white border border-stone-200 hover:bg-stone-50 text-stone-500 text-xs font-bold transition-colors shadow-sm ml-4"
                 >
                    <span className="material-symbols-outlined text-base">sync</span>
                    <span className="hidden sm:inline">重新生成</span>
                 </button>
             )}
         </div>

         {/* 內容主體：設定 pb-32 (手機) 與 pb-40 (電腦) 避開 BottomNav */}
         <div className="flex-1 px-4 lg:px-12 pb-32 lg:pb-40">
             <div className="min-h-[500px] flex flex-col">
                 {isLoadingDb ? (
                     <div className="flex-1 flex flex-col items-center justify-center">
                         <div className="w-8 h-8 border-4 border-stone-200 border-t-stone-800 rounded-full animate-spin mb-4"></div>
                         <p className="text-stone-400 font-bold text-sm">正在從資料庫讀取紀錄...</p>
                     </div>
                 ) : isGenerating ? (
                     <div className="flex-1 flex flex-col items-center justify-center">
                         <div className="w-12 h-12 border-4 border-yellow-200 border-t-yellow-500 rounded-full animate-spin mb-6"></div>
                         <h3 className="text-xl font-bold text-stone-700 mb-2">AI 正在撰寫您的日記</h3>
                         <p className="text-stone-500 animate-pulse">正在回顧您的善行點滴...</p>
                     </div>
                 ) : error ? (
                     <div className="flex-1 flex flex-col items-center justify-center text-center">
                         <span className="material-symbols-outlined text-4xl text-stone-300 mb-2">error</span>
                         <p className="text-stone-500 font-bold mb-4">{error}</p>
                         <button onClick={() => window.location.reload()} className="px-6 py-2 bg-stone-800 text-white rounded-lg font-bold">重新整理</button>
                     </div>
                 ) : journalData ? (
                     <div className="flex flex-col gap-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                         <div className="flex flex-wrap gap-2">
                            {journalData.period && (
                                <span className="inline-flex items-center gap-1 px-4 py-1.5 bg-blue-50 text-blue-600 rounded-full text-sm font-bold border border-blue-100">
                                    <span className="material-symbols-outlined text-base">calendar_month</span>
                                    {journalData.period.label}
                                </span>
                            )}
                         </div>

                         <div className="bg-white rounded-[2rem] p-8 lg:p-12 shadow-sm border border-stone-100 relative overflow-hidden">
                             <span className="absolute top-4 right-8 text-9xl text-stone-50 font-serif leading-none select-none opacity-50">”</span>
                             <h2 className="text-2xl lg:text-3xl font-black text-stone-800 mb-6 font-hand-drawn relative z-10">{journalData.narrative?.theme}</h2>
                             <p className="text-stone-600 leading-[2.2] text-lg mb-8 relative z-10">{journalData.narrative?.summary}</p>
                             {journalData.narrative?.highlight && (
                                <div className="bg-[#FFFDF5] border-l-4 border-yellow-400 p-5 rounded-r-2xl relative z-10">
                                    <p className="text-stone-800 font-bold italic text-lg">{journalData.narrative.highlight}</p>
                                </div>
                             )}
                         </div>

                         {journalData.narrative?.achievement && Array.isArray(journalData.narrative.achievement) && journalData.narrative.achievement.length > 0 && (
                             <div className="flex flex-col gap-5">
                                 <h3 className="text-xl font-bold text-stone-700 px-2 flex items-center gap-2">
                                     <span className="material-symbols-outlined text-yellow-500">military_tech</span>
                                     近期成就
                                 </h3>
                                 <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                     {journalData.narrative.achievement.map((item, idx) => (
                                         <div key={idx} className="bg-white p-6 rounded-2xl shadow-sm border border-stone-100 hover:shadow-md transition-all">
                                             <div className="flex items-start gap-3">
                                                 <div className="mt-1.5 w-2 h-2 rounded-full bg-red-400 shrink-0"></div>
                                                 <div>
                                                     <h4 className="font-bold text-stone-800 text-lg mb-2">{item.title}</h4>
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
                     <div className="flex-1 flex flex-col items-center justify-center text-center py-12">
                         <div className="bg-white p-8 rounded-full shadow-sm mb-6 border-4 border-[#FFF5B8]">
                            <span className="material-symbols-outlined text-6xl text-stone-300">auto_stories</span>
                         </div>
                         <h3 className="text-2xl font-black text-stone-700 mb-3 font-hand-drawn">
                             尚無{rangeType === 'month' ? '本月' : '年度'}日記
                         </h3>
                         <p className="text-stone-500 mb-8 max-w-sm text-lg leading-relaxed px-4">
                             點擊下方按鈕，讓 AI 為您整理這段時間的善意流動。
                         </p>
                         <button
                            onClick={() => handleGenerate(false)}
                            className="group flex items-center gap-3 px-10 py-4 rounded-full bg-stone-800 text-white font-bold text-lg shadow-lg hover:bg-stone-700 hover:scale-105 transition-all"
                         >
                            <span className="material-symbols-outlined group-hover:rotate-12 transition-transform">magic_button</span>
                            生成幸福日記
                         </button>
                     </div>
                 )}
             </div>
         </div>
      </div>

      <BottomNav currentView={AppView.JOURNAL} onNavigate={onNavigate} />
    </div>
  );
};

export default Journal;