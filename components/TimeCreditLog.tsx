import React, { useEffect, useState } from 'react';
import { supabase } from '../services/supabaseClient';

interface TimeCreditLogProps {
  currentUser: any;
  onBack: () => void;
  onNavigateToTaskDetail: (taskId: string) => void;
}

interface CreditLog {
  id: string;
  change_amount: number;
  description: string;
  created_at: string;
  related_task?: string;
  tasks?: {
    title: string;
  };
}

const TimeCreditLog: React.FC<TimeCreditLogProps> = ({ currentUser, onBack, onNavigateToTaskDetail }) => {
  const [walletTotal, setWalletTotal] = useState<number>(0);
  const [logs, setLogs] = useState<CreditLog[]>([]);

  useEffect(() => {
    const fetchWalletData = async () => {
      if (!currentUser) return;

      const userId = currentUser.id;

      // 1. Load Total Balance
      const { data: userData } = await supabase
        .from("user")
        .select("time_credit")
        .eq("uid", userId)
        .single();
      
      setWalletTotal(userData?.time_credit ?? 0);

      // 2. Load Logs
      const { data: logData } = await supabase
        .from("time_credit_log")
        .select("*, tasks(title)")
        .eq("user_uid", userId)
        .order("created_at", { ascending: false });

      setLogs(logData || []);
    };

    fetchWalletData();
  }, [currentUser]);

  return (
    <div className="relative flex min-h-screen w-full flex-col overflow-x-hidden bg-background-light dark:bg-background-dark font-jakarta">
        
        {/* Top App Bar */}
        <div className="flex items-center p-4 pb-2 sticky top-0 z-10 bg-transparent">
            <button 
                onClick={onBack} 
                className="flex items-center justify-center rounded-full h-12 w-12 hover:bg-black/5 transition z-20 text-[#111418] dark:text-white"
            >
                <span className="material-symbols-outlined text-3xl">arrow_back</span>
            </button>

            <h2 className="text-[#111418] dark:text-white text-lg font-bold text-center pointer-events-none absolute left-0 right-0">
                時間幣紀錄
            </h2>
        </div>

        <main className="flex flex-col gap-6 p-4">

            {/* Balance Display */}
            <div className="flex items-stretch justify-between gap-4 rounded-xl bg-white dark:bg-gray-800 p-6 shadow-sm">
                <div className="flex flex-col gap-2 flex-[2_2_0px]">
                    <p className="text-[#617589] dark:text-gray-400 text-sm">我的時間幣</p>
                    <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-wallet-primary text-3xl">toll</span>
                        <p className="text-[#111418] dark:text-white text-3xl font-bold">{walletTotal}</p>
                    </div>
                </div>
            </div>

            {/* Logs List */}
            <div className="flex flex-col gap-3">
                {logs.map((log) => {
                    const isGain = log.change_amount > 0;
                    const iconColor = isGain ? "#A8D8B9" : "#F7B5A1";
                    const bgColor = isGain ? "#A8D8B9" : "#F7B5A1";
                    const sign = isGain ? "+" : "-";
                    const title = isGain ? "獲得時間幣" : "付出時間幣";
                    const detail = log.description || (log.tasks?.title ? `任務：${log.tasks.title}` : "");

                    return (
                        <div 
                            key={log.id}
                            onClick={() => log.related_task && onNavigateToTaskDetail(log.related_task)}
                            className="flex items-center gap-4 bg-white dark:bg-gray-800 px-4 py-3 min-h-[72px] justify-between rounded-xl shadow-sm cursor-pointer hover:bg-gray-50 transition-colors"
                        >
                            <div className="flex items-center gap-4">
                                <div 
                                    className="flex items-center justify-center rounded-full shrink-0 size-12"
                                    style={{ background: `${bgColor}33`, color: iconColor }}
                                >
                                    <span className="material-symbols-outlined">{isGain ? "add" : "remove"}</span>
                                </div>

                                <div className="flex flex-col">
                                    <p className="text-[#111418] dark:text-white text-base font-medium">{title}</p>
                                    <p className="text-[#617589] dark:text-gray-400 text-sm line-clamp-1">{detail}</p>
                                </div>
                            </div>

                            <div>
                                <p style={{ color: iconColor }} className="text-base font-bold">
                                    {sign}{Math.abs(log.change_amount)}
                                </p>
                            </div>
                        </div>
                    );
                })}
                
                {logs.length === 0 && (
                     <div className="text-center text-gray-400 mt-10">尚無紀錄</div>
                )}
            </div>

        </main>
    </div>
  );
};

export default TimeCreditLog;