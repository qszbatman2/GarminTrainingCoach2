from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from garminconnect import Garmin
import datetime
import os
import logging
import hashlib

app = FastAPI(title="Garmin Data Scraper Microservice", version="0.1.1")
logger = logging.getLogger(__name__)

@app.get("/")
def root():
    return {"ok": True}

@app.get("/health")
def health():
    return {"status": "ok"}

@app.get("/version")
def version():
    # Render/Vercel may inject git metadata; expose it so we can confirm deployments.
    return {
        "service": "garmin-scraper",
        "version": "0.1.1",
        "render_git_commit": os.getenv("RENDER_GIT_COMMIT"),
        "render_service_id": os.getenv("RENDER_SERVICE_ID"),
    }


def _tokenstore_path(email: str) -> str:
    token_dir = os.path.join(os.path.dirname(__file__), ".tokens")
    os.makedirs(token_dir, exist_ok=True)
    token_key = hashlib.sha256(email.strip().lower().encode("utf-8")).hexdigest()
    return os.path.join(token_dir, f"{token_key}.json")

class SyncRequest(BaseModel):
    email: str
    password: str
    date: str  # Format: YYYY-MM-DD

@app.post("/api/garmin/sync")
def sync_garmin_data(req: SyncRequest):
    """
    Login to Garmin Connect and fetch all metrics and activities for a specific date.
    Returns raw json payload to be consumed and stored by Next.js BFF.
    """
    try:
        # Initialize and login
        client = Garmin(req.email, req.password)
        tokenstore_path = _tokenstore_path(req.email)
        client.login(tokenstore=tokenstore_path)
        
        date_obj = datetime.datetime.strptime(req.date, "%Y-%m-%d").date()
        date_iso = date_obj.isoformat()
        
        # Helper function to fetch data safely
        def safe_fetch(fetch_func, *args, **kwargs):
            try:
                return fetch_func(*args, **kwargs)
            except Exception as e:
                logger.warning(f"Failed to fetch data using {fetch_func.__name__}: {str(e)}")
                return None

        # Fetch comprehensive daily data safely
        stats = safe_fetch(client.get_stats, date_iso)  # Daily summary
        sleep = safe_fetch(client.get_sleep_data, date_iso)  # Sleep detail
        hrv = safe_fetch(client.get_hrv_data, date_iso)  # HRV detail
        body_battery = safe_fetch(client.get_body_battery, date_iso, date_iso)  # Body battery (range)
        body_composition = safe_fetch(getattr(client, "get_body_composition", lambda *_: None), date_iso, date_iso)
        blood_oxygen = safe_fetch(client.get_spo2_data, date_iso) # Blood oxygen
        training_status = safe_fetch(getattr(client, "get_training_status", lambda *_: None), date_iso)  # May not exist in some versions

        # Additional daily health + training metrics (best-effort)
        stress_data = safe_fetch(client.get_stress_data, date_iso)
        heart_rates = safe_fetch(client.get_heart_rates, date_iso)
        respiration = safe_fetch(client.get_respiration_data, date_iso)
        steps_data = safe_fetch(client.get_steps_data, date_iso)
        daily_steps = safe_fetch(client.get_daily_steps, date_iso, date_iso)
        intensity_minutes = safe_fetch(client.get_intensity_minutes_data, date_iso)
        floors = safe_fetch(client.get_floors, date_iso)
        max_metrics = safe_fetch(client.get_max_metrics, date_iso)
        training_readiness = safe_fetch(client.get_training_readiness, date_iso)
        morning_training_readiness = safe_fetch(client.get_morning_training_readiness, date_iso)
        endurance_score = safe_fetch(client.get_endurance_score, date_iso, date_iso)
        hill_score = safe_fetch(client.get_hill_score, date_iso, date_iso)
        running_tolerance = safe_fetch(client.get_running_tolerance, date_iso, date_iso)
        
        # Fetch activities for the day safely
        activities = safe_fetch(client.get_activities_by_date, date_iso, date_iso)
        if activities is None:
            activities = []

        # Enrich each activity with details (best-effort). Usually there are only a few per day.
        enriched = []
        for act in activities:
            try:
                activity_id = str(act.get("activityId"))
            except Exception:
                activity_id = ""

            if activity_id:
                act["details"] = safe_fetch(client.get_activity_details, activity_id)
                act["splits"] = safe_fetch(client.get_activity_splits, activity_id)
                act["split_summaries"] = safe_fetch(client.get_activity_split_summaries, activity_id)
                act["hr_in_timezones"] = safe_fetch(client.get_activity_hr_in_timezones, activity_id)

            enriched.append(act)
        
        return {
            "status": "success",
            "date": req.date,
            "data": {
                "daily_metrics": {
                    "stats": stats,
                    "sleep": sleep,
                    "hrv": hrv,
                    "body_battery": body_battery,
                    "body_composition": body_composition,
                    "blood_oxygen": blood_oxygen,
                    "training_status": training_status,
                    "stress": stress_data,
                    "heart_rates": heart_rates,
                    "respiration": respiration,
                    "steps": steps_data,
                    "daily_steps": daily_steps,
                    "intensity_minutes": intensity_minutes,
                    "floors": floors,
                    "max_metrics": max_metrics,
                    "training_readiness": training_readiness,
                    "morning_training_readiness": morning_training_readiness,
                    "endurance_score": endurance_score,
                    "hill_score": hill_score,
                    "running_tolerance": running_tolerance,
                },
                "activities": enriched
            }
        }
        
    except Exception as e:
        logger.error(f"Failed to fetch garmin data: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
