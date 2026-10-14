import {
  useState,
  useEffect,
  useCallback,
  useRef,
  type FormEvent,
} from 'react'

import './index.css'
import Clientes from './pages/Clientes'
import Productos from './pages/Productos'
import Inventario from './pages/Inventario'
import Ventas from './pages/Ventas'
import Pagos from './pages/Pagos'
import Analytics from './pages/Analytics'
import Reportes from './pages/Reportes'

type Usuario = {
  id: number
  nombre: string
  correo: string
  rol_id: number
  estado: boolean
}

type DashboardData = {
  total_clientes: number
  total_productos: number
  productos_activos: number
  unidades_stock: number
  valor_inventario: number
  productos_stock_bajo: number
  productos_sin_stock: number
}

type ClienteResumen = {
  id: number
  nombre: string
}

type VentaResumen = {
  id: number
  cliente_id?: number | null
  cliente?: ClienteResumen | string | null
  total: number | string
  estado?: string
  created_at?: string
}

const API_URL = 'http://127.0.0.1:8000/api'
const EVENTO_DATOS_ACTUALIZADOS = 'salesia:datos-actualizados'

const menuItems = [
  { name: 'Dashboard', icon: '▦' },
  { name: 'Clientes', icon: '♙' },
  { name: 'Productos', icon: '◈' },
  { name: 'Inventario', icon: '▤' },
  { name: 'Ventas', icon: '↗' },
  { name: 'Pagos', icon: '＄' },
  { name: 'Analytics', icon: '⌁' },
  { name: 'Reportes', icon: '▧' },
]

function obtenerRol(rolId: number) {
  const roles: Record<number, string> = {
    1: 'Administrador',
    2: 'Vendedor',
    3: 'Analista',
  }

  return roles[rolId] ?? 'Usuario'
}

function obtenerIniciales(nombre: string) {
  return nombre
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((parte) => parte[0]?.toUpperCase() ?? '')
    .join('')
}

function formatoMoneda(valor: number | string) {
  const numero = Number(valor)

  if (!Number.isFinite(numero)) {
    return 'S/ 0.00'
  }

  return new Intl.NumberFormat('es-PE', {
    style: 'currency',
    currency: 'PEN',
  }).format(numero)
}

function formatoFecha(fecha?: string) {
  if (!fecha) return 'Fecha no disponible'

  const fechaConvertida = new Date(fecha)

  if (Number.isNaN(fechaConvertida.getTime())) {
    return 'Fecha no disponible'
  }

  return new Intl.DateTimeFormat('es-PE', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(fechaConvertida)
}

function obtenerUsuarioGuardado(): Usuario | null {
  try {
    const guardado = localStorage.getItem('salesia_usuario')

    if (!guardado) return null

    const usuario = JSON.parse(guardado) as Usuario

    if (
      typeof usuario.id !== 'number' ||
      !Number.isFinite(usuario.id) ||
      typeof usuario.nombre !== 'string' ||
      typeof usuario.correo !== 'string' ||
      typeof usuario.rol_id !== 'number' ||
      !Number.isFinite(usuario.rol_id)
    ) {
      localStorage.removeItem('salesia_usuario')
      return null
    }

    return usuario
  } catch {
    localStorage.removeItem('salesia_usuario')
    return null
  }
}

function normalizarLista<T>(datos: unknown): T[] {
  if (Array.isArray(datos)) {
    return datos as T[]
  }

  if (datos && typeof datos === 'object') {
    const objeto = datos as Record<string, unknown>

    if (Array.isArray(objeto.items)) return objeto.items as T[]
    if (Array.isArray(objeto.data)) return objeto.data as T[]
    if (Array.isArray(objeto.ventas)) return objeto.ventas as T[]
    if (Array.isArray(objeto.clientes)) return objeto.clientes as T[]
  }

  return []
}

function esVentaValida(venta: VentaResumen): boolean {
  const total = Number(venta.total)
  const id = Number(venta.id)

  return (
    Number.isFinite(total) &&
    total >= 0 &&
    Number.isFinite(id) &&
    id > 0
  )
}

function App() {
  const [usuario, setUsuario] = useState<Usuario | null>(
    obtenerUsuarioGuardado,
  )

  const [correo, setCorreo] = useState('')
  const [password, setPassword] = useState('')
  const [mostrarPassword, setMostrarPassword] = useState(false)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState('')
  const [active, setActive] = useState('Dashboard')

  const [dashboard, setDashboard] = useState<DashboardData | null>(null)
  const [cargandoDashboard, setCargandoDashboard] = useState(false)
  const [errorDashboard, setErrorDashboard] = useState('')

  const [ventas, setVentas] = useState<VentaResumen[]>([])
  const [clientes, setClientes] = useState<ClienteResumen[]>([])
  const [errorVentas, setErrorVentas] = useState('')
  const [cargandoVentas, setCargandoVentas] = useState(false)

  const consultaEnCurso = useRef(false)
  const consultaVentasEnCurso = useRef(false)
  const montado = useRef(false)

  const cargarDashboard = useCallback(async () => {
    if (consultaEnCurso.current) return

    consultaEnCurso.current = true
    setCargandoDashboard(true)
    setErrorDashboard('')

    try {
      const respuesta = await fetch(`${API_URL}/dashboard`, {
        headers: { Accept: 'application/json' },
        cache: 'no-store',
      })

      if (!respuesta.ok) {
        throw new Error('No se pudieron obtener los datos del Dashboard.')
      }

      const datos: DashboardData = await respuesta.json()

      if (montado.current) {
        setDashboard(datos)
      }
    } catch {
      if (montado.current) {
        setErrorDashboard(
          'No se pudieron obtener los indicadores. Comprueba que el backend esté funcionando.',
        )
      }
    } finally {
      consultaEnCurso.current = false

      if (montado.current) {
        setCargandoDashboard(false)
      }
    }
  }, [])

  const cargarActividadComercial = useCallback(async () => {
    if (consultaVentasEnCurso.current) return

    consultaVentasEnCurso.current = true
    setCargandoVentas(true)
    setErrorVentas('')

    try {
      const [respuestaVentas, respuestaClientes] = await Promise.all([
        fetch(`${API_URL}/ventas`, {
          headers: { Accept: 'application/json' },
          cache: 'no-store',
        }),
        fetch(`${API_URL}/clientes`, {
          headers: { Accept: 'application/json' },
          cache: 'no-store',
        }),
      ])

      if (!respuestaVentas.ok) {
        throw new Error('No se pudieron consultar las ventas.')
      }

      const datosVentas: unknown = await respuestaVentas.json()
      const listaVentas = normalizarLista<VentaResumen>(datosVentas)
      const ventasValidas = listaVentas.filter(esVentaValida)

      let listaClientes: ClienteResumen[] = []

      if (respuestaClientes.ok) {
        const datosClientes: unknown = await respuestaClientes.json()

        listaClientes = normalizarLista<ClienteResumen>(
          datosClientes,
        ).filter(
          (cliente) =>
            Number.isFinite(Number(cliente.id)) &&
            typeof cliente.nombre === 'string',
        )
      }

      if (montado.current) {
        setVentas(ventasValidas)
        setClientes(listaClientes)
      }
    } catch {
      if (montado.current) {
        setErrorVentas(
          'No se pudo cargar la actividad de ventas. Comprueba que el backend esté funcionando.',
        )
      }
    } finally {
      consultaVentasEnCurso.current = false

      if (montado.current) {
        setCargandoVentas(false)
      }
    }
  }, [])

  useEffect(() => {
    montado.current = true

    return () => {
      montado.current = false
    }
  }, [])

  useEffect(() => {
    if (!usuario) return

    void cargarDashboard()
    void cargarActividadComercial()

    const intervalo = window.setInterval(() => {
      void cargarDashboard()
      void cargarActividadComercial()
    }, 15000)

    const actualizarDatos = () => {
      void cargarDashboard()
      void cargarActividadComercial()
    }

    const actualizarAlVolver = () => {
      if (document.visibilityState === 'visible') {
        actualizarDatos()
      }
    }

    window.addEventListener(
      EVENTO_DATOS_ACTUALIZADOS,
      actualizarDatos,
    )
    window.addEventListener('focus', actualizarDatos)
    document.addEventListener('visibilitychange', actualizarAlVolver)

    return () => {
      window.clearInterval(intervalo)
      window.removeEventListener(
        EVENTO_DATOS_ACTUALIZADOS,
        actualizarDatos,
      )
      window.removeEventListener('focus', actualizarDatos)
      document.removeEventListener(
        'visibilitychange',
        actualizarAlVolver,
      )
    }
  }, [usuario, cargarDashboard, cargarActividadComercial])

  async function iniciarSesion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setCargando(true)

    try {
      const respuesta = await fetch(`${API_URL}/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          correo: correo.trim(),
          password,
        }),
      })

      const datos = await respuesta.json()

      if (!respuesta.ok) {
        setError(
          respuesta.status === 401
            ? 'El correo o la contraseña son incorrectos.'
            : typeof datos.detail === 'string'
              ? datos.detail
              : 'No se pudo iniciar sesión.',
        )
        return
      }

      const usuarioAutenticado = datos.usuario as Usuario

      if (
        !usuarioAutenticado ||
        typeof usuarioAutenticado.id !== 'number' ||
        typeof usuarioAutenticado.nombre !== 'string' ||
        typeof usuarioAutenticado.correo !== 'string' ||
        typeof usuarioAutenticado.rol_id !== 'number'
      ) {
        setError(
          'El servidor respondió, pero los datos del usuario no tienen el formato esperado.',
        )
        return
      }

      localStorage.setItem(
        'salesia_usuario',
        JSON.stringify(usuarioAutenticado),
      )

      setUsuario(usuarioAutenticado)
      setPassword('')
      setActive('Dashboard')
      setDashboard(null)
      setVentas([])
      setClientes([])
      setErrorDashboard('')
      setErrorVentas('')
    } catch {
      setError(
        'No se pudo conectar con el servidor. Comprueba que FastAPI esté ejecutándose.',
      )
    } finally {
      setCargando(false)
    }
  }

  function cerrarSesion() {
    localStorage.removeItem('salesia_usuario')

    setUsuario(null)
    setCorreo('')
    setPassword('')
    setError('')
    setDashboard(null)
    setVentas([])
    setClientes([])
    setErrorDashboard('')
    setErrorVentas('')
    setActive('Dashboard')
  }

  if (!usuario) {
    return (
      <div className="login-page">
        <section className="login-card">
          <div className="login-brand">
            <div className="brand-logo">S</div>
            <div>
              <h1>SalesIA</h1>
              <span>ENTERPRISE</span>
            </div>
          </div>

          <div className="login-heading">
            <p className="eyebrow">SISTEMA DE GESTIÓN EMPRESARIAL</p>
            <h2>Bienvenido de nuevo</h2>
            <p>Ingresa tus credenciales para acceder a tu cuenta.</p>
          </div>

          <form className="login-form" onSubmit={iniciarSesion}>
            <label htmlFor="correo">Correo electrónico</label>
            <input
              id="correo"
              type="email"
              autoComplete="username"
              placeholder="tu@empresa.com"
              value={correo}
              onChange={(event) => setCorreo(event.target.value)}
              required
            />

            <label htmlFor="password">Contraseña</label>
            <div className="password-field">
              <input
                id="password"
                type={mostrarPassword ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder="Ingresa tu contraseña"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
              <button
                type="button"
                className="password-toggle"
                onClick={() => setMostrarPassword(!mostrarPassword)}
                aria-label={
                  mostrarPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'
                }
              >
                {mostrarPassword ? 'Ocultar' : 'Mostrar'}
              </button>
            </div>

            {error && (
              <div className="login-error" role="alert">
                {error}
              </div>
            )}

            <button
              type="submit"
              className="login-submit"
              disabled={cargando}
            >
              {cargando ? 'Verificando...' : 'Iniciar sesión →'}
            </button>
          </form>

          <div className="login-footer">
            <span>© 2026 SalesIA Enterprise</span>
            <span>Acceso al sistema ERP</span>
          </div>
        </section>
      </div>
    )
  }

  const rol = obtenerRol(usuario.rol_id)
  const iniciales = obtenerIniciales(usuario.nombre)

  const productosDisponibles = dashboard
    ? Math.max(
        0,
        dashboard.productos_activos -
          dashboard.productos_stock_bajo -
          dashboard.productos_sin_stock,
      )
    : 0

  const totalProductosEstado = dashboard
    ? productosDisponibles +
      dashboard.productos_stock_bajo +
      dashboard.productos_sin_stock
    : 0

  const porcentajeStockNormal =
    totalProductosEstado > 0
      ? (productosDisponibles / totalProductosEstado) * 100
      : 0

  const porcentajeStockBajo =
    totalProductosEstado > 0 && dashboard
      ? (dashboard.productos_stock_bajo / totalProductosEstado) * 100
      : 0

  const ventasRecientes = [...ventas]
    .sort((a, b) => {
      const fechaA = a.created_at ? new Date(a.created_at).getTime() : 0
      const fechaB = b.created_at ? new Date(b.created_at).getTime() : 0

      const fechaValidaA = Number.isNaN(fechaA) ? 0 : fechaA
      const fechaValidaB = Number.isNaN(fechaB) ? 0 : fechaB

      return fechaValidaB - fechaValidaA
    })
    .slice(0, 5)

  function nombreClienteVenta(venta: VentaResumen) {
    if (
      venta.cliente &&
      typeof venta.cliente === 'object' &&
      'nombre' in venta.cliente &&
      typeof venta.cliente.nombre === 'string'
    ) {
      return venta.cliente.nombre
    }

    if (typeof venta.cliente === 'string') {
      return venta.cliente
    }

    const cliente = clientes.find(
      (item) => Number(item.id) === Number(venta.cliente_id),
    )

    return (
      cliente?.nombre ??
      (venta.cliente_id
        ? `Cliente #${venta.cliente_id}`
        : 'Cliente no identificado')
    )
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-logo">S</div>
          <div>
            <h2>SalesIA</h2>
            <span>ENTERPRISE</span>
          </div>
        </div>

        <div className="menu-label">MENÚ PRINCIPAL</div>

        <nav className="menu">
          {menuItems.map((item) => (
            <button
              key={item.name}
              className={`menu-item ${active === item.name ? 'active' : ''}`}
              onClick={() => setActive(item.name)}
            >
              <span className="menu-icon">{item.icon}</span>
              <span>{item.name}</span>
              {item.name === 'Analytics' && (
                <span className="ai-badge">IA</span>
              )}
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="help-card">
            <div className="help-icon">✦</div>
            <strong>Analytics inteligente</strong>
            <p>Convierte tus datos en mejores decisiones.</p>
            <button onClick={() => setActive('Analytics')}>
              Explorar Analytics →
            </button>
          </div>

          <div className="user-profile">
            <div className="avatar">{iniciales}</div>
            <div className="user-info">
              <strong>{usuario.nombre}</strong>
              <span>{usuario.correo}</span>
            </div>
            <button
              className="user-dots"
              onClick={cerrarSesion}
              title="Cerrar sesión"
              aria-label="Cerrar sesión"
            >
              ↪
            </button>
          </div>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="breadcrumb">
            SalesIA <span>/</span> {active}
          </div>

          <div className="topbar-actions">
            <span className="system-status">
              <i /> Sistema operativo
            </span>
            <button
              className="notification-button"
              aria-label="Actualizar información"
              onClick={() => {
                void cargarDashboard()
                void cargarActividadComercial()
              }}
              title="Actualizar información"
            >
              ♧
            </button>
            <div className="avatar small-avatar">{iniciales}</div>
          </div>
        </header>

        <section className="page-content">
          {active === 'Clientes' ? (
            <Clientes />
          ) : active === 'Productos' ? (
            <Productos />
          ) : active === 'Inventario' ? (
            <Inventario />
          ) : active === 'Ventas' ? (
            <Ventas />
          ) : active === 'Pagos' ? (
            <Pagos />
          ) : active === 'Analytics' ? (
            <Analytics />
          ) : active === 'Reportes' ? (
            <Reportes />
          ) : active === 'Dashboard' ? (
            <>
              {/* ENCABEZADO AZUL DEL DASHBOARD */}
              <div className="dashboard-hero">
                <div className="dashboard-hero-contenido">
                  <div className="dashboard-migas">
                    <span>Gestión empresarial</span>
                    <span>/</span>
                    <strong>Dashboard</strong>
                  </div>

                  <h1>Dashboard</h1>

                  <p>
                    Bienvenido, {usuario.nombre}. Consulta los indicadores y el
                    rendimiento de tu negocio desde un solo lugar.
                  </p>
                </div>

                <button
                  type="button"
                  className="dashboard-boton-nueva-venta"
                  onClick={() => setActive('Ventas')}
                >
                  <span>＋</span>
                  Nueva venta
                </button>
              </div>

              <div className="date-strip">
                <span>▦</span>
                Resumen general
              </div>

              {errorDashboard && (
                <div className="login-error" role="alert">
                  {errorDashboard}
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => void cargarDashboard()}
                  >
                    Reintentar
                  </button>
                </div>
              )}

              <div className="stats-grid">
                <article className="stat-card">
                  <div className="stat-top">
                    <span>Clientes registrados</span>
                    <div className="stat-icon purple">♙</div>
                  </div>
                  <h2>
                    {dashboard
                      ? dashboard.total_clientes
                      : cargandoDashboard
                        ? '...'
                        : '—'}
                  </h2>
                  <p className="stat-foot">
                    <span>Clientes en tu cartera</span>
                  </p>
                  <div className="mini-bars purple-bars">
                    <i /><i /><i /><i />
                    <i /><i /><i /><i />
                  </div>
                </article>

                <article className="stat-card">
                  <div className="stat-top">
                    <span>Productos activos</span>
                    <div className="stat-icon orange">◈</div>
                  </div>
                  <h2>
                    {dashboard
                      ? dashboard.productos_activos
                      : cargandoDashboard
                        ? '...'
                        : '—'}
                  </h2>
                  <p className="stat-foot">
                    <span>
                      Total de productos: {dashboard?.total_productos ?? '—'}
                    </span>
                  </p>
                  <div className="mini-bars orange-bars">
                    <i /><i /><i /><i />
                    <i /><i /><i /><i />
                  </div>
                </article>

                <article className="stat-card">
                  <div className="stat-top">
                    <span>Unidades en inventario</span>
                    <div className="stat-icon blue">▤</div>
                  </div>
                  <h2>
                    {dashboard
                      ? dashboard.unidades_stock
                      : cargandoDashboard
                        ? '...'
                        : '—'}
                  </h2>
                  <p className="stat-foot">
                    <span>Unidades disponibles registradas</span>
                  </p>
                  <div className="mini-bars">
                    <i /><i /><i /><i />
                    <i /><i /><i /><i />
                  </div>
                </article>

                <article className="stat-card">
                  <div className="stat-top">
                    <span>Valor del inventario</span>
                    <div className="stat-icon green">＄</div>
                  </div>
                  <h2>
                    {dashboard
                      ? formatoMoneda(dashboard.valor_inventario)
                      : cargandoDashboard
                        ? '...'
                        : '—'}
                  </h2>
                  <p className="stat-foot">
                    <span>Según precio y stock</span>
                  </p>
                  <div className="mini-bars green-bars">
                    <i /><i /><i /><i />
                    <i /><i /><i /><i />
                  </div>
                </article>
              </div>

              <div className="dashboard-grid dashboard-charts-grid">
                <section className="panel chart-panel">
                  <div className="panel-heading">
                    <div>
                      <h3>Estado del inventario</h3>
                      <p>
                        Distribución de productos según su disponibilidad
                      </p>
                    </div>
                    <span className="chart-tag">INVENTARIO</span>
                  </div>

                  {!dashboard ? (
                    <div className="chart-empty">
                      {cargandoDashboard
                        ? 'Cargando información del inventario...'
                        : 'No hay datos disponibles para mostrar.'}
                    </div>
                  ) : (
                    <div className="inventory-chart-layout">
                      <div
                        className="inventory-donut"
                        role="img"
                        aria-label={`Stock normal: ${productosDisponibles}, stock bajo: ${dashboard.productos_stock_bajo}, sin stock: ${dashboard.productos_sin_stock}`}
                        style={{
                          background:
                            totalProductosEstado === 0
                              ? '#e9eef5'
                              : `conic-gradient(
                                  #10b981 0% ${porcentajeStockNormal}%,
                                  #f59e0b ${porcentajeStockNormal}% ${
                                    porcentajeStockNormal +
                                    porcentajeStockBajo
                                  }%,
                                  #ef4444 ${
                                    porcentajeStockNormal +
                                    porcentajeStockBajo
                                  }% 100%
                                )`,
                        }}
                      >
                        <div className="inventory-donut-center">
                          <strong>{totalProductosEstado}</strong>
                          <span>Productos</span>
                        </div>
                      </div>

                      <div className="inventory-legend">
                        <div className="legend-item">
                          <span className="legend-dot dot-green" />
                          <div>
                            <strong>Stock normal</strong>
                            <span>Más de 5 unidades</span>
                          </div>
                          <b>{productosDisponibles}</b>
                        </div>

                        <div className="legend-item">
                          <span className="legend-dot dot-orange" />
                          <div>
                            <strong>Stock bajo</strong>
                            <span>Entre 1 y 5 unidades</span>
                          </div>
                          <b>{dashboard.productos_stock_bajo}</b>
                        </div>

                        <div className="legend-item">
                          <span className="legend-dot dot-red" />
                          <div>
                            <strong>Sin stock</strong>
                            <span>Necesitan reposición</span>
                          </div>
                          <b>{dashboard.productos_sin_stock}</b>
                        </div>
                      </div>
                    </div>
                  )}

                  {dashboard && (
                    <div className="chart-note">
                      <span>ⓘ</span>
                      La distribución se calcula con los indicadores recibidos
                      del backend.
                    </div>
                  )}
                </section>

                <section className="panel chart-panel">
                  <div className="panel-heading">
                    <div>
                      <h3>Resumen de la base de datos</h3>
                      <p>Indicadores principales de SalesIA</p>
                    </div>
                    <span className="chart-tag">RESUMEN</span>
                  </div>

                  {!dashboard ? (
                    <div className="chart-empty">
                      {cargandoDashboard
                        ? 'Consultando indicadores...'
                        : 'No hay indicadores disponibles.'}
                    </div>
                  ) : (
                    <div className="database-chart">
                      <div className="database-metric">
                        <div className="database-metric-heading">
                          <span className="database-icon purple">♙</span>
                          <span>Clientes registrados</span>
                          <strong>{dashboard.total_clientes}</strong>
                        </div>
                        <div className="database-track">
                          <div
                            className="database-fill fill-purple"
                            style={{
                              width:
                                dashboard.total_clientes > 0 ? '100%' : '0%',
                            }}
                          />
                        </div>
                      </div>

                      <div className="database-metric">
                        <div className="database-metric-heading">
                          <span className="database-icon blue">◈</span>
                          <span>Productos registrados</span>
                          <strong>{dashboard.total_productos}</strong>
                        </div>
                        <div className="database-track">
                          <div
                            className="database-fill fill-blue"
                            style={{
                              width:
                                dashboard.total_productos > 0 ? '100%' : '0%',
                            }}
                          />
                        </div>
                      </div>

                      <div className="database-value-card">
                        <div className="database-value-icon">S/</div>
                        <div>
                          <span>Valor estimado del inventario</span>
                          <strong>
                            {formatoMoneda(dashboard.valor_inventario)}
                          </strong>
                          <p>Valor calculado por el backend</p>
                        </div>
                      </div>

                      <div className="database-footer">
                        <span className="database-status-dot" />
                        Indicadores recibidos del Dashboard
                      </div>
                    </div>
                  )}
                </section>
              </div>

              <section className="panel recent-sales-panel">
                <div className="panel-heading">
                  <div>
                    <h3>Últimas ventas</h3>
                    <p>
                      Consulta las operaciones comerciales más recientes
                    </p>
                  </div>
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => setActive('Ventas')}
                  >
                    Ver todas →
                  </button>
                </div>

                {errorVentas ? (
                  <div className="chart-empty" role="alert">
                    {errorVentas}
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => void cargarActividadComercial()}
                    >
                      Reintentar
                    </button>
                  </div>
                ) : cargandoVentas && ventasRecientes.length === 0 ? (
                  <div className="chart-empty">
                    Cargando las últimas ventas...
                  </div>
                ) : ventasRecientes.length === 0 ? (
                  <div className="chart-empty">
                    Todavía no hay ventas registradas para mostrar.
                  </div>
                ) : (
                  <div className="recent-sales-list">
                    {ventasRecientes.map((venta) => (
                      <div className="recent-sale-row" key={venta.id}>
                        <div className="recent-sale-icon">↗</div>
                        <div className="recent-sale-info">
                          <strong>{nombreClienteVenta(venta)}</strong>
                          <span>
                            Venta #{venta.id} · {formatoFecha(venta.created_at)}
                          </span>
                        </div>
                        <div className="recent-sale-total">
                          <strong>{formatoMoneda(venta.total)}</strong>
                          <span>{venta.estado ?? 'Registrada'}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <section className="insight-banner">
                <div className="insight-symbol">✦</div>
                <div>
                  <strong>Potencia tus decisiones con Analytics</strong>
                  <p>
                    Analiza tus datos comerciales y explora los indicadores
                    estadísticos de SalesIA Enterprise.
                  </p>
                </div>
                <button onClick={() => setActive('Analytics')}>
                  Ir a Analytics <span>→</span>
                </button>
              </section>

              <footer className="page-footer">
                <span>© 2026 SalesIA Enterprise</span>
                <span>ERP · Gestión empresarial inteligente</span>
              </footer>
            </>
          ) : (
            <div className="welcome-row">
              <div>
                <p className="eyebrow">
                  PANEL DE CONTROL · {rol.toUpperCase()}
                </p>
                <h1>{active}</h1>
                <p className="subtitle">
                  El módulo de {active.toLowerCase()} estará disponible
                  cuando implementemos sus funciones.
                </p>
              </div>
              <button
                className="primary-button"
                onClick={() => setActive('Dashboard')}
              >
                Volver al dashboard
              </button>
            </div>
          )}
        </section>
      </main>
    </div>
  )
}

export default App