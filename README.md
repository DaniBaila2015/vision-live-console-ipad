markdown
# 🎙️ Vision Live Console (iPad Edition)

Uma aplicação web moderna e em Modo Escuro, desenvolvida em **React** e **Tailwind CSS**, totalmente otimizada para o Safari do iPad. Este projeto conecta-se às APIs gratuitas da **Hugging Face** para criar uma experiência interativa de Inteligência Artificial com visão e voz em tempo real.

---

## ✨ Funcionalidades

- 📸 **Captura Inteligente via Câmara:** Desenvolvido especialmente para contornar as limitações do Safari do iPadOS, utilizando a câmara traseira/frontal de forma contínua.
- 🎙️ **Transcrição de Voz ao Vivo:** Grava o microfone em ciclos rápidos e usa o modelo **Whisper-large-v3** para transcrever o que tu dizes.
- 👁️ **Análise Multimodal:** Envia os frames da câmara e a tua pergunta para o modelo **Llama-3.2-11B-Vision**, permitindo que a IA "veja" o teu ambiente.
- 🗣️ **Resposta por Voz:** Utiliza a Web Speech API nativa do iPad para ler as respostas da IA em voz alta com sotaque de Portugal (`pt-PT`).
- 🔒 **Segurança e Privacidade:** O teu Token da Hugging Face é inserido diretamente na interface e fica guardado apenas na sessão do teu navegador.

---

## 🛠️ Tecnologias Utilizadas

- **Frontend:** React.js, Tailwind CSS, Lucide React (Ícones)
- **APIs de IA:** Hugging Face Serverless Inference API (Whisper + Llama 3.2 Vision)
- **Web APIs:** `getUserMedia` (Áudio e Vídeo), `AudioContext` (Análise de ondas do microfone) e `SpeechSynthesis` (Voz da IA)

---

## 🚀 Como Usar

1. Cria uma conta gratuita e gera o teu token de leitura em [huggingface.co](https://huggingface.co).
2. Abre a aplicação no Safari do teu iPad.
3. Cola o teu token no campo **Token Hugging Face**.
4. Clica no grande botão central **Ligar à IA** e aceita as permissões de câmara e microfone.
5. Fala com a IA enquanto apontas a câmara para o que queres que ela veja!
