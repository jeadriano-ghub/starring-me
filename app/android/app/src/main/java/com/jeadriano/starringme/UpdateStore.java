package com.jeadriano.starringme;

import java.io.*;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.security.MessageDigest;
import java.util.*;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Library updates for Starring Me. Plain Java (no Android classes) so it can be tested on the host.
 * Only ever talks to {base}version.json and {base}index.html.
 *
 * Disk layout under root:  b{build}/index.html   the downloaded library
 *                          current.json          pointer {build, version, sha256, dir}, replaced atomically
 * A copy is only used if it is listed in current.json, its file hashes to the recorded sha256 and its build is
 * higher than the bundled one. Anything else silently means "use the bundled copy".
 */
public class UpdateStore {
    public static final String BASE = "https://jeadriano-ghub.github.io/starring-me/";
    public static final int TIMEOUT_MS = 5000;
    static final long MAX_BYTES = 64L * 1024 * 1024;

    public static class UpdateException extends Exception {
        public final String code;   // offline | bad_data | hash_mismatch | cancelled | storage | not_newer
        public UpdateException(String code, String msg) { super(msg); this.code = code; }
    }
    public static class Info { public String version; public int build; public String sha256; public String dir; }
    public interface Progress { void on(long received, long total); }

    private final File root;
    private final String base;
    private final int timeoutMs;

    public UpdateStore(File root, String base, int timeoutMs) {
        this.root = root; this.base = base.endsWith("/") ? base : base + "/"; this.timeoutMs = timeoutMs;
    }
    public UpdateStore(File root) { this(root, BASE, TIMEOUT_MS); }

    // ---------- tiny flat-JSON reader (strings and integers only) ----------
    static Map<String, String> flatJson(String s) {
        Map<String, String> m = new HashMap<>();
        int i = s.indexOf('{'); if (i < 0) return m; i++;
        while (i < s.length()) {
            while (i < s.length() && " \t\r\n,".indexOf(s.charAt(i)) >= 0) i++;
            if (i >= s.length() || s.charAt(i) == '}') break;
            if (s.charAt(i) != '"') return new HashMap<>();
            int[] pos = {i}; String k = str(s, pos); i = pos[0];
            while (i < s.length() && " \t\r\n".indexOf(s.charAt(i)) >= 0) i++;
            if (i >= s.length() || s.charAt(i) != ':') return new HashMap<>();
            i++; while (i < s.length() && " \t\r\n".indexOf(s.charAt(i)) >= 0) i++;
            if (i >= s.length()) break;
            if (s.charAt(i) == '"') { pos[0] = i; m.put(k, str(s, pos)); i = pos[0]; }
            else { int j = i; while (j < s.length() && ",} \t\r\n".indexOf(s.charAt(j)) < 0) j++; m.put(k, s.substring(i, j)); i = j; }
        }
        return m;
    }
    private static String str(String s, int[] pos) {
        StringBuilder b = new StringBuilder(); int i = pos[0] + 1;
        while (i < s.length() && s.charAt(i) != '"') {
            char c = s.charAt(i++);
            if (c == '\\' && i < s.length()) { char n = s.charAt(i++); b.append(n == 'n' ? '\n' : n == 't' ? '\t' : n); } else b.append(c);
        }
        pos[0] = i + 1; return b.toString();
    }
    static Info parseInfo(Map<String, String> m) {
        try {
            Info r = new Info();
            r.version = m.get("version"); r.build = Integer.parseInt(m.get("build")); r.sha256 = m.get("sha256");
            String file = m.get("file");
            if (r.version == null || r.version.isEmpty() || r.version.length() > 32 || r.build < 1) return null;
            if (!"index.html".equals(file)) return null;
            if (r.sha256 == null || !r.sha256.matches("[0-9a-f]{64}")) return null;
            return r;
        } catch (Exception e) { return null; }
    }

    // ---------- launch ----------
    /** The downloaded copy to load at launch, or null for "use bundled". Never throws. */
    public Info chooseAtLaunch(int bundledBuild) {
        try {
            File ptr = new File(root, "current.json");
            if (!ptr.isFile()) return null;
            Map<String, String> m = flatJson(new String(Files.readAllBytes(ptr.toPath()), StandardCharsets.UTF_8));
            Info r = parseInfo(withFile(m));
            String dir = m.get("dir");
            if (r == null || dir == null || !dir.equals("b" + r.build)) return null;
            if (r.build <= bundledBuild) return null;
            File f = new File(new File(root, dir), "index.html");
            if (!f.isFile() || f.length() == 0 || !r.sha256.equals(sha256(f))) return null;
            r.dir = new File(root, dir).getAbsolutePath();
            return r;
        } catch (Throwable t) { return null; }
    }
    private static Map<String, String> withFile(Map<String, String> m) { m.put("file", "index.html"); return m; }

    /** Remove copies that are not the active one (called at launch, before anything is served). */
    public void cleanup(Info active) {
        try {
            File[] kids = root.listFiles(); if (kids == null) return;
            for (File k : kids) {
                String n = k.getName();
                boolean keep = n.equals("current.json") || (active != null && k.getAbsolutePath().equals(active.dir));
                if (!keep) deleteTree(k);
            }
        } catch (Throwable ignored) {}
    }

    // ---------- network ----------
    private HttpURLConnection open(String name) throws UpdateException {
        try {
            URL u = new URL(base + name);
            HttpURLConnection c = (HttpURLConnection) u.openConnection();
            c.setConnectTimeout(timeoutMs); c.setReadTimeout(timeoutMs);
            c.setUseCaches(false); c.setRequestProperty("Accept-Encoding", "identity");
            c.setRequestProperty("Cache-Control", "no-cache");
            c.connect();
            if (!c.getURL().getHost().equals(new URL(base).getHost())) { c.disconnect(); throw new UpdateException("bad_data", "redirected away"); }
            int code = c.getResponseCode();
            if (code != 200) { c.disconnect(); throw new UpdateException(code >= 500 || code == 404 ? "offline" : "bad_data", "HTTP " + code); }
            return c;
        } catch (UpdateException e) { throw e;
        } catch (IOException e) { throw new UpdateException("offline", String.valueOf(e.getMessage())); }
    }

    /** Fetch version.json. offline = no answer in time, bad_data = answer is not a valid manifest. */
    public Info check() throws UpdateException {
        HttpURLConnection c = open("version.json");
        try (InputStream in = c.getInputStream()) {
            ByteArrayOutputStream bo = new ByteArrayOutputStream(); byte[] buf = new byte[4096]; int n;
            while ((n = in.read(buf)) > 0) { bo.write(buf, 0, n); if (bo.size() > 65536) throw new UpdateException("bad_data", "too big"); }
            Info r = parseInfo(flatJson(bo.toString("UTF-8")));
            if (r == null) throw new UpdateException("bad_data", "bad version.json");
            return r;
        } catch (IOException e) { throw new UpdateException("offline", String.valueOf(e.getMessage()));
        } finally { c.disconnect(); }
    }

    /**
     * Download, verify and install the newest copy. Returns the installed Info, or throws; on any failure the
     * previously good copy is left exactly as it was.
     */
    public Info download(int activeBuild, Progress cb, AtomicBoolean cancel) throws UpdateException {
        Info r = check();
        if (r.build <= activeBuild) throw new UpdateException("not_newer", "already on build " + activeBuild);
        File tmpDir = new File(root, "tmp"); deleteTree(tmpDir);
        if (!tmpDir.mkdirs() && !tmpDir.isDirectory()) throw new UpdateException("storage", "cannot create tmp");
        File part = new File(tmpDir, "index.html.part");
        HttpURLConnection c = open("index.html");
        try {
            long total = c.getContentLengthLong(), got = 0;
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            try (InputStream in = c.getInputStream(); FileOutputStream out = new FileOutputStream(part)) {
                byte[] buf = new byte[16384]; int n;
                while ((n = in.read(buf)) > 0) {
                    if (cancel.get()) throw new UpdateException("cancelled", "cancelled");
                    out.write(buf, 0, n); md.update(buf, 0, n); got += n;
                    if (got > MAX_BYTES) throw new UpdateException("bad_data", "too big");
                    if (cb != null) cb.on(got, total);
                }
                out.getFD().sync();
            }
            if (cancel.get()) throw new UpdateException("cancelled", "cancelled");
            if (got == 0) throw new UpdateException("bad_data", "empty file");
            if (!hex(md.digest()).equals(r.sha256)) throw new UpdateException("hash_mismatch", "sha256 differs");
            File dir = new File(root, "b" + r.build); deleteTree(dir);
            if (!dir.mkdirs()) throw new UpdateException("storage", "cannot create " + dir);
            Files.move(part.toPath(), new File(dir, "index.html").toPath(), StandardCopyOption.ATOMIC_MOVE);
            String ptr = "{\"build\":" + r.build + ",\"version\":\"" + r.version.replaceAll("[^0-9A-Za-z._-]", "") + "\",\"sha256\":\"" + r.sha256 + "\",\"dir\":\"b" + r.build + "\"}";
            File pt = new File(root, "current.json.tmp");
            try (FileOutputStream o = new FileOutputStream(pt)) { o.write(ptr.getBytes(StandardCharsets.UTF_8)); o.getFD().sync(); }
            Files.move(pt.toPath(), new File(root, "current.json").toPath(), StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING);
            r.dir = dir.getAbsolutePath();
            return r;
        } catch (UpdateException e) { throw e;
        } catch (IOException e) {
            throw new UpdateException(e instanceof java.net.SocketTimeoutException || e instanceof java.net.UnknownHostException || e instanceof java.net.ConnectException || e instanceof java.net.SocketException || e instanceof java.io.EOFException ? "offline" : "storage", String.valueOf(e.getMessage()));
        } catch (Exception e) { throw new UpdateException("storage", String.valueOf(e.getMessage()));
        } finally { c.disconnect(); deleteTree(tmpDir); }
    }

    // ---------- helpers ----------
    public static String sha256(File f) throws Exception {
        MessageDigest md = MessageDigest.getInstance("SHA-256");
        try (InputStream in = new FileInputStream(f)) { byte[] b = new byte[16384]; int n; while ((n = in.read(b)) > 0) md.update(b, 0, n); }
        return hex(md.digest());
    }
    public static String hex(byte[] d) { StringBuilder s = new StringBuilder(); for (byte b : d) s.append(String.format("%02x", b)); return s.toString(); }
    static void deleteTree(File f) {
        File[] k = f.listFiles(); if (k != null) for (File x : k) deleteTree(x);
        f.delete();
    }
}
