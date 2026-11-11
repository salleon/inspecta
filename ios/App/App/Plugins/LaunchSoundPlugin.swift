import AVFoundation
import Capacitor

// The launch sound (splash_jingle.mp3, made by scripts/splash-jingle.py),
// played once as the splash starts (the same calls as
// android/.../LaunchSoundPlugin.java). It plays in the "ambient" audio
// category, so iOS keeps it silent when the ring/silent switch is on silent,
// it follows the volume, and music already playing carries on underneath.
// The app goes back to its usual audio category once it has finished.
@objc(LaunchSoundPlugin)
public class LaunchSoundPlugin: CAPPlugin, CAPBridgedPlugin, AVAudioPlayerDelegate {
    public let identifier = "LaunchSoundPlugin"
    public let jsName = "LaunchSound"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "play", returnType: CAPPluginReturnPromise),
    ]

    // once per app run
    private static var played = false
    private var player: AVAudioPlayer?

    override public func load() {
        guard !Self.played, let url = Bundle.main.url(forResource: "splash_jingle", withExtension: "mp3") else { return }
        player = try? AVAudioPlayer(contentsOf: url)
        player?.delegate = self
        player?.prepareToPlay()
    }

    @objc func play(_ call: CAPPluginCall) {
        let delay = min(max(call.getDouble("delay") ?? 0, 0), 2000) / 1000
        DispatchQueue.main.async {
            guard !Self.played, let player = self.player else {
                call.resolve(["played": false])
                return
            }
            Self.played = true
            do {
                try AVAudioSession.sharedInstance().setCategory(.ambient, options: [.mixWithOthers])
            } catch {
                self.player = nil
                call.resolve(["played": false])
                return
            }
            let ok = player.play(atTime: player.deviceCurrentTime + delay)
            if !ok { self.finish() }
            call.resolve(["played": ok])
        }
    }

    public func audioPlayerDidFinishPlaying(_ player: AVAudioPlayer, successfully flag: Bool) {
        finish()
    }

    private func finish() {
        player = nil
        try? AVAudioSession.sharedInstance().setCategory(.soloAmbient)
    }
}
