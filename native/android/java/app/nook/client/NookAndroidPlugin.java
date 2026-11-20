package app.nook.client;

import android.Manifest;
import android.content.Intent;
import android.os.Build;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;

// Die Oberfläche spricht diese Erweiterung als „NookAndroid“ an (renderer/src/native.js → NA).
@CapacitorPlugin(
    name = "NookAndroid",
    permissions = { @Permission(alias = "notifications", strings = { Manifest.permission.POST_NOTIFICATIONS }) }
)
public class NookAndroidPlugin extends Plugin {

    // Anruf beginnt: Vordergrund-Dienst starten -> Mikro und Ton laufen bei gesperrtem Bildschirm weiter
    @PluginMethod
    public void callStarted(PluginCall call) {
        String name = call.getString("name", "Nook");
        // Ab Android 13 braucht die Anruf-Benachrichtigung eine Erlaubnis (ohne läuft der Dienst trotzdem)
        if (Build.VERSION.SDK_INT >= 33 && getPermissionState("notifications") != com.getcapacitor.PermissionState.GRANTED) {
            requestPermissionForAlias("notifications", call, "afterNotifPermission");
            return;
        }
        startService(name);
        call.resolve();
    }

    @com.getcapacitor.annotation.PermissionCallback
    private void afterNotifPermission(PluginCall call) {
        startService(call.getString("name", "Nook"));
        call.resolve();
    }

    private void startService(String name) {
        Intent i = new Intent(getContext(), CallService.class);
        i.putExtra("name", name);
        try {
            ContextCompat.startForegroundService(getContext(), i);
        } catch (Exception e) {
            // z. B. wenn Android den Start aus dem Hintergrund verbietet – Anruf läuft dann nur im Vordergrund
        }
    }

    @PluginMethod
    public void callEnded(PluginCall call) {
        getContext().stopService(new Intent(getContext(), CallService.class));
        call.resolve();
    }

    @PluginMethod
    public void status(PluginCall call) {
        JSObject r = new JSObject();
        r.put("callService", CallService.running);
        r.put("sdk", Build.VERSION.SDK_INT);
        call.resolve(r);
    }
}
