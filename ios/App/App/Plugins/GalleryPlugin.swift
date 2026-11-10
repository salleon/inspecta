import Capacitor
import Photos

// Saves a copy of an in-app camera photo to the Photos library
// (the same calls as android/.../GalleryPlugin.java).
@objc(GalleryPlugin)
public class GalleryPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "GalleryPlugin"
    public let jsName = "Gallery"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "savePhoto", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "savePhotoFile", returnType: CAPPluginReturnPromise),
    ]

    @objc func savePhoto(_ call: CAPPluginCall) {
        guard let data = Data(base64Encoded: call.getString("data") ?? "", options: .ignoreUnknownCharacters), !data.isEmpty else {
            return call.reject("No photo")
        }
        save(call) { $0.addResource(with: .photo, data: data, options: $1) }
    }

    // Only photos in the camera's own folder.
    @objc func savePhotoFile(_ call: CAPPluginCall) {
        let file = URL(fileURLWithPath: call.getString("path") ?? "").standardizedFileURL
        guard file.deletingLastPathComponent().path == CameraFiles.dir.standardizedFileURL.path,
              FileManager.default.fileExists(atPath: file.path) else {
            return call.reject("No photo")
        }
        save(call) { $0.addResource(with: .photo, fileURL: file, options: $1) }
    }

    private func save(_ call: CAPPluginCall, add: @escaping (PHAssetCreationRequest, PHAssetResourceCreationOptions) -> Void) {
        PHPhotoLibrary.requestAuthorization(for: .addOnly) { status in
            guard status == .authorized || status == .limited else {
                return call.reject("Couldn't save to the gallery: no permission")
            }
            let options = PHAssetResourceCreationOptions()
            options.originalFilename = (call.getString("name") ?? "IMG") + ".jpg"
            PHPhotoLibrary.shared().performChanges({ add(PHAssetCreationRequest.forAsset(), options) }) { saved, error in
                if saved {
                    call.resolve()
                } else {
                    call.reject("Couldn't save to the gallery: \(error?.localizedDescription ?? "unknown error")")
                }
            }
        }
    }
}
