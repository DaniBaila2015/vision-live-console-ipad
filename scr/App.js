// Cliente "live" da Hugging Face: captura de câmara/ecrã + gravação do microfone em ciclos.
// Cada ciclo: grava mic -> transcreve (Whisper) -> envia o último frame + texto
// a um modelo de visão -> emite a resposta em texto. A voz de saída usa a Web Speech API.
// Todas as chamadas à HF passam pelo proxy FastAPI; o token viaja só no header Authorization.

function pickRecorderMime() {
  const candidates = [
    "audio/mp4",              // Safari / iPad
    "audio/webm;codecs=opus",
    "audio/webm",
  ];
  if (typeof MediaRecorder === "undefined") return "";
  return candidates.find((t) => MediaRecorder.isTypeSupported(t)) || "";
}

export class HFLiveClient {
  constructor({
    apiBase,
    token,
    model,
    systemInstruction,
    intervalMs = 8000,
    videoSource = "camera", // "camera" (fallback iPad) | "screen"
    mode = "auto",          // "auto" (ciclo temporizado) | "manual" (sob pedido)
    muted = false,
    callbacks = {},
  }) {
    this.apiBase = apiBase;
    this.token = token;
    this.model = model || "meta-llama/Llama-3.2-11B-Vision-Instruct";
    this.systemInstruction =
      systemInstruction ||
      "És um assistente que observa a câmara/ecrã e ouve o utilizador. Responde de forma breve, clara e em português de Portugal.";
    this.intervalMs = intervalMs;
    this.videoSource = videoSource;
    this.mode = mode;
    this.muted = muted;
    this.cb = callbacks;

    this.micStream = null;
    this.videoStream = null;
    this.audioCtx = null;
    this.analyser = null;
    this.sourceNode = null;

    this.videoEl = null;
    this.canvas = document.createElement("canvas");
    this.latestFrame = null;

    this.recorder = null;
    this.recorderMime = pickRecorderMime();
    this.running = false;
    this.cycleTimer = null;
    this.frameTimer = null;
    this.busy = false;
  }

  emit(name, ...args) {
    if (typeof this.cb[name] === "function") this.cb[name](...args);
  }

  async start({ mic = true, video = true } = {}) {
    if (video) {
      if (this.videoSource === "camera") {
        this.videoStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment", width: 1280, height: 720 },
        });
      } else {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
          throw new Error(
            "A captura de ecrã não é suportada neste navegador. No iPad use a opção Câmara.",
          );
        }
        this.videoStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      }
      this.startVideoPipeline();
    }

    if (mic) {
      this.micStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      this.startMicAnalyser();
    }

    this.running = true;
    if (this.mode === "auto") this.runCycle();
    return true;
  }

  startMicAnalyser() {
    this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    this.sourceNode = this.audioCtx.createMediaStreamSource(this.micStream);
    this.analyser = this.audioCtx.createAnalyser();
    this.analyser.fftSize = 512;
    this.sourceNode.connect(this.analyser);

    const data = new Uint8Array(this.analyser.frequencyBinCount);
    const tick = () => {
      if (!this.running || !this.analyser) return;
      this.analyser.getByteFrequencyData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) sum += data[i];
      this.emit("onMicLevel", sum / data.length / 255);
      this.levelRaf = requestAnimationFrame(tick);
    };
    tick();
  }

  getMicAnalyser() {
    return this.analyser;
  }

  startVideoPipeline() {
    this.videoEl = document.createElement("video");
    this.videoEl.srcObject = this.videoStream;
    this.videoEl.muted = true;
    this.videoEl.playsInline = true;
    this.videoEl.play().catch(() => {});

    const track = this.videoStream.getVideoTracks()[0];
    if (track) track.onended = () => this.emit("onScreenEnded");

    const ctx = this.canvas.getContext("2d");
    this.frameTimer = setInterval(() => {
      if (!this.videoEl || this.videoEl.videoWidth === 0) return;
      const maxW = 1024;
      const scale = Math.min(1, maxW / this.videoEl.videoWidth);
      this.canvas.width = Math.round(this.videoEl.videoWidth * scale);
      this.canvas.height = Math.round(this.videoEl.videoHeight * scale);
      ctx.drawImage(this.videoEl, 0, 0, this.canvas.width, this.canvas.height);
      this.latestFrame = this.canvas.toDataURL("image/jpeg", 0.6);
      this.emit("onFrame", this.latestFrame, this.canvas.width, this.canvas.height);
    }, 500);
  }

  recordAndProcess(continueLoop, durationMs) {
    if (!this.running) return;

    if (this.micStream && this.recorderMime) {
      const chunks = [];
      let recorder;
      try {
        recorder = new MediaRecorder(this.micStream, { mimeType: this.recorderMime });
      } catch (e) {
        recorder = new MediaRecorder(this.micStream);
      }
      this.recorder = recorder;
      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) chunks.push(ev.data);
      };
      recorder.onstop = async () => {
        const blob = new Blob(chunks, { type: this.recorderMime || "audio/webm" });
        await this.process(blob);
        if (continueLoop && this.running)
          this.cycleTimer = setTimeout(() => this.runCycle(), 300);
      };
      recorder.start();
      setTimeout(() => {
        if (recorder.state !== "inactive") recorder.stop();
      }, durationMs);
    } else {
      if (continueLoop) {
        this.cycleTimer = setTimeout(async () => {
          await this.process(null);
          if (this.running) this.runCycle();
        }, durationMs);
      } else {
        this.process(null);
      }
    }
  }

  runCycle() {
    this.recordAndProcess(true, this.intervalMs);
  }

  captureOnce(durationMs = 5000) {
    if (!this.running || this.busy) return;
    this.recordAndProcess(false, durationMs);
  }

  setMuted(m) {
    this.muted = m;
    if (m && typeof window.speechSynthesis !== "undefined")
      window.speechSynthesis.cancel();
  }

  async process(audioBlob) {
    if (!this.running || this.busy) return;
    this.busy = true;
    this.emit("onThinking", true);
    try {
      let transcript = "";
      if (audioBlob && audioBlob.size > 1200) {
        transcript = await this.transcribe(audioBlob);
        if (transcript && transcript.trim()) this.emit("onTranscript", "user", transcript.trim());
      }

      const prompt =
        transcript && transcript.trim()
          ? transcript.trim()
          : "Observa a imagem atual (câmara ou ecrã) e descreve de forma breve o que estás a ver.";

      const answer = await this.vision(prompt);
      if (answer && answer.trim()) {
        this.emit("onTranscript", "ai", answer.trim());
        this.speak(answer.trim());
      }
    } catch (err) {
      this.emit("onError", err.message || "Erro no pedido à Hugging Face.");
    } finally {
      this.busy = false;
      this.emit("onThinking", false);
    }
  }

  async transcribe(blob) {
    const form = new FormData();
    const ext = (this.recorderMime || "audio/webm").includes("mp4") ? "m4a" : "webm";
    form.append("file", blob, `clip.${ext}`);
    const r = await fetch(`${this.apiBase}/transcribe`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.token}` },
      body: form,
    });
    if (!r.ok) {
      const t = await r.text();
      throw new Error(`Transcrição falhou (${r.status}): ${t.slice(0, 100)}`);
    }
    const data = await r.json();
    return data.text || "";
  }

  async vision(prompt) {
    if (!this.latestFrame) return "Nenhuma imagem capturada da câmara ainda.";
    const cleanBase64 = this.latestFrame.replace(/^data:image\/\w+;base64,/, "");
    
    const r = await fetch(`${this.apiBase}/vision`, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.token}`
      },
      body: JSON.stringify({
        model: this.model,
        prompt: prompt,
        systemInstruction: this.systemInstruction,
        image: cleanBase64
      }),
    });
    if (!r.ok) {
      const t = await r.text();
      throw new Error(`Pedido de visão falhou (${r.status}): ${t.slice(0, 100)}`);
    }
    const data = await r.json();
    return data.answer || "";
  }

  speak(text) {
    if (this.muted || typeof window.speechSynthesis === "undefined") return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "pt-PT";
    this.emit("onSpeaking", true);
    utterance.onend = () => this.emit("onSpeaking", false);
    utterance.onerror = () => this.emit("onSpeaking", false);
    window.speechSynthesis.speak(utterance);
  }

  stop() {
    this.running = false;
    if (this.cycleTimer) clearTimeout(this.cycleTimer);
    if (this.frameTimer) clearInterval(this.frameTimer);
    if (this.levelRaf) cancelAnimationFrame(this.levelRaf);
    if (this.recorder && this.recorder.state !== "inactive") {
      try { this.recorder.stop(); } catch(e){}
    }
    if (this.videoStream) this.videoStream.getTracks().forEach(t => t.stop());
    if (this.micStream) this.micStream.getTracks().forEach(t => t.stop());
    if (typeof window.speechSynthesis !== "undefined") window.speechSynthesis.cancel();
  }
}
