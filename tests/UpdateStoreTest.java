import com.jeadriano.starringme.UpdateStore;
import com.sun.net.httpserver.*;
import java.io.*;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.security.MessageDigest;
import java.util.concurrent.atomic.*;

/** Host-side test of the real native update logic against a local http server standing in for GitHub Pages. */
public class UpdateStoreTest {
    static int fails = 0, checks = 0;
    static void ok(boolean c, String m) { checks++; if (!c) { fails++; System.out.println("FAIL " + m); } else System.out.println("ok   " + m); }
    static String sha(byte[] b) throws Exception { return UpdateStore.hex(MessageDigest.getInstance("SHA-256").digest(b)); }
    static byte[] BODY1 = ("<html>library build 2 " + "x".repeat(300000) + "</html>").getBytes(StandardCharsets.UTF_8);

    static volatile String versionJson; static volatile byte[] indexBody = BODY1; static volatile int mode = 0; // 0 normal 1 hang version 2 slow index
    static String vj(int build, String sha) { return "{\"version\":\"1." + build + ".0\",\"build\":" + build + ",\"file\":\"index.html\",\"sha256\":\"" + sha + "\"}"; }

    public static void main(String[] a) throws Exception {
        HttpServer srv = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        srv.createContext("/starring-me/version.json", x -> {
            if (mode == 1) { try { Thread.sleep(3000); } catch (Exception e) {} }
            byte[] b = versionJson.getBytes(); x.sendResponseHeaders(200, b.length); x.getResponseBody().write(b); x.close(); });
        srv.createContext("/starring-me/index.html", x -> {
            byte[] b = indexBody; x.sendResponseHeaders(200, b.length);
            try { OutputStream o = x.getResponseBody();
                for (int i = 0; i < b.length; i += 20000) { o.write(b, i, Math.min(20000, b.length - i)); o.flush(); if (mode == 2) Thread.sleep(150); }
            } catch (Exception e) {} x.close(); });
        srv.setExecutor(java.util.concurrent.Executors.newCachedThreadPool()); srv.start();
        String base = "http://127.0.0.1:" + srv.getAddress().getPort() + "/starring-me/";
        Path tmp = Files.createTempDirectory("sm");
        File root = new File(tmp.toFile(), "update");
        UpdateStore st = new UpdateStore(root, base, 800);

        // 1 no update: remote build == bundled
        versionJson = vj(1, sha(BODY1));
        try { st.download(1, null, new AtomicBoolean()); ok(false, "no update: should refuse"); } catch (UpdateStore.UpdateException e) { ok(e.code.equals("not_newer"), "no update -> not_newer"); }
        ok(st.check().build == 1, "check reads version.json");
        ok(st.chooseAtLaunch(1) == null, "no stored copy -> bundled");

        // 2 newer build installs, launch picks it
        versionJson = vj(2, sha(BODY1));
        UpdateStore.Info r = st.download(1, null, new AtomicBoolean());
        ok(r.build == 2 && new File(r.dir, "index.html").length() == BODY1.length, "newer build downloaded and saved");
        UpdateStore.Info c = st.chooseAtLaunch(1);
        ok(c != null && c.build == 2 && c.dir.equals(r.dir), "launch uses stored copy when build > bundled");
        ok(st.chooseAtLaunch(2) == null && st.chooseAtLaunch(5) == null, "launch ignores stored copy when build <= bundled");
        ok(!new File(root, "tmp").exists(), "no temp files left behind");

        // 3 hash mismatch rejected, good copy intact
        byte[] bad = ("<html>tampered " + "y".repeat(1000) + "</html>").getBytes();
        versionJson = vj(3, sha(BODY1)); indexBody = bad;
        try { st.download(2, null, new AtomicBoolean()); ok(false, "hash mismatch must fail"); } catch (UpdateStore.UpdateException e) { ok(e.code.equals("hash_mismatch"), "hash mismatch rejected"); }
        c = st.chooseAtLaunch(1);
        ok(c != null && c.build == 2 && !new File(root, "b3").exists(), "good copy (build 2) untouched after failed download");

        // 4 offline: nothing listening
        UpdateStore off = new UpdateStore(root, "http://127.0.0.1:1/starring-me/", 800);
        try { off.check(); ok(false, "offline check should fail"); } catch (UpdateStore.UpdateException e) { ok(e.code.equals("offline"), "offline -> offline"); }
        try { off.download(2, null, new AtomicBoolean()); ok(false, "offline download should fail"); } catch (UpdateStore.UpdateException e) { ok(e.code.equals("offline"), "offline download -> offline, stored copy kept: " + (st.chooseAtLaunch(1) != null)); }

        // 5 timeout: server stalls longer than the limit
        mode = 1; indexBody = BODY1; versionJson = vj(3, sha(BODY1));
        long t0 = System.currentTimeMillis();
        try { st.check(); ok(false, "timeout should fail"); } catch (UpdateStore.UpdateException e) { ok(e.code.equals("offline") && System.currentTimeMillis() - t0 < 2500, "stalled server -> offline within the timeout (" + (System.currentTimeMillis() - t0) + " ms)"); }
        mode = 0;

        // 6 cancel mid-download
        mode = 2; AtomicBoolean cancel = new AtomicBoolean(); AtomicLong seen = new AtomicLong();
        try { st.download(2, (g, t) -> { seen.set(g); if (g > 100000) cancel.set(true); }, cancel); ok(false, "cancel should throw"); }
        catch (UpdateStore.UpdateException e) { ok(e.code.equals("cancelled") && seen.get() > 0 && seen.get() < BODY1.length, "cancel mid-download -> cancelled at " + seen.get() + " of " + BODY1.length); }
        mode = 0;
        ok(!new File(root, "b3").exists() && !new File(root, "tmp").exists() && st.chooseAtLaunch(1).build == 2, "cancel leaves nothing partial and keeps build 2");

        // 7 progress totals
        AtomicLong tot = new AtomicLong();
        st.download(2, (g, t) -> tot.set(t), new AtomicBoolean());
        ok(tot.get() == BODY1.length, "progress reports total size");
        c = st.chooseAtLaunch(1); ok(c != null && c.build == 3, "build 3 installed after good retry");
        st.cleanup(c);
        ok(!new File(root, "b2").exists() && new File(root, "b3").exists(), "cleanup removes superseded copy");

        // 8 corrupt stored file falls back to bundled, silently
        Files.write(new File(root, "b3/index.html").toPath(), "corrupt".getBytes());
        ok(st.chooseAtLaunch(1) == null, "corrupt stored file -> bundled");
        Files.delete(new File(root, "b3/index.html").toPath());
        ok(st.chooseAtLaunch(1) == null, "missing stored file -> bundled");
        Files.write(new File(root, "current.json").toPath(), "{not json".getBytes());
        ok(st.chooseAtLaunch(1) == null, "corrupt pointer -> bundled");
        st.cleanup(null); ok(new File(root, "current.json").exists() && !new File(root, "b3").exists(), "cleanup tidies dead copy");
        Files.delete(new File(root, "current.json").toPath());
        ok(st.chooseAtLaunch(1) == null, "missing pointer -> bundled");

        // 9 bad manifests
        for (String bj : new String[]{"nonsense", "{\"version\":\"1\",\"build\":2,\"file\":\"../evil.html\",\"sha256\":\"" + sha(BODY1) + "\"}", "{\"version\":\"1\",\"build\":2,\"file\":\"index.html\",\"sha256\":\"abc\"}", "{\"version\":\"1\",\"build\":\"x\",\"file\":\"index.html\",\"sha256\":\"" + sha(BODY1) + "\"}"}) {
            versionJson = bj;
            try { st.check(); ok(false, "bad manifest accepted: " + bj); } catch (UpdateStore.UpdateException e) { ok(e.code.equals("bad_data"), "bad manifest rejected: " + bj.substring(0, Math.min(30, bj.length()))); }
        }
        // 10 failed update never replaces a good copy
        versionJson = vj(4, sha(BODY1)); indexBody = BODY1;
        st.download(1, null, new AtomicBoolean());
        indexBody = bad; versionJson = vj(5, sha(BODY1));
        try { st.download(4, null, new AtomicBoolean()); } catch (UpdateStore.UpdateException e) {}
        c = st.chooseAtLaunch(1); ok(c != null && c.build == 4, "after failed build 5, build 4 still active");
        srv.stop(0);
        System.out.println("checks " + checks + " failures " + fails);
        System.exit(fails == 0 ? 0 : 1);
    }
}
