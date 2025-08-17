/* Overlay logic written vanilla for Streamlabs/OBS Browser Source */
const state = {
  config: null,
  tickerIdx: 0,
  ttsTimer: null
};

async function loadConfig() {
  try {
    const res = await fetch('config.json', {cache: 'no-store'});
    if (!res.ok) throw new Error('config.json not found, using defaults');
    state.config = await res.json();
  } catch (e) {
    console.warn(e.message);
    const res = await fetch('config.sample.json');
    state.config = await res.json();
  }
  applyBranding();
}

function applyBranding() {
  const { branding, location } = state.config;
  document.querySelector(':root').style.setProperty('--accent', branding.accent || '#36a2ff');
  document.getElementById('title').textContent = branding.title;
  document.getElementById('subtitle').textContent = branding.subtitle;
  document.getElementById('location').textContent = location.region || location.city;
}

function startClock() {
  const tz = state.config.location.timezone || 'America/Toronto';
  setInterval(() => {
    const now = new Date();
    const fmt = new Intl.DateTimeFormat('en-CA', {hour:'2-digit', minute:'2-digit', timeZone: tz});
    document.getElementById('clock').textContent = fmt.format(now);
  }, 1000);
}

function kmh(ms){return Math.round(ms * 3.6);}

async function updateWeather() {
  const { provider } = state.config.weather;
  try {
    if (provider === 'open-meteo') {
      await fetchWeatherOpenMeteo();
    } else {
      // mock
      setWeatherUI({
        temp: 22, feels: 24, windKmh: 18, pop: 30, uv: 5,
        desc: 'Partly cloudy with a slight chance of melodrama',
        forecast: [
          {label:'1 PM', t:23}, {label:'2 PM', t:24}, {label:'3 PM', t:25},
          {label:'4 PM', t:25}, {label:'5 PM', t:24}, {label:'6 PM', t:22}
        ]
      });
    }
  } catch (e) {
    console.error(e);
  }
  const sec = state.config.weather.update_seconds || 300;
  setTimeout(updateWeather, sec*1000);
}

async function fetchWeatherOpenMeteo() {
  const { lat, lon } = state.config.location;
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=temperature_2m,precipitation_probability,uv_index&current=temperature_2m,apparent_temperature,wind_speed_10m,weather_code&temperature_unit=celsius&windspeed_unit=kmh&timezone=auto`;
  const res = await fetch(url);
  const data = await res.json();
  const cur = data.current;
  const hourly = data.hourly;
  const nextHours = hourly.time.slice(0,6).map((t,i)=>({label: new Date(t).toLocaleTimeString('en-CA',{hour:'numeric'}), t: Math.round(hourly.temperature_2m[i])}));
  setWeatherUI({
    temp: Math.round(cur.temperature_2m),
    feels: Math.round(cur.apparent_temperature),
    windKmh: Math.round(cur.wind_speed_10m),
    pop: Math.max(...hourly.precipitation_probability.slice(0,6)),
    uv: Math.max(...hourly.uv_index.slice(0,6)),
    desc: codeToText(cur.weather_code),
    forecast: nextHours
  });
}

function codeToText(code){
  // minimal mapping
  const m = {
    0:'Clear',
    1:'Mainly clear',
    2:'Partly cloudy',
    3:'Overcast',
    45:'Fog',
    48:'Rime fog',
    51:'Drizzle',
    61:'Rain',
    71:'Snow',
    80:'Showers',
    95:'Thunderstorms'
  };
  return m[code] || 'Weather-ish';
}

function setWeatherUI(wx){
  document.getElementById('w-temp').textContent = `${wx.temp}°`;
  document.getElementById('w-desc').textContent = wx.desc;
  document.getElementById('wt-temp').textContent = wx.temp;
  document.getElementById('wt-feels').textContent = `${wx.feels}°C`;
  document.getElementById('wt-wind').textContent = `${wx.windKmh} km/h`;
  document.getElementById('wt-pop').textContent = `${wx.pop}%`;
  document.getElementById('wt-uv').textContent = wx.uv;
  document.getElementById('wt-desc').textContent = wx.desc;
  const fWrap = document.getElementById('wx-forecast');
  fWrap.innerHTML = '';
  wx.forecast.forEach(x=>{
    const el = document.createElement('div');
    el.className = 'f';
    el.innerHTML = `<div class="label">${x.label}</div><div class="val"><strong>${x.t}°</strong></div>`;
    fWrap.appendChild(el);
  });
}

async function updateTraffic(){
  const prov = state.config.traffic.provider;
  const list = document.getElementById('travel-list');
  list.innerHTML = '';
  const routes = state.config.traffic.routes;
  if (prov === 'mock') {
    routes.forEach((r,i)=>{
      const min = [22, 35, 48][i % 3];
      const status = min < 25 ? 'good' : min < 40 ? 'warn' : 'bad';
      const li = document.createElement('li');
      li.innerHTML = `<span class="name">${r.name}</span>
        <span class="stat ${status}">${min} min</span>
        <span class="badge">${status === 'good' ? 'Normal' : status === 'warn' ? 'Slow' : 'Heavy'}</span>`;
      list.appendChild(li);
    });
  } else {
    // placeholder for real API wiring
  }
  const sec = state.config.traffic.update_seconds || 120;
  setTimeout(updateTraffic, sec*1000);
}

async function updateTransit(){
  const prov = state.config.transit.provider;
  const list = document.getElementById('transit-list');
  list.innerHTML = '';
  if (prov === 'mock') {
    const rows = [
      {route:'ION 301', status:'10 min delay at Fairway', sev:'warn'},
      {route:'7 Mainline', status:'15 min delay due to traffic', sev:'bad'},
      {route:'201 Fischer-Hallman iXpress', status:'On time', sev:'good'}
    ];
    rows.slice(0, state.config.transit.max_rows).forEach(r=>{
      const li = document.createElement('li');
      li.innerHTML = `<span class="name">${r.route}</span>
        <span class="stat ${r.sev}">${r.status}</span>`;
      list.appendChild(li);
    });
  } else {
    // placeholder: fetch GTFS-RT and compute delays
  }
  const sec = state.config.transit.update_seconds || 60;
  setTimeout(updateTransit, sec*1000);
}

function startTicker(){
  const wrap = document.getElementById('ticker');
  const items = state.config.ticker.items;
  // Build items
  wrap.innerHTML = items.map(t => `<span class="item">• ${t}</span>`).join('');
  // Animate
  const speed = state.config.ticker.speed_px_per_sec || 80;
  let x = window.innerWidth;
  function step(){
    x -= (speed/60);
    if (x < -wrap.scrollWidth) x = window.innerWidth;
    wrap.style.transform = `translateX(${x}px)`;
    requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

function startTTS(){
  if (!state.config.tts.enabled) return;
  const synth = window.speechSynthesis;
  function speakOnce(){
    const lines = [];
    const t = document.querySelector('#travel-list').innerText.replace(/\n/g, '. ');
    const w = document.getElementById('wt-desc').textContent;
    const temp = document.getElementById('wt-temp').textContent;
    lines.push(`Weather: ${w}, ${temp} degrees.`);
    lines.push(`Travel times: ${t}.`);
    const txt = new SpeechSynthesisUtterance(lines.join(' '));
    const voice = synth.getVoices().find(v => v.name.toLowerCase().includes((state.config.tts.voice_hint||'').toLowerCase())) || synth.getVoices()[0];
    if (voice) txt.voice = voice;
    synth.cancel();
    synth.speak(txt);
  }
  setTimeout(()=>{
    speakOnce();
    state.ttsTimer = setInterval(speakOnce, (state.config.tts.every_seconds||45)*1000);
  }, 1000);
}

(async function init(){
  await loadConfig();
  if (state.config.modules.clock) startClock();
  if (state.config.modules.weather) updateWeather();
  if (state.config.modules.traffic) updateTraffic();
  if (state.config.modules.transit) updateTransit();
  if (state.config.modules.ticker) startTicker();
  startTTS();
})();
