package com.dreamteam.app;

import android.content.Context;
import android.media.AudioManager;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "AudioRoute")
public class AudioRoutePlugin extends Plugin {

    @PluginMethod()
    public void setSpeakerOn(PluginCall call) {
        Boolean enabled = call.getBoolean("enabled", true);
        AudioManager audioManager = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
        if (audioManager != null) {
            audioManager.setMode(AudioManager.MODE_IN_COMMUNICATION);
            audioManager.setSpeakerphoneOn(enabled);
        }
        call.resolve();
    }

    @PluginMethod()
    public void isSpeakerOn(PluginCall call) {
        AudioManager audioManager = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
        boolean on = audioManager != null && audioManager.isSpeakerphoneOn();
        com.getcapacitor.JSObject ret = new com.getcapacitor.JSObject();
        ret.put("enabled", on);
        call.resolve(ret);
    }

    @PluginMethod()
    public void reset(PluginCall call) {
        AudioManager audioManager = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
        if (audioManager != null) {
            audioManager.setMode(AudioManager.MODE_NORMAL);
            audioManager.setSpeakerphoneOn(false);
        }
        call.resolve();
    }
}
