# Starring Me

Android app (Capacitor 6 shell, JDK 17) around the Kwentong Pambata library, with a "Kunin ang update" button that pulls a newer library from GitHub Pages.

- `site/` is what GitHub Pages serves: `index.html` (the library) and `version.json`.
- `app/` is the Capacitor Android project. `app/www/` holds the bundled copy of the library.
- Only `https://jeadriano-ghub.github.io/starring-me/version.json` and `.../index.html` are ever fetched (constant `BASE` in `UpdateStore.java`).

## Publish a library update (no new APK)

1. Rebuild the library: `cd <scratchpad>/app && python3 build_app.py --out ../final3/lib` (then `--check` and `node final3/verify.js $PWD/../final3/lib/app.html`; expect 0 failures).
2. `cp final3/lib/app.html starring-me/site/index.html`
3. `python3 starring-me/site/tools/make_version.py [--version 1.1.0]` (raises the build number by 1 and writes the new sha256).
4. Push the contents of `site/` to the repo's Pages branch. Phones see it on the next check; the build number must always go up or the app ignores it.

## Rebuild the APK (only for icon/name/permission/shell changes)

```
export JAVA_HOME=/opt/homebrew/opt/openjdk@17 PATH=/opt/homebrew/opt/openjdk@17/bin:$PATH ANDROID_SDK_ROOT=/opt/homebrew/share/android-commandlinetools
./sync_app.sh                       # copies site/index.html + version.json into app/www and runs cap sync
cd app/android && ./gradlew assembleDebug
cp app/build/outputs/apk/debug/app-debug.apk ../../out/StarringMe-debug.apk
```
The bundled build number is the one in `site/version.json` at the time of the sync. The APK is debug-signed; a release keystore comes later (keep it out of git and back it up).

## How the update works

Downloaded copies live in the app's private storage (`files/update/b<build>/index.html`, pointer `current.json`, replaced atomically). At launch `MainActivity` uses the stored copy only if its build is higher than the bundled one and its sha256 matches; otherwise (missing, corrupt, older) the bundled copy loads silently. A download is verified against `version.json` before it is installed, and a failed or cancelled download never touches the good copy. The child profile (`kp_child`, `kp_lang`) lives in localStorage on the same origin and survives updates.

## Tests

- `java` host test of the real update logic: `javac -d tests/.classes app/android/app/src/main/java/com/jeadriano/starringme/UpdateStore.java tests/UpdateStoreTest.java && java -cp tests/.classes UpdateStoreTest`
- Browser test with a mocked bridge and a local server: `node tests/run.js` (screenshots in `tests/shots/`).
- Not covered: running on a real device or emulator (none available here).
