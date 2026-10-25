#!/usr/bin/env node
/**
 * Apply the native permission declarations the web app needs to the
 * generated Capacitor projects (android/ and ios/ are git-ignored and
 * recreated by `npx cap add ...`, so this must be re-run after every
 * regeneration).
 *
 *   node scripts/cap-native-permissions.js [android|ios]
 *
 * With no argument both platforms are patched when their project exists.
 * The script is idempotent: declarations that are already present are
 * left untouched.
 *
 * JokeApp requests the camera through getUserMedia({ video, audio: false }).
 *   - Android: Capacitor's WebChromeClient only forwards a WebView media
 *     request as a runtime permission prompt when android.permission.CAMERA
 *     is declared in AndroidManifest.xml.
 *   - iOS: WKWebView refuses getUserMedia unless Info.plist carries
 *     NSCameraUsageDescription.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = (process.argv[2] || 'all').toLowerCase();

const ANDROID_MANIFEST = path.join(root, 'android', 'app', 'src', 'main', 'AndroidManifest.xml');
const IOS_INFO_PLIST = path.join(root, 'ios', 'App', 'App', 'Info.plist');

const CAMERA_USAGE_DESCRIPTION = 'This app needs camera access to capture smile photos';

function patchAndroid() {
  if (!fs.existsSync(ANDROID_MANIFEST)) {
    console.log(`[cap-native-permissions] android: ${path.relative(root, ANDROID_MANIFEST)} not found, skipping`);
    return false;
  }
  let xml = fs.readFileSync(ANDROID_MANIFEST, 'utf8');
  const original = xml;

  const declarations = [
    '<uses-permission android:name="android.permission.CAMERA" />',
    '<uses-feature android:name="android.hardware.camera" android:required="false" />',
  ];
  const missing = declarations.filter((decl) => {
    const name = decl.match(/android:name="([^"]+)"/)[1];
    return !new RegExp(`android:name="${name.replace(/\./g, '\\.')}"`).test(xml);
  });

  if (missing.length > 0) {
    // Capacitor's template lists its <uses-permission> entries just before
    // </manifest>; append ours after them.
    const block = missing.map((d) => `    ${d}`).join('\n') + '\n';
    if (!/<\/manifest>/.test(xml)) {
      throw new Error(`[cap-native-permissions] android: could not find </manifest> in ${ANDROID_MANIFEST}`);
    }
    xml = xml.replace(/<\/manifest>/, `${block}</manifest>`);
  }

  if (xml !== original) {
    fs.writeFileSync(ANDROID_MANIFEST, xml);
    console.log(`[cap-native-permissions] android: added ${missing.length} declaration(s) to AndroidManifest.xml`);
  } else {
    console.log('[cap-native-permissions] android: AndroidManifest.xml already declares camera permission');
  }
  return true;
}

function patchIos() {
  if (!fs.existsSync(IOS_INFO_PLIST)) {
    console.log(`[cap-native-permissions] ios: ${path.relative(root, IOS_INFO_PLIST)} not found, skipping`);
    return false;
  }
  let plist = fs.readFileSync(IOS_INFO_PLIST, 'utf8');
  const original = plist;

  if (!/<key>NSCameraUsageDescription<\/key>/.test(plist)) {
    const entry =
      '\t<key>NSCameraUsageDescription</key>\n' +
      `\t<string>${CAMERA_USAGE_DESCRIPTION}</string>\n`;
    // Insert before the closing tag of the top-level <dict>.
    const idx = plist.lastIndexOf('</dict>');
    if (idx === -1) {
      throw new Error(`[cap-native-permissions] ios: could not find </dict> in ${IOS_INFO_PLIST}`);
    }
    plist = plist.slice(0, idx) + entry + plist.slice(idx);
  }

  if (plist !== original) {
    fs.writeFileSync(IOS_INFO_PLIST, plist);
    console.log('[cap-native-permissions] ios: added NSCameraUsageDescription to Info.plist');
  } else {
    console.log('[cap-native-permissions] ios: Info.plist already declares NSCameraUsageDescription');
  }
  return true;
}

let patched = false;
if (target === 'android' || target === 'all') patched = patchAndroid() || patched;
if (target === 'ios' || target === 'all') patched = patchIos() || patched;

if (target !== 'android' && target !== 'ios' && target !== 'all') {
  console.error(`[cap-native-permissions] unknown platform "${target}" (expected android, ios or nothing)`);
  process.exit(2);
}
if (!patched && target !== 'all') {
  console.error(`[cap-native-permissions] ${target} project not found; run "npx cap add ${target}" first`);
  process.exit(1);
}
