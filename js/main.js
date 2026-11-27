const RELEASE = new Date(2027, 6, 1, 0, 0, 0, 0);

const UNITS = ["months", "days", "hours", "minutes", "seconds"];
const nodes = Object.fromEntries(
  UNITS.map((unit) => [unit, document.getElementById(unit)])
);
const headline = document.getElementById("headline");
const timer = document.getElementById("timer");
const motionOk = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const clock = (() => {
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return { play() {} };

  let ctx = null;
  let dry = null;
  let wet = null;
  let noiseBuffer = null;
  let armed = false;
  let lastAt = -1;

  function hallBuffer(audio) {
    const length = Math.floor(audio.sampleRate * 1.15);
    const impulse = audio.createBuffer(2, length, audio.sampleRate);
    const taps = [0.056, 0.098, 0.16, 0.25, 0.37, 0.53, 0.72, 0.94];
    for (let channel = 0; channel < 2; channel += 1) {
      const data = impulse.getChannelData(channel);
      for (let i = 0; i < length; i += 1) {
        const decay = (1 - i / length) ** 1.7;
        data[i] = (Math.random() * 2 - 1) * decay * 0.018;
      }
      for (let index = 0; index < taps.length; index += 1) {
        const offset = Math.floor(audio.sampleRate * (taps[index] + channel * 0.016));
        if (offset >= length) continue;
        const level = (1 - index / taps.length) ** 1.1 * (channel === 0 ? 0.42 : 0.3);
        data[offset] += level;
        if (offset + 1 < length) data[offset + 1] += level * 0.5;
        if (offset + 2 < length) data[offset + 2] -= level * 0.2;
      }
    }
    return impulse;
  }

  function ensure() {
    if (ctx) return ctx;
    ctx = new AudioCtx();

    const master = ctx.createGain();
    master.gain.value = 0.85;
    const highpass = ctx.createBiquadFilter();
    highpass.type = "highpass";
    highpass.frequency.value = 55;
    master.connect(highpass);
    highpass.connect(ctx.destination);

    dry = ctx.createGain();
    dry.gain.value = 0.72;
    dry.connect(master);

    wet = ctx.createGain();
    wet.gain.value = 1.05;
    const hollow = ctx.createBiquadFilter();
    hollow.type = "peaking";
    hollow.frequency.value = 230;
    hollow.Q.value = 2.4;
    hollow.gain.value = 8;
    const convolver = ctx.createConvolver();
    convolver.normalize = false;
    convolver.buffer = hallBuffer(ctx);
    const damp = ctx.createBiquadFilter();
    damp.type = "lowpass";
    damp.frequency.value = 720;
    wet.connect(hollow);
    hollow.connect(convolver);
    convolver.connect(damp);
    damp.connect(master);

    const length = Math.floor(ctx.sampleRate * 0.22);
    noiseBuffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
    return ctx;
  }

  function arm() {
    let audio;
    try {
      audio = ensure();
    } catch {
      return;
    }

    const ready = () => {
      if (audio.state !== "running") return;
      const first = !armed;
      armed = true;
      window.removeEventListener("pointerdown", arm);
      window.removeEventListener("keydown", arm);
      if (first) play(Number(nodes.seconds.textContent) || 0, true);
    };

    if (audio.state === "running") {
      ready();
      return;
    }
    audio.resume().then(ready).catch(() => {});
  }

  function colored(audio, source, t, frequency, q, peak, attack, release) {
    const filter = audio.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = frequency;
    filter.Q.value = q;
    const gain = audio.createGain();
    gain.gain.setValueAtTime(0.001, t);
    gain.gain.exponentialRampToValueAtTime(peak, t + attack);
    gain.gain.exponentialRampToValueAtTime(0.001, t + attack + release);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(dry);
    gain.connect(wet);
    return [filter, gain];
  }

  function play(second, force) {
    if (!armed || document.hidden) return;
    const audio = ensure();
    if (audio.state !== "running") return;
    const t = audio.currentTime;
    if (!force && t - lastAt < 0.45) return;
    lastAt = t;

    const low = second % 2 === 0;
    const noise = audio.createBufferSource();
    noise.buffer = noiseBuffer;

    const edge = audio.createBiquadFilter();
    edge.type = "highpass";
    edge.frequency.value = low ? 1500 : 2100;
    const edgeGain = audio.createGain();
    edgeGain.gain.setValueAtTime(0.001, t);
    edgeGain.gain.exponentialRampToValueAtTime(low ? 0.26 : 0.36, t + 0.0015);
    edgeGain.gain.exponentialRampToValueAtTime(0.001, t + 0.015);
    noise.connect(edge);
    edge.connect(edgeGain);
    edgeGain.connect(dry);

    const chamber = colored(
      audio,
      noise,
      t,
      low ? 280 : 440,
      low ? 5 : 4,
      low ? 0.58 : 0.44,
      0.003,
      low ? 0.15 : 0.09
    );
    const air = colored(audio, noise, t, low ? 660 : 880, 3.2, 0.14, 0.002, 0.06);

    noise.start(t);
    noise.stop(t + 0.22);

    const thump = audio.createOscillator();
    thump.type = "sine";
    const thumpHz = low ? 104 : 142;
    thump.frequency.setValueAtTime(thumpHz, t);
    thump.frequency.exponentialRampToValueAtTime(thumpHz * 0.64, t + 0.13);
    const thumpGain = audio.createGain();
    thumpGain.gain.setValueAtTime(0.001, t);
    thumpGain.gain.exponentialRampToValueAtTime(low ? 0.48 : 0.32, t + 0.004);
    thumpGain.gain.exponentialRampToValueAtTime(0.001, t + (low ? 0.22 : 0.15));
    thump.connect(thumpGain);
    thumpGain.connect(dry);
    thump.start(t);
    thump.stop(t + 0.26);

    const ping = audio.createOscillator();
    ping.type = "sine";
    ping.frequency.value = low ? 920 : 1280;
    const pingGain = audio.createGain();
    pingGain.gain.setValueAtTime(0.055, t);
    pingGain.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
    ping.connect(pingGain);
    pingGain.connect(dry);
    ping.start(t);
    ping.stop(t + 0.05);

    const nodes = [noise, edge, edgeGain, ...chamber, ...air, thump, thumpGain, ping, pingGain];
    thump.onended = () => {
      for (const node of nodes) node.disconnect();
    };
  }

  window.addEventListener("pointerdown", arm);
  window.addEventListener("keydown", arm);
  arm();
  return { play };
})();

function addMonths(date, count) {
  const next = new Date(date.getTime());
  const day = next.getDate();
  next.setDate(1);
  next.setMonth(next.getMonth() + count);
  const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
  next.setDate(Math.min(day, lastDay));
  next.setHours(date.getHours(), date.getMinutes(), date.getSeconds(), date.getMilliseconds());
  return next;
}

function countdown(now, target) {
  if (now >= target) {
    return { months: 0, days: 0, hours: 0, minutes: 0, seconds: 0, done: true };
  }

  let months =
    (target.getFullYear() - now.getFullYear()) * 12 + (target.getMonth() - now.getMonth());

  if (addMonths(now, months) > target) months -= 1;
  if (months < 0) months = 0;

  let rest = target.getTime() - addMonths(now, months).getTime();
  const days = Math.floor(rest / 86400000);
  rest -= days * 86400000;
  const hours = Math.floor(rest / 3600000);
  rest -= hours * 3600000;
  const minutes = Math.floor(rest / 60000);
  rest -= minutes * 60000;
  const seconds = Math.floor(rest / 1000);

  return { months, days, hours, minutes, seconds, done: false };
}

function pad(value) {
  return String(value).padStart(2, "0");
}

function paint(parts) {
  if (parts.done) {
    headline.textContent = "Doomsday Is Here";
  }

  const spoken = parts.done
    ? "Doomsday is here. Avengers: Doomsday is in theaters."
    : `${parts.months} months, ${parts.days} days, ${parts.hours} hours, ${parts.minutes} minutes, ${parts.seconds} seconds until ${RELEASE.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}.`;

  if (timer.getAttribute("aria-label") !== spoken) {
    timer.setAttribute("aria-label", spoken);
  }

  for (const unit of UNITS) {
    const next = pad(parts[unit]);
    const node = nodes[unit];
    if (node.textContent !== next) {
      node.textContent = next;
      if (unit === "seconds" && !parts.done) clock.play(parts.seconds);
      if (motionOk) {
        node.classList.remove("tick");
        void node.offsetWidth;
        node.classList.add("tick");
      }
    }
  }
}

function tick() {
  paint(countdown(new Date(), RELEASE));
  window.setTimeout(tick, 1000 - (Date.now() % 1000));
}

tick();

const canvas = document.querySelector(".dust");
if (canvas && motionOk) {
  const ctx = canvas.getContext("2d");
  let specks = [];
  let running = true;

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }

  function makeSpeck(anywhere) {
    return {
      x: Math.random() * canvas.width,
      y: anywhere ? Math.random() * canvas.height : canvas.height + 4,
      r: Math.random() * 1.15 + 0.2,
      a: Math.random() * 0.22 + 0.04,
      s: Math.random() * 0.14 + 0.03,
      drift: (Math.random() - 0.5) * 0.12,
      green: Math.random() > 0.72 ? "57, 255, 20" : "25, 195, 50",
    };
  }

  function seed() {
    const count = Math.min(28, Math.round(window.innerWidth / 56));
    specks = Array.from({ length: count }, () => makeSpeck(true));
  }

  function frame() {
    if (!running) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const speck of specks) {
      speck.y -= speck.s;
      speck.x += speck.drift;
      if (speck.y < -4) {
        Object.assign(speck, makeSpeck(false));
      }
      ctx.beginPath();
      ctx.fillStyle = `rgba(${speck.green}, ${speck.a})`;
      ctx.arc(speck.x, speck.y, speck.r, 0, Math.PI * 2);
      ctx.fill();
    }
    requestAnimationFrame(frame);
  }

  resize();
  seed();
  frame();
  window.addEventListener("resize", () => {
    resize();
    seed();
  });
  document.addEventListener("visibilitychange", () => {
    const wasRunning = running;
    running = !document.hidden;
    if (running && !wasRunning) frame();
  });
}

const emblem = document.getElementById("emblem");
const rig = emblem && emblem.querySelector(".emblem-rig");
if (emblem && rig && motionOk) {
  let introTimer = 0;
  let targetX = 0;
  let targetY = 0;
  let currentX = 0;
  let currentY = 0;

  function playIntro() {
    emblem.classList.remove("is-intro");
    void emblem.offsetWidth;
    emblem.classList.add("is-intro");
    window.clearTimeout(introTimer);
    introTimer = window.setTimeout(() => emblem.classList.remove("is-intro"), 2200);
  }

  function tilt(event) {
    const bounds = emblem.getBoundingClientRect();
    const nx = (event.clientX - (bounds.left + bounds.width / 2)) / (window.innerWidth * 0.5);
    const ny = (event.clientY - (bounds.top + bounds.height / 2)) / (window.innerHeight * 0.5);
    const clamp = (value) => Math.max(-1, Math.min(1, value));
    targetY = clamp(nx) * 8;
    targetX = clamp(-ny) * 6;
    const hx = ((event.clientX - bounds.left) / bounds.width) * 100;
    const hy = ((event.clientY - bounds.top) / bounds.height) * 100;
    emblem.style.setProperty("--hx", `${hx}%`);
    emblem.style.setProperty("--hy", `${hy}%`);
    const over =
      event.clientX >= bounds.left &&
      event.clientX <= bounds.right &&
      event.clientY >= bounds.top &&
      event.clientY <= bounds.bottom;
    emblem.classList.toggle("is-tilting", over);
  }

  function rest() {
    targetX = 0;
    targetY = 0;
    emblem.classList.remove("is-tilting");
  }

  function renderTilt() {
    currentX += (targetX - currentX) * 0.08;
    currentY += (targetY - currentY) * 0.08;
    rig.style.transform = `rotateX(${currentX.toFixed(3)}deg) rotateY(${currentY.toFixed(3)}deg)`;
    requestAnimationFrame(renderTilt);
  }

  emblem.addEventListener("click", playIntro);
  window.addEventListener("pointermove", tilt);
  emblem.addEventListener("pointerleave", rest);
  renderTilt();
  playIntro();
}
