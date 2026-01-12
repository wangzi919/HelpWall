import React, { useEffect, useState, useRef } from 'react';
import { supabase, SUPABASE_URL, SUPABASE_KEY } from '../services/supabaseClient';
import { Task, AppView } from '../types';
import BottomNav from './BottomNav';
import TermsModal from './TermsModal';

// Declare Leaflet global type to avoid TS errors
declare const L: any;

declare const lottie: any;

interface DashboardProps {
  currentUser: any;
  onNavigateToTaskDetail: (taskId: string) => void;
  onNavigate: (view: AppView) => void;
}

interface NotificationItem {
  task_id: string; // Primary Key
  message: string;
  created_at: string;
  sender?: {
    name: string;
    image_url: string;
  };
}

const Dashboard: React.FC<DashboardProps> = ({ currentUser, onNavigateToTaskDetail, onNavigate }) => {
  const [viewMode, setViewMode] = useState<'wall' | 'map'>('wall');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [userAvatarUrl, setUserAvatarUrl] = useState<string>('');
  const [showWelcome, setShowWelcome] = useState(true);
  
  // Notification State
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);
  
  // Modal States
  const [isTaskFormOpen, setIsTaskFormOpen] = useState(false);
  const [isTermsOpen, setIsTermsOpen] = useState(false);

  // New Task Form Data
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDesc, setNewTaskDesc] = useState('');
  const [newTaskImage, setNewTaskImage] = useState('');
  const [selectedTime, setSelectedTime] = useState<number | null>(null);
  const [requiresReview, setRequiresReview] = useState(false); // New State
  // New: Notify Target State
  const [notifyTarget, setNotifyTarget] = useState<'all' | 'personal' | 'group'>('all');

  // Map Refs & Location State
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const userMarkerRef = useRef<any>(null);
  const lottieRef = useRef<HTMLDivElement>(null);

  const userLatRef = useRef<number>(25.0330); // Default Taipei
  const userLngRef = useRef<number>(121.5654);
  const [currentUserLoc, setCurrentUserLoc] = useState<{lat: number, lng: number}>({ lat: 25.0330, lng: 121.5654 });
  // New: Track if real GPS location has been acquired
  const [isLocationReady, setIsLocationReady] = useState(false);
  // Track watch ID to clear it on unmount
  const watchIdRef = useRef<number | null>(null);

  const timeOptions = [5, 10, 15, 20, 25, 30];

  // Welcome Animation Effect
  useEffect(() => {
    let animation: any;
    if (lottieRef.current && typeof lottie !== 'undefined') {
        animation = lottie.loadAnimation({
            container: lottieRef.current,
            renderer: 'svg',
            loop: true,
            autoplay: true,
            path: '/welcome-animation.json'
        });
    }

    const timer = setTimeout(() => {
        setShowWelcome(false);
        if (animation) animation.destroy();
    }, 3000);

    return () => {
        clearTimeout(timer);
        if (animation) animation.destroy();
    };
  }, []);

  useEffect(() => {
    // 1. Fetch User Profile for Avatar (Only if we have a user)
    const fetchProfile = async () => {
      if (!currentUser) return;
      
      const { data: profile } = await supabase
        .from('user')
        .select('*')
        .eq('uid', currentUser.id)
        .single();
      
      if (profile && profile.image_url) {
        setUserAvatarUrl(profile.image_url);
      }
    };
    
    // 2. Fetch Notifications (Unread Thanks Cards)
    const fetchNotifications = async () => {
        if (!currentUser) return;
        
        const { data, error } = await supabase
            .from('thanks_card')
            .select('*, sender:user!sender_uid(name, image_url)')
            .eq('receiver_uid', currentUser.id)
            .eq('is_read', false)
            .order('created_at', { ascending: false });
            
        if (data) {
            // Flatten the sender array/object structure if necessary
            const formatted = data.map((item: any) => ({
                ...item,
                sender: Array.isArray(item.sender) ? item.sender[0] : item.sender
            }));
            setNotifications(formatted);
            setUnreadCount(formatted.length);
        }
    };

    fetchProfile();
    fetchNotifications();
    loadTasks();
    
    // 3. Continuous Geolocation Tracking (watchPosition)
    if (navigator.geolocation) {
      // Clear existing watch if any
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }

      watchIdRef.current = navigator.geolocation.watchPosition(
        (position) => {
          const lat = position.coords.latitude;
          const lng = position.coords.longitude;

          // Update Refs (Critical for Heartbeat to pick up fresh data)
          userLatRef.current = lat;
          userLngRef.current = lng;

          // Update State (Triggers UI updates if needed)
          setCurrentUserLoc({ lat, lng });

          setIsLocationReady(true);
          
          // Update Map Marker Live (if map is open)
          if (mapInstanceRef.current && userMarkerRef.current) {
              userMarkerRef.current.setLatLng([lat, lng]);
             // Optional: If this is the FIRST fix, maybe center map? 
             // But usually better not to auto-pan constantly as it disturbs browsing.
             // We rely on the "Locate Me" button for centering.
          }
        },
        (error) => {
          console.error("Geo watch error:", error);
          // Don't alert continuously, just log
        },
        { 
          enableHighAccuracy: true,
          maximumAge: 10000, // Accept cached positions up to 10s old
          timeout: 10000 
        }
      );
    }

    // Close notifications when clicking outside
    const handleClickOutside = (event: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(event.target as Node)) {
        setIsNotifOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    
    return () => {
        document.removeEventListener('mousedown', handleClickOutside);
        if (watchIdRef.current !== null) {
            navigator.geolocation.clearWatch(watchIdRef.current);
        }
    };

  }, [currentUser]);

  // Initialize Map when switching to map view
  useEffect(() => {
    if (viewMode === 'map' && mapContainerRef.current && !mapInstanceRef.current) {
        initMap();
    } else if (viewMode === 'wall' && mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
    }
  }, [viewMode]);

  // --- Heartbeat Logic Start ---
  // The heartbeat runs on an interval. Because it reads from userLatRef.current,
  // and watchPosition updates that ref continuously, the heartbeat will automatically
  // send the updated location without needing code changes here.
  const sendHeartbeat = async (lat: number, lng: number) => {
    try {
      const { error } = await supabase.rpc("heartbeat_presence", {
        lat,
        lng,
      });
      if (error) {
        console.warn("Heartbeat warning:", error.message);
      }
    } catch (err) {
      console.error("Heartbeat exception:", err);
    }
  };

  useEffect(() => {
    if (!currentUser) return;

    const tick = () => {
      const lat = userLatRef.current;
      const lng = userLngRef.current;
      // Only send if we have a valid non-zero (or non-default if you prefer) location, 
      // or just send whatever the ref has.
      if (lat && lng) {
        void sendHeartbeat(lat, lng);
      }
    };

    if (userLatRef.current) {
        tick();
    }

    const intervalId = setInterval(tick, 30000); // 30 seconds

    return () => clearInterval(intervalId);
  }, [currentUser]);
  // --- Heartbeat Logic End ---

  const loadTasks = async () => {
    // Optimization: Simplified query since status is now in tasks table
    const { data: rawTasks, error } = await supabase
      .from('tasks')
      .select('*')
      .order('created_at', { ascending: false });

    if (error || !rawTasks) return;

    // Filter out completed tasks from the wall
    const processedTasks: Task[] = rawTasks.filter((task: Task) => task.status !== 'completed');

    setTasks(processedTasks);
    
    // If map is currently active, update markers with new data
    if (viewMode === 'map' && mapInstanceRef.current) {
      renderMapMarkers(processedTasks);
    }
  };

  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371; // km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
    const d = R * c;
    if (d < 1) return (d * 1000).toFixed(0) + ' m';
    return d.toFixed(1) + ' km';
  };

  const initMap = () => {
      if (typeof L === 'undefined') return;

      const lat = userLatRef.current;
      const lng = userLngRef.current;

      const map = L.map(mapContainerRef.current, {
        zoomControl: false // We will add zoom control manually or leave it minimal
      }).setView([lat, lng], 14);

      L.tileLayer('https://cartodb-basemaps-a.global.ssl.fastly.net/light_all/{z}/{x}/{y}.png', {
          attribution: '&copy; OpenStreetMap contributors'
      }).addTo(map);

      // 使用者 Marker
      const userIcon = L.divIcon({
          className: 'user-marker',
          html: `<div style="
              display:flex; align-items:center; justify-content:center;
              width:40px; height:40px; border-radius:50%;
              background-color:#A0E7E5; border:3px solid #FFFDF5;
              box-shadow:0 4px 10px rgba(0,0,0,0.1);
              font-size:20px;
          ">📍</div>`,
          iconSize: [40, 40],
          iconAnchor: [20, 40]
      });

      const userMarker = L.marker([lat, lng], { icon: userIcon }).addTo(map);
      userMarkerRef.current = userMarker;

      mapInstanceRef.current = map;

      renderMapMarkers(tasks);

      // 這行很重要，確保 Leaflet 知道容器完整尺寸
      setTimeout(() => {
          map.invalidateSize();
      }, 100);
  };


  const renderMapMarkers = (taskList: Task[]) => {
    if (!mapInstanceRef.current) return;
    
    // Clear existing
    markersRef.current.forEach(m => mapInstanceRef.current.removeLayer(m));
    markersRef.current = [];

    for (const task of taskList) {
        const isTaken = task.status === "in_progress";
        const isReview = task.requires_review;

        const html = `
            <div style="
                display: inline-block;
                position: relative;
                padding: 8px 12px;
                border-radius: 1.25rem;
                background-color: ${isTaken ? '#A9A9A9' : task.color};
                opacity: ${isTaken ? 0.6 : 1};
                box-shadow: 0 4px 10px rgba(0, 0, 0, 0.1);
                font-family: 'Spline Sans', sans-serif;
                font-size: 14px;
                font-weight: 700;
                color: #4A4A4A;
                white-space: nowrap;
                border: ${isReview ? '2px solid #FF6B6B' : 'none'};
            ">
                ${isReview ? '🛡️ ' : ''}${task.title}
                <div style="
                    position: absolute;
                    bottom: -8px;
                    left: 50%;
                    transform: translateX(-50%);
                    width: 0;
                    height: 0;
                    border-left: 8px solid transparent;
                    border-right: 8px solid transparent;
                    border-top: 8px solid ${isTaken ? '#A9A9A9' : task.color};
                "></div>
            </div>`;

        const icon = L.divIcon({ className: '', html, iconAnchor: [50, 45] });
        const marker = L.marker([task.lat, task.lng], { icon }).addTo(mapInstanceRef.current);
        
        // Leaflet event wrapper
        marker.on('click', () => {
            onNavigateToTaskDetail(task.id);
        });

        markersRef.current.push(marker);
    }
  };

  const handleManualLocate = () => {
      if (!mapInstanceRef.current) return;
      
      if (!isLocationReady) {
          alert("正在定位中，請稍候...");
          // If permission was denied, this might trigger the browser prompt again in some contexts,
          // or at least attempt to get position one-shot.
          navigator.geolocation.getCurrentPosition(
              (pos) => {
                  const { latitude, longitude } = pos.coords;
                  userLatRef.current = latitude;
                  userLngRef.current = longitude;
                  setIsLocationReady(true);
                  if (mapInstanceRef.current) {
                      mapInstanceRef.current.setView([latitude, longitude], 15);
                      if (userMarkerRef.current) {
                          userMarkerRef.current.setLatLng([latitude, longitude]);
                      }
                  }
              },
              (err) => {
                  alert("無法取得位置，請檢查瀏覽器權限設定。");
              },
              { enableHighAccuracy: true }
          );
      } else {
          // Simply center map
          const lat = userLatRef.current;
          const lng = userLngRef.current;
          mapInstanceRef.current.setView([lat, lng], 15, { animate: true });
    }
  };

  const triggerCreateTask = async () => {
    if (!newTaskTitle.trim()) return alert("請輸入任務標題");
    if (!selectedTime) return alert("請選擇預期時間");
    if (!currentUser) return alert("請先登入");
   
    // Show Terms Modal before proceeding
    setIsTermsOpen(true);
  };

  const handleCreateTask = async () => {
    // 立即關閉所有 Modal，回到主畫面
    setIsTermsOpen(false);
    setIsTaskFormOpen(false);
    
    // Location Safety Check
    if (!isLocationReady) {
        const confirmDefault = window.confirm(
            "⚠️ 注意：尚未偵測到您的精確位置。\n\n系統將會使用預設地點（台北 101）發布任務。\n建議您檢查瀏覽器定位權限，或稍候再試。\n\n確定要繼續使用預設地點發布嗎？"
        );
        if (!confirmDefault) return;
    }

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return alert("Session expired");

    const time_credit = selectedTime / 5;
    const newTask = {
        user_uid: currentUser.id,
        title: newTaskTitle,
        description: newTaskDesc,
        image_url: newTaskImage,
        lat: userLatRef.current,
        lng: userLngRef.current,
        color: ["#FFFACD", "#FFDAB9", "#D4F1F4"][Math.floor(Math.random() * 3)],
        expected_time: `${selectedTime} minutes`,
        time_credit: time_credit,
        requires_review: requiresReview,
        applicants: [],
        notify_target: notifyTarget // Add selected target
    };

    try {
        // Call Supabase Edge Function to create task and notify users
        const response = await fetch(`${SUPABASE_URL}/functions/v1/create-task`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.access_token}`,
                'apikey': SUPABASE_KEY
            },
            body: JSON.stringify(newTask)
        });

        // Use json() to parse success or error details
        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.error || "Function invocation failed");
        }
        
        // Show detailed notification stats
        alert(`發布成功！\n\n已通知 ${result.notified_personal ?? 0} 位鄰居\n已推播至 ${result.notified_groups ?? 0} 個群組`);

        // Reset
        setIsTaskFormOpen(false);
        setNewTaskTitle('');
        setNewTaskDesc('');
        setNewTaskImage('');
        setSelectedTime(null);
        setRequiresReview(false);
        setNotifyTarget('all'); // Reset target
        loadTasks();

    } catch (error: any) {
        alert("新增失敗：" + error.message);
        setIsTaskFormOpen(true); // 失敗時重新開啟讓使用者檢查
    }
  };

  // --- Notification Actions ---
  const handleNotificationClick = async (notif: NotificationItem) => {
      // 1. Optimistic UI Update
      setNotifications(prev => prev.filter(n => n.task_id !== notif.task_id));
      setUnreadCount(prev => Math.max(0, prev - 1));
      
      // 2. Navigate to Task Detail View
      setIsNotifOpen(false);
      onNavigateToTaskDetail(notif.task_id);

      // 3. Update DB (Use task_id as PK)
      await supabase
        .from('thanks_card')
        .update({ is_read: true })
        .eq('task_id', notif.task_id);
  };

  const handleMarkAllRead = async () => {
      // 1. Optimistic
      const ids = notifications.map(n => n.task_id);
      setNotifications([]);
      setUnreadCount(0);
      setIsNotifOpen(false);

      // 2. Update DB (Use task_id as PK)
      if (ids.length > 0) {
        await supabase
            .from('thanks_card')
            .update({ is_read: true })
            .in('task_id', ids);
      }
  };

  return (
    <div className="relative flex min-h-screen w-full flex-col overflow-x-hidden bg-background-light text-text-primary font-display pb-20">
      {/* Welcome Animation Overlay */}
      {showWelcome && (
        <div className="fixed inset-0 z-[1000] flex flex-col items-center justify-center bg-[#FFFDF5] animate-out fade-out duration-1000 fill-mode-forwards delay-2000">
            <div ref={lottieRef} className="w-100 h-100 md:w-[600px] md:h-[600px]"></div>
            <div className="-mt-4 md:-mt-24 text-center animate-in slide-in-from-bottom-4 duration-700">
                <h2 className="text-4xl md:text-5xl font-black text-slate-800 font-hand-drawn tracking-tight">
                    Bunny <span className="text-detail-primary">幫你</span>
                </h2>
                <p className="mt-3 text-slate-500 font-bold tracking-widest uppercase text-sm animate-pulse">
                    Loading your community...
                </p>
            </div>
        </div>
      )}
      {/* App Bar */}
      <div className="sticky top-0 z-30 flex items-center justify-between bg-background-light/80 px-4 py-3 backdrop-blur-sm">
          <div className="flex size-12 shrink-0 items-center justify-start">
              <div 
                onClick={() => onNavigate(AppView.USER_PROFILE)}
                className="aspect-square size-10 rounded-full bg-cover bg-center shadow-soft cursor-pointer bg-gray-200"
                style={{ backgroundImage: userAvatarUrl ? `url('${userAvatarUrl}')` : undefined }}
              >
                {!userAvatarUrl && <span className="flex items-center justify-center h-full w-full material-symbols-outlined text-gray-400">person</span>}
              </div>
          </div>
          {/* <div className="flex items-center justify-center">
              <button className="flex items-center justify-center p-2 rounded-full text-text-secondary hover:bg-black/5">
                  <span className="material-symbols-outlined text-2xl">search</span>
              </button>
          </div> */}
          <div className="flex size-12 shrink-0 items-center justify-end relative" ref={notifRef}>
              <button 
                onClick={() => setIsNotifOpen(!isNotifOpen)}
                className="relative flex items-center justify-center p-2 rounded-full text-text-secondary hover:bg-black/5"
              >
                  <span className="material-symbols-outlined text-2xl">notifications</span>
                  {unreadCount > 0 && (
                      <span className="absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-xs font-bold text-white animate-bounce">
                          {unreadCount}
                      </span>
                  )}
              </button>

              {/* Notification Dropdown */}
              {isNotifOpen && (
                  <div className="absolute top-12 right-0 w-72 bg-white rounded-xl shadow-xl border border-gray-100 overflow-hidden z-50 animate-in fade-in slide-in-from-top-2 duration-200">
                      <div className="px-4 py-3 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                          <h3 className="font-bold text-sm text-gray-700">Notifications</h3>
                          {notifications.length > 0 && (
                              <button onClick={handleMarkAllRead} className="text-xs text-blue-500 font-bold hover:underline">
                                  Mark all read
                              </button>
                          )}
                      </div>
                      <div className="max-h-64 overflow-y-auto">
                          {notifications.length === 0 ? (
                              <div className="p-4 text-center text-gray-400 text-sm">
                                  No new notifications
                              </div>
                          ) : (
                              notifications.map(notif => (
                                  <div 
                                    key={notif.task_id}
                                    onClick={() => handleNotificationClick(notif)}
                                    className="p-3 hover:bg-gray-50 cursor-pointer border-b border-gray-50 last:border-none transition-colors"
                                  >
                                      <div className="flex gap-3">
                                          <div 
                                            className="h-8 w-8 rounded-full bg-cover bg-center shrink-0 bg-gray-200"
                                            style={{ backgroundImage: notif.sender?.image_url ? `url('${notif.sender.image_url}')` : undefined }}
                                          >
                                              {!notif.sender?.image_url && <span className="material-symbols-outlined text-gray-400 text-sm flex items-center justify-center h-full">person</span>}
                                          </div>
                                          <div className="flex flex-col gap-1 overflow-hidden">
                                              <p className="text-sm font-bold text-gray-800 truncate">
                                                  {notif.sender?.name || 'Someone'} sent you thanks!
                                              </p>
                                              <p className="text-xs text-gray-500 truncate">
                                                  {notif.message}
                                              </p>
                                          </div>
                                      </div>
                                  </div>
                              ))
                          )}
                      </div>
                  </div>
              )}
          </div>
      </div>

      {/* Segmented Buttons */}
      <div className="px-4 py-2 z-10">
          <div className="flex h-12 items-center justify-center rounded-full bg-black/5 p-1 shadow-inner">
              <button 
                onClick={() => setViewMode('wall')}
                className={`flex h-full grow items-center justify-center rounded-full px-3 text-sm font-medium transition-all ${viewMode === 'wall' ? 'bg-white shadow-soft' : ''}`}
              >
                  Tasks
              </button>
              <button 
                onClick={() => setViewMode('map')}
                className={`flex h-full grow items-center justify-center rounded-full px-3 text-sm font-medium transition-all ${viewMode === 'map' ? 'bg-white shadow-soft' : ''}`}
              >
                  Map View
              </button>
          </div>
      </div>

      {/* Wall View */}
      {viewMode === 'wall' && (
        <main className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 p-4 pb-24 overflow-y-auto">
            {tasks.map(task => {
                const isTaken = task.status === 'in_progress';
                const distanceStr = calculateDistance(currentUserLoc.lat, currentUserLoc.lng, task.lat, task.lng);

                return (
                    <div 
                        key={task.id}
                        onClick={() => onNavigateToTaskDetail(task.id)}
                        className="flex flex-col rounded-lg p-4 shadow-soft transition-transform duration-200 ease-in-out hover:-translate-y-1 cursor-pointer"
                        style={{ backgroundColor: task.color || '#FFFACD' }}
                    >
                        <div 
                            className="w-full aspect-video rounded-lg bg-cover bg-center bg-gray-100 relative"
                            style={{ backgroundImage: task.image_url ? `url(${task.image_url})` : undefined }}
                        >
                             {!task.image_url && <div className="w-full h-full flex items-center justify-center text-gray-300"><span className="material-symbols-outlined text-4xl">image</span></div>}
                             {task.requires_review && (
                                <div className="absolute top-2 right-2 bg-red-500 text-white text-xs font-bold px-2 py-1 rounded-full flex items-center gap-1 shadow-sm">
                                    <span className="material-symbols-outlined text-sm">security</span>
                                    須審核
                                </div>
                             )}
                        </div>
                        <div className="flex flex-col gap-1 pt-4">
                            <div className="flex items-center gap-2">
                                <p className="text-text-secondary text-sm font-medium">{distanceStr}</p>
                                {isTaken ? (
                                    <span className="text-xs px-2 py-1 bg-gray-400 text-white rounded-full">進行中</span>
                                ) : (
                                    <span className="text-xs px-2 py-1 bg-green-500 text-white rounded-full">可接任務</span>
                                )}
                            </div>
                            <p className="text-text-primary text-lg font-bold">{task.title}</p>
                            <p className="text-text-secondary text-base line-clamp-3">{task.description}</p>
                        </div>
                    </div>
                );
            })}
        </main>
      )}

      {/* Map View */}
      {viewMode === 'map' && (
         <main className="flex-grow w-full h-[calc(100vh-180px)] z-0 relative">
             <div ref={mapContainerRef} className="w-full h-full z-0"></div>
             
             {/* My Location FAB on Map */}
             <button 
                onClick={handleManualLocate}
                className="absolute bottom-6 right-4 z-[400] flex h-12 w-12 items-center justify-center rounded-full bg-white shadow-lg text-gray-600 hover:text-blue-500 hover:bg-gray-50 transition-colors"
                title="Locate Me"
             >
                <span className="material-symbols-outlined text-2xl">
                    {isLocationReady ? 'my_location' : 'location_searching'}
                </span>
             </button>
         </main>
      )}

      {/* FAB - Add Task (Moved up slightly to clear Bottom Nav) */}
      <div className="fixed bottom-32 right-6 z-20">
          <button 
            onClick={() => setIsTaskFormOpen(true)}
            className="flex h-14 w-14 items-center justify-center rounded-full bg-black text-white shadow-lg transition-transform hover:scale-105"
          >
              <span className="material-symbols-outlined text-2xl">add</span>
          </button>
      </div>

      {/* Updated Task Form Modal (Centered Card Style) */}
      {isTaskFormOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-md p-4 animate-in fade-in duration-200">
            {/* Click backdrop to close */}
            <div className="absolute inset-0" onClick={() => setIsTaskFormOpen(false)} />
            
            {/* 
               Constraints:
               1. Centered (flex items-center justify-center on parent)
               2. max-h-[85vh] to ensure it fits on mobile with keyboard potentially visible, or just small screens
               3. rounded-3xl for consistent card look
            */}
            <div className="relative w-full max-w-md max-h-[85vh] flex flex-col transform rounded-[2rem] bg-white shadow-2xl transition-all animate-in zoom-in-95 duration-200">
            
                {/* Modal Content Wrapper - added scrollbar hiding classes */}
                <div className="overflow-y-auto p-6 sm:p-8 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none']">
                    <div className="mb-6 flex items-center justify-between">
                        <h2 className="text-2xl font-black tracking-tight text-text-primary">發佈新任務</h2>
                        <button 
                        onClick={() => setIsTaskFormOpen(false)}
                        className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-gray-400 hover:bg-gray-200"
                        >
                        <span className="material-symbols-outlined text-xl">close</span>
                        </button>
                    </div>

                    <div className="space-y-5">
                        {/* Title Input */}
                        <div className="space-y-1.5">
                            <label className="ml-1 text-sm font-bold text-text-secondary">任務主題</label>
                            <input 
                                className="w-full rounded-2xl border-none bg-gray-50 px-4 py-3 text-text-primary placeholder:text-gray-400 focus:ring-2 focus:ring-primary shadow-inner" 
                                placeholder="例如：幫忙取外送、借用充電線" 
                                value={newTaskTitle}
                                onChange={(e) => setNewTaskTitle(e.target.value)}
                            />
                        </div>

                        {/* Description Input */}
                        <div className="space-y-1.5">
                            <label className="ml-1 text-sm font-bold text-text-secondary">細節說明</label>
                            <textarea 
                                rows={3}
                                className="w-full rounded-2xl border-none bg-gray-50 px-4 py-3 text-text-primary placeholder:text-gray-400 focus:ring-2 focus:ring-primary shadow-inner resize-none" 
                                placeholder="請描述具體需求..."
                                value={newTaskDesc}
                                onChange={(e) => setNewTaskDesc(e.target.value)}
                            />
                        </div>

                        {/* Time Picker Chips */}
                        <div className="space-y-2.5">
                            <label className="ml-1 text-sm font-bold text-text-secondary">預期時間 (支付 {selectedTime ? selectedTime / 5 : 0} 時間幣)</label>
                            <div className="grid grid-cols-3 gap-2">
                                {timeOptions.map(t => (
                                <button
                                    key={t}
                                    onClick={() => setSelectedTime(t)}
                                    className={`rounded-xl py-2.5 text-sm font-bold transition-all ${
                                    selectedTime === t 
                                        ? 'bg-black text-white shadow-lg scale-105' 
                                        : 'bg-gray-50 text-gray-500 hover:bg-gray-100'
                                    }`}
                                >
                                    {t} min
                                </button>
                                ))}
                            </div>
                        </div>

                        {/* Image URL */}
                        <div className="space-y-1.5">
                            <label className="ml-1 text-sm font-bold text-text-secondary">圖片連結 (選填)</label>
                            <div className="flex items-center gap-2 rounded-2xl bg-gray-50 px-4 py-3 shadow-inner">
                                <span className="material-symbols-outlined text-gray-400">image</span>
                                <input 
                                className="w-full border-none bg-transparent p-0 focus:ring-0 text-sm placeholder:text-gray-400" 
                                placeholder="https://..." 
                                value={newTaskImage}
                                onChange={(e) => setNewTaskImage(e.target.value)}
                                />
                            </div>
                        </div>

                        {/* Notify Target Selector */}
                        <div className="space-y-1.5">
                          <label className="ml-1 text-sm font-bold text-text-secondary">通知對象</label>
                          <div className="flex gap-2">
                            <button
                              onClick={() => setNotifyTarget('all')}
                              className={`flex-1 py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-1 transition-all ${notifyTarget === 'all' ? 'bg-black text-white shadow-md' : 'bg-gray-50 text-gray-500 hover:bg-gray-100'}`}
                            >
                              <span className="material-symbols-outlined text-lg">campaign</span>
                              全部
                            </button>
                            <button
                              onClick={() => setNotifyTarget('personal')}
                              className={`flex-1 py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-1 transition-all ${notifyTarget === 'personal' ? 'bg-blue-600 text-white shadow-md' : 'bg-gray-50 text-gray-500 hover:bg-gray-100'}`}
                            >
                               <span className="material-symbols-outlined text-lg">person_pin_circle</span>
                               附近
                            </button>
                            <button
                              onClick={() => setNotifyTarget('group')}
                              className={`flex-1 py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-1 transition-all ${notifyTarget === 'group' ? 'bg-[#06C755] text-white shadow-md' : 'bg-gray-50 text-gray-500 hover:bg-gray-100'}`}
                            >
                               <span className="material-symbols-outlined text-lg">groups</span>
                               群組
                            </button>
                          </div>
                        </div>

                        {/* Security Toggle (Verified Mode) */}
                        <div className="flex items-center justify-between gap-3 p-3 rounded-2xl bg-red-50 border border-red-100 cursor-pointer" onClick={() => setRequiresReview(!requiresReview)}>
                            <div className="flex items-center gap-3">
                                <div className="flex items-center justify-center w-10 h-10 rounded-full bg-red-100 text-red-500">
                                    <span className="material-symbols-outlined">security</span>
                                </div>
                                <div className="flex flex-col">
                                    <span className="font-bold text-gray-800 text-sm">啟用安全審核模式</span>
                                    <span className="text-xs text-gray-500">接取者需經過您的同意才能開始任務</span>
                                </div>
                            </div>
                            <div className={`w-12 h-6 rounded-full p-1 transition-colors ${requiresReview ? 'bg-red-500' : 'bg-gray-300'}`}>
                                <div className={`w-4 h-4 rounded-full bg-white shadow-sm transform transition-transform ${requiresReview ? 'translate-x-6' : 'translate-x-0'}`} />
                            </div>
                        </div>

                        {/* Location Status Hint (Re-integrated) */}
                        <div className="flex items-center gap-2 rounded-xl bg-gray-50 px-4 py-2 border border-dashed border-gray-200">
                             <span className={`material-symbols-outlined text-lg ${isLocationReady ? 'text-green-500' : 'text-orange-500'}`}>
                                {isLocationReady ? 'my_location' : 'location_disabled'}
                             </span>
                             <span className={`text-xs font-bold ${isLocationReady ? 'text-gray-500' : 'text-orange-500'}`}>
                                {isLocationReady ? '已鎖定您的精確位置' : '尚未定位 (將使用預設位置)'}
                             </span>
                        </div>

                        {/* Action Buttons */}
                        <div className="mt-4 flex gap-3 pt-2">
                            <button 
                                onClick={() => setIsTaskFormOpen(false)}
                                className="flex-1 rounded-full py-4 text-sm font-bold text-gray-500 hover:bg-gray-50 transition-colors"
                            >
                                取消
                            </button>
                            <button 
                                onClick={triggerCreateTask}
                                className="flex-1 rounded-full bg-primary py-4 text-sm font-black text-text-primary shadow-soft hover:opacity-90 active:scale-95 transition-all"
                            >
                                確認發佈
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
      )}
    {/* Terms and Conditions Modal */}
        <TermsModal 
            isOpen={isTermsOpen} 
            onClose={() => setIsTermsOpen(false)} 
            onConfirm={handleCreateTask}
            actionType="post"
        />
      <BottomNav currentView={AppView.DASHBOARD} onNavigate={onNavigate} />
    </div>
  );
};

export default Dashboard;