import React, { useEffect, useState } from 'react';
import { supabase } from '../services/supabaseClient';
import { AppView } from '../types';
import BottomNav from './BottomNav';

interface UserProfileProps {
  currentUser: any;
  onBack: () => void;
  onLogout: () => void;
  onNavigateToTaskDetail: (taskId: string) => void;
  onNavigateToWallet: () => void;
  onNavigate?: (view: AppView) => void;
}

interface UserData {
  name: string;
  image_url: string;
  bio: string;
  time_credit: number;
  notify_enabled?: boolean;
  line_uid?: string;
}

interface StatData {
  requests: number;
  helpGiven: number;
  thanks: number;
}

const UserProfile: React.FC<UserProfileProps> = ({ 
  currentUser,
  onBack, 
  onLogout, 
  onNavigateToTaskDetail,
  onNavigateToWallet,
  onNavigate
}) => {
  const [userData, setUserData] = useState<UserData | null>(null);
  const [stats, setStats] = useState<StatData>({ requests: 0, helpGiven: 0, thanks: 0 });
  const [activeTab, setActiveTab] = useState<'requests' | 'help'>('requests');
  const [taskList, setTaskList] = useState<any[]>([]);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Edit Profile States
  const [isEditProfileOpen, setIsEditProfileOpen] = useState(false);
  const [editName, setEditName] = useState('');
  const [editAvatarUrl, setEditAvatarUrl] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // If onNavigate is provided, we assume we are in "Tab Mode" via BottomNav
  const isTabMode = !!onNavigate;

  useEffect(() => {
    const initProfile = async () => {
        if (currentUser) {
            loadUserProfile(currentUser.id);
            loadUserStats(currentUser.id);
        }
    };
    initProfile();
  }, [currentUser]);

  useEffect(() => {
    if (currentUser) {
        if (activeTab === 'requests') {
            loadUserRequests(currentUser.id);
        } else {
            loadMyHelp(currentUser.id);
        }
    }
  }, [currentUser, activeTab]);

  const loadUserProfile = async (id: string) => {
    const { data } = await supabase.from("user").select("*").eq("uid", id).single();
    if (data) setUserData(data);
  };

  const loadUserStats = async (id: string) => {
    // Parallelize requests to avoid waterfall
    // helpGiven now counts tasks where helper_uid is me and status is completed
    const [req, help, thanks] = await Promise.all([
        supabase.from("tasks").select("*", { count: "exact", head: true }).eq("user_uid", id),
        supabase.from("tasks").select("*", { count: "exact", head: true }).eq("helper_uid", id).eq("status", "completed"),
        supabase.from("thanks_card").select("*", { count: "exact", head: true }).eq("receiver_uid", id)
    ]);

    setStats({
        requests: req.count || 0,
        helpGiven: help.count || 0,
        thanks: thanks.count || 0
    });
  };

  const loadUserRequests = async (id: string) => {
    // 1. Fetch my tasks
    const { data: tasks } = await supabase
        .from("tasks")
        .select("*")
        .eq("user_uid", id)
        .order("created_at", { ascending: false });

    if (!tasks) {
        setTaskList([]);
        return;
    }

    // 2. Fetch all thanks cards sent by me to see which tasks have been thanked
    const { data: myThanks } = await supabase
        .from("thanks_card")
        .select("task_id")
        .eq("sender_uid", id);
    
    const thanksSet = new Set(myThanks?.map(t => t.task_id) || []);

    // 3. Process to match the list display format
    const processed = tasks.map((task: any) => ({
        ...task,
        assignmentStatus: task.status, 
        helperId: task.helper_uid,
        hasThanks: thanksSet.has(task.id) // Check if I sent thanks for this task
    }));

    setTaskList(processed);
  };

  const loadMyHelp = async (id: string) => {
     // 1. Tasks I am helping/helped
     const { data: tasks } = await supabase
        .from("tasks")
        .select("*")
        .eq("helper_uid", id)
        .order("created_at", { ascending: false });

     if (!tasks) {
         setTaskList([]);
         return;
     }

     // 2. Fetch thanks cards RECEIVED by me for these tasks
     // We filter thanks_card where receiver_uid is me.
     const { data: receivedThanks } = await supabase
        .from("thanks_card")
        .select("task_id")
        .eq("receiver_uid", id);

     const receivedThanksSet = new Set(receivedThanks?.map(t => t.task_id) || []);

     const processed = tasks.map((task: any) => ({
         id: task.id,
         title: task.title,
         created_at: task.created_at,
         assignmentStatus: task.status,
         isHelperView: true,
         hasReceivedThanks: receivedThanksSet.has(task.id) // Check if I received thanks
     }));

     setTaskList(processed);
  };

  const handleBindLine = () => {
    // Set mode to binding
    localStorage.setItem('auth_mode', 'bind');

    // Trigger LINE Redirect (Logic copied from LoginPage to avoid prop drilling complex functions)
    const LINE_CHANNEL_ID = import.meta.env.VITE_LINE_CHANNEL_ID;
    
    if (!LINE_CHANNEL_ID) {
        alert("Configuration Error: LINE Channel ID missing.");
        return;
    }

    const REDIRECT_URI = window.location.origin;
    const state = btoa(String(Math.random()));
    const nonce = btoa(String(Math.random()));
    
    const lineAuthUrl =
        `https://access.line.me/oauth2/v2.1/authorize` +
        `?response_type=code` + 
        `&client_id=${LINE_CHANNEL_ID}` +
        `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
        `&scope=openid%20profile%20email` +
        `&state=${state}` + 
        `&nonce=${nonce}`;

    window.location.href = lineAuthUrl;
  };

  const handleToggleNotify = async () => {
    if (!currentUser || !userData) return;
    
    const newValue = !userData.notify_enabled;

    // Optimistic Update
    setUserData(prev => prev ? ({ ...prev, notify_enabled: newValue }) : null);

    const { error } = await supabase
      .from('user')
      .update({ notify_enabled: newValue })
      .eq('uid', currentUser.id);

    if (error) {
      console.error("Failed to update notification setting:", error);
      alert("更新失敗");
      // Revert
      setUserData(prev => prev ? ({ ...prev, notify_enabled: !newValue }) : null);
    }
  };

  const handleOpenEdit = () => {
    if (userData) {
        setEditName(userData.name || '');
        setEditAvatarUrl(userData.image_url || '');
        setIsEditProfileOpen(true);
    }
  };

  const handleSaveProfile = async () => {
    if (!currentUser) return;
    if (!editName.trim()) return alert("名稱不可為空");

    setIsSaving(true);
    
    try {
        const { error } = await supabase
            .from('user')
            .update({ 
                name: editName.trim(),
                image_url: editAvatarUrl.trim() 
            })
            .eq('uid', currentUser.id);

        if (error) throw error;

        // Update local state
        setUserData(prev => prev ? ({ ...prev, name: editName, image_url: editAvatarUrl }) : null);
        setIsEditProfileOpen(false);
    } catch (err: any) {
        console.error("Profile update error:", err);
        alert("更新失敗: " + err.message);
    } finally {
        setIsSaving(false);
    }
  };

  const timeAgo = (ts: string) => {
    if (!ts) return "";
    const diff = (Date.now() - new Date(ts).getTime()) / 1000;
    if (diff < 60) return Math.floor(diff) + " sec ago";
    if (diff < 3600) return Math.floor(diff / 60) + " min ago";
    if (diff < 86400) return Math.floor(diff / 3600) + " hr ago";
    return Math.floor(diff / 86400) + " days ago";
  };

  const getStatusLabel = (status: string | undefined, isHelperView: boolean, hasThanks?: boolean, hasReceivedThanks?: boolean) => {
      if (isHelperView) {
        // Helper View Logic
        if (status === 'in_progress') return <span className="text-yellow-500 font-bold">In Progress</span>;
        if (status === 'completed') {
            return (
                <div className="flex gap-2 items-center">
                    <span className="text-green-600 font-bold">Completed</span>
                    {hasReceivedThanks && (
                        <span className="bg-pink-100 text-pink-600 text-xs px-2 py-0.5 rounded-full font-bold border border-pink-200">
                           ❤️ 收到感謝
                        </span>
                    )}
                </div>
            );
        }
        return null;
      } else {
        // Publisher View Logic
        if (!status) return <span className="text-red-500 font-bold">Unassigned</span>;
        if (status === 'in_progress') return <span className="text-yellow-500 font-bold">In Progress</span>;
        if (status === 'completed') {
            return (
                <div className="flex gap-2 items-center">
                    <span className="text-green-600 font-bold">Completed</span>
                    {hasThanks && (
                        <span className="bg-pink-100 text-pink-600 text-xs px-2 py-0.5 rounded-full font-bold border border-pink-200">
                           ❤️ 已感謝
                        </span>
                    )}
                </div>
            );
        }
        return null;
      }
  };

  return (
    <div className="min-h-screen bg-background-light dark:bg-background-dark font-detail text-text-main flex flex-col pb-24">
      
      {/* Top App Bar */}
      <div className="flex items-center p-4 pb-2 justify-between bg-background-light dark:bg-background-dark sticky top-0 z-10">
        {!isTabMode ? (
          <button onClick={onBack} className="flex items-center justify-center rounded-full h-12 w-12 hover:bg-black/5 transition">
            <span className="material-symbols-outlined text-3xl">arrow_back</span>
          </button>
        ) : (
          <div className="w-12"></div>
        )}

        <h2 className="text-text-main text-lg font-bold flex-1 text-center">個人檔案</h2>

        <div className="flex w-12 items-center justify-end">
          <button 
            onClick={() => setIsSettingsOpen(true)} 
            className="flex items-center justify-center h-12 text-text-main hover:bg-black/5 rounded-full w-12 transition-colors"
          >
            <span className="material-symbols-outlined">settings</span>
          </button>
        </div>
      </div>

      <div className="flex p-4">
        <div className="flex w-full flex-col gap-4 items-center">
            
            {/* Header / Bio */}
            <div className="flex gap-4 flex-col items-center">
                <div 
                    className="bg-center bg-cover rounded-full min-h-32 w-32 shadow-soft border-4 border-white bg-gray-200"
                    style={{ backgroundImage: userData?.image_url ? `url('${userData.image_url}')` : undefined }}
                >
                    {!userData?.image_url && <div className="w-full h-full flex items-center justify-center"><span className="material-symbols-outlined text-4xl text-gray-400">person</span></div>}
                </div>

                <div className="flex flex-col items-center">
                    <p className="text-text-main text-[22px] font-extrabold text-center">
                        {userData?.name || "Loading..."}
                    </p>
                </div>
            </div>

            <button 
                onClick={handleOpenEdit}
                className="flex cursor-pointer items-center justify-center rounded-full h-12 px-6 bg-accent-yellow text-text-main font-bold shadow-soft border border-yellow-200 w-full max-w-[480px] hover:brightness-95 transition-all"
            >
                編輯個人資訊
            </button>
        </div>
      </div>

      {/* Time Credit Button */}
      <div className="flex justify-center w-full mt-2">
        <button 
          onClick={onNavigateToWallet}
          className="flex items-center gap-3 bg-accent-profile-mint px-5 py-3 rounded-xl shadow-soft border border-green-200 active:scale-95 transition"
        >
          <span className="material-symbols-outlined text-green-700 text-3xl">account_balance_wallet</span>
          <div className="flex flex-col items-start">
            <p className="text-text-main text-sm font-bold">時間幣錢包</p>
            <p className="text-green-700 text-2xl font-extrabold">{userData?.time_credit ?? 0}</p>
          </div>
        </button>
      </div>

      {/* Stats */}
      <div className="flex flex-wrap gap-4 p-4 mt-2">
        <div className="flex min-w-[158px] flex-1 flex-col gap-2 rounded-xl p-5 bg-accent-profile-mint shadow-soft items-center text-center">
          <span className="material-symbols-outlined text-text-main text-3xl">volunteer_activism</span>
          <p className="text-text-main text-base font-bold leading-normal">Help Given</p>
          <p className="text-text-main text-2xl font-extrabold leading-tight">{stats.helpGiven}</p>
        </div>

        <div className="flex min-w-[158px] flex-1 flex-col gap-2 rounded-xl p-5 bg-accent-pink shadow-soft items-center text-center">
          <span className="material-symbols-outlined text-text-main text-3xl">record_voice_over</span>
          <p className="text-text-main text-base font-bold leading-normal">Requests Made</p>
          <p className="text-text-main text-2xl font-extrabold leading-tight">{stats.requests}</p>
        </div>

        <div className="flex min-w-[158px] flex-1 flex-col gap-2 rounded-xl p-5 bg-accent-profile-blue shadow-soft items-center text-center">
          <span className="material-symbols-outlined text-text-main text-3xl">favorite</span>
          <p className="text-text-main text-base font-bold leading-normal">Thank Yous</p>
          <p className="text-text-main text-2xl font-extrabold leading-tight">{stats.thanks}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="pb-3 px-4">
        <div className="flex border-b border-gray-200 justify-between">
          <button 
            onClick={() => setActiveTab('requests')}
            className={`flex flex-col items-center justify-center border-b-[3px] pb-[13px] pt-4 flex-1 transition-colors ${activeTab === 'requests' ? 'border-b-text-main text-text-main' : 'border-transparent text-gray-500'}`}
          >
            <p className="text-sm font-bold">My Requests</p>
          </button>

          <button 
            onClick={() => setActiveTab('help')}
            className={`flex flex-col items-center justify-center border-b-[3px] pb-[13px] pt-4 flex-1 transition-colors ${activeTab === 'help' ? 'border-b-text-main text-text-main' : 'border-transparent text-gray-500'}`}
          >
            <p className="text-sm font-bold">My Help</p>
          </button>
        </div>
      </div>

      {/* List Items */}
      <div className="flex flex-col gap-3 p-4">
        {taskList.map((item, idx) => (
            <div 
                key={idx}
                onClick={() => onNavigateToTaskDetail(item.id)}
                className="flex items-center gap-4 bg-white dark:bg-background-dark rounded-xl p-4 min-h-[72px] justify-between shadow-soft cursor-pointer hover:bg-gray-50 transition"
            >
                <div className="flex items-center gap-4">
                    <div className={`flex items-center justify-center rounded-lg shrink-0 size-12 ${activeTab === 'requests' ? 'bg-accent-yellow' : 'bg-accent-profile-mint'}`}>
                        <span className="material-symbols-outlined text-text-main">
                            {activeTab === 'requests' ? 'task' : 'volunteer_activism'}
                        </span>
                    </div>
                    <div className="flex flex-col justify-center">
                        <p className="text-text-main text-base font-bold">{item.title}</p>
                        <p className="text-gray-500 text-sm">{timeAgo(item.created_at)}</p>
                        <div className="text-sm mt-1">{getStatusLabel(item.assignmentStatus, item.isHelperView, item.hasThanks, item.hasReceivedThanks)}</div>
                    </div>
                </div>

                <div className="shrink-0 flex items-center justify-center text-gray-400 size-7">
                    <span className="material-symbols-outlined">chevron_right</span>
                </div>
            </div>
        ))}
        {taskList.length === 0 && (
            <div className="text-center text-gray-400 mt-4">No tasks found.</div>
        )}
      </div>

      {onNavigate && (
        <BottomNav currentView={AppView.USER_PROFILE} onNavigate={onNavigate} />
      )}

      {/* Settings Modal */}
      {isSettingsOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            {/* Click outside to close */}
            <div className="absolute inset-0" onClick={() => setIsSettingsOpen(false)}></div>

            <div className="relative w-full max-w-sm overflow-hidden rounded-2xl bg-white dark:bg-zinc-800 shadow-2xl ring-1 ring-black/5">
                <div className="bg-gray-50 dark:bg-zinc-900/50 px-6 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
                    <h3 className="text-lg font-bold text-gray-900 dark:text-white">Settings</h3>
                    <button onClick={() => setIsSettingsOpen(false)} className="text-gray-500 hover:text-gray-700">
                        <span className="material-symbols-outlined">close</span>
                    </button>
                </div>

                <div className="p-6 flex flex-col gap-4">
                    
                    {/* Notification Switch */}
                    <div className="flex items-center justify-between px-1">
                        <div className="flex items-center gap-3">
                            <span className="material-symbols-outlined text-gray-500">notifications</span>
                            <span className="font-bold text-gray-900 dark:text-white">接收通知</span>
                        </div>
                        <button 
                            onClick={handleToggleNotify}
                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 ${userData?.notify_enabled ? 'bg-green-500' : 'bg-gray-200'}`}
                        >
                            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${userData?.notify_enabled ? 'translate-x-6' : 'translate-x-1'}`} />
                        </button>
                    </div>

                    <hr className="border-gray-100 dark:border-gray-700" />

                    {/* Bind LINE - Conditionally rendered based on line_uid existence */}
                    {userData?.line_uid ? (
                        <button 
                            disabled
                            className="flex w-full items-center gap-3 rounded-xl bg-gray-100 px-4 py-3 text-gray-500 cursor-default"
                        >
                            <span className="material-symbols-outlined">link</span>
                            <span className="font-bold flex-1 text-left">已綁定 LINE 帳號</span>
                            <span className="material-symbols-outlined text-green-500">check_circle</span>
                        </button>
                    ) : (
                        <button 
                            onClick={handleBindLine}
                            className="flex w-full items-center gap-3 rounded-xl bg-[#06C755] px-4 py-3 text-white shadow-sm transition-transform active:scale-95"
                        >
                            <span className="material-symbols-outlined">link</span>
                            <span className="font-bold flex-1 text-left">綁定 LINE 帳號</span>
                            <span className="material-symbols-outlined text-sm">chevron_right</span>
                        </button>
                    )}

                    <hr className="border-gray-100 dark:border-gray-700" />

                    {/* Logout */}
                    <button 
                        onClick={onLogout}
                        className="flex w-full items-center gap-3 rounded-xl bg-red-50 px-4 py-3 text-red-600 hover:bg-red-100 transition-colors active:scale-95"
                    >
                        <span className="material-symbols-outlined">logout</span>
                        <span className="font-bold flex-1 text-left">Log Out</span>
                    </button>
                </div>
            </div>
        </div>
      )}

      {/* Edit Profile Modal */}
      {isEditProfileOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-white dark:bg-zinc-800 p-6 rounded-2xl w-full max-w-sm shadow-2xl flex flex-col gap-4">
                 <h3 className="text-xl font-bold text-center">編輯個人檔案</h3>
                 
                 <div>
                    <label className="block text-sm font-bold text-gray-500 mb-1">顯示名稱</label>
                    <input 
                        className="w-full border border-gray-200 rounded-xl p-3 focus:ring-2 focus:ring-green-400 outline-none dark:bg-zinc-900 dark:border-zinc-700" 
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        placeholder="Your Name"
                    />
                 </div>

                 <div>
                    <label className="block text-sm font-bold text-gray-500 mb-1">大頭貼連結 (URL)</label>
                    <input 
                        className="w-full border border-gray-200 rounded-xl p-3 focus:ring-2 focus:ring-green-400 outline-none dark:bg-zinc-900 dark:border-zinc-700" 
                        value={editAvatarUrl}
                        onChange={(e) => setEditAvatarUrl(e.target.value)}
                        placeholder="https://..."
                    />
                 </div>

                 <div className="flex gap-3 mt-2">
                    <button 
                        onClick={() => setIsEditProfileOpen(false)}
                        className="flex-1 py-3 rounded-xl bg-gray-100 dark:bg-zinc-700 font-bold text-gray-500 hover:bg-gray-200"
                        disabled={isSaving}
                    >
                        取消
                    </button>
                    <button 
                        onClick={handleSaveProfile}
                        className="flex-1 py-3 rounded-xl bg-black text-white font-bold shadow-lg hover:opacity-90 disabled:opacity-50"
                        disabled={isSaving}
                    >
                        {isSaving ? '儲存中...' : '儲存變更'}
                    </button>
                 </div>
            </div>
        </div>
      )}

    </div>
  );
};

export default UserProfile;