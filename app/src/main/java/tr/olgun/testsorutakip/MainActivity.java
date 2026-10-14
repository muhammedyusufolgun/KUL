package tr.olgun.testsorutakip;

import android.app.Activity;
import android.app.AlertDialog;
import org.json.JSONObject;
import java.io.InputStream;
import java.io.OutputStream;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import android.webkit.JsResult;
import android.os.Bundle;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import java.net.URLEncoder;

public final class MainActivity extends Activity {
    private static final int REQ_CREATE_BACKUP=6101, REQ_OPEN_BACKUP=6102, MAX_BACKUP_BYTES=4*1024*1024;
    private String pendingBackupJson;
    private WebView webView;
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().setStatusBarColor(Color.rgb(220,239,255));
        getWindow().setNavigationBarColor(Color.rgb(255,255,255));
        getWindow().getDecorView().setSystemUiVisibility(android.view.View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | android.view.View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);
        webView = new WebView(this);
        webView.setBackgroundColor(Color.rgb(240,247,255));
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(false);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        webView.setWebChromeClient(new WebChromeClient(){
            @Override public boolean onJsConfirm(WebView view,String url,String message,JsResult result){
                new AlertDialog.Builder(MainActivity.this)
                    .setTitle("Yedek yükleme onayı")
                    .setMessage(message)
                    .setPositiveButton("Yükle",(dialog,which)->result.confirm())
                    .setNegativeButton("İptal",(dialog,which)->result.cancel())
                    .setOnCancelListener(dialog->result.cancel())
                    .show();
                return true;
            }
        });
        webView.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, android.webkit.WebResourceRequest request) {
                if ("file".equalsIgnoreCase(request.getUrl().getScheme())) return false;
                try { startActivity(new Intent(Intent.ACTION_VIEW, request.getUrl())); } catch (Exception ignored) { }
                return true;
            }
        });
        webView.addJavascriptInterface(new JsBridge(), "AndroidBridge");
        setContentView(webView);
        webView.loadUrl("file:///android_asset/index.html");
    }
    private void notifyJs(String message){
        if(webView!=null)webView.evaluateJavascript("window.testSoruTakipBackupNotice("+JSONObject.quote(message)+");",null);
    }

    public class JsBridge {
        @JavascriptInterface public void saveBackupJson(String suggestedName,String json){
            if(json==null || json.getBytes(StandardCharsets.UTF_8).length>MAX_BACKUP_BYTES){
                runOnUiThread(()->notifyJs("Yedek boyutu geçersiz."));return;
            }
            final String name=(suggestedName!=null&&suggestedName.matches("Test_Soru_Takip_Yedek_[0-9]{4}-[0-9]{2}-[0-9]{2}\\.json"))
                ? suggestedName : "Test_Soru_Takip_Yedek.json";
            runOnUiThread(()->{
                pendingBackupJson=json;
                Intent intent=new Intent(Intent.ACTION_CREATE_DOCUMENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType("application/json");
                intent.putExtra(Intent.EXTRA_TITLE,name);
                try{startActivityForResult(intent,REQ_CREATE_BACKUP);}
                catch(Exception e){pendingBackupJson=null;notifyJs("Dosya kaydetme ekranı açılamadı.");}
            });
        }
        @JavascriptInterface public void openBackupPicker(){
            runOnUiThread(()->{
                Intent intent=new Intent(Intent.ACTION_OPEN_DOCUMENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType("*/*");
                intent.putExtra(Intent.EXTRA_MIME_TYPES,new String[]{"application/json","text/plain","application/octet-stream"});
                try{startActivityForResult(intent,REQ_OPEN_BACKUP);}
                catch(Exception e){notifyJs("Dosya seçme ekranı açılamadı.");}
            });
        }

        @JavascriptInterface public void shareWhatsApp(String number,String text){
            if(number==null||!number.matches("90[0-9]{10}")||text==null)return;
            final String encoded;
            try{encoded=URLEncoder.encode(text,"UTF-8");}
            catch(java.io.UnsupportedEncodingException e){return;}
            runOnUiThread(()->{
                Uri deepLink=Uri.parse("whatsapp://send?phone="+number+"&text="+encoded);
                Uri appLink=Uri.parse("https://wa.me/"+number+"?text="+encoded);
                String[] packages={"com.whatsapp","com.whatsapp.w4b"};
                for(String pkg:packages){
                    for(Uri uri:new Uri[]{deepLink,appLink}){
                        try{
                            Intent intent=new Intent(Intent.ACTION_VIEW,uri);
                            intent.setPackage(pkg);
                            startActivity(intent);
                            return;
                        }catch(android.content.ActivityNotFoundException ignored){}
                        catch(Exception ignored){}
                    }
                }
                notifyJs("WhatsApp uygulaması bulunamadı. Telefonunuza WhatsApp yükleyin.");
            });
        }

    }
    @Override protected void onActivityResult(int requestCode,int resultCode,Intent resultData){
        super.onActivityResult(requestCode,resultCode,resultData);
        if(requestCode==REQ_CREATE_BACKUP){
            String json=pendingBackupJson;pendingBackupJson=null;
            if(resultCode!=RESULT_OK||resultData==null||resultData.getData()==null){
                notifyJs("Yedek kaydetme iptal edildi.");return;
            }
            if(json==null){notifyJs("Yedek içeriği bulunamadı.");return;}
            try(OutputStream out=getContentResolver().openOutputStream(resultData.getData(),"w")){
                if(out==null)throw new Exception("null stream");
                out.write(json.getBytes(StandardCharsets.UTF_8));out.flush();
                notifyJs("Yedek başarıyla kaydedildi.");
            }catch(Exception e){notifyJs("Yedek kaydedilemedi.");}
            return;
        }
        if(requestCode==REQ_OPEN_BACKUP){
            if(resultCode!=RESULT_OK||resultData==null||resultData.getData()==null)return;
            try(InputStream in=getContentResolver().openInputStream(resultData.getData());
                ByteArrayOutputStream out=new ByteArrayOutputStream()){
                if(in==null)throw new Exception("null stream");
                byte[] buf=new byte[8192];int n,total=0;
                while((n=in.read(buf))!=-1){
                    total+=n;
                    if(total>MAX_BACKUP_BYTES){notifyJs("Yedek dosyası 4 MB'den büyük olamaz.");return;}
                    out.write(buf,0,n);
                }
                String content=out.toString(StandardCharsets.UTF_8.name());
                if(webView!=null)webView.evaluateJavascript("window.testSoruTakipOnBackupFile("+JSONObject.quote(content)+");",null);
            }catch(Exception e){notifyJs("Yedek dosyası okunamadı.");}
        }
    }
    @Override public void onBackPressed() {
        if (webView != null) {
            webView.evaluateJavascript("(function(){var x=document.getElementById('courseDetail');if(x&&!x.hidden){document.getElementById('backCourses').click();return true;}return false})()", value -> {
                if (!"true".equals(value)) MainActivity.super.onBackPressed();
            });
        } else super.onBackPressed();
    }
    @Override protected void onDestroy() {
        if (webView != null) { webView.destroy(); webView = null; }
        super.onDestroy();
    }
}
