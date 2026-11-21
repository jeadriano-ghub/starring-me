package com.jeadriano.starringme;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.ServerPath;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(StarringUpdatePlugin.class);
        try {
            StarringUpdatePlugin.readBundled(this);
            UpdateStore store = StarringUpdatePlugin.store(this);
            UpdateStore.Info a = store.chooseAtLaunch(StarringUpdatePlugin.bundledBuild);
            store.cleanup(a);
            StarringUpdatePlugin.active = a;
            if (a != null) bridgeBuilder.setServerPath(new ServerPath(ServerPath.PathType.BASE_PATH, a.dir));
        } catch (Throwable ignored) { /* any problem: bundled copy */ }
        super.onCreate(savedInstanceState);
    }
}
