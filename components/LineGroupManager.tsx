import React, { useEffect, useState } from 'react';
import { supabase, claimLineGroup } from '../services/supabaseClient';
import { LineGroup } from '../types';

interface LineGroupManagerProps {
  currentUser: any;
  onBack: () => void;
}

const LineGroupManager: React.FC<LineGroupManagerProps> = ({ currentUser, onBack }) => {
  const [groups, setGroups] = useState<LineGroup[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [inputGroupId, setInputGroupId] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    if (currentUser) {
      fetchGroups();
    }
  }, [currentUser]);

  const fetchGroups = async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from('line_groups')
      .select('*')
      .eq('owner_uid', currentUser.id)
      .order('created_at', { ascending: false });

    if (!error && data) {
      setGroups(data);
    }
    setIsLoading(false);
  };

  const handleClaimGroup = async () => {
    if (!inputGroupId.trim()) return alert("請輸入 LINE 群組 ID");
    
    setIsProcessing(true);
    try {
      await claimLineGroup(inputGroupId.trim());
      alert("群組連結成功！");
      setInputGroupId(''); // Clear input
      fetchGroups(); // Refresh list
    } catch (err: any) {
      console.error(err);
      alert("連結失敗: " + err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleToggleNotify = async (groupId: string, currentValue: boolean) => {
    // Optimistic update
    setGroups(prev => prev.map(g => g.id === groupId ? { ...g, notify_enabled: !currentValue } : g));

    const { error } = await supabase
      .from('line_groups')
      .update({ notify_enabled: !currentValue })
      .eq('id', groupId);

    if (error) {
      alert("更新失敗");
      // Revert
      setGroups(prev => prev.map(g => g.id === groupId ? { ...g, notify_enabled: currentValue } : g));
    }
  };

  return (
    <div className="relative flex min-h-screen w-full flex-col bg-background-light dark:bg-background-dark font-display text-text-primary dark:text-white">
      
      {/* Top Bar */}
      <div className="flex items-center p-4 pb-2 sticky top-0 z-10 bg-background-light/95 dark:bg-background-dark/95 backdrop-blur-sm">
        <button 
            onClick={onBack} 
            className="flex items-center justify-center rounded-full h-12 w-12 hover:bg-black/5 transition z-20 text-text-primary dark:text-white"
        >
            <span className="material-symbols-outlined text-3xl">arrow_back</span>
        </button>
        <h2 className="text-text-primary dark:text-white text-lg font-bold text-center pointer-events-none absolute left-0 right-0">
            我的 LINE 群組
        </h2>
      </div>

      <main className="flex-1 p-4 flex flex-col gap-6">
          
          {/* Claim Group Section */}
          <div className="bg-white dark:bg-zinc-800 p-6 rounded-3xl shadow-soft flex flex-col gap-4 border border-gray-100 dark:border-gray-700">
              <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-[#06C755]/10 flex items-center justify-center shrink-0">
                      <span className="material-symbols-outlined text-[#06C755] text-2xl">link</span>
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-gray-800 dark:text-gray-100">連結新群組</h3>
                    <p className="text-xs text-gray-500">輸入機器人提供的 Group ID</p>
                  </div>
              </div>

              <div className="bg-gray-50 dark:bg-zinc-900/50 p-4 rounded-xl text-xs text-gray-600 dark:text-gray-400 space-y-2 leading-relaxed border border-gray-100 dark:border-gray-700">
                  <p>1. 邀請 <strong>HelpWall Bot</strong> 進入 LINE 群組</p>
                  <p>2. 在群組輸入指令： <code className="bg-gray-200 dark:bg-zinc-600 px-1.5 py-0.5 rounded text-gray-800 dark:text-gray-200 font-mono font-bold select-all">/id</code></p>
                  <p>3. 複製機器人回傳的 ID 並貼在下方</p>
              </div>

              <div className="flex flex-col sm:flex-row gap-2 mt-1">
                <input
                    type="text"
                    value={inputGroupId}
                    onChange={(e) => setInputGroupId(e.target.value)}
                    placeholder="輸入 Group ID (例如 Cxxxx...)"
                    className="flex-1 rounded-xl bg-gray-100 dark:bg-zinc-700 border-none px-4 py-3.5 text-sm focus:ring-2 focus:ring-[#06C755] outline-none transition-all placeholder:text-gray-400 text-gray-900 dark:text-white"
                />
                <button
                    onClick={handleClaimGroup}
                    disabled={isProcessing || !inputGroupId.trim()}
                    className="px-6 py-3.5 rounded-xl bg-[#06C755] text-white font-bold shadow-lg hover:opacity-90 disabled:opacity-50 disabled:shadow-none whitespace-nowrap transition-all active:scale-95 flex items-center justify-center gap-2"
                >
                    {isProcessing ? (
                        <div className="w-4 h-4 border-2 border-white/50 border-t-white rounded-full animate-spin"></div>
                    ) : (
                        <>
                           <span>連結</span>
                           <span className="material-symbols-outlined text-sm">add_link</span>
                        </>
                    )}
                </button>
              </div>
          </div>

          {/* Group List */}
          <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between ml-1">
                 <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest">已管理的群組</h3>
                 {isLoading && <div className="w-4 h-4 border-2 border-gray-300 border-t-gray-500 rounded-full animate-spin"></div>}
              </div>
              
              {!isLoading && groups.length === 0 ? (
                  <div className="text-center py-12 flex flex-col items-center gap-3 text-gray-400">
                      <span className="material-symbols-outlined text-4xl opacity-30">groups</span>
                      <p className="text-sm">尚無連結的群組</p>
                  </div>
              ) : (
                  groups.map(group => (
                    <div key={group.id} className="bg-white dark:bg-zinc-800 p-4 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col gap-3">
                        <div className="flex justify-between items-center">
                            <div className="flex items-center gap-3 overflow-hidden">
                                <div className="w-10 h-10 rounded-full flex-shrink-0 flex items-center justify-center bg-blue-50 text-blue-500">
                                    <span className="material-symbols-outlined">groups</span>
                                </div>
                                <div className="min-w-0">
                                    <p className="font-bold text-gray-800 dark:text-gray-200 truncate">
                                        {group.group_name || '未命名群組'}
                                    </p>
                                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate font-mono mt-0.5">
                                        {group.group_id}
                                    </p>
                                </div>
                            </div>
                            
                            {/* Notify Toggle */}
                            <div className="flex flex-col items-end gap-1 flex-shrink-0 ml-2">
                                <button 
                                    onClick={() => handleToggleNotify(group.id, group.notify_enabled)}
                                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${group.notify_enabled ? 'bg-green-500' : 'bg-gray-200 dark:bg-gray-600'}`}
                                >
                                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${group.notify_enabled ? 'translate-x-6' : 'translate-x-1'}`} />
                                </button>
                                <span className="text-[10px] text-gray-400 font-bold">通知</span>
                            </div>
                        </div>
                    </div>
                  ))
              )}
          </div>

      </main>
    </div>
  );
};

export default LineGroupManager;