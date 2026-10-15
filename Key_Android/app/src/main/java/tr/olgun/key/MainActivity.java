package tr.olgun.key;

import android.Manifest;
import android.app.Activity;
import android.content.ContentValues;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintManager;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.annotation.NonNull;

import com.google.mlkit.vision.common.InputImage;
import com.google.mlkit.vision.text.TextRecognition;
import com.google.mlkit.vision.text.TextRecognizer;
import com.google.mlkit.vision.text.latin.TextRecognizerOptions;

import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class MainActivity extends Activity {
    private static final int PICK_FILE = 42;
    private static final int REQUEST_STORAGE = 43;
    private static final int MAX_INPUT_BYTES = 12 * 1024 * 1024;

    private WebView web;
    private ValueCallback<Uri[]> uploadCallback;
    private final ExecutorService background = Executors.newFixedThreadPool(2);
    private PendingDownload pendingPermissionDownload;

    @Override
    public void onCreate(Bundle state) {
        super.onCreate(state);
        web = new WebView(this);
        web.getSettings().setJavaScriptEnabled(true);
        web.getSettings().setDomStorageEnabled(true);
        web.getSettings().setAllowFileAccess(true);
        web.setWebViewClient(new WebViewClient());
        web.addJavascriptInterface(new AppBridge(), "KeyAndroid");
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (uploadCallback != null) uploadCallback.onReceiveValue(null);
                uploadCallback = callback;
                Intent intent = params.createIntent();
                try {
                    startActivityForResult(intent, PICK_FILE);
                } catch (Exception e) {
                    uploadCallback.onReceiveValue(null);
                    uploadCallback = null;
                    return false;
                }
                return true;
            }
        });
        setContentView(web);
        web.loadUrl("file:///android_asset/index.html");
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == PICK_FILE && uploadCallback != null) {
            Uri[] results = WebChromeClient.FileChooserParams.parseResult(resultCode, data);
            uploadCallback.onReceiveValue(results);
            uploadCallback = null;
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, @NonNull String[] permissions, @NonNull int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == REQUEST_STORAGE) {
            PendingDownload item = pendingPermissionDownload;
            pendingPermissionDownload = null;
            if (item == null) return;
            if (grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
                writeDownload(item);
            } else {
                notifySave(item.requestId, false, "İndirme için depolama izni verilmedi.");
            }
        }
    }

    @Override
    public void onBackPressed() {
        if (web != null && web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onDestroy() {
        if (uploadCallback != null) {
            uploadCallback.onReceiveValue(null);
            uploadCallback = null;
        }
        background.shutdownNow();
        if (web != null) {
            web.removeJavascriptInterface("KeyAndroid");
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }

    public final class AppBridge {
        @JavascriptInterface
        public void recognizeText(String dataUrl, String requestId) {
            background.execute(() -> {
                Bitmap bitmap = null;
                TextRecognizer recognizer = null;
                try {
                    byte[] bytes = decodeDataUrl(dataUrl);
                    bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.length);
                    if (bitmap == null) throw new IllegalArgumentException("Görsel biçimi okunamadı.");
                    InputImage image = InputImage.fromBitmap(bitmap, 0);
                    recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS);
                    Bitmap finalBitmap = bitmap;
                    TextRecognizer finalRecognizer = recognizer;
                    recognizer.process(image)
                            .addOnSuccessListener(result -> notifyOcr(requestId, result.getText(), null))
                            .addOnFailureListener(error -> notifyOcr(requestId, "", "Metin tanıma başarısız oldu."))
                            .addOnCompleteListener(task -> {
                                finalRecognizer.close();
                                if (!finalBitmap.isRecycled()) finalBitmap.recycle();
                            });
                } catch (Exception error) {
                    if (recognizer != null) recognizer.close();
                    if (bitmap != null && !bitmap.isRecycled()) bitmap.recycle();
                    notifyOcr(requestId, "", error.getMessage() == null ? "Görsel işlenemedi." : error.getMessage());
                }
            });
        }

        @JavascriptInterface
        public void saveFile(String dataUrl, String fileName, String mimeType, String requestId) {
            background.execute(() -> {
                try {
                    byte[] bytes = decodeDataUrl(dataUrl);
                    String safeName = safeFileName(fileName);
                    PendingDownload item = new PendingDownload(bytes, safeName, mimeType, requestId);
                    runOnUiThread(() -> prepareDownload(item));
                } catch (Exception error) {
                    notifySave(requestId, false, "Dosya indirilemedi: " + (error.getMessage() == null ? "geçersiz veri" : error.getMessage()));
                }
            });
        }

        @JavascriptInterface
        public void printPage() {
            runOnUiThread(() -> {
                if (web == null) return;
                PrintManager manager = (PrintManager) getSystemService(PRINT_SERVICE);
                if (manager == null) {
                    notifyUi("Yazdırma hizmeti kullanılamıyor.");
                    return;
                }
                PrintDocumentAdapter adapter = web.createPrintDocumentAdapter("Key - Kriptografi");
                manager.print("Key - Kriptografi", adapter,
                        new PrintAttributes.Builder().setMediaSize(PrintAttributes.MediaSize.ISO_A4).build());
            });
        }

        @JavascriptInterface
        public void exit() {
            runOnUiThread(MainActivity.this::finish);
        }
    }

    private void prepareDownload(PendingDownload item) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q
                && checkSelfPermission(Manifest.permission.WRITE_EXTERNAL_STORAGE) != PackageManager.PERMISSION_GRANTED) {
            pendingPermissionDownload = item;
            requestPermissions(new String[]{Manifest.permission.WRITE_EXTERNAL_STORAGE}, REQUEST_STORAGE);
            return;
        }
        writeDownload(item);
    }

    private void writeDownload(PendingDownload item) {
        background.execute(() -> {
            Uri inserted = null;
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    ContentValues values = new ContentValues();
                    values.put(MediaStore.MediaColumns.DISPLAY_NAME, item.fileName);
                    values.put(MediaStore.MediaColumns.MIME_TYPE, safeMime(item.mimeType));
                    values.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/Key");
                    values.put(MediaStore.MediaColumns.IS_PENDING, 1);
                    inserted = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
                    if (inserted == null) throw new IllegalStateException("İndirme klasörü açılamadı.");
                    try (OutputStream stream = getContentResolver().openOutputStream(inserted)) {
                        if (stream == null) throw new IllegalStateException("Dosya yazılamadı.");
                        stream.write(item.bytes);
                    }
                    ContentValues ready = new ContentValues();
                    ready.put(MediaStore.MediaColumns.IS_PENDING, 0);
                    getContentResolver().update(inserted, ready, null, null);
                } else {
                    File directory = new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS), "Key");
                    if (!directory.exists() && !directory.mkdirs()) throw new IllegalStateException("İndirme klasörü oluşturulamadı.");
                    File output = new File(directory, item.fileName);
                    try (FileOutputStream stream = new FileOutputStream(output)) {
                        stream.write(item.bytes);
                    }
                    android.media.MediaScannerConnection.scanFile(this,
                            new String[]{output.getAbsolutePath()}, new String[]{safeMime(item.mimeType)}, null);
                }
                notifySave(item.requestId, true, "Dosya indirildi: Downloads/Key/" + item.fileName);
            } catch (Exception error) {
                if (inserted != null) getContentResolver().delete(inserted, null, null);
                notifySave(item.requestId, false, "Dosya indirilemedi: " + (error.getMessage() == null ? "yazma hatası" : error.getMessage()));
            }
        });
    }

    private byte[] decodeDataUrl(String dataUrl) {
        if (dataUrl == null) throw new IllegalArgumentException("Dosya verisi boş.");
        int comma = dataUrl.indexOf(',');
        if (comma < 0 || !dataUrl.substring(0, comma).contains(";base64")) {
            throw new IllegalArgumentException("Dosya biçimi geçersiz.");
        }
        String encoded = dataUrl.substring(comma + 1);
        if (encoded.length() > ((MAX_INPUT_BYTES + 2L) / 3L) * 4L + 16) {
            throw new IllegalArgumentException("Dosya boyutu sınırı aşıldı.");
        }
        byte[] bytes = android.util.Base64.decode(encoded, android.util.Base64.DEFAULT);
        if (bytes.length > MAX_INPUT_BYTES) throw new IllegalArgumentException("Dosya boyutu sınırı aşıldı.");
        return bytes;
    }

    private String safeFileName(String name) {
        String value = name == null ? "Key_dosya.bin" : name;
        value = value.replaceAll("[\\\\/:*?\"<>|\\p{Cntrl}]", "_").trim();
        if (value.isEmpty() || value.equals(".") || value.equals("..")) value = "Key_dosya.bin";
        return value.length() > 120 ? value.substring(value.length() - 120) : value;
    }

    private String safeMime(String value) {
        return value == null || value.trim().isEmpty() ? "application/octet-stream" : value;
    }

    private void notifyOcr(String requestId, String text, String error) {
        runOnUiThread(() -> {
            if (web == null) return;
            String script = "window.onNativeOcrResult&&window.onNativeOcrResult("
                    + JSONObject.quote(requestId) + "," + JSONObject.quote(text == null ? "" : text) + ","
                    + (error == null ? "null" : JSONObject.quote(error)) + ");";
            web.evaluateJavascript(script, null);
        });
    }

    private void notifySave(String requestId, boolean success, String message) {
        runOnUiThread(() -> {
            if (web == null) return;
            String script = "window.onNativeSaveResult&&window.onNativeSaveResult("
                    + JSONObject.quote(requestId) + "," + success + "," + JSONObject.quote(message) + ");";
            web.evaluateJavascript(script, null);
        });
    }

    private void notifyUi(String message) {
        android.widget.Toast.makeText(this, message, android.widget.Toast.LENGTH_LONG).show();
    }

    private static final class PendingDownload {
        final byte[] bytes;
        final String fileName;
        final String mimeType;
        final String requestId;

        PendingDownload(byte[] bytes, String fileName, String mimeType, String requestId) {
            this.bytes = bytes;
            this.fileName = fileName;
            this.mimeType = mimeType;
            this.requestId = requestId;
        }
    }
}
