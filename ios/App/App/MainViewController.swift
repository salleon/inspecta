import Capacitor

class MainViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(GalleryPlugin())
        bridge?.registerPluginInstance(NativeCameraPlugin())
        bridge?.registerPluginInstance(LaunchSoundPlugin())
    }
}
