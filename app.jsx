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

// Catálogos
const SUPERVISORES = ["ALLOI", "AVILA", "BOERIS"];

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

const TURNOS = ["M", "T", "N"]; // Mañana, Tarde, Noche (solo inicial)
const AREAS = ["Estuchadora", "Balanza", "Mesas de refrigeración", "Cocción", "Empaque", "Servicios"];
const TIPOS_PARADA = ["No planificada", "Planificada", "Falta de insumos"];
const CRITICIDAD = ["A", "B", "C"];

// Helpers de fecha y números
const toDate = (s) => new Date(s);
const inRange = (d, desde, hasta) =>
  d >= new Date(desde + "T00:00") && d <= new Date(hasta + "T23:59:59");

const parseNumero = (str) => {
  if (str == null) return 0;
  const cleaned = String(str).trim().replace(/\./g, "").replace(",", ".");
  const n = Number(cleaned);
  return isFinite(n) ? n : 0;
};

// Componente principal
function App() {
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
          filtroTurno: parsed.filtroTurno ?? "Todos",
          filtroSector: parsed.filtroSector ?? "Todos",
          filtroSupervisor: parsed.filtroSupervisor ?? "Todos",
          paradas: parsed.paradas ?? [],
          ots: parsed.ots ?? [],
          produccion: parsed.produccion ?? [],
          economia: parsed.economia ?? [],
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
      filtroTurno: "Todos",
      filtroSector: "Todos",
      filtroSupervisor: "Todos",
      paradas: [],
      ots: [],
      produccion: [],
      economia: [],
    };
  });

  // Persistencia
  useEffect(() => {
    localStorage.setItem("kpi-mantenimiento-georgalos-v2", JSON.stringify(state));
  }, [state]);

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

  // Helpers para opciones de línea según sector seleccionado
  const opcionesLineas = useMemo(() => {
    if (!state.filtroSector || state.filtroSector === "Todos") return ["Todas", ...LINEAS];
    const lines = LINEAS_POR_SECTOR[state.filtroSector] ?? [];
    return ["Todas", ...lines];
  }, [state.filtroSector]);

  // Filtros combinados (fecha + sector/línea/turno/supervisor)
  const paradasFiltradas = useMemo(
    () =>
      paradasPeriodo.filter((p) => {
        const byLinea = state.filtroLinea === "Todas" || !state.filtroLinea || p.linea === state.filtroLinea;
        const byTurno = state.filtroTurno === "Todos" || !state.filtroTurno || p.turno === state.filtroTurno;
        const bySector = state.filtroSector === "Todos" || !state.filtroSector || p.sector === state.filtroSector;
        const bySupervisor =
          state.filtroSupervisor === "Todos" ||
          !state.filtroSupervisor ||
          p.supervisor === state.filtroSupervisor ||
          p.responsable === state.filtroSupervisor;
        return byLinea && byTurno && bySector && bySupervisor;
      }),
    [paradasPeriodo, state.filtroLinea, state.filtroTurno, state.filtroSector, state.filtroSupervisor]
  );

  const otsFiltradas = useMemo(
    () =>
      otsPeriodo.filter((o) => {
        const byLinea = state.filtroLinea === "Todas" || !state.filtroLinea || o.linea === state.filtroLinea;
        const byTurno = state.filtroTurno === "Todos" || !state.filtroTurno || o.turno === state.filtroTurno;
        const bySector = state.filtroSector === "Todos" || !state.filtroSector || o.sector === state.filtroSector || true;
        const bySupervisor =
          state.filtroSupervisor === "Todos" ||
          !state.filtroSupervisor ||
          o.responsable === state.filtroSupervisor ||
          o.supervisor === state.filtroSupervisor;
        return byLinea && byTurno && bySector && bySupervisor;
      }),
    [otsPeriodo, state.filtroLinea, state.filtroTurno, state.filtroSector, state.filtroSupervisor]
  );

  const produccionFiltrada = useMemo(
    () =>
      produccionPeriodo.filter((r) => {
        const byLinea = state.filtroLinea === "Todas" || !state.filtroLinea || r.linea === state.filtroLinea;
        const byTurno = state.filtroTurno === "Todos" || !state.filtroTurno || r.turno === state.filtroTurno;
        const bySector = state.filtroSector === "Todos" || !state.filtroSector || r.sector === state.filtroSector;
        const bySupervisor = state.filtroSupervisor === "Todos" || !state.filtroSupervisor || r.supervisor === state.filtroSupervisor;
        return byLinea && byTurno && bySector && bySupervisor;
      }),
    [produccionPeriodo, state.filtroLinea, state.filtroTurno, state.filtroSector, state.filtroSupervisor]
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

  const MTTR_h = useMemo(
    () => (fallas > 0 ? downtimeHoras / fallas : 0),
    [downtimeHoras, fallas]
  );
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
  const totalKgProd = useMemo(
    () => produccionFiltrada.reduce((a, r) => a + (r.kgProd || 0), 0),
    [produccionFiltrada]
  );
  const avgCumpPlan = useMemo(
    () =>
      produccionFiltrada.length > 0
        ? produccionFiltrada.reduce((a, r) => a + (r.cumpPlan || 0), 0) / produccionFiltrada.length
        : 0,
    [produccionFiltrada]
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
          supervisor: "ALLOI",
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

  const fileInputRef = useRef(null);
  const fileProdCsvRef = useRef(null);

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
        }));
      } catch (err) {
        alert("Archivo inválido");
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const resetData = () => {
    if (!confirm("¿Vaciar todos los datos del dashboard?")) return;
    localStorage.removeItem("kpi-mantenimiento-georgalos-v2");
    location.reload();
  };

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
          const supervisor =
            SUPERVISORES.find((s) => s === supRaw) ?? SUPERVISORES[0];

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

  const [notas, setNotas] = useState(localStorage.getItem("kpi-notas") || "");
  useEffect(() => {
    localStorage.setItem("kpi-notas", notas);
  }, [notas]);

  return (
    <div className="app-root">
      <div className="container">
        <header
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: "1rem",
            marginBottom: "1.5rem",
            flexWrap: "wrap",
          }}
        >
          <div>
            <h1 style={{ fontSize: "1.5rem", fontWeight: 600 }}>
              KPIs de Mantenimiento — Georgalos
            </h1>
            <p style={{ fontSize: "0.8rem", color: "#6b7280" }}>
              MTBF, MTTR, Disponibilidad, % Preventivo/Correctivo, Cumplimiento, Backlog + Producción y Económicos
            </p>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
            <button
              className="btn"
              onClick={() => download("kpis-georgalos.json", state)}
            >
              Exportar JSON
            </button>
            <label className="btn">
              Importar JSON
              <input
                ref={fileInputRef}
                type="file"
                accept="application/json"
                style={{ display: "none" }}
                onChange={onImport}
              />
            </label>
            <button className="btn" onClick={resetData}>
              Reiniciar
            </button>
          </div>
        </header>

        {/* --- Top row: 3 cards (Periodo | Filtros encadenados | Capacidad & Backlog) --- */}
        <section
          style={{
            display: "grid",
            gap: "1rem",
            marginBottom: "1rem",
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            alignItems: "start",
          }}
        >
          {/* Periodo */}
          <div className="card">
            <h2 style={{ fontSize: "0.9rem", marginBottom: "0.5rem" }}>Periodo</h2>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "0.5rem",
                fontSize: "0.75rem",
              }}
            >
              <div>
                <div style={{ color: "#6b7280", marginBottom: "0.1rem" }}>Desde</div>
                <input
                  type="date"
                  value={state.periodoDesde}
                  onChange={(e) =>
                    setState((s) => ({ ...s, periodoDesde: e.target.value }))
                  }
                />
              </div>
              <div>
                <div style={{ color: "#6b7280", marginBottom: "0.1rem" }}>Hasta</div>
                <input
                  type="date"
                  value={state.periodoHasta}
                  onChange={(e) =>
                    setState((s) => ({ ...s, periodoHasta: e.target.value }))
                  }
                />
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <div style={{ color: "#6b7280", marginBottom: "0.1rem" }}>
                  Horas planificadas
                </div>
                <input
                  type="number"
                  min={0}
                  value={state.horasPlanificadas}
                  onChange={(e) =>
                    setState((s) => ({
                      ...s,
                      horasPlanificadas: Number(e.target.value),
                    }))
                  }
                />
              </div>
            </div>
          </div>

          {/* Filtros encadenados: Sector -> Línea -> Supervisor */}
          <div className="card">
            <h2 style={{ fontSize: "0.9rem", marginBottom: "0.5rem" }}>Filtros</h2>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr 1fr",
                gap: "0.5rem",
                fontSize: "0.75rem",
              }}
            >
              <div>
                <div style={{ color: "#6b7280", marginBottom: "0.1rem" }}>Sector</div>
                <select
                  value={state.filtroSector}
                  onChange={(e) =>
                    setState((s) => ({
                      ...s,
                      filtroSector: e.target.value,
                      // resetear línea a 'Todas' cuando sector cambia
                      filtroLinea: "Todas",
                    }))
                  }
                >
                  <option value="Todos">Todos</option>
                  {SECTORES.map((sec) => (
                    <option key={sec} value={sec}>
                      {sec}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <div style={{ color: "#6b7280", marginBottom: "0.1rem" }}>Línea</div>
                <select
                  value={state.filtroLinea}
                  onChange={(e) => setState((s) => ({ ...s, filtroLinea: e.target.value }))}
                >
                  {opcionesLineas.map((l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <div style={{ color: "#6b7280", marginBottom: "0.1rem" }}>Supervisor</div>
                <select
                  value={state.filtroSupervisor}
                  onChange={(e) =>
                    setState((s) => ({ ...s, filtroSupervisor: e.target.value }))
                  }
                >
                  <option value="Todos">Todos</option>
                  {SUPERVISORES.map((sup) => (
                    <option key={sup} value={sup}>
                      {sup}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ gridColumn: "1 / -1" }}>
                <div style={{ color: "#6b7280", marginBottom: "0.1rem" }}>Turno</div>
                <select
                  value={state.filtroTurno}
                  onChange={(e) => setState((s) => ({ ...s, filtroTurno: e.target.value }))}
                >
                  <option value="Todos">Todos</option>
                  {TURNOS.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Capacidad & Backlog */}
          <div className="card">
            <h2 style={{ fontSize: "0.9rem", marginBottom: "0.5rem" }}>
              Capacidad & Backlog
            </h2>
            <div style={{ fontSize: "0.75rem", display: "grid", gap: "0.5rem" }}>
              <div>
                <div style={{ color: "#6b7280", marginBottom: "0.1rem" }}>
                  Capacidad HH/semana
                </div>
                <input
                  type="number"
                  min={0}
                  value={state.capacidadHHsemana}
                  onChange={(e) =>
                    setState((s) => ({
                      ...s,
                      capacidadHHsemana: Number(e.target.value),
                    }))
                  }
                />
              </div>
              <div style={{ fontSize: "0.8rem", color: "#4b5563" }}>
                Backlog:{" "}
                <span style={{ fontWeight: 600 }}>
                  {formatNumber(backlogSemanas, 2)} semanas
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* --- Dashboard de indicadores (un recuadro bajo los 3 anteriores) --- */}
        <section className="card" style={{ marginBottom: "1.5rem" }}>
          <h2 style={{ fontSize: "0.95rem", marginBottom: "0.6rem", fontWeight: 500 }}>
            Dashboard de indicadores
          </h2>
          <div className="kpi-grid" style={{ marginTop: 4 }}>
            <KpiCard title="MTBF" value={`${formatNumber(MTBF_h)} h`} hint={`${fallas} fallas`} />
            <KpiCard
              title="MTTR"
              value={`${formatNumber(MTTR_h)} h`}
              hint={`${formatNumber(downtimeHoras)} h paro`}
            />
            <KpiCard
              title="Disponibilidad"
              value={`${formatNumber(disponibilidad * 100)} %`}
              hint={`${formatNumber(uptimeHoras)} h uptime`}
            />
            <KpiCard
              title="Cumplimiento plan prev."
              value={`${formatNumber(cumplimientoPlan)} %`}
              hint={`${otsCompletadas}/${otsCompletadas + otsPlanificadas || 0}`}
            />
            <KpiCard
              title="% Preventivo"
              value={`${formatNumber(pctPrev)} %`}
              hint={`${otsPrev}/${otsFiltradas.length} OTs`}
            />
            <KpiCard
              title="% Correctivo"
              value={`${formatNumber(pctCorr)} %`}
              hint={`${otsCorr}/${otsFiltradas.length} OTs`}
            />
            <KpiCard
              title="Kg producidos (filtro)"
              value={`${formatNumber(totalKgProd, 0)} kg`}
              hint={`Cump. promedio: ${formatNumber(avgCumpPlan)} %`}
            />
          </div>
        </section>

        {/* --- Secciones de entrada de datos (abajo) --- */}

        {/* OTs Correctivas */}
        <section className="card" style={{ marginBottom: "1.5rem" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "0.75rem",
              gap: "0.75rem",
            }}
          >
            <h2 style={{ fontSize: "0.95rem", fontWeight: 500 }}>
              Órdenes de Trabajo — Correctivas
            </h2>
            <button className="btn btn-primary" onClick={addOTCorrectiva}>
              + Agregar
            </button>
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
                {otsCorrFiltradas.length === 0 && (
                  <tr>
                    <td colSpan={13} style={{ padding: "0.75rem", color: "#6b7280" }}>
                      Sin OTs correctivas en el filtro actual.
                    </td>
                  </tr>
                )}
                {otsCorrFiltradas.map((o) => (
                  <tr key={o.id}>
                    <td>
                      <input
                        type="date"
                        value={o.fecha}
                        onChange={(e) =>
                          setState((s) => ({
                            ...s,
                            ots: s.ots.map((x) =>
                              x.id === o.id ? { ...x, fecha: e.target.value } : x
                            ),
                          }))
                        }
                      />
                    </td>
                    <td>
                      <select
                        value={o.linea}
                        onChange={(e) =>
                          setState((s) => ({
                            ...s,
                            ots: s.ots.map((x) =>
                              x.id === o.id ? { ...x, linea: e.target.value } : x
                            ),
                          }))
                        }
                      >
                        <option value="">-</option>
                        {LINEAS.map((l) => (
                          <option key={l} value={l}>
                            {l}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <select
                        value={o.turno}
                        onChange={(e) =>
                          setState((s) => ({
                            ...s,
                            ots: s.ots.map((x) =>
                              x.id === o.id ? { ...x, turno: e.target.value } : x
                            ),
                          }))
                        }
                      >
                        {TURNOS.map((t) => (
                          <option key={t}>{t}</option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input
                        type="text"
                        value={o.equipo}
                        onChange={(e) =>
                          setState((s) => ({
                            ...s,
                            ots: s.ots.map((x) =>
                              x.id === o.id ? { ...x, equipo: e.target.value } : x
                            ),
                          }))
                        }
                      />
                    </td>
                    <td>
                      <select
                        value={o.estado}
                        onChange={(e) =>
                          setState((s) => ({
                            ...s,
                            ots: s.ots.map((x) =>
                              x.id === o.id ? { ...x, estado: e.target.value } : x
                            ),
                          }))
                        }
                      >
                        <option>Planificada</option>
                        <option>En curso</option>
                        <option>Completada</option>
                        <option>Cancelada</option>
                      </select>
                    </td>
                    <td>
                      <select
                        value={o.criticidad}
                        onChange={(e) =>
                          setState((s) => ({
                            ...s,
                            ots: s.ots.map((x) =>
                              x.id === o.id ? { ...x, criticidad: e.target.value } : x
                            ),
                          }))
                        }
                      >
                        {CRITICIDAD.map((c) => (
                          <option key={c}>{c}</option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input
                        type="number"
                        min={0}
                        value={o.hh ?? 0}
                        onChange={(e) =>
                          setState((s) => ({
                            ...s,
                            ots: s.ots.map((x) =>
                              x.id === o.id ? { ...x, hh: Number(e.target.value) } : x
                            ),
                          }))
                        }
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        min={0}
                        value={o.costoARS ?? 0}
                        onChange={(e) =>
                          setState((s) => ({
                            ...s,
                            ots: s.ots.map((x) =>
                              x.id === o.id
                                ? { ...x, costoARS: Number(e.target.value) }
                                : x
                            ),
                          }))
                        }
                      />
                    </td>
                    <td>
                      <input
                        type="text"
                        value={o.responsable || ""}
                        onChange={(e) =>
                          setState((s) => ({
                            ...s,
                            ots: s.ots.map((x) =>
                              x.id === o.id
                                ? { ...x, responsable: e.target.value }
                                : x
                            ),
                          }))
                        }
                      />
                    </td>
                    <td>
                      <input
                        type="text"
                        value={o.proveedor || ""}
                        onChange={(e) =>
                          setState((s) => ({
                            ...s,
                            ots: s.ots.map((x) =>
                              x.id === o.id
                                ? { ...x, proveedor: e.target.value }
                                : x
                            ),
                          }))
                        }
                      />
                    </td>
                    <td>
                      <input
                        type="text"
                        value={o.codigoSAP || ""}
                        onChange={(e) =>
                          setState((s) => ({
                            ...s,
                            ots: s.ots.map((x) =>
                              x.id === o.id
                                ? { ...x, codigoSAP: e.target.value }
                                : x
                            ),
                          }))
                        }
                      />
                    </td>
                    <td>
                      <input
                        type="text"
                        value={o.repuestos || ""}
                        onChange={(e) =>
                          setState((s) => ({
                            ...s,
                            ots: s.ots.map((x) =>
                              x.id === o.id
                                ? { ...x, repuestos: e.target.value }
                                : x
                            ),
                          }))
                        }
                      />
                    </td>
                    <td>
                      <button
                        className="btn"
                        onClick={() =>
                          setState((s) => ({
                            ...s,
                            ots: s.ots.filter((x) => x.id !== o.id),
                          }))
                        }
                      >
                        Eliminar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ marginTop: "0.5rem", fontSize: "0.75rem", color: "#6b7280" }}>
            OTs correctivas: {otsCorrFiltradas.length} — Completadas:{" "}
            {otsCorrFiltradas.filter((o) => o.estado === "Completada").length}
          </div>
        </section>

        {/* Preventivos */}
        <section className="card" style={{ marginBottom: "1.5rem" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "0.75rem",
              gap: "0.75rem",
            }}
          >
            <h2 style={{ fontSize: "0.95rem", fontWeight: 500 }}>
              Preventivos — Cumplimiento & Ejecución
            </h2>
            <button className="btn btn-primary" onClick={addOTPreventiva}>
              + Agregar plan
            </button>
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
                {otsPrevFiltradas.length === 0 && (
                  <tr>
                    <td colSpan={8} style={{ padding: "0.75rem", color: "#6b7280" }}>
                      Sin preventivos planificados en el filtro actual.
                    </td>
                  </tr>
                )}
                {otsPrevFiltradas.map((o) => (
                  <tr key={o.id}>
                    <td>
                      <input
                        type="date"
                        value={o.fecha}
                        onChange={(e) =>
                          setState((s) => ({
                            ...s,
                            ots: s.ots.map((x) =>
                              x.id === o.id ? { ...x, fecha: e.target.value } : x
                            ),
                          }))
                        }
                      />
                    </td>
                    <td>
                      <input
                        type="date"
                        value={o.fechaEjec || ""}
                        onChange={(e) =>
                          setState((s) => ({
                            ...s,
                            ots: s.ots.map((x) =>
                              x.id === o.id ? { ...x, fechaEjec: e.target.value } : x
                            ),
                          }))
                        }
                      />
                    </td>
                    <td>
                      <select
                        value={o.linea}
                        onChange={(e) =>
                          setState((s) => ({
                            ...s,
                            ots: s.ots.map((x) =>
                              x.id === o.id ? { ...x, linea: e.target.value } : x
                            ),
                          }))
                        }
                      >
                        <option value="">-</option>
                        {LINEAS.map((l) => (
                          <option key={l} value={l}>
                            {l}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input
                        type="text"
                        value={o.equipo}
                        onChange={(e) =>
                          setState((s) => ({
                            ...s,
                            ots: s.ots.map((x) =>
                              x.id === o.id ? { ...x, equipo: e.target.value } : x
                            ),
                          }))
                        }
                      />
                    </td>
                    <td>
                      <select
                        value={o.estado}
                        onChange={(e) =>
                          setState((s) => ({
                            ...s,
                            ots: s.ots.map((x) =>
                              x.id === o.id ? { ...x, estado: e.target.value } : x
                            ),
                          }))
                        }
                      >
                        <option>Planificada</option>
                        <option>En curso</option>
                        <option>Completada</option>
                        <option>Cancelada</option>
                      </select>
                    </td>
                    <td>
                      <input
                        type="text"
                        value={o.responsable || ""}
                        onChange={(e) =>
                          setState((s) => ({
                            ...s,
                            ots: s.ots.map((x) =>
                              x.id === o.id
                                ? { ...x, responsable: e.target.value }
                                : x
                            ),
                          }))
                        }
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        min={0}
                        value={o.hh ?? 0}
                        onChange={(e) =>
                          setState((s) => ({
                            ...s,
                            ots: s.ots.map((x) =>
                              x.id === o.id ? { ...x, hh: Number(e.target.value) } : x
                            ),
                          }))
                        }
                      />
                    </td>
                    <td>
                      <button
                        className="btn"
                        onClick={() =>
                          setState((s) => ({
                            ...s,
                            ots: s.ots.filter((x) => x.id !== o.id),
                          }))
                        }
                      >
                        Eliminar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ marginTop: "0.5rem", fontSize: "0.8rem", color: "#374151" }}>
            <span className="badge">
              Planificados: {otsPrevFiltradas.length}
            </span>{" "}
            <span className="badge" style={{ marginLeft: 6 }}>
              Completados:{" "}
              {otsPrevFiltradas.filter((o) => o.estado === "Completada").length}
            </span>{" "}
            <span className="badge" style={{ marginLeft: 6 }}>
              Cumplimiento:{" "}
              {formatNumber(
                (otsPrevFiltradas.filter((o) => o.estado === "Completada").length /
                  Math.max(1, otsPrevFiltradas.length)) *
                  100
              )}
              %
            </span>
          </div>
        </section>

        {/* Producción */}
        <section className="card" style={{ marginBottom: "1.5rem" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "0.75rem",
              gap: "0.75rem",
              flexWrap: "wrap",
            }}
          >
            <h2 style={{ fontSize: "0.95rem", fontWeight: 500 }}>
              Producción — Importación CSV
            </h2>
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
              <button className="btn btn-primary" onClick={addProduccion}>
                + Agregar turno
              </button>
              <button
                className="btn"
                onClick={() => fileProdCsvRef.current && fileProdCsvRef.current.click()}
              >
                Importar producción CSV
              </button>
              <input
                ref={fileProdCsvRef}
                type="file"
                accept=".csv,text/csv"
                style={{ display: "none" }}
                onChange={onImportProduccionCsv}
              />
            </div>
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
                  <tr>
                    <td colSpan={13} style={{ padding: "0.75rem", color: "#6b7280" }}>
                      Sin datos de producción aún. Importá el CSV desde el sistema o cargá un turno manualmente.
                    </td>
                  </tr>
                )}
                {state.produccion.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <input
                        type="date"
                        value={r.fecha}
                        onChange={(e) =>
                          setState((s) => ({
                            ...s,
                            produccion: s.produccion.map((x) =>
                              x.id === r.id ? { ...x, fecha: e.target.value } : x
                            ),
                          }))
                        }
                      />
                    </td>
                    <td>
                      <select
                        value={r.turno}
                        onChange={(e) =>
                          setState((s) => ({
                            ...s,
                            produccion: s.produccion.map((x) =>
                              x.id === r.id ? { ...x, turno: e.target.value } : x
                            ),
                          }))
                        }
                      >
                        {TURNOS.map((t) => (
                          <option key={t}>{t}</option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <select
                        value={r.sector || "CHOCOLATE"}
                        onChange={(e) => {
                          const nuevoSector = e.target.value;
                          setState((s) => ({
                            ...s,
                            produccion: s.produccion.map((x) =>
                              x.id === r.id
                                ? {
                                    ...x,
                                    sector: nuevoSector,
                                    linea: (LINEAS_POR_SECTOR[nuevoSector] || []).includes(x.linea)
                                      ? x.linea
                                      : "",
                                  }
                                : x
                            ),
                          }));
                        }}
                      >
                        {SECTORES.map((sec) => (
                          <option key={sec} value={sec}>
                            {sec}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <select
                        value={r.linea || ""}
                        onChange={(e) =>
                          setState((s) => ({
                            ...s,
                            produccion: s.produccion.map((x) =>
                              x.id === r.id ? { ...x, linea: e.target.value } : x
                            ),
                          }))
                        }
                      >
                        <option value="">-</option>
                        {(LINEAS_POR_SECTOR[r.sector] || []).map((l) => (
                          <option key={l} value={l}>
                            {l}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input
                        type="number"
                        min={0}
                        value={r.kgPlan ?? 0}
                        onChange={(e) =>
                          setState((s) => ({
                            ...s,
                            produccion: s.produccion.map((x) =>
                              x.id === r.id ? { ...x, kgPlan: Number(e.target.value) } : x
                            ),
                          }))
                        }
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        min={0}
                        value={r.kgProd ?? 0}
                        onChange={(e) =>
                          setState((s) => ({
                            ...s,
                            produccion: s.produccion.map((x) =>
                              x.id === r.id ? { ...x, kgProd: Number(e.target.value) } : x
                            ),
                          }))
                        }
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        min={0}
                        value={r.cumpPlan ?? 0}
                        onChange={(e) =>
                          setState((s) => ({
                            ...s,
                            produccion: s.produccion.map((x) =>
                              x.id === r.id ? { ...x, cumpPlan: Number(e.target.value) } : x
                            ),
                          }))
                        }
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        min={0}
                        value={r.kgReproceso ?? 0}
                        onChange={(e) =>
                          setState((s) => ({
                            ...s,
                            produccion: s.produccion.map((x) =>
                              x.id === r.id ? { ...x, kgReproceso: Number(e.target.value) } : x
                            ),
                          }))
                        }
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        min={0}
                        value={r.kgDecomiso ?? 0}
                        onChange={(e) =>
                          setState((s) => ({
                            ...s,
                            produccion: s.produccion.map((x) =>
                              x.id === r.id ? { ...x, kgDecomiso: Number(e.target.value) } : x
                            ),
                          }))
                        }
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        min={0}
                        value={r.tiempoParadaMin ?? 0}
                        onChange={(e) =>
                          setState((s) => ({
                            ...s,
                            produccion: s.produccion.map((x) =>
                              x.id === r.id ? { ...x, tiempoParadaMin: Number(e.target.value) } : x
                            ),
                          }))
                        }
                      />
                    </td>
                    <td>
                      <select
                        value={r.supervisor || "ALLOI"}
                        onChange={(e) =>
                          setState((s) => ({
                            ...s,
                            produccion: s.produccion.map((x) =>
                              x.id === r.id ? { ...x, supervisor: e.target.value } : x
                            ),
                          }))
                        }
                      >
                        {SUPERVISORES.map((sup) => (
                          <option key={sup} value={sup}>
                            {sup}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <textarea
                        rows={1}
                        value={r.novedades || ""}
                        onChange={(e) =>
                          setState((s) => ({
                            ...s,
                            produccion: s.produccion.map((x) =>
                              x.id === r.id ? { ...x, novedades: e.target.value } : x
                            ),
                          }))
                        }
                      />
                    </td>
                    <td>
                      <button
                        className="btn"
                        onClick={() =>
                          setState((s) => ({
                            ...s,
                            produccion: s.produccion.filter((x) => x.id !== r.id),
                          }))
                        }
                      >
                        Eliminar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Datos Económicos */}
        <section className="card" style={{ marginBottom: "1.5rem" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "0.75rem",
              gap: "0.75rem",
            }}
          >
            <h2 style={{ fontSize: "0.95rem", fontWeight: 500 }}>
              Datos Económicos (carga manual mensual)
            </h2>
            <button className="btn btn-primary" onClick={addEconomia}>
              + Agregar registro
            </button>
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Periodo (AAAA-MM)</th>
                  <th>Sector / Línea</th>
                  <th>Gasto mantenimiento (USD)</th>
                  <th>Costo energía (USD)</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {state.economia.length === 0 && (
                  <tr>
                    <td colSpan={5} style={{ padding: "0.75rem", color: "#6b7280" }}>
                      Sin registros económicos aún. Cargá un registro por mes y sector.
                    </td>
                  </tr>
                )}
                {state.economia.map((e) => (
                  <tr key={e.id}>
                    <td>
                      <input
                        type="month"
                        value={e.periodo}
                        onChange={(ev) =>
                          setState((s) => ({
                            ...s,
                            economia: s.economia.map((x) =>
                              x.id === e.id ? { ...x, periodo: ev.target.value } : x
                            ),
                          }))
                        }
                      />
                    </td>
                    <td>
                      <input
                        type="text"
                        value={e.sector || ""}
                        onChange={(ev) =>
                          setState((s) => ({
                            ...s,
                            economia: s.economia.map((x) =>
                              x.id === e.id ? { ...x, sector: ev.target.value } : x
                            ),
                          }))
                        }
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        min={0}
                        value={e.gastoMantenimientoUSD ?? 0}
                        onChange={(ev) =>
                          setState((s) => ({
                            ...s,
                            economia: s.economia.map((x) =>
                              x.id === e.id
                                ? {
                                    ...x,
                                    gastoMantenimientoUSD: Number(ev.target.value),
                                  }
                                : x
                            ),
                          }))
                        }
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        min={0}
                        value={e.costoEnergiaUSD ?? 0}
                        onChange={(ev) =>
                          setState((s) => ({
                            ...s,
                            economia: s.economia.map((x) =>
                              x.id === e.id
                                ? {
                                    ...x,
                                    costoEnergiaUSD: Number(ev.target.value),
                                  }
                                : x
                            ),
                          }))
                        }
                      />
                    </td>
                    <td>
                      <button
                        className="btn"
                        onClick={() =>
                          setState((s) => ({
                            ...s,
                            economia: s.economia.filter((x) => x.id !== e.id),
                          }))
                        }
                      >
                        Eliminar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Notas */}
        <section className="card" style={{ marginBottom: "2rem" }}>
          <h2 style={{ fontSize: "0.95rem", fontWeight: 500, marginBottom: "0.5rem" }}>
            Notas rápidas
          </h2>
          <textarea
            rows={2}
            placeholder="Escribí ideas, decisiones o pendientes de mantenimiento…"
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            style={{ width: "100%", resize: "vertical", fontSize: "0.8rem" }}
          />
        </section>

        <footer
          style={{
            fontSize: "0.7rem",
            color: "#9ca3af",
            textAlign: "center",
            paddingBottom: "1.5rem",
          }}
        >
          Tablero local (localStorage). Próximo paso: Firestore + usuarios de planta.
        </footer>
      </div>
    </div>
  );
}
function KpiCard({ title, value, hint }) {
  return (
    <div className="card">
      <div className="kpi-card-title">{title}</div>
      <div className="kpi-card-value">{value}</div>
      {hint && <div className="kpi-card-hint">{hint}</div>}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
