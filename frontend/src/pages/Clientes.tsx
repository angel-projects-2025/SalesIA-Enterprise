
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import '../App.css'

interface Cliente {
  id: number
  nombre: string
  documento: string | null
  correo: string | null
  telefono: string | null
  direccion: string | null
}

interface Venta {
  id: number
  cliente_id: number
  total: number | string
  estado?: string | null
}

interface ClienteRanking extends Cliente {
  cantidadCompras: number
  totalGastado: number
}

const API = 'https://salesia-enterprise-api.vercel.app/api/clientes'
const API_VENTAS = 'https://salesia-enterprise-api.vercel.app/api/ventas'
const POR_PAGINA = 5

const formularioVacio = {
  nombre: '',
  documento: '',
  correo: '',
  telefono: '',
  direccion: '',
}

function obtenerIniciales(nombre: string) {
  return nombre
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((parte) => parte[0]?.toUpperCase() ?? '')
    .join('')
}

function formatoSoles(monto: number) {
  return monto.toLocaleString('es-PE', {
    style: 'currency',
    currency: 'PEN',
  })
}

function ventaValida(venta: Venta) {
  const estado = String(venta.estado ?? '').trim().toLowerCase()

  // Excluye ventas anuladas o canceladas cuando el backend
  // devuelve alguno de estos estados.
  return !['anulada', 'anulado', 'cancelada', 'cancelado'].includes(estado)
}

export default function Clientes() {
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [ventas, setVentas] = useState<Venta[]>([])
  const [busqueda, setBusqueda] = useState('')
  const [cargando, setCargando] = useState(true)
  const [cargandoVentas, setCargandoVentas] = useState(true)
  const [error, setError] = useState('')
  const [errorVentas, setErrorVentas] = useState('')
  const [modalAbierto, setModalAbierto] = useState(false)
  const [clienteEditar, setClienteEditar] = useState<Cliente | null>(null)
  const [formulario, setFormulario] = useState(formularioVacio)
  const [guardando, setGuardando] = useState(false)
  const [eliminandoId, setEliminandoId] = useState<number | null>(null)
  const [mensaje, setMensaje] = useState('')
  const [pagina, setPagina] = useState(1)

  const cargarClientes = useCallback(async () => {
    setCargando(true)
    setError('')

    try {
      const respuesta = await fetch(
        `${API}?q=${encodeURIComponent(busqueda)}`,
      )

      if (!respuesta.ok) {
        throw new Error('No se pudo obtener la lista de clientes.')
      }

      const datos: Cliente[] = await respuesta.json()
      setClientes(datos)
    } catch (errorCapturado) {
      setError(
        errorCapturado instanceof Error
          ? errorCapturado.message
          : 'No se pudo conectar con el servidor.',
      )
    } finally {
      setCargando(false)
    }
  }, [busqueda])

  const cargarVentas = useCallback(async () => {
    setCargandoVentas(true)
    setErrorVentas('')

    try {
      const respuesta = await fetch(API_VENTAS)

      if (!respuesta.ok) {
        throw new Error('No se pudieron obtener las ventas.')
      }

      const datos: unknown = await respuesta.json()

      // Admite una respuesta como arreglo directo o un objeto
      // que contenga la lista dentro de la propiedad "items".
      const lista = Array.isArray(datos)
        ? datos
        : datos &&
            typeof datos === 'object' &&
            'items' in datos &&
            Array.isArray(datos.items)
          ? datos.items
          : null

      if (!lista) {
        throw new Error('El formato de respuesta de ventas no es vÃ¡lido.')
      }

      setVentas(lista as Venta[])
    } catch (errorCapturado) {
      setVentas([])
      setErrorVentas(
        errorCapturado instanceof Error
          ? errorCapturado.message
          : 'No se pudieron cargar los datos de compras.',
      )
    } finally {
      setCargandoVentas(false)
    }
  }, [])

  const recargarDatos = useCallback(async () => {
    await Promise.all([cargarClientes(), cargarVentas()])
  }, [cargarClientes, cargarVentas])

  useEffect(() => {
    void recargarDatos()
  }, [recargarDatos])

  useEffect(() => {
    setPagina(1)
  }, [busqueda])

  useEffect(() => {
    const actualizar = () => {
      void recargarDatos()
    }

    window.addEventListener('salesia:datos-actualizados', actualizar)

    return () => {
      window.removeEventListener('salesia:datos-actualizados', actualizar)
    }
  }, [recargarDatos])

  const rankingClientes = useMemo<ClienteRanking[]>(() => {
    const acumulado = new Map<
      number,
      { cantidadCompras: number; totalGastado: number }
    >()

    for (const venta of ventas) {
      if (!ventaValida(venta)) continue

      const clienteId = Number(venta.cliente_id)
      const importe = Number(venta.total)

      if (
        !Number.isFinite(clienteId) ||
        !Number.isFinite(importe) ||
        clienteId <= 0
      ) {
        continue
      }

      const anterior = acumulado.get(clienteId) ?? {
        cantidadCompras: 0,
        totalGastado: 0,
      }

      acumulado.set(clienteId, {
        cantidadCompras: anterior.cantidadCompras + 1,
        totalGastado: anterior.totalGastado + importe,
      })
    }

    return clientes
      .map((cliente) => {
        const compras = acumulado.get(cliente.id)

        return {
          ...cliente,
          cantidadCompras: compras?.cantidadCompras ?? 0,
          totalGastado: compras?.totalGastado ?? 0,
        }
      })
      .filter((cliente) => cliente.cantidadCompras > 0)
      .sort(
        (a, b) =>
          b.totalGastado - a.totalGastado ||
          b.cantidadCompras - a.cantidadCompras,
      )
      .slice(0, 5)
  }, [clientes, ventas])

  const maximoGastado = Math.max(
    ...rankingClientes.map((cliente) => cliente.totalGastado),
    1,
  )

  const totalGastadoTodos = rankingClientes.reduce(
    (total, cliente) => total + cliente.totalGastado,
    0,
  )

  const clientesConCompras = useMemo(() => {
    const ids = new Set(
      ventas
        .filter(ventaValida)
        .map((venta) => Number(venta.cliente_id)),
    )

    return clientes.filter((cliente) => ids.has(cliente.id)).length
  }, [clientes, ventas])

  const totalPaginas = Math.max(1, Math.ceil(clientes.length / POR_PAGINA))
  const paginaActual = Math.min(pagina, totalPaginas)

  const clientesPagina = clientes.slice(
    (paginaActual - 1) * POR_PAGINA,
    paginaActual * POR_PAGINA,
  )

  function abrirNuevoCliente() {
    setClienteEditar(null)
    setFormulario(formularioVacio)
    setMensaje('')
    setError('')
    setModalAbierto(true)
  }

  function abrirEdicion(cliente: Cliente) {
    setClienteEditar(cliente)
    setFormulario({
      nombre: cliente.nombre,
      documento: cliente.documento ?? '',
      correo: cliente.correo ?? '',
      telefono: cliente.telefono ?? '',
      direccion: cliente.direccion ?? '',
    })
    setMensaje('')
    setError('')
    setModalAbierto(true)
  }

  async function guardarCliente(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    setGuardando(true)
    setError('')
    setMensaje('')

    const datos = {
      nombre: formulario.nombre.trim(),
      documento: formulario.documento.trim() || null,
      correo: formulario.correo.trim() || null,
      telefono: formulario.telefono.trim() || null,
      direccion: formulario.direccion.trim() || null,
    }

    try {
      const respuesta = await fetch(
        clienteEditar ? `${API}/${clienteEditar.id}` : API,
        {
          method: clienteEditar ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(datos),
        },
      )

      const resultado = await respuesta.json().catch(() => ({}))

      if (!respuesta.ok) {
        throw new Error(
          typeof resultado.detail === 'string'
            ? resultado.detail
            : 'No se pudo guardar el cliente.',
        )
      }

      setModalAbierto(false)
      setMensaje(
        clienteEditar
          ? 'Cliente actualizado correctamente.'
          : 'Cliente registrado correctamente.',
      )

      await cargarClientes()

      window.dispatchEvent(new Event('salesia:datos-actualizados'))
    } catch (errorCapturado) {
      setError(
        errorCapturado instanceof Error
          ? errorCapturado.message
          : 'OcurriÃ³ un error al guardar.',
      )
    } finally {
      setGuardando(false)
    }
  }

  async function eliminarCliente(cliente: Cliente) {
    const confirmar = window.confirm(
      `Â¿EstÃ¡s seguro de eliminar al cliente "${cliente.nombre}"?`,
    )

    if (!confirmar) return

    setError('')
    setMensaje('')
    setEliminandoId(cliente.id)

    try {
      const respuesta = await fetch(`${API}/${cliente.id}`, {
        method: 'DELETE',
      })

      const resultado = await respuesta.json().catch(() => ({}))

      if (!respuesta.ok) {
        throw new Error(
          typeof resultado.detail === 'string'
            ? resultado.detail
            : 'No se pudo eliminar el cliente.',
        )
      }

      setMensaje('Cliente eliminado correctamente.')

      await recargarDatos()

      window.dispatchEvent(new Event('salesia:datos-actualizados'))
    } catch (errorCapturado) {
      setError(
        errorCapturado instanceof Error
          ? errorCapturado.message
          : 'OcurriÃ³ un error al eliminar.',
      )
    } finally {
      setEliminandoId(null)
    }
  }

  return (
    <section className="clientes-page">
      <div className="clientes-hero">
        <div className="clientes-hero-texto">
          <div className="clientes-migas">
            <span>GestiÃ³n comercial</span>
            <span className="clientes-migas-separador">/</span>
            <strong>Clientes</strong>
          </div>

          <div className="clientes-titulo-fila">
            <div className="clientes-titulo-icono">
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
                <circle
                  cx="10"
                  cy="7"
                  r="4"
                  stroke="currentColor"
                  strokeWidth="1.8"
                />
                <path
                  d="M20 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
              </svg>
            </div>

            <div>
              <h1>Clientes</h1>
              <p>
                Administra tu cartera y conoce a los clientes que mÃ¡s compran.
              </p>
            </div>
          </div>
        </div>

        <button
          type="button"
          className="clientes-boton-principal clientes-boton-nuevo"
          onClick={abrirNuevoCliente}
        >
          <span className="clientes-plus">ï¼‹</span>
          Nuevo cliente
        </button>
      </div>

      <div className="clientes-indicadores">
        <article className="clientes-indicador-card">
          <div className="clientes-indicador-icono clientes-icono-azul">
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
              <circle
                cx="10"
                cy="7"
                r="4"
                stroke="currentColor"
                strokeWidth="1.8"
              />
              <path
                d="M20 21v-2a4 4 0 0 0-3-3.87"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
          </div>

          <div className="clientes-indicador-contenido">
            <span>Total de clientes</span>
            <strong>{cargando && clientes.length === 0 ? 'â€”' : clientes.length}</strong>
            <small>
              <span className="clientes-punto-verde" />
              Registros encontrados
            </small>
          </div>

          <div className="clientes-indicador-decoracion">01</div>
        </article>

        <article className="clientes-indicador-card">
          <div className="clientes-indicador-icono clientes-icono-celeste">
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <rect
                x="3"
                y="5"
                width="18"
                height="15"
                rx="3"
                stroke="currentColor"
                strokeWidth="1.8"
              />
              <circle
                cx="9"
                cy="11"
                r="2"
                stroke="currentColor"
                strokeWidth="1.8"
              />
              <path
                d="M5.5 17a3.5 3.5 0 0 1 7 0M15 10h3M15 14h3"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
          </div>

          <div className="clientes-indicador-contenido">
            <span>Datos de contacto</span>
            <strong>
              {clientes.filter((cliente) => cliente.correo || cliente.telefono).length}
            </strong>
            <small>Con correo o telÃ©fono registrado</small>
          </div>

          <div className="clientes-indicador-decoracion">02</div>
        </article>

        <article className="clientes-indicador-card">
          <div className="clientes-indicador-icono clientes-icono-verde">
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M12 21s7-5.5 7-12a7 7 0 1 0-14 0c0 6.5 7 12 7 12Z"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinejoin="round"
              />
              <circle
                cx="12"
                cy="9"
                r="2.5"
                stroke="currentColor"
                strokeWidth="1.8"
              />
            </svg>
          </div>

          <div className="clientes-indicador-contenido">
            <span>Clientes con compras</span>
            <strong>
              {cargandoVentas ? 'â€”' : clientesConCompras}
            </strong>
            <small>Con ventas registradas</small>
          </div>

          <div className="clientes-indicador-decoracion">03</div>
        </article>
      </div>

      <section className="clientes-ranking">
        <div className="clientes-ranking-encabezado">
          <div>
            <span className="clientes-ranking-etiqueta">
              ANÃLISIS COMERCIAL
            </span>
            <h2>Clientes que mÃ¡s compran</h2>
            <p>
              Los cinco clientes con mayor monto acumulado de compras.
            </p>
          </div>
          <span className="clientes-ranking-badge">TOP 5</span>
        </div>

        {errorVentas && (
          <div className="clientes-alerta error" role="alert">
            <span>!</span>
            {errorVentas}
            <button
              type="button"
              onClick={() => void cargarVentas()}
              aria-label="Reintentar cargar ventas"
            >
              Reintentar
            </button>
          </div>
        )}

        {cargandoVentas ? (
          <div className="clientes-ranking-vacio">
            <span className="clientes-spinner" />
            Calculando compras de los clientes...
          </div>
        ) : !errorVentas && rankingClientes.length === 0 ? (
          <div className="clientes-ranking-vacio">
            TodavÃ­a no hay ventas asociadas a los clientes. Cuando registres
            ventas, aquÃ­ aparecerÃ¡n los cinco clientes que mÃ¡s compran.
          </div>
        ) : !errorVentas ? (
          <div className="clientes-ranking-grid">
            <article className="clientes-ranking-lista">
              <h3>Mejores clientes</h3>

              {rankingClientes.map((cliente, indice) => (
                <div className="clientes-ranking-item" key={cliente.id}>
                  <div className="clientes-ranking-posicion">
                    {indice + 1}
                  </div>

                  <div className="clientes-ranking-avatar">
                    {obtenerIniciales(cliente.nombre)}
                  </div>

                  <div className="clientes-ranking-datos">
                    <strong>{cliente.nombre}</strong>
                    <span>
                      {cliente.cantidadCompras}{' '}
                      {cliente.cantidadCompras === 1 ? 'compra' : 'compras'}
                    </span>
                  </div>

                  <strong className="clientes-ranking-monto">
                    {formatoSoles(cliente.totalGastado)}
                  </strong>
                </div>
              ))}
            </article>

            <article className="clientes-ranking-grafico">
              <h3>ComparaciÃ³n de compras</h3>
              <p>Importe total acumulado por cliente</p>

              <div className="clientes-barras">
                {rankingClientes.map((cliente, indice) => (
                  <div className="clientes-barra-item" key={cliente.id}>
                    <div className="clientes-barra-texto">
                      <span>{cliente.nombre}</span>
                      <strong>{formatoSoles(cliente.totalGastado)}</strong>
                    </div>

                    <div className="clientes-barra-fondo">
                      <div
                        className={`clientes-barra-valor ${
                          indice === 0 ? 'clientes-barra-principal' : ''
                        }`}
                        style={{
                          width: `${
                            (cliente.totalGastado / maximoGastado) * 100
                          }%`,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div className="clientes-ranking-resumen">
                <span>Monto acumulado del Top 5</span>
                <strong>{formatoSoles(totalGastadoTodos)}</strong>
              </div>
            </article>
          </div>
        ) : null}
      </section>

      <div className="clientes-tabla-card">
        <div className="clientes-tabla-encabezado">
          <div className="clientes-tabla-titulo">
            <div className="clientes-subtitulo-icono">
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
                <circle
                  cx="10"
                  cy="7"
                  r="4"
                  stroke="currentColor"
                  strokeWidth="1.8"
                />
                <path
                  d="M20 21v-2a4 4 0 0 0-3-3.87"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
              </svg>
            </div>

            <div>
              <h2>Directorio de clientes</h2>
              <p>Consulta, registra y actualiza tus contactos.</p>
            </div>
          </div>

          <div className="clientes-tabla-herramientas">
            <label className="clientes-busqueda">
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle
                  cx="10.8"
                  cy="10.8"
                  r="6.8"
                  stroke="currentColor"
                  strokeWidth="1.8"
                />
                <path
                  d="m16 16 4 4"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
              </svg>

              <input
                type="search"
                aria-label="Buscar clientes"
                placeholder="Buscar cliente..."
                value={busqueda}
                onChange={(evento) => setBusqueda(evento.target.value)}
              />

              {busqueda && (
                <button
                  type="button"
                  className="clientes-limpiar-busqueda"
                  onClick={() => setBusqueda('')}
                  aria-label="Limpiar bÃºsqueda"
                >
                  Ã—
                </button>
              )}
            </label>

            <button
              type="button"
              className="clientes-boton-recargar"
              onClick={() => void recargarDatos()}
              disabled={cargando || cargandoVentas}
              title="Actualizar directorio y ventas"
              aria-label="Actualizar directorio y ventas"
            >
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M20 7v5h-5M4 17v-5h5"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M5.5 9a7 7 0 0 1 11.7-2L20 12M4 12l2.8 5a7 7 0 0 0 11.7-2"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </div>
        </div>

        {mensaje && (
          <div className="clientes-alerta exito" role="status">
            <span>âœ“</span>
            {mensaje}
            <button
              type="button"
              onClick={() => setMensaje('')}
              aria-label="Cerrar mensaje"
            >
              Ã—
            </button>
          </div>
        )}

        {error && (
          <div className="clientes-alerta error" role="alert">
            <span>!</span>
            {error}
            <button
              type="button"
              onClick={() => setError('')}
              aria-label="Cerrar mensaje"
            >
              Ã—
            </button>
          </div>
        )}

        <div className="clientes-tabla-contenedor">
          <table className="clientes-tabla">
            <thead>
              <tr>
                <th>CLIENTE</th>
                <th>DOCUMENTO</th>
                <th>CORREO ELECTRÃ“NICO</th>
                <th>TELÃ‰FONO</th>
                <th>DIRECCIÃ“N</th>
                <th className="clientes-columna-acciones">ACCIONES</th>
              </tr>
            </thead>

            <tbody>
              {cargando ? (
                <tr>
                  <td colSpan={6} className="clientes-vacio">
                    <div className="clientes-cargando">
                      <span className="clientes-spinner" />
                      <span>Actualizando directorio de clientes...</span>
                    </div>
                  </td>
                </tr>
              ) : clientes.length === 0 ? (
                <tr>
                  <td colSpan={6} className="clientes-vacio">
                    <div className="clientes-vacio-icono">
                      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <circle
                          cx="10"
                          cy="8"
                          r="4"
                          stroke="currentColor"
                          strokeWidth="1.7"
                        />
                        <path
                          d="M3 21v-2a7 7 0 0 1 14 0v2M19 8v6M22 11h-6"
                          stroke="currentColor"
                          strokeWidth="1.7"
                          strokeLinecap="round"
                        />
                      </svg>
                    </div>

                    <strong>No hay clientes para mostrar</strong>
                    <p>
                      {busqueda
                        ? 'Prueba con otro nombre, documento o correo.'
                        : 'Registra tu primer cliente para comenzar.'}
                    </p>

                    {!busqueda && (
                      <button
                        type="button"
                        className="clientes-boton-principal"
                        onClick={abrirNuevoCliente}
                      >
                        ï¼‹ Registrar cliente
                      </button>
                    )}
                  </td>
                </tr>
              ) : (
                clientesPagina.map((cliente) => (
                  <tr key={cliente.id}>
                    <td>
                      <div className="clientes-identidad">
                        <div className="clientes-avatar">
                          {obtenerIniciales(cliente.nombre)}
                        </div>

                        <div className="clientes-identidad-texto">
                          <strong>{cliente.nombre}</strong>
                          <span>
                            Cliente #{String(cliente.id).padStart(4, '0')}
                          </span>
                        </div>
                      </div>
                    </td>

                    <td>
                      <span className="clientes-documento">
                        {cliente.documento || 'â€”'}
                      </span>
                    </td>

                    <td>
                      {cliente.correo ? (
                        <a
                          className="clientes-dato-enlace"
                          href={`mailto:${cliente.correo}`}
                        >
                          {cliente.correo}
                        </a>
                      ) : (
                        <span className="clientes-sin-dato">Sin correo</span>
                      )}
                    </td>

                    <td>
                      {cliente.telefono ? (
                        <a
                          className="clientes-dato-enlace"
                          href={`tel:${cliente.telefono}`}
                        >
                          {cliente.telefono}
                        </a>
                      ) : (
                        <span className="clientes-sin-dato">Sin telÃ©fono</span>
                      )}
                    </td>

                    <td>
                      <span className="clientes-direccion">
                        {cliente.direccion || 'No registrada'}
                      </span>
                    </td>

                    <td>
                      <div className="clientes-acciones">
                        <button
                          type="button"
                          className="clientes-accion-editar"
                          title="Editar cliente"
                          aria-label={`Editar ${cliente.nombre}`}
                          onClick={() => abrirEdicion(cliente)}
                        >
                          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                            <path
                              d="m14 5 5 5M4 20l4.2-.8L19 8.4a2.1 2.1 0 0 0-3-3L5.2 16.2 4 20Z"
                              stroke="currentColor"
                              strokeWidth="1.7"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        </button>

                        <button
                          type="button"
                          className="clientes-accion-eliminar"
                          title="Eliminar cliente"
                          aria-label={`Eliminar ${cliente.nombre}`}
                          disabled={eliminandoId === cliente.id}
                          onClick={() => void eliminarCliente(cliente)}
                        >
                          {eliminandoId === cliente.id ? (
                            <span className="clientes-spinner clientes-spinner-pequeno" />
                          ) : (
                            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                              <path
                                d="M4 7h16M10 11v6M14 11v6M5 7l1 13h12l1-13M9 7V4h6v3"
                                stroke="currentColor"
                                strokeWidth="1.7"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="clientes-pie-tabla">
          <span>
            {cargando
              ? 'Consultando registros...'
              : clientes.length === 0
                ? 'No hay registros'
                : `Mostrando ${(paginaActual - 1) * POR_PAGINA + 1}â€“${Math.min(
                    paginaActual * POR_PAGINA,
                    clientes.length,
                  )} de ${clientes.length} clientes`}
          </span>

          <div className="clientes-paginacion">
            <button
              type="button"
              className="clientes-pagina-boton"
              onClick={() => setPagina((actual) => Math.max(1, actual - 1))}
              disabled={paginaActual === 1 || cargando}
              aria-label="PÃ¡gina anterior"
            >
              â€¹
            </button>

            <span>
              PÃ¡gina {paginaActual} de {totalPaginas}
            </span>

            <button
              type="button"
              className="clientes-pagina-boton"
              onClick={() =>
                setPagina((actual) => Math.min(totalPaginas, actual + 1))
              }
              disabled={paginaActual >= totalPaginas || cargando}
              aria-label="PÃ¡gina siguiente"
            >
              â€º
            </button>
          </div>

          <span className="clientes-pie-estado">
            <span className="clientes-punto-verde" />
            InformaciÃ³n del directorio
          </span>
        </div>
      </div>

      <div className="clientes-pie-pagina">
        <span>SalesIA Enterprise</span>
        <span>GestiÃ³n comercial Â· Directorio de clientes</span>
      </div>

      {modalAbierto && (
        <div
          className="clientes-modal-fondo"
          onMouseDown={(evento) => {
            if (evento.target === evento.currentTarget && !guardando) {
              setModalAbierto(false)
            }
          }}
        >
          <div
            className="clientes-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="clientes-modal-titulo"
          >
            <div className="clientes-modal-encabezado">
              <div className="clientes-modal-icono">
                {clienteEditar ? (
                  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path
                      d="m14 5 5 5M4 20l4.2-.8L19 8.4a2.1 2.1 0 0 0-3-3L5.2 16.2 4 20Z"
                      stroke="currentColor"
                      strokeWidth="1.7"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <circle
                      cx="10"
                      cy="8"
                      r="4"
                      stroke="currentColor"
                      strokeWidth="1.7"
                    />
                    <path
                      d="M3 21v-2a7 7 0 0 1 14 0v2M19 8v6M22 11h-6"
                      stroke="currentColor"
                      strokeWidth="1.7"
                      strokeLinecap="round"
                    />
                  </svg>
                )}
              </div>

              <div className="clientes-modal-titulo">
                <span className="clientes-etiqueta">GESTIÃ“N DE CONTACTOS</span>

                <h2 id="clientes-modal-titulo">
                  {clienteEditar ? 'Editar cliente' : 'Nuevo cliente'}
                </h2>

                <p>
                  {clienteEditar
                    ? 'Actualiza la informaciÃ³n de este contacto.'
                    : 'Completa los datos para registrar un nuevo contacto.'}
                </p>
              </div>

              <button
                type="button"
                className="clientes-modal-cerrar"
                onClick={() => setModalAbierto(false)}
                disabled={guardando}
                aria-label="Cerrar formulario"
              >
                Ã—
              </button>
            </div>

            <form onSubmit={guardarCliente}>
              <div className="clientes-form-seccion">
                <span className="clientes-form-seccion-numero">01</span>
                <div>
                  <strong>InformaciÃ³n personal</strong>
                  <p>IdentificaciÃ³n del cliente</p>
                </div>
              </div>

              <div className="clientes-form-grid">
                <label className="clientes-campo campo-completo">
                  <span>
                    Nombre completo <b>*</b>
                  </span>

                  <input
                    required
                    maxLength={150}
                    value={formulario.nombre}
                    onChange={(evento) =>
                      setFormulario({
                        ...formulario,
                        nombre: evento.target.value,
                      })
                    }
                    placeholder="Ej. Juan PÃ©rez"
                    autoFocus
                  />
                </label>

                <label className="clientes-campo">
                  <span>Documento de identidad</span>

                  <input
                    maxLength={30}
                    value={formulario.documento}
                    onChange={(evento) =>
                      setFormulario({
                        ...formulario,
                        documento: evento.target.value,
                      })
                    }
                    placeholder="DNI o RUC"
                  />
                </label>
              </div>

              <div className="clientes-form-seccion clientes-form-seccion-contacto">
                <span className="clientes-form-seccion-numero">02</span>
                <div>
                  <strong>InformaciÃ³n de contacto</strong>
                  <p>Medios de comunicaciÃ³n y ubicaciÃ³n</p>
                </div>
              </div>

              <div className="clientes-form-grid">
                <label className="clientes-campo campo-completo">
                  <span>Correo electrÃ³nico</span>

                  <input
                    type="email"
                    maxLength={150}
                    value={formulario.correo}
                    onChange={(evento) =>
                      setFormulario({
                        ...formulario,
                        correo: evento.target.value,
                      })
                    }
                    placeholder="cliente@empresa.com"
                  />
                </label>

                <label className="clientes-campo">
                  <span>TelÃ©fono</span>

                  <input
                    type="tel"
                    maxLength={30}
                    value={formulario.telefono}
                    onChange={(evento) =>
                      setFormulario({
                        ...formulario,
                        telefono: evento.target.value,
                      })
                    }
                    placeholder="NÃºmero de contacto"
                  />
                </label>

                <label className="clientes-campo">
                  <span>DirecciÃ³n</span>

                  <input
                    maxLength={250}
                    value={formulario.direccion}
                    onChange={(evento) =>
                      setFormulario({
                        ...formulario,
                        direccion: evento.target.value,
                      })
                    }
                    placeholder="Distrito, ciudad o direcciÃ³n"
                  />
                </label>
              </div>

              {error && (
                <div className="clientes-alerta error" role="alert">
                  <span>!</span>
                  {error}
                </div>
              )}

              <div className="clientes-modal-pie">
                <span>
                  <b>*</b> Campos obligatorios
                </span>

                <div className="clientes-modal-acciones">
                  <button
                    type="button"
                    className="clientes-boton-secundario"
                    onClick={() => setModalAbierto(false)}
                    disabled={guardando}
                  >
                    Cancelar
                  </button>

                  <button
                    type="submit"
                    className="clientes-boton-principal"
                    disabled={guardando}
                  >
                    {guardando ? (
                      <>
                        <span className="clientes-spinner clientes-spinner-claro" />
                        Guardando...
                      </>
                    ) : (
                      <>
                        <span>âœ“</span>
                        {clienteEditar ? 'Guardar cambios' : 'Registrar cliente'}
                      </>
                    )}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  )
}
