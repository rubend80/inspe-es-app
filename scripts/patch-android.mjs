// Depois de "npx cap add android": junta o código Android da app (câmara/galeria), as permissões,
// o ícone, o número da versão e a assinatura (para o APK instalar por cima da versão anterior).
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const ANDROID = path.join(ROOT, 'android');
const APP_ID = JSON.parse(fs.readFileSync(path.join(ROOT, 'capacitor.config.json'), 'utf8')).appId;
const versionCode = Number(process.env.VERSION_CODE || '1');
const versionName = process.env.VERSION_NAME || `1.${versionCode}`;

function must(cond, msg) {
  if (!cond) {
    console.error('patch-android: ' + msg);
    process.exit(1);
  }
}

// 1. Código Java
const javaDir = path.join(ANDROID, 'app/src/main/java', ...APP_ID.split('.'));
must(fs.existsSync(javaDir), `pasta Java não encontrada: ${javaDir}`);
for (const f of fs.readdirSync(path.join(ROOT, 'android-src'))) {
  fs.copyFileSync(path.join(ROOT, 'android-src', f), path.join(javaDir, f));
}

// 2. Permissões
const manifestPath = path.join(ANDROID, 'app/src/main/AndroidManifest.xml');
let manifest = fs.readFileSync(manifestPath, 'utf8');
const perms = [
  '<uses-permission android:name="android.permission.READ_MEDIA_IMAGES" />',
  '<uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" android:maxSdkVersion="32" />',
  '<uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" android:maxSdkVersion="28" />',
  '<uses-permission android:name="android.permission.CAMERA" />',
];
must(manifest.includes('</manifest>'), 'AndroidManifest sem </manifest>');
manifest = manifest.replace('</manifest>', `    ${perms.join('\n    ')}\n</manifest>`);
// Android 10: escrever em Documents com o caminho antigo
manifest = manifest.replace('<application', '<application android:requestLegacyExternalStorage="true"');
fs.writeFileSync(manifestPath, manifest);

// 3. Versão e assinatura
const gradlePath = path.join(ANDROID, 'app/build.gradle');
let gradle = fs.readFileSync(gradlePath, 'utf8');
must(/versionCode\s+\d+/.test(gradle), 'versionCode não encontrado');
gradle = gradle.replace(/versionCode\s+\d+/, `versionCode ${versionCode}`).replace(/versionName\s+"[^"]*"/, `versionName "${versionName}"`);
must(/buildTypes\s*\{\s*release\s*\{/.test(gradle), 'buildTypes/release não encontrado');
gradle = gradle.replace(
  /buildTypes\s*\{\s*release\s*\{/,
  `signingConfigs {
        release {
            storeFile file("${path.join(ROOT, 'signing/inspecoes.jks').replaceAll('\\', '/')}")
            storePassword System.getenv("KEYSTORE_PASSWORD")
            keyAlias "inspecoes"
            keyPassword System.getenv("KEYSTORE_PASSWORD")
        }
    }
    buildTypes {
        release {
            signingConfig signingConfigs.release`,
);
fs.writeFileSync(gradlePath, gradle);

// 4. Ícone da app (Live House): ícone adaptável (Android 8+) e ícone simples para os Android antigos
const res = path.join(ANDROID, 'app/src/main/res');
const icon = path.join(ROOT, 'public/icons/icon-512.png');
const foreground = path.join(ROOT, 'android-res/ic_launcher_foreground.png');
for (const dir of fs.readdirSync(res)) {
  if (!dir.startsWith('mipmap-') || dir.startsWith('mipmap-anydpi')) continue;
  for (const name of ['ic_launcher.png', 'ic_launcher_round.png']) {
    if (fs.existsSync(path.join(res, dir, name))) fs.copyFileSync(icon, path.join(res, dir, name));
  }
  if (fs.existsSync(path.join(res, dir, 'ic_launcher_foreground.png'))) {
    fs.copyFileSync(foreground, path.join(res, dir, 'ic_launcher_foreground.png'));
  }
}
console.log(`patch-android: ok (${APP_ID}, versão ${versionName} / ${versionCode})`);
