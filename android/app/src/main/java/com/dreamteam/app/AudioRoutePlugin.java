package com.dreamteam.app;

import android.content.Context;
import android.media.AudioDeviceInfo;
import android.media.AudioManager;
import android.os.Build;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.List;

/**
 * Where a call's audio comes out of: the earpiece you hold to your head, or the loudspeaker.
 *
 * ── Why this is not just setSpeakerphoneOn() ─────────────────────────────────────────────────
 * It used to be, and on any recent phone that silently did nothing — every voice call played out
 * of the loudspeaker however the app asked. `setSpeakerphoneOn()` was deprecated in Android 12
 * (API 31) and on Android 13+ it is effectively a no-op for apps: the platform moved routing to
 * `setCommunicationDevice()`, where you name the actual output device rather than toggling a flag.
 * The old call still compiles and still returns without error, which is why the bug is invisible
 * from the JavaScript side — the promise resolves, and the sound comes out of the wrong speaker.
 *
 * So on API 31+ we pick a real device, and below that we keep the flag that genuinely worked.
 *
 * ── Why "earpiece" is not always the earpiece ────────────────────────────────────────────────
 * If somebody has headphones or a car kit connected, routing to the built-in earpiece is worse
 * than doing nothing — the sound leaves the device they are actually listening through. So the
 * non-speaker case prefers a connected headset and only falls back to the earpiece.
 */
@CapacitorPlugin(name = "AudioRoute")
public class AudioRoutePlugin extends Plugin {

    private AudioManager audio() {
        return (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
    }

    @PluginMethod()
    public void setSpeakerOn(PluginCall call) {
        Boolean enabled = call.getBoolean("enabled", true);
        AudioManager audioManager = audio();
        if (audioManager == null) {
            call.resolve();
            return;
        }

        // Routing only applies in communication mode — in MODE_NORMAL the platform treats the
        // stream as media and sends it to the loudspeaker whatever else is asked for.
        audioManager.setMode(AudioManager.MODE_IN_COMMUNICATION);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            routeModern(audioManager, Boolean.TRUE.equals(enabled));
        } else {
            audioManager.setSpeakerphoneOn(Boolean.TRUE.equals(enabled));
        }
        call.resolve();
    }

    /** Android 12+ — name the output device instead of toggling a flag. */
    private void routeModern(AudioManager audioManager, boolean speaker) {
        List<AudioDeviceInfo> devices = audioManager.getAvailableCommunicationDevices();
        AudioDeviceInfo target = null;

        if (speaker) {
            target = firstOfType(devices, AudioDeviceInfo.TYPE_BUILTIN_SPEAKER);
        } else {
            // A connected headset wins over the earpiece — see the note above.
            target = firstOfType(devices,
                    AudioDeviceInfo.TYPE_BLUETOOTH_SCO,
                    AudioDeviceInfo.TYPE_WIRED_HEADSET,
                    AudioDeviceInfo.TYPE_WIRED_HEADPHONES,
                    AudioDeviceInfo.TYPE_USB_HEADSET,
                    AudioDeviceInfo.TYPE_BUILTIN_EARPIECE);
        }

        if (target != null) {
            audioManager.setCommunicationDevice(target);
        } else {
            // No device of any wanted type — let the platform choose rather than forcing nothing.
            audioManager.clearCommunicationDevice();
        }
    }

    /** The first available device matching any of these types, in the order given. */
    private AudioDeviceInfo firstOfType(List<AudioDeviceInfo> devices, int... types) {
        for (int type : types) {
            for (AudioDeviceInfo device : devices) {
                if (device.getType() == type) return device;
            }
        }
        return null;
    }

    @PluginMethod()
    public void isSpeakerOn(PluginCall call) {
        AudioManager audioManager = audio();
        boolean on = false;

        if (audioManager != null) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                AudioDeviceInfo current = audioManager.getCommunicationDevice();
                on = current != null && current.getType() == AudioDeviceInfo.TYPE_BUILTIN_SPEAKER;
            } else {
                on = audioManager.isSpeakerphoneOn();
            }
        }

        JSObject ret = new JSObject();
        ret.put("enabled", on);
        call.resolve(ret);
    }

    /**
     * Hand the audio system back when the call ends.
     *
     * Leaving the mode at MODE_IN_COMMUNICATION keeps the phone in "on a call" state — music plays
     * at call volume, the volume keys adjust the wrong stream, and the earpiece stays claimed. The
     * routing override has to be released too, or the next app's audio inherits it.
     */
    @PluginMethod()
    public void reset(PluginCall call) {
        AudioManager audioManager = audio();
        if (audioManager != null) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                audioManager.clearCommunicationDevice();
            } else {
                audioManager.setSpeakerphoneOn(false);
            }
            audioManager.setMode(AudioManager.MODE_NORMAL);
        }
        call.resolve();
    }
}
