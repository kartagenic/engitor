# WellMech

Engineering web application for oil well mechanics. Implements the Johancsik (1984) model to calculate axial loads and friction during tripping and packer operations.

## Tech Stack

- **Backend:** Python 3.12 + Flask
- **Data Processing:** pandas, numpy, openpyxl
- **Visualization:** matplotlib (Agg backend for server-side rendering)
- **PDF Reports:** reportlab
- **Frontend:** Vanilla HTML/CSS/JavaScript with Chart.js

## Project Structure

- `app.py` — Main Flask app: all routes, Johancsik calculation logic, PDF/Excel export
- `templates/index.html` — Single-page UI
- `static/css/style.css` — Dark-themed UI styles
- `static/js/app.js` — Frontend logic, API calls, dynamic table management
- `requirements.txt` — Python dependencies

## Running the App

```bash
python app.py
```

Runs on `http://0.0.0.0:5000`

## Key Features

- Upload well trajectory (inclinometry) data via CSV or Excel
- Define bottom-hole assembly (BHA) components
- Calculate reachability (downward loads), hook loads (upward), and packer stress
- Export detailed PDF and Excel reports with visualizations

## API Endpoints

- `POST /api/survey/upload` — Process well trajectory files
- `POST /api/calculate/reachability` — Downward load calculations
- `POST /api/calculate/hookload` — Upward load calculations
- `POST /api/calculate/packer` — Packer stress analysis
- `POST /api/export/pdf` — Generate PDF report
- `POST /api/export/excel` — Generate Excel report

## Deployment

Configured for autoscale deployment using gunicorn:
```
gunicorn --bind=0.0.0.0:5000 --reuse-port app:app
```
