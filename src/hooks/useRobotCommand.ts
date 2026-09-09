/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import {
  RobotCommand,
  RobotControlConfig,
  DEFAULT_ROBOT_CONFIG,
  RobotConnectionStatus,
  RobotDriveState,
} from '../types/robot';
import { RobotApiService } from '../services/robotApi';

interface UseRobotCommandOptions {
  config?: Partial<RobotControlConfig>;
  enabled?: boolean;
  onCommandChange?: (command: RobotCommand) => void;
}

export function useRobotCommand({
  config: userConfig,
  enabled = true,
  onCommandChange,
}: UseRobotCommandOptions = {}) {
  const config = { ...DEFAULT_ROBOT_CONFIG, ...userConfig };

  const [activeCommand, setActiveCommand] = useState<RobotCommand>('STOP');
  const [connectionStatus, setConnectionStatus] = useState<RobotConnectionStatus>('connected');
  const [isEmergencyStopped, setIsEmergencyStopped] = useState<boolean>(false);
  const [lastCommandLatencyMs, setLastCommandLatencyMs] = useState<number>(0);
  const [commandSource, setCommandSource] = useState<string>('init');

  // Simulated continuous robot ground drive state (position X, Z, heading rotation, speed)
  const [driveState, setDriveState] = useState<RobotDriveState>({
    x: 0,
    z: 0,
    rotationY: 0,
    command: 'STOP',
    speed: 0,
    isEmergencyStopped: false,
  });

  const activeCommandRef = useRef<RobotCommand>('STOP');
  const lastDispatchedCommandRef = useRef<RobotCommand>('STOP');
  const lastDispatchTimestampRef = useRef<number>(0);
  const isEmergencyStoppedRef = useRef<boolean>(false);
  const isMountedRef = useRef<boolean>(true);

  // Dispatch command to backend with debounce and heartbeat
  const dispatchCommand = useCallback(
    async (
      command: RobotCommand,
      source: string = 'gesture',
      confidence: number = 1.0,
      force: boolean = false
    ) => {
      if (!isMountedRef.current) return;

      const now = Date.now();
      const timeSinceLastDispatch = now - lastDispatchTimestampRef.current;

      // Check debounce unless forced (e.g. heartbeat or emergency stop)
      if (!force && command === lastDispatchedCommandRef.current && timeSinceLastDispatch < config.commandDebounceMs) {
        return;
      }

      const startTime = performance.now();
      lastDispatchTimestampRef.current = now;
      lastDispatchedCommandRef.current = command;

      try {
        const res = await RobotApiService.sendCommand(command, source, confidence);
        if (isMountedRef.current) {
          const latency = Math.round(performance.now() - startTime);
          setLastCommandLatencyMs(latency);
          setConnectionStatus(res.ok ? 'connected' : 'error');

          if (res.emergencyStopped) {
            isEmergencyStoppedRef.current = true;
            setIsEmergencyStopped(true);
            activeCommandRef.current = 'STOP';
            setActiveCommand('STOP');
          }
        }
      } catch {
        if (isMountedRef.current) {
          setConnectionStatus('error');
          // On network failure, fail-safe: set active command to STOP
          activeCommandRef.current = 'STOP';
          setActiveCommand('STOP');
        }
      }
    },
    [config.commandDebounceMs]
  );

  // Set command (e.g. from stable hand gesture or keyboard)
  const setCommand = useCallback(
    (command: RobotCommand, source: string = 'gesture', confidence: number = 1.0) => {
      if (!enabled) return;

      if (isEmergencyStoppedRef.current && command !== 'STOP') {
        return;
      }

      if (activeCommandRef.current !== command) {
        activeCommandRef.current = command;
        setActiveCommand(command);
        setCommandSource(source);
        onCommandChange?.(command);

        // Immediate dispatch when state transitions
        dispatchCommand(command, source, confidence, true);
      }
    },
    [dispatchCommand, enabled, onCommandChange]
  );

  // Manual Emergency Stop button
  const triggerEmergencyStop = useCallback(async () => {
    isEmergencyStoppedRef.current = true;
    setIsEmergencyStopped(true);
    activeCommandRef.current = 'STOP';
    setActiveCommand('STOP');
    setCommandSource('emergency_stop');
    onCommandChange?.('STOP');

    await RobotApiService.emergencyStop('manual_ui_button');
  }, [onCommandChange]);

  // Reset Emergency Stop
  const resetEmergencyStop = useCallback(async () => {
    isEmergencyStoppedRef.current = false;
    setIsEmergencyStopped(false);
    activeCommandRef.current = 'STOP';
    setActiveCommand('STOP');
    setCommandSource('reset_e_stop');

    await RobotApiService.resetEmergencyStop();
  }, []);

  // Heartbeat loop: sends periodic command heartbeat to refresh the server watchdog
  useEffect(() => {
    if (!enabled) return;

    const interval = setInterval(() => {
      // Send heartbeat if robot is currently active
      if (activeCommandRef.current !== 'STOP' && !isEmergencyStoppedRef.current) {
        dispatchCommand(activeCommandRef.current, 'heartbeat', 1.0, true);
      }
    }, config.commandHeartbeatMs);

    return () => clearInterval(interval);
  }, [config.commandHeartbeatMs, dispatchCommand, enabled]);

  // Fail-safe cleanup: on unmount, page reload, or close, immediately send STOP
  useEffect(() => {
    isMountedRef.current = true;

    const handleBeforeUnload = () => {
      // Use keepalive / sendBeacon for guaranteed delivery
      RobotApiService.emergencyStop('page_unload');
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      isMountedRef.current = false;
      window.removeEventListener('beforeunload', handleBeforeUnload);
      RobotApiService.emergencyStop('component_unmount');
    };
  }, []);

  // Keyboard fallback controls:
  // W / ArrowUp: FORWARD
  // S / ArrowDown: BACKWARD
  // A / ArrowLeft: LEFT
  // D / ArrowRight: RIGHT
  // Space / Escape: STOP
  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing in an input or textarea
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return;
      }

      switch (e.key) {
        case 'w':
        case 'W':
        case 'ArrowUp':
          e.preventDefault();
          setCommand('FORWARD', 'keyboard', 1.0);
          break;
        case 's':
        case 'S':
        case 'ArrowDown':
          e.preventDefault();
          setCommand('BACKWARD', 'keyboard', 1.0);
          break;
        case 'a':
        case 'A':
        case 'ArrowLeft':
          e.preventDefault();
          setCommand('LEFT', 'keyboard', 1.0);
          break;
        case 'd':
        case 'D':
        case 'ArrowRight':
          e.preventDefault();
          setCommand('RIGHT', 'keyboard', 1.0);
          break;
        case ' ':
        case 'Escape':
          e.preventDefault();
          if (e.key === 'Escape') {
            triggerEmergencyStop();
          } else {
            setCommand('STOP', 'keyboard', 1.0);
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [enabled, setCommand, triggerEmergencyStop]);

  // Smooth robot physics locomotion simulation for the 3D viewport
  // Physics state is updated in real-time inside driveStateRef, while React UI state
  // is throttled (10 Hz or on state transition) to eliminate 60 FPS React re-renders.
  const driveStateRef = useRef<RobotDriveState>({
    x: 0,
    z: 0,
    rotationY: 0,
    command: 'STOP',
    speed: 0,
    isEmergencyStopped: false,
  });

  useEffect(() => {
    let animFrame: number;
    let lastTime = performance.now();
    let lastUiSyncTime = 0;

    const updatePhysics = (time: number) => {
      const dt = Math.min(0.1, (time - lastTime) / 1000);
      lastTime = time;

      const current = driveStateRef.current;
      let { x, z, rotationY, speed } = current;
      const currentCmd = activeCommandRef.current;
      const eStop = isEmergencyStoppedRef.current;

      const maxLinearSpeed = 1.4; // m/s
      const maxTurnSpeed = 1.5; // rad/s
      const acceleration = 3.5;
      const deceleration = 5.0;

      if (eStop || currentCmd === 'STOP') {
        speed = Math.max(0, speed - deceleration * dt);
      } else if (currentCmd === 'FORWARD') {
        speed = Math.min(maxLinearSpeed, speed + acceleration * dt);
      } else if (currentCmd === 'BACKWARD') {
        speed = Math.max(-maxLinearSpeed * 0.7, speed - acceleration * dt);
      } else if (currentCmd === 'LEFT') {
        rotationY += maxTurnSpeed * dt;
        speed = Math.max(0, speed - deceleration * dt);
      } else if (currentCmd === 'RIGHT') {
        rotationY -= maxTurnSpeed * dt;
        speed = Math.max(0, speed - deceleration * dt);
      }

      // Apply movement vector in heading direction
      if (Math.abs(speed) > 0.001) {
        x += Math.sin(rotationY) * speed * dt;
        z += Math.cos(rotationY) * speed * dt;
      }

      driveStateRef.current = {
        x,
        z,
        rotationY,
        command: currentCmd,
        speed,
        isEmergencyStopped: eStop,
      };

      // Throttled UI state sync (10 Hz while moving, or immediate on command/eStop transition)
      const isMoving = Math.abs(speed) > 0.01 || currentCmd !== 'STOP';
      const cmdChanged = currentCmd !== current.command || eStop !== current.isEmergencyStopped;
      const timeSinceUiSync = time - lastUiSyncTime;

      if (cmdChanged || (isMoving && timeSinceUiSync >= 100) || (!isMoving && current.speed > 0 && speed === 0)) {
        lastUiSyncTime = time;
        setDriveState({ ...driveStateRef.current });
      }

      animFrame = requestAnimationFrame(updatePhysics);
    };

    animFrame = requestAnimationFrame(updatePhysics);
    return () => cancelAnimationFrame(animFrame);
  }, []);

  return {
    activeCommand,
    setCommand,
    triggerEmergencyStop,
    resetEmergencyStop,
    isEmergencyStopped,
    connectionStatus,
    lastCommandLatencyMs,
    commandSource,
    driveState,
    driveStateRef,
  };
}
