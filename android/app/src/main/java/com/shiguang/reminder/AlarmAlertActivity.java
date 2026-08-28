package com.shiguang.reminder;

import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.TextView;

import androidx.appcompat.app.AppCompatActivity;

public class AlarmAlertActivity extends AppCompatActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_alarm_alert);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true);
            setTurnScreenOn(true);
        } else {
            getWindow().addFlags(
                    WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED |
                    WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON |
                    WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON |
                    WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD
            );
        }

        Intent intent = getIntent();
        String title = intent.getStringExtra(AlarmRingingService.EXTRA_TITLE);
        String body = intent.getStringExtra(AlarmRingingService.EXTRA_BODY);
        String emoji = intent.getStringExtra(AlarmRingingService.EXTRA_EMOJI);
        int notificationId = intent.getIntExtra(AlarmRingingService.EXTRA_NOTIFICATION_ID, 0);

        ((TextView) findViewById(R.id.alarmEmoji)).setText(emoji != null && !emoji.isEmpty() ? emoji.split(" ")[0] : "⏰");
        ((TextView) findViewById(R.id.alarmTitle)).setText(title != null ? title : "拾光提醒");
        ((TextView) findViewById(R.id.alarmBody)).setText(body != null ? body : "到点提醒");

        Button doneBtn = findViewById(R.id.doneBtn);
        Button snoozeBtn = findViewById(R.id.snoozeBtn);
        doneBtn.setOnClickListener(v -> {
            Intent stop = new Intent(this, AlarmActionReceiver.class)
                    .setAction(AlarmRingingService.ACTION_STOP)
                    .putExtras(intent);
            sendBroadcast(stop);
            finish();
        });
        snoozeBtn.setOnClickListener(v -> {
            Intent snooze = new Intent(this, AlarmActionReceiver.class)
                    .setAction(AlarmRingingService.ACTION_SNOOZE)
                    .putExtras(intent);
            sendBroadcast(snooze);
            finish();
        });
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
    }
}
