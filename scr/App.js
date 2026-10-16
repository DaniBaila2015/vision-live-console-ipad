import { useEffect, useRef, useState, useCallback } from "react";
import "@/App.css";
import {
  Radio,
  Power,
  Camera,
  Mic,
  MicOff,
  Settings,
  Volume2,
  VolumeX,
  Cpu,
  Zap,
  Eye,
  EyeOff,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import { WaveformVisualizer } from "@/components/WaveformVisualizer";
import { TranscriptPanel } from "@/components/TranscriptPanel";
import { HFLiveClient } from "@/lib/hfLive";

// No GitHub Pages, podes definir o teu URL de backend ou deixar vazio se usares direto
const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || "";
const API = `${BACKEND_URL}/api`;

const MODELS = [
  { id: "meta-llama/Llama-3.2-11B-Vision-Instruct", label: "Llama 3.2 11B Vision" },
  { id: "Qwen/Qwen2.5-VL-7B-Instruct", label: "Qwen2.5-VL 7B" },
];

const STATUS = {
  idle: { label: "Desconectado", color: "#64748B", dot: "bg-slate-500" },
  connecting: { label: "A conectar...", color: "#F59E0B", dot: "bg-amber-400" },
  live: { label: "Ouvindo / Vendo", color: "#10B981", dot: "bg-emerald-400" },
  error: { label: "Erro", color: "#EF4444", dot: "bg-red-500" },
};

export default function App() {
  const [token, setToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [model, setModel] = useState(MODELS[0].id);
  const [intervalSec, setIntervalSec] = useState(8);
  const [videoSource, setVideoSource] = useState("camera");
  const [mode, setMode] = useState("auto");
  const [muted, setMuted] = useState(false);

  const [status, setStatus] = useState("idle");
  const [thinking, setThinking] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [micLevel, setMicLevel] = useState(0);
  const [frame, setFrame] = useState(null);
  const [messages, setMessages] = useState([]);
  const [error, setError] = useState("");
  const [analyser, setAnalyser] = useState(null);

  const clientRef = useRef(null);

  const addMessage = useCallback((role, text) => {
    setMessages((prev) => {
      const last = prev[prev.length - 1];
      if (last && last.role === role && Date.now() - last.ts < 1500) {
        const copy = [...prev];
        copy[copy.length - 1] = {
          ...last,
          text: (last.text + " " + text).trim(),
          ts: Date.now(),
        };
        return copy;
      }
      return [
        ...prev,
        { id: `${Date.now()}-${Math.random()}`, role, text, ts: Date.now() },
      ];
    });
  }, []);

  const handleStop = useCallback(() => {
    if (clientRef.current) {
      clientRef.current.stop();
      clientRef.current = null;
    }
    setStatus("idle");
    setThinking(false);
    setSpeaking(false);
    setMicLevel(0);
    setFrame(null);
    setAnalyser(null);
  }, []);

  const handleCapture = () => {
    if (clientRef.current && status === "live" && !thinking) {
      clientRef.current.captureOnce(5000);
      toast.message("A captar câmara...", {
        description: "Fale agora enquanto o iPad observa o ambiente.",
      });
    }
  };

  const toggleMute = () => {
    setMuted((m) => {
      const nv = !m;
      if (clientRef.current) clientRef.current.setMuted(nv);
      toast.message(nv ? "Voz da IA desligada" : "Voz da IA ligada");
      return nv;
    });
  };

  const handleStart = async () => {
    setError("");
    if (!token.trim()) {
      setError("Cole primeiro o seu token da Hugging Face.");
      toast.error("Token em falta");
      return;
    }
    setStatus("connecting");
    setMessages([]);

    const client = new HFLiveClient({
      apiBase: API,
      token: token.trim(),
      model,
      intervalMs: intervalSec * 1000,
      videoSource,
      mode,
      muted,
      callbacks: {
        onFrame: (dataUrl) => setFrame(dataUrl),
        onMicLevel: (lvl) => setMicLevel(lvl),
        onTranscript: (role, text) => addMessage(role, text),
        onThinking: (v) => setThinking(v),
        onSpeaking: (v) => setSpeaking(v),
        onScreenEnded = () => {
          toast.message("Fonte de vídeo terminada");
          handleStop();
        },
        onError: (msg) => {
          setError(msg);
          toast.error("Erro na IA", { description: msg });
        },
      },
    });

    try {
      await client.start({ mic: true, video: true });
      clientRef.current = client;
      setAnalyser(client.getMicAnalyser());
      setStatus("live");
      toast.success("IA ligada", {
        description: "A observar a câmara e a ouvir o microfone.",
      });
    } catch (err) {
      client.stop();
      setError(err.message || "Erro de permissão");
      setStatus("error");
      toast.error("Não foi possível ligar", { description: err.message });
    }
  };

  useEffect(() => {
    return () => {
      if (clientRef.current) clientRef.current.stop();
    };
  }, []);

  const isLive = status === "live";
  const s = STATUS[status];

  return (
    <div className="dark min-h-screen w-full bg-[#0B0F19] text-slate-100 p-4 font-sans antialiased selection:bg-emerald-500/30">
      <Toaster position="top-center" theme="dark" />

      <div className="mx-auto max-w-6xl grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Painel Esquerdo: Configurações e Status */}
        <div className="space-y-6 bg-[#131926] p-5 rounded-2xl border border-slate-800 shadow-xl">
          <div className="flex items-center gap-3 border-b border-slate-800 pb-4">
            <Radio className={`w-6 h-6 ${isLive ? "text-emerald-400 animate-pulse" : "text-slate-500"}`} />
            <div>
              <h1 className="text-lg font-bold">Vision Live</h1>
              <span className="text-xs font-mono text-slate-500">Hugging Face Client</span>
            </div>
          </div>

          {/* Status Badge */}
          <div className="flex items-center justify-between bg-[#1A2333] px-4 py-3 rounded-xl border border-slate-800">
            <span className="text-sm font-medium">Status do Sistema:</span>
            <div className="flex items-center gap-2">
              <span className={`w-2.5 h-2.5 rounded-full ${s.dot}`} />
              <span className="text-sm font-semibold" style={{ color: s.color }}>{s.label}</span>
            </div>
          </div>

          {/* Input de Token */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-400 tracking-wider uppercase">Token Hugging Face</label>
            <div className="relative">
              <Input
                type={showToken ? "text" : "password"}
                placeholder="hf_..."
                value={token}
                onChange={(e) => setToken(e.target.value)}
                className="bg-[#1A2333] border-slate-800 focus:border-emerald-500 focus:ring-emerald-500/20 rounded-xl pr-10"
              />
              <button
                type="button"
                onClick={() => setShowToken(!showToken)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
              >
                {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Seleção de Modelo */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-400 tracking-wider uppercase">Modelo de Visão</label>
            <Select value={model} onValueChange={setModel}>
              <SelectTrigger className="bg-[#1A2333] border-slate-800 rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-[#131926] border-slate-800 text-slate-100">
                {MODELS.map((m) => (
                  <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Slider de Intervalo */}
          <div className="space-y-2">
            <div className="flex justify-between text-xs font-semibold text-slate-400">
              <span className="tracking-wider uppercase">Intervalo de Captura</span>
              <span className="text-emerald-400 font-mono">{intervalSec}s</span>
            </div>
            <Slider
              value={[intervalSec]}
              min={4}
              max={20}
              step={1}
              onValueChange={(v) => setIntervalSec(v[0])}
              className="py-2"
            />
          </div>

          {/* Alerta de Erro */}
          {error && (
            <div className="flex items-start gap-2.5 p-3.5 rounded-xl border border-red-500/20 bg-red-500/5 text-red-200 text-xs leading-relaxed">
              <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* Painel Central: Visualização da Câmara e Botão Principal */}
        <div className="md:col-span-2 flex flex-col justify-between bg-[#131926] p-6 rounded-2xl border border-slate-800 shadow-xl min-h-[500px]">
          {/* Tela de Pré-visualização da Câmara */}
          <div className="relative flex-1 w-full bg-[#0B0F19] rounded-xl border border-slate-800/60 overflow-hidden flex items-center justify-center">
            {frame ? (
              <img src={frame} alt="Preview do iPad" className="w-full h-full object-cover" />
            ) : (
              <div className="flex flex-col items-center gap-3 text-slate-600">
                <Camera className="w-12 h-12 stroke-[1.2]" />
                <span className="text-sm font-medium tracking-wide">Câmara Desconectada</span>
              </div>
            )}
            
            {/* Indicador de Processamento */}{thinking && (
  <div className="absolute top-4 right-4 bg-amber-500/90 text-slate-950 font-bold text-xs px-3 py-1.5 rounded-full flex items-center gap-1.5 shadow-lg backdrop-blur">
    <Loader2 className="w-3.5 h-3.5 animate-spin" />
    IA a pensar...
  </div>
)}

{/* Rodapé Central: Botão de Ativação e Feedback */}
<div className="mt-6 flex flex-col items-center gap-4">
  <WaveformVisualizer analyser={analyser} micLevel={micLevel} isLive={isLive} />

  <div className="flex items-center gap-4 w-full sm:w-auto">
    <button
      onClick={toggleMute}
      className={`p-3.5 rounded-xl border shadow-md transition-all ${
        muted 
          ? "bg-red-500/10 border-red-500/30 text-red-400 hover:bg-red-500/20" 
          : "bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700"
      }`}
    >
      {muted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
    </button>

    {!isLive ? (
      <button
        onClick={handleStart}
        className="flex-1 sm:flex-none flex items-center justify-center gap-2.5 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-slate-950 font-bold px-8 py-4 rounded-xl shadow-lg shadow-emerald-500/10 active:scale-[0.98] transition-all"
      >
        <Power className="w-5 h-5 stroke-[2.5]" />
        Ligar à IA
      </button>
    ) : (
      <button
        onClick={handleStop}
        className="flex-1 sm:flex-none flex items-center justify-center gap-2.5 bg-red-600 hover:bg-red-700 text-white font-bold px-8 py-4 rounded-xl shadow-lg shadow-red-600/10 active:scale-[0.98] transition-all"
      >
        <Power className="w-5 h-5 stroke-[2.5]" />
        Desligar
      </button>
    )}

    <button
      onClick={handleCapture}
      disabled={!isLive || thinking}
      className="p-3.5 rounded-xl bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
      title="Capturar Manual"
    >
      <Zap className="w-5 h-5" />
    </button>
  </div>
</div>

{/* Painel Inferior: Transcrições em Tempo Real */}
<div className="mx-auto max-w-6xl mt-6">
  <TranscriptPanel messages={messages} speaking={speaking} />
</div>
