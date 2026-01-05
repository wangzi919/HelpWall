import React, { useState } from 'react';
import { StickyNoteData } from '../types';

interface StickyNoteProps {
  data: StickyNoteData;
  onTear?: () => void;
}

// Map tailwind bg classes to hue-rotate values to tint the yellow source image
const getHueRotate = (bgClass: string) => {
  switch (bgClass) {
    case 'bg-note-purple': return 'hue-rotate-[230deg]'; // Yellow -> Purple
    case 'bg-note-green': return 'hue-rotate-[80deg]';   // Yellow -> Green
    case 'bg-note-blue': return 'hue-rotate-[180deg]';   // Yellow -> Blue
    case 'bg-note-pink': return 'hue-rotate-[320deg]';   // Yellow -> Pink
    case 'bg-note-yellow':
    default: return 'hue-rotate-0';
  }
};

const StickyNote: React.FC<StickyNoteProps> = ({ data, onTear }) => {
  const [isHovered, setIsHovered] = useState(false);
  const [isTorn, setIsTorn] = useState(false);
  const [isImageLoaded, setIsImageLoaded] = useState(false);

  // Logic for the CSS transform property
  const getTransform = () => {
    if (isTorn) {
      // Fall down (gravity) and rotate loosely
      return `translateY(120vh) rotate(${data.rotation + 45}deg)`;
    }
    if (isHovered) {
      // "Pick up" effect: straighten and scale
      return `rotate(0deg) scale(1.1)`;
    }
    // Default pinned state
    return `rotate(${data.rotation}deg) scale(1)`;
  };

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isTorn) {
      setIsTorn(true);
      if (onTear) {
        onTear();
      }
    }
  };

  const hueClass = getHueRotate(data.color);

  return (
    <div
      onClick={handleClick}
      className="absolute flex flex-col items-center justify-center cursor-pointer transition-all preserve-3d w-[135px] h-[135px] md:w-[160px] md:h-[160px] lg:w-[200px] lg:h-[200px]"
      style={{
        top: data.top,
        left: data.left,
        right: data.right,
        transform: getTransform(),
        zIndex: isHovered && !isTorn ? 50 : data.zIndex,
        opacity: isTorn ? 0 : 1,
        pointerEvents: isTorn ? 'none' : 'auto',
        transitionDuration: isTorn ? '700ms' : '300ms',
        transitionTimingFunction: isTorn ? 'ease-in' : 'ease-out',
      }}
      onMouseEnter={() => !isTorn && setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Bouncing Map Task Icon (Moved further onto the note) */}
      <div className="absolute top-4 right-6 z-20 animate-bounce">
         <span 
           className="material-symbols-outlined text-red-500 text-2xl lg:text-3xl drop-shadow-sm" 
           style={{ fontVariationSettings: "'FILL' 1" }}
         >
           location_on
         </span>
      </div>

      {/* The Image Asset */}
      {/* We use drop-shadow on the image itself for accurate masking around the irregular png shape */}
      <img 
        src="https://pngimg.com/d/sticky_note_PNG18926.png" 
        alt="Sticky Note"
        onLoad={() => setIsImageLoaded(true)}
        className={`w-full h-full object-contain ${hueClass} ${isHovered && !isTorn ? 'drop-shadow-xl' : 'drop-shadow-md'} transition-all duration-300`}
        draggable={false}
      />

      {/* Content Overlay */}
      {/* Positioned to align with the paper part of the image, moved up to 12% top */}
      <div 
        className={`absolute top-[12%] left-0 w-full h-[88%] flex flex-col items-center justify-center p-3 text-center transition-opacity duration-500 ${isImageLoaded ? 'opacity-100' : 'opacity-0'}`}
      >
        <div className="text-slate-700/80 mb-1 transform transition-transform duration-300 scale-75 lg:scale-100">
            {data.icon}
        </div>
        {data.content && (
          <span className="font-bold text-xs md:text-sm lg:text-base text-slate-800/90 leading-tight font-sans whitespace-pre-line overflow-hidden line-clamp-3 w-[80%]">
            {data.content}
          </span>
        )}
      </div>
      
    </div>
  );
};

export default StickyNote;