from fastapi import FastAPI, Query
from fastapi.responses import JSONResponse
import pandas as pd
import os
import numpy as np
import rasterio

app = FastAPI(title="NDVI Bloom Detection API")

DATA_DIR = r"C:\Users\user\Documents\GitHub\Nasa_Space_Apps_challenge\output"
DAILY_CSV = os.path.join(DATA_DIR, "daily_mean_ndvi.csv")
MOSAIC_DIR = os.path.join(DATA_DIR, "daily_mosaics")

# ======= Utility =======
def load_daily_data():
    df = pd.read_csv(DAILY_CSV, parse_dates=["date"])
    return df

# ======= Endpoint 1: Get NDVI Bloom Map =======
@app.get("/bloom-map")
def get_bloom_map(date: str = Query(..., description="Date in YYYY-MM-DD")):
    """Return NDVI map for given date"""
    date_str = pd.to_datetime(date).strftime("%Y%m%d")
    tif_path = os.path.join(MOSAIC_DIR, f"{date_str}_ndvi_mosaic.tif")

    if not os.path.exists(tif_path):
        return JSONResponse({"error": f"No NDVI mosaic found for {date}"}, status_code=404)

    with rasterio.open(tif_path) as src:
        ndvi = src.read(1)
        mean_ndvi = float(np.nanmean(ndvi))

    return {
        "date": date,
        "mean_ndvi": mean_ndvi,
        "tif_path": tif_path
    }

# ======= Endpoint 2: NDVI Trend Over Time =======
@app.get("/bloom-trend")
def bloom_trend(region: str = Query("California", description="Region name")):
    """Return NDVI trend for the region (currently single region support)"""
    df = load_daily_data()
    return {
        "region": region,
        "dates": df["date"].dt.strftime("%Y-%m-%d").tolist(),
        "mean_ndvi": df["mean_ndvi"].round(4).tolist()
    }

# ======= Optional: Bloom Anomaly Detection =======
@app.get("/bloom-anomalies")
def detect_anomalies(threshold: float = 0.1):
    df = load_daily_data()
    df["change"] = df["mean_ndvi"].diff()
    df["is_anomaly"] = (df["change"].abs() > threshold)
    anomalies = df[df["is_anomaly"]]
    return anomalies.to_dict(orient="records")
