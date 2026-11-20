package app.nook.client;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

// Wird beim Bauen über die von Capacitor erzeugte MainActivity kopiert (scripts/android-build.sh).
public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // App-eigene Erweiterung (nicht aus npm) – muss vor super.onCreate angemeldet werden
        registerPlugin(NookAndroidPlugin.class);
        super.onCreate(savedInstanceState);
    }

    @Override
    public void onPause() {
        super.onPause();
        // Während eines Anrufs soll die Web-Ansicht weiterlaufen (Mikro, Ton, Verbindungen)
        if (CallService.running && getBridge() != null && getBridge().getWebView() != null) {
            getBridge().getWebView().onResume();
            getBridge().getWebView().resumeTimers();
        }
    }
}
