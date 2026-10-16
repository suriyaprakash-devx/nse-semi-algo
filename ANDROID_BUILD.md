# Android Build & Deployment Guide

This guide details how to build, test, and install the **Upstox Semi-Algo Scanner** as an Android application using Capacitor and Android Studio / Gradle.

---

## 1. Architecture Overview

- **Frontend**: React 19 + Vite 8 (Vanilla CSS Glassmorphic design, Lucide icons).
- **Backend**: Python 3 + FastAPI (Upstox OAuth 2.0 & Token Exchange, SMA 6 & 30 Crossover Engine).
- **Native Android Container**: Capacitor 8 (`@capacitor/android`, `@capacitor/app`, `@capacitor/status-bar`).
- **Android Application ID**: `com.upstox.semialgo.scanner`
- **Application Display Name**: `Upstox Semi-Algo Scanner`

---

## 2. Prerequisites

1. **Node.js**: v18+ (verified with Node v24 LTS and npm 11).
2. **Java Development Kit (JDK)**: JDK 17 or JDK 21 (JDK 17 LTS recommended and configured).
3. **Android Studio**: Android Studio Hedgehog / Iguana / Ladybug / Meerkat or later with:
   - Android SDK Platform (API 34/35/36)
   - Android SDK Build-Tools
   - Android SDK Platform-Tools (`adb`)
4. **Physical Android Device**: Android 8.0 (API 24) or higher with Developer Options & USB Debugging enabled.

---

## 3. Backend & API Configuration

When running inside Capacitor on an Android device:
- The web app runs locally from `https://localhost` or `capacitor://localhost`.
- **CRITICAL**: On a physical mobile phone, `localhost` refers to the phone itself, NOT your development PC.
- You must point the app to your actual backend server.

### Option A: Production Cloud API (Default: Render HTTPS)
1. In `frontend/.env` and `frontend/.env.production` (pre-configured as default):
   ```bash
   VITE_API_BASE_URL=https://nse-semi-algo-1.onrender.com
   ```
2. Build the frontend:
   ```powershell
   npm run build
   node ./node_modules/@capacitor/cli/bin/capacitor sync android
   ```

### Option B: Local Development / LAN Testing (Wi-Fi)
1. Find your computer's local Wi-Fi IP address:
   ```powershell
   ipconfig
   # Look for "IPv4 Address", e.g. 192.168.1.15
   ```
2. Start the FastAPI backend bound to `0.0.0.0`:
   ```powershell
   uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload
   ```
3. Set your local IP in `frontend/.env`:
   ```bash
   VITE_API_BASE_URL=http://192.168.1.15:8000
   ```

### Option C: In-App Runtime Server Configuration (No Rebuild Required!)
The application includes a built-in **Server API** configuration modal:
1. Tap the **Server API** button in the top navigation header (or the **Configure Server** button on the offline banner).
2. Enter your backend URL (e.g. `https://nse-semi-algo-1.onrender.com` or `http://192.168.1.15:8000`).
3. Tap **Test Health** to verify connectivity with `/health`.
4. Tap **Save & Connect**. The setting is persisted in local device storage (`localStorage`).

---

## 4. Building the Android Project

All commands should be executed from the `frontend/` directory:

### Step 1: Install Dependencies
```powershell
cd frontend
npm install
```

### Step 2: Build the Production Web Assets
```powershell
npm run build
```
This generates the optimized bundle in `frontend/dist/`.

### Step 3: Synchronize with Capacitor
```powershell
npm run cap:sync
# Equivalent to: node ./node_modules/@capacitor/cli/bin/capacitor sync android
```
This copies `frontend/dist/` into `frontend/android/app/src/main/assets/public` and syncs all Android plugins.

### Step 4: Build the Debug APK via Gradle
```powershell
cd android
.\gradlew.bat assembleDebug
```

> **Note on Windows paths**: If your project path contains special characters like `&` (e.g. `sma 6&30`), always run Gradle commands from inside the `frontend/android` directory using `.\gradlew.bat` or open the project directly in Android Studio.

### Step 5: (Alternative) Open in Android Studio
```powershell
npm run cap:open
# Or open Android Studio and choose: "Open Project" -> select frontend/android
```
In Android Studio:
1. Wait for Gradle sync to complete.
2. Select **Build** > **Build Bundle(s) / APK(s)** > **Build APK(s)**.
3. Once completed, a popup will display: *"APK(s) generated successfully: locate"*.

---

## 5. APK Output Location

The generated debug APK is located at:
```
frontend/android/app/build/outputs/apk/debug/app-debug.apk
```

---

## 6. Installing on a Physical Android Phone

### Method 1: Via ADB (USB Debugging)

1. Enable Developer Options on your phone:
   - Go to **Settings** > **About Phone**.
   - Tap **Build Number** 7 times until you see *"You are now a developer!"*.
2. Enable USB Debugging:
   - Go to **Settings** > **System** > **Developer Options**.
   - Toggle **USB Debugging** on.
3. Connect your phone via USB cable and allow the debugging prompt on your phone screen.
4. Verify connection:
   ```powershell
   adb devices
   ```
5. Install the APK:
   ```powershell
   adb install -r "frontend/android/app/build/outputs/apk/debug/app-debug.apk"
   ```

### Method 2: Direct File Transfer (Sideloading)

1. Copy `app-debug.apk` to your phone via USB file transfer, Google Drive, WhatsApp, or email.
2. On your phone, open the **Files / Downloads** app and tap `app-debug.apk`.
3. If Android blocks the installation:
   - Tap **Settings** on the prompt.
   - Enable **Allow from this source** for your file manager / browser.
   - If Google Play Protect displays a warning (*"Unrecognized app / Play Protect"*), tap **More details** > **Install anyway**.

---

## 7. Rebuilding After Code Changes

Whenever you modify React components, styles, or logic:

```powershell
cd frontend
npm run build
npm run cap:sync
cd android
.\gradlew.bat assembleDebug
```
Then reinstall the APK with `adb install -r ...` or run directly from Android Studio.

---

## 8. Generating a Signed Release APK for Production

1. Generate a release keystore (run once):
   ```powershell
   keytool -genkey -v -keystore my-release-key.jks -keyalg RSA -keysize 2048 -validity 10000 -alias my-key-alias
   ```
2. In `frontend/android/app/build.gradle`, configure `signingConfigs`:
   ```groovy
   android {
       signingConfigs {
           release {
               storeFile file("my-release-key.jks")
               storePassword "your-password"
               keyAlias "my-key-alias"
               keyPassword "your-password"
           }
       }
       buildTypes {
           release {
               signingConfig signingConfigs.release
               minifyEnabled false
               proguardFiles getDefaultProguardFile('proguard-android.txt'), 'proguard-rules.pro'
           }
       }
   }
   ```
3. Run the release build:
   ```powershell
   cd frontend/android
   .\gradlew.bat assembleRelease
   ```
4. Output file:
   ```
   frontend/android/app/build/outputs/apk/release/app-release.apk
   ```

---

## 9. Troubleshooting & FAQ

| Issue | Cause | Solution |
| :--- | :--- | :--- |
| **Backend Unreachable in App** | Phone cannot connect to `localhost`. | Set `VITE_API_BASE_URL` to your computer's Wi-Fi IP (e.g. `http://192.168.1.15:8000`) or deployed Render HTTPS URL. You can also use the in-app **Server API** settings dialog. |
| **CORS Errors in Backend** | Request origin `https://localhost` not permitted. | Backend `backend/config.py` and `backend/main.py` are already updated to allow `https://localhost` and `capacitor://localhost`. |
| **Cleartext HTTP blocked on Android 9+** | Android disables cleartext HTTP by default. | `network_security_config.xml` is configured to allow cleartext communication for local development IP ranges and localhost. |
| **Android Back Button closes app instead of modal** | Default browser behavior. | `@capacitor/app` hardware back button listener closes open modals and sub-views (Algo Signals) before exiting. |
| **Cutout / Notch overlaps top header** | Missing safe area insets. | `viewport-fit=cover` and CSS `env(safe-area-inset-top)` are configured in `index.html` and `index.css`. |
| **Windows batch file error with ampersand in path** | Cmd.exe treats `&` as command separator. | Custom scripts in `package.json` invoke `@capacitor/cli` directly via Node. `gradlew.bat` variables are properly quoted. |
