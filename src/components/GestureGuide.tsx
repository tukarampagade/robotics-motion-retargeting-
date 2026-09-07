/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  CircleDot,
  Compass,
  Hand,
  HelpCircle,
  Minimize2,
  MousePointerClick,
  Sparkles,
  ThumbsUp,
  X,
} from 'lucide-react';
import { GestureType } from '../types';

interface GestureGuideProps {
  isOpen: boolean;
  currentGesture: GestureType;
  onToggleOpen: () => void;
}

interface GestureItem {
  type: GestureType;
  title: string;
  actionDesc: string;
  icon: React.ReactNode;
}

const GESTURE_ITEMS: GestureItem[] = [
  {
    type: 'WAVE',
    title: 'Wave',
    actionDesc: 'Friendly Greeting & Head Tilt',
    icon: (
      <div className="relative">
        <Hand className="w-3.5 h-3.5" />
        <span className="absolute -top-1 -right-1 text-[8px] animate-bounce">👋</span>
      </div>
    ),
  },
  {
    type: 'PINCH',
    title: 'Pinch',
    actionDesc: 'Fine Precision Finger Grip',
    icon: <Minimize2 className="w-3.5 h-3.5 text-cyan-600" />,
  },
  {
    type: 'FIST',
    title: 'Fist / Grab',
    actionDesc: 'Object Grasp / Pick Up',
    icon: <CircleDot className="w-3.5 h-3.5 text-amber-600" />,
  },
  {
    type: 'OPEN_PALM',
    title: 'Open Palm',
    actionDesc: 'Release Object / Idle Stance',
    icon: <Hand className="w-3.5 h-3.5 text-emerald-600" />,
  },
  {
    type: 'POINT',
    title: 'Point',
    actionDesc: 'Align Gaze & Extended Arm',
    icon: <MousePointerClick className="w-3.5 h-3.5 text-blue-600" />,
  },
  {
    type: 'VICTORY',
    title: 'Victory',
    actionDesc: 'V-Sign Celebration Pose',
    icon: (
      <div className="relative">
        <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
        <span className="absolute -top-1 -right-1 text-[8px]">✌️</span>
      </div>
    ),
  },
  {
    type: 'THUMBS_UP',
    title: 'Thumbs Up',
    actionDesc: 'System Acknowledge Pose',
    icon: <ThumbsUp className="w-3.5 h-3.5 text-emerald-600" />,
  },
];

export const GestureGuide: React.FC<GestureGuideProps> = ({
  isOpen,
  currentGesture,
  onToggleOpen,
}) => {
  const [isMinimized, setIsMinimized] = useState<boolean>(false);

  if (!isOpen) return null;

  return (
    <div
      id="gesture-guide-overlay"
      className="absolute bottom-12 left-4 z-20 max-w-xs transition-all duration-200 select-none animate-in fade-in slide-in-from-bottom-2"
    >
      <div className="bg-white/95 backdrop-blur-md rounded-2xl border border-slate-200/90 shadow-lg overflow-hidden text-slate-800">
        {/* Header Bar */}
        <div className="px-3 py-2 bg-slate-50/80 border-b border-slate-200/70 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded-md bg-cyan-100/80 border border-cyan-200 flex items-center justify-center text-cyan-700">
              <HelpCircle className="w-3 h-3" />
            </div>
            <span className="text-[11px] font-bold font-mono tracking-tight text-slate-800">
              GESTURE MAPPINGS
            </span>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => setIsMinimized(m => !m)}
              className="p-1 rounded hover:bg-slate-200/60 text-slate-500 transition-colors"
              title={isMinimized ? 'Expand Guide' : 'Collapse Guide'}
            >
              {isMinimized ? (
                <ChevronUp className="w-3.5 h-3.5" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5" />
              )}
            </button>
            <button
              onClick={onToggleOpen}
              className="p-1 rounded hover:bg-slate-200/60 text-slate-500 transition-colors"
              title="Close Gesture Guide"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Gesture Cards Content */}
        {!isMinimized && (
          <div className="p-2 space-y-1.5 max-h-72 overflow-y-auto font-mono text-[10px]">
            {GESTURE_ITEMS.map(item => {
              const isActive = currentGesture === item.type;
              return (
                <div
                  key={item.type}
                  className={`px-2.5 py-1.5 rounded-xl border transition-all flex items-center justify-between ${
                    isActive
                      ? 'bg-cyan-50 border-cyan-400 shadow-2xs scale-[1.01]'
                      : 'bg-white/60 border-slate-100 hover:border-slate-200'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <div
                      className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
                        isActive
                          ? 'bg-cyan-600 text-white shadow-xs'
                          : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {item.icon}
                    </div>
                    <div className="leading-tight">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`font-bold ${
                            isActive ? 'text-cyan-900' : 'text-slate-800'
                          }`}
                        >
                          {item.title}
                        </span>
                        {isActive && (
                          <span className="px-1.5 py-0.2 rounded-full bg-cyan-600 text-white text-[8px] font-semibold animate-pulse">
                            ACTIVE
                          </span>
                        )}
                      </div>
                      <span className="text-[9px] text-slate-600 block">
                        {item.actionDesc}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}

            <div className="pt-1.5 border-t border-slate-100 text-[9px] text-slate-600 text-center flex items-center justify-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
              <span>Real-time detection updates dynamically</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
