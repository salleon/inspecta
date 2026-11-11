package au.com.inspecta.app;

import android.app.NotificationManager;
import android.content.Context;
import android.content.res.AssetFileDescriptor;
import android.media.AudioAttributes;
import android.media.AudioManager;
import android.media.MediaPlayer;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

// The launch sound (res/raw/splash_jingle.mp3, made by scripts/splash-jingle.py),
// played once as the splash starts, and only when the phone's sound is on:
// ringer on normal (not silent or vibrate), Do Not Disturb off and the media
// volume above zero. It plays at the media volume and doesn't take audio
// focus, so music or a podcast already playing carries on underneath.
//
// The player is prepared as the plugin loads, so play() can start it on time
// (after the delay it's given, for the Contractor splash) and it stays in
// step with the animation. If it isn't ready by then it starts when ready,
// unless that's too late to match the splash.
@CapacitorPlugin(name = "LaunchSound")
public class LaunchSoundPlugin extends Plugin {

    // once per app run: a re-created activity doesn't play it again
    private static boolean played = false;
    private static final long LATE_MS = 400;

    private final Handler main = new Handler(Looper.getMainLooper());
    private MediaPlayer player;
    private boolean prepared = false;
    private long startAt = -1; // uptime the sound is due to start

    @Override
    public void load() {
        if (played || !soundOn()) return;
        try {
            MediaPlayer mp = new MediaPlayer();
            mp.setAudioAttributes(
                new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_MEDIA)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build()
            );
            try (AssetFileDescriptor fd = getContext().getResources().openRawResourceFd(R.raw.splash_jingle)) {
                mp.setDataSource(fd.getFileDescriptor(), fd.getStartOffset(), fd.getLength());
            }
            mp.setOnPreparedListener(p -> onPrepared());
            mp.setOnCompletionListener(p -> release());
            mp.setOnErrorListener((p, what, extra) -> {
                release();
                return true;
            });
            player = mp;
            mp.prepareAsync();
        } catch (Exception e) {
            release();
        }
    }

    @PluginMethod
    public void play(PluginCall call) {
        boolean will = false;
        synchronized (this) {
            if (!played && player != null && startAt < 0) {
                if (!soundOn()) {
                    release();
                } else {
                    long delay = Math.max(0, Math.min(2000, call.getInt("delay", 0)));
                    startAt = SystemClock.uptimeMillis() + delay;
                    if (prepared) main.postAtTime(this::fire, startAt);
                    will = true;
                }
            }
        }
        JSObject ret = new JSObject();
        ret.put("played", will);
        call.resolve(ret);
    }

    private synchronized void onPrepared() {
        prepared = true;
        if (startAt >= 0) main.postAtTime(this::fire, Math.max(startAt, SystemClock.uptimeMillis()));
    }

    private synchronized void fire() {
        if (played || player == null) return;
        if (SystemClock.uptimeMillis() - startAt > LATE_MS) {
            release();
            return;
        }
        try {
            player.start();
            played = true;
        } catch (Exception e) {
            release();
        }
    }

    private synchronized void release() {
        if (player != null) {
            player.release();
            player = null;
        }
        prepared = false;
    }

    @Override
    protected void handleOnDestroy() {
        release();
    }

    private boolean soundOn() {
        Context ctx = getContext();
        AudioManager am = (AudioManager) ctx.getSystemService(Context.AUDIO_SERVICE);
        if (am == null || am.getRingerMode() != AudioManager.RINGER_MODE_NORMAL) return false;
        if (am.getStreamVolume(AudioManager.STREAM_MUSIC) == 0) return false;
        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) {
            int filter = nm.getCurrentInterruptionFilter();
            if (filter != NotificationManager.INTERRUPTION_FILTER_ALL && filter != NotificationManager.INTERRUPTION_FILTER_UNKNOWN) return false;
        }
        return true;
    }
}
