package cn.fundassistant.mobile;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.view.Window;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import com.google.mlkit.vision.common.InputImage;
import com.google.mlkit.vision.text.TextRecognition;
import com.google.mlkit.vision.text.TextRecognizer;
import com.google.mlkit.vision.text.chinese.ChineseTextRecognizerOptions;

import org.json.JSONObject;

import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;

public class MainActivity extends Activity {
    private static final int FILE_CHOOSER_REQUEST = 1001;
    private WebView webView;
    private ValueCallback<Uri[]> filePathCallback;
    private Uri selectedImageUri;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Window window = getWindow();
        window.getDecorView().setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_LAYOUT_STABLE | View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR
        );

        webView = new WebView(this);
        setContentView(webView);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setAllowFileAccessFromFileURLs(true);
        settings.setAllowUniversalAccessFromFileURLs(true);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);

        webView.addJavascriptInterface(new OcrBridge(), "AndroidOCR");

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(
                    WebView view,
                    ValueCallback<Uri[]> filePathCallback,
                    FileChooserParams fileChooserParams
            ) {
                if (MainActivity.this.filePathCallback != null) {
                    MainActivity.this.filePathCallback.onReceiveValue(null);
                }
                MainActivity.this.filePathCallback = filePathCallback;

                Intent intent = fileChooserParams.createIntent();
                intent.setType("image/*");
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                try {
                    startActivityForResult(intent, FILE_CHOOSER_REQUEST);
                } catch (Exception ignored) {
                    MainActivity.this.filePathCallback = null;
                    return false;
                }
                return true;
            }
        });

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if ("file".equals(uri.getScheme())) {
                    return false;
                }
                Intent intent = new Intent(Intent.ACTION_VIEW, uri);
                startActivity(intent);
                return true;
            }
        });
        webView.loadUrl("file:///android_asset/index.html");
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != FILE_CHOOSER_REQUEST || filePathCallback == null) {
            return;
        }
        Uri[] results = null;
        if (resultCode == RESULT_OK && data != null) {
            Uri uri = data.getData();
            if (uri != null) {
                selectedImageUri = uri;
                grantImageReadPermission(data, uri);
                results = new Uri[]{uri};
            }
        }
        filePathCallback.onReceiveValue(results);
        filePathCallback = null;
    }

    private void grantImageReadPermission(Intent data, Uri uri) {
        try {
            final int flags = data.getFlags() & Intent.FLAG_GRANT_READ_URI_PERMISSION;
            if (flags != 0) {
                getContentResolver().takePersistableUriPermission(uri, flags);
            }
        } catch (Exception ignored) {
            // Some pickers grant temporary read access only. It is still valid while the app is active.
        }
    }

    private void recognizeSelectedImage() {
        if (selectedImageUri == null) {
            sendOcrResult("", "请先选择支付宝持仓截图，再点击识别截图。");
            return;
        }
        sendOcrStatus("正在裁剪支付宝长截图，准备分段识别。");
        try {
            List<Bitmap> segments = buildOcrSegments(selectedImageUri);
            if (segments.isEmpty()) {
                sendOcrResult("", "图片裁剪失败，请重新选择截图。");
                return;
            }
            TextRecognizer recognizer = TextRecognition.getClient(
                    new ChineseTextRecognizerOptions.Builder().build()
            );
            processOcrSegment(recognizer, segments, 0, new StringBuilder());
        } catch (Exception error) {
            sendOcrResult("", "图片读取失败：" + error.getMessage());
        }
    }

    private Bitmap loadBitmapFromUri(Uri uri) throws Exception {
        try (InputStream stream = getContentResolver().openInputStream(uri)) {
            if (stream == null) return null;
            return BitmapFactory.decodeStream(stream);
        }
    }

    private List<Bitmap> buildOcrSegments(Uri uri) throws Exception {
        Bitmap source = loadBitmapFromUri(uri);
        List<Bitmap> segments = new ArrayList<>();
        if (source == null) return segments;

        int width = source.getWidth();
        int height = source.getHeight();
        if (width <= 0 || height <= 0) return segments;

        int topCrop = Math.min(Math.max((int) (height * 0.15f), 180), Math.max(0, height - 1));
        int bottomCrop = Math.min(Math.max((int) (height * 0.07f), 120), Math.max(0, height - topCrop - 1));
        int usableBottom = Math.max(topCrop + 1, height - bottomCrop);
        int chunkHeight = Math.min(1100, Math.max(620, (int) (width * 2.45f)));
        int overlap = Math.min(100, Math.max(50, chunkHeight / 10));
        int step = Math.max(260, chunkHeight - overlap);
        int targetWidth = width < 900 ? Math.min(1280, width * 2) : width;

        for (int y = topCrop; y < usableBottom; y += step) {
            int cropHeight = Math.min(chunkHeight, usableBottom - y);
            if (cropHeight < 160) break;
            Bitmap crop = Bitmap.createBitmap(source, 0, y, width, cropHeight);
            if (targetWidth > width) {
                int targetHeight = Math.max(1, Math.round(cropHeight * (targetWidth / (float) width)));
                Bitmap scaled = Bitmap.createScaledBitmap(crop, targetWidth, targetHeight, true);
                crop.recycle();
                segments.add(scaled);
            } else {
                segments.add(crop);
            }
        }

        source.recycle();
        return segments;
    }

    private void processOcrSegment(
            TextRecognizer recognizer,
            List<Bitmap> segments,
            int index,
            StringBuilder output
    ) {
        if (index >= segments.size()) {
            recycleSegments(segments);
            recognizer.close();
            sendOcrResult(output.toString(), "");
            return;
        }

        sendOcrStatus("原生 OCR：正在识别长截图第 " + (index + 1) + "/" + segments.size() + " 段");
        InputImage image = InputImage.fromBitmap(segments.get(index), 0);
        recognizer.process(image)
                .addOnSuccessListener(text -> {
                    output.append('\n').append(text.getText());
                    processOcrSegment(recognizer, segments, index + 1, output);
                })
                .addOnFailureListener(error -> {
                    recycleSegments(segments);
                    recognizer.close();
                    sendOcrResult("", "原生 OCR 第 " + (index + 1) + " 段识别失败：" + error.getMessage());
                });
    }

    private void recycleSegments(List<Bitmap> segments) {
        for (Bitmap bitmap : segments) {
            if (bitmap != null && !bitmap.isRecycled()) {
                bitmap.recycle();
            }
        }
    }

    private void sendOcrStatus(String status) {
        runOnUiThread(() -> {
            if (webView == null) return;
            String js = "window.receiveNativeOcrStatus && window.receiveNativeOcrStatus("
                    + JSONObject.quote(status) + ")";
            webView.evaluateJavascript(js, null);
        });
    }

    private void sendOcrResult(String text, String error) {
        runOnUiThread(() -> {
            if (webView == null) return;
            String js = "window.receiveNativeOcr && window.receiveNativeOcr("
                    + JSONObject.quote(text == null ? "" : text) + ","
                    + JSONObject.quote(error == null ? "" : error) + ")";
            webView.evaluateJavascript(js, null);
        });
    }

    private class OcrBridge {
        @JavascriptInterface
        public void recognizeSelectedImage() {
            runOnUiThread(MainActivity.this::recognizeSelectedImage);
        }
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
            return;
        }
        super.onBackPressed();
    }
}
