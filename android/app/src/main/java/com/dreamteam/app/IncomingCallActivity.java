package com.dreamteam.app;

import android.app.KeyguardManager;
import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.media.AudioAttributes;
import android.media.AudioManager;
import android.media.Ringtone;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.os.VibratorManager;
import android.view.WindowManager;
import android.widget.ImageButton;
import android.widget.TextView;

import androidx.appcompat.app.AppCompatActivity;

/**
 * Full-screen incoming call activity — shown like WhatsApp when a call arrives
 * while the app is backgrounded or on the lock screen.
 */
public class IncomingCallActivity extends AppCompatActivity {

    private String callerName;
    private String callType;
    private String callDocId;
    private int notificationId;
    private Ringtone ringtone;
    private Vibrator vibrator;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Show on lock screen and turn screen on
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true);
            setTurnScreenOn(true);
            KeyguardManager km = (KeyguardManager) getSystemService(Context.KEYGUARD_SERVICE);
            if (km != null) {
                km.requestDismissKeyguard(this, null);
            }
        } else {
            getWindow().addFlags(
                WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED |
                WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON |
                WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD
            );
        }
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        setContentView(R.layout.activity_incoming_call);

        // Get data from intent
        callerName = getIntent().getStringExtra("caller_name");
        callType = getIntent().getStringExtra("call_type");
        callDocId = getIntent().getStringExtra("call_doc_id");
        notificationId = getIntent().getIntExtra("notification_id", 0);

        if (callerName == null) callerName = "Unknown";
        if (callType == null) callType = "voice";

        // Set UI
        TextView nameView = findViewById(R.id.caller_name);
        nameView.setText(callerName);

        TextView typeView = findViewById(R.id.call_type_label);
        typeView.setText("video".equals(callType)
                ? "Incoming video call…"
                : "Incoming voice call…");

        // Buttons
        ImageButton btnDecline = findViewById(R.id.btn_decline);
        ImageButton btnAccept = findViewById(R.id.btn_accept);

        btnDecline.setOnClickListener(v -> declineCall());
        btnAccept.setOnClickListener(v -> acceptCall());

        // Start ringing + vibrating
        startRinging();
    }

    private void acceptCall() {
        stopRinging();
        cancelNotification();

        // Save action to SharedPreferences so the WebView can pick it up
        SharedPreferences prefs = getSharedPreferences("call_action", MODE_PRIVATE);
        prefs.edit()
                .putString("action", "accept")
                .putString("call_doc_id", callDocId != null ? callDocId : "")
                .putString("caller_name", callerName)
                .putString("call_type", callType)
                .putLong("timestamp", System.currentTimeMillis())
                .apply();

        // Launch/resume the main app
        Intent intent = new Intent(this, MainActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        intent.putExtra("call_action", "accept");
        intent.putExtra("call_doc_id", callDocId);
        intent.putExtra("caller_name", callerName);
        intent.putExtra("call_type", callType);
        startActivity(intent);
        finish();
    }

    private void declineCall() {
        stopRinging();
        cancelNotification();

        // Save decline action so the WebView can update Firestore
        SharedPreferences prefs = getSharedPreferences("call_action", MODE_PRIVATE);
        prefs.edit()
                .putString("action", "decline")
                .putString("call_doc_id", callDocId != null ? callDocId : "")
                .putString("caller_name", callerName)
                .putString("call_type", callType)
                .putLong("timestamp", System.currentTimeMillis())
                .apply();

        // Launch/resume the main app so the WebView can process the decline
        Intent intent = new Intent(this, MainActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        intent.putExtra("call_action", "decline");
        intent.putExtra("call_doc_id", callDocId);
        startActivity(intent);
        finish();
    }

    private void startRinging() {
        try {
            Uri ringtoneUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE);
            ringtone = RingtoneManager.getRingtone(this, ringtoneUri);
            if (ringtone != null) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                    ringtone.setLooping(true);
                }
                AudioAttributes attrs = new AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .build();
                ringtone.setAudioAttributes(attrs);
                ringtone.play();
            }
        } catch (Exception e) {
            // Ignore ringtone errors
        }

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                VibratorManager vm = (VibratorManager) getSystemService(Context.VIBRATOR_MANAGER_SERVICE);
                vibrator = vm.getDefaultVibrator();
            } else {
                vibrator = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
            }
            if (vibrator != null && vibrator.hasVibrator()) {
                long[] pattern = {0, 1000, 1000}; // vibrate 1s, pause 1s, repeat
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    vibrator.vibrate(VibrationEffect.createWaveform(pattern, 0));
                } else {
                    vibrator.vibrate(pattern, 0);
                }
            }
        } catch (Exception e) {
            // Ignore vibration errors
        }
    }

    private void stopRinging() {
        try {
            if (ringtone != null && ringtone.isPlaying()) {
                ringtone.stop();
            }
        } catch (Exception e) { /* ignore */ }

        try {
            if (vibrator != null) {
                vibrator.cancel();
            }
        } catch (Exception e) { /* ignore */ }
    }

    private void cancelNotification() {
        if (notificationId != 0) {
            NotificationManager nm = getSystemService(NotificationManager.class);
            if (nm != null) {
                nm.cancel(notificationId);
            }
        }
    }

    @Override
    protected void onDestroy() {
        stopRinging();
        super.onDestroy();
    }

    @Override
    public void onBackPressed() {
        // Don't allow back press to dismiss — must accept or decline
    }
}
