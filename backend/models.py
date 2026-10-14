from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    func,
)
from sqlalchemy.orm import relationship

from database import Base


class Rol(Base):
    __tablename__ = "roles"

    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String(50), unique=True, nullable=False)

    usuarios = relationship("Usuario", back_populates="rol")


class Usuario(Base):
    __tablename__ = "usuarios"

    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String(120), nullable=False)
    correo = Column(String(150), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    rol_id = Column(Integer, ForeignKey("roles.id"), nullable=False)
    estado = Column(Boolean, default=True, nullable=False)

    created_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
    )

    rol = relationship("Rol", back_populates="usuarios")


class Cliente(Base):
    __tablename__ = "clientes"

    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String(150), nullable=False)
    documento = Column(String(30), unique=True, nullable=True)
    correo = Column(String(150), nullable=True)
    telefono = Column(String(30), nullable=True)
    direccion = Column(String(250), nullable=True)

    created_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
    )


class Categoria(Base):
    __tablename__ = "categorias"

    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String(100), unique=True, nullable=False)
    descripcion = Column(String(250), nullable=True)

    productos = relationship("Producto", back_populates="categoria")


class Producto(Base):
    __tablename__ = "productos"

    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String(150), nullable=False)
    descripcion = Column(String(250), nullable=True)
    precio = Column(Numeric(10, 2), nullable=False, default=0)
    stock = Column(Integer, nullable=False, default=0)

    categoria_id = Column(
        Integer,
        ForeignKey("categorias.id"),
        nullable=True,
    )

    estado = Column(Boolean, default=True, nullable=False)

    created_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
    )

    categoria = relationship("Categoria", back_populates="productos")

    movimientos = relationship(
        "InventarioMovimiento",
        back_populates="producto",
    )


class InventarioMovimiento(Base):
    __tablename__ = "inventario_movimientos"

    id = Column(Integer, primary_key=True, index=True)

    producto_id = Column(
        Integer,
        ForeignKey("productos.id"),
        nullable=False,
        index=True,
    )

    tipo = Column(String(20), nullable=False)
    cantidad = Column(Integer, nullable=False)
    stock_anterior = Column(Integer, nullable=False)
    stock_nuevo = Column(Integer, nullable=False)
    motivo = Column(String(250), nullable=True)

    created_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    producto = relationship(
        "Producto",
        back_populates="movimientos",
    )


class Venta(Base):
    __tablename__ = "ventas"

    id = Column(Integer, primary_key=True, index=True)

    cliente_id = Column(
        Integer,
        ForeignKey("clientes.id"),
        nullable=False,
        index=True,
    )

    usuario_id = Column(
        Integer,
        ForeignKey("usuarios.id"),
        nullable=True,
        index=True,
    )

    total = Column(Numeric(12, 2), nullable=False, default=0)

    estado = Column(
        String(20),
        nullable=False,
        default="pendiente",
        index=True,
    )

    created_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
        index=True,
    )

    cliente = relationship("Cliente")
    usuario = relationship("Usuario")

    detalles = relationship(
        "DetalleVenta",
        back_populates="venta",
        cascade="all, delete-orphan",
        order_by="DetalleVenta.id",
    )

    pagos = relationship(
        "Pago",
        back_populates="venta",
        cascade="all, delete-orphan",
        order_by="Pago.id",
    )


class DetalleVenta(Base):
    __tablename__ = "detalle_ventas"

    id = Column(Integer, primary_key=True, index=True)

    venta_id = Column(
        Integer,
        ForeignKey("ventas.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    producto_id = Column(
        Integer,
        ForeignKey("productos.id"),
        nullable=False,
        index=True,
    )

    cantidad = Column(Integer, nullable=False)
    precio_unitario = Column(Numeric(10, 2), nullable=False)
    subtotal = Column(Numeric(12, 2), nullable=False)

    venta = relationship(
        "Venta",
        back_populates="detalles",
    )

    producto = relationship("Producto")


class Pago(Base):
    __tablename__ = "pagos"

    id = Column(Integer, primary_key=True, index=True)

    venta_id = Column(
        Integer,
        ForeignKey("ventas.id"),
        nullable=False,
        index=True,
    )

    monto = Column(Numeric(12, 2), nullable=False)

    metodo_pago = Column(
        String(30),
        nullable=False,
        default="efectivo",
    )

    estado = Column(
        String(20),
        nullable=False,
        default="completado",
        index=True,
    )

    referencia = Column(String(100), nullable=True)

    fecha_pago = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    venta = relationship(
        "Venta",
        back_populates="pagos",
    )