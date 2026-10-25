import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.smilecamera.app',
  appName: 'Joke & Smile Camera',
  webDir: 'dist',
  plugins: {
    Camera: {
      permissions: ['camera']
    },
    SplashScreen: {
      launchAutoHide: true,
      androidScaleType: 'CENTER_CROP',
    }
  },
  android: {
    allowMixedContent: true,
  },
  ios: {
    contentInset: 'automatic',
  }
};

export default config;
