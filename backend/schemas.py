from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field


# ==========================================
# USUARIOS
# ==========================================

class UsuarioCrear(BaseModel):
    nombre: str
    correo: EmailStr
    password: str
    rol_id: int


class UsuarioRespuesta(BaseModel):
    id: int
    nombre: str
    correo: EmailStr
    rol_id: int
    estado: bool

    model_config = ConfigDict(from_attributes=True)


# ==========================================
# ROLES
# ==========================================

class RolRespuesta(BaseModel):
    id: int
    nombre: str

    model_config = ConfigDict(from_attributes=True)


# ==========================================
# AUTENTICACIÓN
# ==========================================

class LoginSolicitud(BaseModel):
    correo: EmailStr
    password: str


class LoginRespuesta(BaseModel):
    mensaje: str
    usuario: UsuarioRespuesta


# ==========================================
# CLIENTES
# ==========================================

class ClienteCrear(BaseModel):
    nombre: str = Field(min_length=1, max_length=150)
    documento: str | None = None
    correo: EmailStr | None = None
    telefono: str | None = None
    direccion: str | None = None


class ClienteActualizar(BaseModel):
    nombre: str | None = Field(default=None, min_length=1, max_length=150)
    documento: str | None = None
    correo: EmailStr | None = None
    telefono: str | None = None
    direccion: str | None = None


class ClienteRespuesta(BaseModel):
    id: int
    nombre: str
    documento: str | None = None
    correo: EmailStr | None = None
    telefono: str | None = None
    direccion: str | None = None

    model_config = ConfigDict(from_attributes=True)


# ==========================================
# CATEGORÍAS
# ==========================================

class CategoriaCrear(BaseModel):
    nombre: str = Field(min_length=1, max_length=100)
    descripcion: str | None = Field(default=None, max_length=250)


class CategoriaRespuesta(BaseModel):
    id: int
    nombre: str
    descripcion: str | None = None

    model_config = ConfigDict(from_attributes=True)


# ==========================================
# PRODUCTOS
# ==========================================

class ProductoCrear(BaseModel):
    nombre: str = Field(min_length=1, max_length=150)
    descripcion: str | None = Field(default=None, max_length=250)
    precio: Decimal = Field(ge=0, max_digits=10, decimal_places=2)
    stock: int = Field(default=0, ge=0)
    categoria_id: int | None = None
    estado: bool = True


class ProductoActualizar(BaseModel):
    nombre: str | None = Field(default=None, min_length=1, max_length=150)
    descripcion: str | None = Field(default=None, max_length=250)
    precio: Decimal | None = Field(
        default=None,
        ge=0,
        max_digits=10,
        decimal_places=2,
    )
    stock: int | None = Field(default=None, ge=0)
    categoria_id: int | None = None
    estado: bool | None = None


class ProductoRespuesta(BaseModel):
    id: int
    nombre: str
    descripcion: str | None = None
    precio: Decimal
    stock: int
    categoria_id: int | None = None
    estado: bool

    model_config = ConfigDict(from_attributes=True)


# ==========================================
# INVENTARIO
# ==========================================

class InventarioMovimientoCrear(BaseModel):
    producto_id: int = Field(gt=0)
    tipo: Literal["entrada", "salida"]
    cantidad: int = Field(gt=0)
    motivo: str | None = Field(default=None, max_length=250)


class InventarioMovimientoRespuesta(BaseModel):
    id: int
    producto_id: int
    tipo: str
    cantidad: int
    stock_anterior: int
    stock_nuevo: int
    motivo: str | None = None
    created_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)


# ==========================================
# VENTAS
# ==========================================

class VentaDetalleCrear(BaseModel):
    producto_id: int = Field(gt=0)
    cantidad: int = Field(gt=0)


class VentaCrear(BaseModel):
    cliente_id: int = Field(gt=0)
    usuario_id: int | None = Field(default=None, gt=0)
    detalles: list[VentaDetalleCrear] = Field(min_length=1)


class VentaDetalleRespuesta(BaseModel):
    id: int
    producto_id: int
    cantidad: int
    precio_unitario: Decimal
    subtotal: Decimal

    model_config = ConfigDict(from_attributes=True)


class VentaRespuesta(BaseModel):
    id: int
    cliente_id: int
    usuario_id: int | None = None
    total: Decimal
    estado: str
    created_at: datetime | None = None
    detalles: list[VentaDetalleRespuesta] = Field(default_factory=list)

    model_config = ConfigDict(from_attributes=True)