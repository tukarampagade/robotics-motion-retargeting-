# MotionMirror AI

## Real-Time Human-to-Humanoid Robot Motion Mirroring

MotionMirror AI is a browser-based computer-vision and 3D robotics project that uses a laptop webcam to track a person's upper-body movement and hands, then retargets that motion to an articulated half-body humanoid robot rendered in Three.js.

The project is designed as a real-time robotics interaction workstation rather than a static animation.

---

## Project Overview

The core pipeline is:

```text
Laptop Webcam
     │
     ▼
MediaPipe Vision
     │
     ├── Pose Landmarks
     └── Hand Landmarks
              │
              ▼
     Motion Retargeting
              │
              ▼
       Robot Joint Angles
              │
              ▼
       Three.js Robot Rig

The system supports upper-body motion, two-hand tracking, individual finger articulation, head movement, eye response, gestures, calibration, and a virtual pick-and-place workstation.

Main Features
1. Real-Time Webcam Tracking

The application uses the laptop webcam as the primary input.

The camera pipeline uses MediaPipe Tasks Vision with:

Pose Landmarker
Hand Landmarker
VIDEO running mode
GPU delegate
Two-hand tracking
Real-time landmark processing

Camera input is processed directly in the browser.

2. Two-Hand Tracking

The project maintains separate left- and right-hand states.

Supported states:

No hand
Left hand
Right hand
Both hands

Hand identity is based on MediaPipe handedness rather than simply using screen position.

3. Full 21-Point Hand Model

Each detected hand uses the complete MediaPipe 21-landmark topology:

0  Wrist

Thumb:
1  CMC
2  MCP
3  IP
4  Tip

Index:
5  MCP
6  PIP
7  DIP
8  Tip

Middle:
9  MCP
10 PIP
11 DIP
12 Tip

Ring:
13 MCP
14 PIP
15 DIP
16 Tip

Pinky:
17 MCP
18 PIP
19 DIP
20 Tip

These landmarks are used for finger kinematics, wrist orientation, pinch detection, grip detection, and gesture classification.

Robotic Hand

The robot contains an articulated upper-body rig with two mechanical hands.

Each hand includes:

Thumb
Index finger
Middle finger
Ring finger
Pinky finger
Wrist
Palm
MCP/PIP/DIP finger joints

Finger motion is calculated from landmark geometry rather than only switching between predefined open/closed animations.

The project includes independent finger-joint calculations for:

Thumb
Index
Middle
Ring
Pinky
Motion Retargeting

Human motion is converted into robot joint angles through a motion-retargeting layer.

The architecture includes:

Hand landmark analysis
Palm coordinate frame calculation
Wrist yaw/pitch/roll estimation
Finger joint angle calculation
Two-bone arm inverse kinematics
Shoulder movement
Elbow movement
Wrist movement
Motion gain
Joint limits
Body-boundary protection

The arm chain is conceptually:

Shoulder
   ↓
Upper Arm
   ↓
Elbow
   ↓
Forearm
   ↓
Wrist
   ↓
Palm
   ↓
Fingers

This allows hand and arm movement to remain connected instead of treating the hand as an unrelated animation.

Head, Eyes and Mouth

The robot upper body also includes:

Head
Yaw
Pitch
Roll
Eyes
Horizontal gaze
Vertical gaze
Mouth

The robot model includes a mouth display with application states such as:

Neutral
Smile
Speaking
Interacting
Half-Body Robot

The robot is intentionally designed as a half-body humanoid.

Included:

Head
Neck
Chest
Torso
Shoulders
Upper arms
Elbows
Forearms
Wrists
Hands
Fingers

The current robot design does not use full human legs as part of the mirrored robot body.

The visual style is a professional robotics prototype using:

White armor
Silver/light metallic components
Dark mechanical joints
Cyan status accents
Mechanical bearings
Panel details
Soft studio lighting
Pick-and-Place Workstation

The project includes a virtual pick-and-place station.

Supported object types include:

Box
Cylinder
Package

The pick-and-place module is integrated with the robot scene and can track:

Held object
Holding hand
Placement state
Placed object count

The intended interaction is:

Reach object
    ↓
Grip / pinch
    ↓
Robot hand holds object
    ↓
Move hand
    ↓
Object follows hand
    ↓
Open hand
    ↓
Object released
    ↓
Target zone
Smoothing and Motion Stability

The project includes a custom One Euro Filter implementation.

Filtering is available for:

Pose landmarks
Left-hand landmarks
Right-hand landmarks

The response presets include:

ultra_fast
balanced
cinematic

The goal is to reduce webcam jitter while preserving fast intentional movement.

Performance Architecture

The project separates:

Vision FPS
Render FPS
Latency

The Three.js scene is rendered independently from the vision-processing loop.

The application tracks real performance metrics rather than hard-coding an FPS value.

Performance-related features include:

requestAnimationFrame
Vision processing throttling
Latest-frame checking
Mutable refs for high-frequency motion state
One Euro filtering
Separate render and vision FPS measurement
Adaptive response presets

Recommended target:

60 FPS rendering minimum where hardware supports it
90–120 FPS rendering on capable displays/GPU hardware
Vision inference around 20–30 FPS
Interpolation between vision results for smooth rendering
Calibration

The application contains a calibration system that records reference values such as:

Shoulder width
Arm length
Neutral head orientation
Calibration sample count
Calibration progress

Calibration is intended to make the retargeting system more stable for different users and camera positions.

Robot Safety / Body Boundary

The robot arm IK implementation contains body-boundary protection.

The purpose is to prevent the virtual robot arm from penetrating its own:

Chest
Torso
Head
Internal body region

The arm solver also includes stabilization around near-singular configurations to reduce undesirable elbow wandering.

Gesture Recognition

The project supports landmark-based gesture classification for:

Open palm
Fist
Point
Victory
Thumbs up
Thumbs down
Pinch
Wave
Mirroring

Gesture labels are separate from continuous finger motion. Individual hand landmarks remain the primary source for articulated finger movement.

Demo Mode

The project includes a demo playback system.

Demo sequences can demonstrate:

Head movement
Eye gaze
Arm movement
Wave gesture
Victory gesture
Pointing
Pick-and-place motion
Object release
Robot reset

This mode is useful when a webcam is unavailable.

Important: Demo Mode should remain separate from Live Mode. Live Mode should use real webcam tracking rather than scripted animation.

User Interface

The UI is built with React and TypeScript.

Major interface components include:

Header
CameraView
RobotViewport
PickPlacePanel
DebugDrawer
CalibrationModal
SettingsModal
GestureGuide

Available controls/settings include:

Camera
Mirror camera
Show skeleton
Show fingers
Motion gain
Smoothing
Camera view
Pick and place
Debug mode
Motion trails
Gesture guide
One Euro filtering
Studio lighting
Body boundary
Response preset
Visual Environment

The Three.js environment is implemented as a robotics laboratory scene.

The environment includes:

Light background
Robotics platform
Studio lighting
Mechanical/industrial visual styling
Camera presets
Robot presentation area

Available camera presets include:

Front
3/4
Side
Top
Close
Technology Stack
Frontend
React
TypeScript
HTML
CSS
Vite
3D Graphics
Three.js
Computer Vision
MediaPipe Tasks Vision
Pose Landmarker
Hand Landmarker
UI
Lucide React
Motion
Tailwind CSS / Tailwind Vite integration
AI Integration
@google/genai

The core motion-tracking pipeline remains browser-based and does not require a paid cloud vision API.

Project Structure
robotics-motion-retargeting--main/
│
├── index.html
├── package.json
├── vite.config.ts
├── tsconfig.json
├── metadata.json
│
├── public/
│   └── assets/
│
└── src/
    │
    ├── App.tsx
    ├── main.tsx
    ├── types.ts
    ├── index.css
    │
    ├── components/
    │   ├── CalibrationModal.tsx
    │   ├── CameraView.tsx
    │   ├── DebugDrawer.tsx
    │   ├── GestureGuide.tsx
    │   ├── Header.tsx
    │   ├── PickPlacePanel.tsx
    │   ├── RobotViewport.tsx
    │   └── SettingsModal.tsx
    │
    ├── robot/
    │   ├── environment.ts
    │   ├── materials.ts
    │   ├── motionTrails.ts
    │   ├── pickAndPlace.ts
    │   ├── robotModel.ts
    │   └── saccadeEngine.ts
    │
    ├── vision/
    │   ├── demoPlayer.ts
    │   ├── motionRetargeter.ts
    │   ├── oneEuroFilter.ts
    │   └── visionManager.ts
    │
    └── audio/
        └── servoAudio.ts
Important Source Modules
src/vision/visionManager.ts

Responsible for:

MediaPipe initialization
Pose Landmarker
Hand Landmarker
Webcam processing
Left/right hand state
Vision FPS
Latency
One Euro filtering
Response presets
src/vision/motionRetargeter.ts

Responsible for:

Hand landmark analysis
Finger kinematics
Wrist orientation
Gesture classification
Arm IK input
Robot joint-angle generation
Body-boundary handling
src/robot/robotModel.ts

Responsible for:

Humanoid robot construction
Articulated arms
Articulated hands
Finger joints
Head
Eyes
Mouth
Robot rig structure
Robot joint application
src/robot/pickAndPlace.ts

Responsible for:

Pick-and-place station
Virtual objects
Object holding
Placement state
src/robot/environment.ts

Responsible for:

Three.js environment
Robotics laboratory scene
Lighting
Camera presets
src/vision/oneEuroFilter.ts

Provides One Euro filtering for 1D and 3D landmark data.

Installation
Requirements

Recommended:

Modern Windows/macOS/Linux laptop
Modern Chromium-based browser
Built-in or USB webcam
WebGL-capable GPU
Node.js
npm or Bun
Install Dependencies
npm install

or:

bun install
Start Development Server
npm run dev

The Vite development server is configured for port 3000.

Production Build

Run:

npm run build

TypeScript validation:

npm run lint

Preview:

npm run preview
Webcam Permissions

The browser must be allowed to access the camera.

When prompted:

Allow camera access.
Keep the upper body visible.
Keep both hands inside the camera frame.
Use reasonable lighting.
Avoid severe backlighting.

The application does not require a physical robot.

Recommended Camera Position

For best upper-body tracking:

        Camera
          │
          ▼

      ┌─────────┐
      │  HEAD   │
      │         │
      │ SHOULDERS
      │    +    │
      │  HANDS  │
      └─────────┘

Keep:

Head visible
Both shoulders visible
Both hands visible
Fingers separated when testing individual fingers
Live Testing Checklist
Left Hand
 Raise left hand
 Lower left hand
 Move left wrist
 Rotate left palm
 Open left hand
 Close left hand
 Move left thumb
 Move left index
 Move left middle finger
 Move left ring finger
 Move left pinky
Right Hand
 Raise right hand
 Lower right hand
 Move right wrist
 Rotate right palm
 Open right hand
 Close right hand
 Move right thumb
 Move right index
 Move right middle finger
 Move right ring finger
 Move right pinky
Both Hands
 Raise both hands
 Move both wrists
 Open/close both hands
 Perform gestures independently
 Verify left/right mapping
Head
 Turn left
 Turn right
 Nod
 Tilt head
Pick and Place
 Reach object
 Grip object
 Hold object
 Move object
 Release object
 Place object in target
Performance Targets

The intended experience is:

Fast response
      +
Low jitter
      +
Stable tracking
      +
Smooth robot animation

Recommended production target:

Metric	Target
Render FPS	60+
Capable display target	90–120 FPS
Vision FPS	20–30+
Motion	Smooth / interpolated
Latency	As low as hardware/browser allows

FPS values shown by the application should be measured at runtime.

Privacy

The core computer-vision pipeline is designed to process webcam frames locally in the browser using MediaPipe.

Camera permission is required because the project uses the webcam for live tracking.

Audio

The final application requirement is NO AUDIO.

Remove or disable:

Background music
Robot sounds
Sound effects
Voice
Speech
Microphone input
Audio notifications

The webcam should be requested with:

audio: false

If the existing project contains:

src/audio/servoAudio.ts

remove it or ensure it is completely unused.

Also remove unnecessary:

soundEnabled
soundVolume

settings.

Data / CSV Analysis

If CSV files exist in the project, analyze the actual files.

Do not fabricate dataset information.

Recommended analysis:

File count
Row count
Column names
Data types
Missing values
Duplicate rows
Label distribution
Class balance
Outliers
Coordinate ranges
Sequence lengths
Subject/session information

If no CSV dataset is present, clearly document that no CSV dataset is available.

Relation to 3D-Jointsformer

The project can incorporate research concepts from the 3D-Jointsformer hand-gesture-recognition work.

However, the system should not incorrectly describe 3D-Jointsformer as the complete full-body pose tracker.

The live browser pipeline uses MediaPipe Pose and Hand Landmarker for real-time landmark acquisition, while a separate motion-retargeting layer converts the landmarks into robot movement.

Development Priorities

The most important improvements are:

Correct camera-to-landmark response
Reliable left/right hand mapping
Complete 21-landmark hand processing
Independent five-finger articulation
Accurate wrist/palm orientation
Smooth arm and wrist retargeting
Low-latency vision/render separation
Stable 60+ FPS rendering
Correct pick-and-place interaction
No fake performance/status values
No runtime/build/console errors
Professional light robotics UI
No Fake Functionality Policy

MotionMirror AI must not claim that a feature works unless it is actually implemented.

In particular:

Do not fake hand tracking.
Do not fake finger tracking.
Do not fake FPS.
Do not fake latency.
Do not use scripted movement in Live Mode.
Do not label a hand as detected when it is not detected.
Do not replace individual finger tracking with only gesture labels.

Demo Mode may use scripted motion, but it must be clearly separated from Live Mode.

License

Third-party libraries remain subject to their respective licenses.

Before distributing modified robot models, assets, fonts, icons, or external models, verify their individual licenses.

Project Goal

The final goal of MotionMirror AI is:

Human webcam motion → computer vision → motion retargeting → articulated humanoid robot

The system is intended for:

Education
Robotics visualization
Computer-vision experimentation
Human-machine interaction demonstrations
3D motion-retargeting research
Status

Project: MotionMirror AI
Application type: Browser-based robotics / computer vision
Input: Laptop webcam
Robot: Articulated half-body humanoid
3D engine: Three.js
Frontend: React + TypeScript
Vision: MediaPipe Tasks Vision
Build tool: Vite
Physical hardware required: No
Audio: Disabled / removed
