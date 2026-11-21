package com.jeadriano.starringme;

import android.content.Context;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.InputStream;
import java.util.concurrent.atomic.AtomicBoolean;

/** JS name: StarringUpdate. info / check / start / status / cancel / apply. */
@CapacitorPlugin(name = "StarringUpdate")
public class StarringUpdatePlugin extends Plugin {
    // set once at launch by MainActivity
    static volatile int bundledBuild = 1;
    static volatile String bundledVersion = "1.0.0";
    static volatile UpdateStore.Info active;   // downloaded copy in use right now, or null for bundled

    static UpdateStore store(Context c) { return new UpdateStore(new File(c.getFilesDir(), "update")); }

    static void readBundled(Context c) {
        try (InputStream in = c.getAssets().open("public/version.json")) {
            byte[] b = new byte[in.available()]; int n = 0, r;
            while (n < b.length && (r = in.read(b, n, b.length - n)) > 0) n += r;
            java.util.Map<String, String> m = UpdateStore.flatJson(new String(b, 0, n, "UTF-8"));
            bundledBuild = Integer.parseInt(m.get("build")); bundledVersion = m.get("version");
        } catch (Throwable ignored) {}
    }

    private final AtomicBoolean cancel = new AtomicBoolean(false);
    private volatile String state = "idle", err = "";
    private volatile long got = 0, total = 0;
    private volatile UpdateStore.Info ready;      // installed by the last successful download
    private Thread worker;

    private int activeBuild() { return active != null ? active.build : bundledBuild; }
    private String activeVersion() { return active != null ? active.version : bundledVersion; }

    @PluginMethod
    public void info(PluginCall call) {
        JSObject o = new JSObject();
        o.put("version", activeVersion()); o.put("build", activeBuild());
        o.put("source", active != null ? "stored" : "bundled");
        o.put("bundledBuild", bundledBuild);
        call.resolve(o);
    }

    @PluginMethod
    public void check(PluginCall call) {
        try {
            UpdateStore.Info r = store(getContext()).check();
            JSObject o = new JSObject();
            o.put("version", r.version); o.put("build", r.build); o.put("newer", r.build > activeBuild());
            call.resolve(o);
        } catch (UpdateStore.UpdateException e) { call.reject(e.getMessage(), e.code); }
    }

    @PluginMethod
    public synchronized void start(PluginCall call) {
        if (worker != null && worker.isAlive()) { call.resolve(); return; }
        cancel.set(false); state = "downloading"; err = ""; got = 0; total = 0; ready = null;
        final Context ctx = getContext();
        worker = new Thread(() -> {
            try {
                ready = store(ctx).download(activeBuild(), (g, t) -> { got = g; total = t; }, cancel);
                state = "done";
            } catch (UpdateStore.UpdateException e) { err = e.code; state = e.code.equals("cancelled") ? "cancelled" : "error";
            } catch (Throwable t) { err = "storage"; state = "error"; }
        }, "starring-update");
        worker.start();
        call.resolve();
    }

    @PluginMethod
    public void status(PluginCall call) {
        JSObject o = new JSObject();
        o.put("state", state); o.put("received", got); o.put("total", total); o.put("error", err);
        UpdateStore.Info r = ready; if (r != null && state.equals("done")) { o.put("version", r.version); o.put("build", r.build); }
        call.resolve(o);
    }

    @PluginMethod
    public void cancel(PluginCall call) { cancel.set(true); call.resolve(); }

    /** Reload the web view from the downloaded copy (re-verified first). localStorage lives on, the origin is unchanged. */
    @PluginMethod
    public void apply(PluginCall call) {
        UpdateStore s = store(getContext());
        UpdateStore.Info r = s.chooseAtLaunch(bundledBuild);
        if (r == null) { call.reject("no valid stored copy", "bad_data"); return; }
        active = r;
        call.resolve();
        getBridge().setServerBasePath(r.dir);
    }
}
