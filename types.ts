import React from 'react';

export enum AppView {
  LOGIN = 'LOGIN',
  DASHBOARD = 'DASHBOARD',
  TASK_DETAIL = 'TASK_DETAIL',
  USER_PROFILE = 'USER_PROFILE',
  TIME_CREDIT_LOG = 'TIME_CREDIT_LOG',
  GRATITUDE = 'GRATITUDE',
  JOURNAL = 'JOURNAL'
}

export interface StickyNoteData {
  id: string;
  type: 'help' | 'cheer' | 'community' | 'info';
  content: string;
  icon: React.ReactNode;
  color: string;
  pinColor: string;
  rotation: number;
  top: string;
  left?: string;
  right?: string;
  zIndex: number;
}

export interface Task {
  id: string;
  user_uid: string;
  title: string;
  description: string;
  image_url?: string;
  lat: number;
  lng: number;
  color: string;
  expected_time?: string;
  time_credit?: number;
  created_at?: string;
  // Columns moved from task_assignment
  status?: 'in_progress' | 'completed' | null;
  helper_uid?: string | null;
}

export interface ThanksCard {
  // id removed as task_id is now PK
  sender_uid: string;
  receiver_uid: string;
  task_id: string;
  message: string;
  created_at?: string;
  is_read?: boolean;
}