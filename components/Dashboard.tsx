import React, { useEffect, useState, useRef } from 'react';
import { supabase, SUPABASE_URL, SUPABASE_KEY } from '../services/supabaseClient';
import { Task, AppView } from '../types';
import BottomNav from './BottomNav';

// Declare Leaflet global type to avoid TS errors
declare const L: any;

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
  
  // Notification State
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);
  
  // Modal States
  const [isTaskFormOpen, setIsTaskFormOpen] = useState(false);
  const [isTimePickerOpen, setIsTimePickerOpen] = useState(false);
  
  // New Task Form Data
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDesc, setNewTaskDesc] = useState('');
  const [newTaskImage, setNewTaskImage] = useState('');
  const [selectedTime, setSelectedTime] = useState<number | null>(null);

  // Map Refs & Location State
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const userMarkerRef = useRef<any>(null);
  const userLatRef = useRef<number>(25.0330); // Default Taipei
  const userLngRef = useRef<number>(121.5654);
  const [currentUserLoc, setCurrentUserLoc] = useState<{lat: number, lng: number}>({ lat: 25.0330, lng: 121.5654 });

  const timeOptions = [5, 10, 15, 20, 25, 30];

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
    
    // 3. Get Geolocation
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const lat = position.coords.latitude;
          const lng = position.coords.longitude;
          userLatRef.current = lat;
          userLngRef.current = lng;
          setCurrentUserLoc({ lat, lng });
          
          // If map is already active, re-center and move user marker
          if (mapInstanceRef.current) {
             mapInstanceRef.current.setView([lat, lng], 14);
             if (userMarkerRef.current) {
                 userMarkerRef.current.setLatLng([lat, lng]);
             }
          }
        },
        (error) => {
          console.error("Geo error:", error);
        },
        { enableHighAccuracy: true }
      );
    }

    // Close notifications when clicking outside
    const handleClickOutside = (event: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(event.target as Node)) {
        setIsNotifOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);

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
  const sendHeartbeat = async (lat: number, lng: number) => {
    try {
      // Suppress error if RPC is missing to avoid console spam, but try to call it.
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

    // Trigger logic periodically
    const tick = () => {
      const lat = userLatRef.current;
      const lng = userLngRef.current;
      if (lat && lng) {
        void sendHeartbeat(lat, lng);
      }
    };

    // 1. Initial trigger (only if we have coordinates)
    // We check userLatRef to ensure we don't send 0,0 or default if not ready, 
    // though the default is Taipei.
    if (userLatRef.current) {
        tick();
    }

    // 2. Interval trigger every 30 seconds
    const intervalId = setInterval(tick, 30000);

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
    
    const map = L.map(mapContainerRef.current).setView([lat, lng], 14);
    
    L.tileLayer('https://cartodb-basemaps-a.global.ssl.fastly.net/light_all/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);

    // User Marker
    const userIcon = L.divIcon({
        className: '',
        html: `<div class="flex justify-center items-center h-10 w-10 rounded-full bg-[#A0E7E5] border-[3px] border-[#FFFDF5] shadow-[0_4px_10px_rgba(0,0,0,0.1)]"><span class="material-symbols-outlined text-[#4A4A4A] text-2xl" style="font-variation-settings: 'FILL' 1;">person_pin</span></div>`,
        iconSize: [40, 40],
        iconAnchor: [20, 40]
    });
    const userMarker = L.marker([lat, lng], { icon: userIcon }).addTo(map);
    userMarkerRef.current = userMarker;

    mapInstanceRef.current = map;
    renderMapMarkers(tasks);
  };

  const renderMapMarkers = (taskList: Task[]) => {
    if (!mapInstanceRef.current) return;
    
    // Clear existing
    markersRef.current.forEach(m => mapInstanceRef.current.removeLayer(m));
    markersRef.current = [];

    for (const task of taskList) {
        const isTaken = task.status === "in_progress";

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
            ">
                ${task.title}
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

  const handleCreateTask = async () => {
    if (!newTaskTitle.trim()) return alert("請輸入任務標題");
    if (!selectedTime) return alert("請選擇預期時間");
    if (!currentUser) return alert("請先登入");

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
        time_credit: time_credit
        // status is null/undefined by default which fits "open"
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

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(errorText || "Function invocation failed");
        }

        const result = await response.json();
        console.log(`Notified ${result.notified} users nearby.`);

        // Reset
        setIsTaskFormOpen(false);
        setNewTaskTitle('');
        setNewTaskDesc('');
        setNewTaskImage('');
        setSelectedTime(null);
        loadTasks();

    } catch (error: any) {
        alert("新增失敗：" + error.message);
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
          <div className="flex items-center justify-center">
              <button className="flex items-center justify-center p-2 rounded-full text-text-secondary hover:bg-black/5">
                  <span className="material-symbols-outlined text-2xl">search</span>
              </button>
          </div>
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
                            className="w-full aspect-video rounded-lg bg-cover bg-center bg-gray-100"
                            style={{ backgroundImage: task.image_url ? `url(${task.image_url})` : undefined }}
                        >
                             {!task.image_url && <div className="w-full h-full flex items-center justify-center text-gray-300"><span className="material-symbols-outlined text-4xl">image</span></div>}
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
         <main className="flex-grow w-full h-[calc(100vh-180px)] z-0">
             <div ref={mapContainerRef} className="w-full h-full"></div>
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

      {/* Task Form Modal */}
      {isTaskFormOpen && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl p-6 w-full max-w-sm shadow-lg flex flex-col gap-3">
                <h2 className="text-lg font-bold">Add New Help Task</h2>
                <input 
                    className="border rounded-lg p-2 focus:ring-primary focus:border-primary" 
                    placeholder="Title" 
                    value={newTaskTitle}
                    onChange={(e) => setNewTaskTitle(e.target.value)}
                />
                <textarea 
                    className="border rounded-lg p-2 focus:ring-primary focus:border-primary" 
                    placeholder="Description"
                    value={newTaskDesc}
                    onChange={(e) => setNewTaskDesc(e.target.value)}
                />
                <div 
                    onClick={() => setIsTimePickerOpen(true)}
                    className="border rounded-lg p-2 cursor-pointer bg-gray-50 hover:bg-gray-100 flex justify-between items-center"
                >
                    <span className={selectedTime ? "text-black" : "text-gray-500"}>
                        {selectedTime ? `${selectedTime} minutes` : 'Select Expected Time'}
                    </span>
                    <span className="material-symbols-outlined text-base">expand_more</span>
                </div>
                <input 
                    className="border rounded-lg p-2 focus:ring-primary focus:border-primary" 
                    placeholder="Image URL (Optional)" 
                    value={newTaskImage}
                    onChange={(e) => setNewTaskImage(e.target.value)}
                />
                <div className="flex gap-2 mt-2">
                    <button 
                        onClick={() => setIsTaskFormOpen(false)}
                        className="flex-1 text-gray-500 py-2 border rounded-lg hover:bg-gray-50"
                    >
                        Cancel
                    </button>
                    <button 
                        onClick={handleCreateTask}
                        className="flex-1 bg-primary text-text-primary font-bold rounded-lg py-2 hover:opacity-90 shadow-sm"
                    >
                        Submit
                    </button>
                </div>
            </div>
        </div>
      )}

      {/* Time Picker Modal */}
      {isTimePickerOpen && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-[60]">
            <div className="bg-white rounded-xl p-4 w-64 shadow-lg">
                <h3 className="text-lg font-bold mb-3">Select Expected Time</h3>
                <div className="flex flex-col gap-2 max-h-60 overflow-y-auto">
                    {timeOptions.map(t => (
                        <div 
                            key={t}
                            onClick={() => {
                                setSelectedTime(t);
                                setIsTimePickerOpen(false);
                            }}
                            className="p-2 border rounded-lg bg-gray-50 hover:bg-gray-100 cursor-pointer text-center"
                        >
                            {t} minutes
                        </div>
                    ))}
                </div>
                <button 
                    onClick={() => setIsTimePickerOpen(false)}
                    className="text-sm text-gray-500 mt-3 w-full"
                >
                    Cancel
                </button>
            </div>
        </div>
      )}

      <BottomNav currentView={AppView.DASHBOARD} onNavigate={onNavigate} />
    </div>
  );
};

export default Dashboard;