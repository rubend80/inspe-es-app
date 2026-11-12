package pt.livehouse.inspecoes;

import android.Manifest;
import android.content.ActivityNotFoundException;
import android.content.ContentResolver;
import android.content.ContentUris;
import android.content.ContentValues;
import android.content.Intent;
import android.database.Cursor;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.media.MediaScannerConnection;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.util.Size;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;

/**
 * Ponte entre a app (JavaScript) e o Android:
 * abre a câmara normal do telemóvel, lista as fotos novas da galeria e copia-as, tal e qual,
 * para Documents/Inspeções/<processo>/2. Fotos/<divisão>/.
 */
@CapacitorPlugin(
    name = "NativePhotos",
    permissions = {
        @Permission(alias = "mediaImages", strings = { Manifest.permission.READ_MEDIA_IMAGES }),
        @Permission(alias = "readStorage", strings = { Manifest.permission.READ_EXTERNAL_STORAGE }),
        @Permission(alias = "writeStorage", strings = { Manifest.permission.WRITE_EXTERNAL_STORAGE })
    }
)
public class NativePhotosPlugin extends Plugin {

    /** As cópias da app ficam aqui; nunca são tratadas como fotos novas da câmara. */
    private static final String APP_ROOT = "Inspeções";

    private String[] neededAliases() {
        if (Build.VERSION.SDK_INT >= 33) return new String[] { "mediaImages" };
        if (Build.VERSION.SDK_INT >= 29) return new String[] { "readStorage" };
        return new String[] { "readStorage", "writeStorage" };
    }

    private boolean allGranted() {
        for (String alias : neededAliases()) {
            if (getPermissionState(alias) != PermissionState.GRANTED) return false;
        }
        return true;
    }

    @PluginMethod
    public void ensurePermission(PluginCall call) {
        if (allGranted()) {
            JSObject r = new JSObject();
            r.put("granted", true);
            call.resolve(r);
            return;
        }
        requestPermissionForAliases(neededAliases(), call, "permissionCallback");
    }

    @PermissionCallback
    private void permissionCallback(PluginCall call) {
        JSObject r = new JSObject();
        r.put("granted", allGranted());
        call.resolve(r);
    }

    @PluginMethod
    public void openCamera(PluginCall call) {
        final long since = System.currentTimeMillis();
        getActivity().runOnUiThread(() -> {
            try {
                Intent intent = new Intent(MediaStore.INTENT_ACTION_STILL_IMAGE_CAMERA);
                getActivity().startActivity(intent);
                JSObject r = new JSObject();
                r.put("since", since);
                call.resolve(r);
            } catch (ActivityNotFoundException e) {
                call.reject("Não foi encontrada nenhuma app de câmara.");
            } catch (Exception e) {
                call.reject("Não foi possível abrir a câmara: " + e.getMessage());
            }
        });
    }

    private Uri imagesCollection() {
        if (Build.VERSION.SDK_INT >= 29) return MediaStore.Images.Media.getContentUri(MediaStore.VOLUME_EXTERNAL);
        return MediaStore.Images.Media.EXTERNAL_CONTENT_URI;
    }

    @PluginMethod
    public void listSince(PluginCall call) {
        // O número chega do JavaScript como Long (não Double): ler como Number para não ficar 0 (= todas as fotos).
        Object raw = call.getData().opt("since");
        long since = raw instanceof Number ? ((Number) raw).longValue() : 0L;
        if (since <= 0L) {
            call.reject("Falta a hora de início das fotos.");
            return;
        }
        ContentResolver resolver = getContext().getContentResolver();
        Uri collection = imagesCollection();
        String location = Build.VERSION.SDK_INT >= 29 ? MediaStore.MediaColumns.RELATIVE_PATH : MediaStore.MediaColumns.DATA;
        String[] projection = new String[] {
            MediaStore.MediaColumns._ID,
            MediaStore.MediaColumns.DISPLAY_NAME,
            MediaStore.MediaColumns.SIZE,
            MediaStore.MediaColumns.MIME_TYPE,
            MediaStore.MediaColumns.DATE_ADDED,
            MediaStore.Images.ImageColumns.DATE_TAKEN,
            MediaStore.MediaColumns.WIDTH,
            MediaStore.MediaColumns.HEIGHT,
            location
        };
        String selection = MediaStore.MediaColumns.DATE_ADDED + " >= ?";
        String[] args = new String[] { String.valueOf(since / 1000L) };
        JSArray items = new JSArray();
        try (Cursor c = resolver.query(collection, projection, selection, args, MediaStore.MediaColumns.DATE_ADDED + " ASC")) {
            if (c != null) {
                while (c.moveToNext()) {
                    String where = c.getString(8);
                    if (where != null && (where.startsWith("Documents/" + APP_ROOT) || where.contains("/Documents/" + APP_ROOT + "/")
                        || where.startsWith("Pictures/" + APP_ROOT) || where.contains("/Pictures/" + APP_ROOT + "/"))) {
                        continue;
                    }
                    long id = c.getLong(0);
                    JSObject item = new JSObject();
                    item.put("id", String.valueOf(id));
                    item.put("uri", ContentUris.withAppendedId(collection, id).toString());
                    item.put("name", c.getString(1));
                    item.put("size", c.getLong(2));
                    item.put("mime", c.getString(3));
                    item.put("dateAdded", c.getLong(4) * 1000L);
                    item.put("dateTaken", c.isNull(5) ? 0L : c.getLong(5));
                    item.put("width", c.getInt(6));
                    item.put("height", c.getInt(7));
                    items.put(item);
                }
            }
        } catch (SecurityException e) {
            call.reject("Sem autorização para ver as fotos do telemóvel.");
            return;
        } catch (Exception e) {
            call.reject("Não foi possível ler a galeria: " + e.getMessage());
            return;
        }
        JSObject r = new JSObject();
        r.put("items", items);
        call.resolve(r);
    }

    /** Cria o ficheiro de destino e escreve nele. Devolve o caminho mostrado ao utilizador. */
    private String writeTo(String folder, String fileName, String mime, InputStream in) throws IOException {
        ContentResolver resolver = getContext().getContentResolver();
        if (Build.VERSION.SDK_INT >= 29) {
            try {
                return insertAndWrite(resolver, MediaStore.Files.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY),
                    Environment.DIRECTORY_DOCUMENTS, folder, fileName, mime, in);
            } catch (IllegalArgumentException e) {
                // Alguns Android não aceitam imagens em Documents: fica em Pictures, com a mesma estrutura.
                return insertAndWrite(resolver, MediaStore.Images.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY),
                    Environment.DIRECTORY_PICTURES, folder, fileName, mime, in);
            }
        }
        File dir = new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOCUMENTS), folder);
        if (!dir.exists() && !dir.mkdirs()) throw new IOException("Não foi possível criar a pasta " + dir);
        File file = new File(dir, fileName);
        try (OutputStream out = new FileOutputStream(file)) {
            pipe(in, out);
        }
        MediaScannerConnection.scanFile(getContext(), new String[] { file.getAbsolutePath() }, new String[] { mime }, null);
        return Environment.DIRECTORY_DOCUMENTS + "/" + folder + "/" + fileName;
    }

    private String insertAndWrite(ContentResolver resolver, Uri collection, String top, String folder, String fileName,
                                  String mime, InputStream in) throws IOException {
        ContentValues values = new ContentValues();
        values.put(MediaStore.MediaColumns.DISPLAY_NAME, fileName);
        values.put(MediaStore.MediaColumns.MIME_TYPE, mime);
        values.put(MediaStore.MediaColumns.RELATIVE_PATH, top + "/" + folder + "/");
        values.put(MediaStore.MediaColumns.IS_PENDING, 1);
        Uri target = resolver.insert(collection, values);
        if (target == null) throw new IOException("O Android recusou criar o ficheiro.");
        try (OutputStream out = resolver.openOutputStream(target)) {
            if (out == null) throw new IOException("Não foi possível escrever o ficheiro.");
            pipe(in, out);
        } catch (IOException | RuntimeException e) {
            resolver.delete(target, null, null);
            throw e;
        }
        ContentValues done = new ContentValues();
        done.put(MediaStore.MediaColumns.IS_PENDING, 0);
        resolver.update(target, done, null, null);
        return top + "/" + folder + "/" + fileName;
    }

    private static void pipe(InputStream in, OutputStream out) throws IOException {
        byte[] buffer = new byte[64 * 1024];
        int n;
        while ((n = in.read(buffer)) > 0) out.write(buffer, 0, n);
        out.flush();
    }

    @PluginMethod
    public void copy(PluginCall call) {
        String uri = call.getString("uri");
        String folder = call.getString("folder");
        String fileName = call.getString("fileName");
        String mime = call.getString("mime", "image/jpeg");
        if (uri == null || folder == null || fileName == null) {
            call.reject("Faltam dados para copiar a foto.");
            return;
        }
        try (InputStream in = getContext().getContentResolver().openInputStream(Uri.parse(uri))) {
            if (in == null) throw new IOException("Não foi possível abrir a foto.");
            JSObject r = new JSObject();
            r.put("path", writeTo(folder, fileName, mime, in));
            call.resolve(r);
        } catch (Exception e) {
            call.reject("Não foi possível copiar a foto: " + e.getMessage());
        }
    }

    @PluginMethod
    public void writeFile(PluginCall call) {
        String folder = call.getString("folder");
        String fileName = call.getString("fileName");
        String mime = call.getString("mime", "image/jpeg");
        String data = call.getString("data");
        if (folder == null || fileName == null || data == null) {
            call.reject("Faltam dados para gravar a foto.");
            return;
        }
        try (InputStream in = new ByteArrayInputStream(Base64.decode(data, Base64.DEFAULT))) {
            JSObject r = new JSObject();
            r.put("path", writeTo(folder, fileName, mime, in));
            call.resolve(r);
        } catch (Exception e) {
            call.reject("Não foi possível gravar a foto: " + e.getMessage());
        }
    }

    @PluginMethod
    public void thumbnail(PluginCall call) {
        String uri = call.getString("uri");
        int size = call.getInt("size", 360);
        if (uri == null) {
            call.reject("Falta a foto.");
            return;
        }
        try {
            Bitmap bitmap;
            ContentResolver resolver = getContext().getContentResolver();
            if (Build.VERSION.SDK_INT >= 29) {
                bitmap = resolver.loadThumbnail(Uri.parse(uri), new Size(size, size), null);
            } else {
                BitmapFactory.Options bounds = new BitmapFactory.Options();
                bounds.inJustDecodeBounds = true;
                try (InputStream in = resolver.openInputStream(Uri.parse(uri))) {
                    BitmapFactory.decodeStream(in, null, bounds);
                }
                int sample = 1;
                while (Math.max(bounds.outWidth, bounds.outHeight) / (sample * 2) >= size) sample *= 2;
                BitmapFactory.Options opts = new BitmapFactory.Options();
                opts.inSampleSize = sample;
                try (InputStream in = resolver.openInputStream(Uri.parse(uri))) {
                    bitmap = BitmapFactory.decodeStream(in, null, opts);
                }
            }
            if (bitmap == null) throw new IOException("Sem imagem.");
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            bitmap.compress(Bitmap.CompressFormat.JPEG, 82, out);
            JSObject r = new JSObject();
            r.put("data", Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP));
            call.resolve(r);
        } catch (Exception e) {
            call.reject("Não foi possível fazer a miniatura: " + e.getMessage());
        }
    }
}
