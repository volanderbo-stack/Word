// Запис голосу через MediaRecorder + зрозумілі повідомлення про помилки.

// Перший підтримуваний формат: Chrome/Firefox — webm/ogg, Safari — mp4.
const MIME_CANDIDATES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];

export const MIC_MESSAGES = {
  denied: {
    title: 'Доступ до мікрофона заборонено',
    text: 'Натисніть значок 🔒 ліворуч від адреси сайту → «Мікрофон» → «Дозволити» і оновіть сторінку. На iPhone: Параметри → Safari → Мікрофон. Вправу можна виконувати й без запису: просто говоріть уголос.',
  },
  'no-mic': {
    title: 'Мікрофон не знайдено',
    text: 'Підключіть навушники з мікрофоном або перевірте, чи мікрофон увімкнено в налаштуваннях системи. Вправу можна виконувати й без запису.',
  },
  busy: {
    title: 'Мікрофон зайнятий',
    text: 'Схоже, мікрофон зараз використовує інша програма (дзвінок, диктофон). Закрийте її і спробуйте ще раз.',
  },
  unsupported: {
    title: 'Браузер не підтримує запис',
    text: 'Спробуйте свіжу версію Chrome, Safari або Firefox. Усі вправи працюють і без запису.',
  },
  insecure: {
    title: 'Запис працює лише через безпечне з’єднання',
    text: 'Відкрийте застосунок за адресою https://… або http://localhost (див. README). Вправи працюють і без запису.',
  },
  failed: {
    title: 'Не вдалося записати',
    text: 'Сталася неочікувана помилка. Спробуйте ще раз або перезавантажте сторінку.',
  },
};

export class MicError extends Error {
  constructor(code, cause) {
    super(MIC_MESSAGES[code]?.title ?? code);
    this.code = code;
    this.cause = cause;
  }
}

// 'ok' | 'insecure' | 'unsupported'
export function recordingSupport() {
  if (!window.isSecureContext) return 'insecure';
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') return 'unsupported';
  return 'ok';
}

function errorCode(err) {
  switch (err?.name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
    case 'SecurityError':
      return 'denied';
    case 'NotFoundError':
    case 'DevicesNotFoundError':
    case 'OverconstrainedError':
      return 'no-mic';
    case 'NotReadableError':
    case 'TrackStartError':
    case 'AbortError':
      return 'busy';
    default:
      return 'failed';
  }
}

// Гучність для анімації під час запису (0…1). Якщо Web Audio недоступний — завжди 0.
function createLevelMeter(stream) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    ctx.createMediaStreamSource(stream).connect(analyser);
    const data = new Uint8Array(analyser.fftSize);
    return {
      level() {
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (const v of data) sum += ((v - 128) / 128) ** 2;
        return Math.min(1, Math.sqrt(sum / data.length) * 4);
      },
      close: () => ctx.close().catch(() => {}),
    };
  } catch {
    return { level: () => 0, close() {} };
  }
}

// Починає запис. Повертає сесію: { elapsed, level(), stop() → { blob, duration }, cancel() }.
// Кидає MicError з кодом із MIC_MESSAGES.
export async function startRecording() {
  const support = recordingSupport();
  if (support !== 'ok') throw new MicError(support);

  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true },
    });
  } catch (err) {
    throw new MicError(errorCode(err), err);
  }

  const mimeType = MIME_CANDIDATES.find((t) => MediaRecorder.isTypeSupported?.(t));
  let recorder;
  try {
    recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  } catch (err) {
    stream.getTracks().forEach((t) => t.stop());
    throw new MicError('unsupported', err);
  }

  const chunks = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size) chunks.push(e.data);
  };

  const meter = createLevelMeter(stream);
  const startedAt = performance.now();
  const release = () => {
    meter.close();
    stream.getTracks().forEach((t) => t.stop());
  };

  recorder.start(250);

  return {
    get elapsed() {
      return (performance.now() - startedAt) / 1000;
    },
    level: () => meter.level(),
    stop() {
      // Тривалість рахуємо самі: webm-файли з MediaRecorder її не містять.
      const duration = (performance.now() - startedAt) / 1000;
      return new Promise((resolve, reject) => {
        recorder.onstop = () => {
          release();
          resolve({ blob: new Blob(chunks, { type: recorder.mimeType || mimeType || 'audio/webm' }), duration });
        };
        recorder.onerror = (e) => {
          release();
          reject(new MicError('failed', e.error));
        };
        if (recorder.state === 'inactive') recorder.onstop();
        else recorder.stop();
      });
    },
    cancel() {
      recorder.onstop = null;
      if (recorder.state !== 'inactive') recorder.stop();
      release();
    },
  };
}
