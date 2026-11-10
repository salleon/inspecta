import Capacitor
import Photos

// Saves a copy of an in-app camera photo to the Photos library, in the site's album
// inside an "Inspecta" folder (the same calls as android/.../GalleryPlugin.java).
@objc(GalleryPlugin)
public class GalleryPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "GalleryPlugin"
    public let jsName = "Gallery"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "savePhoto", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "savePhotoFile", returnType: CAPPluginReturnPromise),
    ]

    private static let folderTitle = "Inspecta"

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
        let album = call.getString("album").flatMap { $0.isEmpty ? nil : $0 }
        PHPhotoLibrary.requestAuthorization(for: album == nil ? .addOnly : .readWrite) { status in
            guard status == .authorized || status == .limited else {
                return call.reject("Couldn't save to the gallery: no permission")
            }
            let options = PHAssetResourceCreationOptions()
            options.originalFilename = (call.getString("name") ?? "IMG") + ".jpg"
            PHPhotoLibrary.shared().performChanges({
                let request = PHAssetCreationRequest.forAsset()
                add(request, options)
                // albums need full access; with less, the photo is still saved
                if let album, status == .authorized, let photo = request.placeholderForCreatedAsset {
                    Self.file(photo, in: album)
                }
            }) { saved, error in
                if saved {
                    call.resolve()
                } else {
                    call.reject("Couldn't save to the gallery: \(error?.localizedDescription ?? "unknown error")")
                }
            }
        }
    }

    // Adds the photo to the site's album, making the album and the folder if they aren't there.
    private static func file(_ photo: PHObjectPlaceholder, in title: String) {
        let folder = find(PHCollectionList.fetchCollectionLists(with: .folder, subtype: .regularFolder, options: nil), titled: folderTitle)
        let album = folder.flatMap { find(PHCollection.fetchCollections(in: $0, options: nil), titled: title) as? PHAssetCollection }
        if let album {
            PHAssetCollectionChangeRequest(for: album)?.addAssets([photo] as NSArray)
            return
        }
        let newAlbum = PHAssetCollectionChangeRequest.creationRequestForAssetCollection(withTitle: title)
        newAlbum.addAssets([photo] as NSArray)
        let folderRequest = folder.flatMap { PHCollectionListChangeRequest(for: $0) }
            ?? PHCollectionListChangeRequest.creationRequestForCollectionList(withTitle: folderTitle)
        folderRequest.addChildCollections([newAlbum.placeholderForCreatedAssetCollection] as NSArray)
    }

    private static func find<T: PHCollection>(_ result: PHFetchResult<T>, titled title: String) -> T? {
        var found: T?
        result.enumerateObjects { item, _, stop in
            if item.localizedTitle == title {
                found = item
                stop.pointee = true
            }
        }
        return found
    }
}
