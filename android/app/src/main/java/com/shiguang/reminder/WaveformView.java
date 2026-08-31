package com.shiguang.reminder;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.Path;
import android.util.AttributeSet;
import android.view.View;

/**
 * 语音识别弹窗里的正弦波动画。
 * 通过 setAmplitude(rmsdB) 接收 SpeechRecognizer 的音量回调（约 0~10 dB），
 * 映射为波形振幅，并持续平滑重绘形成跳动效果。
 */
public class WaveformView extends View {
    private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private float targetAmplitude = 0f;   // 目标振幅（0~1）
    private float amplitude = 0f;         // 当前振幅（平滑过渡）
    private float phase = 0f;             // 相位，制造流动感
    private boolean active = false;       // 是否持续动画

    public WaveformView(Context context) {
        super(context);
        init();
    }

    public WaveformView(Context context, AttributeSet attrs) {
        super(context, attrs);
        init();
    }

    private void init() {
        paint.setColor(0xFF7C5CFF);
        paint.setStyle(Paint.Style.STROKE);
        paint.setStrokeWidth(dp(3f));
        paint.setStrokeCap(Paint.Cap.ROUND);
        paint.setStrokeJoin(Paint.Join.ROUND);
    }

    /** 设置音量（SpeechRecognizer 的 onRmsChanged 值，约 0~10） */
    public void setAmplitude(float rmsdB) {
        targetAmplitude = clamp(rmsdB / 10f, 0f, 1f);
        ensureAnimating();
    }

    /** 开始动画（开始录制时调用） */
    public void start() {
        active = true;
        ensureAnimating();
    }

    /** 停止动画，波形回归静止基线（停止/取消时调用） */
    public void stop() {
        active = false;
        targetAmplitude = 0f;
        postInvalidateOnAnimation();
    }

    private void ensureAnimating() {
        if (!active) return;
        postInvalidateOnAnimation();
    }

    @Override
    protected void onDraw(Canvas canvas) {
        super.onDraw(canvas);
        float w = getWidth();
        float h = getHeight();
        if (w <= 0 || h <= 0) return;
        float midY = h / 2f;

        // 平滑逼近目标振幅
        amplitude += (targetAmplitude - amplitude) * 0.18f;

        // 最大振幅：静止时保持微弱基线波，说话时随音量跳动
        float maxAmp;
        if (active && amplitude > 0.03f) {
            maxAmp = h * 0.38f * (0.15f + amplitude);
        } else {
            maxAmp = h * 0.06f;
        }

        // 流动相位
        phase += 0.22f;

        Path path = new Path();
        int points = 160;
        for (int i = 0; i <= points; i++) {
            float ratio = i / (float) points;
            float x = w * ratio;
            // 叠加两列正弦，让波形更自然
            float y = midY
                    + (float) Math.sin(ratio * Math.PI * 4 + phase) * maxAmp * 0.7f
                    + (float) Math.sin(ratio * Math.PI * 9 - phase * 1.3f) * maxAmp * 0.3f;
            if (i == 0) path.moveTo(x, y);
            else path.lineTo(x, y);
        }
        canvas.drawPath(path, paint);

        // 录制中持续重绘
        if (active) postInvalidateOnAnimation();
    }

    private float dp(float v) {
        return v * getResources().getDisplayMetrics().density;
    }

    private float clamp(float v, float lo, float hi) {
        return Math.max(lo, Math.min(hi, v));
    }
}
