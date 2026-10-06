package au.com.inspecta.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // the app's own plugins, registered before the bridge starts
        registerPlugin(GalleryPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
