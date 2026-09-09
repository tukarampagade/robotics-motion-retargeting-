/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Router } from 'express';
import { RobotController } from '../controllers/robotController';
import { validateRobotCommandMiddleware } from '../middleware/validateRobotCommand';

const router = Router();

// POST /api/robot/command - Validated command dispatch with safety watchdog
router.post('/command', validateRobotCommandMiddleware, RobotController.handleCommand);

// POST /api/robot/stop - Emergency stop endpoint (always accepted)
router.post('/stop', RobotController.handleEmergencyStop);

// POST /api/robot/reset-stop - Reset emergency stop latch
router.post('/reset-stop', RobotController.handleResetEmergencyStop);

// GET /api/robot/status - Health & current locomotion status
router.get('/status', RobotController.handleGetStatus);

export default router;
