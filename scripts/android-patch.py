# Passt das von Capacitor erzeugte Android-Projekt an (aufgerufen von scripts/android-build.sh):
# Berechtigungen, Anruf-Dienst, Versionsnummer und Unterschrift.
import re
import sys

manifest, gradle, version, build = sys.argv[1:]

m = open(manifest, encoding='utf-8').read()
perms = ['RECORD_AUDIO', 'MODIFY_AUDIO_SETTINGS', 'CAMERA', 'WAKE_LOCK', 'POST_NOTIFICATIONS',
         'FOREGROUND_SERVICE', 'FOREGROUND_SERVICE_MICROPHONE', 'FOREGROUND_SERVICE_MEDIA_PLAYBACK', 'BLUETOOTH_CONNECT']
add = ''.join(f'    <uses-permission android:name="android.permission.{p}" />\n' for p in perms if f'permission.{p}"' not in m)
add += '    <uses-feature android:name="android.hardware.camera" android:required="false" />\n'
add += '    <uses-feature android:name="android.hardware.microphone" android:required="false" />\n'
m = m.replace('</manifest>', add + '</manifest>')
# Server-Adressen ohne https (z. B. http://192.168.x.x:3500) erlauben
if 'usesCleartextTraffic' not in m:
    m = m.replace('<application', '<application\n        android:usesCleartextTraffic="true"', 1)
if '.CallService' not in m:
    service = ('        <service android:name=".CallService" android:exported="false"\n'
               '            android:foregroundServiceType="microphone|mediaPlayback" />\n')
    m = m.replace('</application>', service + '    </application>', 1)
open(manifest, 'w', encoding='utf-8').write(m)

g = open(gradle, encoding='utf-8').read()
g, n1 = re.subn(r'versionCode\s+\d+', f'versionCode {build}', g)
g, n2 = re.subn(r'versionName\s+"[^"]*"', f'versionName "{version}"', g)
if not (n1 and n2):
    sys.exit('versionCode/versionName nicht gefunden in build.gradle')

SIGNING = '''    signingConfigs {
        nook {
            if (System.getenv("NOOK_KEYSTORE")) {
                storeFile file(System.getenv("NOOK_KEYSTORE"))
                storePassword System.getenv("NOOK_KEYSTORE_PASSWORD")
                keyAlias System.getenv("NOOK_KEY_ALIAS")
                keyPassword System.getenv("NOOK_KEY_PASSWORD")
            }
        }
    }
'''
if 'signingConfigs.nook' not in g:
    i = re.search(r'^android\s*\{\s*\n', g, re.M)
    j = re.search(r'buildTypes\s*\{\s*release\s*\{', g)
    if not i or not j:
        sys.exit('android/buildTypes-Block nicht gefunden in build.gradle')
    # zuerst die spätere Stelle einfügen, damit die frühere Position stimmt
    g = g[:j.end()] + '\n            if (System.getenv("NOOK_KEYSTORE")) signingConfig signingConfigs.nook' + g[j.end():]
    g = g[:i.end()] + SIGNING + g[i.end():]
open(gradle, 'w', encoding='utf-8').write(g)
print('Android-Projekt angepasst:', version, 'Build', build)
