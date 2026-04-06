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

        int notificationId = (int) System.currentTimeMillis();

        // For calls: launch the full-screen IncomingCallActivity (WhatsApp-style)
        boolean isCall = "voice_call".equals(type) || "video_call".equals(type);
        if (isCall) {
            Intent callIntent = new Intent(this, IncomingCallActivity.class);
            callIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            callIntent.putExtra("caller_name", title.replace("Incoming voice call from ", "").replace("Incoming video call from ", ""));
            callIntent.putExtra("call_type", "video_call".equals(type) ? "video" : "voice");
            callIntent.putExtra("call_doc_id", data.containsKey("callDocId") ? data.get("callDocId") : "");
            callIntent.putExtra("notification_id", notificationId);

            PendingIntent fullScreenIntent = PendingIntent.getActivity(
                    this, notificationId + 1, callIntent,
                    PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0));

            NotificationCompat.Builder builder = new NotificationCompat.Builder(this, channelId)
                    .setSmallIcon(R.drawable.ic_notification)
                    .setContentTitle(title)
                    .setContentText(body)
                    .setAutoCancel(false)
                    .setOngoing(true)
                    .setContentIntent(pendingIntent)
                    .setPriority(NotificationCompat.PRIORITY_MAX)
                    .setCategory(NotificationCompat.CATEGORY_CALL)
                    .setFullScreenIntent(fullScreenIntent, true)
                    .setDefaults(NotificationCompat.DEFAULT_ALL);

            // Try to load a large icon from the network
            String callIcon = data.get("icon");
            if (callIcon != null && !callIcon.isEmpty()) {
                try {
                    Bitmap largeIcon = getBitmapFromUrl(callIcon);
                    if (largeIcon != null) {
                        builder.setLargeIcon(largeIcon);
                    }
                } catch (Exception e) {
                    Log.w(TAG, "Failed to load large icon", e);
                }
            }

            NotificationManager nm = getSystemService(NotificationManager.class);
            if (nm != null) {
                nm.notify(notificationId, builder.build());
            }
            return;
        }

        // Non-call notification (messages, general, etc.)
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

        NotificationManager nm = getSystemService(NotificationManager.class);
        if (nm != null) {
            nm.notify(notificationId, builder.build());
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
