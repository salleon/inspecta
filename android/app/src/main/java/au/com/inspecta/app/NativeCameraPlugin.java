package au.com.inspecta.app;

import android.Manifest;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.Color;
import android.graphics.ColorMatrix;
import android.graphics.ColorMatrixColorFilter;
import android.graphics.RenderEffect;
import android.graphics.Shader;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.view.TextureView;
import android.view.View;
import android.widget.ImageView;
import android.view.OrientationEventListener;
import android.view.Surface;
import android.view.ViewGroup;
import android.webkit.WebView;
import androidx.annotation.NonNull;
import android.hardware.camera2.CameraCharacteristics;
import android.util.SizeF;
import androidx.camera.camera2.interop.Camera2CameraInfo;
import androidx.camera.core.Camera;
import androidx.camera.core.CameraInfo;
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
import java.util.List;
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
    // the back lenses: the main one, and the ultra-wide if the phone lists
    // it as a camera of its own (its zoom next to the main one's, e.g. 0.55)
    private CameraSelector mainLens = CameraSelector.DEFAULT_BACK_CAMERA;
    private CameraSelector wideLens = null;
    private float wideFactor = 0f;
    private boolean onWide = false;
    // zero shutter lag: off on phones where it hands back an old photo
    private boolean zsl = true;
    // On a phone taller than the photo: the picture sits at the top (its
    // place from the web app, in CSS px) and a blurred, darkened copy of it
    // fills the screen behind (refreshed several times a second)
    private ImageView fillView;
    private boolean fill = false;
    private double fillTop = 0, fillHeight = 0;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Runnable fillTick = this::refreshFill;
    private static final int FILL_MS = 70;
    private static final int FILL_W = 36;
    private static final Paint FILL_PAINT = new Paint(Paint.FILTER_BITMAP_FLAG);
    private Bitmap fillRaw;
    // a photo's being looked at: the web app shows its own blurred copy
    private boolean fillPaused = false;

    // ---- calls from the web app ----

    /** Opens the camera (if it isn't open). show: the picture shows now (else it's only made ready). */
    @PluginMethod
    public void start(PluginCall call) {
        zsl = !Boolean.FALSE.equals(call.getBoolean("zsl", true));
        if (camera == null) flashOn = Boolean.TRUE.equals(call.getBoolean("flash", flashOn));
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
            if (fill) {
                handler.removeCallbacks(fillTick);
                handler.post(fillTick);
            }
            call.resolve();
        });
    }

    /** The picture's hidden again; the camera stays ready. */
    @PluginMethod
    public void hide(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            setSeeThrough(false);
            handler.removeCallbacks(fillTick);
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

    /** Zero shutter lag on or off (the camera's set up again if it's open). */
    @PluginMethod
    public void setZsl(PluginCall call) {
        boolean on = !Boolean.FALSE.equals(call.getBoolean("on", true));
        getActivity().runOnUiThread(() -> {
            if (on == zsl) {
                call.resolve();
                return;
            }
            zsl = on;
            if (provider != null && camera != null) {
                String failed = bindEither();
                if (failed != null) {
                    call.reject("Couldn't set up the camera again: " + failed);
                    return;
                }
            }
            call.resolve();
        });
    }

    /** Where the picture goes: fill (the picture at top / height, CSS px, with the blurred copy behind; paused: not refreshed, a photo is showing) or the whole screen. */
    @PluginMethod
    public void setLayout(PluginCall call) {
        boolean f = Boolean.TRUE.equals(call.getBoolean("fill", false));
        boolean paused = Boolean.TRUE.equals(call.getBoolean("paused", false));
        Double top = call.getDouble("top"), height = call.getDouble("height");
        getActivity().runOnUiThread(() -> {
            fill = f && top != null && height != null && height > 0;
            fillPaused = paused;
            fillTop = top != null ? top : 0;
            fillHeight = height != null ? height : 0;
            applyLayout();
            call.resolve();
        });
    }

    @PluginMethod
    public void setFlash(PluginCall call) {
        boolean on = Boolean.TRUE.equals(call.getBoolean("on", false));
        getActivity().runOnUiThread(() -> {
            if (on == flashOn) {
                call.resolve();
                return;
            }
            flashOn = on;
            // set up again: with the flash on, the photo waits for it
            if (provider != null && camera != null) {
                String failed = bindEither();
                if (failed != null) {
                    call.reject("Couldn't set the flash: " + failed);
                    return;
                }
            }
            call.resolve();
        });
    }

    /** Focus on a point: x, y as fractions of the picture. */
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
            try {
                ensurePreviewView();
            } catch (Throwable e) {
                call.reject("Couldn't show the camera: " + e);
                return;
            }
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
                    } catch (Throwable e) {
                        setSeeThrough(false);
                        call.reject("No camera service: " + e);
                        return;
                    }
                    findLenses();
                    onWide = false;
                    String failed = bindEither();
                    if (failed != null) {
                        // let go of the camera
                        close();
                        call.reject("Couldn't start the camera: " + failed);
                        return;
                    }
                    call.resolve(info());
                },
                ContextCompat.getMainExecutor(getContext())
            );
        });
    }

    /** The ultra-wide lens (wide: true) or the main one: { ...info }. */
    @PluginMethod
    public void setLens(PluginCall call) {
        boolean wide = Boolean.TRUE.equals(call.getBoolean("wide", false));
        getActivity().runOnUiThread(() -> {
            if (provider == null || camera == null || (wide && wideLens == null) || wide == onWide) {
                call.resolve(info());
                return;
            }
            onWide = wide;
            String failed = bindEither();
            if (failed != null) {
                // back to the lens that worked
                onWide = !wide;
                bindEither();
                call.reject("Couldn't switch lens: " + failed);
                return;
            }
            call.resolve(info());
        });
    }

    // The best settings, or plainer ones if this phone won't take them:
    // null if it's bound, else what went wrong.
    private String bindEither() {
        try {
            bind(true);
            return null;
        } catch (Throwable first) {
            try {
                bind(false);
                return null;
            } catch (Throwable second) {
                return first + " / " + second;
            }
        }
    }

    // Which back camera is the main one (what Android picks by default) and
    // which, if any, is an ultra-wide: a back camera that sees a good deal
    // wider. Its factor is how its view compares (e.g. 0.55 = ".5×").
    private void findLenses() {
        wideLens = null;
        wideFactor = 0f;
        try {
            List<CameraInfo> all = provider.getAvailableCameraInfos();
            List<CameraInfo> mains = CameraSelector.DEFAULT_BACK_CAMERA.filter(all);
            if (mains.isEmpty()) return;
            CameraInfo main = mains.get(0);
            double mainView = viewAngle(main);
            if (mainView <= 0) return;
            double widest = mainView * 1.25;
            for (CameraInfo info : all) {
                if (info == main || info.getLensFacing() != CameraSelector.LENS_FACING_BACK) continue;
                double view = viewAngle(info);
                if (view > widest) {
                    widest = view;
                    wideLens = info.getCameraSelector();
                    wideFactor = (float) (Math.tan(mainView / 2) / Math.tan(view / 2));
                }
            }
        } catch (Throwable ignored) {
            wideLens = null;
            wideFactor = 0f;
        }
    }

    // a camera's horizontal angle of view, radians (0 if it won't say)
    private static double viewAngle(CameraInfo info) {
        try {
            Camera2CameraInfo c2 = Camera2CameraInfo.from(info);
            float[] focal = c2.getCameraCharacteristic(CameraCharacteristics.LENS_INFO_AVAILABLE_FOCAL_LENGTHS);
            SizeF sensor = c2.getCameraCharacteristic(CameraCharacteristics.SENSOR_INFO_PHYSICAL_SIZE);
            if (focal == null || focal.length == 0 || sensor == null || focal[0] <= 0) return 0;
            return 2 * Math.atan(Math.max(sensor.getWidth(), sensor.getHeight()) / (2 * focal[0]));
        } catch (Throwable e) {
            return 0;
        }
    }

    // best: 4:3 like the camera app's photos, the photo at the largest size,
    // zero shutter lag (the photo is the moment the shutter's pressed) unless
    // it's been turned off.
    // Otherwise CameraX's own choices and its quickest ordinary capture.
    private void bind(boolean best) {
        Preview.Builder previewBuilder = new Preview.Builder();
        ImageCapture.Builder captureBuilder = new ImageCapture.Builder()
            .setFlashMode(flashOn ? ImageCapture.FLASH_MODE_ON : ImageCapture.FLASH_MODE_OFF)
            .setJpegQuality(92);
        // the flash as the torch, on until the photo's taken: a quick flash
        // was missed by the photo on some phones
        if (flashOn) captureBuilder.setFlashType(ImageCapture.FLASH_TYPE_USE_TORCH_AS_FLASH);
        if (best) {
            previewBuilder.setResolutionSelector(
                new ResolutionSelector.Builder().setAspectRatioStrategy(AspectRatioStrategy.RATIO_4_3_FALLBACK_AUTO_STRATEGY).build()
            );
            captureBuilder
                .setResolutionSelector(
                    new ResolutionSelector.Builder()
                        .setAspectRatioStrategy(AspectRatioStrategy.RATIO_4_3_FALLBACK_AUTO_STRATEGY)
                        .setResolutionStrategy(ResolutionStrategy.HIGHEST_AVAILABLE_STRATEGY)
                        .build()
                )
                .setCaptureMode(
                    // zero shutter lag takes the photo from just before the
                    // press, before the flash: not with the flash on
                    zsl && !flashOn ? ImageCapture.CAPTURE_MODE_ZERO_SHUTTER_LAG : ImageCapture.CAPTURE_MODE_MINIMIZE_LATENCY
                );
        } else {
            captureBuilder.setCaptureMode(ImageCapture.CAPTURE_MODE_MINIMIZE_LATENCY);
        }
        Preview preview = previewBuilder.build();
        preview.setSurfaceProvider(previewView.getSurfaceProvider());
        imageCapture = captureBuilder.build();
        provider.unbindAll();
        camera = provider.bindToLifecycle((LifecycleOwner) getActivity(), onWide && wideLens != null ? wideLens : mainLens, preview, imageCapture);
        if (orientation != null) orientation.enable();
    }

    private void close() {
        try {
            if (provider != null) provider.unbindAll();
        } catch (Throwable ignored) {
            // nothing bound
        }
        camera = null;
        imageCapture = null;
        streaming = false;
        handler.removeCallbacks(fillTick);
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
        res.put("wideFactor", wideLens != null ? wideFactor : 0);
        res.put("lens", onWide ? "wide" : "main");
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
        // the blurred copy, behind the picture: darkened, a little richer
        fillView = new ImageView(getContext());
        fillView.setScaleType(ImageView.ScaleType.CENTER_CROP);
        fillView.setScaleX(1.15f);
        fillView.setScaleY(1.15f);
        fillView.setBackgroundColor(Color.BLACK);
        ColorMatrix look = new ColorMatrix();
        look.setSaturation(1.25f);
        ColorMatrix dim = new ColorMatrix();
        dim.setScale(0.5f, 0.5f, 0.5f, 1f);
        look.postConcat(dim);
        fillView.setColorFilter(new ColorMatrixColorFilter(look));
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            float r = 18 * getContext().getResources().getDisplayMetrics().density;
            fillView.setRenderEffect(RenderEffect.createBlurEffect(r, r, Shader.TileMode.CLAMP));
        }
        fillView.setVisibility(View.GONE);
        parent.addView(fillView, 0, new ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        webView.bringToFront();
        applyLayout();
        previewView
            .getPreviewStreamState()
            .observe((LifecycleOwner) getActivity(), (state) -> {
                streaming = state == PreviewView.StreamState.STREAMING;
                if (streaming && fill) {
                    handler.removeCallbacks(fillTick);
                    handler.post(fillTick);
                }
                JSObject data = new JSObject();
                data.put("streaming", streaming);
                notifyListeners("state", data);
            });
    }

    // the picture at its place (or the whole screen), and the blurred copy
    // shown and refreshing, or hidden
    private void applyLayout() {
        if (previewView == null) return;
        WebView webView = getBridge().getWebView();
        float d = getContext().getResources().getDisplayMetrics().density;
        ViewGroup.LayoutParams lp = previewView.getLayoutParams();
        if (fill) {
            lp.height = Math.round((float) fillHeight * d);
            previewView.setTranslationY(webView.getTop() + Math.round((float) fillTop * d));
        } else {
            lp.height = ViewGroup.LayoutParams.MATCH_PARENT;
            previewView.setTranslationY(0);
        }
        previewView.setLayoutParams(lp);
        fillView.setVisibility(fill ? View.VISIBLE : View.GONE);
        handler.removeCallbacks(fillTick);
        if (fill) handler.post(fillTick);
        else fillView.setImageDrawable(null);
    }

    // A tiny copy of the picture, blurred, behind it. Copied straight off the
    // graphics chip at its tiny size (a full-size copy, several times a
    // second, slowed the whole app down), then turned the way the picture's
    // shown (the TextureView's own turn isn't in its copy).
    private void refreshFill() {
        if (!fill || fillPaused || previewView == null || camera == null) return;
        if (streaming) {
            try {
                TextureView tv = findTexture(previewView);
                if (tv != null && tv.isAvailable() && tv.getWidth() > 0 && previewView.getWidth() > 0) {
                    if (fillRaw == null) fillRaw = Bitmap.createBitmap(48, 48, Bitmap.Config.ARGB_8888);
                    tv.getBitmap(fillRaw);
                    int sw = FILL_W, sh = Math.max(1, Math.round((float) FILL_W * previewView.getHeight() / previewView.getWidth()));
                    Bitmap small = Bitmap.createBitmap(sw, sh, Bitmap.Config.ARGB_8888);
                    Canvas c = new Canvas(small);
                    c.scale((float) sw / previewView.getWidth(), (float) sh / previewView.getHeight());
                    c.translate(tv.getLeft(), tv.getTop());
                    c.concat(tv.getTransform(null));
                    c.scale((float) tv.getWidth() / fillRaw.getWidth(), (float) tv.getHeight() / fillRaw.getHeight());
                    c.drawBitmap(fillRaw, 0, 0, FILL_PAINT);
                    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) boxBlur(small, 2);
                    fillView.setImageBitmap(small);
                }
            } catch (Throwable ignored) {
                // just this time
            }
        }
        handler.postDelayed(fillTick, FILL_MS);
    }

    private static TextureView findTexture(View v) {
        if (v instanceof TextureView) return (TextureView) v;
        if (v instanceof ViewGroup) {
            ViewGroup g = (ViewGroup) v;
            for (int i = 0; i < g.getChildCount(); i++) {
                TextureView t = findTexture(g.getChildAt(i));
                if (t != null) return t;
            }
        }
        return null;
    }

    // a quick blur on a tiny bitmap, for phones without RenderEffect
    private static void boxBlur(Bitmap b, int r) {
        int w = b.getWidth(), h = b.getHeight();
        int[] px = new int[w * h], tmp = new int[w * h];
        b.getPixels(px, 0, w, 0, 0, w, h);
        for (int pass = 0; pass < 2; pass++) {
            blurLine(px, tmp, w, h, r, true);
            blurLine(tmp, px, w, h, r, false);
        }
        b.setPixels(px, 0, w, 0, 0, w, h);
    }

    private static void blurLine(int[] in, int[] out, int w, int h, int r, boolean across) {
        int lines = across ? h : w, len = across ? w : h;
        for (int l = 0; l < lines; l++) {
            for (int i = 0; i < len; i++) {
                int rs = 0, gs = 0, bs = 0, n = 0;
                for (int k = Math.max(0, i - r); k <= Math.min(len - 1, i + r); k++) {
                    int c = in[across ? l * w + k : k * w + l];
                    rs += (c >> 16) & 255;
                    gs += (c >> 8) & 255;
                    bs += c & 255;
                    n++;
                }
                out[across ? l * w + i : i * w + l] = 0xff000000 | ((rs / n) << 16) | ((gs / n) << 8) | (bs / n);
            }
        }
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
