/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import {
  Activity,
  Bot,
  Box,
  ChevronLeft,
  ChevronRight,
  Compass,
  Hand,
  Info,
  Layers,
  Package,
  Palette,
  Rotate3d,
  Sliders,
  Sparkles,
  Zap,
} from 'lucide-react';
import { GestureType, RobotCommand } from '../types';

export type ActiveNavTab =
  | 'studio'
  | 'handsign'
  | 'kinematics'
  | 'debug'
  | 'gestures'
  | 'calibration'
  | 'customization';

interface SidebarProps {
  activeTab: ActiveNavTab;
  onSelectTab: (tab: ActiveNavTab) => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onOpenDesignSystem?: () => void;
  isCameraActive: boolean;
  mode: 'LIVE' | 'DEMO' | 'CALIBRATING';
  currentGesture: GestureType;
  activeRobotCommand?: RobotCommand;
  accentColor?: 'cyan' | 'indigo' | 'emerald' | 'amber';
}

interface NavItem {
  id: ActiveNavTab;
  label: string;
  description: string;
  icon: React.ReactNode;
  badge?: string | number;
  badgeType?: 'default' | 'accent' | 'success';
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onSelectTab,
  isCollapsed,
  onToggleCollapse,
  isCameraActive,
  mode,
  currentGesture,
  activeRobotCommand = 'STOP',
  accentColor = 'cyan',
}) => {
  const navItems: NavItem[] = [
    {
      id: 'studio',
      label: 'Motion Studio',
      description: 'Humanoid mirroring & vision workspace',
      icon: <Bot className="w-4 h-4" />,
      badge: mode === 'DEMO' ? 'DEMO' : isCameraActive ? 'LIVE' : undefined,
      badgeType: isCameraActive ? 'success' : 'default',
    },
    {
      id: 'handsign',
      label: 'Hand-Sign Control',
      description: 'Robot gesture teleoperation & drive',
      icon: <Hand className="w-4 h-4" />,
      badge: activeRobotCommand !== 'STOP' ? activeRobotCommand : undefined,
      badgeType: activeRobotCommand !== 'STOP' ? 'accent' : 'default',
    },
    {
      id: 'kinematics',
      label: 'Kinematics & IK',
      description: 'Real-time joint angles & telemetry',
      icon: <Activity className="w-4 h-4" />,
      badge: 'Diagnostics',
      badgeType: 'default',
    },
    {
      id: 'debug',
      label: 'Hand Debug Panel',
      description: 'Raw joint vectors, calibration & angles',
      icon: <Zap className="w-4 h-4" />,
      badge: 'MATH',
      badgeType: 'accent',
    },
    {
      id: 'gestures',
      label: 'Gesture Center',
      description: 'Detected hand poses & trigger bindings',
      icon: <Hand className="w-4 h-4" />,
      badge: currentGesture !== '—' && currentGesture !== 'MIRRORING' ? currentGesture : undefined,
      badgeType: 'accent',
    },
    {
      id: 'calibration',
      label: 'Calibration',
      description: 'Zero neutral posture & arm reach',
      icon: <Compass className="w-4 h-4" />,
      badge: mode === 'CALIBRATING' ? 'ACTIVE' : undefined,
      badgeType: 'accent',
    },
    {
      id: 'customization',
      label: 'Appearance',
      description: 'Studio lighting, themes & visual aids',
      icon: <Palette className="w-4 h-4" />,
    },
  ];

  // Dynamic accent style mappings
  const accentClasses = {
    cyan: {
      activeBg: 'bg-sky-50 text-sky-800 border-sky-200 shadow-xs',
      activeIcon: 'text-sky-600',
      activeIndicator: 'bg-sky-600',
      badgeBg: 'bg-sky-100 text-sky-800 border border-sky-300',
    },
    indigo: {
      activeBg: 'bg-indigo-50 text-indigo-800 border-indigo-200 shadow-xs',
      activeIcon: 'text-indigo-600',
      activeIndicator: 'bg-indigo-600',
      badgeBg: 'bg-indigo-100 text-indigo-800 border border-indigo-300',
    },
    emerald: {
      activeBg: 'bg-emerald-50 text-emerald-800 border-emerald-200 shadow-xs',
      activeIcon: 'text-emerald-600',
      activeIndicator: 'bg-emerald-600',
      badgeBg: 'bg-emerald-100 text-emerald-800 border border-emerald-300',
    },
    amber: {
      activeBg: 'bg-amber-50 text-amber-900 border-amber-200 shadow-xs',
      activeIcon: 'text-amber-600',
      activeIndicator: 'bg-amber-600',
      badgeBg: 'bg-amber-100 text-amber-800 border border-amber-300',
    },
  }[accentColor];

  return (
    <aside
      className={`relative h-full flex flex-col justify-between bg-white border-r border-slate-200 transition-all duration-300 ease-in-out shrink-0 select-none z-20 text-slate-700 shadow-xs ${
        isCollapsed ? 'w-16' : 'w-64'
      }`}
    >
      {/* Top Section: Navigation Items */}
      <div className="flex flex-col p-3 gap-1.5 flex-1 overflow-y-auto overflow-x-hidden">
        {/* Navigation Category Label (only when expanded) */}
        {!isCollapsed && (
          <div className="px-2 pt-1 pb-2 flex items-center justify-between">
            <span className="text-[11px] font-bold tracking-wider text-slate-400 uppercase">
              Main Navigation
            </span>
            <span className="text-[10px] font-mono text-sky-600 font-semibold">v2.5</span>
          </div>
        )}

        {/* Nav List */}
        <nav className="flex flex-col gap-1">
          {navItems.map(item => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                id={`nav-item-${item.id}`}
                onClick={() => onSelectTab(item.id)}
                title={isCollapsed ? `${item.label} — ${item.description}` : undefined}
                className={`group relative flex items-center rounded-xl transition-all duration-200 text-left border cursor-pointer ${
                  isCollapsed ? 'h-11 justify-center px-0' : 'h-12 px-3 justify-between'
                } ${
                  isActive
                    ? `${accentClasses.activeBg} font-semibold`
                    : 'bg-transparent border-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                {/* Active left indicator bar */}
                {isActive && (
                  <span
                    className={`absolute left-0 top-2 bottom-2 w-1 rounded-r-full ${accentClasses.activeIndicator}`}
                  />
                )}

                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={`shrink-0 transition-colors ${
                      isActive ? accentClasses.activeIcon : 'text-slate-400 group-hover:text-slate-700'
                    }`}
                  >
                    {item.icon}
                  </div>

                  {!isCollapsed && (
                    <div className="truncate">
                      <div className="text-xs font-semibold leading-tight text-slate-800 truncate">
                        {item.label}
                      </div>
                      <div className="text-[10px] text-slate-400 leading-tight truncate">
                        {item.description}
                      </div>
                    </div>
                  )}
                </div>

                {/* Badge indicator */}
                {!isCollapsed && item.badge && (
                  <span
                    className={`shrink-0 ml-2 px-1.5 py-0.5 rounded-full text-[9.5px] font-mono font-semibold uppercase tracking-wider ${
                      item.badgeType === 'success'
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-300'
                        : item.badgeType === 'accent'
                        ? accentClasses.badgeBg
                        : 'bg-slate-100 text-slate-700 border border-slate-200'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}

                {/* Collapsed active mini dot */}
                {isCollapsed && isActive && (
                  <span
                    className={`absolute right-1.5 top-1.5 w-1.5 h-1.5 rounded-full ${accentClasses.activeIndicator}`}
                  />
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Bottom Section: Status & Collapse Control */}
      <div className="p-3 border-t border-slate-200 flex flex-col gap-2 bg-slate-50/80">
        {/* System Operator Status Badge (when expanded) */}
        {!isCollapsed && (
          <div className="px-3 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 flex items-center justify-between text-[11px] font-mono shadow-2xs">
            <div className="flex items-center gap-1.5 truncate">
              <span
                className={`w-2 h-2 rounded-full shrink-0 ${
                  isCameraActive
                    ? 'bg-emerald-500 animate-pulse'
                    : mode === 'DEMO'
                    ? 'bg-amber-500'
                    : 'bg-slate-400'
                }`}
              />
              <span className="truncate text-slate-800 font-semibold">
                {isCameraActive ? 'STATION LIVE' : mode === 'DEMO' ? 'SIMULATION' : 'STANDBY'}
              </span>
            </div>
            <span className="text-[10px] text-slate-400">UVC-CAM</span>
          </div>
        )}

        {/* Collapse / Expand Toggle Button */}
        <button
          id="btn-toggle-sidebar"
          onClick={onToggleCollapse}
          title={isCollapsed ? 'Expand sidebar ([)' : 'Collapse sidebar ([)'}
          className={`flex items-center justify-center rounded-xl h-9 text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors border border-transparent cursor-pointer ${
            isCollapsed ? 'w-full' : 'px-3 justify-between'
          }`}
        >
          {!isCollapsed && (
            <span className="text-xs font-medium text-slate-600">Collapse sidebar</span>
          )}
          <div className="flex items-center gap-1 text-slate-400">
            {!isCollapsed && <kbd className="font-mono text-[10px] bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200 text-slate-600">[</kbd>}
            {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </div>
        </button>
      </div>
    </aside>
  );
};
