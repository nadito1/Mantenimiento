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

// Catálogos Georgalos (ejemplo)
const LINEAS = ["Flynn", "CV-1000", "Delver", "Tabletas", "Bombones", "Servicios (Caldera/Frío)"];
const TURNOS = ["A", "B", "C"];
const AREAS = ["Estuchadora", "Balanza", "Mesas de refrigeración", "Cocción", "Empaque", "Servicios"];
const TIPOS_PARADA = ["No planificada", "Planificada", "Falta de insumos"];
const CRITICIDAD = ["A", "B", "C"];

// Helpers de fecha
const toDate = (s) => new Date(s);
const inRange = (d, desde, hasta) =>
  d >= new Date(desde + "T00:00") && d <= new Date(hasta + "T23:59:59");

// Componente principal
function App() {
  const [state, setState] = useState(() => {
    const saved = localStorage.getItem("kpi-mantenimiento-georgalos-v2");
    if (saved) {
      try {
        return JSON.parse(saved);
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
      paradas: [],
      ots: [],
    };
  });

  // Persistencia
  useEffect(() => {
    localStorage.setItem("kpi-mantenimiento-georgalos-v2", JSON.stringify(state));
  }, [state]);

  // Filtros por período
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

  // Filtros por línea/turno
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

  // Subconjuntos por tipo
  const otsCorrFiltradas = useMemo(
    () => otsFiltradas.filter((o) => o.tipo === "Correctivo"),
    [otsFiltradas]
  );
  const otsPrevFiltradas = useMemo(
    () => otsFiltradas.filter((o) => o.tipo === "Preventivo"),
    [otsFiltradas]
  );

  // KPIs
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

  const ratioCostoVentas = useMemo(() => {
    const v = Number(state.ventasARS) || 0;
    const c = Number(state.costoMantenimientoARS) || 0;
    return v > 0 ? c / v : 0;
  }, [state.ventasARS, state.costoMantenimientoARS]);

  // Patrones Flynn
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

  // Manejo formularios
  const addParada = () => {
    setState((s) => ({
      ...s,
      paradas: [
        ...s.paradas,
        {
          id: crypto.randomUUID(),
          fecha: new Date().toISOString().slice(0, 16),
          linea: "Flynn",
          turno: "A",
          area: "Empaque",
          equipo: "",
          motivo: "",
          tipoParada: "No planificada",
          criticidad: "B",
          codigoFalla: "",
          causaRaiz: "",
          repuestos: "",
          costoARS: 0,
          downtimeMin: 0,
        },
      ],
    }));
  };

  const addOTCorrectiva = () => {
    setState((s) => ({
      ...s,
      ots: [
        ...s.ots,
        {
          id: crypto.randomUUID(),
          fecha: new Date().toISOString().slice(0, 10),
          linea: "Flynn",
          turno: "A",
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
          linea: "Flynn",
          turno: "A",
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

  const fileInputRef = useRef(null);

  const onImport = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result));
        setState(data);
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

  // Notas
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
              MTBF, MTTR, Disponibilidad, % Preventivo/Correctivo, Cumplimiento, Backlog, Costo/Ventas
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

        {/* Filtros */}
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
                      {t}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="card">
            <h2 style={{ fontSize: "0.9rem", marginBottom: "0.5rem" }}>Economía</h2>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "0.5rem",
                fontSize: "0.75rem",
              }}
            >
              <div>
                <div style={{ color: "#6b7280", marginBottom: "0.1rem" }}>Ventas ARS</div>
                <input
                  type="number"
                  min={0}
                  value={state.ventasARS}
                  onChange={(e) =>
                    setState((s) => ({ ...s, ventasARS: Number(e.target.value) }))
                  }
                />
              </div>
              <div>
                <div style={{ color: "#6b7280", marginBottom: "0.1rem" }}>
                  Costo mant. ARS
                </div>
                <input
                  type="number"
                  min={0}
                  value={state.costoMantenimientoARS}
                  onChange={(e) =>
                    setState((s) => ({
                      ...s,
                      costoMantenimientoARS: Number(e.target.value),
                    }))
                  }
                />
              </div>
              <div style={{ gridColumn: "1 / -1", fontSize: "0.8rem", color: "#4b5563" }}>
                Ratio Costo/Ventas:{" "}
                <span style={{ fontWeight: 600 }}>
                  {formatNumber(ratioCostoVentas, 3)}
                </span>
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

        {/* KPIs */}
        <section className="kpi-grid" style={{ marginBottom: "1rem" }}>
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
        </section>

        {/* Patrones */}
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
                  style={{ fontSize: "1.1rem", fontWeight: 600, lineHeight: 1, marginTop: 4 }}
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

        {/* CUADRO 1: Paradas */}
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
            <h2 style={{ fontSize: "0.95rem", fontWeight: 500 }}>Eventos de Parada</h2>
            <button className="btn btn-primary" onClick={addParada}>
              + Agregar
            </button>
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Fecha y hora</th>
                  <th>Línea</th>
                  <th>Turno</th>
                  <th>Área</th>
                  <th>Equipo</th>
                  <th>Tipo</th>
                  <th>Motivo</th>
                  <th>Crit.</th>
                  <th>Downtime (min)</th>
                  <th>Costo ARS</th>
                  <th>Código falla</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {paradasFiltradas.length === 0 && (
                  <tr>
                    <td colSpan={12} style={{ padding: "0.75rem", color: "#6b7280" }}>
                      Sin paradas en el filtro actual.
                    </td>
                  </tr>
                )}
                {paradasFiltradas.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <input
                        type="datetime-local"
                        value={p.fecha}
                        onChange={(e) =>
                          setState((s) => ({
                            ...s,
                            paradas: s.paradas.map((x) =>
                              x.id === p.id ? { ...x, fecha: e.target.value } : x
                            ),
                          }))
                        }
                      />
                    </td>
                    <td>
                      <select
                        value={p.linea}
                        onChange={(e) =>
                          setState((s) => ({
                            ...s,
                            paradas: s.paradas.map((x) =>
                              x.id === p.id ? { ...x, linea: e.target.value } : x
                            ),
                          }))
                        }
                      >
                        {LINEAS.map((l) => (
                          <option key={l}>{l}</option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <select
                        value={p.turno}
                        onChange={(e) =>
                          setState((s) => ({
                            ...s,
                            paradas: s.paradas.map((x) =>
                              x.id === p.id ? { ...x, turno: e.target.value } : x
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
                        value={p.area}
                        onChange={(e) =>
                          setState((s) => ({
                            ...s,
                            paradas: s.paradas.map((x) =>
                              x.id === p.id ? { ...x, area: e.target.value } : x
                            ),
                          }))
                        }
                      >
                        {AREAS.map((a) => (
                          <option key={a}>{a}</option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input
                        type="text"
                        value={p.equipo}
                        onChange={(e) =>
                          setState((s) => ({
                            ...s,
                            paradas: s.paradas.map((x) =>
                              x.id === p.id ? { ...x, equipo: e.target.value } : x
                            ),
                          }))
                        }
                      />
                    </td>
                    <td>
                      <select
                        value={p.tipoParada}
                        onChange={(e) =>
                          setState((s) => ({
                            ...s,
                            paradas: s.paradas.map((x) =>
                              x.id === p.id ? { ...x, tipoParada: e.target.value } : x
                            ),
                          }))
                        }
                      >
                        {TIPOS_PARADA.map((t) => (
                          <option key={t}>{t}</option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input
                        type="text"
                        value={p.motivo}
                        onChange={(e) =>
                          setState((s) => ({
                            ...s,
                            paradas: s.paradas.map((x) =>
                              x.id === p.id ? { ...x, motivo: e.target.value } : x
                            ),
                          }))
                        }
                      />
                    </td>
                    <td>
                      <select
                        value={p.criticidad}
                        onChange={(e) =>
                          setState((s) => ({
                            ...s,
                            paradas: s.paradas.map((x) =>
                              x.id === p.id ? { ...x, criticidad: e.target.value } : x
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
                        value={p.downtimeMin}
                        onChange={(e) =>
                          setState((s) => ({
                            ...s,
                            paradas: s.paradas.map((x) =>
                              x.id === p.id
                                ? { ...x, downtimeMin: Number(e.target.value) }
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
                        value={p.costoARS ?? 0}
                        onChange={(e) =>
                          setState((s) => ({
                            ...s,
                            paradas: s.paradas.map((x) =>
                              x.id === p.id
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
                        value={p.codigoFalla || ""}
                        onChange={(e) =>
                          setState((s) => ({
                            ...s,
                            paradas: s.paradas.map((x) =>
                              x.id === p.id
                                ? { ...x, codigoFalla: e.target.value }
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
                            paradas: s.paradas.filter((x) => x.id !== p.id),
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
            Downtime total: {formatNumber(downtimeTotalMin)} min —{" "}
            {formatNumber(downtimeHoras)} h.
          </div>
        </section>

        {/* CUADRO 2: OTs Correctivas */}
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
                          <option key={l}>{l}</option>
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

        {/* CUADRO 3: Preventivos */}
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
                          <option key={l}>{l}</option>
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
