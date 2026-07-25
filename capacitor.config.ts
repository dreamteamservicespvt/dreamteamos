import type { CapacitorConfig } from '@capacitor/cli';
// A value import, not a type-only one: `resize` is typed as the KeyboardResize enum, and a bare
// string is not assignable to a string enum however identical the text.
import { KeyboardResize } from '@capacitor/keyboard';

const config: CapacitorConfig = {
  appId: 'com.dreamteam.app',
  appName: 'Dream Team',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
    SplashScreen: {
      launchShowDuration: 2000,
      launchAutoHide: true,
      backgroundColor: '#000000',
      showSpinner: false,
    },
    Keyboard: {
      // Neither the app nor the web view is resized when the keyboard opens — the layout handles
      // it itself, so letting Capacitor also resize would fight it.
      resize: KeyboardResize.None,
      resizeOnFullScreen: false,
    },
  },
  android: {
    allowMixedContent: true,
  },
  ios: {
    contentInset: 'always',
  },
};

export default config;
