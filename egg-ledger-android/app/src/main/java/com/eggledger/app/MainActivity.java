package com.eggledger.app;

import android.app.Activity;
import android.Manifest;
import android.content.ContentValues;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;
import android.net.Uri;
import android.os.Bundle;
import android.os.Build;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.WebView;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;
import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

public class MainActivity extends Activity {
  private static final int CREATE_CSV = 4001;
  private static final int OPEN_CSV = 4002;
  private static final int READ_FILES = 4003;
  private WebView webView;
  private EggLedgerDatabase database;
  private String pendingCsv;

  @Override public void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    database = new EggLedgerDatabase();
    webView = new WebView(this);
    WebSettings settings = webView.getSettings();
    settings.setJavaScriptEnabled(true);
    settings.setDomStorageEnabled(true);
    settings.setAllowFileAccess(true);
    settings.setAllowContentAccess(false);
    webView.addJavascriptInterface(new EggLedgerBridge(), "EggLedgerNative");
    webView.loadUrl("file:///android_asset/index.html");
    setContentView(webView);
  }

  @Override protected void onActivityResult(int requestCode, int resultCode, Intent data) {
    super.onActivityResult(requestCode, resultCode, data);
    if (resultCode != RESULT_OK || data == null || data.getData() == null) return;
    Uri uri = data.getData();
    try {
      if (requestCode == CREATE_CSV && pendingCsv != null) {
        try (OutputStream stream = getContentResolver().openOutputStream(uri, "w")) {
          if (stream == null) throw new IllegalStateException("Cannot open CSV file");
          stream.write(pendingCsv.getBytes(StandardCharsets.UTF_8));
        }
        pendingCsv = null;
        runJavaScript("window.flash && window.flash('CSV 已导出')");
      } else if (requestCode == OPEN_CSV) {
        try { getContentResolver().takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION); } catch (SecurityException ignored) { }
        StringBuilder content = new StringBuilder();
        try (InputStream input = getContentResolver().openInputStream(uri);
             BufferedReader reader = new BufferedReader(new InputStreamReader(input, StandardCharsets.UTF_8))) {
          String line; while ((line = reader.readLine()) != null) content.append(line).append('\n');
        }
        runJavaScript("window.receiveNativeCsv(" + JSONObject.quote(content.toString()) + ")");
      }
    } catch (Exception error) {
      pendingCsv = null;
      runJavaScript("window.flash && window.flash('无法保存 CSV 文件')");
    }
  }

  @Override public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
    super.onRequestPermissionsResult(requestCode, permissions, grantResults);
    if (requestCode == READ_FILES) openCsvPicker();
  }

  private void openCsvPicker() {
    Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
    intent.addCategory(Intent.CATEGORY_OPENABLE); intent.setType("*/*");
    intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
    intent.putExtra(Intent.EXTRA_MIME_TYPES, new String[]{"text/csv", "text/comma-separated-values", "application/csv", "application/vnd.ms-excel"});
    startActivityForResult(intent, OPEN_CSV);
  }

  private void runJavaScript(String script) { runOnUiThread(() -> webView.evaluateJavascript(script, null)); }

  private final class EggLedgerBridge {
    private final SharedPreferences preferences = getSharedPreferences("egg_ledger_settings", MODE_PRIVATE);
    @JavascriptInterface public String loadRecords() { return database.readRecords(); }
    @JavascriptInterface public void saveRecords(String json) { database.replaceRecords(json); }
    @JavascriptInterface public String getTimezone() { return preferences.getString("timezone", ""); }
    @JavascriptInterface public void setTimezone(String timezone) { preferences.edit().putString("timezone", timezone).apply(); }
    @JavascriptInterface public void exportCsv(String csv) {
      pendingCsv = csv;
      runOnUiThread(() -> {
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE); intent.setType("text/csv");
        intent.putExtra(Intent.EXTRA_TITLE, "egg-ledger.csv"); startActivityForResult(intent, CREATE_CSV);
      });
    }
    @JavascriptInterface public void importCsv() {
      runOnUiThread(() -> {
        if (Build.VERSION.SDK_INT <= Build.VERSION_CODES.S_V2 && checkSelfPermission(Manifest.permission.READ_EXTERNAL_STORAGE) != PackageManager.PERMISSION_GRANTED) {
          requestPermissions(new String[]{Manifest.permission.READ_EXTERNAL_STORAGE}, READ_FILES);
        } else openCsvPicker();
      });
    }
  }

  private final class EggLedgerDatabase extends SQLiteOpenHelper {
    EggLedgerDatabase() { super(MainActivity.this, "egg_ledger.db", null, 2); }
    @Override public void onCreate(SQLiteDatabase db) { db.execSQL("CREATE TABLE records (id TEXT PRIMARY KEY, eggs REAL NOT NULL, created_at INTEGER NOT NULL)"); }
    @Override public void onUpgrade(SQLiteDatabase db, int oldVersion, int newVersion) {
      if (oldVersion < 2) {
        db.beginTransaction();
        try {
          db.execSQL("ALTER TABLE records RENAME TO records_v1"); onCreate(db);
          db.execSQL("INSERT INTO records (id, eggs, created_at) SELECT id, eggs, created_at FROM records_v1");
          db.execSQL("DROP TABLE records_v1"); db.setTransactionSuccessful();
        } finally { db.endTransaction(); }
      }
    }
    synchronized String readRecords() {
      JSONArray result = new JSONArray();
      try (Cursor cursor = getReadableDatabase().query("records", new String[]{"id", "eggs", "created_at"}, null, null, null, null, null)) {
        while (cursor.moveToNext()) { JSONObject record = new JSONObject(); record.put("id", cursor.getString(0)); record.put("eggs", cursor.getDouble(1)); record.put("createdAt", cursor.getLong(2)); result.put(record); }
      } catch (JSONException ignored) { }
      return result.toString();
    }
    synchronized void replaceRecords(String json) {
      try {
        JSONArray records = new JSONArray(json); SQLiteDatabase db = getWritableDatabase(); db.beginTransaction();
        try {
          db.delete("records", null, null);
          for (int i = 0; i < records.length(); i++) {
            JSONObject record = records.getJSONObject(i); ContentValues row = new ContentValues();
            row.put("id", record.getString("id")); row.put("eggs", record.getDouble("eggs")); row.put("created_at", record.getLong("createdAt")); db.insertOrThrow("records", null, row);
          }
          db.setTransactionSuccessful();
        } finally { db.endTransaction(); }
      } catch (JSONException ignored) { }
    }
  }
}
