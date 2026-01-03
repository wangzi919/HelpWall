import { StickyNoteData } from './types';
import { 
  Smile, 
  Users, 
  Hammer,
  ShoppingBag,
  Droplets,
  Umbrella
} from 'lucide-react';
import React from 'react';

export const APP_NAME = "HelpWall";
export const TAGLINE = "A little help, right around the corner.";

// Note colors
export const NOTE_COLORS = {
  PURPLE: 'bg-note-purple',
  YELLOW: 'bg-note-yellow',
  GREEN: 'bg-note-green',
  BLUE: 'bg-note-blue',
  PINK: 'bg-note-pink',
};

// Pin colors
export const PIN_COLORS = {
  BLUE: 'bg-blue-500',
  GREEN: 'bg-green-500',
  RED: 'bg-red-400',
  YELLOW: 'bg-yellow-400',
};

// Initial notes for the login screen to match the image
// Coordinates updated for a vertical/rectangular container (Right Column)
// Using mixed 'left' and 'right' positioning for better responsiveness
export const LOGIN_SCREEN_NOTES: StickyNoteData[] = [
  {
    id: '1',
    type: 'help',
    content: 'Walk Dog',
    icon: React.createElement(Smile, { className: "w-8 h-8 mb-1" }),
    color: NOTE_COLORS.PURPLE,
    pinColor: PIN_COLORS.BLUE,
    rotation: 0,
    top: '3%', 
    left: '15%', 
    zIndex: 10
  },
  {
    id: '2',
    type: 'cheer',
    content: 'Fix Light',
    icon: React.createElement(Hammer, { className: "w-9 h-9 mb-1" }),
    color: NOTE_COLORS.YELLOW,
    pinColor: PIN_COLORS.GREEN,
    rotation: 0,
    top: '9%',
    right: '2%', // Changed from left: 52% to right: 12%
    zIndex: 5
  },
  {
    id: '3',
    type: 'info',
    content: 'Coffee Run',
    icon: React.createElement(ShoppingBag, { className: "w-8 h-8 mt-1" }),
    color: NOTE_COLORS.BLUE,
    pinColor: PIN_COLORS.RED,
    rotation: 0,
    top: '26%',
    left: '35%', 
    zIndex: 6
  },
  {
    id: '6',
    type: 'community',
    content: 'Community',
    icon: React.createElement(Users, { className: "w-10 h-10 mt-1" }),
    color: NOTE_COLORS.BLUE,
    pinColor: PIN_COLORS.YELLOW,
    rotation: 0, 
    top: '35%',
    left: '2%', 
    zIndex: 9
  },
  {
    id: '4',
    type: 'cheer',
    content: 'Water Plants',
    icon: React.createElement(Droplets, { className: "w-9 h-9 mt-1" }),
    color: NOTE_COLORS.GREEN,
    pinColor: PIN_COLORS.BLUE,
    rotation: 0,
    top: '42%',
    right: '0%', // Changed from left: 60% to right: 8%
    zIndex: 7
  },
  {
    id: '7',
    type: 'info',
    content: 'Need Umbrella',
    icon: React.createElement(Umbrella, { className: "w-10 h-10 mb-1" }),
    color: NOTE_COLORS.PINK,
    pinColor: PIN_COLORS.YELLOW,
    rotation: 0,
    top: '58%', 
    left: '12%', 
    zIndex: 8
  }
];