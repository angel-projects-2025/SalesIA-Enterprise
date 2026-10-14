
from datetime import datetime
from typing import Any

from sklearn.linear_model import LinearRegression
from sklearn.metrics import mean_absolute_error
from sqlalchemy import text
from sqlalchemy.orm import Session


MINIMO_MESES = 6
MINIMO_VENTAS = 30
MESES_A_PREDECIR = 3


def generar_prediccion_ventas(db: Session) -> dict[str, Any]:
    """Genera una predicción mensual de ingresos mediante regresión lineal."""

    consulta = db.execute(
        text("""
            SELECT
                DATE_TRUNC('month', created_at) AS mes,
                COALESCE(SUM(total), 0) AS ingresos,
                COUNT(id) AS cantidad_ventas
            FROM ventas
            WHERE estado <> 'anulada'
            GROUP BY DATE_TRUNC('month', created_at)
            ORDER BY DATE_TRUNC('month', created_at)
        """)
    ).fetchall()

    historial = [
        {
            "mes": fila.mes.strftime("%Y-%m"),
            "ingresos": round(float(fila.ingresos or 0), 2),
            "cantidad_ventas": int(fila.cantidad_ventas),
        }
        for fila in consulta
    ]

    total_ventas = sum(
        fila["cantidad_ventas"] for fila in historial
    )

    respuesta_base = {
        "estado": "sin_datos_suficientes",
        "modelo": "Regresión lineal de scikit-learn",
        "historial_mensual": historial,
        "meses_historicos": len(historial),
        "total_ventas_historicas": total_ventas,
        "predicciones": [],
        "error_medio_absoluto": None,
        "moneda": "PEN",
    }

    if not historial:
        return {
            **respuesta_base,
            "mensaje": "No existen ventas válidas para analizar.",
        }

    if (
        len(historial) < MINIMO_MESES
        or total_ventas < MINIMO_VENTAS
    ):
        return {
            **respuesta_base,
            "mensaje": (
                f"Se necesitan al menos {MINIMO_MESES} meses "
                f"de historial y {MINIMO_VENTAS} ventas registradas."
            ),
            "requisitos": {
                "meses_minimos": MINIMO_MESES,
                "ventas_minimas": MINIMO_VENTAS,
                "meses_disponibles": len(historial),
                "ventas_disponibles": total_ventas,
            },
        }

    # Preparar los datos históricos.
    X = [[indice] for indice in range(len(historial))]
    y = [fila["ingresos"] for fila in historial]

    error_medio_absoluto = None

    # Evaluar el modelo con los dos últimos meses, si hay suficientes datos.
    if len(historial) >= 8:
        corte = len(historial) - 2
        modelo_evaluacion = LinearRegression()
        modelo_evaluacion.fit(X[:corte], y[:corte])

        valores_evaluados = modelo_evaluacion.predict(X[corte:])

        error_medio_absoluto = round(
            float(mean_absolute_error(y[corte:], valores_evaluados)),
            2,
        )

    # Entrenar la regresión lineal.
    modelo = LinearRegression()
    modelo.fit(X, y)

    # Calcular también el promedio histórico para moderar
    # predicciones negativas o demasiado bajas.
    promedio_historico = sum(y) / len(y)
    predicciones = []

    ultimo_mes = datetime.strptime(historial[-1]["mes"], "%Y-%m")

    for paso in range(1, MESES_A_PREDECIR + 1):
        indice_futuro = len(historial) - 1 + paso

        importe_estimado = float(
            modelo.predict([[indice_futuro]])[0]
        )

        # Si la tendencia proyectada es negativa o casi cero,
        # utilizar el promedio histórico como estimación alternativa.
        if importe_estimado <= 0:
            importe_estimado = promedio_historico

        numero_mes = ultimo_mes.month + paso
        anio = ultimo_mes.year + (numero_mes - 1) // 12
        mes = (numero_mes - 1) % 12 + 1

        predicciones.append({
            "mes": f"{anio:04d}-{mes:02d}",
            "ingresos_estimados": round(importe_estimado, 2),
        })

    return {
        **respuesta_base,
        "estado": "entrenado",
        "mensaje": (
            "Modelo entrenado con regresión lineal. "
            "Cuando la tendencia proyectada es negativa, "
            "se utiliza el promedio histórico como alternativa. "
            "Las estimaciones son orientativas."
        ),
        "predicciones": predicciones,
        "error_medio_absoluto": error_medio_absoluto,
        "evaluacion_disponible": error_medio_absoluto is not None,
        "fecha_analisis": datetime.now().isoformat(),
    }
