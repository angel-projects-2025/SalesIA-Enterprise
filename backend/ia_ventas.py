from datetime import datetime
from statistics import mean, median, pvariance, pstdev

import pandas as pd
from sqlalchemy.orm import Session

import models


def obtener_datos_ventas(db: Session) -> pd.DataFrame:
    """
    Obtiene las ventas de PostgreSQL.
    Las ventas anuladas no participan en el análisis.
    """
    ventas = (
        db.query(models.Venta)
        .filter(models.Venta.estado != "anulada")
        .order_by(models.Venta.created_at.asc())
        .all()
    )

    datos = []

    for venta in ventas:
        if venta.created_at is None:
            continue

        datos.append(
            {
                "id": venta.id,
                "fecha": venta.created_at,
                "total": float(venta.total or 0),
                "estado": str(venta.estado or "").strip().lower(),
            }
        )

    return pd.DataFrame(
        datos,
        columns=["id", "fecha", "total", "estado"],
    )


def generar_analisis_ventas(db: Session) -> dict:
    """
    Calcula estadísticas, probabilidades y recomendaciones
    a partir de las ventas registradas en PostgreSQL.
    """
    df = obtener_datos_ventas(db)

    if df.empty:
        return {
            "estado": "sin_datos",
            "mensaje": (
                "Todavía no existen ventas suficientes "
                "para realizar un análisis."
            ),
            "total_ventas": 0,
            "monto_total": 0,
            "ventas_pagadas": 0,
            "ventas_pendientes": 0,
            "porcentaje_pago_observado": 0,
            "media_ventas": 0,
            "mediana_ventas": 0,
            "venta_minima": 0,
            "venta_maxima": 0,
            "varianza_poblacional": 0,
            "desviacion_estandar_poblacional": 0,
            "variable_aleatoria": {
                "esperanza_matematica": 0,
                "varianza": 0,
                "desviacion_estandar": 0,
            },
            "probabilidades": {
                "venta_pagada": 0,
                "venta_pendiente": 0,
                "importe_alto": 0,
            },
            "analisis_bayes": {
                "definicion": (
                    "Se considera importe alto una venta cuyo "
                    "importe es igual o superior a la mediana."
                ),
                "probabilidad_pagada_dado_importe_alto": 0,
                "probabilidad_importe_alto_dado_pagada": 0,
                "interpretacion": (
                    "No hay datos suficientes para calcular "
                    "estas probabilidades."
                ),
            },
            "ventas_por_mes": [],
            "recomendaciones": [
                "Registra ventas reales para comenzar a generar estadísticas."
            ],
            "prediccion_disponible": False,
            "historial_suficiente": False,
            "criterio_prediccion": (
                "Se necesitan al menos 30 ventas distribuidas en 6 meses "
                "como criterio inicial. El modelo predictivo todavía "
                "no está implementado."
            ),
            "fecha_analisis": datetime.now().isoformat(),
        }

    # Preparar los datos.
    df["total"] = pd.to_numeric(df["total"], errors="coerce").fillna(0)
    df["fecha"] = pd.to_datetime(df["fecha"], errors="coerce")
    df = df.dropna(subset=["fecha"]).copy()

    if df.empty:
        return {
            "estado": "sin_datos",
            "mensaje": "No hay ventas con fechas válidas para analizar.",
            "total_ventas": 0,
            "monto_total": 0,
            "ventas_pagadas": 0,
            "ventas_pendientes": 0,
            "porcentaje_pago_observado": 0,
            "media_ventas": 0,
            "mediana_ventas": 0,
            "venta_minima": 0,
            "venta_maxima": 0,
            "varianza_poblacional": 0,
            "desviacion_estandar_poblacional": 0,
            "variable_aleatoria": {
                "esperanza_matematica": 0,
                "varianza": 0,
                "desviacion_estandar": 0,
            },
            "probabilidades": {
                "venta_pagada": 0,
                "venta_pendiente": 0,
                "importe_alto": 0,
            },
            "analisis_bayes": {
                "definicion": "No hay datos válidos.",
                "probabilidad_pagada_dado_importe_alto": 0,
                "probabilidad_importe_alto_dado_pagada": 0,
                "interpretacion": "No se puede realizar el cálculo.",
            },
            "ventas_por_mes": [],
            "recomendaciones": [
                "Verifica que las ventas registradas tengan fechas válidas."
            ],
            "prediccion_disponible": False,
            "historial_suficiente": False,
            "criterio_prediccion": (
                "El modelo predictivo todavía no está implementado."
            ),
            "fecha_analisis": datetime.now().isoformat(),
        }

    # Estadísticas descriptivas.
    importes = df["total"].astype(float).tolist()
    total_ventas = len(importes)

    monto_total = float(sum(importes))
    media_ventas = float(mean(importes))
    mediana_ventas = float(median(importes))
    venta_minima = float(min(importes))
    venta_maxima = float(max(importes))

    # Varianza y desviación estándar poblacionales.
    varianza = float(pvariance(importes))
    desviacion = float(pstdev(importes))

    # Estados de las ventas.
    estados = df["estado"]

    ventas_pagadas = int((estados == "pagada").sum())
    ventas_pendientes = int((estados == "pendiente").sum())

    porcentaje_pago = (
        ventas_pagadas / total_ventas * 100
        if total_ventas > 0
        else 0
    )

    # Probabilidades observadas.
    probabilidad_pagada = ventas_pagadas / total_ventas
    probabilidad_pendiente = ventas_pendientes / total_ventas

    # Se define importe alto como un importe igual o superior a la mediana.
    df["importe_alto"] = df["total"] >= mediana_ventas

    ventas_importe_alto = int(df["importe_alto"].sum())

    probabilidad_importe_alto = (
        ventas_importe_alto / total_ventas
        if total_ventas > 0
        else 0
    )

    ventas_pagadas_importe_alto = int(
        ((df["estado"] == "pagada") & df["importe_alto"]).sum()
    )

    probabilidad_pagada_dado_importe_alto = (
        ventas_pagadas_importe_alto / ventas_importe_alto
        if ventas_importe_alto > 0
        else 0
    )

    # Teorema de Bayes:
    # P(importe alto | pagada) =
    # P(pagada | importe alto) * P(importe alto) / P(pagada)
    if probabilidad_pagada > 0:
        probabilidad_importe_alto_dado_pagada = (
            probabilidad_pagada_dado_importe_alto
            * probabilidad_importe_alto
            / probabilidad_pagada
        )
    else:
        probabilidad_importe_alto_dado_pagada = 0

    # Agrupar por mes.
    df["mes"] = df["fecha"].dt.strftime("%Y-%m")

    agrupacion = (
        df.groupby("mes")
        .agg(
            cantidad_ventas=("id", "count"),
            monto_total=("total", "sum"),
        )
        .reset_index()
        .sort_values("mes")
    )

    ventas_por_mes = [
        {
            "mes": fila["mes"],
            "cantidad_ventas": int(fila["cantidad_ventas"]),
            "monto_total": round(float(fila["monto_total"]), 2),
        }
        for _, fila in agrupacion.iterrows()
    ]

    # Evaluar si el historial cumple el mínimo definido.
    meses_con_ventas = len(agrupacion)

    historial_suficiente = (
        total_ventas >= 30 and meses_con_ventas >= 6
    )

    # No afirmar que hay una predicción hasta implementar un modelo.
    prediccion_disponible = False

    # Recomendaciones basadas en los resultados.
    recomendaciones = []

    if ventas_pendientes > 0:
        recomendaciones.append(
            f"Revisa las {ventas_pendientes} ventas pendientes "
            "y realiza seguimiento de los cobros correspondientes."
        )

    if media_ventas > mediana_ventas:
        recomendaciones.append(
            "La media supera la mediana. Algunas ventas de importe "
            "elevado podrían estar aumentando el promedio."
        )
    elif media_ventas < mediana_ventas:
        recomendaciones.append(
            "La mediana supera la media. Revisa la distribución "
            "de los importes para identificar ventas de menor valor."
        )
    else:
        recomendaciones.append(
            "La media y la mediana coinciden. Ambas medidas "
            "representan el mismo importe central en este conjunto."
        )

    if len(agrupacion) >= 2:
        primer_mes = float(agrupacion.iloc[0]["monto_total"])
        ultimo_mes = float(agrupacion.iloc[-1]["monto_total"])

        if ultimo_mes > primer_mes:
            recomendaciones.append(
                "El importe del último mes registrado supera "
                "al del primer mes disponible."
            )
        elif ultimo_mes < primer_mes:
            recomendaciones.append(
                "El importe del último mes registrado es inferior "
                "al del primer mes disponible."
            )
        else:
            recomendaciones.append(
                "El primer y el último mes registrado tienen "
                "el mismo importe total."
            )
    else:
        recomendaciones.append(
            "Registra ventas durante más meses para comparar "
            "la evolución mensual del negocio."
        )

    if desviacion > media_ventas and media_ventas > 0:
        recomendaciones.append(
            "La desviación estándar supera la media, lo que indica "
            "una dispersión elevada de los importes respecto al promedio."
        )
    elif desviacion > 0:
        recomendaciones.append(
            "Los importes presentan variación respecto a la media. "
            "Utiliza la desviación estándar para seguir esa dispersión."
        )
    else:
        recomendaciones.append(
            "Todos los importes registrados son iguales; no existe "
            "variación entre los importes de estas ventas."
        )

    if historial_suficiente:
        criterio_prediccion = (
            "El historial cumple el mínimo inicial de 30 ventas en 6 meses, "
            "pero todavía se necesita implementar y evaluar un modelo "
            "predictivo antes de mostrar pronósticos."
        )
    else:
        criterio_prediccion = (
            "Se recomienda reunir al menos 30 ventas distribuidas en "
            "6 meses. Este requisito es una referencia inicial y no "
            "garantiza por sí solo una predicción confiable."
        )

    if ventas_pagadas > 0:
        interpretacion_bayes = (
            f"Entre las ventas pagadas, el "
            f"{probabilidad_importe_alto_dado_pagada * 100:.2f}% "
            "corresponde a importes iguales o superiores a la mediana. "
            "Es una asociación observada en los datos, no una garantía "
            "de comportamiento futuro."
        )
    else:
        interpretacion_bayes = (
            "No hay ventas pagadas para estimar la probabilidad "
            "condicional mediante el teorema de Bayes."
        )

    return {
        "estado": "ok",
        "mensaje": (
            "Análisis estadístico calculado a partir de las ventas "
            "registradas en PostgreSQL."
        ),
        "total_ventas": total_ventas,
        "monto_total": round(monto_total, 2),
        "ventas_pagadas": ventas_pagadas,
        "ventas_pendientes": ventas_pendientes,
        "porcentaje_pago_observado": round(porcentaje_pago, 2),
        "media_ventas": round(media_ventas, 2),
        "mediana_ventas": round(mediana_ventas, 2),
        "venta_minima": round(venta_minima, 2),
        "venta_maxima": round(venta_maxima, 2),
        "varianza_poblacional": round(varianza, 4),
        "desviacion_estandar_poblacional": round(desviacion, 2),
        "variable_aleatoria": {
            "esperanza_matematica": round(media_ventas, 2),
            "varianza": round(varianza, 4),
            "desviacion_estandar": round(desviacion, 2),
        },
        "probabilidades": {
            "venta_pagada": round(probabilidad_pagada * 100, 2),
            "venta_pendiente": round(probabilidad_pendiente * 100, 2),
            "importe_alto": round(probabilidad_importe_alto * 100, 2),
        },
        "analisis_bayes": {
            "definicion": (
                "Se considera importe alto una venta cuyo importe "
                "es igual o superior a la mediana de las ventas."
            ),
            "probabilidad_pagada_dado_importe_alto": round(
                probabilidad_pagada_dado_importe_alto * 100, 2
            ),
            "probabilidad_importe_alto_dado_pagada": round(
                probabilidad_importe_alto_dado_pagada * 100, 2
            ),
            "interpretacion": interpretacion_bayes,
        },
        "ventas_por_mes": ventas_por_mes,
        "recomendaciones": recomendaciones,
        "prediccion_disponible": prediccion_disponible,
        "historial_suficiente": historial_suficiente,
        "criterio_prediccion": criterio_prediccion,
        "fecha_analisis": datetime.now().isoformat(),
    }