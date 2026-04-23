"""
lgbm_forecast.py
----------------
Trains a LightGBM gradient-boosting model on the real Wadi Saqra Google Maps
corridor data (typical_wadi_saqra.ndjson) and produces:

    frontend/sandbox_data/forecast_lgbm.json

That JSON is loaded by wadi_saqra_data.js to power real AI-based forecasts
on the dashboard.

Features used
  - local_hour  (cyclic: sin/cos)
  - corridor    (one-hot: N/S/E/W)
  - lag_1       (congestion_ratio 1 step ago = 30 min)
  - lag_2       (congestion_ratio 2 steps ago = 1 hr)
  - rolling_3   (mean of last 3 steps)
  - bearing_deg (direction of approach)
  - distance_m  (corridor length proxy)

Target: congestion_ratio at t+1 (≈15 min ahead), t+2 (30 min), t+4 (1 hr)

Run:
    python3.11 tools/lgbm_forecast.py
"""

import json, math, pathlib, sys
import numpy as np
import pandas as pd
import lightgbm as lgb
from sklearn.model_selection import TimeSeriesSplit
from sklearn.metrics import mean_absolute_error

# ── Paths ─────────────────────────────────────────────────────────────────────
ROOT     = pathlib.Path(__file__).parent.parent
NDJSON   = ROOT / "typical_wadi_saqra.ndjson"
if not NDJSON.exists():
    # also try the copy in frontend/sandbox_data
    NDJSON = ROOT / "frontend" / "sandbox_data" / "typical_wadi_saqra.ndjson"
OUT_JSON = ROOT / "frontend" / "sandbox_data" / "forecast_lgbm.json"

# ── Load data ─────────────────────────────────────────────────────────────────
rows = []
with open(NDJSON) as f:
    for line in f:
        line = line.strip()
        if not line:
            continue
        obj = json.loads(line)
        if obj.get("ok") is True and "congestion_ratio" in obj:
            rows.append(obj)

df = pd.DataFrame(rows)
df = df.sort_values(["corridor", "local_hour"]).reset_index(drop=True)

# ── Feature engineering ───────────────────────────────────────────────────────
# Cyclic time features
df["hour_sin"] = np.sin(2 * math.pi * df["local_hour"] / 24)
df["hour_cos"] = np.cos(2 * math.pi * df["local_hour"] / 24)

# One-hot encode corridor
for c in ["N", "S", "E", "W"]:
    df[f"cor_{c}"] = (df["corridor"] == c).astype(int)

# Lag features per corridor
df = df.sort_values(["corridor", "local_hour"]).reset_index(drop=True)
df["lag_1"]     = df.groupby("corridor")["congestion_ratio"].shift(1)
df["lag_2"]     = df.groupby("corridor")["congestion_ratio"].shift(2)
df["lag_4"]     = df.groupby("corridor")["congestion_ratio"].shift(4)
df["rolling_3"] = df.groupby("corridor")["congestion_ratio"].transform(
    lambda x: x.shift(1).rolling(3, min_periods=1).mean())

# Fill NaN lags with the global mean
df = df.fillna(df["congestion_ratio"].mean())

FEATURES = [
    "local_hour", "hour_sin", "hour_cos",
    "cor_N", "cor_S", "cor_E", "cor_W",
    "lag_1", "lag_2", "lag_4", "rolling_3",
    "bearing_deg", "distance_m"
]
TARGET = "congestion_ratio"

# Build horizon targets
df["target_15m"] = df.groupby("corridor")[TARGET].shift(-1)   # +1 step  (30 min)
df["target_30m"] = df.groupby("corridor")[TARGET].shift(-2)   # +2 steps
df["target_1h"]  = df.groupby("corridor")[TARGET].shift(-4)   # +4 steps

df = df.dropna(subset=["target_15m", "target_30m", "target_1h"])

X = df[FEATURES]

LGB_PARAMS = dict(
    objective="regression_l1",
    metric="mae",
    n_estimators=400,
    learning_rate=0.05,
    num_leaves=31,
    min_child_samples=3,
    subsample=0.8,
    colsample_bytree=0.8,
    verbose=-1,
    n_jobs=2
)

# ── Train one model per horizon ───────────────────────────────────────────────
tscv = TimeSeriesSplit(n_splits=3)
models = {}
scores = {}

for horizon, col in [("15m", "target_15m"), ("30m", "target_30m"), ("1h", "target_1h")]:
    y = df[col]
    mae_list = []
    for train_idx, val_idx in tscv.split(X):
        m = lgb.LGBMRegressor(**LGB_PARAMS)
        m.fit(X.iloc[train_idx], y.iloc[train_idx],
              eval_set=[(X.iloc[val_idx], y.iloc[val_idx])],
              callbacks=[lgb.early_stopping(30, verbose=False),
                         lgb.log_evaluation(-1)])
        pred = m.predict(X.iloc[val_idx])
        mae_list.append(mean_absolute_error(y.iloc[val_idx], pred))

    # Final model on all data
    final = lgb.LGBMRegressor(**LGB_PARAMS)
    final.fit(X, y, callbacks=[lgb.log_evaluation(-1)])
    models[horizon] = final
    scores[horizon] = float(np.mean(mae_list))
    print(f"  Horizon {horizon:>3s}  CV MAE = {scores[horizon]:.4f}")

# ── Predict for every (hour, corridor) slot ───────────────────────────────────
X_full = df[FEATURES].copy()
results = {}

for hor, m in models.items():
    preds = m.predict(X_full)
    df[f"pred_{hor}"] = np.clip(preds, 0.6, 1.6)

# Restructure for the frontend: { "8.0": { "N": {"15m":…,"30m":…,"1h":…, "speed_kmh":…} } }
for _, row in df.iterrows():
    h = str(row["local_hour"])
    c = row["corridor"]
    if h not in results:
        results[h] = {}
    results[h][c] = {
        "congestion_ratio": round(float(row["congestion_ratio"]), 4),
        "speed_kmh":        round(float(row["speed_kmh"]), 2),
        "pred_15m":         round(float(row["pred_15m"]), 4),
        "pred_30m":         round(float(row["pred_30m"]), 4),
        "pred_1h":          round(float(row["pred_1h"]),  4),
    }

# Also include overall model metadata
output = {
    "model":      "LightGBM gradient-boosting",
    "trained_on": "Wadi Saqra · Google Maps Routes API · typical Sunday",
    "features":   FEATURES,
    "cv_mae":     {k: round(v, 5) for k, v in scores.items()},
    "data":       results
}

OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
with open(OUT_JSON, "w") as f:
    json.dump(output, f, separators=(",", ":"))

print(f"\n✓ Saved {OUT_JSON}")
print(f"  Slots: {len(results)}  Corridors: N/S/E/W  Horizons: 15m / 30m / 1h")
print(f"  Model CV MAE: { {k: round(v,5) for k,v in scores.items()} }")
