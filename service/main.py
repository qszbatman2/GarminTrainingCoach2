from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from garminconnect import Garmin
import datetime
import os
import logging
import hashlib

app = FastAPI(title="Garmin Data Scraper Microservice")
logger = logging.getLogger(__name__)


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
        body_battery = safe_fetch(client.get_body_battery, date_iso) # Body battery/Stress
        blood_oxygen = safe_fetch(client.get_spo2_data, date_iso) # Blood oxygen
        training_status = safe_fetch(client.get_training_status, date_iso) # Training status
        
        # Fetch activities for the day safely
        activities = safe_fetch(client.get_activities_by_date, date_iso, date_iso)
        if activities is None:
            activities = []
        
        return {
            "status": "success",
            "date": req.date,
            "data": {
                "daily_metrics": {
                    "stats": stats,
                    "sleep": sleep,
                    "hrv": hrv,
                    "body_battery": body_battery,
                    "blood_oxygen": blood_oxygen,
                    "training_status": training_status
                },
                "activities": activities
            }
        }
        
    except Exception as e:
        logger.error(f"Failed to fetch garmin data: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
