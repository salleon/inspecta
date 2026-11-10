import AVFoundation
import AVKit
import Capacitor
import CoreMotion
import UIKit

// Inspecta's camera on AVFoundation: the same calls as android/.../NativeCameraPlugin.java
// (src/lib/nativeCamera.ts). The picture sits behind the web view, which goes see-through.
@objc(NativeCameraPlugin)
public class NativeCameraPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "NativeCameraPlugin"
    public let jsName = "NativeCamera"
    public let pluginMethods: [CAPPluginMethod] = [
        "start", "show", "hide", "stop", "setZoom", "setLens", "setFacing", "setShutterKeys",
        "setFlash", "setZsl", "setLayout", "focus", "capture",
    ].map { CAPPluginMethod(name: $0, returnType: CAPPluginReturnPromise) }

    private static let appBackground = UIColor(red: 7 / 255, green: 27 / 255, blue: 44 / 255, alpha: 1)
    private static let maxZoom: CGFloat = 10

    private let session = AVCaptureSession()
    private let output = AVCapturePhotoOutput()
    private let queue = DispatchQueue(label: "au.com.inspecta.camera")
    private let motion = CMMotionManager()
    private var device: AVCaptureDevice?
    private var preview: PreviewView?
    private var shutter: UIInteraction?
    private var captures: [Int64: PhotoCapture] = [:]
    private var front = false
    private var flash = false
    private var zsl = true
    private var streaming = false
    private var fill: (top: CGFloat, height: CGFloat)?
    private var orientation = AVCaptureVideoOrientation.portrait

    override public func load() {
        let states = [("DidStartRunning", true), ("DidStopRunning", false), ("WasInterrupted", false), ("InterruptionEnded", true)]
        for (name, on) in states {
            NotificationCenter.default.addObserver(forName: Notification.Name("AVCaptureSession\(name)Notification"), object: session, queue: .main) { [weak self] _ in
                self?.streaming = on
                self?.notifyListeners("state", data: ["streaming": on])
            }
        }
    }

    // MARK: Calls from the web app

    @objc func start(_ call: CAPPluginCall) {
        zsl = call.getBool("zsl", true)
        if !session.isRunning { flash = call.getBool("flash", flash) }
        AVCaptureDevice.requestAccess(for: .video) { granted in
            guard granted else { return call.reject("Camera permission denied", "denied") }
            self.queue.async {
                do {
                    if self.device == nil { try self.configure(front: false) }
                } catch {
                    return call.reject("Couldn't start the camera: \(error.localizedDescription)")
                }
                if !self.session.isRunning { self.session.startRunning() }
                DispatchQueue.main.async {
                    self.ensurePreview()
                    if call.getBool("show", true) { self.setSeeThrough(true) }
                    self.trackOrientation()
                    call.resolve(self.info())
                }
            }
        }
    }

    @objc func show(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.setSeeThrough(true)
            call.resolve()
        }
    }

    @objc func hide(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.setSeeThrough(false)
            call.resolve()
        }
    }

    @objc func stop(_ call: CAPPluginCall) {
        queue.async {
            self.session.stopRunning()
            DispatchQueue.main.async {
                self.motion.stopAccelerometerUpdates()
                self.setSeeThrough(false)
                call.resolve()
            }
        }
    }

    @objc func setZoom(_ call: CAPPluginCall) {
        if let ratio = call.getDouble("ratio") { setZoomRatio(CGFloat(ratio)) }
        call.resolve()
    }

    // The back camera zooms out onto the ultra-wide by itself: no lens to change.
    @objc func setLens(_ call: CAPPluginCall) {
        call.resolve(info())
    }

    @objc func setFacing(_ call: CAPPluginCall) {
        let front = call.getBool("front", false)
        queue.async {
            if self.device != nil, front != self.front {
                do {
                    try self.configure(front: front)
                } catch {
                    return call.reject("Couldn't switch camera: \(error.localizedDescription)")
                }
            }
            call.resolve(self.info())
        }
    }

    // The volume buttons (and Camera Control) take the photo: iOS 17.2 and later.
    @objc func setShutterKeys(_ call: CAPPluginCall) {
        let on = call.getBool("on", false)
        DispatchQueue.main.async {
            if #available(iOS 17.2, *) {
                if self.shutter == nil, let web = self.webView {
                    let interaction = AVCaptureEventInteraction { [weak self] event in
                        if event.phase == .began { self?.notifyListeners("shutterKey", data: [:]) }
                    }
                    web.addInteraction(interaction)
                    self.shutter = interaction
                }
                (self.shutter as? AVCaptureEventInteraction)?.isEnabled = on
            }
            call.resolve()
        }
    }

    @objc func setFlash(_ call: CAPPluginCall) {
        flash = call.getBool("on", false)
        call.resolve()
    }

    @objc func setZsl(_ call: CAPPluginCall) {
        zsl = call.getBool("on", true)
        queue.async {
            self.applyZsl()
            call.resolve()
        }
    }

    @objc func setLayout(_ call: CAPPluginCall) {
        let height = call.getDouble("height") ?? 0
        let on = call.getBool("fill", false) && height > 0
        DispatchQueue.main.async {
            self.fill = on ? (CGFloat(call.getDouble("top") ?? 0), CGFloat(height)) : nil
            self.applyLayout()
            call.resolve()
        }
    }

    @objc func focus(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            if let view = self.preview, let device = self.device, let x = call.getDouble("x"), let y = call.getDouble("y"),
               (try? device.lockForConfiguration()) != nil {
                let point = view.previewLayer.captureDevicePointConverted(fromLayerPoint: CGPoint(x: x * view.bounds.width, y: y * view.bounds.height))
                if device.isFocusPointOfInterestSupported, device.isFocusModeSupported(.continuousAutoFocus) {
                    device.focusPointOfInterest = point
                    device.focusMode = .continuousAutoFocus
                }
                if device.isExposurePointOfInterestSupported, device.isExposureModeSupported(.continuousAutoExposure) {
                    device.exposurePointOfInterest = point
                    device.exposureMode = .continuousAutoExposure
                }
                device.unlockForConfiguration()
            }
            call.resolve()
        }
    }

    @objc func capture(_ call: CAPPluginCall) {
        queue.async {
            guard self.session.isRunning, let connection = self.output.connection(with: .video) else {
                return call.reject("The camera isn't open")
            }
            if connection.isVideoOrientationSupported { connection.videoOrientation = self.orientation }
            let settings = AVCapturePhotoSettings(format: [AVVideoCodecKey: AVVideoCodecType.jpeg])
            settings.photoQualityPrioritization = .balanced
            if self.flash, self.output.supportedFlashModes.contains(.on) { settings.flashMode = .on }
            let id = settings.uniqueID
            let capture = PhotoCapture { [weak self] result in
                self?.queue.async { self?.captures[id] = nil }
                switch result {
                case .success(let path): call.resolve(["path": path])
                case .failure(let error): call.reject("Couldn't take the photo: \(error.localizedDescription)")
                }
            }
            self.captures[id] = capture
            self.output.capturePhoto(with: settings, delegate: capture)
        }
    }

    // MARK: The camera

    private func configure(front: Bool) throws {
        let types: [AVCaptureDevice.DeviceType] = front
            ? [.builtInWideAngleCamera]
            : [.builtInTripleCamera, .builtInDualWideCamera, .builtInDualCamera, .builtInWideAngleCamera]
        let found = AVCaptureDevice.DiscoverySession(deviceTypes: types, mediaType: .video, position: front ? .front : .back).devices.first
        guard let camera = found else { throw CameraError("No camera") }
        let input = try AVCaptureDeviceInput(device: camera)

        session.beginConfiguration()
        defer { session.commitConfiguration() }
        session.sessionPreset = .photo
        let old = session.inputs
        old.forEach { session.removeInput($0) }
        guard session.canAddInput(input) else {
            old.forEach { session.addInput($0) }
            throw CameraError("The camera is busy")
        }
        session.addInput(input)
        if !session.outputs.contains(output) {
            guard session.canAddOutput(output) else { throw CameraError("No photo output") }
            session.addOutput(output)
        }
        output.maxPhotoQualityPrioritization = .balanced
        device = camera
        self.front = front
        applyZsl()
        setZoomRatio(1)
    }

    private func applyZsl() {
        if #available(iOS 17.0, *), output.isZeroShutterLagSupported { output.isZeroShutterLagEnabled = zsl }
    }

    // The device zoom that shows as 1×: above 1 where the camera starts on its ultra-wide lens.
    private var baseZoom: CGFloat {
        guard let device, device.constituentDevices.contains(where: { $0.deviceType == .builtInUltraWideCamera }),
              let factor = device.virtualDeviceSwitchOverVideoZoomFactors.first else { return 1 }
        return CGFloat(truncating: factor)
    }

    private func setZoomRatio(_ ratio: CGFloat) {
        guard let device, (try? device.lockForConfiguration()) != nil else { return }
        device.videoZoomFactor = min(max(ratio * baseZoom, device.minAvailableVideoZoomFactor), device.maxAvailableVideoZoomFactor)
        device.unlockForConfiguration()
    }

    private func info() -> [String: Any] {
        let base = baseZoom
        let hasFront = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .front) != nil
        return [
            "zoomMin": Double(1 / base),
            "zoomMax": Double(min((device?.maxAvailableVideoZoomFactor ?? 1) / base, Self.maxZoom)),
            "zoom": Double((device?.videoZoomFactor ?? 1) / base),
            "hasFlash": device?.hasFlash ?? false,
            "streaming": streaming,
            "wideFactor": 0,
            "lens": front ? "front" : "main",
            "hasFront": hasFront,
        ]
    }

    // MARK: The picture behind the web view

    private func ensurePreview() {
        guard preview == nil, let web = webView, let parent = web.superview else { return }
        let view = PreviewView()
        view.backgroundColor = .black
        view.isHidden = true
        view.previewLayer.session = session
        view.previewLayer.videoGravity = .resizeAspect
        parent.insertSubview(view, belowSubview: web)
        preview = view
        applyLayout()
    }

    private func applyLayout() {
        guard let preview, let web = webView else { return }
        var frame = web.frame
        if let fill {
            frame.origin.y += fill.top
            frame.size.height = fill.height
        }
        preview.frame = frame
    }

    private func setSeeThrough(_ on: Bool) {
        guard let web = webView else { return }
        let color = on ? UIColor.clear : Self.appBackground
        web.isOpaque = !on
        web.backgroundColor = color
        web.scrollView.backgroundColor = color
        preview?.isHidden = !on
    }

    // Which way up the phone is held (the app stays portrait), so photos come out upright.
    private func trackOrientation() {
        guard motion.isAccelerometerAvailable, !motion.isAccelerometerActive else { return }
        motion.accelerometerUpdateInterval = 0.2
        motion.startAccelerometerUpdates(to: .main) { [weak self] data, _ in
            guard let a = data?.acceleration, max(abs(a.x), abs(a.y)) > 0.4 else { return }
            if abs(a.x) > abs(a.y) {
                self?.orientation = a.x > 0 ? .landscapeLeft : .landscapeRight
            } else {
                self?.orientation = a.y > 0 ? .portraitUpsideDown : .portrait
            }
        }
    }
}

// Where the camera's photos are saved until the web app has read them.
enum CameraFiles {
    static let dir = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0].appendingPathComponent("camera", isDirectory: true)

    static func save(_ data: Data) throws -> String {
        let files = FileManager.default
        try files.createDirectory(at: dir, withIntermediateDirectories: true)
        let keepFrom = Date().addingTimeInterval(-180)
        for old in (try? files.contentsOfDirectory(at: dir, includingPropertiesForKeys: [.contentModificationDateKey])) ?? [] {
            let modified = try? old.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate
            if let modified, modified < keepFrom { try? files.removeItem(at: old) }
        }
        let file = dir.appendingPathComponent("IMG_\(Int(Date().timeIntervalSince1970 * 1000)).jpg")
        try data.write(to: file)
        return file.path
    }
}

struct CameraError: LocalizedError {
    let errorDescription: String?
    init(_ message: String) { errorDescription = message }
}

private final class PreviewView: UIView {
    override class var layerClass: AnyClass { AVCaptureVideoPreviewLayer.self }
    var previewLayer: AVCaptureVideoPreviewLayer { layer as! AVCaptureVideoPreviewLayer }
}

private final class PhotoCapture: NSObject, AVCapturePhotoCaptureDelegate {
    private let done: (Result<String, Error>) -> Void

    init(done: @escaping (Result<String, Error>) -> Void) {
        self.done = done
    }

    func photoOutput(_ output: AVCapturePhotoOutput, didFinishProcessingPhoto photo: AVCapturePhoto, error: Error?) {
        do {
            if let error { throw error }
            guard let data = photo.fileDataRepresentation() else { throw CameraError("No photo") }
            done(.success(try CameraFiles.save(data)))
        } catch {
            done(.failure(error))
        }
    }
}
