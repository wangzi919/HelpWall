import React, { useEffect, useState, useRef } from 'react';
import { supabase, SUPABASE_URL, SUPABASE_KEY } from '../services/supabaseClient';
import { Task, ThanksCard } from '../types';
import TermsModal from './TermsModal';

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
  help_count?: number; // Added for review stats
  thanks_count?: number; // Added for review stats
  reputation_points?: number;
}

const TaskDetail: React.FC<TaskDetailProps> = ({ currentUser, taskId, onBack }) => {
  const [task, setTask] = useState<Task | null>(null);
  const [publisher, setPublisher] = useState<UserData | null>(null);
  const [helper, setHelper] = useState<UserData | null>(null);
  const [thanks, setThanks] = useState<ThanksCard[]>([]);
  const [applicantsData, setApplicantsData] = useState<UserData[]>([]);
  
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
  
  // Applicant Review Modal
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);
  const [selectedApplicant, setSelectedApplicant] = useState<UserData | null>(null);

  // Form values
  const [editDescValue, setEditDescValue] = useState('');
  const [editImgValue, setEditImgValue] = useState('');
  
  // 🔽 NEW：Update Location
  const [isUpdateLocationMode, setIsUpdateLocationMode] = useState(false);
  const [tempLocation, setTempLocation] = useState<{ lat: number; lng: number } | null>(null);
  const tempMarkerRef = useRef<any>(null);
  const [selectedAddress, setSelectedAddress] = useState<string>(''); // 🔽 NEW: 反白框顯示地址

  const [isTermsOpen, setIsTermsOpen] = useState(false);

  // Report State
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [isReporting, setIsReporting] = useState(false);

  const [isResolutionGuideOpen, setIsResolutionGuideOpen] = useState(false);

  useEffect(() => {
    if (!taskId) return;
    initDetail();
  }, [taskId]);

  // Initialize Map when task is loaded
  useEffect(() => {
    if (task && mapContainerRef.current && typeof L !== 'undefined') {
      const map = L.map(mapContainerRef.current, {
        zoomControl: true,
        dragging: true,
        scrollWheelZoom: true,
        doubleClickZoom: true,
        touchZoom: true,
      }).setView([task.lat, task.lng], 15);

      L.tileLayer(
        'https://cartodb-basemaps-a.global.ssl.fastly.net/light_all/{z}/{x}/{y}.png',
        { attribution: '&copy; OpenStreetMap contributors' }
      ).addTo(map);

      // 原本任務 marker
      const html = `
      <div style="
        position: relative;
        width: 32px;
        height: 32px;
        background: ${'#FF5252'};
        border-radius: 50% 50% 50% 0;
        transform: rotate(-45deg);
        box-shadow: 0 2px 8px rgba(0,0,0,0.35);
      ">
        <div style="
          position: absolute;
          top: 8px;
          left: 8px;
          width: 16px;
          height: 16px;
          background: white;
          border-radius: 50%;
        "></div>
      </div>
      `;

      const icon = L.divIcon({
        className: '',
        html,
        iconSize: [32, 32],
        iconAnchor: [16, 32],
      });
      L.marker([task.lat, task.lng], { icon }).addTo(map);

      // 🔽 NEW: 拖曳 marker 模式
      if (isUpdateLocationMode) {
        const marker = L.marker([task.lat, task.lng], { draggable: true }).addTo(map);
        tempMarkerRef.current = marker;

        const updateAddress = async (lat: number, lng: number) => {
          try {
            // 使用 OpenStreetMap Nominatim API reverse geocoding
            const res = await fetch(
              `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}`
            );
            const data = await res.json();
            setSelectedAddress(data.display_name || '');
          } catch (err) {
            setSelectedAddress('');
          }
        };

        marker.on('drag', (e: any) => {
          const { lat, lng } = e.target.getLatLng();
          setTempLocation({ lat, lng });
          updateAddress(lat, lng);
        });

        // 初始化 address
        updateAddress(task.lat, task.lng);
      }

      mapInstanceRef.current = map;

      setTimeout(() => map.invalidateSize(), 100);
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
      if (tempMarkerRef.current) {
        tempMarkerRef.current.remove();
        tempMarkerRef.current = null;
      }
      setSelectedAddress('');
    };
  }, [task, isUpdateLocationMode]);

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
        
        // Load Helper if exists
        if (taskData.helper_uid) {
            const { data: helperData } = await supabase.from("user").select("*").eq("uid", taskData.helper_uid).single();
            setHelper(helperData);
        } else {
            setHelper(null);
        }

        // Load Applicants if I am the owner and review is required
        if (taskData.requires_review && taskData.user_uid === currentUser?.id && taskData.applicants && taskData.applicants.length > 0) {
            const { data: applicants } = await supabase.from("user").select("*").in("uid", taskData.applicants);
            setApplicantsData(applicants || []);
        }
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
  
  // Check if I have already applied
  const hasApplied = task?.applicants?.includes(currentUser?.id);

  // --- Actions ---
  // const triggerAcceptTask = () => {
  //   if (!currentUser) return alert("Please login first.");
  //   if (hasApplied) return;
  //   setIsTermsOpen(true); // Show terms before accepting/applying
  // };

  const handleTermsConfirmed = async () => {
  setIsTermsOpen(false); // 先關條款

  try {
    await handleAcceptTask(); // 或 handleApplyTask()，根據你的流程
  } catch (err) {
    console.error(err);
  }
};

  const handleApplyTask = async () => {
    if (!currentUser) return alert("Please login first.");
    if (!task) return;

    // Use JSONB array append (Assuming 'applicants' is a text[] or jsonb column)
    // Since we don't have direct array_append in simple JS client easily without knowing DB exact type,
    // we fetch current, append, and update.
    const currentApplicants = task.applicants || [];
    if (currentApplicants.includes(currentUser.id)) return;

    const newApplicants = [...currentApplicants, currentUser.id];

    const { error } = await supabase
      .from("tasks")
      .update({ applicants: newApplicants })
      .eq("id", taskId);

    if (error) return alert("申請失敗：" + error.message);

    alert("申請已送出，請等待發布者審核！");
    initDetail();
  };

  const handleAcceptTask = async () => {
    if (!currentUser) return alert("Please login first.");

    // Logic Split: Instant Accept vs Apply
    if (task?.requires_review) {
        await handleApplyTask();
        return;
    }
    
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

  const handleSendReport = async () => {
    if (!reportReason.trim()) return alert("請輸入投訴原因");
    if (!currentUser || !task) return;

    setIsReporting(true);
    try {
        const { data: { session } } = await supabase.auth.getSession();
        const payload = {
            task_id: task.id,
            task_title: task.title,
            publisher_uid: task.user_uid,
            publisher_name: publisher?.name || 'Unknown',
            reporter_uid: currentUser.id,
            reporter_email: currentUser.email,
            reason: reportReason.trim(),
            target_email: 'helpwall.official@gmail.com'
        };

        const response = await fetch(`${SUPABASE_URL}/functions/v1/send-complaint`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session?.access_token}`,
                'apikey': SUPABASE_KEY
            },
            body: JSON.stringify(payload)
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.error || "發送失敗");
        }

        alert("投訴已送出，管理員將會儘速處理。");
        setIsReportModalOpen(false);
        setIsResolutionGuideOpen(true);
        setReportReason('');
    } catch (err: any) {
        console.error("Report error:", err);
        alert(`投訴發送失敗: ${err.message}`);
    } finally {
        setIsReporting(false);
    }
  };
  const handleCopyTemplate = () => {
      const template = `【HelpWall 任務爭議協調通知】
你好，我是 [您的名稱]，關於任務「${task?.title}」在執行過程中發生的爭議（${reportReason || '執行不符預期'}），我已向平台報備。

依據平台服務條款，希望能與你進行誠信協商。我的訴求如下：
[請在此填入您的訴求，例如：部分退還時間幣 / 補救措施]

希望能於 3 日內收到您的回覆，以避免進一步尋求法律或調解程序。`;
      
      navigator.clipboard.writeText(template);
      alert("協調模板已複製到剪貼簿！");
  };

  const handleReviewApplicant = async (applicant: UserData) => {
     const [help, thanks, profile] = await Promise.all([
        supabase.from("tasks").select("*", { count: "exact", head: true }).eq("helper_uid", applicant.uid).eq("status", "completed"),
        supabase.from("thanks_card").select("*", { count: "exact", head: true }).eq("receiver_uid", applicant.uid),
        supabase.from("user").select("reputation_points").eq("uid", applicant.uid).single()
     ]);
     setSelectedApplicant({ 
        ...applicant, 
        help_count: help.count || 0, 
        thanks_count: thanks.count || 0,
        reputation_points: profile.data?.reputation_points ?? 100 
     });
     setIsReviewModalOpen(true);
  };


  const handleApproveApplicant = async () => {
      if (!selectedApplicant || !task) return;

      const { error } = await supabase
        .from("tasks")
        .update({
            helper_uid: selectedApplicant.uid,
            status: "in_progress",
            // Clear applicants or keep them? Keep them is fine.
        })
        .eq("id", taskId);

      if (error) return alert("審核失敗：" + error.message);
      
      setIsReviewModalOpen(false);
      alert("已同意接取！");
      initDetail();
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

  const getReputationLabel = (points: number) => {
      if (points >= 120) return { label: '信譽極佳', color: 'text-green-600', bg: 'bg-green-100' };
      if (points >= 100) return { label: '值得信賴', color: 'text-blue-600', bg: 'bg-blue-100' };
      if (points >= 80) return { label: '一般', color: 'text-orange-600', bg: 'bg-orange-100' };
      return { label: '信譽偏低', color: 'text-red-600', bg: 'bg-red-100' };
  };

    // 🔽 NEW
  const saveNewLocation = async () => {
    if (!tempLocation) return alert("請在地圖上點選新位置");

    const { error } = await supabase
      .from("tasks")
      .update({
        lat: tempLocation.lat,
        lng: tempLocation.lng,
      })
      .eq("id", taskId);

    if (error) {
      alert("更新地點失敗：" + error.message);
      return;
    }

    // reset 狀態
    setIsUpdateLocationMode(false);
    setTempLocation(null);

    if (tempMarkerRef.current) {
      tempMarkerRef.current.remove();
      tempMarkerRef.current = null;
    }

    initDetail();
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
        <button 
          onClick={() => setIsReportModalOpen(true)}
          className="flex items-center justify-center rounded-full h-12 w-12 hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"
          title="投訴此任務"
        >
          <span className="material-symbols-outlined text-3xl">report</span>
        </button>
      </div>

      <main className="flex flex-col gap-4 p-4 pb-32">
        {/* Requester Info */}
        <div className="flex items-center gap-4 bg-white dark:bg-zinc-800 p-4 rounded-xl shadow-soft">
            <div 
                className="bg-center bg-no-repeat aspect-square bg-cover rounded-full h-16 w-16 bg-gray-200"
                style={{ backgroundImage: publisher?.image_url ? `url('${publisher.image_url}')` : undefined }}
            >
               {!publisher?.image_url && <span className="flex h-full w-full items-center justify-center material-symbols-outlined text-gray-400">person</span>}
            </div>
            <div className="flex-1">
                <p className="text-xs text-text-subtle mb-0.5">Published by</p>
                <p className="text-lg font-bold">{publisher?.name || 'Unknown'}</p>
                <p className="text-sm text-text-subtle">{task.created_at ? timeAgo(task.created_at) : ''}</p>
            </div>
        </div>

        {/* Helper Info (If Assigned) */}
        {helper && (
            <div className="flex items-center gap-4 bg-blue-50 dark:bg-blue-900/20 p-4 rounded-xl shadow-soft border border-blue-100 dark:border-blue-800">
                <div 
                    className="bg-center bg-no-repeat aspect-square bg-cover rounded-full h-16 w-16 bg-gray-200 shadow-sm border-2 border-white"
                    style={{ backgroundImage: helper.image_url ? `url('${helper.image_url}')` : undefined }}
                >
                  {!helper.image_url && <span className="flex h-full w-full items-center justify-center material-symbols-outlined text-gray-400">person</span>}
                </div>
                <div className="flex-1">
                    <p className="text-xs font-bold text-blue-500 uppercase tracking-wider mb-0.5">Accepted By</p>
                    <p className="text-lg font-bold">{helper.name}</p>
                </div>
            </div>
        )}

        {/* Task Card */}
        <div className="bg-white dark:bg-zinc-800 p-6 rounded-xl shadow-soft flex flex-col gap-4 relative">
            <h1 className="text-[28px] font-extrabold leading-tight flex items-center gap-2">
                {task.requires_review && (
                    <span className="material-symbols-outlined text-red-500 text-2xl" title="需審核">security</span>
                )}
                {task.title}
            </h1>
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

        {/* APPLICANTS SECTION (Owner View) */}
        {isOwner && task.requires_review && !isAssigned && (
             <div className="bg-red-50 border border-red-100 p-4 rounded-xl flex flex-col gap-3">
                 <div className="flex items-center justify-between">
                     <h3 className="font-bold text-gray-700 flex items-center gap-2">
                         <span className="material-symbols-outlined text-red-500">group</span>
                         申請者名單 ({applicantsData.length})
                     </h3>
                     <span className="text-xs text-gray-500 bg-white px-2 py-1 rounded-lg">需審核同意</span>
                 </div>
                 
                 {applicantsData.length === 0 ? (
                     <div className="text-center text-gray-400 text-sm py-4">目前尚無人申請</div>
                 ) : (
                     <div className="flex flex-col gap-2">
                         {applicantsData.map(app => (
                             <div key={app.uid} className="flex items-center justify-between bg-white p-3 rounded-lg shadow-sm">
                                 <div className="flex items-center gap-3">
                                     <div 
                                        className="w-10 h-10 rounded-full bg-cover bg-center bg-gray-200"
                                        style={{ backgroundImage: app.image_url ? `url('${app.image_url}')` : undefined }}
                                     ></div>
                                     <span className="font-bold text-gray-800">{app.name}</span>
                                 </div>
                                 <button 
                                    onClick={() => handleReviewApplicant(app)}
                                    className="px-3 py-1.5 bg-black text-white text-xs font-bold rounded-full hover:opacity-80"
                                 >
                                     審核
                                 </button>
                             </div>
                         ))}
                     </div>
                 )}
             </div>
        )}

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
                <button
                  onClick={() => {
                    setIsUpdateLocationMode(true);
                    setTempLocation(null);
                    setSelectedAddress('');
                  }}
                  className="px-4 py-2 rounded-full bg-emerald-600 shadow-lg font-bold text-white text-sm"
                >
                  📍 更新地點
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
        {isUpdateLocationMode && (
        <div className="flex flex-col gap-2 mt-3 p-2 border-4 border-emerald-400 rounded-xl bg-emerald-50">
          <p className="text-sm font-medium text-emerald-800">
            {selectedAddress || '拖曳標記到新位置以取得地址'}
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => {
                setIsUpdateLocationMode(false);
                setTempLocation(null);
                setSelectedAddress('');
                if (tempMarkerRef.current) {
                  tempMarkerRef.current.remove();
                  tempMarkerRef.current = null;
                }
              }}
              className="flex-1 py-2 rounded-full bg-gray-200 font-bold"
            >
              取消
            </button>

            <button
              onClick={saveNewLocation}
              className="flex-1 py-2 rounded-full bg-emerald-500 text-white font-bold"
            >
              確認更新
            </button>
          </div>
        </div>
      )}

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
                <button 
                    onClick={() => {
                      setIsTermsOpen(true);
                    }}

                    disabled={hasApplied}
                    className={`flex w-full cursor-pointer items-center justify-center overflow-hidden rounded-full h-14 text-text-main gap-2 text-lg font-bold leading-normal tracking-wide shadow-soft hover:opacity-90 ${hasApplied ? 'bg-gray-300 text-gray-500 cursor-not-allowed' : 'bg-accent-mint'}`}
                >
                    {hasApplied 
                        ? '已申請，等待發布者審核' 
                        : (task.requires_review ? '申請接取 (需審核)' : 'Accept This Task')
                    }
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
      <TermsModal
        isOpen={isTermsOpen}
        onClose={() => setIsTermsOpen(false)}
        onConfirm={handleTermsConfirmed}
        actionType="accept"
      />
      
      {/* Report Modal */}
      {isReportModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-md p-4 animate-in fade-in duration-200">
          <div className="absolute inset-0" onClick={() => !isReporting && setIsReportModalOpen(false)} />
          <div className="relative w-full max-w-md flex flex-col rounded-[2rem] bg-white shadow-2xl transition-all animate-in zoom-in-95 duration-300 overflow-hidden">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-red-50/50">
              <h2 className="text-xl font-black text-red-800 flex items-center gap-2">
                <span className="material-symbols-outlined text-red-500">report</span>
                投訴此任務
              </h2>
              <button onClick={() => !isReporting && setIsReportModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="bg-gray-50 p-4 rounded-xl">
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">正在投訴任務</p>
                <p className="text-sm font-bold text-gray-800 truncate">{task.title}</p>
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">請說明投訴原因</label>
                <textarea 
                  value={reportReason}
                  onChange={(e) => setReportReason(e.target.value)}
                  disabled={isReporting}
                  className="w-full h-32 p-4 rounded-2xl bg-gray-50 border-none ring-1 ring-gray-200 focus:ring-2 focus:ring-red-500 outline-none resize-none text-sm"
                  placeholder="例如：內容包含不當言論、詐騙嫌疑、或是任務與實際不符..."
                />
              </div>
              <p className="text-[11px] text-gray-400 leading-relaxed italic">
                * 投訴將會傳送至官方管理小組 (helpwall.official@gmail.com)，我們將在 24 小時內進行審查，並視情況對發布者採取警告或停權處分。
              </p>
            </div>
            <div className="p-6 bg-gray-50 border-t border-gray-100 flex gap-3">
              <button 
                onClick={() => setIsReportModalOpen(false)}
                disabled={isReporting}
                className="flex-1 py-3 rounded-full font-bold text-gray-500 hover:bg-gray-200 transition-colors"
              >
                取消
              </button>
              <button 
                onClick={handleSendReport}
                disabled={isReporting || !reportReason.trim()}
                className={`flex-1 py-3 rounded-full font-black shadow-lg transition-all flex items-center justify-center gap-2 ${
                  isReporting || !reportReason.trim() ? 'bg-gray-200 text-gray-400' : 'bg-red-500 text-white hover:scale-[1.02]'
                }`}
              >
                {isReporting ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                ) : '確認送出'}
               </button>
            </div>
          </div>
        </div>
      )}

      {/* Resolution & Support Guide Modal */}
      {isResolutionGuideOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/70 backdrop-blur-lg p-4 animate-in fade-in duration-300">
          <div className="absolute inset-0" onClick={() => setIsResolutionGuideOpen(false)} />
          <div className="relative w-full max-w-lg max-h-[90vh] flex flex-col rounded-[2.5rem] bg-white shadow-2xl transition-all animate-in slide-in-from-bottom-8 duration-500 overflow-hidden">
            
            {/* Header */}
            <div className="p-8 pb-4 text-center">
                <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-50 text-blue-600 rounded-full mb-4 shadow-inner">
                    <span className="material-symbols-outlined text-4xl">gavel</span>
                </div>
                <h2 className="text-2xl font-black text-gray-900">問題處理與協調指引</h2>
                <p className="text-gray-500 text-sm mt-2">HelpWall 已收到您的回報，我們致力於協助您解決爭議</p>
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto px-8 pb-8 space-y-8">
                
                {/* Section 1: Handling Steps */}
                <div className="space-y-4">
                    <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">
                        <div className="w-1.5 h-4 bg-blue-500 rounded-full" /> 處理步驟
                    </h3>
                    <div className="grid gap-3">
                        <div className="flex gap-4 p-4 rounded-2xl bg-gray-50 border border-gray-100 transition-hover hover:border-blue-200">
                            <div className="flex-shrink-0 w-8 h-8 bg-white rounded-full shadow-sm flex items-center justify-center text-blue-600 font-bold">1</div>
                            <div>
                                <p className="font-bold text-gray-800">證據保存</p>
                                <p className="text-xs text-gray-500 leading-relaxed">請保留所有對話記錄、照片或交易憑證，作為後續調解依據。</p>
                            </div>
                        </div>
                        <div className="flex gap-4 p-4 rounded-2xl bg-gray-50 border border-gray-100 transition-hover hover:border-blue-200">
                            <div className="flex-shrink-0 w-8 h-8 bg-white rounded-full shadow-sm flex items-center justify-center text-blue-600 font-bold">2</div>
                            <div>
                                <p className="font-bold text-gray-800">官方審核</p>
                                <p className="text-xs text-gray-500 leading-relaxed">管理小組將於 24 小時內檢視該用戶過往紀錄。若屬累犯或嚴重違規，將永久停權。</p>
                            </div>
                        </div>
                        <div className="flex gap-4 p-4 rounded-2xl bg-gray-50 border border-gray-100 transition-hover hover:border-blue-200">
                            <div className="flex-shrink-0 w-8 h-8 bg-white rounded-full shadow-sm flex items-center justify-center text-blue-600 font-bold">3</div>
                            <div>
                                <p className="font-bold text-gray-800">第三方調解</p>
                                <p className="text-xs text-gray-500 leading-relaxed">平台將主動凍結此任務的爭議金（時間幣），並建議您使用下方模板啟動協商。</p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Section 2: Coordination Template */}
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">
                            <div className="w-1.5 h-4 bg-green-500 rounded-full" /> 協調模板
                        </h3>
                        <button 
                            onClick={handleCopyTemplate}
                            className="text-xs font-bold text-blue-600 bg-blue-50 px-3 py-1.5 rounded-full hover:bg-blue-100"
                        >
                            複製模板
                        </button>
                    </div>
                    <div className="p-5 bg-stone-50 border border-stone-200 rounded-2xl relative font-mono text-xs text-stone-600 leading-loose whitespace-pre-wrap italic">
                        【HelpWall 任務爭議協調通知】...希望能與你進行誠信協商。我的訴求如下：[請填入訴求]
                        <div className="absolute top-[-8px] right-4 bg-stone-200 px-2 py-0.5 rounded text-[10px] font-bold">和解協議初稿</div>
                    </div>
                </div>

                {/* Section 3: Legal Resources */}
                <div className="space-y-4">
                    <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">
                        <div className="w-1.5 h-4 bg-orange-500 rounded-full" /> 法律與外部支援
                    </h3>
                    <div className="flex flex-wrap gap-2">
                        <a href="https://www.laf.org.tw/" target="_blank" className="flex items-center gap-2 px-4 py-2 bg-orange-50 text-orange-700 rounded-xl text-xs font-bold border border-orange-100">
                            <span className="material-symbols-outlined text-base">account_balance</span> 法律扶助基金會
                        </a>
                        <a href="https://www.judicial.gov.tw/tw/cp-125-3333-1ecb4-1.html" target="_blank" className="flex items-center gap-2 px-4 py-2 bg-orange-50 text-orange-700 rounded-xl text-xs font-bold border border-orange-100">
                            <span className="material-symbols-outlined text-base">groups</span> 法院調解程序說明
                        </a>
                    </div>
                </div>

                {/* Stance Footer */}
                <div className="p-6 rounded-3xl bg-blue-900 text-white space-y-3 shadow-xl">
                    <p className="text-sm font-black flex items-center gap-2">
                        <span className="material-symbols-outlined text-blue-300">info</span>
                        平台立場說明
                    </p>
                    <p className="text-[11px] leading-relaxed text-blue-100 opacity-90">
                        HelpWall 為鄰里互助媒合平台，雖不負實體賠償責任，但我們「致力於建立協調機制」。
                        我們將視情況限制違規者的權限，並在必要時配合警方提供調查資料，守護社區誠信。
                    </p>
                </div>
            </div>

            {/* Bottom Button */}
            <div className="p-8 pt-0">
                <button 
                    onClick={() => setIsResolutionGuideOpen(false)}
                    className="w-full py-4 rounded-full bg-gray-900 text-white font-black shadow-lg hover:bg-black transition-all active:scale-95"
                >
                    我明白了
                </button>
            </div>
          </div>
        </div>
      )}

        {/* Applicant Review Modal */}
      {isReviewModalOpen && selectedApplicant && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[80] p-4 animate-in fade-in zoom-in-95 duration-200">
              <div className="bg-white dark:bg-zinc-800 p-6 rounded-2xl shadow-2xl w-full max-w-sm flex flex-col gap-5 border border-red-100 relative overflow-hidden">
                  <div className="absolute top-0 left-0 right-0 h-2 bg-gradient-to-r from-red-400 to-orange-400"></div>
                  
                  <div className="flex flex-col items-center gap-4 pt-4">
                      {/* Avatar with Reputation Score Badge */}
                      <div className="relative">
                          <div className="w-24 h-24 rounded-full bg-cover bg-center border-4 border-white shadow-md bg-gray-200" style={{ backgroundImage: selectedApplicant.image_url ? `url('${selectedApplicant.image_url}')` : undefined }}></div>
                          <div className={`absolute -bottom-1 -right-1 flex items-center justify-center w-10 h-10 rounded-full border-4 border-white shadow-lg text-white font-black text-sm bg-gradient-to-br from-slate-700 to-slate-900`}>
                              {selectedApplicant.reputation_points || 100}
                          </div>
                      </div>

                      <div className="text-center">
                          <h3 className="text-2xl font-black text-gray-800">{selectedApplicant.name}</h3>
                          {/* Prominent Reputation Display Under Avatar */}
                          <div className={`mt-2 inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-black uppercase tracking-wider ${getReputationLabel(selectedApplicant.reputation_points || 100).bg} ${getReputationLabel(selectedApplicant.reputation_points || 100).color} shadow-sm border border-current opacity-90`}>
                             <span className="material-symbols-outlined text-sm">verified</span>
                             {getReputationLabel(selectedApplicant.reputation_points || 100).label}
                          </div>
                      </div>
                  </div>

                  {/* Applicant Stats Grid */}
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                      <div className="grid grid-cols-2 gap-4">
                          <div className="flex flex-col items-center bg-white p-3 rounded-lg shadow-sm">
                              <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">已完成幫助</p>
                              <p className="text-2xl font-black text-slate-800">{selectedApplicant.help_count}</p>
                          </div>
                          <div className="flex flex-col items-center bg-white p-3 rounded-lg shadow-sm">
                              <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">收到感謝</p>
                              <p className="text-2xl font-black text-pink-500">{selectedApplicant.thanks_count}</p>
                          </div>
                      </div>
                  </div>

                  <div className="bg-red-50 p-3 rounded-xl border border-red-100 flex gap-3 items-start">
                      <span className="material-symbols-outlined text-red-500 text-xl shrink-0 mt-0.5">warning</span>
                      <p className="text-xs text-red-800 leading-relaxed font-bold">請務必檢視對方的歷史紀錄與評分。同意接取後，對方將獲得此任務的執行權限。</p>
                  </div>
                  
                  <div className="flex gap-3 mt-2">
                      <button onClick={() => setIsReviewModalOpen(false)} className="flex-1 py-3 rounded-xl bg-gray-100 font-bold text-gray-500 hover:bg-gray-200">再考慮</button>
                      <button onClick={handleApproveApplicant} className="flex-1 py-3 rounded-xl bg-black text-white font-bold shadow-lg hover:opacity-90">同意接取</button>
                  </div>
              </div>
          </div>
      )}
      
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