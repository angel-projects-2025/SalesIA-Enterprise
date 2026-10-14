from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session, joinedload
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy import or_, func, text
from pwdlib import PasswordHash
from statistics import mean, median

import models
import schemas
from database import Base, engine, SessionLocal, verificar_conexion
from ia_ventas import generar_analisis_ventas
from prediccion_ventas import generar_prediccion_ventas


app = FastAPI(
    title="SalesIA Enterprise API",
    description="Backend del sistema ERP SalesIA Enterprise",
    version="1.0.0",
)

password_hash = PasswordHash.recommended()


# ==========================================
# CONFIGURACION CORS
# ==========================================

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        # Frontend local
        "http://localhost:5173",
        "http://localhost:5174",
        "http://localhost:5175",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:5174",
        "http://127.0.0.1:5175",

        # Frontend desplegado en Vercel
        "https://sales-ia-enterprise-kappa.vercel.app",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ==========================================
# CONEXION CON LA BASE DE DATOS
# ==========================================

def obtener_db():
    db = SessionLocal()

    try:
        yield db
    finally:
        db.close()


# ==========================================
# INICIALIZAR BASE DE DATOS
# ==========================================

@app.on_event("startup")
def inicializar_base_datos():
    Base.metadata.create_all(bind=engine)

    db = SessionLocal()

    try:
        roles_iniciales = [
            "Administrador",
            "Vendedor",
            "Analista",
        ]

        for nombre_rol in roles_iniciales:
            rol = (
                db.query(models.Rol)
                .filter(models.Rol.nombre == nombre_rol)
                .first()
            )

            if rol is None:
                db.add(models.Rol(nombre=nombre_rol))

        db.commit()

    finally:
        db.close()


# ==========================================
# RUTAS PRINCIPALES
# ==========================================

@app.get("/")
def inicio():
    return {
        "mensaje": "Bienvenido a SalesIA Enterprise API",
        "estado": "operativo",
    }


@app.get("/api/health")
def verificar_estado():
    return {
        "estado": "correcto",
        "backend": "FastAPI",
        "proyecto": "SalesIA Enterprise",
    }


@app.get("/api/db-check")
def verificar_base_datos():
    try:
        conectado = verificar_conexion()

        return {
            "estado": "correcto" if conectado else "error",
            "base_de_datos": "salesia_enterprise",
            "conectado": conectado,
        }

    except SQLAlchemyError:
        raise HTTPException(
            status_code=503,
            detail="No se pudo conectar con PostgreSQL.",
        )


@app.get("/api/tablas")
def listar_tablas():
    try:
        with engine.connect() as conexion:
            resultado = conexion.execute(
                text(
                    "SELECT tablename FROM pg_tables "
                    "WHERE schemaname = 'public' "
                    "ORDER BY tablename"
                )
            )

            tablas = [fila[0] for fila in resultado]

        return {
            "estado": "correcto",
            "cantidad": len(tablas),
            "tablas": tablas,
        }

    except SQLAlchemyError:
        raise HTTPException(
            status_code=503,
            detail="No se pudieron consultar las tablas.",
        )


# ==========================================
# ROLES
# ==========================================

@app.get(
    "/api/roles",
    response_model=list[schemas.RolRespuesta],
)
def listar_roles(db: Session = Depends(obtener_db)):
    return (
        db.query(models.Rol)
        .order_by(models.Rol.id)
        .all()
    )


# ==========================================
# USUARIOS
# ==========================================

@app.get(
    "/api/usuarios",
    response_model=list[schemas.UsuarioRespuesta],
)
def listar_usuarios(db: Session = Depends(obtener_db)):
    return (
        db.query(models.Usuario)
        .order_by(models.Usuario.id)
        .all()
    )


@app.post(
    "/api/usuarios",
    response_model=schemas.UsuarioRespuesta,
    status_code=201,
)
def crear_usuario(
    usuario: schemas.UsuarioCrear,
    db: Session = Depends(obtener_db),
):
    correo = str(usuario.correo).lower().strip()
    nombre = usuario.nombre.strip()

    if not nombre:
        raise HTTPException(
            status_code=400,
            detail="El nombre no puede estar vacio.",
        )

    existente = (
        db.query(models.Usuario)
        .filter(models.Usuario.correo == correo)
        .first()
    )

    if existente:
        raise HTTPException(
            status_code=409,
            detail="Ya existe un usuario con ese correo.",
        )

    rol = (
        db.query(models.Rol)
        .filter(models.Rol.id == usuario.rol_id)
        .first()
    )

    if rol is None:
        raise HTTPException(
            status_code=400,
            detail="El rol seleccionado no existe.",
        )

    nuevo_usuario = models.Usuario(
        nombre=nombre,
        correo=correo,
        password_hash=password_hash.hash(usuario.password),
        rol_id=usuario.rol_id,
        estado=True,
    )

    try:
        db.add(nuevo_usuario)
        db.commit()
        db.refresh(nuevo_usuario)

        return nuevo_usuario

    except SQLAlchemyError:
        db.rollback()

        raise HTTPException(
            status_code=500,
            detail="No se pudo registrar el usuario.",
        )


@app.post(
    "/api/login",
    response_model=schemas.LoginRespuesta,
)
def iniciar_sesion(
    datos: schemas.LoginSolicitud,
    db: Session = Depends(obtener_db),
):
    correo = str(datos.correo).lower().strip()

    usuario = (
        db.query(models.Usuario)
        .options(joinedload(models.Usuario.rol))
        .filter(models.Usuario.correo == correo)
        .first()
    )

    if usuario is None or not password_hash.verify(
        datos.password,
        usuario.password_hash,
    ):
        raise HTTPException(
            status_code=401,
            detail="Correo o contrasena incorrectos.",
        )

    if not usuario.estado:
        raise HTTPException(
            status_code=403,
            detail="La cuenta esta desactivada.",
        )

    return {
        "mensaje": "Inicio de sesion correcto.",
        "usuario": usuario,
    }


# ==========================================
# CLIENTES
# ==========================================

@app.get(
    "/api/clientes",
    response_model=list[schemas.ClienteRespuesta],
)
def listar_clientes(
    q: str | None = None,
    db: Session = Depends(obtener_db),
):
    consulta = db.query(models.Cliente)

    if q and q.strip():
        termino = f"%{q.strip()}%"

        consulta = consulta.filter(
            or_(
                models.Cliente.nombre.ilike(termino),
                models.Cliente.documento.ilike(termino),
                models.Cliente.correo.ilike(termino),
            )
        )

    return consulta.order_by(
        models.Cliente.id.desc()
    ).all()


@app.post(
    "/api/clientes",
    response_model=schemas.ClienteRespuesta,
    status_code=201,
)
def crear_cliente(
    datos: schemas.ClienteCrear,
    db: Session = Depends(obtener_db),
):
    nombre = datos.nombre.strip()

    if not nombre:
        raise HTTPException(
            status_code=400,
            detail="El nombre es obligatorio.",
        )

    documento = (
        datos.documento.strip()
        if datos.documento
        else None
    )

    correo = (
        str(datos.correo).lower().strip()
        if datos.correo
        else None
    )

    if documento:
        duplicado = (
            db.query(models.Cliente)
            .filter(models.Cliente.documento == documento)
            .first()
        )

        if duplicado:
            raise HTTPException(
                status_code=409,
                detail="Ya existe un cliente con ese documento.",
            )

    nuevo = models.Cliente(
        nombre=nombre,
        documento=documento,
        correo=correo,
        telefono=(
            datos.telefono.strip()
            if datos.telefono
            else None
        ),
        direccion=(
            datos.direccion.strip()
            if datos.direccion
            else None
        ),
    )

    try:
        db.add(nuevo)
        db.commit()
        db.refresh(nuevo)

        return nuevo

    except SQLAlchemyError:
        db.rollback()

        raise HTTPException(
            status_code=500,
            detail="No se pudo registrar el cliente.",
        )


@app.put(
    "/api/clientes/{cliente_id}",
    response_model=schemas.ClienteRespuesta,
)
def actualizar_cliente(
    cliente_id: int,
    datos: schemas.ClienteActualizar,
    db: Session = Depends(obtener_db),
):
    cliente = (
        db.query(models.Cliente)
        .filter(models.Cliente.id == cliente_id)
        .first()
    )

    if cliente is None:
        raise HTTPException(
            status_code=404,
            detail="Cliente no encontrado.",
        )

    cambios = datos.model_dump(exclude_unset=True)

    for campo, valor in cambios.items():
        if isinstance(valor, str):
            valor = valor.strip() or None

        if campo == "nombre" and not valor:
            raise HTTPException(
                status_code=400,
                detail="El nombre no puede estar vacio.",
            )

        if campo == "correo" and valor:
            valor = str(valor).lower()

        if campo == "documento" and valor:
            duplicado = (
                db.query(models.Cliente)
                .filter(
                    models.Cliente.documento == valor,
                    models.Cliente.id != cliente_id,
                )
                .first()
            )

            if duplicado:
                raise HTTPException(
                    status_code=409,
                    detail="Otro cliente ya tiene ese documento.",
                )

        setattr(cliente, campo, valor)

    try:
        db.commit()
        db.refresh(cliente)

        return cliente

    except SQLAlchemyError:
        db.rollback()

        raise HTTPException(
            status_code=500,
            detail="No se pudo actualizar el cliente.",
        )


@app.delete("/api/clientes/{cliente_id}")
def eliminar_cliente(
    cliente_id: int,
    db: Session = Depends(obtener_db),
):
    cliente = (
        db.query(models.Cliente)
        .filter(models.Cliente.id == cliente_id)
        .first()
    )

    if cliente is None:
        raise HTTPException(
            status_code=404,
            detail="Cliente no encontrado.",
        )

    try:
        db.delete(cliente)
        db.commit()

        return {
            "mensaje": "Cliente eliminado correctamente."
        }

    except SQLAlchemyError:
        db.rollback()

        raise HTTPException(
            status_code=500,
            detail="No se pudo eliminar el cliente.",
        )


# ==========================================
# CATEGORIAS
# ==========================================

@app.get(
    "/api/categorias",
    response_model=list[schemas.CategoriaRespuesta],
)
def listar_categorias(
    db: Session = Depends(obtener_db),
):
    return (
        db.query(models.Categoria)
        .order_by(models.Categoria.nombre)
        .all()
    )


@app.post(
    "/api/categorias",
    response_model=schemas.CategoriaRespuesta,
    status_code=201,
)
def crear_categoria(
    datos: schemas.CategoriaCrear,
    db: Session = Depends(obtener_db),
):
    nombre = datos.nombre.strip()

    if not nombre:
        raise HTTPException(
            status_code=400,
            detail="El nombre de la categoria es obligatorio.",
        )

    existente = (
        db.query(models.Categoria)
        .filter(models.Categoria.nombre.ilike(nombre))
        .first()
    )

    if existente:
        raise HTTPException(
            status_code=409,
            detail="Ya existe una categoria con ese nombre.",
        )

    nueva = models.Categoria(
        nombre=nombre,
        descripcion=(
            datos.descripcion.strip()
            if datos.descripcion
            else None
        ),
    )

    try:
        db.add(nueva)
        db.commit()
        db.refresh(nueva)

        return nueva

    except SQLAlchemyError:
        db.rollback()

        raise HTTPException(
            status_code=500,
            detail="No se pudo registrar la categoria.",
        )


# ==========================================
# PRODUCTOS
# ==========================================

@app.get(
    "/api/productos",
    response_model=list[schemas.ProductoRespuesta],
)
def listar_productos(
    q: str | None = None,
    categoria_id: int | None = None,
    db: Session = Depends(obtener_db),
):
    consulta = db.query(models.Producto)

    if q and q.strip():
        termino = f"%{q.strip()}%"

        consulta = consulta.filter(
            or_(
                models.Producto.nombre.ilike(termino),
                models.Producto.descripcion.ilike(termino),
            )
        )

    if categoria_id is not None:
        consulta = consulta.filter(
            models.Producto.categoria_id == categoria_id
        )

    return consulta.order_by(
        models.Producto.id.desc()
    ).all()


@app.post(
    "/api/productos",
    response_model=schemas.ProductoRespuesta,
    status_code=201,
)
def crear_producto(
    datos: schemas.ProductoCrear,
    db: Session = Depends(obtener_db),
):
    nombre = datos.nombre.strip()

    if not nombre:
        raise HTTPException(
            status_code=400,
            detail="El nombre del producto es obligatorio.",
        )

    if datos.categoria_id is not None:
        categoria = (
            db.query(models.Categoria)
            .filter(
                models.Categoria.id == datos.categoria_id
            )
            .first()
        )

        if categoria is None:
            raise HTTPException(
                status_code=400,
                detail="La categoria seleccionada no existe.",
            )

    nuevo = models.Producto(
        nombre=nombre,
        descripcion=(
            datos.descripcion.strip()
            if datos.descripcion
            else None
        ),
        precio=datos.precio,
        stock=datos.stock,
        categoria_id=datos.categoria_id,
        estado=datos.estado,
    )

    try:
        db.add(nuevo)
        db.commit()
        db.refresh(nuevo)

        return nuevo

    except SQLAlchemyError:
        db.rollback()

        raise HTTPException(
            status_code=500,
            detail="No se pudo registrar el producto.",
        )


@app.put(
    "/api/productos/{producto_id}",
    response_model=schemas.ProductoRespuesta,
)
def actualizar_producto(
    producto_id: int,
    datos: schemas.ProductoActualizar,
    db: Session = Depends(obtener_db),
):
    producto = (
        db.query(models.Producto)
        .filter(models.Producto.id == producto_id)
        .first()
    )

    if producto is None:
        raise HTTPException(
            status_code=404,
            detail="Producto no encontrado.",
        )

    cambios = datos.model_dump(exclude_unset=True)

    if "nombre" in cambios:
        nombre = cambios["nombre"]

        if nombre is None or not nombre.strip():
            raise HTTPException(
                status_code=400,
                detail="El nombre del producto es obligatorio.",
            )

        cambios["nombre"] = nombre.strip()

    if (
        "descripcion" in cambios
        and cambios["descripcion"] is not None
    ):
        cambios["descripcion"] = (
            cambios["descripcion"].strip() or None
        )

    if cambios.get("categoria_id") is not None:
        categoria = (
            db.query(models.Categoria)
            .filter(
                models.Categoria.id == cambios["categoria_id"]
            )
            .first()
        )

        if categoria is None:
            raise HTTPException(
                status_code=400,
                detail="La categoria seleccionada no existe.",
            )

    for campo, valor in cambios.items():
        setattr(producto, campo, valor)

    try:
        db.commit()
        db.refresh(producto)

        return producto

    except SQLAlchemyError:
        db.rollback()

        raise HTTPException(
            status_code=500,
            detail="No se pudo actualizar el producto.",
        )


@app.delete("/api/productos/{producto_id}")
def eliminar_producto(
    producto_id: int,
    db: Session = Depends(obtener_db),
):
    producto = (
        db.query(models.Producto)
        .filter(models.Producto.id == producto_id)
        .first()
    )

    if producto is None:
        raise HTTPException(
            status_code=404,
            detail="Producto no encontrado.",
        )

    try:
        db.delete(producto)
        db.commit()

        return {
            "mensaje": "Producto eliminado correctamente."
        }

    except SQLAlchemyError:
        db.rollback()

        raise HTTPException(
            status_code=409,
            detail=(
                "No se pudo eliminar el producto. "
                "Puede estar relacionado con otras operaciones."
            ),
        )


# ==========================================
# INVENTARIO: HISTORIAL DE MOVIMIENTOS
# ==========================================

@app.get(
    "/api/inventario/movimientos",
    response_model=list[schemas.InventarioMovimientoRespuesta],
)
def listar_movimientos_inventario(
    limite: int = 100,
    db: Session = Depends(obtener_db),
):
    if limite < 1 or limite > 500:
        raise HTTPException(
            status_code=400,
            detail="El limite debe estar entre 1 y 500.",
        )

    return (
        db.query(models.InventarioMovimiento)
        .order_by(
            models.InventarioMovimiento.created_at.desc(),
            models.InventarioMovimiento.id.desc(),
        )
        .limit(limite)
        .all()
    )


# ==========================================
# INVENTARIO: REGISTRAR ENTRADAS Y SALIDAS
# ==========================================

@app.post(
    "/api/inventario/movimientos",
    response_model=schemas.InventarioMovimientoRespuesta,
    status_code=201,
)
def registrar_movimiento_inventario(
    datos: schemas.InventarioMovimientoCrear,
    db: Session = Depends(obtener_db),
):
    try:
        producto = (
            db.query(models.Producto)
            .filter(
                models.Producto.id == datos.producto_id
            )
            .with_for_update()
            .first()
        )

        if producto is None:
            raise HTTPException(
                status_code=404,
                detail="El producto seleccionado no existe.",
            )

        if not producto.estado:
            raise HTTPException(
                status_code=400,
                detail=(
                    "No se puede mover stock de un "
                    "producto inactivo."
                ),
            )

        if datos.cantidad <= 0:
            raise HTTPException(
                status_code=400,
                detail="La cantidad debe ser mayor que cero.",
            )

        if datos.tipo == "entrada":
            stock_nuevo = producto.stock + datos.cantidad

        elif datos.tipo == "salida":
            if datos.cantidad > producto.stock:
                raise HTTPException(
                    status_code=400,
                    detail=(
                        f"Stock insuficiente. "
                        f"Disponible: {producto.stock} unidades."
                    ),
                )

            stock_nuevo = producto.stock - datos.cantidad

        else:
            raise HTTPException(
                status_code=400,
                detail="El tipo debe ser entrada o salida.",
            )

        stock_anterior = producto.stock
        producto.stock = stock_nuevo

        movimiento = models.InventarioMovimiento(
            producto_id=producto.id,
            tipo=datos.tipo,
            cantidad=datos.cantidad,
            stock_anterior=stock_anterior,
            stock_nuevo=stock_nuevo,
            motivo=(
                datos.motivo.strip()
                if datos.motivo
                else None
            ),
        )

        db.add(movimiento)
        db.commit()
        db.refresh(movimiento)

        return movimiento

    except HTTPException:
        db.rollback()
        raise

    except SQLAlchemyError:
        db.rollback()

        raise HTTPException(
            status_code=500,
            detail=(
                "No se pudo registrar el movimiento "
                "de inventario."
            ),
        )


# ==========================================
# DASHBOARD CON DATOS REALES
# ==========================================

@app.get("/api/dashboard")
def obtener_dashboard(
    db: Session = Depends(obtener_db),
):
    try:
        total_clientes = (
            db.query(func.count(models.Cliente.id)).scalar()
            or 0
        )

        total_productos = (
            db.query(func.count(models.Producto.id)).scalar()
            or 0
        )

        productos_activos = (
            db.query(func.count(models.Producto.id))
            .filter(models.Producto.estado.is_(True))
            .scalar()
            or 0
        )

        unidades_stock = (
            db.query(
                func.coalesce(
                    func.sum(models.Producto.stock), 0
                )
            ).scalar()
            or 0
        )

        valor_inventario = (
            db.query(
                func.coalesce(
                    func.sum(
                        models.Producto.precio
                        * models.Producto.stock
                    ),
                    0,
                )
            ).scalar()
            or 0
        )

        productos_stock_bajo = (
            db.query(func.count(models.Producto.id))
            .filter(
                models.Producto.estado.is_(True),
                models.Producto.stock > 0,
                models.Producto.stock <= 5,
            )
            .scalar()
            or 0
        )

        productos_sin_stock = (
            db.query(func.count(models.Producto.id))
            .filter(
                models.Producto.estado.is_(True),
                models.Producto.stock == 0,
            )
            .scalar()
            or 0
        )

        return {
            "total_clientes": total_clientes,
            "total_productos": total_productos,
            "productos_activos": productos_activos,
            "unidades_stock": int(unidades_stock),
            "valor_inventario": float(valor_inventario),
            "productos_stock_bajo": productos_stock_bajo,
            "productos_sin_stock": productos_sin_stock,
        }

    except SQLAlchemyError:
        raise HTTPException(
            status_code=500,
            detail=(
                "No se pudieron obtener las estadisticas "
                "del Dashboard."
            ),
        )


# ==========================================
# VENTAS: ESTADISTICAS
# ==========================================

@app.get("/api/ventas/estadisticas")
def obtener_estadisticas_ventas(
    db: Session = Depends(obtener_db),
):
    try:
        ventas_validas = db.query(models.Venta).filter(
            models.Venta.estado != "anulada"
        )

        total_ventas = ventas_validas.count()

        ventas_pendientes = (
            db.query(models.Venta)
            .filter(models.Venta.estado == "pendiente")
            .count()
        )

        ventas_pagadas = (
            db.query(models.Venta)
            .filter(models.Venta.estado == "pagada")
            .count()
        )

        ingresos = (
            db.query(
                func.coalesce(
                    func.sum(models.Venta.total), 0
                )
            )
            .filter(models.Venta.estado == "pagada")
            .scalar()
        )

        monto_pendiente = (
            db.query(
                func.coalesce(
                    func.sum(models.Venta.total), 0
                )
            )
            .filter(models.Venta.estado == "pendiente")
            .scalar()
        )

        promedio = (
            db.query(func.avg(models.Venta.total))
            .filter(models.Venta.estado != "anulada")
            .scalar()
        )

        return {
            "total_ventas": total_ventas,
            "ventas_pendientes": ventas_pendientes,
            "ventas_pagadas": ventas_pagadas,
            "ingresos_totales": float(ingresos or 0),
            "monto_pendiente": float(monto_pendiente or 0),
            "ticket_promedio": float(promedio or 0),
        }

    except SQLAlchemyError:
        raise HTTPException(
            status_code=500,
            detail=(
                "No se pudieron obtener las estadisticas "
                "de ventas."
            ),
        )


# ==========================================
# VENTAS: HISTORIAL
# ==========================================

@app.get(
    "/api/ventas",
    response_model=list[schemas.VentaRespuesta],
)
def listar_ventas(
    db: Session = Depends(obtener_db),
):
    try:
        return (
            db.query(models.Venta)
            .options(joinedload(models.Venta.detalles))
            .order_by(
                models.Venta.created_at.desc(),
                models.Venta.id.desc(),
            )
            .all()
        )

    except SQLAlchemyError:
        raise HTTPException(
            status_code=500,
            detail="No se pudo obtener el historial de ventas.",
        )


# ==========================================
# VENTAS: REGISTRAR UNA VENTA
# ==========================================

@app.post(
    "/api/ventas",
    response_model=schemas.VentaRespuesta,
    status_code=201,
)
def crear_venta(
    datos: schemas.VentaCrear,
    db: Session = Depends(obtener_db),
):
    try:
        cliente = (
            db.query(models.Cliente)
            .filter(
                models.Cliente.id == datos.cliente_id
            )
            .first()
        )

        if cliente is None:
            raise HTTPException(
                status_code=404,
                detail="El cliente seleccionado no existe.",
            )

        if datos.usuario_id is not None:
            usuario = (
                db.query(models.Usuario)
                .filter(
                    models.Usuario.id == datos.usuario_id
                )
                .first()
            )

            if usuario is None:
                raise HTTPException(
                    status_code=404,
                    detail="El usuario seleccionado no existe.",
                )

            if not usuario.estado:
                raise HTTPException(
                    status_code=400,
                    detail="El usuario esta desactivado.",
                )

        cantidades = {}

        for detalle in datos.detalles:
            cantidades[detalle.producto_id] = (
                cantidades.get(detalle.producto_id, 0)
                + detalle.cantidad
            )

        productos = {}

        for producto_id in sorted(cantidades.keys()):
            producto = (
                db.query(models.Producto)
                .filter(
                    models.Producto.id == producto_id
                )
                .with_for_update()
                .first()
            )

            if producto is None:
                raise HTTPException(
                    status_code=404,
                    detail=(
                        f"No existe el producto "
                        f"con ID {producto_id}."
                    ),
                )

            if not producto.estado:
                raise HTTPException(
                    status_code=400,
                    detail=(
                        f"El producto '{producto.nombre}' "
                        "esta inactivo."
                    ),
                )

            cantidad = cantidades[producto_id]

            if producto.stock < cantidad:
                raise HTTPException(
                    status_code=400,
                    detail=(
                        f"Stock insuficiente para "
                        f"'{producto.nombre}'. "
                        f"Disponible: {producto.stock}; "
                        f"solicitado: {cantidad}."
                    ),
                )

            productos[producto_id] = producto

        from decimal import Decimal

        total = Decimal("0.00")
        detalles_calculados = []

        for producto_id, cantidad in cantidades.items():
            producto = productos[producto_id]
            precio_unitario = Decimal(str(producto.precio))
            subtotal = precio_unitario * cantidad

            total += subtotal

            detalles_calculados.append({
                "producto": producto,
                "cantidad": cantidad,
                "precio_unitario": precio_unitario,
                "subtotal": subtotal,
            })

        venta = models.Venta(
            cliente_id=datos.cliente_id,
            usuario_id=datos.usuario_id,
            total=total,
            estado="pendiente",
        )

        db.add(venta)
        db.flush()

        for item in detalles_calculados:
            producto = item["producto"]
            cantidad = item["cantidad"]
            stock_anterior = producto.stock
            stock_nuevo = stock_anterior - cantidad

            detalle_venta = models.DetalleVenta(
                venta_id=venta.id,
                producto_id=producto.id,
                cantidad=cantidad,
                precio_unitario=item["precio_unitario"],
                subtotal=item["subtotal"],
            )

            movimiento = models.InventarioMovimiento(
                producto_id=producto.id,
                tipo="salida",
                cantidad=cantidad,
                stock_anterior=stock_anterior,
                stock_nuevo=stock_nuevo,
                motivo=f"Venta #{venta.id}",
            )

            producto.stock = stock_nuevo

            db.add(detalle_venta)
            db.add(movimiento)

        db.commit()

        venta_guardada = (
            db.query(models.Venta)
            .options(joinedload(models.Venta.detalles))
            .filter(models.Venta.id == venta.id)
            .first()
        )

        return venta_guardada

    except HTTPException:
        db.rollback()
        raise

    except SQLAlchemyError:
        db.rollback()

        raise HTTPException(
            status_code=500,
            detail=(
                "No se pudo registrar la venta. "
                "La operacion fue cancelada y no se guardaron "
                "sus cambios parciales."
            ),
        )


# ==========================================
# PAGOS: HISTORIAL
# ==========================================

@app.get("/api/pagos")
def listar_pagos(
    db: Session = Depends(obtener_db),
):
    try:
        pagos = (
            db.query(models.Pago)
            .options(
                joinedload(
                    models.Pago.venta
                ).joinedload(models.Venta.cliente)
            )
            .order_by(
                models.Pago.fecha_pago.desc(),
                models.Pago.id.desc(),
            )
            .all()
        )

        resultado = []

        for pago in pagos:
            venta = pago.venta

            resultado.append({
                "id": pago.id,
                "venta_id": pago.venta_id,
                "cliente": (
                    venta.cliente.nombre
                    if venta and venta.cliente
                    else "Cliente no disponible"
                ),
                "total_venta": (
                    float(venta.total) if venta else 0
                ),
                "monto": float(pago.monto),
                "metodo_pago": pago.metodo_pago,
                "estado": pago.estado,
                "referencia": pago.referencia,
                "fecha_pago": pago.fecha_pago,
            })

        return resultado

    except SQLAlchemyError:
        raise HTTPException(
            status_code=500,
            detail="No se pudo obtener el historial de pagos.",
        )


# ==========================================
# PAGOS: RESUMEN ESTADISTICO
# ==========================================

@app.get("/api/pagos/resumen")
def obtener_resumen_pagos(
    db: Session = Depends(obtener_db),
):
    try:
        pagos_completados = db.query(models.Pago).filter(
            models.Pago.estado == "completado"
        )

        total_pagos = pagos_completados.count()

        monto_recaudado = (
            pagos_completados.with_entities(
                func.coalesce(func.sum(models.Pago.monto), 0)
            ).scalar()
        )

        ventas_pendientes = db.query(models.Venta).filter(
            models.Venta.estado == "pendiente"
        )

        cantidad_ventas_pendientes = ventas_pendientes.count()

        monto_pendiente = (
            ventas_pendientes.with_entities(
                func.coalesce(func.sum(models.Venta.total), 0)
            ).scalar()
        )

        return {
            "total_pagos": total_pagos,
            "monto_recaudado": float(monto_recaudado or 0),
            "ventas_pendientes": cantidad_ventas_pendientes,
            "monto_pendiente": float(monto_pendiente or 0),
        }

    except SQLAlchemyError:
        raise HTTPException(
            status_code=500,
            detail="No se pudo obtener el resumen de pagos.",
        )


# ==========================================
# PAGOS: REGISTRAR UN PAGO
# ==========================================

@app.post("/api/pagos", status_code=201)
def registrar_pago(
    datos: dict,
    db: Session = Depends(obtener_db),
):
    from decimal import Decimal, InvalidOperation

    try:
        try:
            venta_id = int(datos.get("venta_id"))
            monto = Decimal(str(datos.get("monto")))

        except (
            ValueError,
            TypeError,
            InvalidOperation,
        ):
            raise HTTPException(
                status_code=400,
                detail=(
                    "La venta y el monto deben "
                    "tener valores válidos."
                ),
            )

        if venta_id <= 0:
            raise HTTPException(
                status_code=400,
                detail="El ID de la venta debe ser mayor que cero.",
            )

        if not monto.is_finite() or monto <= 0:
            raise HTTPException(
                status_code=400,
                detail="El monto debe ser mayor que cero.",
            )

        if monto.as_tuple().exponent < -2:
            raise HTTPException(
                status_code=400,
                detail="El monto admite como máximo dos decimales.",
            )

        metodo_pago = str(
            datos.get("metodo_pago", "efectivo")
        ).strip().lower()

        metodos_permitidos = {
            "efectivo",
            "tarjeta",
            "transferencia",
            "yape",
            "plin",
            "otros",
        }

        if metodo_pago not in metodos_permitidos:
            raise HTTPException(
                status_code=400,
                detail=(
                    "Método no válido. Usa efectivo, tarjeta, "
                    "transferencia, yape, plin u otros."
                ),
            )

        referencia = datos.get("referencia")

        if referencia is not None:
            referencia = str(referencia).strip() or None

            if len(referencia or "") > 100:
                raise HTTPException(
                    status_code=400,
                    detail=(
                        "La referencia no puede "
                        "superar 100 caracteres."
                    ),
                )

        venta = (
            db.query(models.Venta)
            .filter(models.Venta.id == venta_id)
            .with_for_update()
            .first()
        )

        if venta is None:
            raise HTTPException(
                status_code=404,
                detail="La venta seleccionada no existe.",
            )

        if venta.estado == "anulada":
            raise HTTPException(
                status_code=400,
                detail=(
                    "No se pueden registrar pagos "
                    "para una venta anulada."
                ),
            )

        total_venta = Decimal(str(venta.total))

        pagado_anteriormente = (
            db.query(
                func.coalesce(func.sum(models.Pago.monto), 0)
            )
            .filter(
                models.Pago.venta_id == venta_id,
                models.Pago.estado == "completado",
            )
            .scalar()
        )

        pagado_anteriormente = Decimal(
            str(pagado_anteriormente or 0)
        )

        saldo_pendiente = total_venta - pagado_anteriormente

        if monto > saldo_pendiente:
            raise HTTPException(
                status_code=400,
                detail=(
                    "El monto supera el saldo pendiente de "
                    f"S/ {max(saldo_pendiente, Decimal('0.00')):.2f}."
                ),
            )

        nuevo_pago = models.Pago(
            venta_id=venta_id,
            monto=monto,
            metodo_pago=metodo_pago,
            estado="completado",
            referencia=referencia,
        )

        db.add(nuevo_pago)
        db.flush()

        total_pagado = pagado_anteriormente + monto

        if total_pagado >= total_venta:
            venta.estado = "pagada"
        else:
            venta.estado = "pendiente"

        db.commit()
        db.refresh(nuevo_pago)

        return {
            "mensaje": "Pago registrado correctamente.",
            "pago": {
                "id": nuevo_pago.id,
                "venta_id": nuevo_pago.venta_id,
                "monto": float(nuevo_pago.monto),
                "metodo_pago": nuevo_pago.metodo_pago,
                "estado": nuevo_pago.estado,
                "referencia": nuevo_pago.referencia,
                "fecha_pago": nuevo_pago.fecha_pago,
            },
            "total_venta": float(total_venta),
            "total_pagado": float(total_pagado),
            "saldo_pendiente": float(
                total_venta - total_pagado
            ),
            "estado_venta": venta.estado,
        }

    except HTTPException:
        db.rollback()
        raise

    except SQLAlchemyError:
        db.rollback()

        raise HTTPException(
            status_code=500,
            detail=(
                "No se pudo registrar el pago. "
                "No se guardaron cambios parciales."
            ),
        )


# ==========================================
# PAGOS: CONSULTAR POR ID
# ==========================================

@app.get("/api/pagos/{pago_id}")
def obtener_pago(
    pago_id: int,
    db: Session = Depends(obtener_db),
):
    try:
        pago = (
            db.query(models.Pago)
            .options(
                joinedload(
                    models.Pago.venta
                ).joinedload(models.Venta.cliente)
            )
            .filter(models.Pago.id == pago_id)
            .first()
        )

        if pago is None:
            raise HTTPException(
                status_code=404,
                detail="Pago no encontrado.",
            )

        return {
            "id": pago.id,
            "venta_id": pago.venta_id,
            "cliente": (
                pago.venta.cliente.nombre
                if pago.venta and pago.venta.cliente
                else "Cliente no disponible"
            ),
            "total_venta": (
                float(pago.venta.total)
                if pago.venta
                else 0
            ),
            "monto": float(pago.monto),
            "metodo_pago": pago.metodo_pago,
            "estado": pago.estado,
            "referencia": pago.referencia,
            "fecha_pago": pago.fecha_pago,
        }

    except HTTPException:
        raise

    except SQLAlchemyError:
        raise HTTPException(
            status_code=500,
            detail="No se pudo consultar el pago.",
        )


# ==========================================
# ANALYTICS: ANALISIS ESTADISTICO DE VENTAS
# ==========================================

@app.get("/api/analytics/resumen")
def obtener_analytics_resumen(
    db: Session = Depends(obtener_db),
):
    try:
        ventas = (
            db.query(models.Venta)
            .filter(models.Venta.estado != "anulada")
            .order_by(models.Venta.created_at.asc())
            .all()
        )

        importes = [
            float(venta.total)
            for venta in ventas
            if venta.total is not None
        ]

        total_ventas = len(ventas)

        ventas_pagadas = sum(
            1 for venta in ventas
            if venta.estado == "pagada"
        )

        ventas_pendientes = sum(
            1 for venta in ventas
            if venta.estado == "pendiente"
        )

        ingresos_totales = sum(
            float(venta.total or 0)
            for venta in ventas
            if venta.estado == "pagada"
        )

        monto_pendiente = sum(
            float(venta.total or 0)
            for venta in ventas
            if venta.estado == "pendiente"
        )

        media_ventas = mean(importes) if importes else 0
        mediana_ventas = median(importes) if importes else 0
        venta_minima = min(importes) if importes else 0
        venta_maxima = max(importes) if importes else 0

        ventas_por_mes = {}

        for venta in ventas:
            if venta.created_at is None:
                continue

            mes = venta.created_at.strftime("%Y-%m")

            if mes not in ventas_por_mes:
                ventas_por_mes[mes] = {
                    "mes": mes,
                    "cantidad_ventas": 0,
                    "monto_total": 0.0,
                    "ingresos_pagados": 0.0,
                }

            ventas_por_mes[mes]["cantidad_ventas"] += 1
            ventas_por_mes[mes]["monto_total"] += float(
                venta.total or 0
            )

            if venta.estado == "pagada":
                ventas_por_mes[mes]["ingresos_pagados"] += float(
                    venta.total or 0
                )

        tendencia_mensual = [
            {
                **datos,
                "monto_total": round(datos["monto_total"], 2),
                "ingresos_pagados": round(
                    datos["ingresos_pagados"], 2
                ),
            }
            for _, datos in sorted(ventas_por_mes.items())
        ]

        probabilidad_pago = (
            ventas_pagadas / total_ventas * 100
            if total_ventas > 0
            else 0
        )

        return {
            "total_ventas": total_ventas,
            "ventas_pagadas": ventas_pagadas,
            "ventas_pendientes": ventas_pendientes,
            "ingresos_totales": round(ingresos_totales, 2),
            "monto_pendiente": round(monto_pendiente, 2),
            "ticket_promedio": round(media_ventas, 2),
            "media_ventas": round(media_ventas, 2),
            "mediana_ventas": round(
                float(mediana_ventas), 2
            ),
            "venta_minima": round(venta_minima, 2),
            "venta_maxima": round(venta_maxima, 2),
            "probabilidad_pago_observada": round(
                probabilidad_pago, 2
            ),
            "tendencia_mensual": tendencia_mensual,
        }

    except SQLAlchemyError:
        raise HTTPException(
            status_code=500,
            detail="No se pudo realizar el análisis de ventas.",
        )


# ==========================================
# INTELIGENCIA ARTIFICIAL: ANALISIS DE VENTAS
# ==========================================

@app.get("/api/ia/ventas")
def obtener_analisis_ia(
    db: Session = Depends(obtener_db),
):
    try:
        return generar_analisis_ventas(db)

    except SQLAlchemyError:
        raise HTTPException(
            status_code=500,
            detail="No se pudo realizar el análisis con IA.",
        )

    except Exception:
        raise HTTPException(
            status_code=500,
            detail="Ocurrió un error al procesar el análisis de IA.",
        )


# ==========================================
# MACHINE LEARNING: PREDICCION DE VENTAS
# ==========================================

@app.get("/api/ia/prediccion-ventas")
def predecir_ventas(
    db: Session = Depends(obtener_db),
):
    try:
        return generar_prediccion_ventas(db)

    except SQLAlchemyError:
        raise HTTPException(
            status_code=500,
            detail=(
                "No se pudo consultar el historial "
                "de ventas para la prediccion."
            ),
        )

    except Exception:
        raise HTTPException(
            status_code=500,
            detail=(
                "Ocurrio un error al generar la prediccion. "
                "Revisa la consola del backend."
            ),
        )