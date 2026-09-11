# ReTimer - Premium Fullscreen Focus Timer

## Architecture Overview

### Project Structure
```
src/
├── components/          # Reusable UI components
├── screens/            # Screen components
├── navigation/         # Navigation configuration
├── store/              # State management (Zustand)
├── hooks/              # Custom React hooks
├── services/           # Business logic services
│   ├── timer/          # Timer engine
│   ├── audio/          # Audio playback
│   ├── notifications/  # Local notifications
│   ├── haptics/        # Haptic feedback
│   └── storage/        # Persistent storage
├── theme/              # Theme system
├── constants/          # App constants
├── utils/              # Utility functions
├── types/              # TypeScript types
└── assets/             # Static assets
```

### Key Architectural Decisions

1. **Timer Engine**: Timestamp-based calculation to prevent drift
   - Store `targetTimestamp` instead of incrementing counters
   - Calculate remaining time as `targetTimestamp - Date.now()`
   - Use `requestAnimationFrame` for smooth UI updates
   - Persist state to recover from app restarts

2. **State Management**: Zustand
   - Lightweight, no provider wrapping needed
   - Persistent middleware for settings
   - Separated timer state from UI state

3. **Navigation**: React Navigation Native Stack
   - Simple stack navigation
   - Timer state persists across navigation
   - Deep linking ready

4. **Storage**: react-native-mmkv
   - Synchronous, fast key-value storage
   - Better than AsyncStorage for frequent reads
   - Used for settings and timer state persistence

5. **Platform Differences**:
   - **iOS**: Limited background execution, rely on local notifications
   - **Android**: Can use foreground service for long timers
   - Both: expo-keep-awake for screen wake lock

### Dependencies Rationale

| Package | Purpose |
|---------|---------|
| @react-navigation/native | Core navigation |
| @react-navigation/native-stack | Stack navigator |
| react-native-screens | Native navigation primitives |
| zustand | State management |
| react-native-mmkv | Fast persistent storage |
| expo-keep-awake | Prevent screen sleep |
| expo-haptics | Haptic feedback |
| expo-av | Audio playback |
| expo-notifications | Local notifications |
| react-native-reanimated | Performant animations |
| react-native-safe-area-context | Safe area handling |
| @expo-google-fonts/* | Typography options |

### Timer State Model

```typescript
interface TimerState {
  // Configuration
  mode: 'pomodoro' | 'countdown' | 'countup' | 'interval'
  durationMs: number
  intervalConfig?: { workMs: number; restMs: number; rounds: number }
  
  // Runtime state
  status: 'idle' | 'running' | 'paused' | 'completed'
  targetTimestamp: number | null  // When timer should end
  pausedAt: number | null         // Timestamp when paused
  elapsedTimeMs: number           // Total elapsed time
  currentRound: number            // For interval timers
  
  // Settings (persisted separately)
  soundEnabled: boolean
  hapticsEnabled: boolean
  keepScreenAwake: boolean
}
```

### Navigation Flow

```
LandingScreen
    ├→ TimerConfigScreen (optional pre-start config)
    └→ ActiveTimerScreen (fullscreen)
        
LandingScreen → SettingsScreen
```

### Design System

**Colors**:
- Background: #000000 (true black for OLED)
- Primary Text: #FFFFFF
- Secondary Text: #8A8A8A
- Accent: Configurable (default: Neon Cyan #00F5D4)

**Themes**:
- Dark (default): True black background
- Light: White background
- OLED Black: Pure black with high contrast

**Typography**:
- Inter (default): Clean sans-serif
- JetBrains Mono: Monospace for stable digits
- Roboto Mono: Alternative monospace
- All support tabular figures
