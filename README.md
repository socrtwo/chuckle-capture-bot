# Joke & Smile Camera

An AI-powered comedy photo booth that tells jokes using text-to-speech, detects smiles in real-time with face detection AI, and automatically captures photos when people laugh.

## Features

- **AI Smile Detection** - Real-time face expression analysis using TinyFaceDetector
- **Text-to-Speech Jokes** - 280+ built-in jokes with configurable voice types
- **Automatic Photo Capture** - Takes photos the moment it detects a smile or laugh
- **4 Operation Modes:**
  - **Fully Auto** - Runs through multiple jokes automatically with pauses between them
  - **Single Joke** - Tells one joke and auto-detects smiles for photos
  - **Semi-Auto** - You tell the joke, AI handles smile detection and capture
  - **Manual** - Full control over joke display and photo capture
- **Joke Management** - Import/export jokes as JSON, download templates
- **Configurable** - Voice type, photo limits, timing, joke count
- **PWA** - Installable from the browser on any device
- **Cross-Platform** - Builds for Windows, macOS, Linux, Raspberry Pi, Android, and iOS

## Tech Stack

- **Frontend:** React 18 + TypeScript
- **Build:** Vite 5
- **Styling:** Tailwind CSS + shadcn/ui (Radix primitives)
- **AI/ML:** @vladmandic/face-api (face detection & expression recognition)
- **Desktop:** Electron + electron-builder
- **Mobile:** Capacitor (Android & iOS)
- **Speech:** Web Speech API

## Quick Start

```bash
# Install dependencies
npm install

# Start development server (http://localhost:8080)
npm run dev

# Production build
npm run build

# Preview production build
npm run preview
```

## Building Platform Releases

### Windows

**Prerequisites:** Node.js 18+. Building on non-Windows requires Wine.

```bash
npm run electron:win
```

Outputs to `release/`:
- `.exe` installer (NSIS - with install wizard)
- Portable `.exe` (no install needed)

### macOS

**Prerequisites:** Must build on macOS. Code signing requires an Apple Developer account.

```bash
npm run electron:mac
```

Outputs to `release/`:
- `.dmg` installer (x64 + Apple Silicon)
- `.zip` archive

### Linux (x64)

```bash
npm run electron:linux
```

Outputs to `release/`:
- `.AppImage` (universal, run anywhere)
- `.deb` (Debian/Ubuntu: `sudo dpkg -i smile-camera.deb`)
- `.rpm` (Fedora/RHEL: `sudo rpm -i smile-camera.rpm`)

### Raspberry Pi OS (ARM)

**Prerequisites:** Cross-compiling ARM from x64 needs extra toolchains. Best to build directly on a Pi or use CI with ARM runners.

```bash
npm run electron:linux-arm
```

Outputs to `release/`:
- `.AppImage` for arm64 and armv7l
- `.deb` for arm64 and armv7l

### Android

**Prerequisites:** Android Studio, Android SDK (API 33+), Java 17+

```bash
# First time only - add Android platform
npm run cap:init:android

# Build web assets and sync to Android project
npm run cap:android

# Open in Android Studio to build APK/AAB
npm run cap:android:open

# Or run directly on a connected device/emulator
npm run cap:android:run
```

To create a release APK, in Android Studio: Build > Generate Signed Bundle/APK.

### iOS (iPhone / iPad)

**Prerequisites:** macOS, Xcode 15+, Apple Developer account, CocoaPods

```bash
# First time only - add iOS platform
npm run cap:init:ios
cd ios/App && pod install && cd ../..

# Build web assets and sync to iOS project
npm run cap:ios

# Open in Xcode to build and deploy
npm run cap:ios:open

# Or run directly on a connected device/simulator
npm run cap:ios:run
```

To create a release: In Xcode, select your team under Signing & Capabilities, then Product > Archive.

### All Desktop Platforms at Once

```bash
npm run electron:all
```

### Electron Development Mode

```bash
# Terminal 1: start Vite dev server
npm run dev

# Terminal 2: launch Electron pointing at dev server
npm run electron:dev
```

## PWA (Progressive Web App)

The app is also a PWA that can be installed directly from the browser without building native apps:

1. Deploy the `dist/` folder to any HTTPS hosting
2. Open in browser
3. Install:
   - **Chrome/Edge (desktop):** Click install icon in address bar
   - **Chrome (Android):** Menu > "Add to Home Screen"
   - **Safari (iOS):** Share > "Add to Home Screen"

The PWA works offline after first load.

## All Build Commands

| Command | Description |
|---|---|
| `npm run dev` | Start dev server |
| `npm run build` | Build web app to `dist/` |
| `npm run preview` | Preview built app |
| `npm run electron:dev` | Run Electron in dev mode |
| `npm run electron:win` | Build Windows installer |
| `npm run electron:mac` | Build macOS DMG |
| `npm run electron:linux` | Build Linux packages |
| `npm run electron:linux-arm` | Build Raspberry Pi packages |
| `npm run electron:all` | Build all desktop platforms |
| `npm run cap:android` | Build & sync Android |
| `npm run cap:android:open` | Open Android Studio |
| `npm run cap:ios` | Build & sync iOS |
| `npm run cap:ios:open` | Open Xcode |
| `npm run generate:icons` | Generate app icons |

## Platform Summary

| Platform | Technology | Build Command | Output |
|---|---|---|---|
| **Windows** | Electron | `npm run electron:win` | `.exe` installer + portable |
| **macOS** | Electron | `npm run electron:mac` | `.dmg` + `.zip` |
| **Linux** | Electron | `npm run electron:linux` | `.AppImage` + `.deb` + `.rpm` |
| **Raspberry Pi** | Electron | `npm run electron:linux-arm` | `.AppImage` + `.deb` (ARM) |
| **Android** | Capacitor | `npm run cap:android` | `.apk` / `.aab` via Android Studio |
| **iOS** | Capacitor | `npm run cap:ios` | `.ipa` via Xcode |
| **All (web)** | PWA | `npm run build` | Installable from any browser |

## Project Structure

```
src/
  components/
    JokeApp.tsx          # Main app (camera, jokes, modes, photos)
    ui/                  # shadcn/ui components
  data/
    jokes.ts             # 280+ jokes database
  pages/
    Index.tsx            # Home page
    NotFound.tsx         # 404 page
  App.tsx                # Router + providers
  main.tsx               # Entry point + PWA registration
  index.css              # Design system (CSS variables, glass morphism)
electron/
  main.cjs               # Electron main process
  preload.cjs            # Electron preload script
public/
  manifest.json          # PWA manifest
  sw.js                  # Service worker
  icons/                 # App icons (all sizes)
  models/                # Face detection ML models
scripts/
  generate-icons.js      # Icon generation utility
```

## License

Private project.
