// 音频模块
const AudioModule = (function () {
    const logger = (typeof window !== 'undefined' && window.Logger && window.Logger.createLogger)
        ? window.Logger.createLogger('Audio')
        : console;
    let audioContext = null;
    let isEnabled = true;
    let currentSoundInterval = null;
    let isLockedGetter = null;
    let soundCounter = 0;
    const MAX_SOUND_PLAYS = 3;

    function init() {
        if (audioContext) return audioContext;
        try {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
            return audioContext;
        } catch (e) {
            logger.warn('Web Audio API not supported');
            return null;
        }
    }

    function setEnabled(enabled) {
        isEnabled = enabled;
        if (!enabled) stopContinuous();
    }

    function setLockedGetter(getter) {
        isLockedGetter = getter;
    }

    function playBeep(frequency = 880, duration = 0.3, type = 'sine') {
        if (!isEnabled) return;
        try {
            const ctx = init();
            if (!ctx) return;
            if (ctx.state === 'suspended') ctx.resume();

            const now = ctx.currentTime;
            const oscillator = ctx.createOscillator();
            const gainNode = ctx.createGain();

            oscillator.connect(gainNode);
            gainNode.connect(ctx.destination);
            oscillator.frequency.value = frequency;
            oscillator.type = type;
            gainNode.gain.setValueAtTime(0.3, now);
            gainNode.gain.exponentialRampToValueAtTime(0.0001, now + duration);

            oscillator.start();
            oscillator.stop(now + duration);
        } catch (e) {
            logger.warn('Cannot play sound:', e);
        }
    }

    function playAlert() {
        if (!isEnabled) return;
        playBeep(660, 0.2, 'sine');
        setTimeout(() => playBeep(880, 0.2, 'sine'), 200);
        setTimeout(() => playBeep(1046, 0.3, 'sine'), 400);
    }

    function stopContinuous() {
        if (currentSoundInterval) {
            clearInterval(currentSoundInterval);
            currentSoundInterval = null;
        }
    }

    function startContinuous() {
        if (!isEnabled) return;
        // 重置声音计数器
        // soundCounter = 0;
        // playAlert();
        // soundCounter++;
        // stopContinuous();
        // currentSoundInterval = setInterval(() => {
        //     if (isLockedGetter && isLockedGetter() && isEnabled && soundCounter < MAX_SOUND_PLAYS) {
        //         playAlert();
        //         soundCounter++;
        //         // 如果达到最大次数，停止连续播放
        //         if (soundCounter >= MAX_SOUND_PLAYS) {
        //             stopContinuous();
        //         }
        //     }
        // }, 3000);
        // 现在我们在显示锁屏之前已经播放了三次声音提示
        // 所以锁屏期间不再需要连续播放声音
        console.log('[AUDIO] startContinuous called, but no longer needed');
    }

    async function resume() {
        const ctx = init();
        if (ctx && ctx.state === 'suspended') {
            await ctx.resume();
        }
    }

    return {
        setEnabled,
        setLockedGetter,
        playAlert,
        startContinuous,
        stopContinuous,
        resume
    };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = AudioModule;
if (typeof window !== 'undefined') window.AudioModule = AudioModule;