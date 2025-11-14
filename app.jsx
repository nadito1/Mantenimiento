// Reorganizado: pestañas (Dashboard | Carga de datos | Dispositivos de control | Configuración)
// - Filtros y KPIs dentro de la pestaña "Dashboard indicadores"
// - "Carga de datos" contiene tablas e importación CSV
// - Pestaña "Dispositivos de control" placeholder
// - Pestaña "Configuración" permite ajustar horas planificadas, capacidad y supervisores
//
// Reemplazar app.jsx por este archivo en tu repo y recargar (Ctrl/Cmd+F5).
const { useState, useEffect, useMemo, useRef } = React;

// Utilidades
const formatNumber = (n, digits = 2) =>
  isFinite(n) ? n.toLocaleString("es-AR", { maximumFractionDigits: digits }) : "-";

const download = (filename, data) => {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

// Catálogos por defecto (se pueden editar desde Configuración)
const DEFAULT_SUPERVISORES = ["ALLOI", "AVILA", "BOERIS"];

const SECTORES = [
  "CHOCOLATE",
  "ALFAJOR",
  "HUEVO DE PASCUA",
  "BARRA DE MANI",
  "TURRON",
  "BARRA DE CEREALES",
  "CARAMELO BLANDO",
  "CARAMELO DURO",
  "ARTESANAL",
  "CUBANITO",
  "CONFITE",
  "OTROS",
];

const LINEAS_POR_SECTOR = {
  CHOCOLATE: ["CV1000-1", "CV1000-2", "CV1000-3", "DELVER", "CHISPAS", "MANGA"],
  TURRON: ["NAMUR", "TURRON FIESTA", "CROCANTE", "ESTUCHADO TURRON", "ARTESANAL"],
  "CARAMELO BLANDO": ["FLYNN", "FLYNNIES", "XXL", "EMZO", "ENVAMEC"],
  "CARAMELO DURO": ["EMZO", "ENVAMEC"],
  CONFITE: ["PACK PLUS", "ESTUCHADORA", "CONFITE"],
  ALFAJOR: ["ALFAJOR"],
  "HUEVO DE PASCUA": ["HUEVO DE PASCUA"],
  "BARRA DE MANI": ["BARRA DE MANI", "LINGOTE"],
  "BARRA DE CEREALES": ["BARRA DE CEREALES"],
  CUBANITO: ["CUBANITO"],
  ARTESANAL: [],
  OTROS: [],
};

const LINEAS = Array.from(new Set(Object.values(LINEAS_POR_SECTOR).flat()));

const TURNOS = ["M", "T", "N"]; // se mantiene para los formularios aunque ya no haya filtro
const CRITICIDAD = ["A", "B", "C"];

// Helpers
const toDate = (s) => new Date(s);
const inRange = (d, desde, hasta) =>
  d >= new Date(desde + "T00:00") && d <= new Date(hasta + "T23:59:59");

const parseNumero = (str) => {
  if (str == null) return 0;
  const cleaned = String(str).trim().replace(/\./g, "").replace(",", ".");
  const n = Number(cleaned);
  return isFinite(n) ? n : 0;
};

function App() {
  const [tab, setTab] = useState("dashboard"); // dashboard | carga | dispositivos | config

  const [state, setState] = useState(() => {
    const saved = localStorage.getItem("kpi-mantenimiento-georgalos-v2");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return {
          periodoDesde: parsed.periodoDesde,
          periodoHasta: parsed.periodoHasta,
          horasPlanificadas: parsed.horasPlanificadas ?? 720,
          ventasARS: parsed.ventasARS ?? 0,
          costoMantenimientoARS: parsed.costoMantenimientoARS ?? 0,
          capacidadHHsemana: parsed.capacidadHHsemana ?? 160,
          filtroLinea: parsed.filtroLinea ?? "Todas",
          filtroSector: parsed.filtroSector ?? "Todos",
          filtroSupervisor: parsed.filtroSupervisor ?? "Todos",
          paradas: parsed.paradas ?? [],
          ots: parsed.ots ?? [],
          produccion: parsed.produccion ?? [],
          economia: parsed.economia ?? [],
          supervisores: parsed.supervisores ?? DEFAULT_SUPERVISORES,
        };
      } catch (e) {
        console.error("Error leyendo localStorage", e);
      }
    }
    const hoy = new Date();
    const primerDiaMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1)
      .toISOString()
      .slice(0, 10);
    const ultimoDiaMes = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0)
      .toISOString()
      .slice(0, 10);
    return {
      periodoDesde: primerDiaMes,
      periodoHasta: ultimoDiaMes,
      horasPlanificadas: 720,
      ventasARS: 0,
      costoMantenimientoARS: 0,
      capacidadHHsemana: 160,
      filtroLinea: "Todas",
      filtroSector: "Todos",
      filtroSupervisor: "Todos",
      paradas: [],
      ots: [],
      produccion: [],
      economia: [],
      supervisores: DEFAULT_SUPERVISORES,
    };
  });

  // Persistencia
  useEffect(() => {
    localStorage.setItem("kpi-mantenimiento-georgalos-v2", JSON.stringify(state));
  }, [state]);

  const fileInputRef = useRef(null);
  const fileProdCsvRef = useRef(null);

  // Datos por periodo
  const paradasPeriodo = useMemo(
    () =>
      state.paradas.filter((p) => inRange(toDate(p.fecha), state.periodoDesde, state.periodoHasta)),
    [state.paradas, state.periodoDesde, state.periodoHasta]
  );

  const otsPeriodo = useMemo(
    () =>
      state.ots.filter((o) =>
        inRange(new Date(o.fecha + "T00:00"), state.periodoDesde, state.periodoHasta)
      ),
    [state.ots, state.periodoDesde, state.periodoHasta]
  );

  const produccionPeriodo = useMemo(
    () =>
      state.produccion.filter((r) =>
        inRange(new Date(r.fecha + "T00:00"), state.periodoDesde, state.periodoHasta)
      ),
    [state.produccion, state.periodoDesde, state.periodoHasta]
  );

  // Opciones de línea dependientes del sector seleccionado
  const opcionesLineas = useMemo(() => {
    if (!state.filtroSector || state.filtroSector === "Todos") return ["Todas", ...LINEAS];
    const lines = LINEAS_POR_SECTOR[state.filtroSector] ?? [];
    return ["Todas", ...lines];
  }, [state.filtroSector]);

  // Filtros combinados (fecha + sector/línea/supervisor)
  const paradasFiltradas = useMemo(
    () =>
      paradasPeriodo.filter((p) => {
        const byLinea = state.filtroLinea === "Todas" || !state.filtroLinea || p.linea === state.filtroLinea;
        const bySector = state.filtroSector === "Todos" || !state.filtroSector || p.sector === state.filtroSector;
        const bySupervisor =
          state.filtroSupervisor === "Todos" ||
          !state.filtroSupervisor ||
          p.supervisor === state.filtroSupervisor ||
          p.responsable === state.filtroSupervisor;
        return byLinea && bySector && bySupervisor;
      }),
    [paradasPeriodo, state.filtroLinea, state.filtroSector, state.filtroSupervisor]
  );

  const otsFiltradas = useMemo(
    () =>
      otsPeriodo.filter((o) => {
        const byLinea = state.filtroLinea === "Todas" || !state.filtroLinea || o.linea === state.filtroLinea;
        const bySector = state.filtroSector === "Todos" || !state.filtroSector || o.sector === state.filtroSector || true;
        const bySupervisor =
          state.filtroSupervisor === "Todos" ||
          !state.filtroSupervisor ||
          o.responsable === state.filtroSupervisor ||
          o.supervisor === state.filtroSupervisor;
        return byLinea && bySector && bySupervisor;
      }),
    [otsPeriodo, state.filtroLinea, state.filtroSector, state.filtroSupervisor]
  );

  const produccionFiltrada = useMemo(
    () =>
      produccionPeriodo.filter((r) => {
        const byLinea = state.filtroLinea === "Todas" || !state.filtroLinea || r.linea === state.filtroLinea;
        const bySector = state.filtroSector === "Todos" || !state.filtroSector || r.sector === state.filtroSector;
        const bySupervisor = state.filtroSupervisor === "Todos" || !state.filtroSupervisor || r.supervisor === state.filtroSupervisor;
        return byLinea && bySector && bySupervisor;
      }),
    [produccionPeriodo, state.filtroLinea, state.filtroSector, state.filtroSupervisor]
  );

  // Subconjuntos por tipo
  const otsCorrFiltradas = useMemo(
    () => otsFiltradas.filter((o) => o.tipo === "Correctivo"),
    [otsFiltradas]
  );
  const otsPrevFiltradas = useMemo(
    () => otsFiltradas.filter((o) => o.tipo === "Preventivo"),
    [otsFiltradas]
  );

  // KPIs mantenimiento (usar datos filtrados)
  const downtimeTotalMin = useMemo(
    () => paradasFiltradas.reduce((acc, p) => acc + (Number(p.downtimeMin) || 0), 0),
    [paradasFiltradas]
  );
  const fallas = paradasFiltradas.length;
  const downtimeHoras = downtimeTotalMin / 60;
  const uptimeHoras = Math.max(0, (Number(state.horasPlanificadas) || 0) - downtimeHoras);

  const MTTR_h = useMemo(() => (fallas > 0 ? downtimeHoras / fallas : 0), [downtimeHoras, fallas]);
  const MTBF_h = useMemo(() => (fallas > 0 ? uptimeHoras / fallas : 0), [uptimeHoras, fallas]);
  const disponibilidad = useMemo(() => {
    const hp = Number(state.horasPlanificadas) || 0;
    return hp > 0 ? uptimeHoras / hp : 0;
  }, [uptimeHoras, state.horasPlanificadas]);

  const otsPlanificadas = otsPrevFiltradas.filter((o) => o.estado === "Planificada").length;
  const otsCompletadas = otsPrevFiltradas.filter((o) => o.estado === "Completada").length;
  const cumplimientoPlan =
    (otsCompletadas / Math.max(1, otsCompletadas + otsPlanificadas)) * 100;

  const totalHHpendientes = otsFiltradas
    .filter((o) => o.estado !== "Completada" && o.estado !== "Cancelada")
    .reduce((acc, o) => acc + (o.hh || 0), 0);
  const backlogSemanas = totalHHpendientes / Math.max(1, state.capacidadHHsemana);

  const otsPrev = otsPrevFiltradas.length;
  const otsCorr = otsCorrFiltradas.length;
  const otsTot = Math.max(1, otsFiltradas.length);
  const pctPrev = (otsPrev / otsTot) * 100;
  const pctCorr = (otsCorr / otsTot) * 100;

  // Indicadores producción filtrados
  const totalKgProd = useMemo(() => produccionFiltrada.reduce((a, r) => a + (r.kgProd || 0), 0), [produccionFiltrada]);
  const avgCumpPlan = useMemo(
    () =>
      produccionFiltrada.length > 0
        ? produccionFiltrada.reduce((a, r) => a + (r.cumpPlan || 0), 0) / produccionFiltrada.length
        : 0,
    [produccionFiltrada]
  );

  // Resumen por supervisor (producción)
  const resumenSupervisor = useMemo(() => {
    const map = {};
    produccionFiltrada.forEach((r) => {
      const sup = r.supervisor || "SIN_SUP";
      if (!map[sup]) map[sup] = { kgProd: 0, kgPlan: 0, filas: 0 };
      map[sup].kgProd += r.kgProd || 0;
      map[sup].kgPlan += r.kgPlan || 0;
      map[sup].filas += 1;
    });
    return map;
  }, [produccionFiltrada]);

  // Gasto mantenimiento / energetico (desde economia + OTs costoARS)
  const gastoMtoTotalUSD = useMemo(
    () => state.economia.reduce((a, e) => a + (Number(e.gastoMantenimientoUSD) || 0), 0),
    [state.economia]
  );
  const gastoMtoPorSector = useMemo(() => {
    const map = {};
    state.economia.forEach((e) => {
      const s = e.sector || "SIN_SECTOR";
      map[s] = (map[s] || 0) + (Number(e.gastoMantenimientoUSD) || 0);
    });
    return map;
  }, [state.economia]);
  const gastoEnergiaTotalUSD = useMemo(
    () => state.economia.reduce((a, e) => a + (Number(e.costoEnergiaUSD) || 0), 0),
    [state.economia]
  );

  // Manejo formularios OTs / producción / economía
  const addOTCorrectiva = () => {
    setState((s) => ({
      ...s,
      ots: [
        ...s.ots,
        {
          id: crypto.randomUUID(),
          fecha: new Date().toISOString().slice(0, 10),
          linea: "",
          turno: "M",
          equipo: "",
          tipo: "Correctivo",
          estado: "En curso",
          criticidad: "B",
          codigoSAP: "",
          responsable: "",
          proveedor: "",
          repuestos: "",
          costoARS: 0,
          hh: 0,
        },
      ],
    }));
  };

  const addOTPreventiva = () => {
    setState((s) => ({
      ...s,
      ots: [
        ...s.ots,
        {
          id: crypto.randomUUID(),
          fecha: new Date().toISOString().slice(0, 10),
          fechaEjec: "",
          linea: "",
          turno: "M",
          equipo: "",
          tipo: "Preventivo",
          estado: "Planificada",
          criticidad: "B",
          codigoSAP: "",
          responsable: "",
          proveedor: "",
          repuestos: "",
          costoARS: 0,
          hh: 0,
        },
      ],
    }));
  };

  const addProduccion = () => {
    setState((s) => ({
      ...s,
      produccion: [
        ...s.produccion,
        {
          id: crypto.randomUUID(),
          fecha: new Date().toISOString().slice(0, 10),
          turno: "M",
          sector: "CHOCOLATE",
          linea: "",
          kgPlan: 0,
          kgProd: 0,
          cumpPlan: 0,
          kgReproceso: 0,
          kgDecomiso: 0,
          tiempoParadaMin: 0,
          supervisor: s.supervisores && s.supervisores[0],
          novedades: "",
        },
      ],
    }));
  };

  const addEconomia = () => {
    setState((s) => ({
      ...s,
      economia: [
        ...s.economia,
        {
          id: crypto.randomUUID(),
          periodo: new Date().toISOString().slice(0, 7),
          sector: "",
          gastoMantenimientoUSD: 0,
          costoEnergiaUSD: 0,
        },
      ],
    }));
  };

  // Import JSON app state
  const onImport = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result));
        setState((s) => ({
          ...s,
          ...data,
          paradas: data.paradas ?? [],
          ots: data.ots ?? [],
          produccion: data.produccion ?? [],
          economia: data.economia ?? [],
          supervisores: data.supervisores ?? s.supervisores,
        }));
      } catch (err) {
        alert("Archivo inválido");
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // Import producción CSV (usa state.supervisores)
  const onImportProduccionCsv = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = String(reader.result);
        const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
        if (lines.length < 2) {
          alert("CSV sin datos");
          return;
        }

        const headerLine = lines[0];
        const delimiter = headerLine.includes(";") ? ";" : ",";
        const headers = headerLine
          .split(delimiter)
          .map((h) => h.trim().toUpperCase());

        const idx = (name) => headers.indexOf(name);

        const idxFecha = idx("FECHA");
        const idxTurno = idx("TURNO");
        const idxSector = idx("SECTOR");
        const idxKgPlan = idx("KG PLAN");
        const idxLinea = idx("LINEA");
        const idxKgProd = idx("KG PRODUCIDOS");
        const idxNovedades = idx("NOVEDADES");
        const idxCumpPlan = idx("CUMP PLAN %");
        const idxKgReproceso = idx("KG REPROCESO");
        const idxKgDecomiso = idx("KG DECOMISO");
        const idxTiempoParada = idx("TIEMPO PARADA POR AVERIAS");
        const idxSupervisor = idx("SUPERVISOR");

        if (
          idxFecha === -1 ||
          idxTurno === -1 ||
          idxSector === -1 ||
          idxKgPlan === -1 ||
          idxLinea === -1 ||
          idxKgProd === -1 ||
          idxKgReproceso === -1 ||
          idxKgDecomiso === -1 ||
          idxTiempoParada === -1 ||
          idxSupervisor === -1
        ) {
          alert(
            "El CSV no tiene todos los encabezados requeridos.\nRequeridos: FECHA, TURNO, SECTOR, KG PLAN, LINEA, KG PRODUCIDOS, KG REPROCESO, KG DECOMISO, TIEMPO PARADA POR AVERIAS, SUPERVISOR. (NOVEDADES es opcional)."
          );
          return;
        }

        const nuevos = [];

        for (let i = 1; i < lines.length; i++) {
          const row = lines[i].split(delimiter);
          if (row.length === 0) continue;

          const val = (idxCol) =>
            idxCol >= 0 && idxCol < row.length ? row[idxCol].trim() : "";

          let rawFecha = val(idxFecha);
          let fecha = "";
          if (/^\d{4}-\d{2}-\d{2}/.test(rawFecha)) {
            fecha = rawFecha.slice(0, 10);
          } else if (/^\d{2}\/\d{2}\/\d{4}/.test(rawFecha)) {
            const [dd, mm, yyyy] = rawFecha.split("/");
            fecha = `${yyyy}-${mm}-${dd}`;
          } else {
            const d = new Date(rawFecha);
            if (!isNaN(d.getTime())) {
              fecha = d.toISOString().slice(0, 10);
            }
          }
          if (!fecha) continue;

          const turnoRaw = val(idxTurno).toUpperCase();
          let turno = "M";
          if (turnoRaw.startsWith("T")) turno = "T";
          else if (turnoRaw.startsWith("N")) turno = "N";

          const rawSector = val(idxSector).toUpperCase();
          const sectorNormalizado = SECTORES.includes(rawSector) ? rawSector : "OTROS";

          const lineaCsv = val(idxLinea);
          const kgPlan = parseNumero(val(idxKgPlan));
          const kgProd = parseNumero(val(idxKgProd));
          const kgReproceso = parseNumero(val(idxKgReproceso));
          const kgDecomiso = parseNumero(val(idxKgDecomiso));
          const cumpPlan = idxCumpPlan !== -1 ? parseNumero(val(idxCumpPlan)) : 0;
          const tiempoParadaMin = parseNumero(val(idxTiempoParada));

          const supRaw = val(idxSupervisor).toUpperCase();
          const supervisor = state.supervisores.find((s) => s === supRaw) ?? state.supervisores[0];

          const novedades = idxNovedades !== -1 ? val(idxNovedades) : "";

          nuevos.push({
            id: crypto.randomUUID(),
            fecha,
            turno,
            sector: sectorNormalizado,
            linea: lineaCsv,
            kgPlan,
            kgProd,
            cumpPlan,
            kgReproceso,
            kgDecomiso,
            tiempoParadaMin,
            supervisor,
            novedades,
          });
        }

        if (nuevos.length === 0) {
          alert("No se encontraron filas válidas en el CSV.");
          return;
        }

        setState((s) => ({
          ...s,
          produccion: [...s.produccion, ...nuevos],
        }));
        alert(`Se importaron ${nuevos.length} filas de producción.`);
      } catch (err) {
        console.error(err);
        alert("Error al leer el CSV de producción.");
      }
    };
    reader.readAsText(file, "utf-8");
    if (fileProdCsvRef.current) fileProdCsvRef.current.value = "";
  };

  const resetData = () => {
    if (!confirm("¿Vaciar todos los datos del dashboard?")) return;
    localStorage.removeItem("kpi-mantenimiento-georgalos-v2");
    location.reload();
  };

  // Small helpers to update arrays immutably
  const updateItemIn = (arr, id, patch) => arr.map((x) => (x.id === id ? { ...x, ...patch } : x));
  const removeItemIn = (arr, id) => arr.filter((x) => x.id !== id);

  // --- Render UI ---
  return (
    <div className="app-root">
      <div className="container">
        <header style={{ display: "flex", justifyContent: "space-between", gap: "1rem", marginBottom: "1rem", alignItems: "center", flexWrap: "wrap" }}>
          <div>
            <h1 style={{ fontSize: "1.4rem", margin: 0 }}>KPIs & Gestión — Georgalos</h1>
            <div style={{ fontSize: "0.8rem", color: "#6b7280" }}>Dashboard, carga de datos y configuración</div>
          </div>

          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <button className="btn" onClick={() => download("kpis-georgalos.json", state)}>Exportar JSON</button>
            <label className="btn">
              Importar JSON
              <input ref={fileInputRef} type="file" accept="application/json" style={{ display: "none" }} onChange={onImport} />
            </label>
            <button className="btn" onClick={resetData}>Reiniciar</button>
          </div>
        </header>

        {/* Tabs */}
        <nav style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <TabButton active={tab === "dashboard"} onClick={() => setTab("dashboard")}>1 · Dashboard indicadores</TabButton>
          <TabButton active={tab === "carga"} onClick={() => setTab("carga")}>2 · Carga de datos</TabButton>
          <TabButton active={tab === "dispositivos"} onClick={() => setTab("dispositivos")}>3 · Dispositivos de control</TabButton>
          <TabButton active={tab === "config"} onClick={() => setTab("config")}>4 · Configuración</TabButton>
        </nav>

        {/* TAB: DASHBOARD */}
        {tab === "dashboard" && (
          <>
            {/* filtros y top row */}
            <section style={{ display: "grid", gap: "1rem", marginBottom: "1rem", gridTemplateColumns: "repeat(3, 1fr)" }}>
              {/* Periodo */}
              <div className="card">
                <h3 style={{ marginTop: 0 }}>Periodo</h3>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                  <div>
                    <div style={{ color: "#6b7280", fontSize: 12 }}>Desde</div>
                    <input type="date" value={state.periodoDesde} onChange={(e) => setState((s) => ({ ...s, periodoDesde: e.target.value }))} />
                  </div>
                  <div>
                    <div style={{ color: "#6b7280", fontSize: 12 }}>Hasta</div>
                    <input type="date" value={state.periodoHasta} onChange={(e) => setState((s) => ({ ...s, periodoHasta: e.target.value }))} />
                  </div>
                  <div style={{ gridColumn: "1 / -1" }}>
                    <div style={{ color: "#6b7280", fontSize: 12 }}>Horas planificadas</div>
                    <input type="number" min={0} value={state.horasPlanificadas} onChange={(e) => setState((s) => ({ ...s, horasPlanificadas: Number(e.target.value) }))} />
                  </div>
                </div>
              </div>

              {/* Filtros encadenados */}
              <div className="card">
                <h3 style={{ marginTop: 0 }}>Filtros</h3>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
                  <div>
                    <div style={{ color: "#6b7280", fontSize: 12 }}>Sector</div>
                    <select value={state.filtroSector} onChange={(e) => setState((s) => ({ ...s, filtroSector: e.target.value, filtroLinea: "Todas" }))}>
                      <option value="Todos">Todos</option>
                      {SECTORES.map((sec) => <option key={sec} value={sec}>{sec}</option>)}
                    </select>
                  </div>

                  <div>
                    <div style={{ color: "#6b7280", fontSize: 12 }}>Línea</div>
                    <select value={state.filtroLinea} onChange={(e) => setState((s) => ({ ...s, filtroLinea: e.target.value }))}>
                      {opcionesLineas.map((l) => <option key={l} value={l}>{l}</option>)}
                    </select>
                  </div>

                  <div>
                    <div style={{ color: "#6b7280", fontSize: 12 }}>Supervisor</div>
                    <select value={state.filtroSupervisor} onChange={(e) => setState((s) => ({ ...s, filtroSupervisor: e.target.value }))}>
                      <option value="Todos">Todos</option>
                      {state.supervisores.map((sup) => <option key={sup} value={sup}>{sup}</option>)}
                    </select>
                  </div>
                </div>
              </div>

              {/* Capacidad & Backlog */}
              <div className="card">
                <h3 style={{ marginTop: 0 }}>Capacidad & Backlog</h3>
                <div style={{ display: "grid", gap: 8 }}>
                  <div>
                    <div style={{ color: "#6b7280", fontSize: 12 }}>Capacidad HH/semana</div>
                    <input type="number" min={0} value={state.capacidadHHsemana} onChange={(e) => setState((s) => ({ ...s, capacidadHHsemana: Number(e.target.value) }))} />
                  </div>
                  <div style={{ color: "#4b5563" }}>Backlog: <strong>{formatNumber(backlogSemanas, 2)} semanas</strong></div>
                </div>
              </div>
            </section>

            {/* Dashboard – un único card que agrupa KPI bloques */}
            <section className="card" style={{ marginBottom: 16 }}>
              <h3 style={{ marginTop: 0 }}>Dashboard de indicadores</h3>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
                {/* Mantenimiento */}
                <div className="kpi-block card" style={{ padding: 12 }}>
                  <div style={{ fontWeight: 600, marginBottom: 6 }}>KPIs de mantenimiento</div>
                  <div style={{ display: "grid", gap: 6 }}>
                    <div>MTBF: <strong>{formatNumber(MTBF_h)} h</strong></div>
                    <div>MTTR: <strong>{formatNumber(MTTR_h)} h</strong></div>
                    <div>Disponibilidad: <strong>{formatNumber(disponibilidad * 100)} %</strong></div>
                    <div>Fallas (conteo): <strong>{fallas}</strong></div>
                  </div>
                </div>

                {/* Producción */}
                <div className="kpi-block card" style={{ padding: 12 }}>
                  <div style={{ fontWeight: 600, marginBottom: 6 }}>KPIs de producción</div>
                  <div style={{ display: "grid", gap: 6 }}>
                    <div>Kg producidos (filtro): <strong>{formatNumber(totalKgProd, 0)} kg</strong></div>
                    <div>Cump. promedio: <strong>{formatNumber(avgCumpPlan)} %</strong></div>
                    <div>Turnos/filas: <strong>{produccionFiltrada.length}</strong></div>
                  </div>
                </div>

                {/* Resumen por supervisor */}
                <div className="kpi-block card" style={{ padding: 12 }}>
                  <div style={{ fontWeight: 600, marginBottom: 6 }}>Resumen por supervisor</div>
                  <div style={{ display: "grid", gap: 6 }}>
                    {Object.keys(resumenSupervisor).length === 0 && <div style={{ color: "#6b7280" }}>Sin datos en el periodo/filtro</div>}
                    {Object.entries(resumenSupervisor).map(([sup, vals]) => (
                      <div key={sup}>
                        <strong>{sup}</strong>: {formatNumber(vals.kgProd, 0)} kg — filas: {vals.filas}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Gasto total mantenimiento */}
                <div className="kpi-block card" style={{ padding: 12 }}>
                  <div style={{ fontWeight: 600, marginBottom: 6 }}>KPIs: Gasto mantenimiento</div>
                  <div style={{ display: "grid", gap: 6 }}>
                    <div>Gasto mantenimiento (USD) periodo: <strong>{formatNumber(gastoMtoTotalUSD, 2)}</strong></div>
                    <div>Gasto energía (USD) periodo: <strong>{formatNumber(gastoEnergiaTotalUSD, 2)}</strong></div>
                  </div>
                </div>

                {/* Gasto por sector */}
                <div className="kpi-block card" style={{ padding: 12 }}>
                  <div style={{ fontWeight: 600, marginBottom: 6 }}>Gasto mantenimiento por sector</div>
                  <div style={{ display: "grid", gap: 6 }}>
                    {Object.keys(gastoMtoPorSector).length === 0 && <div style={{ color: "#6b7280" }}>Sin registros económicos</div>}
                    {Object.entries(gastoMtoPorSector).map(([s, v]) => (
                      <div key={s}>{s}: <strong>{formatNumber(v, 2)} USD</strong></div>
                    ))}
                  </div>
                </div>
              </div>
            </section>
          </>
        )}

        {/* TAB: CARGA DE DATOS */}
        {tab === "carga" && (
          <>
            <section className="card" style={{ marginBottom: 16 }}>
              <h3 style={{ marginTop: 0 }}>Tabla de turnos & Importación CSV</h3>
              <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                <button className="btn btn-primary" onClick={addProduccion}>+ Agregar turno</button>
                <button className="btn" onClick={() => fileProdCsvRef.current && fileProdCsvRef.current.click()}>Importar producción CSV</button>
                <input ref={fileProdCsvRef} type="file" accept=".csv,text/csv" style={{ display: "none" }} onChange={onImportProduccionCsv} />
              </div>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>Turno</th>
                      <th>Sector</th>
                      <th>Línea</th>
                      <th>Kg plan</th>
                      <th>Kg producidos</th>
                      <th>Cump. plan %</th>
                      <th>Kg reproceso</th>
                      <th>Kg decomiso</th>
                      <th>Tiempo parada (min)</th>
                      <th>Supervisor</th>
                      <th>Novedades</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {state.produccion.length === 0 && (
                      <tr><td colSpan={13} style={{ padding: 12, color: "#6b7280" }}>Sin datos de producción aún.</td></tr>
                    )}
                    {state.produccion.map((r) => (
                      <tr key={r.id}>
                        <td><input type="date" value={r.fecha} onChange={(e) => setState((s) => ({ ...s, produccion: updateItemIn(s.produccion, r.id, { fecha: e.target.value }) }))} /></td>
                        <td>
                          <select value={r.turno} onChange={(e) => setState((s) => ({ ...s, produccion: updateItemIn(s.produccion, r.id, { turno: e.target.value }) }))}>
                            {TURNOS.map((t) => <option key={t} value={t}>{t}</option>)}
                          </select>
                        </td>
                        <td>
                          <select value={r.sector || "CHOCOLATE"} onChange={(e) => {
                            const nuevoSector = e.target.value;
                            setState((s) => ({ ...s, produccion: s.produccion.map((x) => x.id === r.id ? { ...x, sector: nuevoSector, linea: (LINEAS_POR_SECTOR[nuevoSector] || []).includes(x.linea) ? x.linea : "" } : x) }));
                          }}>
                            {SECTORES.map((sec) => <option key={sec} value={sec}>{sec}</option>)}
                          </select>
                        </td>
                        <td>
                          <select value={r.linea || ""} onChange={(e) => setState((s) => ({ ...s, produccion: updateItemIn(s.produccion, r.id, { linea: e.target.value }) }))}>
                            <option value="">-</option>
                            {(LINEAS_POR_SECTOR[r.sector] || []).map((l) => <option key={l} value={l}>{l}</option>)}
                          </select>
                        </td>
                        <td><input type="number" min={0} value={r.kgPlan ?? 0} onChange={(e) => setState((s) => ({ ...s, produccion: updateItemIn(s.produccion, r.id, { kgPlan: Number(e.target.value) }) }))} /></td>
                        <td><input type="number" min={0} value={r.kgProd ?? 0} onChange={(e) => setState((s) => ({ ...s, produccion: updateItemIn(s.produccion, r.id, { kgProd: Number(e.target.value) }) }))} /></td>
                        <td><input type="number" min={0} value={r.cumpPlan ?? 0} onChange={(e) => setState((s) => ({ ...s, produccion: updateItemIn(s.produccion, r.id, { cumpPlan: Number(e.target.value) }) }))} /></td>
                        <td><input type="number" min={0} value={r.kgReproceso ?? 0} onChange={(e) => setState((s) => ({ ...s, produccion: updateItemIn(s.produccion, r.id, { kgReproceso: Number(e.target.value) }) }))} /></td>
                        <td><input type="number" min={0} value={r.kgDecomiso ?? 0} onChange={(e) => setState((s) => ({ ...s, produccion: updateItemIn(s.produccion, r.id, { kgDecomiso: Number(e.target.value) }) }))} /></td>
                        <td><input type="number" min={0} value={r.tiempoParadaMin ?? 0} onChange={(e) => setState((s) => ({ ...s, produccion: updateItemIn(s.produccion, r.id, { tiempoParadaMin: Number(e.target.value) }) }))} /></td>
                        <td>
                          <select value={r.supervisor || state.supervisores[0]} onChange={(e) => setState((s) => ({ ...s, produccion: updateItemIn(s.produccion, r.id, { supervisor: e.target.value }) }))}>
                            {state.supervisores.map((sup) => <option key={sup} value={sup}>{sup}</option>)}
                          </select>
                        </td>
                        <td><textarea rows={1} value={r.novedades || ""} onChange={(e) => setState((s) => ({ ...s, produccion: updateItemIn(s.produccion, r.id, { novedades: e.target.value }) }))} /></td>
                        <td><button className="btn" onClick={() => setState((s) => ({ ...s, produccion: removeItemIn(s.produccion, r.id) }))}>Eliminar</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {/* OTs correctivos */}
            <section className="card" style={{ marginBottom: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <h3 style={{ marginTop: 0 }}>OTs correctivos</h3>
                <button className="btn btn-primary" onClick={addOTCorrectiva}>+ Agregar</button>
              </div>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>Línea</th>
                      <th>Turno</th>
                      <th>Equipo</th>
                      <th>Estado</th>
                      <th>Crit.</th>
                      <th>HH</th>
                      <th>$ ARS</th>
                      <th>Resp.</th>
                      <th>Prov.</th>
                      <th>Código SAP</th>
                      <th>Repuestos</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {otsCorrFiltradas.length === 0 && <tr><td colSpan={13} style={{ padding: 12, color: "#6b7280" }}>Sin OTs correctivas en el periodo.</td></tr>}
                    {otsCorrFiltradas.map((o) => (
                      <tr key={o.id}>
                        <td><input type="date" value={o.fecha} onChange={(e) => setState((s) => ({ ...s, ots: updateItemIn(s.ots, o.id, { fecha: e.target.value }) }))} /></td>
                        <td>
                          <select value={o.linea} onChange={(e) => setState((s) => ({ ...s, ots: updateItemIn(s.ots, o.id, { linea: e.target.value }) }))}>
                            <option value="">-</option>
                            {LINEAS.map((l) => <option key={l} value={l}>{l}</option>)}
                          </select>
                        </td>
                        <td>
                          <select value={o.turno} onChange={(e) => setState((s) => ({ ...s, ots: updateItemIn(s.ots, o.id, { turno: e.target.value }) }))}>
                            {TURNOS.map((t) => <option key={t} value={t}>{t}</option>)}
                          </select>
                        </td>
                        <td><input type="text" value={o.equipo || ""} onChange={(e) => setState((s) => ({ ...s, ots: updateItemIn(s.ots, o.id, { equipo: e.target.value }) }))} /></td>
                        <td>
                          <select value={o.estado} onChange={(e) => setState((s) => ({ ...s, ots: updateItemIn(s.ots, o.id, { estado: e.target.value }) }))}>
                            <option>Planificada</option>
                            <option>En curso</option>
                            <option>Completada</option>
                            <option>Cancelada</option>
                          </select>
                        </td>
                        <td>
                          <select value={o.criticidad} onChange={(e) => setState((s) => ({ ...s, ots: updateItemIn(s.ots, o.id, { criticidad: e.target.value }) }))}>
                            {CRITICIDAD.map((c) => <option key={c} value={c}>{c}</option>)}
                          </select>
                        </td>
                        <td><input type="number" min={0} value={o.hh ?? 0} onChange={(e) => setState((s) => ({ ...s, ots: updateItemIn(s.ots, o.id, { hh: Number(e.target.value) }) }))} /></td>
                        <td><input type="number" min={0} value={o.costoARS ?? 0} onChange={(e) => setState((s) => ({ ...s, ots: updateItemIn(s.ots, o.id, { costoARS: Number(e.target.value) }) }))} /></td>
                        <td><input type="text" value={o.responsable || ""} onChange={(e) => setState((s) => ({ ...s, ots: updateItemIn(s.ots, o.id, { responsable: e.target.value }) }))} /></td>
                        <td><input type="text" value={o.proveedor || ""} onChange={(e) => setState((s) => ({ ...s, ots: updateItemIn(s.ots, o.id, { proveedor: e.target.value }) }))} /></td>
                        <td><input type="text" value={o.codigoSAP || ""} onChange={(e) => setState((s) => ({ ...s, ots: updateItemIn(s.ots, o.id, { codigoSAP: e.target.value }) }))} /></td>
                        <td><input type="text" value={o.repuestos || ""} onChange={(e) => setState((s) => ({ ...s, ots: updateItemIn(s.ots, o.id, { repuestos: e.target.value }) }))} /></td>
                        <td><button className="btn" onClick={() => setState((s) => ({ ...s, ots: removeItemIn(s.ots, o.id) }))}>Eliminar</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {/* OTs preventivos */}
            <section className="card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <h3 style={{ marginTop: 0 }}>OTs preventivos</h3>
                <button className="btn btn-primary" onClick={addOTPreventiva}>+ Agregar plan</button>
              </div>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Fecha plan</th>
                      <th>Fecha ejec</th>
                      <th>Línea</th>
                      <th>Equipo</th>
                      <th>Estado</th>
                      <th>Resp.</th>
                      <th>HH</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {otsPrevFiltradas.length === 0 && <tr><td colSpan={8} style={{ padding: 12, color: "#6b7280" }}>Sin preventivos planificados.</td></tr>}
                    {otsPrevFiltradas.map((o) => (
                      <tr key={o.id}>
                        <td><input type="date" value={o.fecha} onChange={(e) => setState((s) => ({ ...s, ots: updateItemIn(s.ots, o.id, { fecha: e.target.value }) }))} /></td>
                        <td><input type="date" value={o.fechaEjec || ""} onChange={(e) => setState((s) => ({ ...s, ots: updateItemIn(s.ots, o.id, { fechaEjec: e.target.value }) }))} /></td>
                        <td>
                          <select value={o.linea} onChange={(e) => setState((s) => ({ ...s, ots: updateItemIn(s.ots, o.id, { linea: e.target.value }) }))}>
                            <option value="">-</option>
                            {LINEAS.map((l) => <option key={l} value={l}>{l}</option>)}
                          </select>
                        </td>
                        <td><input type="text" value={o.equipo || ""} onChange={(e) => setState((s) => ({ ...s, ots: updateItemIn(s.ots, o.id, { equipo: e.target.value }) }))} /></td>
                        <td>
                          <select value={o.estado} onChange={(e) => setState((s) => ({ ...s, ots: updateItemIn(s.ots, o.id, { estado: e.target.value }) }))}>
                            <option>Planificada</option>
                            <option>En curso</option>
                            <option>Completada</option>
                            <option>Cancelada</option>
                          </select>
                        </td>
                        <td><input type="text" value={o.responsable || ""} onChange={(e) => setState((s) => ({ ...s, ots: updateItemIn(s.ots, o.id, { responsable: e.target.value }) }))} /></td>
                        <td><input type="number" min={0} value={o.hh ?? 0} onChange={(e) => setState((s) => ({ ...s, ots: updateItemIn(s.ots, o.id, { hh: Number(e.target.value) }) }))} /></td>
                        <td><button className="btn" onClick={() => setState((s) => ({ ...s, ots: removeItemIn(s.ots, o.id) }))}>Eliminar</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}

        {/* TAB: DISPOSITIVOS DE CONTROL (placeholder) */}
        {tab === "dispositivos" && (
          <section className="card">
            <h3 style={{ marginTop: 0 }}>Dispositivos de control</h3>
            <div style={{ color: "#6b7280" }}>Pestaña reservada. Aquí desarrollaremos los controles, visualizaciones y acciones relacionadas con dispositivos (sensores, actuadores, alarmas, etc.).</div>
          </section>
        )}

        {/* TAB: CONFIGURACIÓN */}
        {tab === "config" && (
          <section className="card">
            <h3 style={{ marginTop: 0 }}>Configuración</h3>

            <div style={{ display: "grid", gap: 12, maxWidth: 800 }}>
              <div>
                <div style={{ color: "#6b7280", fontSize: 12 }}>Horas planificadas (período)</div>
                <input type="number" min={0} value={state.horasPlanificadas} onChange={(e) => setState((s) => ({ ...s, horasPlanificadas: Number(e.target.value) }))} />
              </div>

              <div>
                <div style={{ color: "#6b7280", fontSize: 12 }}>Capacidad HH/semana</div>
                <input type="number" min={0} value={state.capacidadHHsemana} onChange={(e) => setState((s) => ({ ...s, capacidadHHsemana: Number(e.target.value) }))} />
              </div>

              <div>
                <div style={{ color: "#6b7280", fontSize: 12 }}>Supervisores (coma separado)</div>
                <textarea rows={2} value={state.supervisores.join(", ")} onChange={(e) => {
                  const arr = e.target.value.split(",").map(s => s.trim()).filter(Boolean);
                  setState((s) => ({ ...s, supervisores: arr }));
                }} />
                <div style={{ fontSize: 12, color: "#6b7280" }}>Guarda la lista para que aparezca en los selects de producción y filtros.</div>
              </div>

              <div>
                <button className="btn btn-primary" onClick={() => { localStorage.setItem("kpi-mantenimiento-georgalos-v2", JSON.stringify(state)); alert("Configuración guardada en localStorage."); }}>Guardar configuración</button>
                <button className="btn" style={{ marginLeft: 8 }} onClick={() => { setState((s) => ({ ...s, supervisores: DEFAULT_SUPERVISORES })); }}>Restaurar supervisores por defecto</button>
              </div>
            </div>
          </section>
        )}

        <footer style={{ fontSize: "0.75rem", color: "#9ca3af", textAlign: "center", padding: "1.2rem 0" }}>
          Tablero local (localStorage). Próximo paso: Firestore / autenticación usuarios.
        </footer>
      </div>
    </div>
  );
}

/* UI helpers */
function TabButton({ children, active, onClick }) {
  return (
    <button onClick={onClick} className={`tab-btn ${active ? "active" : ""}`} style={{
      padding: "8px 12px",
      borderRadius: 6,
      border: active ? "1px solid #2b6cb0" : "1px solid #e5e7eb",
      background: active ? "#ebf8ff" : "#fff",
      cursor: "pointer"
    }}>
      {children}
    </button>
  );
}

function KpiCard({ title, value, hint }) {
  return (
    <div className="card" style={{ padding: 10 }}>
      <div style={{ fontSize: 12, color: "#6b7280" }}>{title}</div>
      <div style={{ fontWeight: 700, fontSize: 18 }}>{value}</div>
      {hint && <div style={{ fontSize: 12, color: "#9ca3af" }}>{hint}</div>}
    </div>
  );
}

/* small helpers used above (immutables) */
const updateItemIn = (arr, id, patch) => arr.map((x) => (x.id === id ? { ...x, ...patch } : x));
const removeItemIn = (arr, id) => arr.filter((x) => x.id !== id);

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
