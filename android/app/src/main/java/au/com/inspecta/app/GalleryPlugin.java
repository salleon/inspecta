package au.com.inspecta.app;

import android.content.ContentResolver;
import android.content.ContentValues;
import android.media.MediaScannerConnection;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;

// Saves a photo from the in-app camera to the phone's gallery (DCIM/Inspecta),
// the way the Android camera's "save to gallery" did. Android 10+ needs no
// permission for this; older phones save it only if storage access was given.
@CapacitorPlugin(name = "Gallery")
public class GalleryPlugin extends Plugin {

    @PluginMethod
    public void savePhoto(PluginCall call) {
        String data = call.getString("data");
        String name = call.getString("name", "IMG_" + System.currentTimeMillis());
        if (data == null) {
            call.reject("No photo");
            return;
        }
        byte[] bytes = Base64.decode(data, Base64.DEFAULT);
        try {
            save(new ByteArrayInputStream(bytes), name);
            call.resolve();
        } catch (Exception e) {
            call.reject("Couldn't save to the gallery: " + e.getMessage());
        }
    }

    /**
     * The in-app camera's photo, copied to the gallery straight from where the
     * camera saved it (the app's own camera folder only): no copy of it has
     * to come through the web app.
     */
    @PluginMethod
    public void savePhotoFile(PluginCall call) {
        String path = call.getString("path");
        String name = call.getString("name", "IMG_" + System.currentTimeMillis());
        try {
            File dir = new File(getContext().getCacheDir(), "camera").getCanonicalFile();
            File file = path == null ? null : new File(path).getCanonicalFile();
            if (file == null || !dir.equals(file.getParentFile()) || !file.isFile()) {
                call.reject("No photo");
                return;
            }
            try (InputStream in = new FileInputStream(file)) {
                save(in, name);
            }
            call.resolve();
        } catch (Exception e) {
            call.reject("Couldn't save to the gallery: " + e.getMessage());
        }
    }

    private void save(InputStream in, String name) throws Exception {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            ContentResolver resolver = getContext().getContentResolver();
            ContentValues values = new ContentValues();
            values.put(MediaStore.Images.Media.DISPLAY_NAME, name + ".jpg");
            values.put(MediaStore.Images.Media.MIME_TYPE, "image/jpeg");
            values.put(MediaStore.Images.Media.RELATIVE_PATH, Environment.DIRECTORY_DCIM + "/Inspecta");
            values.put(MediaStore.Images.Media.IS_PENDING, 1);
            Uri uri = resolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values);
            if (uri == null) throw new Exception("insert failed");
            try (OutputStream out = resolver.openOutputStream(uri)) {
                if (out == null) throw new Exception("open failed");
                copy(in, out);
            }
            values.clear();
            values.put(MediaStore.Images.Media.IS_PENDING, 0);
            resolver.update(uri, values, null, null);
        } else {
            File dir = new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DCIM), "Inspecta");
            if (!dir.exists() && !dir.mkdirs()) throw new Exception("no folder");
            File file = new File(dir, name + ".jpg");
            try (FileOutputStream out = new FileOutputStream(file)) {
                copy(in, out);
            }
            MediaScannerConnection.scanFile(getContext(), new String[] { file.getAbsolutePath() }, new String[] { "image/jpeg" }, null);
        }
    }

    private static void copy(InputStream in, OutputStream out) throws IOException {
        byte[] buf = new byte[64 * 1024];
        int n;
        while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
    }
}
