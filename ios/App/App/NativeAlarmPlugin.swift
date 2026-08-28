import Capacitor
import UserNotifications
import UIKit
import AVFoundation

/// 拾光 · iOS 原生提醒插件
/// 与 Android 版 NativeAlarmPlugin 方法一一对应，前端桥接无需改动。
/// iOS 通知机制：UNUserNotificationCenter 本地通知（系统级调度，App 被杀也能准时触发）。
@objc(NativeAlarmPlugin)
public class NativeAlarmPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "NativeAlarmPlugin"
    public let jsName = "NativeAlarm"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getStatusBarHeight", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestPermissions", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getStatus", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "syncEvent", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "cancelEvent", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openNotificationSettings", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openExactAlarmSettings", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openFullScreenIntentSettings", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openBatterySettings", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openAppDetails", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "listVoicePacks", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "previewVoice", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "downloadVoicePack", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "deleteVoicePack", returnType: CAPPluginReturnPromise)
    ]

    private var previewSynth: AVSpeechSynthesizer?

    /* ---------------- 安全区域 / 状态栏 ---------------- */

    @objc func getStatusBarHeight(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            var height: CGFloat = 0
            if #available(iOS 13.0, *) {
                let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
                let keyWindow = scenes.flatMap { $0.windows }.first { $0.isKeyWindow }
                height = keyWindow?.safeAreaInsets.top ?? scenes.flatMap { $0.windows }.first?.safeAreaInsets.top ?? 0
            } else {
                height = UIApplication.shared.statusBarFrame.height
            }
            // 前端会除以 devicePixelRatio，这里乘 scale 对齐 Android 的物理像素口径
            let px = height * UIScreen.main.scale
            var out = JSObject()
            out["height"] = Double(px)
            call.resolve(out)
        }
    }

    /* ---------------- 权限 ---------------- */

    @objc public override func requestPermissions(_ call: CAPPluginCall) {
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { _, _ in
            self.finishPermissionRequest(call)
        }
    }

    @objc func getStatus(_ call: CAPPluginCall) {
        finishPermissionRequest(call)
    }

    private func finishPermissionRequest(_ call: CAPPluginCall) {
        UNUserNotificationCenter.current().getNotificationSettings { settings in
            var out = JSObject()
            out["notifications"] = settings.authorizationStatus == .authorized || settings.authorizationStatus == .provisional
            // iOS 没有精确闹钟/全屏通知概念：系统通知天然精确且支持锁屏横幅
            out["exactAlarms"] = true
            out["fullScreenIntent"] = true
            out["batteryRestricted"] = false
            call.resolve(out)
        }
    }

    /* ---------------- 打开系统设置 ---------------- */

    @objc func openNotificationSettings(_ call: CAPPluginCall) { openAppSettings(call) }
    @objc func openExactAlarmSettings(_ call: CAPPluginCall) { openAppSettings(call) }
    @objc func openFullScreenIntentSettings(_ call: CAPPluginCall) { openAppSettings(call) }
    @objc func openBatterySettings(_ call: CAPPluginCall) { openAppSettings(call) }

    @objc func openAppDetails(_ call: CAPPluginCall) { openAppSettings(call) }

    private func openAppSettings(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard let url = URL(string: UIApplication.openSettingsURLString) else {
                call.reject("无法打开系统设置")
                return
            }
            UIApplication.shared.open(url, options: [:], completionHandler: nil)
            call.resolve()
        }
    }

    /* ---------------- 事件通知调度 ---------------- */

    @objc func syncEvent(_ call: CAPPluginCall) {
        guard let eventId = call.getString("id"),
              let items = call.getArray("items", JSObject.self) else {
            call.reject("missing id/items")
            return
        }
        let name = call.getString("name") ?? "拾光提醒"
        let emoji = call.getString("emoji") ?? ""
        let center = UNUserNotificationCenter.current()

        // 先移除该事件旧通知
        removePending(center: center, prefix: "\(eventId)|")

        var index = 0
        var scheduled = 0
        for item in items {
            guard let at = item["at"] as? String, !at.isEmpty else { continue }
            guard let components = Self.parseLocalTime(at) else { continue }
            let body = item["body"] as? String ?? "到点提醒"

            let content = UNMutableNotificationContent()
            let cleanName = name.trimmingCharacters(in: .whitespaces)
            let emojiOnly = emoji.split(separator: " ").first.map(String.init) ?? ""
            content.title = (emojiOnly.isEmpty ? "🔔 " : "\(emojiOnly) ") + cleanName
            content.body = body
            content.sound = .default
            content.badge = nil
            var userInfo: [String: Any] = ["eventId": eventId, "name": name, "emoji": emoji]
            if let voice = call.getString("voice") { userInfo["voice"] = voice }
            content.userInfo = userInfo

            let identifier = "\(eventId)|\(index)"
            // iOS 单条 trigger：前端已把重复事件展开为未来 30 次具体时间
            let trigger = UNCalendarNotificationTrigger(dateMatching: components, repeats: false)
            let request = UNNotificationRequest(identifier: identifier, content: content, trigger: trigger)

            center.add(request) { _ in
                // iOS 最多保留 64 条待触发通知；超出时系统拒绝，忽略即可
            }
            index += 1
            scheduled += 1
        }

        var out = JSObject()
        out["scheduled"] = scheduled
        call.resolve(out)
    }

    @objc func cancelEvent(_ call: CAPPluginCall) {
        guard let eventId = call.getString("id") else {
            call.reject("missing id")
            return
        }
        let center = UNUserNotificationCenter.current()
        removePending(center: center, prefix: "\(eventId)|")
        center.removeDeliveredNotifications(withIdentifiers: [eventId])
        call.resolve()
    }

    private func removePending(center: UNUserNotificationCenter, prefix: String) {
        center.getPendingNotificationRequests { requests in
            let ids = requests.map { $0.identifier }.filter { $0.hasPrefix(prefix) }
            if !ids.isEmpty {
                center.removePendingNotificationRequests(withIdentifiers: ids)
            }
        }
    }

    /// 解析本地时间字符串 "YYYY-MM-DDTHH:mm:00" → DateComponents
    private static func parseLocalTime(_ value: String) -> DateComponents? {
        let normalized = value.count == 16 ? value + ":00" : value
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone.current
        formatter.dateFormat = "yyyy-MM-dd'T'HH:mm:ss"
        guard let date = formatter.date(from: normalized) else { return nil }
        var cal = Calendar.current
        cal.timeZone = TimeZone.current
        return cal.dateComponents([.year, .month, .day, .hour, .minute], from: date)
    }

    /* ---------------- 语音包（iOS 用系统 TTS 降级） ---------------- */

    @objc func listVoicePacks(_ call: CAPPluginCall) {
        var out = JSObject()
        var packs = JSArray()
        var pack = JSObject()
        pack["id"] = "ios-system-tts"
        pack["name"] = "iOS 系统语音"
        pack["description"] = "iOS 端使用系统内置中文语音，无需下载"
        pack["installed"] = true
        pack["bundled"] = true
        packs.append(pack)
        out["packs"] = packs
        call.resolve(out)
    }

    @objc func previewVoice(_ call: CAPPluginCall) {
        let voice = call.getString("voice", "标准播报")
        let text = call.getString("text", "你好呀，这里是拾光。记得按时完成今天的安排哦。")
        DispatchQueue.main.async {
            if self.previewSynth == nil {
                self.previewSynth = AVSpeechSynthesizer()
            }
            let utterance = AVSpeechUtterance(string: text)
            utterance.voice = AVSpeechSynthesisVoice(language: "zh-CN")
            utterance.rate = 0.5
            self.previewSynth?.stopSpeaking(at: .immediate)
            self.previewSynth?.speak(utterance)
            call.resolve(["previewing": true, "voice": voice])
        }
    }

    @objc func downloadVoicePack(_ call: CAPPluginCall) {
        var out = JSObject()
        out["downloaded"] = true
        out["installed"] = true
        call.resolve(out)
    }

    @objc func deleteVoicePack(_ call: CAPPluginCall) {
        call.resolve(["deleted": true])
    }
}
