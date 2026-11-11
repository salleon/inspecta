import UIKit
import Capacitor

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        keepAppDataOutOfICloudBackup()
        return true
    }

    // The app's data (sites, findings, photos and settings, which the web
    // view keeps in Library/WebKit) stays out of iCloud and computer
    // backups: it would fill people's iCloud storage. People back up with
    // the app's own Back up. Set on the folder (made first if it isn't
    // there yet), so everything in it is left out.
    private func keepAppDataOutOfICloudBackup() {
        let files = FileManager.default
        guard let library = files.urls(for: .libraryDirectory, in: .userDomainMask).first else { return }
        var webKit = library.appendingPathComponent("WebKit", isDirectory: true)
        try? files.createDirectory(at: webKit, withIntermediateDirectories: true)
        var values = URLResourceValues()
        values.isExcludedFromBackup = true
        try? webKit.setResourceValues(values)
    }

    func application(_ application: UIApplication,
                     configurationForConnecting connectingSceneSession: UISceneSession,
                     options: UIScene.ConnectionOptions) -> UISceneConfiguration {
        let config = UISceneConfiguration(name: "Default Configuration",
                                          sessionRole: connectingSceneSession.role)
        config.delegateClass = SceneDelegate.self
        return config
    }
}
