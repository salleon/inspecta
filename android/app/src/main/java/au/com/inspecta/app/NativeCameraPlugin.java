package au.com.inspecta.app;

import android.Manifest;
import android.graphics.Color;
import android.view.OrientationEventListener;
import android.view.Surface;
import android.view.ViewGroup;
import android.webkit.WebView;
import androidx.annotation.NonNull;
import androidx.camera.core.Camera;
import androidx.camera.core.CameraSelector;
import androidx.camera.core.FocusMeteringAction;
import androidx.camera.core.ImageCapture;
import androidx.camera.core.ImageCaptureException;
import androidx.camera.core.MeteringPoint;
import androidx.camera.core.Preview;
import androidx.camera.core.ZoomState;
import androidx.camera.core.resolutionselector.AspectRatioStrategy;
import androidx.camera.core.resolutionselector.ResolutionSelector;
import androidx.camera.core.resolutionselector.ResolutionStrategy;
import androidx.camera.lifecycle.ProcessCameraProvider;
import androidx.camera.view.PreviewView;
import androidx.core.content.ContextCompat;
import androidx.lifecycle.LifecycleOwner;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import com.google.common.util.concurrent.ListenableFuture;
import java.io.File;
import java.util.concurrent.TimeUnit;

// Inspecta's camera on Android's own camera system (CameraX), in place of
// the browser camera: it opens faster, takes full-size photos with the
// phone's own processing, with no wait at the shutter where the phone
// supports it (zero shutter lag), a real flash, and the phone's lenses for
// zoom (.5× where there's an ultra-wide).
//
// The camera's picture is shown behind the app's screen; while the camera
// is open the screen is see-through (the app's own camera controls stay on
// top, drawn by the web app). Bound to the app's lifecycle, so Android
// closes it when the phone locks or the app is put away and opens it again
// when the app comes back; the web app stops it when it's not wanted.
@CapacitorPlugin(name = "NativeCamera", permissions = { @Permission(alias = "camera", strings = { Manifest.permission.CAMERA }) })
public class NativeCameraPlugin extends Plugin {

    // the app's background (capacitor.config backgroundColor), put back when the camera's hidden
    private static final int APP_BACKGROUND = Color.parseColor("#071b2c");

    private ProcessCameraProvider provider;
    private Camera camera;
    private ImageCapture imageCapture;
    private PreviewView previewView;
    private boolean streaming = false;
    private int rotation = Surface.ROTATION_0;
    private OrientationEventListener orientation;
    private boolean flashOn = false;

    // ---- calls from the web app ----

    /** Opens the camera (if it isn't open). show: the picture shows now (else it's only made ready). */
    @PluginMethod
    public void start(PluginCall call) {
        if (getPermissionState("camera") != PermissionState.GRANTED) {
            requestPermissionForAlias("camera", call, "cameraPermission");
            return;
        }
        open(call);
    }

    @PermissionCallback
    private void cameraPermission(PluginCall call) {
        if (getPermissionState("camera") == PermissionState.GRANTED) open(call);
        else call.reject("Camera permission denied", "denied");
    }

    /** The picture shows (the app's screen goes see-through). */
    @PluginMethod
    public void show(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            setSeeThrough(true);
            call.resolve();
        });
    }

    /** The picture's hidden again; the camera stays ready. */
    @PluginMethod
    public void hide(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            setSeeThrough(false);
            call.resolve();
        });
    }

    /** The camera's closed. */
    @PluginMethod
    public void stop(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            close();
            call.resolve();
        });
    }

    @PluginMethod
    public void setZoom(PluginCall call) {
        Double ratio = call.getDouble("ratio");
        if (camera == null || ratio == null) {
            call.resolve();
            return;
        }
        camera.getCameraControl().setZoomRatio(ratio.floatValue());
        call.resolve();
    }

    @PluginMethod
    public void setFlash(PluginCall call) {
        flashOn = Boolean.TRUE.equals(call.getBoolean("on", false));
        if (imageCapture != null) imageCapture.setFlashMode(flashOn ? ImageCapture.FLASH_MODE_ON : ImageCapture.FLASH_MODE_OFF);
        call.resolve();
    }

    /** Focus on a point: x, y as fractions of the screen. */
    @PluginMethod
    public void focus(PluginCall call) {
        Double x = call.getDouble("x"), y = call.getDouble("y");
        getActivity().runOnUiThread(() -> {
            if (camera != null && previewView != null && x != null && y != null) {
                MeteringPoint point = previewView.getMeteringPointFactory().createPoint((float) (x * previewView.getWidth()), (float) (y * previewView.getHeight()));
                FocusMeteringAction action = new FocusMeteringAction.Builder(point).setAutoCancelDuration(3, TimeUnit.SECONDS).build();
                camera.getCameraControl().startFocusAndMetering(action);
            }
            call.resolve();
        });
    }

    /** Takes a photo, full size, saved in the app's cache: { path }. */
    @PluginMethod
    public void capture(PluginCall call) {
        if (imageCapture == null) {
            call.reject("The camera isn't open");
            return;
        }
        File dir = new File(getContext().getCacheDir(), "camera");
        if (!dir.exists() && !dir.mkdirs()) {
            call.reject("No room for the photo");
            return;
        }
        // last time's photos have been read by now
        File[] old = dir.listFiles();
        if (old != null) for (File f : old) f.delete();
        File out = new File(dir, "IMG_" + System.currentTimeMillis() + ".jpg");
        // which way up the phone is held: the photo comes out upright
        imageCapture.setTargetRotation(rotation);
        ImageCapture.OutputFileOptions options = new ImageCapture.OutputFileOptions.Builder(out).build();
        imageCapture.takePicture(
            options,
            ContextCompat.getMainExecutor(getContext()),
            new ImageCapture.OnImageSavedCallback() {
                @Override
                public void onImageSaved(@NonNull ImageCapture.OutputFileResults results) {
                    JSObject res = new JSObject();
                    res.put("path", out.getAbsolutePath());
                    call.resolve(res);
                }

                @Override
                public void onError(@NonNull ImageCaptureException e) {
                    call.reject("Couldn't take the photo: " + e.getMessage());
                }
            }
        );
    }

    // ---- the camera ----

    private void open(PluginCall call) {
        boolean show = Boolean.TRUE.equals(call.getBoolean("show", true));
        getActivity().runOnUiThread(() -> {
            ensurePreviewView();
            if (show) setSeeThrough(true);
            if (camera != null) {
                call.resolve(info());
                return;
            }
            ListenableFuture<ProcessCameraProvider> future = ProcessCameraProvider.getInstance(getContext());
            future.addListener(
                () -> {
                    try {
                        provider = future.get();
                        bind();
                        call.resolve(info());
                    } catch (Exception e) {
                        call.reject("Couldn't start the camera: " + e.getMessage());
                    }
                },
                ContextCompat.getMainExecutor(getContext())
            );
        });
    }

    private void bind() {
        // 4:3 like the camera app's photos; the photo at the largest size
        ResolutionSelector previewSize = new ResolutionSelector.Builder()
            .setAspectRatioStrategy(AspectRatioStrategy.RATIO_4_3_FALLBACK_AUTO_STRATEGY)
            .build();
        ResolutionSelector photoSize = new ResolutionSelector.Builder()
            .setAspectRatioStrategy(AspectRatioStrategy.RATIO_4_3_FALLBACK_AUTO_STRATEGY)
            .setResolutionStrategy(ResolutionStrategy.HIGHEST_AVAILABLE_STRATEGY)
            .build();
        Preview preview = new Preview.Builder().setResolutionSelector(previewSize).build();
        preview.setSurfaceProvider(previewView.getSurfaceProvider());
        // zero shutter lag: the photo is the moment the shutter's pressed
        // (CameraX falls back to its quickest ordinary capture on phones
        // without it, and with the flash on)
        imageCapture = new ImageCapture.Builder()
            .setResolutionSelector(photoSize)
            .setCaptureMode(ImageCapture.CAPTURE_MODE_ZERO_SHUTTER_LAG)
            .setFlashMode(flashOn ? ImageCapture.FLASH_MODE_ON : ImageCapture.FLASH_MODE_OFF)
            .setJpegQuality(92)
            .build();
        provider.unbindAll();
        camera = provider.bindToLifecycle((LifecycleOwner) getActivity(), CameraSelector.DEFAULT_BACK_CAMERA, preview, imageCapture);
        if (orientation != null) orientation.enable();
    }

    private void close() {
        if (provider != null) provider.unbindAll();
        camera = null;
        imageCapture = null;
        streaming = false;
        if (orientation != null) orientation.disable();
        setSeeThrough(false);
    }

    private JSObject info() {
        JSObject res = new JSObject();
        float min = 1f, max = 1f, now = 1f;
        boolean flash = false;
        if (camera != null) {
            ZoomState zoom = camera.getCameraInfo().getZoomState().getValue();
            if (zoom != null) {
                min = zoom.getMinZoomRatio();
                max = zoom.getMaxZoomRatio();
                now = zoom.getZoomRatio();
            }
            flash = camera.getCameraInfo().hasFlashUnit();
        }
        res.put("zoomMin", min);
        res.put("zoomMax", max);
        res.put("zoom", now);
        res.put("hasFlash", flash);
        res.put("streaming", streaming);
        return res;
    }

    // The camera's picture, behind the app's screen (made once, kept).
    private void ensurePreviewView() {
        if (previewView != null) return;
        WebView webView = getBridge().getWebView();
        ViewGroup parent = (ViewGroup) webView.getParent();
        previewView = new PreviewView(getContext());
        previewView.setImplementationMode(PreviewView.ImplementationMode.COMPATIBLE);
        previewView.setScaleType(PreviewView.ScaleType.FIT_CENTER);
        previewView.setBackgroundColor(Color.BLACK);
        parent.addView(previewView, 0, new ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        webView.bringToFront();
        previewView
            .getPreviewStreamState()
            .observe((LifecycleOwner) getActivity(), (state) -> {
                streaming = state == PreviewView.StreamState.STREAMING;
                JSObject data = new JSObject();
                data.put("streaming", streaming);
                notifyListeners("state", data);
            });
    }

    private void setSeeThrough(boolean on) {
        WebView webView = getBridge().getWebView();
        webView.setBackgroundColor(on ? Color.TRANSPARENT : APP_BACKGROUND);
    }

    // ---- which way up the phone is held ----

    @Override
    public void load() {
        orientation = new OrientationEventListener(getContext()) {
            @Override
            public void onOrientationChanged(int degrees) {
                if (degrees == ORIENTATION_UNKNOWN) return;
                if (degrees >= 45 && degrees < 135) rotation = Surface.ROTATION_270;
                else if (degrees >= 135 && degrees < 225) rotation = Surface.ROTATION_180;
                else if (degrees >= 225 && degrees < 315) rotation = Surface.ROTATION_90;
                else rotation = Surface.ROTATION_0;
            }
        };
    }

    @Override
    protected void handleOnDestroy() {
        if (orientation != null) orientation.disable();
        if (provider != null) provider.unbindAll();
    }
}
