package com.shiguang.reminder;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(NativeAlarmPlugin.class);
        registerPlugin(AmapLocationPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
