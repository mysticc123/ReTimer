# ReTimer - Premium Fullscreen Focus Timer

## Android Development Toolchain

Android builds use Gradle 8.13 with AGP 8.12.0 and must run on OpenJDK 17.0.20.1. The machine's default Android Studio JBR 25 causes Gradle 8.13 configuration to fail with an unsupported class-file version, so select JDK 17 before running the Android build.

### Development Client Workflow

ReTimer uses native modules, including `react-native-mmkv` v4 and its
`react-native-nitro-modules` dependency. The installed Android development
client must therefore be built from the current native dependency graph; Expo
Go is not a supported substitute.

For JS/TS-only changes, start Metro against the already-installed development
client:

```powershell
npx expo start --dev-client
```

Do not use plain `npx expo start` for this project when testing Android: it can
open the wrong client and leave the JavaScript bundle paired with an unrelated
native runtime.

For native dependency, New Architecture, Gradle, or Android configuration
changes, rebuild the development client first, then start Metro:

```powershell
$env:JAVA_HOME = 'C:\Program Files\Eclipse Adoptium\jdk-17.0.20.101-hotspot'
$env:Path = "$env:JAVA_HOME\bin;$env:Path"
Set-Location android
.\gradlew.bat :app:assembleDebug
& "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" install -r .\app\build\outputs\apk\debug\app-debug.apk
Set-Location ..
npx expo start --dev-client
```

The native build must have New Architecture enabled and must autolink
`react-native-mmkv`, `react-native-nitro-modules`, and `react-native-worklets`.
If NitroModules errors appear after a native change, verify the generated
`android/app/build/generated/autolinking` files and reinstall the freshly built
APK; clearing Metro caches alone cannot add missing native code to an APK.

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
