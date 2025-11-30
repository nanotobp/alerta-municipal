const iconEl = document.getElementById("weatherIcon");
const tempEl = document.getElementById("weatherTemp");

async function cargarClima(){
  if (!iconEl || !tempEl) return;
  try {
    const lat = -25.3;
    const lon = -57.64;

    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true`;
    const res = await fetch(url);
    if (!res.ok) throw new Error("Error HTTP clima");

    const data = await res.json();
    const cw = data.current_weather;
    if (!cw) return;

    const t = Math.round(cw.temperature);
    tempEl.textContent = `${t}°C`;
    tempEl.style.opacity = "0";
    setTimeout(()=> tempEl.style.opacity="1", 50);

    const code = cw.weathercode;
    let iconClass = "wi-day-sunny";

    if ([0].includes(code)) iconClass = "wi-day-sunny";
    else if ([1,2].includes(code)) iconClass = "wi-day-cloudy";
    else if ([3].includes(code)) iconClass = "wi-cloudy";
    else if (code >= 51 && code <= 67) iconClass = "wi-showers";
    else if (code >= 71 && code <= 77) iconClass = "wi-snow";
    else if (code >= 80 && code <= 82) iconClass = "wi-day-showers";
    else if (code >= 95) iconClass = "wi-thunderstorm";
    else iconClass = "wi-cloud"; // fallback

    iconEl.className = `wi ${iconClass} weather-icon-anim`;

  } catch (e) {
    console.warn("Error clima:", e);
    iconEl.className = "wi wi-cloud";
    tempEl.textContent = "--°C";
  }
}

cargarClima();
