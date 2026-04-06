package com.dreamteam.app;

import android.os.Build;
import android.os.Bundle;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.media.AudioAttributes;
import android.provider.Settings;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.app.Notification;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager nm = getSystemService(NotificationManager.class);
            nm.createNotificationChannel(new NotificationChannel("default", "General", NotificationManager.IMPORTANCE_HIGH));
            nm.createNotificationChannel(new NotificationChannel("messages", "Messages", NotificationManager.IMPORTANCE_HIGH));
            NotificationChannel calls = new NotificationChannel("calls", "Calls", NotificationManager.IMPORTANCE_MAX);
            calls.setLockscreenVisibility(android.app.Notification.VISIBILITY_PUBLIC);
            calls.enableVibration(true);
            calls.setSound(Settings.System.DEFAULT_RINGTONE_URI,
                    new AudioAttributes.Builder()
                            .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                            .build());
            nm.createNotificationChannel(calls);
        }

        // Register plugins manually
        registerPlugin(AudioRoutePlugin.class);
        registerPlugin(CallActionPlugin.class);
    }
}
