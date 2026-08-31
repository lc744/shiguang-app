package com.shiguang.reminder;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import android.util.Log;
import android.widget.Button;

import java.util.ArrayList;

/**
 * 绸缪精灵语音识别弹窗 —— 半透明 Activity，显示自制正弦波 UI。
 * 交互：点击"开始录制"→ 开始识别 → 按钮变"说完了"→ 点击"说完了"→ 停止并返回。
 * 结果通过 setResult 返回：data 含 text（识别文本）与 errorCode（0=成功，非 0=错误/取消）。
 */
public class SpeechDialogActivity extends Activity {

    private static final String TAG = "ShiguangSpeechUI";

    // 自定义错误码（避开 SpeechRecognizer 自带 1~9）
    public static final int ERR_CANCELED = 9001;      // 用户点取消
    public static final int ERR_NO_RESULT = 9002;     // 停止后无结果
    public static final int ERR_UNAVAILABLE = 9003;   // 无语音识别服务

    private WaveformView waveform;
    private Button btnRecord;
    private Button btnCancel;
    private SpeechRecognizer recognizer;
    private boolean recording = false;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_speech_dialog);

        waveform = findViewById(R.id.waveform);
        btnRecord = findViewById(R.id.btn_record);
        btnCancel = findViewById(R.id.btn_cancel);

        btnRecord.setOnClickListener(v -> {
            if (recording) {
                stopRecording();
            } else {
                startRecording();
            }
        });

        btnCancel.setOnClickListener(v -> finishWith(ERR_CANCELED, ""));

        waveform.start();
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        if (recognizer != null) {
            try { recognizer.destroy(); } catch (Exception ignored) {}
            recognizer = null;
        }
    }

    private void startRecording() {
        if (!SpeechRecognizer.isRecognitionAvailable(this)) {
            // 系统无语音识别服务，尝试拉起系统语音对话框兜底
            try {
                Intent i = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
                i.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
                i.putExtra(RecognizerIntent.EXTRA_LANGUAGE, "zh-CN");
                i.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1);
                startActivityForResult(i, 1001);
            } catch (Exception e) {
                finishWith(ERR_UNAVAILABLE, "");
            }
            return;
        }

        recording = true;
        btnRecord.setText("说完了");
        waveform.setAmplitude(1f);

        try {
            if (recognizer == null) {
                recognizer = SpeechRecognizer.createSpeechRecognizer(this);
            }
            recognizer.setRecognitionListener(new RecognitionListener() {
                @Override public void onReadyForSpeech(Bundle params) {}
                @Override public void onBeginningOfSpeech() {}
                @Override
                public void onRmsChanged(float rmsdB) {
                    runOnUiThread(() -> waveform.setAmplitude(rmsdB));
                }
                @Override public void onBufferReceived(byte[] buffer) {}
                @Override
                public void onEndOfSpeech() {
                    runOnUiThread(() -> btnRecord.setText("聆听中…"));
                }
                @Override public void onPartialResults(Bundle partialResults) {}
                @Override public void onEvent(int eventType, Bundle params) {}
                @Override
                public void onResults(Bundle results) {
                    ArrayList<String> matches = results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
                    String text = (matches != null && !matches.isEmpty()) ? matches.get(0) : "";
                    finishWith(0, text);
                }
                @Override
                public void onError(int error) {
                    Log.e(TAG, "Speech error: " + error);
                    finishWith(error, "");
                }
            });

            Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
            intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
            intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, "zh-CN");
            intent.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, false);
            intent.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1);
            recognizer.startListening(intent);
        } catch (Exception e) {
            Log.e(TAG, "startRecording failed", e);
            finishWith(ERR_UNAVAILABLE, "");
        }
    }

    private void stopRecording() {
        if (recognizer != null) {
            try { recognizer.stopListening(); } catch (Exception ignored) {}
        }
        recording = false;
        waveform.stop();
        // 结果会在 onResults / onError 回调中返回；若用户连点则兜底
        getWindow().getDecorView().postDelayed(() -> {
            if (!isFinishing() && !recording) {
                finishWith(ERR_NO_RESULT, "");
            }
        }, 1200);
    }

    private void finishWith(int errorCode, String text) {
        if (isFinishing()) return;
        Intent data = new Intent();
        data.putExtra("text", text);
        data.putExtra("errorCode", errorCode);
        setResult(RESULT_OK, data);
        finish();
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == 1001) {
            if (resultCode == RESULT_OK && data != null) {
                ArrayList<String> matches = data.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS);
                String text = (matches != null && !matches.isEmpty()) ? matches.get(0) : "";
                finishWith(0, text);
            } else {
                finishWith(ERR_CANCELED, "");
            }
        }
    }
}
