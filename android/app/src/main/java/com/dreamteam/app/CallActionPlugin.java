package com.dreamteam.app;

import android.content.Context;
import android.content.SharedPreferences;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Capacitor plugin to read pending call actions set by IncomingCallActivity.
 * The WebView polls this on resume to know if user accepted/declined a call
 * from the native incoming call screen.
 */
@CapacitorPlugin(name = "CallAction")
public class CallActionPlugin extends Plugin {

    @PluginMethod()
    public void getPendingAction(PluginCall call) {
        SharedPreferences prefs = getContext().getSharedPreferences("call_action", Context.MODE_PRIVATE);
        String action = prefs.getString("action", null);

        if (action != null) {
            long timestamp = prefs.getLong("timestamp", 0);
            // Only process actions less than 60 seconds old
            if (System.currentTimeMillis() - timestamp < 60000) {
                JSObject ret = new JSObject();
                ret.put("action", action);
                ret.put("callDocId", prefs.getString("call_doc_id", ""));
                ret.put("callerName", prefs.getString("caller_name", ""));
                ret.put("callType", prefs.getString("call_type", ""));
                // Clear after reading
                prefs.edit().clear().apply();
                call.resolve(ret);
                return;
            }
            // Stale action — clear it
            prefs.edit().clear().apply();
        }

        call.resolve(new JSObject());
    }
}
