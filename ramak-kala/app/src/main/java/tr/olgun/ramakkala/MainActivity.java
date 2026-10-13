package tr.olgun.ramakkala;

import android.app.Activity;
import android.content.ClipData;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;
import org.json.JSONObject;
import java.io.IOException;
import java.io.OutputStream;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public final class MainActivity extends Activity {
    private static final int PHOTO_REQUEST_CODE = 31207;
    private WebView webView;
    private ValueCallback<Uri[]> pendingPhotoCallback;
    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private boolean savingPdf;

    @Override protected void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().setStatusBarColor(0xff075985);
        getWindow().setNavigationBarColor(0xffe2eaf1);
        webView = new WebView(this);
        webView.setBackgroundColor(0xfff8fafc);
        webView.getSettings().setJavaScriptEnabled(true);
        webView.getSettings().setDomStorageEnabled(true);
        webView.getSettings().setAllowFileAccess(true);
        webView.getSettings().setAllowContentAccess(true);
        webView.getSettings().setAllowFileAccessFromFileURLs(false);
        webView.getSettings().setAllowUniversalAccessFromFileURLs(false);
        webView.getSettings().setJavaScriptCanOpenWindowsAutomatically(false);
        webView.getSettings().setSupportZoom(false);
        webView.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return !"file".equalsIgnoreCase(request.getUrl().getScheme());
            }
        });
        webView.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (pendingPhotoCallback != null) pendingPhotoCallback.onReceiveValue(null);
                pendingPhotoCallback = callback;
                Intent intent = new Intent(Intent.ACTION_GET_CONTENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType("image/*");
                intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, false);
                try {
                    startActivityForResult(Intent.createChooser(intent,"Olay fotoğrafını seçin"),PHOTO_REQUEST_CODE);
                    return true;
                } catch(Exception ex) {
                    pendingPhotoCallback = null;
                    callback.onReceiveValue(null);
                    toast("Fotoğraf seçicisi açılamadı: " + ex.getMessage());
                    return true;
                }
            }
        });
        webView.addJavascriptInterface(new PdfBridge(),"RamakKalaAndroid");
        setContentView(webView);
        webView.loadUrl("file:///android_asset/index.html");
    }

    @Override protected void onActivityResult(int requestCode,int resultCode,Intent data) {
        super.onActivityResult(requestCode,resultCode,data);
        if (requestCode != PHOTO_REQUEST_CODE) return;
        ValueCallback<Uri[]> callback=pendingPhotoCallback;
        pendingPhotoCallback=null;
        if(callback == null) return;
        Uri[] result=null;
        if(resultCode == RESULT_OK && data != null) {
            Uri uri=data.getData();
            if(uri==null && data.getClipData()!=null && data.getClipData().getItemCount()>0)
                uri=data.getClipData().getItemAt(0).getUri();
            if(uri!=null)result=new Uri[]{uri};
        }
        callback.onReceiveValue(result);
    }

    private final class PdfBridge {
        @JavascriptInterface public void savePdf(String base64Pdf,String suggestedFileName) {
            runOnUiThread(() -> {
                if(savingPdf) {notifyHtml(false,"PDF kaydetme işlemi devam ediyor."); return;}
                savingPdf=true;
                io.execute(() -> saveToDownloads(base64Pdf,suggestedFileName));
            });
        }
    }

    private void saveToDownloads(String base64Pdf,String suggestedFileName) {
        Uri created=null;
        try {
            if(base64Pdf == null || base64Pdf.length()>32000000)throw new IOException("PDF boyutu çok büyük.");
            byte[] pdf=Base64.decode(base64Pdf,Base64.DEFAULT);
            if(pdf.length<100||pdf[0]!='%'||pdf[1]!='P'||pdf[2]!='D'||pdf[3]!='F')
                throw new IOException("PDF içeriği geçerli değil.");
            String fileName=safeFilename(suggestedFileName);
            ContentResolver resolver=getContentResolver();
            ContentValues metadata=new ContentValues();
            metadata.put(MediaStore.MediaColumns.DISPLAY_NAME,fileName);
            metadata.put(MediaStore.MediaColumns.MIME_TYPE,"application/pdf");
            metadata.put(MediaStore.MediaColumns.RELATIVE_PATH,Environment.DIRECTORY_DOWNLOADS+"/Ramak-Kala");
            metadata.put(MediaStore.MediaColumns.IS_PENDING,1);
            created=resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI,metadata);
            if(created==null)throw new IOException("PDF kaydı açılamadı.");
            try(OutputStream out=resolver.openOutputStream(created,"w")){
                if(out==null)throw new IOException("PDF dosyasına yazılamadı.");
                out.write(pdf);
                out.flush();
            }
            ContentValues completed=new ContentValues();
            completed.put(MediaStore.MediaColumns.IS_PENDING,0);
            resolver.update(created,completed,null,null);
            Uri uri=created;
            runOnUiThread(() -> {
                savingPdf=false;
                notifyHtml(true,"PDF kaydedildi: İndirilenler/Ramak-Kala/"+fileName);
                sharePdf(uri,fileName);
            });
        } catch(Exception ex) {
            if(created!=null)try{getContentResolver().delete(created,null,null);}catch(Exception ignored){}
            String error="PDF kaydedilemedi: "+ex.getMessage();
            runOnUiThread(()->{savingPdf=false;notifyHtml(false,error);});
        }
    }

    private static String safeFilename(String filename){
        String name=filename==null?"":filename.trim();
        if(!name.matches("Ramak-kala_\\d{4}-\\d{2}-\\d{2}\\.pdf"))
            name=String.format(Locale.US,"Ramak-kala_%tF.pdf",new java.util.Date());
        return name;
    }

    private void sharePdf(Uri uri,String filename){
        try{
            Intent send=new Intent(Intent.ACTION_SEND);
            send.setType("application/pdf");
            send.putExtra(Intent.EXTRA_STREAM,uri);
            send.putExtra(Intent.EXTRA_SUBJECT,filename);
            send.setClipData(ClipData.newUri(getContentResolver(),filename,uri));
            send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            startActivity(Intent.createChooser(send,"Ramak Kala PDF paylaş"));
        }catch(Exception ex){toast("PDF kaydedildi; paylaşım menüsü açılamadı. Dosyalarım'dan paylaşabilirsiniz.");}
    }
    private void notifyHtml(boolean success,String text){
        if(webView!=null)webView.evaluateJavascript("window.ramakNativeResult && window.ramakNativeResult("+success+","+JSONObject.quote(text)+")",null);
        toast(text);
    }
    private void toast(String s){Toast.makeText(this,s,Toast.LENGTH_LONG).show();}
    @Override protected void onDestroy(){
        if(pendingPhotoCallback!=null){pendingPhotoCallback.onReceiveValue(null);pendingPhotoCallback=null;}
        io.shutdown();
        if(webView!=null){webView.removeJavascriptInterface("RamakKalaAndroid");webView.destroy();webView=null;}
        super.onDestroy();
    }
}
