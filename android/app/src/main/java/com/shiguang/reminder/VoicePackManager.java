package com.shiguang.reminder;

import android.content.Context;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedInputStream;
import java.io.BufferedOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import java.util.Locale;

/** Stores optional voice packs in the app private directory and exposes status to the web UI. */
public final class VoicePackManager {
    private static final String ROOT = "voice_packs";
    private VoicePackManager() {}

    public static File root(Context context) {
        File f = new File(context.getFilesDir(), ROOT);
        if (!f.exists()) f.mkdirs();
        return f;
    }

    public static File packDir(Context context, String id) {
        return new File(root(context), safeId(id));
    }

    public static boolean isInstalled(Context context, String id) {
        if ("aishell3-campus".equals(id)) return true;
        return new File(packDir(context, id), "installed.json").isFile();
    }

    public static void delete(Context context, String id) {
        if ("aishell3-campus".equals(id)) return;
        deleteTree(packDir(context, id));
    }

    public static JSONObject list(Context context) throws Exception {
        String text;
        try (InputStream in = context.getAssets().open("offline_tts/voice-packs.json")) {
            byte[] bytes = new byte[in.available()];
            int read = in.read(bytes);
            text = new String(bytes, 0, read, java.nio.charset.StandardCharsets.UTF_8);
        }
        JSONObject catalog = new JSONObject(text);
        JSONArray packs = catalog.getJSONArray("packs");
        for (int i = 0; i < packs.length(); i++) {
            JSONObject p = packs.getJSONObject(i);
            p.put("installed", isInstalled(context, p.getString("id")));
            File marker = new File(packDir(context, p.getString("id")), "installed.json");
            if (marker.exists()) p.put("installedBytes", directorySize(packDir(context, p.getString("id"))));
        }
        return catalog;
    }

    public static File download(Context context, String id, String url, String expectedSha256) throws Exception {
        return download(context, id, url, expectedSha256, null);
    }

    public interface ProgressCb { void onProgress(String phase, long received, long total); }

    // 主源失败自动换镜像（gh-proxy / 直连 github / ghfast / ghproxy.net）
    public static java.util.List<String> mirrorCandidates(String url) {
        java.util.List<String> list = new java.util.ArrayList<>();
        if (url == null || url.isEmpty()) return list;
        list.add(url);
        String gh = url;
        String[] proxies = {"https://gh-proxy.com/", "https://ghfast.top/", "https://ghproxy.net/", "https://mirror.ghproxy.com/"};
        for (String p : proxies) { if (url.startsWith(p)) { gh = url.substring(p.length()); break; } }
        if (!gh.equals(url)) {
            list.add(gh);
            list.add("https://ghfast.top/" + gh);
            list.add("https://ghproxy.net/" + gh);
        } else {
            list.add("https://gh-proxy.com/" + gh);
            list.add("https://ghfast.top/" + gh);
            list.add("https://ghproxy.net/" + gh);
        }
        return list;
    }

    public static File download(Context context, String id, String url, String expectedSha256, ProgressCb cb) throws Exception {
        Exception last = null;
        for (String u : mirrorCandidates(url)) {
            try {
                if (cb != null) cb.onProgress("try", 0, 0);
                return downloadOne(context, id, u, expectedSha256, cb);
            } catch (Exception ex) { last = ex; }
        }
        throw (last != null) ? last : new IllegalStateException("download failed: no mirror");
    }

    private static File downloadOne(Context context, String id, String url, String expectedSha256, ProgressCb cb) throws Exception {
        File dir = packDir(context, id);
        if (!dir.exists() && !dir.mkdirs()) throw new IllegalStateException("Cannot create pack directory");
        File temp = new File(dir, "download.tmp");
        HttpURLConnection conn = (HttpURLConnection) new URL(url).openConnection();
        conn.setConnectTimeout(30000);
        conn.setReadTimeout(300000);
        conn.setInstanceFollowRedirects(true);
        conn.setRequestProperty("User-Agent", "Shiguang-Android/1.0");
        int code = conn.getResponseCode();
        if (code < 200 || code >= 300) { conn.disconnect(); throw new IllegalStateException("HTTP " + code); }
        long total = conn.getContentLength();
        try (InputStream in = new BufferedInputStream(conn.getInputStream()); FileOutputStream out = new FileOutputStream(temp)) {
            byte[] buf = new byte[1024 * 1024];
            int n;
            long received = 0; int lastPct = -1;
            while ((n = in.read(buf)) > 0) {
                out.write(buf, 0, n);
                received += n;
                if (cb != null && total > 0) {
                    int pct = (int) Math.min(99, received * 100 / total);
                    if (pct != lastPct && (pct - lastPct >= 2 || pct >= 99)) { lastPct = pct; cb.onProgress("download", received, total); }
                }
            }
            out.getFD().sync();
        } finally { conn.disconnect(); }
        if (expectedSha256 != null && !expectedSha256.isEmpty()) {
            String actual = sha256(temp);
            if (!actual.equalsIgnoreCase(expectedSha256)) { temp.delete(); throw new SecurityException("SHA-256 mismatch"); }
        }
        return temp;
    }

    public static void installGenericPack(Context context, String id, String engine, File archive, String keyFile) throws Exception {
        File dir = packDir(context, id);
        File extracted = new File(dir, "model");
        deleteTree(extracted);
        if (!extracted.mkdirs()) throw new IllegalStateException("Cannot create model directory");
        extractTarBz2(archive, extracted);
        File key = findFile(extracted, keyFile);
        if (key == null) throw new IllegalStateException("Key model file missing: " + keyFile);
        File modelDir = key.getParentFile();
        JSONObject marker = new JSONObject();
        marker.put("id", id); marker.put("engine", engine); marker.put("version", 1);
        marker.put("modelDir", modelDir.getAbsolutePath()); marker.put("installedAt", System.currentTimeMillis());
        markInstalled(context, id, marker);
        archive.delete();
    }

    public static void installMatchaPack(Context context, String id, File archive, File vocoder) throws Exception {
        File dir = packDir(context, id);
        File extracted = new File(dir, "model");
        deleteTree(extracted);
        if (!extracted.mkdirs()) throw new IllegalStateException("Cannot create model directory");
        extractTarBz2(archive, extracted);
        File root = findFile(extracted, "model-steps-3.onnx");
        if (root == null) throw new IllegalStateException("Acoustic model missing");
        File modelDir = root.getParentFile();
        copyFile(vocoder, new File(modelDir, "vocos-22khz-univ.onnx"));
        String[] required = {"model-steps-3.onnx", "vocos-22khz-univ.onnx", "tokens.txt", "lexicon.txt"};
        for (String name : required) if (!new File(modelDir, name).isFile()) throw new IllegalStateException("Missing " + name);
        JSONObject marker = new JSONObject();
        marker.put("id", id); marker.put("engine", "matcha"); marker.put("version", 1);
        marker.put("modelDir", modelDir.getAbsolutePath()); marker.put("installedAt", System.currentTimeMillis());
        markInstalled(context, id, marker);
        archive.delete();
    }

    public static void markInstalled(Context context, String id, JSONObject metadata) throws Exception {
        File marker = new File(packDir(context, id), "installed.json");
        try (FileOutputStream out = new FileOutputStream(marker)) {
            out.write(metadata.toString(2).getBytes(java.nio.charset.StandardCharsets.UTF_8));
        }
    }

    private static void extractTarBz2(File archive, File outDir) throws Exception {
        Process process = new ProcessBuilder("/system/bin/toybox", "tar", "-xjf", archive.getAbsolutePath(), "-C", outDir.getAbsolutePath())
                .redirectErrorStream(true).start();
        try (InputStream in = process.getInputStream()) { byte[] b = new byte[8192]; while (in.read(b) >= 0) {} }
        int code = process.waitFor();
        if (code != 0) throw new IllegalStateException("Archive extraction failed: " + code);
    }

    private static File findFile(File root, String name) {
        if (root == null || !root.exists()) return null;
        if (root.isFile()) return root.getName().equals(name) ? root : null;
        File[] children = root.listFiles();
        if (children != null) for (File child : children) { File f = findFile(child, name); if (f != null) return f; }
        return null;
    }

    private static void copyFile(File from, File to) throws Exception {
        try (InputStream in = new FileInputStream(from); BufferedOutputStream out = new BufferedOutputStream(new FileOutputStream(to))) {
            byte[] b = new byte[1024 * 1024]; int n; while ((n = in.read(b)) > 0) out.write(b, 0, n);
        }
    }

    private static String sha256(File file) throws Exception {
        MessageDigest md = MessageDigest.getInstance("SHA-256");
        try (InputStream in = new FileInputStream(file)) {
            byte[] buf = new byte[1024 * 1024]; int n;
            while ((n = in.read(buf)) > 0) md.update(buf, 0, n);
        }
        StringBuilder b = new StringBuilder();
        for (byte v : md.digest()) b.append(String.format(Locale.ROOT, "%02x", v));
        return b.toString();
    }

    private static String safeId(String id) {
        if (id == null || !id.matches("[a-zA-Z0-9._-]+")) throw new IllegalArgumentException("Invalid pack id");
        return id;
    }
    private static void deleteTree(File f) {
        if (f == null || !f.exists()) return;
        if (f.isDirectory()) { File[] children = f.listFiles(); if (children != null) for (File c : children) deleteTree(c); }
        f.delete();
    }
    private static long directorySize(File f) {
        if (f == null || !f.exists()) return 0;
        if (f.isFile()) return f.length();
        long n = 0; File[] children = f.listFiles(); if (children != null) for (File c : children) n += directorySize(c);
        return n;
    }
}
