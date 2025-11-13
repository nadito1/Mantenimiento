const { useState, useEffect, useMemo, useRef } = React;

const MINUTOS_TURNO = 390;

// ================== UTILIDADES ==================

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

const parseNumero = (str) => {
  if (str == null) return 0;
  const cleaned = String(str).trim().replace(/\./g, "").replace(",", ".");
  const n = Number(cleaned);
  return isFinite(n) ? n : 0;
};

const monthKey = (dateStr) => {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T00:00");
  if (isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
};

// ================== CATÁLOGOS ==================

const SUPERVISORES = ["ALLOI", "AVILA", "BOERIS"];

const TURNOS = ["Mañana", "Tarde", "Noche"];
const turnoLabel = (t) => (t ? t[0] : "");

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
];

const LINEAS_POR_SECTOR = {
  CHOCOLATE: ["CV1000-1", "CV1000-2", "CV1000-3", "DELVER", "CHISPAS", "MANGA"],
  TURRON: ["NAMUR", "TURRON FIESTA", "CROCANTE", "ESTUCHADO", "TURRON ARTESANAL"],
  "CARAMELO BLANDO": ["FLYNN", "FLYNNIES", "XXL", "EMZO", "ENVAMEC"],
  "CARAMELO DURO": ["EMZO", "ENVAMEC"],
  CONFITE: ["PACK PLUS", "ESTUCHADORA", "CONFITE"],
  ALFAJOR: ["ALFAJOR"],
  "HUEVO DE PASCUA": ["HUEVO DE PASCUA"],
  "BARRA DE MANI": ["BARRA DE MANI", "LINGOTE"],
  "BARRA DE CEREALES": ["BARRA DE CEREALES"],
  CUBANITO: ["CUBANITO"],
  ARTESANAL: [],
};

const LINEAS = Array.from(new Set(Object.values(LINEAS_POR_SECTOR).flat()));

const AREAS = [
  "Estuchadora",
  "Balanza",
  "Mesas de refrigeración",
  "Cocción",
  "Empaque",
  "Servicios",
];

const TIPOS_PARADA = ["No planificada", "Planificada", "Falta de insumos"];
const CRITICIDAD = ["A", "B", "C"];

// ================== FECHAS ==================

const toDate = (s) => new Date(s);
const inRange = (d, desde, hasta) =>
  d >= new Date(desde + "T00:00") && d <= new Date(hasta + "T23:59:59");

// ================== ESTADO INICIAL / NORMALIZACIÓN ==================

const buildDefaultState = () => {
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
};

const normalizeState = (raw) => {
  const base = buildDefaultState();
  if (!raw || typeof raw !== "object") return base;
  return {
    ...base,
    ...raw,
    paradas: raw.paradas || [],
    ots: raw.ots || [],
    produccion: raw.produccion || [],
    economia: raw.economia || [],
  };
};

// ================== COMPONENTE PRINCIPAL ==================

function App() {
  const [state, setState] = useState(() => {
    const saved = localStorage.getItem("kpi-mantenimiento-georgalos-v3");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return normalizeState(parsed);
      } catch (e) {
        console.error("Error leyendo localStorage", e);
      }
    }
    return buildDefaultState();
  });

  useEffect(() => {
    localStorage.setItem("kpi-mantenimiento-georgalos-v3", JSON.stringify(state));
  }, [state]);

  // ======= FILTROS POR PERÍODO =======

  const paradasPeriodo = useMemo(
    () =>
      state.paradas.filter((p) =>
        inRange(toDate(p.fecha), state.periodoDesde, state.periodoHasta)
      ),
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

  // ======= FILTROS COMBINADOS =======

  const paradasFiltradas = useMemo(
    () =>
      paradasPeriodo.filter(
        (p) =>
          (state.filtroLinea === "Todas" || p.linea === state.filtroLinea) &&
          (state.filtroTurno === "Todos" || p.turno === state.filtroTurno)
      ),
    [paradasPeriodo, state.filtroLinea, state.filtroTurno]
  );

  const otsFiltradas = useMemo(
    () =>
      otsPeriodo.filter(
        (o) =>
          (state.filtroLinea === "Todas" || o.linea === state.filtroLinea) &&
          (state.filtroTurno === "Todos" || o.turno === state.filtroTurno)
      ),
    [otsPeriodo, state.filtroLinea, state.filtroTurno]
  );

  const produccionFiltrada = useMemo(
    () =>
      produccionPeriodo.filter((r) => {
        const okSector =
          state.filtroSector === "Todos" || r.sector === state.filtroSector;
        const okLinea = state.filtroLinea === "Todas" || r.linea === state.filtroLinea;
        const okTurno =
          state.filtroTurno === "Todos" || r.turno === state.filtroTurno;
        const okSup =
          state.filtroSupervisor === "Todos" || r.supervisor === state.filtroSupervisor;
        return okSector && okLinea && okTurno && okSup;
      }),
    [
      produccionPeriodo,
      state.filtroSector,
      state.filtroLinea,
      state.filtroTurno,
      state.filtroSupervisor,
    ]
  );

  const otsCorrFiltradas = useMemo(
    () => otsFiltradas.filter((o) => o.tipo === "Correctivo"),
    [otsFiltradas]
  );
  const otsPrevFiltradas = useMemo(
    () => otsFiltradas.filter((o) => o.tipo === "Preventivo"),
    [otsFiltradas]
  );

  // ======= KPIs MANTENIMIENTO (PARADAS + OTs) =======

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

  // ======= KPIs PRODUCCIÓN (USANDO CSV / CARGA) =======

  const totalKgPlan = produccionFiltrada.reduce(
    (acc, r) => acc + (Number(r.kgPlan) || 0),
    0
  );
  const totalKgProd = produccionFiltrada.reduce(
    (acc, r) => acc + (Number(r.kgProd) || 0),
    0
  );
  const totalKgReproceso = produccionFiltrada.reduce(
    (acc, r) => acc + (Number(r.kgReproceso) || 0),
    0
  );
  const totalKgDecomiso = produccionFiltrada.reduce(
    (acc, r) => acc + (Number(r.kgDecomiso) || 0),
    0
  );
  const totalTurnos = produccionFiltrada.length;

  const downtimeProdMin = produccionFiltrada.reduce(
    (acc, r) => acc + (Number(r.tiempoParadaMin) || 0),
    0
  );
  const tiempoPlanTotalMin = totalTurnos * MINUTOS_TURNO;
  const uptimeProdMin = Math.max(0, tiempoPlanTotalMin - downtimeProdMin);

  const fallasProd = produccionFiltrada.filter(
    (r) => (Number(r.tiempoParadaMin) || 0) > 0
  ).length;

  const MTTR_prod_h = fallasProd > 0 ? (downtimeProdMin / 60) / fallasProd : 0;
  const MTBF_prod_h = fallasProd > 0 ? (uptimeProdMin / 60) / fallasProd : 0;

  const dispProd = tiempoPlanTotalMin > 0 ? uptimeProdMin / tiempoPlanTotalMin : 0;
  const perfProd = totalKgPlan > 0 ? totalKgProd / totalKgPlan : 0;
  const calidadProd =
    totalKgProd > 0
      ? (totalKgProd - totalKgReproceso - totalKgDecomiso) / totalKgProd
      : 0;

  const OEE_prod = dispProd * perfProd * calidadProd;
  const horasTrabajadasProd = uptimeProdMin / 60;

  // ======= KPIs POR SUPERVISOR =======

  const kpisSupervisores = SUPERVISORES.map((sup) => {
    const filas = produccionPeriodo.filter((r) => {
      const okSup = r.supervisor === sup;
      const okSector =
        state.filtroSector === "Todos" || r.sector === state.filtroSector;
      const okLinea =
        state.filtroLinea === "Todas" || r.linea === state.filtroLinea;
      const okTurno =
        state.filtroTurno === "Todos" || r.turno === state.filtroTurno;
      return okSup && okSector && okLinea && okTurno;
    });

    if (filas.length === 0) {
      return {
        supervisor: sup,
        eficiencia: 0,
        oee: 0,
      };
    }

    const kgPlan = filas.reduce((a, r) => a + (Number(r.kgPlan) || 0), 0);
    const kgProd = filas.reduce((a, r) => a + (Number(r.kgProd) || 0), 0);
    const kgRep = filas.reduce((a, r) => a + (Number(r.kgReproceso) || 0), 0);
    const kgDec = filas.reduce((a, r) => a + (Number(r.kgDecomiso) || 0), 0);

    const turnos = filas.length;
    const tPlan = turnos * MINUTOS_TURNO;
    const dParo = filas.reduce(
      (a, r) => a + (Number(r.tiempoParadaMin) || 0),
      0
    );
    const tUp = Math.max(0, tPlan - dParo);

    const disp = tPlan > 0 ? tUp / tPlan : 0;
    const perf = kgPlan > 0 ? kgProd / kgPlan : 0;
    const cal =
      kgProd > 0 ? (kgProd - kgRep - kgDec) / kgProd : 0;

    const oee = disp * perf * cal;
    const eficiencia = kgPlan > 0 ? (kgProd / kgPlan) * 100 : 0;

    return {
      supervisor: sup,
      eficiencia,
      oee: oee * 100,
    };
  });

  // ======= PATRONES (SIGUEN BASADOS EN PARADAS, POR SI IMPORTÁS MÁS ADELANTE) =======

  const patrones = [
    {
      id: "falta_insumos",
      label: "Falta de insumos",
      test: (p) => p.tipoParada === "Falta de insumos" || /insumo/i.test(p.motivo || ""),
    },
    {
      id: "estuchadora",
      label: "Estuchadora",
      test: (p) =>
        /estuchador|estuchadora/i.test((p.equipo || "") + " " + (p.motivo || "")) ||
        p.area === "Estuchadora",
    },
    {
      id: "balanza",
      label: "Balanza",
      test: (p) =>
        /balanza/i.test((p.equipo || "") + " " + (p.motivo || "")) || p.area === "Balanza",
    },
    {
      id: "refrigeracion",
      label: "Mesas de refrigeración",
      test: (p) =>
        /refrig|fr[ií]o|mesa/i.test(p.motivo || "") || p.area === "Mesas de refrigeración",
    },
  ];

  const resumenPatrones = patrones.map((pat) => ({
    id: pat.id,
    label: pat.label,
    conteo: paradasFiltradas.filter(pat.test).length,
    minutos: paradasFiltradas
      .filter(pat.test)
      .reduce((a, p) => a + (p.downtimeMin || 0), 0),
  }));

  // ======= DATOS ECONÓMICOS (MENSUALES, POR SECTOR) =======

  const economiaCalculada = state.economia.map((e) => {
    const toneladasSector = produccionPeriodo
      .filter(
        (r) =>
          monthKey(r.fecha) === e.periodo &&
          r.sector === e.sector
      )
      .reduce((a, r) => a + (Number(r.kgProd) || 0), 0) / 1000;

    const mantUSD = Number(e.gastoMantenimientoUSD) || 0;
    const enerUSD = Number(e.costoEnergiaUSD) || 0;

    const mantPorTon = toneladasSector > 0 ? mantUSD / toneladasSector : 0;
    const enerPorTon = toneladasSector > 0 ? enerUSD / toneladasSector : 0;

    return {
      ...e,
      toneladasSector,
      mantPorTon,
      enerPorTon,
    };
  });

  // ======= MANEJO FORMULARIOS =======

  const addOTCorrectiva = () => {
    setState((s) => ({
      ...s,
      ots: [
        ...s.ots,
        {
          id: crypto.randomUUID(),
          fecha: new Date().toISOString().slice(0, 10),
          linea: "FLYNN",
          turno: "Mañana",
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
          linea: "FLYNN",
          turno: "Mañana",
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
          turno: "Mañana",
          sector: "CHOCOLATE",
          linea: "CV1000-1",
          kgPlan: 0,
          kgProd: 0,
          kgReproceso: 0,
          kgDecomiso: 0,
          cumpPlan: 0,
          tiempoParadaMin: 0,
          supervisor: "ALLOI",
        },
      ],
    }));
  };

  const addEconomia = () => {
    const hoyKey = monthKey(state.periodoDesde) || new Date().toISOString().slice(0, 7);
    setState((s) => ({
      ...s,
      economia: [
        ...s.economia,
        {
          id: crypto.randomUUID(),
          periodo: hoyKey, // yyyy-MM
          sector: "CHOCOLATE",
          gastoMantenimientoUSD: 0,
          costoEnergiaUSD: 0,
        },
      ],
    }));
  };

  // ======= IMPORT / EXPORT JSON =======

  const jsonInputRef = useRef(null);
  const csvInputRef = useRef(null);

  const onImportJson = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result));
        setState(normalizeState(data));
      } catch (err) {
        alert("Archivo JSON inválido");
      }
    };
    reader.readAsText(file);
    if (jsonInputRef.current) jsonInputRef.current.value = "";
  };

  const resetData = () => {
    if (!confirm("¿Vaciar todos los datos del dashboard?")) return;
    localStorage.removeItem("kpi-mantenimiento-georgalos-v3");
    location.reload();
  };

  // ======= IMPORTACIÓN CSV PRODUCCIÓN =======

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
            "El CSV no tiene todos los encabezados requeridos.\nNecesarios: FECHA, TURNO, SECTOR, KG PLAN, LINEA, KG PRODUCIDOS, KG REPROCESO, KG DECOMISO, TIEMPO PARADA POR AVERIAS, SUPERVISOR (CUMP PLAN % opcional)."
          );
          return;
        }

        const registros = [];

        for (let i = 1; i < lines.length; i++) {
          const row = lines[i].split(delimiter);
          if (row.length === 0) continue;

          const val = (idxCol) =>
            idxCol >= 0 && idxCol < row.length ? row[idxCol].trim() : "";

          let rawFecha = val(idxFecha);
          // Puede venir "2025-01-13 00:00:00" o "13/01/2025"
          let fecha = "";
          if (/^\d{4}-\d{2}-\d{2}/.test(rawFecha)) {
            fecha = rawFecha.slice(0, 10);
          } else if (/^\d{2}\/\d{2}\/\d{4}/.test(rawFecha)) {
            const [dd, mm, yyyy] = rawFecha.split("/");
            fecha = `${yyyy}-${mm}-${dd}`;
          } else {
            // último recurso: que el browser intente parsear
            const d = new Date(rawFecha);
            if (!isNaN(d.getTime())) {
              fecha = d.toISOString().slice(0, 10);
            }
          }
          if (!fecha) continue; // si no podemos parsear fecha, saltamos

          const turnoRaw = val(idxTurno).toUpperCase();
          let turno = "Mañana";
          if (turnoRaw.startsWith("T")) turno = "Tarde";
          else if (turnoRaw.startsWith("N")) turno = "Noche";

          const sector = val(idxSector).trim().toUpperCase();
          const linea = val(idxLinea).trim();

          const kgPlan = parseNumero(val(idxKgPlan));
          const kgProd = parseNumero(val(idxKgProd));
          const kgReproceso = parseNumero(val(idxKgReproceso));
          const kgDecomiso = parseNumero(val(idxKgDecomiso));
          const cumpPlan = idxCumpPlan !== -1 ? parseNumero(val(idxCumpPlan)) : 0;
          const tiempoParadaMin = parseNumero(val(idxTiempoParada));
          const supervisor = val(idxSupervisor).trim().toUpperCase();

          registros.push({
            id: crypto.randomUUID(),
            fecha,
            turno,
            sector,
            linea,
            kgPlan,
            kgProd,
            kgReproceso,
            kgDecomiso,
            cumpPlan,
            tiempoParadaMin,
            supervisor: supervisor || "ALLOI",
          });
        }

        if (registros.length === 0) {
          alert("No se encontraron filas válidas en el CSV.");
          return;
        }

        setState((s) => ({
          ...s,
          produccion: [...s.produccion, ...registros],
        }));

        alert(`Se importaron ${registros.length} filas de producción.`);
      } catch (err) {
        console.error(err);
        alert("Error al leer el CSV de producción.");
      }
    };
    reader.readAsText(file, "utf-8");
    if (csvInputRef.current) csvInputRef.current.value = "";
  };

  // ======= NOTAS RÁPIDAS =======

  const [notas, setNotas] = useState(localStorage.getItem("kpi-notas") || "");
  useEffect(() => {
    localStorage.setItem("kpi-notas", notas);
  }, [notas]);

  // ======= RENDER =======

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
              MTBF / MTTR / Disponibilidad, Preventivo vs Correctivo, Backlog + Producción, OEE y
              Económicos (USD/ton)
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
                ref={jsonInputRef}
                type="file"
                accept="application/json"
                style={{ display: "none" }}
                onChange={onImportJson}
              />
            </label>
            <button className="btn" onClick={resetData}>
              Reiniciar
            </button>
          </div>
        </header>

        {/* FILTROS */}
        <section
          style={{
            display: "grid",
            gap: "1rem",
            marginBottom: "1rem",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          }}
        >
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
                  Horas planificadas (mant.)
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

          <div className="card">
            <h2 style={{ fontSize: "0.9rem", marginBottom: "0.5rem" }}>Filtros</h2>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "0.5rem",
                fontSize: "0.75rem",
              }}
            >
              <div>
                <div style={{ color: "#6b7280", marginBottom: "0.1rem" }}>Sector</div>
                <select
                  value={state.filtroSector}
                  onChange={(e) =>
                    setState((s) => ({ ...s, filtroSector: e.target.value }))
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
                  onChange={(e) =>
                    setState((s) => ({ ...s, filtroLinea: e.target.value }))
                  }
                >
                  <option value="Todas">Todas</option>
                  {LINEAS.map((l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <div style={{ color: "#6b7280", marginBottom: "0.1rem" }}>Turno</div>
                <select
                  value={state.filtroTurno}
                  onChange={(e) =>
                    setState((s) => ({ ...s, filtroTurno: e.target.value }))
                  }
                >
                  <option value="Todos">Todos</option>
                  {TURNOS.map((t) => (
                    <option key={t} value={t}>
                      {turnoLabel(t)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <div style={{ color: "#6b7280", marginBottom: "0.1rem" }}>
                  Supervisor (prod.)
                </div>
                <select
                  value={state.filtroSupervisor}
                  onChange={(e) =>
                    setState((s) => ({ ...s, filtroSupervisor: e.target.value }))
                  }
                >
                  <option value="Todos">Todos</option>
                  {SUPERVISORES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

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

        {/* KPIs MANTENIMIENTO */}
        <section className="kpi-grid" style={{ marginBottom: "1rem" }}>
          <KpiCard title="MTBF (mant.)" value={`${formatNumber(MTBF_h)} h`} hint={`${fallas} fallas`} />
          <KpiCard
            title="MTTR (mant.)"
            value={`${formatNumber(MTTR_h)} h`}
            hint={`${formatNumber(downtimeHoras)} h paro`}
          />
          <KpiCard
            title="Disponibilidad (mant.)"
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
        </section>

        {/* KPIs PRODUCCIÓN */}
        <section className="kpi-grid" style={{ marginBottom: "1rem" }}>
          <KpiCard
            title="MTBF (prod.)"
            value={`${formatNumber(MTBF_prod_h)} h`}
            hint={`${fallasProd} turnos con averías`}
          />
          <KpiCard
            title="MTTR (prod.)"
            value={`${formatNumber(MTTR_prod_h)} h`}
            hint={`${formatNumber(downtimeProdMin / 60)} h paro`}
          />
          <KpiCard
            title="Disponibilidad (prod.)"
            value={`${formatNumber(dispProd * 100)} %`}
            hint={`${formatNumber(horasTrabajadasProd)} h trabajadas`}
          />
          <KpiCard
            title="Eficiencia (kg prod / plan)"
            value={`${formatNumber(perfProd * 100)} %`}
            hint={`${formatNumber(totalKgProd)} / ${formatNumber(totalKgPlan)} kg`}
          />
          <KpiCard
            title="OEE (prod.)"
            value={`${formatNumber(OEE_prod * 100)} %`}
            hint={`Disp·Perf·Calidad`}
          />
          <KpiCard
            title="Calidad (kg buenos)"
            value={
              totalKgProd > 0
                ? `${formatNumber(
                    ((totalKgProd - totalKgReproceso - totalKgDecomiso) /
                      totalKgProd) *
                      100
                  )} %`
                : "- %"
            }
            hint={`Reproc: ${formatNumber(
              totalKgReproceso
            )} kg · Decom: ${formatNumber(totalKgDecomiso)} kg`}
          />
        </section>

        {/* KPIs POR SUPERVISOR */}
        <section className="card" style={{ marginBottom: "1.5rem" }}>
          <h2 style={{ fontSize: "0.9rem", marginBottom: "0.5rem" }}>
            KPIs por Supervisor (Producción)
          </h2>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Supervisor</th>
                  <th>Eficiencia (%)</th>
                  <th>OEE (%)</th>
                </tr>
              </thead>
              <tbody>
                {kpisSupervisores.map((k) => (
                  <tr key={k.supervisor}>
                    <td>{k.supervisor}</td>
                    <td>{formatNumber(k.eficiencia)}</td>
                    <td>{formatNumber(k.oee)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* PATRONES FRECUENTES (Flynn) */}
        <section className="card" style={{ marginBottom: "1.5rem" }}>
          <h2 style={{ fontSize: "0.9rem", marginBottom: "0.5rem" }}>
            Patrones frecuentes (Flynn)
          </h2>
          <div
            style={{
              display: "grid",
              gap: "0.75rem",
              gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
            }}
          >
            {resumenPatrones.map((r) => (
              <div
                key={r.id}
                style={{
                  borderRadius: "0.9rem",
                  border: "1px solid #e5e7eb",
                  padding: "0.5rem 0.6rem",
                  fontSize: "0.8rem",
                }}
              >
                <div style={{ color: "#6b7280" }}>{r.label}</div>
                <div
                  style={{
                    fontSize: "1.1rem",
                    fontWeight: 600,
                    lineHeight: 1,
                    marginTop: 4,
                  }}
                >
                  {r.conteo} eventos
                </div>
                <div style={{ fontSize: "0.75rem", color: "#6b7280" }}>
                  {formatNumber(r.minutos)} min
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* OTs CORRECTIVAS */}
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
                          <option key={t} value={t}>
                            {turnoLabel(t)}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input
                        type="text"
                        value={o.equipo || ""}
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
                          <option key={c} value={c}>
                            {c}
                          </option>
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

        {/* PREVENTIVOS */}
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
                        value={o.equipo || ""}
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
          <div
            style={{
              marginTop: "0.5rem",
              fontSize: "0.8rem",
              color: "#374151",
            }}
          >
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

        {/* PRODUCCIÓN — CARGA + IMPORT CSV */}
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
              Producción — Carga (base para OEE)
            </h2>
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
              <button className="btn btn-primary" onClick={addProduccion}>
                + Agregar turno
              </button>
              <button
                className="btn"
                onClick={() => csvInputRef.current && csvInputRef.current.click()}
              >
                Importar producción CSV
              </button>
              <input
                ref={csvInputRef}
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
                  <th>% cump plan</th>
                  <th>Kg reproceso</th>
                  <th>Kg decomiso</th>
                  <th>Tiempo parada averías (min)</th>
                  <th>Supervisor</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {state.produccion.length === 0 && (
                  <tr>
                    <td colSpan={12} style={{ padding: "0.75rem", color: "#6b7280" }}>
                      Sin datos de producción aún. Cargá manualmente o importá un CSV desde el
                      sistema de planta.
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
                          <option key={t} value={t}>
                            {turnoLabel(t)}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <select
                        value={r.sector}
                        onChange={(e) => {
                          const nuevoSector = e.target.value;
                          setState((s) => ({
                            ...s,
                            produccion: s.produccion.map((x) =>
                              x.id === r.id
                                ? {
                                    ...x,
                                    sector: nuevoSector,
                                    linea: LINEAS_POR_SECTOR[nuevoSector]?.includes(
                                      x.linea
                                    )
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
                        value={r.linea}
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
                              x.id === r.id
                                ? { ...x, kgPlan: Number(e.target.value) }
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
                        value={r.kgProd ?? 0}
                        onChange={(e) =>
                          setState((s) => ({
                            ...s,
                            produccion: s.produccion.map((x) =>
                              x.id === r.id
                                ? { ...x, kgProd: Number(e.target.value) }
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
                        value={r.cumpPlan ?? 0}
                        onChange={(e) =>
                          setState((s) => ({
                            ...s,
                            produccion: s.produccion.map((x) =>
                              x.id === r.id
                                ? { ...x, cumpPlan: Number(e.target.value) }
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
                        value={r.kgReproceso ?? 0}
                        onChange={(e) =>
                          setState((s) => ({
                            ...s,
                            produccion: s.produccion.map((x) =>
                              x.id === r.id
                                ? { ...x, kgReproceso: Number(e.target.value) }
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
                        value={r.kgDecomiso ?? 0}
                        onChange={(e) =>
                          setState((s) => ({
                            ...s,
                            produccion: s.produccion.map((x) =>
                              x.id === r.id
                                ? { ...x, kgDecomiso: Number(e.target.value) }
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
                        value={r.tiempoParadaMin ?? 0}
                        onChange={(e) =>
                          setState((s) => ({
                            ...s,
                            produccion: s.produccion.map((x) =>
                              x.id === r.id
                                ? { ...x, tiempoParadaMin: Number(e.target.value) }
                                : x
                            ),
                          }))
                        }
                      />
                    </td>
                    <td>
                      <select
                        value={r.supervisor}
                        onChange={(e) =>
                          setState((s) => ({
                            ...s,
                            produccion: s.produccion.map((x) =>
                              x.id === r.id
                                ? { ...x, supervisor: e.target.value }
                                : x
                            ),
                          }))
                        }
                      >
                        {SUPERVISORES.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
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

        {/* DATOS ECONÓMICOS */}
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
              Datos Económicos Mensuales (USD)
            </h2>
            <button className="btn btn-primary" onClick={addEconomia}>
              + Agregar registro
            </button>
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Periodo (mes)</th>
                  <th>Sector</th>
                  <th>Gasto mant. USD</th>
                  <th>Costo energía USD</th>
                  <th>Ton producidas sector</th>
                  <th>Mant. USD/ton</th>
                  <th>Energía USD/ton</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {economiaCalculada.length === 0 && (
                  <tr>
                    <td colSpan={8} style={{ padding: "0.75rem", color: "#6b7280" }}>
                      Sin registros económicos aún. Cargá un registro por mes y sector.
                    </td>
                  </tr>
                )}
                {economiaCalculada.map((e) => (
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
                      <select
                        value={e.sector}
                        onChange={(ev) =>
                          setState((s) => ({
                            ...s,
                            economia: s.economia.map((x) =>
                              x.id === e.id ? { ...x, sector: ev.target.value } : x
                            ),
                          }))
                        }
                      >
                        {SECTORES.map((sec) => (
                          <option key={sec} value={sec}>
                            {sec}
                          </option>
                        ))}
                      </select>
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
                    <td>{formatNumber(e.toneladasSector, 3)}</td>
                    <td>{formatNumber(e.mantPorTon, 2)}</td>
                    <td>{formatNumber(e.enerPorTon, 2)}</td>
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

        {/* NOTAS */}
        <section className="card" style={{ marginBottom: "2rem" }}>
          <h2
            style={{
              fontSize: "0.95rem",
              fontWeight: 500,
              marginBottom: "0.5rem",
            }}
          >
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
          Tablero local (localStorage). Siguiente etapa: Firestore/Firebase para multiusuario.
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
