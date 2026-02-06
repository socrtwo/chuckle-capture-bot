# Building Joke & Smile Camera for All Platforms

This guide covers building the app for **Windows**, **macOS**, **Linux**, **Raspberry Pi OS**, **Android**, and **iOS**.

## Prerequisites

- Node.js 18+ and npm
- Git

## Quick Start (Web)

```bash
npm install
npm run dev       # Development server at http://localhost:8080
npm run build     # Production build to dist/
npm run preview   # Preview production build
```

---

## Desktop Builds (Windows, macOS, Linux, Raspberry Pi)

Desktop builds use **Electron** + **electron-builder**.

### Install Dependencies

```bash
npm install
```

### Windows

```bash
npm run electron:win
```

Output: `release/` directory containing:
- `.exe` installer (NSIS)
- Portable `.exe`

> **Note:** Building Windows apps on non-Windows requires Wine. For best results, build on Windows or use CI.

### macOS

```bash
npm run electron:mac
```

Output: `release/` directory containing:
- `.dmg` installer (x64 + Apple Silicon)
- `.zip` archive

> **Note:** macOS builds can only be created on macOS. Code signing requires an Apple Developer account.

### Linux (x64)

```bash
npm run electron:linux
```

Output: `release/` directory containing:
- `.AppImage` (universal, no install needed)
- `.deb` (Debian/Ubuntu)
- `.rpm` (Fedora/RHEL)

### Raspberry Pi OS (ARM)

```bash
npm run electron:linux-arm
```

Output: `release/` directory containing:
- `.AppImage` for arm64 and armv7l
- `.deb` for arm64 and armv7l

> **Note:** Cross-compiling ARM from x64 requires additional toolchains. For best results, build directly on a Raspberry Pi or use CI with ARM runners.

### All Desktop Platforms at Once

```bash
npm run electron:all
```

### Development Mode (Electron)

```bash
# In terminal 1: start the dev server
npm run dev

# In terminal 2: start Electron pointing at dev server
npm run electron:dev
```

---

## Mobile Builds (Android & iOS)

Mobile builds use **Capacitor**.

### Android

#### Prerequisites
- Android Studio installed
- Android SDK (API level 33+)
- Java 17+

#### First-Time Setup

```bash
npm run cap:init:android    # Adds Android platform
```

#### Build & Deploy

```bash
npm run cap:android         # Build web + sync to Android
npm run cap:android:open    # Open in Android Studio
npm run cap:android:run     # Build and run on connected device/emulator
```

In Android Studio:
1. Open the `android/` directory
2. Build > Generate Signed Bundle/APK for release
3. Or use `./gradlew assembleRelease` from the `android/` directory

### iOS (iPhone / iPad)

#### Prerequisites
- macOS with Xcode 15+ installed
- Apple Developer account (for device testing & distribution)
- CocoaPods (`sudo gem install cocoapods`)

#### First-Time Setup

```bash
npm run cap:init:ios        # Adds iOS platform
cd ios/App && pod install   # Install CocoaPods dependencies
```

#### Build & Deploy

```bash
npm run cap:ios             # Build web + sync to iOS
npm run cap:ios:open        # Open in Xcode
npm run cap:ios:run         # Build and run on connected device/simulator
```

In Xcode:
1. Select your development team under Signing & Capabilities
2. Choose a target device
3. Product > Archive for App Store distribution

---

## PWA (Progressive Web App) - All Platforms

The app is also a **PWA** and can be installed directly from the browser on any platform without building native apps.

### How to Install

1. Deploy the web build (`npm run build`) to any HTTPS hosting
2. Visit the URL in a browser
3. Install prompt appears automatically, or:
   - **Chrome (desktop):** Click the install icon in the address bar
   - **Chrome (Android):** Tap "Add to Home Screen" from the menu
   - **Safari (iOS):** Tap Share > "Add to Home Screen"
   - **Edge (Windows):** Click "App available" in the address bar
   - **Firefox (Linux):** No install prompt, but works as a web app

The PWA works offline after first load and receives automatic updates.

---

## Icons

Generate app icons from the SVG source:

```bash
npm run generate:icons
```

For production-quality PNG icons, first install sharp:

```bash
npm install sharp --save-dev
npm run generate:icons
```

---

## Platform Summary

| Platform | Technology | Build Command | Output |
|---|---|---|---|
| **Windows** | Electron | `npm run electron:win` | `.exe` installer + portable |
| **macOS** | Electron | `npm run electron:mac` | `.dmg` + `.zip` |
| **Linux** | Electron | `npm run electron:linux` | `.AppImage` + `.deb` + `.rpm` |
| **Raspberry Pi** | Electron | `npm run electron:linux-arm` | `.AppImage` + `.deb` (ARM) |
| **Android** | Capacitor | `npm run cap:android` | `.apk` / `.aab` via Android Studio |
| **iOS** | Capacitor | `npm run cap:ios` | `.ipa` via Xcode |
| **All (web)** | PWA | `npm run build` | Installable from browser |

---

## CI/CD Recommendations

For automated builds across all platforms, use **GitHub Actions** with:
- `ubuntu-latest` for Linux + AppImage
- `windows-latest` for Windows
- `macos-latest` for macOS + iOS
- Self-hosted ARM runner for Raspberry Pi

See [electron-builder CI docs](https://www.electron.build/multi-platform-build) for workflow examples.
