import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.matziq.aztechero',
  appName: 'Aztec Hero',
  webDir: 'dist',
  backgroundColor: '#070a10',
  server: {
    androidScheme: 'https'
  }
};

export default config;
