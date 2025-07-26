import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.lovable.05f113fa5be348a3adac42f2964649ea',
  appName: 'chuckle-capture-bot',
  webDir: 'dist',
  server: {
    url: 'https://05f113fa-5be3-48a3-adac-42f2964649ea.lovableproject.com?forceHideBadge=true',
    cleartext: true
  },
  plugins: {
    Camera: {
      permissions: ['camera']
    }
  }
};

export default config;