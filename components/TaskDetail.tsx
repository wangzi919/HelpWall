import React, { useEffect, useState, useRef } from 'react';
import { supabase } from '../services/supabaseClient';
import { Task, ThanksCard } from '../types';

// Declare Leaflet global type
declare const L: any;

interface TaskDetailProps {
  currentUser: any;
  taskId: string | null;
  onBack: () => void;
}

interface UserData {
  uid: string;
  name: string;
  image_url: string;
}

const TaskDetail: React.FC<TaskDetailProps> = ({ currentUser, taskId, onBack }) => {
  const [task, setTask] = useState<Task | null>(null);
  const [publisher, setPublisher] = useState<UserData | null>(null);
  const [thanks, setThanks] = useState<ThanksCard[]>([]);
  
  // Loading State to prevent button flash
  const [isDataFullyLoaded, setIsDataFullyLoaded] = useState(false);

  // Map Refs
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);

  // Modals state
  const [isEditDescOpen, setIsEditDescOpen] = useState(false);
  const [isEditImgOpen, setIsEditImgOpen] = useState(false);
  const [isTimePickerOpen, setIsTimePickerOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  
  // Completion Modal
  const [isCompleteModalOpen, setIsCompleteModalOpen] = useState(false);
  
  // Thanks Modal
  const [isThanksModalOpen, setIsThanksModalOpen] = useState(false);
  const [thanksMessage, setThanksMessage] = useState('');

  // Form values
  const [editDescValue, setEditDescValue] = useState('');
  const [editImgValue, setEditImgValue] = useState('');

  useEffect(() => {
    if (!taskId) return;
    initDetail();
  }, [taskId]);

  // Initialize Map when task is loaded
  useEffect(() => {
    if (task && mapContainerRef.current && !mapInstanceRef.current && typeof L !== 'undefined') {
        // Updated Map Config: Enable interactions for better usability
        const map = L.map(mapContainerRef.current, {
            zoomControl: true,      // Show +/- buttons
            dragging: true,         // Allow panning
            scrollWheelZoom: true,  // Allow zooming with scroll
            doubleClickZoom: true,
            touchZoom: true
        }).setView([task.lat, task.lng], 15);

        L.tileLayer('https://cartodb-basemaps-a.global.ssl.fastly.net/light_all/{z}/{x}/{y}.png', {
            attribution: '&copy; OpenStreetMap contributors'
        }).addTo(map);

        // Marker
        const html = `
            <div style="
                width: 24px; height: 24px;
                background-color: ${task.color || '#F0F0F0'};
                border: 3px solid white;
                border-radius: 50%;
                box-shadow: 0 4px 6px rgba(0,0,0,0.2);
            "></div>
        `;
        const icon = L.divIcon({ className: '', html, iconSize: [24, 24] });
        L.marker([task.lat, task.lng], { icon }).addTo(map);

        mapInstanceRef.current = map;
        
        // Force a resize calculation after a short delay to ensure map renders correctly in the container
        setTimeout(() => {
            map.invalidateSize();
        }, 100);
    }

    // Cleanup map on unmount
    return () => {
        if (mapInstanceRef.current) {
            mapInstanceRef.current.remove();
            mapInstanceRef.current = null;
        }
    }
  }, [task]);

  const initDetail = async () => {
    setIsDataFullyLoaded(false); // Reset loading state on init
    await loadTaskData(taskId!);
    setIsDataFullyLoaded(true); // Only set true after all awaits are done
  };

  const loadTaskData = async (id: string) => {
    // 1. Task info (includes expected_time, time_credit, status, helper_uid now)
    const { data: taskData } = await supabase.from("tasks").select("*").eq("id", id).single();
    if (taskData) {
        setTask(taskData);
        // Load Publisher
        const { data: userData } = await supabase.from("user").select("*").eq("uid", taskData.user_uid).single();
        setPublisher(userData);
    }

    // 2. Thanks Card (Using task_id as PK query)
    const { data: thanksData } = await supabase.from("thanks_card").select("*").eq("task_id", id);
    setThanks(thanksData || []);
  };

  // --- Logic Helpers ---
  const timeAgo = (timestamp: string) => {
    const diff = (Date.now() - new Date(timestamp).getTime()) / 1000;
    if (diff < 60) return "just now";
    if (diff < 3600) return Math.floor(diff/60) + " minutes ago";
    if (diff < 86400) return Math.floor(diff/3600) + " hours ago";
    return Math.floor(diff/86400) + " days ago";
  };

  const isOwner = currentUser && task && currentUser.id === task.user_uid;
  const isAssigned = task && (task.status === 'in_progress' || task.status === 'completed');
  const isCompleted = task?.status === 'completed';
  const hasSentThanks = thanks.length > 0;
  
  // Logic for showing buttons (Strictly check isDataFullyLoaded)
  const showAcceptBtn = isDataFullyLoaded && !isAssigned && !isOwner;
  const showCompleteBtn = isDataFullyLoaded && task?.status === "in_progress" && isOwner;
  const showEditBtns = isDataFullyLoaded && isOwner && !isAssigned;
  
  // Show "Send Thanks" only if completed, I am owner, and haven't sent yet
  const showSendThanksBtn = isDataFullyLoaded && isCompleted && isOwner && !hasSentThanks;

  // --- Actions ---

  const handleAcceptTask = async () => {
    if (!currentUser) return alert("Please login first.");
    
    // Double check status from DB before update to prevent race condition
    const { data: currentTask } = await supabase
      .from("tasks")
      .select("status")
      .eq("id", taskId)
      .single();

    if (currentTask && (currentTask.status === 'in_progress' || currentTask.status === 'completed')) {
        return alert("This task is already taken.");
    }

    const { error } = await supabase
      .from("tasks")
      .update({
        helper_uid: currentUser.id,
        status: "in_progress",
      })
      .eq("id", taskId);

    if (error) return alert("Error accepting task.");

    alert("Task accepted!");
    initDetail(); // Reload
  };

  const handleCompleteTask = () => {
    // Open the modal confirmation
    setIsCompleteModalOpen(true);
  };

  const confirmCompletion = async () => {
    if (!task?.time_credit || !task.helper_uid || !currentUser) return;

    const credit = task.time_credit;
    const helperId = task.helper_uid;
    const publisherId = currentUser.id; // Owner clicked it

    // 1. Deduct from publisher
    let { error: minusErr } = await supabase.rpc("increment_credit", {
      user_uid: publisherId,
      amount: -credit
    });
    if (minusErr) return alert("扣除發布者時間幣失敗：" + minusErr.message);

    // 2. Add to helper
    let { error: plusErr } = await supabase.rpc("increment_credit", {
      user_uid: helperId,
      amount: credit
    });
    if (plusErr) return alert("增加協助者時間幣失敗：" + plusErr.message);

    // 3. Log logs
    await supabase.from("time_credit_log").insert([
      { user_uid: publisherId, related_task: taskId, change_amount: -credit },
      { user_uid: helperId, related_task: taskId, change_amount: credit }
    ]);

    // 4. Update status directly on tasks table
    const { error: statusErr } = await supabase
      .from("tasks")
      .update({ status: "completed" })
      .eq("id", taskId);

    if (statusErr) return alert("Error marking complete.");

    // alert("任務已完成！時間幣已發給協助者！");
    setIsCompleteModalOpen(false);
    initDetail(); // Reload to show updated status
  };

  const handleSendThanks = async () => {
      if (!thanksMessage.trim()) return alert("請寫下您的感謝");
      if (!task?.helper_uid || !currentUser) return;

      const { error: thanksErr } = await supabase.from("thanks_card").insert({
            sender_uid: currentUser.id,
            receiver_uid: task.helper_uid,
            task_id: taskId,
            message: thanksMessage.trim()
        });
      
      if (thanksErr) {
          alert("發送失敗: " + thanksErr.message);
      } else {
          alert("感謝卡已發送！");
          setIsThanksModalOpen(false);
          initDetail();
      }
  };

  // --- Edit Actions ---
  const openEditDesc = () => {
    setEditDescValue(task?.description || '');
    setIsEditDescOpen(true);
  };

  const saveDescription = async () => {
    if (!editDescValue.trim()) return alert("描述不可為空");
    
    const { error } = await supabase
      .from("tasks")
      .update({ description: editDescValue })
      .eq("id", taskId);

    if (error) return alert("更新失敗：" + error.message);
    
    setIsEditDescOpen(false);
    initDetail();
  };

  const openEditImg = () => {
    setEditImgValue(task?.image_url || '');
    setIsEditImgOpen(true);
  };

  const saveImageUrl = async () => {
    if (!editImgValue.trim()) return alert("圖片網址不可為空");
    const { error } = await supabase
      .from("tasks")
      .update({ image_url: editImgValue })
      .eq("id", taskId);

    if (error) return alert("更新失敗：" + error.message);
    
    setIsEditImgOpen(false);
    initDetail();
  };

  const updateExpectedTime = async (minutes: number) => {
    const time_credit = minutes / 5;
    // Updated to write to tasks table directly
    const { error } = await supabase
        .from("tasks")
        .update({
          expected_time: `${minutes} minutes`,
          time_credit: time_credit
        })
        .eq("id", taskId);

    if (error) alert("更新失敗：" + error.message);
    setIsTimePickerOpen(false);
    initDetail();
  };

  const confirmDeleteTask = async () => {
    if (!currentUser) return;
    
    // Delete task
    const { error } = await supabase.from("tasks").delete().eq("id", taskId);
    if (error) {
        alert("刪除失敗：" + error.message);
        return;
    }
    setIsDeleteModalOpen(false);
    onBack(); // Go back to dashboard
  };


  if (!task) return (
      <div className="fixed inset-0 z-50 bg-background-light flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-detail-primary border-t-transparent rounded-full animate-spin"></div>
      </div>
  );

  return (
    <div className="relative flex h-auto min-h-screen w-full flex-col overflow-x-hidden font-detail bg-background-light dark:bg-background-dark text-text-main">
      
      {/* Top Bar */}
      <div className="sticky top-0 z-10 flex items-center bg-background-light/80 dark:bg-background-dark/80 p-4 pb-2 justify-between backdrop-blur-sm">
        <button onClick={onBack} className="flex items-center justify-center rounded-full h-12 w-12 hover:bg-black/5 transition">
          <span className="material-symbols-outlined text-3xl">arrow_back</span>
        </button>
        <h2 className="text-lg font-bold flex-1 text-center">幫助詳情</h2>
       {/* <button className="flex items-center justify-center rounded-full h-12 w-12">
          <span className="material-symbols-outlined text-3xl">more_horiz</span>
        </button>*/}
      </div>

      <main className="flex flex-col gap-4 p-4 pb-32">
        {/* Requester Info */}
        <div className="flex items-center gap-4 bg-white dark:bg-zinc-800 p-4 rounded-xl shadow-soft">
            <div 
                className="bg-center bg-no-repeat aspect-square bg-cover rounded-full h-16 w-16 bg-gray-200"
                style={{ backgroundImage: publisher?.image_url ? `url('${publisher.image_url}')` : undefined }}
            ></div>
            <div className="flex-1">
                <p className="text-lg font-bold">{publisher?.name || 'Unknown'}</p>
                <p className="text-sm text-text-subtle">{task.created_at ? timeAgo(task.created_at) : ''}</p>
            </div>
        </div>

        {/* Task Card */}
        <div className="bg-white dark:bg-zinc-800 p-6 rounded-xl shadow-soft flex flex-col gap-4 relative">
            <h1 className="text-[28px] font-extrabold leading-tight">{task.title}</h1>
            <p className="text-base leading-relaxed whitespace-pre-wrap">
                {task.description}
            </p>

            <div className="flex gap-3 flex-wrap items-center pt-2">
                {/* Expected Time tag */}
                <span 
                    onClick={() => showEditBtns && setIsTimePickerOpen(true)}
                    className={`px-3 py-1 rounded-full text-sm font-bold bg-accent-mint text-text-main whitespace-nowrap ${showEditBtns ? 'cursor-pointer hover:bg-green-200' : 'cursor-default'}`}
                >
                    {task.expected_time || 'N/A'}
                </span>

                {/* Reward tag */}
                <span className="px-3 py-1 rounded-full text-sm font-bold bg-accent-yellow text-text-main whitespace-nowrap flex items-center gap-1">
                    +{task.time_credit || 0} <span className="text-lg">⏱</span>
                </span>
            </div>
        </div>

        {/* Action Buttons for Owner */}
        {showEditBtns && (
            <div className="flex flex-wrap gap-2 justify-start md:justify-end mt-4">
                <button onClick={openEditDesc} className="px-4 py-2 rounded-full bg-blue-600 shadow-lg font-bold text-white text-sm transition-transform duration-150 active:scale-95 flex items-center gap-1">
                    ✏️ 修改文字
                </button>
                <button onClick={openEditImg} className="px-4 py-2 rounded-full bg-orange-600 shadow-lg font-bold text-white text-sm transition-transform duration-150 active:scale-95 flex items-center gap-1">
                    🖼️ 修改圖片
                </button>
                <button onClick={() => setIsDeleteModalOpen(true)} className="px-4 py-2 rounded-full bg-red-500 shadow-lg font-bold text-white text-sm transition-transform duration-150 active:scale-95 flex items-center gap-1">
                    🗑️ 刪除
                </button>
            </div>
        )}

        {/* Location Map View */}
        <div className="flex flex-col gap-2">
            <h3 className="font-bold text-lg px-2 flex items-center gap-2">
                <span className="material-symbols-outlined text-red-500">location_on</span>
                Task Location
            </h3>
            {/* Map Container: Increased height to h-80, removed pointer-events-none overlay */}
            <div className="relative w-full h-80 rounded-xl overflow-hidden shadow-soft border border-stone-200 bg-gray-100">
                 <div ref={mapContainerRef} className="w-full h-full z-0"></div>
            </div>
        </div>

        {/* Thank You Note */}
        {thanks.length > 0 && (
            <div className="relative mt-6 rotate-[-2deg]">
                <div className="absolute top-[-10px] right-[-10px] text-3xl">📌</div>
                <div className="bg-accent-yellow p-6 rounded-lg shadow-soft flex flex-col items-center text-center gap-3">
                    <h3 className="font-handwritten text-2xl">A Big Thank You!</h3>
                    <p className="font-handwritten text-lg leading-snug">{thanks[0].message}</p>
                </div>
            </div>
        )}
      </main>

      {/* Footer Actions */}
      <div className="fixed bottom-0 left-0 w-full p-4 bg-background-light dark:bg-background-dark pointer-events-none z-40">
          <div className="pointer-events-auto">
            {showAcceptBtn && (
                <button onClick={handleAcceptTask} className="flex w-full cursor-pointer items-center justify-center overflow-hidden rounded-full h-14 bg-accent-mint text-text-main gap-2 text-lg font-bold leading-normal tracking-wide shadow-soft hover:opacity-90">
                    Accept This Task
                </button>
            )}
            
            {showCompleteBtn && (
                <button onClick={handleCompleteTask} className="flex w-full cursor-pointer items-center justify-center overflow-hidden rounded-full h-14 bg-accent-peach text-text-main gap-2 text-lg font-bold leading-normal tracking-wide shadow-soft hover:opacity-90">
                    Mark as Completed
                </button>
            )}

            {showSendThanksBtn && (
                <button onClick={() => setIsThanksModalOpen(true)} className="flex w-full cursor-pointer items-center justify-center overflow-hidden rounded-full h-14 bg-pink-300 text-text-main gap-2 text-lg font-bold leading-normal tracking-wide shadow-soft hover:opacity-90">
                    ❤️ Send Gratitude
                </button>
            )}
          </div>
      </div>

      {/* --- Modals --- */}
      
      {/* Complete Task Confirmation Modal (Simplified) */}
      {isCompleteModalOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[70] p-4">
            <div className="bg-white dark:bg-zinc-800 p-6 rounded-xl shadow-xl w-full max-w-sm flex flex-col gap-4">
                <h2 className="text-xl font-bold text-center">完成任務確認</h2>
                
                <div className="bg-yellow-50 dark:bg-yellow-900/20 p-4 rounded-lg flex items-center gap-3">
                   <span className="text-2xl">💰</span>
                   <p className="text-sm">
                     確認完成後，系統將自動轉帳 <span className="font-bold text-yellow-600">{task?.time_credit} 時間幣</span> 給協助者。
                   </p>
                </div>
                
                <p className="text-gray-500 text-sm text-center">
                    您可以在完成後，隨時回來發送感謝卡給對方。
                </p>

                <div className="flex gap-3 mt-2">
                    <button 
                        onClick={() => setIsCompleteModalOpen(false)} 
                        className="flex-1 py-3 rounded-full bg-gray-100 dark:bg-zinc-700 font-bold text-gray-500"
                    >
                        取消
                    </button>
                    <button 
                        onClick={confirmCompletion} 
                        className="flex-1 py-3 rounded-full bg-accent-peach text-text-main font-bold shadow-soft hover:opacity-90"
                    >
                        確認完成
                    </button>
                </div>
            </div>
        </div>
      )}

      {/* Write Thanks Card Modal (New) */}
      {isThanksModalOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[70] p-4">
            <div className="bg-white dark:bg-zinc-800 p-6 rounded-xl shadow-xl w-full max-w-sm flex flex-col gap-4">
                <h2 className="text-xl font-bold text-center">寫張感謝卡 ❤️</h2>
                
                <div>
                    <textarea
                        value={thanksMessage}
                        onChange={(e) => setThanksMessage(e.target.value)}
                        placeholder="謝謝你的幫忙！真的幫了大忙..."
                        className="w-full border p-3 rounded-xl h-32 focus:ring-2 focus:ring-pink-300 outline-none bg-gray-50 resize-none font-handwritten text-lg"
                    ></textarea>
                </div>

                <div className="flex gap-3 mt-2">
                    <button 
                        onClick={() => setIsThanksModalOpen(false)} 
                        className="flex-1 py-3 rounded-full bg-gray-100 dark:bg-zinc-700 font-bold text-gray-500"
                    >
                        稍後再寫
                    </button>
                    <button 
                        onClick={handleSendThanks} 
                        className="flex-1 py-3 rounded-full bg-pink-300 text-text-main font-bold shadow-soft hover:opacity-90"
                    >
                        發送感謝
                    </button>
                </div>
            </div>
        </div>
      )}

      {/* Edit Desc Modal */}
      {isEditDescOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white p-6 rounded-xl w-full max-w-sm flex flex-col gap-3">
                <h2 className="font-bold text-lg">Edit Description</h2>
                <textarea 
                    value={editDescValue}
                    onChange={(e) => setEditDescValue(e.target.value)}
                    className="border p-2 rounded-lg h-32 focus:ring-detail-primary"
                ></textarea>
                <div className="flex gap-2">
                    <button onClick={() => setIsEditDescOpen(false)} className="flex-1 text-sm text-gray-500 py-2">Cancel</button>
                    <button onClick={saveDescription} className="flex-1 bg-detail-primary text-white rounded-lg py-2 font-bold">Save</button>
                </div>
            </div>
        </div>
      )}

      {/* Edit Image Modal */}
      {isEditImgOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white p-6 rounded-xl w-full max-w-sm flex flex-col gap-3">
                <h2 className="font-bold text-lg">Edit Image URL</h2>
                <input 
                    value={editImgValue}
                    onChange={(e) => setEditImgValue(e.target.value)}
                    className="border p-2 rounded-lg focus:ring-detail-primary"
                />
                <div className="flex gap-2">
                    <button onClick={() => setIsEditImgOpen(false)} className="flex-1 text-sm text-gray-500 py-2">Cancel</button>
                    <button onClick={saveImageUrl} className="flex-1 bg-detail-primary text-white rounded-lg py-2 font-bold">Save</button>
                </div>
            </div>
        </div>
      )}

      {/* Time Picker Modal */}
      {isTimePickerOpen && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-[60]">
            <div className="bg-white dark:bg-zinc-800 p-6 rounded-xl w-72 shadow-xl flex flex-col gap-3">
                <h2 className="text-lg font-bold mb-2">Select Expected Time</h2>
                <div className="flex flex-col gap-2">
                    {[5, 10, 15, 20, 25, 30].map(min => (
                        <button 
                            key={min}
                            onClick={() => updateExpectedTime(min)}
                            className="px-4 py-2 rounded-lg bg-accent-mint hover:bg-green-200 text-left font-medium"
                        >
                            {min} minutes
                        </button>
                    ))}
                </div>
                <button onClick={() => setIsTimePickerOpen(false)} className="mt-4 px-4 py-2 rounded-full bg-gray-100 dark:bg-zinc-700 w-full">Cancel</button>
            </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {isDeleteModalOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
            <div className="bg-white dark:bg-zinc-800 p-6 rounded-xl shadow-xl w-full max-w-sm flex flex-col gap-4">
                <h2 className="text-lg font-bold text-red-600">Delete Task?</h2>
                <p className="text-text-main dark:text-gray-200 text-sm">
                    This action cannot be undone. Are you sure you want to delete this task?
                </p>
                <div className="flex justify-end gap-3 mt-4">
                    <button onClick={() => setIsDeleteModalOpen(false)} className="px-4 py-2 rounded-full bg-gray-200 dark:bg-zinc-700 text-sm font-bold">Cancel</button>
                    <button onClick={confirmDeleteTask} className="px-4 py-2 rounded-full bg-red-500 text-white text-sm font-bold">Delete</button>
                </div>
            </div>
        </div>
      )}

    </div>
  );
};

export default TaskDetail;