import React, { useEffect, useState } from 'react';
import { supabase } from '../services/supabaseClient';
import { ThanksCard, AppView } from '../types';
import BottomNav from './BottomNav';

interface ThanksWallProps {
  currentUser: any;
  onNavigate: (view: AppView) => void;
}

interface PersonalThanksCard extends ThanksCard {
  sender?: {
    name: string;
    image_url: string;
  };
  task?: {
    title: string;
    created_at: string;
  };
}

// Colors for the Pushpins
const PIN_COLORS = [
  'bg-red-400 border-red-600',
  'bg-blue-400 border-blue-600',
  'bg-green-400 border-green-600',
  'bg-yellow-400 border-yellow-600',
  'bg-purple-400 border-purple-600',
  'bg-orange-400 border-orange-600',
];

// Random rotation classes (tailored to be subtle)
const ROTATIONS = [
  'rotate-1',
  '-rotate-1',
  'rotate-2',
  '-rotate-2',
  'rotate-0',
  'rotate-[1.5deg]',
  '-rotate-[1.5deg]',
];

const ThanksWall: React.FC<ThanksWallProps> = ({ currentUser, onNavigate }) => {
  const [cards, setCards] = useState<PersonalThanksCard[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (currentUser) {
        fetchMyCards();
    }
  }, [currentUser]);

  const fetchMyCards = async () => {
    setLoading(true);
    try {
      const { data: cardsData, error } = await supabase
        .from('thanks_card')
        .select(`
            *,
            sender:user!sender_uid(name, image_url),
            task:tasks!task_id(title, created_at)
        `)
        .eq('receiver_uid', currentUser.id)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching cards:', error);
        return;
      }

      if (cardsData) {
         const formattedCards: PersonalThanksCard[] = cardsData.map((card: any) => ({
            ...card,
            sender: card.sender ? (Array.isArray(card.sender) ? card.sender[0] : card.sender) : { name: 'Unknown', image_url: '' },
            task: card.task ? (Array.isArray(card.task) ? card.task[0] : card.task) : { title: 'Deleted Task', created_at: '' }
         }));
         setCards(formattedCards);
      }
    } catch (err) {
      console.error('Unexpected error:', err);
    } finally {
      setLoading(false);
    }
  };

  // Deterministic helpers based on index to avoid hydration mismatch or jitter
  const getPinColor = (index: number) => PIN_COLORS[index % PIN_COLORS.length];
  const getRotation = (index: number) => ROTATIONS[index % ROTATIONS.length];

  const formatDate = (dateString?: string) => {
      if (!dateString) return '';
      return new Date(dateString).toLocaleDateString('zh-TW', { month: 'short', day: 'numeric' });
  };

  return (
    <div className="relative flex min-h-screen w-full flex-col font-sans bg-[#F9F5EB] text-slate-800 pb-28 overflow-x-hidden">
      
      {/* Background Texture (Subtle Cork/Paper feel) */}
      <div 
        className="absolute inset-0 pointer-events-none opacity-50 mix-blend-multiply"
        style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23d4c5a5' fill-opacity='0.25'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
        }}
      ></div>
      
      {/* Header */}
      <header className="w-full pt-8 pb-4 px-6 relative z-10">
        <div className="max-w-7xl mx-auto text-center flex flex-col items-center">
            {/* Decorative 'Rope' */}
            <div className="absolute top-0 flex gap-24 opacity-40">
              <div className="h-12 w-[2px] bg-stone-400"></div>
              <div className="h-12 w-[2px] bg-stone-400"></div>
            </div>
             
             {/* Wooden/Paper Sign Board */}
             <div className="bg-white/90 backdrop-blur-sm border-2 border-[#E6DCC3] px-8 py-4 rounded-xl shadow-sticky rotate-[-1deg]">
                <h1 className="font-hand-drawn text-3xl font-black text-[#5D4037] tracking-tight flex items-center justify-center gap-2">
                   <span className="text-red-400 text-4xl">♥</span>
                   感謝收藏牆
                   <span className="text-red-400 text-4xl">♥</span>
                </h1>
                <p className="text-stone-500 mt-1 font-bold font-handwritten text-lg">
                   Collection of Warmth
                </p>
             </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 w-full z-10 px-4 py-8">
        {loading ? (
           <div className="flex flex-col items-center justify-center pt-20 gap-4">
             <div className="w-12 h-12 border-4 border-[#D2A679] border-t-transparent rounded-full animate-spin"></div>
             <p className="text-[#8B5A2B] font-bold font-handwritten text-xl animate-pulse">Collecting happy memories...</p>
           </div>
        ) : cards.length === 0 ? (
          <div className="flex flex-col items-center justify-center pt-20 text-[#D2A679]/60">
            <span className="material-symbols-outlined text-8xl mb-4 rotate-12">push_pin</span>
            <p className="font-bold text-2xl font-handwritten text-[#8B5A2B]">這面牆還空空的...</p>
            <p className="text-lg font-handwritten mt-2">快去幫助鄰居，收集第一張感謝卡吧！</p>
          </div>
        ) : (
          <div className="mx-auto w-full max-w-5xl grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 md:gap-10 px-2">
            {cards.map((card, index) => {
              const pinColorClass = getPinColor(index);
              const rotationClass = getRotation(index);

              return (
                <div 
                  key={card.task_id}
                  className={`group relative flex flex-col w-full min-h-[280px] transition-all duration-300 hover:z-20 hover:scale-105 hover:rotate-0 ${rotationClass}`}
                >
                  {/* The Card Body */}
                  <div className="bg-white relative w-full h-full p-6 pb-4 shadow-sticky-lg rounded-sm flex flex-col justify-between border-b-4 border-r-4 border-stone-200/50">
                      
                      {/* --- Visual Pin Element --- */}
                      <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-20">
                          {/* Pin Head */}
                          <div className={`w-4 h-4 rounded-full shadow-md border-2 ${pinColorClass} z-20 relative`}></div>
                          {/* Pin Shadow on card */}
                          <div className="absolute top-3 left-1 w-3 h-3 bg-black/20 rounded-full blur-[1px]"></div>
                      </div>

                      {/* --- Content --- */}
                      <div className="flex flex-col gap-4 flex-1">
                          
                          {/* Task Tag & Date */}
                          <div className="flex justify-between items-start border-b border-dashed border-stone-200 pb-3">
                              <div className="bg-[#FFFACD] text-[#8B5A2B] px-3 py-1 rounded-sm text-xs font-bold uppercase tracking-wider shadow-sm transform -rotate-2 truncate max-w-[70%]">
                                  #{card.task?.title}
                              </div>
                              <div className="text-stone-400 font-handwritten font-bold text-lg">
                                  {formatDate(card.created_at)}
                              </div>
                          </div>

                          {/* Handwritten Message */}
                          <div className="flex-1 relative">
                              <span className="absolute -top-2 -left-2 text-4xl text-stone-200 font-serif">"</span>
                              <p className="text-xl leading-relaxed text-stone-700 font-handwritten pt-2 px-2 whitespace-pre-wrap break-words">
                                {card.message}
                              </p>
                              <span className="absolute -bottom-4 right-0 text-4xl text-stone-200 font-serif">"</span>
                          </div>
                      </div>

                      {/* --- Footer (Sender) --- */}
                      <div className="mt-6 flex items-center justify-end gap-3 pt-3 border-t border-stone-100">
                          <div className="text-right">
                              <p className="text-xs text-stone-400 font-bold uppercase tracking-widest">From</p>
                              <p className="text-sm font-bold text-stone-700 font-hand-drawn">{card.sender?.name || 'Friendly Neighbor'}</p>
                          </div>
                          <div 
                                className="size-10 rounded-full bg-cover bg-center bg-gray-100 border-2 border-white shadow-sm shrink-0"
                                style={{ backgroundImage: card.sender?.image_url ? `url('${card.sender.image_url}')` : undefined }}
                          >
                                {!card.sender?.image_url && (
                                    <div className="flex items-center justify-center h-full w-full text-stone-300">
                                        <span className="material-symbols-outlined text-lg">person</span>
                                    </div>
                                )}
                          </div>
                      </div>

                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      <BottomNav currentView={AppView.GRATITUDE} onNavigate={onNavigate} />
    </div>
  );
};

export default ThanksWall;