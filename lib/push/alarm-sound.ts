/**
 * Alarme sonoro do app, sintetizado no navegador.
 *
 * **Por que não um arquivo de áudio:** um .mp3 precisa baixar, pode falhar
 * offline e some do cache. Um oscilador sempre existe, toca instantaneamente e
 * funciona sem rede — num alerta de hipoglicemia, "o som não carregou" não é uma
 * falha aceitável.
 *
 * **Por que isto não substitui a notificação:** o som da notificação do sistema
 * é decidido pelo Android/iOS, não pela página — nenhuma API web permite forçar
 * som ou volume numa notificação push. Este alarme só toca com o **app aberto**.
 * Com o celular no bolso e a tela apagada, quem faz barulho é o sistema
 * operacional, e a configuração é lá (ver o texto na tela de alarmes).
 *
 * **Por que precisa de `primeAudio()`:** navegador bloqueia áudio sem gesto do
 * usuário. Sem destravar o contexto num toque anterior, o alarme falha
 * silenciosamente justamente quando importa.
 */

let ctx: AudioContext | null = null;
let stopTimer: ReturnType<typeof setTimeout> | null = null;
let beatTimer: ReturnType<typeof setInterval> | null = null;
let playing = false;

type AudioContextCtor = typeof AudioContext;

function audioContextCtor(): AudioContextCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { AudioContext?: AudioContextCtor; webkitAudioContext?: AudioContextCtor };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

/**
 * Destrava o áudio. Chamar em resposta a um gesto do usuário (clique, toque) —
 * uma vez por sessão basta.
 */
export function primeAudio(): boolean {
  const Ctor = audioContextCtor();
  if (!Ctor) return false;
  if (!ctx) ctx = new Ctor();
  if (ctx.state === "suspended") void ctx.resume();
  return true;
}

export function isAudioReady(): boolean {
  return ctx != null && ctx.state === "running";
}

/** Um bipe curto. Onda quadrada porque corta ruído ambiente melhor que senoide. */
function beep(frequency: number, startAt: number, durationSec: number): void {
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "square";
  osc.frequency.setValueAtTime(frequency, startAt);

  // Envelope com ataque e queda curtos: sem isso o navegador estala no início
  // e no fim de cada bipe.
  gain.gain.setValueAtTime(0, startAt);
  gain.gain.linearRampToValueAtTime(0.28, startAt + 0.01);
  gain.gain.setValueAtTime(0.28, startAt + durationSec - 0.02);
  gain.gain.linearRampToValueAtTime(0, startAt + durationSec);

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(startAt);
  osc.stop(startAt + durationSec);
}

/** Par de tons alternados — padrão de sirene, mais difícil de ignorar que um tom só. */
function playPattern(): void {
  if (!ctx) return;
  const t = ctx.currentTime;
  beep(880, t, 0.18);
  beep(1320, t + 0.22, 0.18);
}

/**
 * Toca o alarme até `durationMs` ou até `stopAlarm()`.
 * Devolve `false` quando o áudio não pôde ser iniciado (sem gesto prévio, ou
 * navegador sem suporte) — quem chama deve mostrar aviso visual nesse caso, em
 * vez de assumir que o usuário ouviu.
 */
export function playAlarm(durationMs = 25_000): boolean {
  if (!primeAudio() || !ctx) return false;
  if (playing) return true;

  playing = true;
  playPattern();
  beatTimer = setInterval(playPattern, 900);
  stopTimer = setTimeout(stopAlarm, durationMs);
  return true;
}

export function stopAlarm(): void {
  playing = false;
  if (beatTimer) clearInterval(beatTimer);
  if (stopTimer) clearTimeout(stopTimer);
  beatTimer = null;
  stopTimer = null;
}

export function isAlarmPlaying(): boolean {
  return playing;
}
