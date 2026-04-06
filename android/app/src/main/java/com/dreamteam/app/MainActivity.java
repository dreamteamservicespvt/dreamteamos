package com.dreamteam.app;

import android.os.Build;
import android.os.Bundle;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.media.AudioAttributes;
import android.provider.Settings;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Register this plugin manually
        registerPlugin(AudioRoutePlugin.class);

        // Create notification channels (required for Android 8+)
        createNotificationChannels();
    }

    private void createNotificationChannels() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager == null) return;

            AudioAttributes soundAttrs = new AudioAttributes.Builder()
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .setUsage(AudioAttributes.USAGE_NOTIFICATION)
                .build();

            // Default channel — general notifications
            NotificationChannel defaultChannel = new NotificationChannel(
                "default",
                "General Notifications",
                NotificationManager.IMPORTANCE_HIGH
            );
            defaultChannel.setDescription("General app notifications");
            defaultChannel.enableVibration(true);
            defaultChannel.enableLights(true);
            defaultChannel.setShowBadge(true);
            manager.createNotificationChannel(defaultChannel);

            // Messages channel — chat messages (heads-up)
            NotificationChannel messagesChannel = new NotificationChannel(
                "messages",
                "Chat Messages",
                NotificationManager.IMPORTANCE_HIGH
            );
            messagesChannel.setDescription("Chat message notifications");
            messagesChannel.enableVibration(true);
            messagesChannel.enableLights(true);
            messagesChannel.setShowBadge(true);
            messagesChannel.setSound(Settings.System.DEFAULT_NOTIFICATION_URI, soundAttrs);
            manager.createNotificationChannel(messagesChannel);

            // Calls channel — incoming calls (full-screen intent)
            NotificationChannel callsChannel = new NotificationChannel(
                "calls",
                "Incoming Calls",
                NotificationManager.IMPORTANCE_HIGH
            );
            callsChannel.setDescription("Incoming voice and video call notifications");
            callsChannel.enableVibration(true);
            callsChannel.enableLights(true);
            callsChannel.setShowBadge(true);
            callsChannel.setSound(Settings.System.DEFAULT_RINGTONE_URI, soundAttrs);
            manager.createNotificationChannel(callsChannel);
        }
    }
}
