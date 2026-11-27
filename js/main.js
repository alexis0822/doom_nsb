const RELEASE = new Date(2027, 6, 1, 0, 0, 0, 0);

const UNITS = ["months", "days", "hours", "minutes", "seconds"];
const nodes = Object.fromEntries(
  UNITS.map((unit) => [unit, document.getElementById(unit)])
);
const headline = document.getElementById("headline");
const timer = document.getElementById("timer");
const motionOk = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;

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
    : `${parts.months} months, ${parts.days} days, ${parts.hours} hours, ${parts.minutes} minutes, ${parts.seconds} seconds until December 18, 2026.`;

  if (timer.getAttribute("aria-label") !== spoken) {
    timer.setAttribute("aria-label", spoken);
  }

  for (const unit of UNITS) {
    const next = pad(parts[unit]);
    const node = nodes[unit];
    if (node.textContent !== next) {
      node.textContent = next;
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
      r: Math.random() * 1.25 + 0.25,
      a: Math.random() * 0.28 + 0.06,
      s: Math.random() * 0.22 + 0.05,
      drift: (Math.random() - 0.5) * 0.18,
    };
  }

  function seed() {
    const count = Math.min(56, Math.round(window.innerWidth / 28));
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
      ctx.fillStyle = `rgba(214, 232, 186, ${speck.a})`;
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
