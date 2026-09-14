package com.shiguang.reminder;

import android.Manifest;

import com.amap.api.location.AMapLocation;
import com.amap.api.location.AMapLocationClient;
import com.amap.api.location.AMapLocationClientOption;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

/**
 * 高德融合定位插件：GPS+北斗+WiFi+基站，室内 20-50m / 室外 5-30m，
 * 输出 GCJ-02 坐标（可直接喂高德逆地理与高德瓦片底图）。
 * 需要在 AndroidManifest 配置 com.amap.api.v2.apikey。
 */
@CapacitorPlugin(
        name = "AmapLocation",
        permissions = {
                @Permission(strings = {Manifest.permission.ACCESS_FINE_LOCATION}, alias = "fineLocation"),
                @Permission(strings = {Manifest.permission.ACCESS_COARSE_LOCATION}, alias = "coarseLocation")
        }
)
public class AmapLocationPlugin extends Plugin {

    @PluginMethod
    public void getCurrentLocation(PluginCall call) {
        boolean fine = getPermissionState("fineLocation") == PermissionState.GRANTED;
        boolean coarse = getPermissionState("coarseLocation") == PermissionState.GRANTED;
        if (!fine && !coarse) {
            requestAllPermissions(call, "locPermCallback");
            return;
        }
        startLocate(call);
    }

    @PermissionCallback
    private void locPermCallback(PluginCall call) {
        boolean fine = getPermissionState("fineLocation") == PermissionState.GRANTED;
        boolean coarse = getPermissionState("coarseLocation") == PermissionState.GRANTED;
        if (fine || coarse) {
            startLocate(call);
        } else {
            call.reject("PERM_DENIED");
        }
    }

    private void startLocate(final PluginCall call) {
        try {
            final AMapLocationClient client = new AMapLocationClient(getContext().getApplicationContext());
            AMapLocationClientOption opt = new AMapLocationClientOption();
            // 高精度模式：GNSS + 网络融合
            opt.setLocationMode(AMapLocationClientOption.AMapLocationMode.Hight_Accuracy);
            opt.setOnceLocation(true);
            // 首次定位即取最新修正结果，显著提升单次精度
            opt.setOnceLocationLatest(true);
            opt.setHttpTimeOut(15000);
            opt.setSensorEnable(true);
            opt.setWifiScan(true);
            client.setLocationOption(opt);
            client.setLocationListener(loc -> {
                if (loc == null) return;
                client.stopLocation();
                client.onDestroy();
                if (loc.getErrorCode() != 0) {
                    call.reject("AMAP_ERR_" + loc.getErrorCode() + ": " + loc.getErrorInfo());
                    return;
                }
                JSObject out = new JSObject();
                out.put("lat", loc.getLatitude());
                out.put("lon", loc.getLongitude());
                out.put("accuracy", loc.getAccuracy());
                out.put("coordType", "gcj02");
                out.put("provider", loc.getLocationType());
                call.resolve(out);
            });
            client.startLocation();
        } catch (Exception e) {
            call.reject("INIT_FAIL: " + (e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage()));
        }
    }
}
