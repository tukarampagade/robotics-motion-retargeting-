/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { GestureResult, RobotControlConfig, DEFAULT_ROBOT_CONFIG } from '../types/robot';
import { classifyHandSign, LandmarkPoint2D } from '../utils/gestureClassifier';

interface UseHandGestureRecognitionOptions {
  config?: Partial<RobotControlConfig>;
  onStableGestureChange?: (result: GestureResult) => void;
  onNoHandTimeout?: () => void;
}

export function useHandGestureRecognition({
  config: userConfig,
  onStableGestureChange,
  onNoHandTimeout,
}: UseHandGestureRecognitionOptions = {}) {
  const config = { ...DEFAULT_ROBOT_CONFIG, ...userConfig };

  // Recognition state is kept strictly separate from UI state:
  // Raw instantaneous frame classifications are stored in mutable refs to prevent 60 FPS React re-renders.
  // React state is ONLY updated when stable gesture transitions or hand presence status flips.
  const rawGestureRef = useRef<GestureResult>({
    gesture: 'NO_HAND',
    command: 'STOP',
    confidence: 0,
    timestamp: Date.now(),
  });

  const [stableGesture, setStableGesture] = useState<GestureResult>({
    gesture: 'NO_HAND',
    command: 'STOP',
    confidence: 0,
    timestamp: Date.now(),
  });

  const [isHandDetected, setIsHandDetected] = useState<boolean>(false);
  const isHandDetectedRef = useRef<boolean>(false);

  // Buffer tracking consecutive frames of the candidate gesture
  const candidateGestureRef = useRef<GestureResult['gesture']>('NO_HAND');
  const candidateCountRef = useRef<number>(0);
  const [candidateCount, setCandidateCount] = useState<number>(0);
  const stableGestureRef = useRef<GestureResult>({
    gesture: 'NO_HAND',
    command: 'STOP',
    confidence: 0,
    timestamp: Date.now(),
  });

  // Timestamp of the last valid hand detection for no-hand watchdog
  const lastHandDetectionTimeRef = useRef<number>(Date.now());
  const lastProcessedTimeRef = useRef<number>(0);
  const minIntervalMs = 1000 / Math.max(1, config.processingFps);

  // Watchdog timer checking for no-hand timeout (500ms default)
  useEffect(() => {
    const interval = setInterval(() => {
      const timeSinceLastHand = Date.now() - lastHandDetectionTimeRef.current;
      if (timeSinceLastHand > config.noHandStopTimeoutMs) {
        if (stableGestureRef.current.gesture !== 'NO_HAND' || stableGestureRef.current.command !== 'STOP') {
          const stopResult: GestureResult = {
            gesture: 'NO_HAND',
            command: 'STOP',
            confidence: 0,
            timestamp: Date.now(),
          };
          candidateGestureRef.current = 'NO_HAND';
          candidateCountRef.current = 0;
          rawGestureRef.current = stopResult;
          stableGestureRef.current = stopResult;
          setStableGesture(stopResult);
          setCandidateCount(0);
          if (isHandDetectedRef.current) {
            isHandDetectedRef.current = false;
            setIsHandDetected(false);
          }
          onNoHandTimeout?.();
          onStableGestureChange?.(stopResult);
        }
      }
    }, 100);

    return () => clearInterval(interval);
  }, [config.noHandStopTimeoutMs, onNoHandTimeout, onStableGestureChange]);

  const processFrame = useCallback(
    (
      landmarks?: LandmarkPoint2D[] | null,
      handConfidence: number = 1.0,
      isMirrored: boolean = true
    ): GestureResult => {
      const now = Date.now();

      // FPS throttling: process frames at controlled rate (default 12-15 FPS)
      if (now - lastProcessedTimeRef.current < minIntervalMs) {
        return stableGestureRef.current;
      }
      lastProcessedTimeRef.current = now;

      // Classify raw gesture without triggering React renders
      const result = classifyHandSign(
        landmarks,
        config.minHandConfidence,
        handConfidence,
        isMirrored
      );
      rawGestureRef.current = result;

      // Track hand presence and watchdog timestamp
      const hasHand = Boolean(landmarks && landmarks.length >= 21 && handConfidence >= config.minHandConfidence);
      if (hasHand) {
        lastHandDetectionTimeRef.current = now;
      }
      if (isHandDetectedRef.current !== hasHand) {
        isHandDetectedRef.current = hasHand;
        setIsHandDetected(hasHand);
      }

      // 3-frame stability filter: require identical gesture for configured consecutive frames
      if (result.gesture === candidateGestureRef.current) {
        candidateCountRef.current += 1;
      } else {
        candidateGestureRef.current = result.gesture;
        candidateCountRef.current = 1;
      }

      // Immediate fail-safe STOP if no hand or safety gesture detected
      const isSafetyStop = result.command === 'STOP';
      const meetsStability =
        candidateCountRef.current >= config.gestureStabilityFrames ||
        (isSafetyStop && result.gesture === 'NO_HAND');

      if (meetsStability && stableGestureRef.current.gesture !== result.gesture) {
        stableGestureRef.current = result;
        setStableGesture(result);
        setCandidateCount(candidateCountRef.current);
        onStableGestureChange?.(result);
      }

      return result;
    },
    [
      config.gestureStabilityFrames,
      config.minHandConfidence,
      minIntervalMs,
      onStableGestureChange,
    ]
  );

  const resetGestureState = useCallback(() => {
    const stopResult: GestureResult = {
      gesture: 'NO_HAND',
      command: 'STOP',
      confidence: 0,
      timestamp: Date.now(),
    };
    candidateGestureRef.current = 'NO_HAND';
    candidateCountRef.current = 0;
    rawGestureRef.current = stopResult;
    stableGestureRef.current = stopResult;
    setStableGesture(stopResult);
    setCandidateCount(0);
    isHandDetectedRef.current = false;
    setIsHandDetected(false);
  }, []);

  return {
    currentGesture: stableGesture,
    stableGesture,
    isHandDetected,
    processFrame,
    resetGestureState,
    candidateCount,
    getRawGesture: () => rawGestureRef.current,
  };
}
