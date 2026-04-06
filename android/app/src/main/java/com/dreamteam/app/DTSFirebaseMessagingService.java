package com.dreamteam.app;

import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.os.Build;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;

import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Map;

/**
 * Handles data-only FCM messages in the background (app killed / not in recents).
 * When the app is in the foreground, Capacitor's PushNotifications plugin handles it instead.
 */
public class DTSFirebaseMessagingService extends FirebaseMessagingService {

    private static final String TAG = "DTSFCMService";

    @Override
    public void onMessageReceived(@NonNull RemoteMessage remoteMessage) {
        super.onMessageReceived(remoteMessage);

        Map<String, String> data = remoteMessage.getData();
        if (data.isEmpty()) return;

        String title = data.containsKey("title") ? data.get("title") : "Dream Team";
        String body = data.containsKey("body") ? data.get("body") : "";
        String type = data.containsKey("type") ? data.get("type") : "general";
        String channelId = data.containsKey("channelId") ? data.get("channelId") : "default";
        String link = data.containsKey("link") ? data.get("link") : "/";

        // Launch the app when the notification is tapped
        Intent intent = new Intent(this, MainActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        intent.putExtra("link", link);
        intent.putExtra("type", type);

        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            flags |= PendingIntent.FLAG_IMMUTABLE;
        }
        PendingIntent pendingIntent = PendingIntent.getActivity(this, (int) System.currentTimeMillis(), intent, flags);

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, channelId)
                .setSmallIcon(R.drawable.ic_notification)
                .setContentTitle(title)
                .setContentText(body)
                .setAutoCancel(true)
                .setContentIntent(pendingIntent)
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setDefaults(NotificationCompat.DEFAULT_ALL);

        // Try to load a large icon from the network (app logo)
        String iconUrl = data.get("icon");
        if (iconUrl != null && !iconUrl.isEmpty()) {
            try {
                Bitmap largeIcon = getBitmapFromUrl(iconUrl);
                if (largeIcon != null) {
                    builder.setLargeIcon(largeIcon);
                }
            } catch (Exception e) {
                Log.w(TAG, "Failed to load large icon", e);
            }
        }

        // For calls: make it a full-screen intent (shows on lock screen)
        if ("voice_call".equals(type) || "video_call".equals(type)) {
            builder.setFullScreenIntent(pendingIntent, true);
            builder.setCategory(NotificationCompat.CATEGORY_CALL);
            builder.setOngoing(true);
        }

        NotificationManager nm = getSystemService(NotificationManager.class);
        if (nm != null) {
            nm.notify((int) System.currentTimeMillis(), builder.build());
        }
    }

    @Override
    public void onNewToken(@NonNull String token) {
        super.onNewToken(token);
        // Token refresh is handled by the web layer (Capacitor PushNotifications plugin)
        Log.d(TAG, "FCM token refreshed: " + token);
    }

    private Bitmap getBitmapFromUrl(String urlStr) {
        try {
            URL url = new URL(urlStr);
            HttpURLConnection conn = (HttpURLConnection) url.openConnection();
            conn.setDoInput(true);
            conn.setConnectTimeout(5000);
            conn.setReadTimeout(5000);
            conn.connect();
            InputStream input = conn.getInputStream();
            return BitmapFactory.decodeStream(input);
        } catch (Exception e) {
            return null;
        }
    }
}
