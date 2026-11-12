package au.com.inspecta.app;

import android.os.Bundle;
import android.view.KeyEvent;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // the app's own plugins, registered before the bridge starts
        registerPlugin(GalleryPlugin.class);
        registerPlugin(NativeCameraPlugin.class);
        super.onCreate(savedInstanceState);
    }

    // While the camera screen is up, either volume key is the shutter (one
    // photo per press, held down or not) and the volume isn't changed.
    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        int code = event.getKeyCode();
        if (NativeCameraPlugin.shutterKeys && (code == KeyEvent.KEYCODE_VOLUME_UP || code == KeyEvent.KEYCODE_VOLUME_DOWN)) {
            if (event.getAction() == KeyEvent.ACTION_DOWN && event.getRepeatCount() == 0) NativeCameraPlugin.shutterKeyPressed();
            return true;
        }
        return super.dispatchKeyEvent(event);
    }
}
