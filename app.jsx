// app.jsx
const { useState, useEffect } = React;

function Tabs({ tabs, current, setCurrent }) {
  return (
    <div className="tabs">
      {tabs.map((t) => (
        <button
          key={t}
          className={`tab ${current === t ? "active" : ""}`}
          onClick={() => setCurrent(t)}
        >
          {t}
        </button>
      ))}
    </div>
  );
}

/* Helpers CSV (muy simples): parse CSV into array of objects (header line expected),
   and convert array of objects to CSV string.
*/
function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (lines.length === 0) return [];
  const headers = lines[0].split(",").map((h) => h.trim());
  const rows = lines.slice(1).map((ln) => {
    const cols = ln.split(",").map((c) => c.trim());
    const obj = {};
    headers.forEach((h, i) => (obj[h] = cols[i] ?? ""));
    return obj;
  });
  return rows;
}

function toCSV(objects) {
  if (!objects || objects.length === 0) return "";
  const headers = Object.keys(objects[0]);
  const lines = [
    headers.join(","),
    ...objects.map((o) => headers.map((h) => (o[h] ?? "")).join(",")),
  ];
  return lines.join("\n");
}

/* Manage persistent data via localStorage keys */
const STORAGE_KEYS = {
  production: "mto_production",
  shifts: "mto_shifts",
  ots_correctivas: "mto_ots_correctivas",
  ots_preventivas: "mto_ots_preventivas",
  economic: "mto_economic",
  config: "mto_config",
};

function load(key, defaultValue) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : defaultValue;
  } catch (e) {
    console.error("load parse error", e);
    return defaultValue;
  }
}
function save(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

/* Dashboard placeholder: compute and show simple KPIs from stored data.
   These are simplified calculations to be extended con reglas reales.
*/
function Dashboard() {
  const production = load(STORAGE_KEYS.production, []);
  const economic = load(STORAGE_KEYS.economic, { mantenimiento_gasto: 0, energia_gasto: 0 });
  const otsC = load(STORAGE_KEYS.ots_correctivas, []);
  const otsP = load(STORAGE_KEYS.ots_preventivas, []);
  const config = load(STORAGE_KEYS.config, { sectores: [] });

  // Simple KPIs examples (placeholders)
  const totalProducedKg = production.reduce((s, p) => s + Number(p.kg_producidos || 0), 0);
  const totalReprocesoKg = production.reduce((s, p) => s + Number(p.reproceso || 0), 0);
  const totalDecomisoKg = production.reduce((s, p) => s + Number(p.decomiso || 0), 0);

  const mtbf = otsC.length > 0 ? (Number(otsC.length) * 10).toFixed(1) : "N/A"; // placeholder
  const mttr = otsC.length > 0 ? (otsC.reduce((s,o)=>s+ (Number(o.tiempo_horas)||1),0)/otsC.length).toFixed(1) : "N/A";

  const gastoTotal = Number(economic.mantenimiento_gasto || 0);
  const energiaTon = totalProducedKg > 0 ? (Number(economic.energia_gasto || 0) / (totalProducedKg/1000)).toFixed(2) : "N/A";

  // Supervisores resumen (very basic)
  const supervisores = {};
  const shifts = load(STORAGE_KEYS.shifts, []);
  shifts.forEach((s) => {
    const sup = s.supervisor || "Sin asignar";
    supervisores[sup] = supervisores[sup] || { turnos: 0 };
    supervisores[sup].turnos++;
  });

  return (
    <div className="dashboard">
      <h2>Dashboard — Indicadores (resumen)</h2>
      <div className="kpi-row">
        <div className="kpi">
          <div className="kpi-title">MTBF</div>
          <div className="kpi-value">{mtbf}</div>
        </div>
        <div className="kpi">
          <div className="kpi-title">MTTR (hrs)</div>
          <div className="kpi-value">{mttr}</div>
        </div>
        <div className="kpi">
          <div className="kpi-title">% Prev / % Corr</div>
          <div className="kpi-value">
            {otsP.length + " prev"} / {otsC.length + " corr"}
          </div>
        </div>
        <div className="kpi">
          <div className="kpi-title">Disponibilidad</div>
          <div className="kpi-value">--</div>
        </div>
      </div>

      <h3>KPI Producción</h3>
      <div className="grid">
        <div className="card">
          <strong>Kg producidos:</strong> {totalProducedKg}
        </div>
        <div className="card">
          <strong>Reproceso (kg):</strong> {totalReprocesoKg}
        </div>
        <div className="card">
          <strong>Decomiso (kg):</strong> {totalDecomisoKg}
        </div>
      </div>

      <h3>Resumen por Supervisor</h3>
      <div className="card-list">
        {Object.keys(supervisores).length === 0 ? (
          <div className="card">No hay datos de turnos.</div>
        ) : (
          Object.entries(supervisores).map(([sup, data]) => (
            <div className="card" key={sup}> 
              <strong>{sup}</strong>
              <div>Turnos registrados: {data.turnos}</div>
            </div>
          ))
        )}
      </div>

      <h3>Gastos</h3>
      <div className="grid">
        <div className="card">
          <strong>Gasto total mantenimiento (USD):</strong> {gastoTotal}
        </div>
        <div className="card">
          <strong>Costo energético (USD / ton):</strong> {energiaTon}
        </div>
      </div>

      <p className="muted">KPIs mostrados son simplificados; puedo ampliar los cálculos según reglas y campos reales.</p>
    </div>
  );
}

/* Pestaña 2 - Carga de datos */
function CargaDatos() {
  const [production, setProduction] = useState(load(STORAGE_KEYS.production, []));
  const [newShift, setNewShift] = useState({ fecha: "", turno: "", supervisor: "", line: "", eficiencia: "" });
  const [otsC, setOtsC] = useState(load(STORAGE_KEYS.ots_correctivas, []));
  const [otsP, setOtsP] = useState(load(STORAGE_KEYS.ots_preventivas, []));
  const [economic, setEconomic] = useState(load(STORAGE_KEYS.economic, { mantenimiento_gasto: 0, energia_gasto: 0 }));

  useEffect(() => save(STORAGE_KEYS.production, production), [production]);
  useEffect(() => save(STORAGE_KEYS.ots_correctivas, otsC), [otsC]);
  useEffect(() => save(STORAGE_KEYS.ots_preventivas, otsP), [otsP]);
  useEffect(() => save(STORAGE_KEYS.economic, economic), [economic]);

  function handleCSVImport(ev) {
    const file = ev.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target.result;
      const rows = parseCSV(text);
      // Append to production
      const merged = [...production, ...rows];
      setProduction(merged);
      alert("CSV importado: " + rows.length + " filas");
    };
    reader.readAsText(file);
    ev.target.value = "";
  }

  function handleProductionExport() {
    const csv = toCSV(production);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "produccion_export.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  function addShift() {
    setNewShift({ fecha: "", turno: "", supervisor: "", line: "", eficiencia: "" });
    const shifts = load(STORAGE_KEYS.shifts, []);
    shifts.push(newShift);
    save(STORAGE_KEYS.shifts, shifts);
    alert("Turno guardado.");
  }

  function addOT(type) {
    const ot = {
      id: Date.now(),
      fecha: new Date().toISOString(),
      descripcion: prompt("Descripcion OT:", "") || "",
      tiempo_horas: prompt("Tiempo (hrs):", "1") || "1",
    };
    if (type === "C") {
      const next = [...otsC, ot];
      setOtsC(next);
    } else {
      const next = [...otsP, ot];
      setOtsP(next);
    }
  }

  return (
    <div className="carga-datos">
      <h2>Carga de datos</h2>

      <section className="card">
        <h3>Producción — Importar / Exportar CSV</h3>
        <input type="file" accept=".csv,text/csv" onChange={handleCSVImport} />
        <button onClick={handleProductionExport}>Exportar CSV producción</button>
        <div className="muted">Formato CSV esperado: cabecera con nombres de campo (ej: fecha,line,kg_producidos,reproceso,decomiso)</div>
        <h4>Registros (ultimoos 8)</h4>
        <pre className="box">{JSON.stringify(production.slice(-8), null, 2)}</pre>
      </section>

      <section className="card">
        <h3>Carga manual de turnos</h3>
        <div className="form-row">
          <label>Fecha <input value={newShift.fecha} onChange={(e)=>setNewShift({...newShift, fecha:e.target.value})} type="date"/></label>
          <label>Turno <input value={newShift.turno} onChange={(e)=>setNewShift({...newShift, turno:e.target.value})}/></label>
          <label>Supervisor <input value={newShift.supervisor} onChange={(e)=>setNewShift({...newShift, supervisor:e.target.value})}/></label>
          <label>Línea <input value={newShift.line} onChange={(e)=>setNewShift({...newShift, line:e.target.value})}/></label>
          <label>Eficiencia <input value={newShift.eficiencia} onChange={(e)=>setNewShift({...newShift, eficiencia:e.target.value})} type="number"/></label>
        </div>
        <button onClick={() =>{
          const shifts = load(STORAGE_KEYS.shifts, []);
          shifts.push(newShift);
          save(STORAGE_KEYS.shifts, shifts);
          setNewShift({ fecha: "", turno: "", supervisor: "", line: "", eficiencia: "" });
          alert("Turno guardado.");
        }}>Guardar turno</button>
      </section>

      <section className="card">
        <h3>OTs Correctivas / Preventivas</h3>
        <div>
          <button onClick={() => addOT("C")}>Agregar OT Correctiva</button>
          <button onClick={() => addOT("P")}>Agregar OT Preventiva</button>
        </div>
        <div className="box">
          <strong>Correctivas:</strong>
          <pre>{JSON.stringify(otsC.slice(-5), null, 2)}</pre>
          <strong>Preventivas:</strong>
          <pre>{JSON.stringify(otsP.slice(-5), null, 2)}</pre>
        </div>
      </section>

      <section className="card">
        <h3>Datos económicos (mantenimiento + energía)</h3>
        <label>Gasto mantenimiento (USD)
          <input type="number" value={economic.mantenimiento_gasto || 0} onChange={(e)=>setEconomic({...economic, mantenimiento_gasto: Number(e.target.value)})}/>
        </label>
        <label>Gasto energético (USD)
          <input type="number" value={economic.energia_gasto || 0} onChange={(e)=>setEconomic({...economic, energia_gasto: Number(e.target.value)})}/>
        </label>
        <button onClick={()=>{ save(STORAGE_KEYS.economic, economic); alert("Datos económicos guardados."); }}>Guardar datos económicos</button>
      </section>
    </div>
  );
}

/* Pestaña 3 — Dispositivos de control (contenedor vacío por ahora) */
function Dispositivos() {
  return (
    <div className="card">
      <h2>Dispositivos de control</h2>
      <div className="placeholder">
        Contenedor vacío — espacio reservado para integrar dispositivos IoT / PLCs / Telemetría.
      </div>
    </div>
  );
}

/* Pestaña 4 — Configuración */
function Configuracion() {
  const [config, setConfig] = useState(load(STORAGE_KEYS.config, {
    sectores: [],
    supervisores: [],
    hh_semana: 40,
    horas_planificadas_mes: 160,
  }));

  useEffect(() => save(STORAGE_KEYS.config, config), [config]);

  function addSector() {
    const nombre = prompt("Nombre sector:");
    if (!nombre) return;
    const next = { ...config, sectores: [...config.sectores, { id: Date.now(), nombre, lineas: [] }] };
    setConfig(next);
  }
  function removeSector(id) {
    setConfig({ ...config, sectores: config.sectores.filter(s => s.id !== id) });
  }
  function addLinea(sectorId) {
    const nombre = prompt("Nombre línea:");
    if (!nombre) return;
    setConfig({
      ...config,
      sectores: config.sectores.map(s => s.id === sectorId ? { ...s, lineas: [...s.lineas, { id: Date.now(), nombre }] } : s)
    });
  }
  function addSupervisor() {
    const nombre = prompt("Nombre supervisor:");
    if (!nombre) return setConfig({ ...config, supervisores: [...config.supervisores, nombre] });
  }

  return (
    <div className="configuracion">
      <h2>Configuración</h2>

      <section className="card">
        <h3>Sectores y líneas</h3>
        <button onClick={addSector}>Agregar sector</button>
        <div className="list">
          {config.sectores.length === 0 ? <div className="muted">No hay sectores</div> :
            config.sectores.map(sec => (
              <div className="item" key={sec.id}>
                <strong>{sec.nombre}</strong>
                <div className="actions">
                  <button onClick={() => addLinea(sec.id)}>Agregar línea</button>
                  <button onClick={() => removeSector(sec.id)}>Eliminar sector</button>
                </div>
                <div className="muted">Líneas: {sec.lineas.map(l => l.nombre).join(", ") || "—"}</div>
              </div>
            ))
          }
        </div>
      </section>

      <section className="card">
        <h3>Catálogo supervisores</h3>
        <button onClick={addSupervisor}>Agregar supervisor</button>
        <div className="box">{config.supervisores.length ? <ul>{config.supervisores.map((s,i)=><li key={i}>{s}</li>)}</ul> : <div className="muted">No hay supervisores</div>}</div>
      </section>

      <section className="card">
        <h3>Capacidad HH / semana y Horas planificadas por mes</h3>
        <label>HH / semana
          <input type="number" value={config.hh_semana} onChange={(e)=>setConfig({...config, hh_semana: Number(e.target.value)})}/>
        </label>
        <label>Horas planificadas / mes
          <input type="number" value={config.horas_planificadas_mes} onChange={(e)=>setConfig({...config, horas_planificadas_mes: Number(e.target.value)})}/>
        </label>
      </section>
    </div>
  );
}

function App() {
  const tabNames = ["Dashboard", "Carga de datos", "Dispositivos de control", "Configuración"];
  const [current, setCurrent] = useState(tabNames[0]);

  return (
    <div className="container">
      <h1>Mantenimiento — Panel</h1>
      <Tabs tabs={tabNames} current={current} setCurrent={setCurrent} />
      <div className="content">
        {current === "Dashboard" && <Dashboard />}
        {current === "Carga de datos" && <CargaDatos />}
        {current === "Dispositivos de control" && <Dispositivos />}
        {current === "Configuración" && <Configuracion />}
      </div>
    </div>
  );
}

ReactDOM.render(<App />, document.getElementById("root"));
